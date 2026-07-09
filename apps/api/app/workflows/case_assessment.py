import logging
from datetime import UTC, datetime
from typing import TypedDict

from app.cases.catalog import get_assessment_copy, get_case_type_label
from app.core.config import Settings
from app.schemas import AssessmentResult, LawCase, ServicePlan
from app.workflows import llm as llm_workflow

logger = logging.getLogger("uvicorn.error")

try:
  from langgraph.graph import END, START, StateGraph
except ImportError:
  END = START = StateGraph = None


SERVICE_PLANS: list[ServicePlan] = [
  ServicePlan(
    id="self-service",
    name="AI自助版",
    subtitle="平台提供 AI 模板和操作指引，用户自行处理",
    price=399,
    fee="一次性服务费",
    features=["AI整理材料与风险点", "复制或下载模板，自行发送/使用", "记录凭证、回应和回款结果"],
  ),
  ServicePlan(
    id="lawyer-review",
    name="律师复核版",
    subtitle="平衡效率与专业支持",
    price=1499,
    fee="服务费 + 成功费 5%",
    recommended=True,
    features=["平台律师复核材料", "正式函件或专业意见支持", "协商调解支持", "材料准备支持"],
  ),
  ServicePlan(
    id="full-service",
    name="诉前全程跟进版",
    subtitle="律师跟进发送凭证、对方回应和下一步诉前动作",
    price=5999,
    fee="服务费 + 成功费 10%",
    features=["律师签章定稿文书", "客户自行发送后上传凭证", "律师确认凭证并跟进回应", "无回应或拒绝时准备诉讼/仲裁材料"],
  ),
]


class CaseAssessmentState(TypedDict, total=False):
  law_case: LawCase
  uploaded_files: int
  required_categories: int
  covered_required: int
  evidence_summary: str
  legal_facts: list[str]
  risk_score: int
  recommended_plan_id: str
  assessment: AssessmentResult
  steps: list[str]


AssessmentState = CaseAssessmentState


def assess_case(law_case: LawCase, settings: Settings | None = None) -> AssessmentResult:
  state = _initial_state(law_case)
  if StateGraph is None:
    result = _run_fallback(state)
    return _assessment_with_optional_llm(settings, law_case, result)

  workflow = StateGraph(CaseAssessmentState)
  workflow.add_node("evidence_summary", evidence_summary)
  workflow.add_node("legal_fact_extraction", legal_fact_extraction)
  workflow.add_node("risk_assessment", risk_assessment)
  workflow.add_node("plan_recommendation", plan_recommendation)
  workflow.add_node("report_generation", report_generation)
  workflow.add_edge(START, "evidence_summary")
  workflow.add_edge("evidence_summary", "legal_fact_extraction")
  workflow.add_edge("legal_fact_extraction", "risk_assessment")
  workflow.add_edge("risk_assessment", "plan_recommendation")
  workflow.add_edge("plan_recommendation", "report_generation")
  workflow.add_edge("report_generation", END)
  result = workflow.compile().invoke(state)
  return _assessment_with_optional_llm(settings, law_case, result)


def evidence_summary(state: AssessmentState) -> AssessmentState:
  law_case = state["law_case"]
  uploaded_files = sum(len(category.files) for category in law_case.evidence)
  required = [category for category in law_case.evidence if category.required]
  covered_required = sum(
    1
    for category in required
    if category.files or category.status == "recognized"
  )
  steps = [*state.get("steps", []), "evidence_summary"]
  return {
    **state,
    "uploaded_files": uploaded_files,
    "required_categories": len(required),
    "covered_required": covered_required,
    "evidence_summary": f"已上传 {uploaded_files} 份材料，覆盖 {covered_required}/{len(required)} 个关键材料类型。",
    "steps": steps,
  }


def legal_fact_extraction(state: AssessmentState) -> AssessmentState:
  law_case = state["law_case"]
  copy = get_assessment_copy(law_case.caseType)
  facts = [
    f"业务类型：{get_case_type_label(law_case.caseType)}",
    f"{copy.subject_label}：{law_case.counterpartyName or law_case.debtorName}",
    f"{copy.amount_label}：￥{law_case.amount:,.0f}",
    f"地区：{law_case.region or '未填写'}",
    f"争议/审查时间：{law_case.incidentDate or law_case.contractDate}",
    f"诉求类型：{law_case.claimType or '未填写'}",
  ]
  return {
    **state,
    "legal_facts": facts,
    "steps": [*state.get("steps", []), "legal_fact_extraction"],
  }


def risk_assessment(state: AssessmentState) -> AssessmentState:
  law_case = state["law_case"]
  required_categories = state.get("required_categories", 0)
  covered_required = state.get("covered_required", 0)
  coverage = covered_required / required_categories if required_categories else 1
  due_bonus = 12 if law_case.dueStatus == "已到期" else 6 if law_case.dueStatus == "部分到期" else 0
  type_bonus = 6 if law_case.caseType in {"lawyer_letter", "contract_review"} else 0
  amount_risk = -8 if law_case.amount > 200000 else -3 if law_case.amount > 100000 else 4
  uploaded_bonus = min(state.get("uploaded_files", 0), 10) * 1.2
  score = round(48 + coverage * 24 + uploaded_bonus + due_bonus + type_bonus + amount_risk)
  bounded_score = max(42, min(92, score))
  return {
    **state,
    "risk_score": bounded_score,
    "steps": [*state.get("steps", []), "risk_assessment"],
  }


def plan_recommendation(state: AssessmentState) -> AssessmentState:
  score = state.get("risk_score", 0)
  if score >= 82:
    plan_id = "full-service"
  elif score >= 62:
    plan_id = "lawyer-review"
  else:
    plan_id = "self-service"
  return {
    **state,
    "recommended_plan_id": plan_id,
    "steps": [*state.get("steps", []), "plan_recommendation"],
  }


def report_generation(state: AssessmentState) -> AssessmentState:
  law_case = state["law_case"]
  copy = get_assessment_copy(law_case.caseType)
  score = state.get("risk_score", 42)
  confidence = "高" if score >= 82 else "较高" if score >= 68 else "中等"
  estimated_recovery = round(law_case.amount * (1 if score >= 75 else 0.82 if score >= 62 else 0.65))
  findings = [
    f"{copy.amount_label}：￥{law_case.amount:,.0f}",
    f"已覆盖关键材料类型：{state.get('covered_required', 0)}/{state.get('required_categories', 0)}",
    f"当前已上传材料：{state.get('uploaded_files', 0)} 份",
    copy.timing_finding,
    copy.boundary_notice,
  ]
  assessment = AssessmentResult(
    winRate=score,
    confidence=confidence,
    summary=copy.high_summary if score >= 70 else copy.mid_summary,
    suggestedRoute=copy.high_route if score >= 70 else copy.mid_route,
    estimatedDays=copy.estimated_days_high if score >= 70 else copy.estimated_days_mid,
    estimatedRecovery=estimated_recovery,
    findings=findings,
    plans=SERVICE_PLANS,
    generatedAt=_now_iso(),
  )
  return {
    **state,
    "assessment": assessment,
    "steps": [*state.get("steps", []), "report_generation"],
  }


def _run_fallback(state: AssessmentState) -> AssessmentState:
  for node in (
    evidence_summary,
    legal_fact_extraction,
    risk_assessment,
    plan_recommendation,
    report_generation,
  ):
    state = node(state)
  return state


def _initial_state(law_case: LawCase) -> AssessmentState:
  return {"law_case": law_case, "steps": []}


def _assessment_with_optional_llm(
  settings: Settings | None,
  law_case: LawCase,
  state: AssessmentState,
) -> AssessmentResult:
  if settings is not None:
    try:
      llm_assessment = llm_workflow.generate_assessment_with_llm(settings, law_case, state)
    except Exception as exc:
      logger.info(
        "assessment.llm call_failed case_id=%s case_type=%s reason=unexpected_%s",
        law_case.id,
        law_case.caseType,
        exc.__class__.__name__,
      )
      llm_assessment = None
    if llm_assessment is not None:
      logger.info(
        "assessment.result source=llm case_id=%s case_type=%s win_rate=%s",
        law_case.id,
        law_case.caseType,
        llm_assessment.winRate,
      )
      return llm_assessment
  fallback = state["assessment"]
  logger.info(
    "assessment.result source=deterministic case_id=%s case_type=%s win_rate=%s",
    law_case.id,
    law_case.caseType,
    fallback.winRate,
  )
  return fallback


def _now_iso() -> str:
  return datetime.now(UTC).isoformat().replace("+00:00", "Z")
