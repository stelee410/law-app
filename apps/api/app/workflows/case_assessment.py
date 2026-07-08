from datetime import UTC, datetime
from typing import TypedDict

from app.schemas import AssessmentResult, LawCase, ServicePlan

try:
  from langgraph.graph import END, START, StateGraph
except ImportError:
  END = START = StateGraph = None


SERVICE_PLANS: list[ServicePlan] = [
  ServicePlan(
    id="self-service",
    name="AI自助版",
    subtitle="适合预算有限 / 自主操作",
    price=399,
    fee="一次性服务费",
    features=["AI生成法律文书", "发送律师函指引", "进度跟踪提醒"],
  ),
  ServicePlan(
    id="lawyer-review",
    name="律师复核版",
    subtitle="平衡效率与专业",
    price=1499,
    fee="服务费 + 成功费 5%",
    recommended=True,
    features=["平台律师复核文书", "发送律师函 + 谈判指导", "协商谈判支持", "诉讼材料准备支持"],
  ),
  ServicePlan(
    id="full-service",
    name="全程代办版",
    subtitle="省心省力 / 全程托管",
    price=5999,
    fee="服务费 + 成功费 10%",
    features=["律师全程代理", "协商谈判 + 立案", "出庭应诉（如需）", "执行跟进"],
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


def assess_case(law_case: LawCase) -> AssessmentResult:
  state = _initial_state(law_case)
  if StateGraph is None:
    return _run_fallback(state)["assessment"]

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
  return result["assessment"]


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
    "evidence_summary": f"已上传 {uploaded_files} 份证据，覆盖 {covered_required}/{len(required)} 个关键证据类型。",
    "steps": steps,
  }


def legal_fact_extraction(state: AssessmentState) -> AssessmentState:
  law_case = state["law_case"]
  facts = [
    f"债务人：{law_case.debtorName}",
    f"争议金额：￥{law_case.amount:,.0f}",
    f"合同日期：{law_case.contractDate}",
    f"到期状态：{law_case.dueStatus}",
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
  amount_risk = -8 if law_case.amount > 200000 else -3 if law_case.amount > 100000 else 4
  uploaded_bonus = min(state.get("uploaded_files", 0), 10) * 1.2
  score = round(48 + coverage * 24 + uploaded_bonus + due_bonus + amount_risk)
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
  score = state.get("risk_score", 42)
  confidence = "高" if score >= 82 else "较高" if score >= 68 else "中等"
  estimated_recovery = round(law_case.amount * (1 if score >= 75 else 0.82 if score >= 62 else 0.65))
  findings = [
    f"识别欠款金额：￥{law_case.amount:,.0f}",
    f"已覆盖关键证据类型：{state.get('covered_required', 0)}/{state.get('required_categories', 0)}",
    f"当前已上传证据：{state.get('uploaded_files', 0)} 份",
    "款项已到期，具备催告与追偿基础" if law_case.dueStatus == "已到期" else "建议进一步确认款项到期节点",
  ]
  assessment = AssessmentResult(
    winRate=score,
    confidence=confidence,
    summary="证据较充分，对方违约事实清晰，可行性较高" if score >= 70 else "基础证据已建立，建议继续补充交付与催款记录",
    suggestedRoute="先发律师函 → 协商调解 → 立案" if score >= 70 else "补充证据 → 律师复核 → 发函催告",
    estimatedDays="约 30-45 天" if score >= 70 else "约 45-60 天",
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


def _now_iso() -> str:
  return datetime.now(UTC).isoformat().replace("+00:00", "Z")
