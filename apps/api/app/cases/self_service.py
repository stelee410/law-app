from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.cases.catalog import get_assessment_copy, get_case_type_label, normalize_case_type
from app.schemas import CaseType, LawCase, LegalDocumentType

# 《人工智能生成合成内容标识办法》显式标识：须同时含“人工智能/AI”与“生成”要素。
AI_GENERATED_NOTICE = "本文书由人工智能（AI）生成，供参考使用；正式署名或对外发送前建议由执业律师审核。"


@dataclass
class SelfServicePayload:
  documentType: LegalDocumentType
  title: str
  body: str
  fields: dict[str, Any]
  resultLabel: str
  nextStep: str
  statusText: str
  taskSummary: str
  messageTitle: str
  messageBody: str


@dataclass(frozen=True)
class _SelfServiceTemplate:
  document_type: LegalDocumentType
  title_pattern: str
  result_label: str
  next_step: str
  review_title: str | None
  review_description: str
  document_stage_title: str | None
  document_stage_description: str
  next_active_stage_key: str | None
  next_active_stage_description: str | None
  todo_stage_notes: tuple[tuple[str, str], ...] = ()


_TEMPLATES: dict[CaseType, _SelfServiceTemplate] = {
  "debt_collection": _SelfServiceTemplate(
    document_type="lawyer_letter",
    title_pattern="致{subject}的催收函（AI草稿）",
    result_label="催告模板与自助追偿清单",
    next_step="复制或下载催告模板，自行发送后记录送达凭证与对方回应",
    review_title="AI自助处理",
    review_description="AI已生成催告模板与自助追偿清单",
    document_stage_title="AI自助处理包",
    document_stage_description="复制或下载模板，自行发送后记录送达凭证与对方回应",
    next_active_stage_key="letter",
    next_active_stage_description="待自行发送或使用模板，并记录处理结果",
  ),
  "lawyer_letter": _SelfServiceTemplate(
    document_type="lawyer_letter",
    title_pattern="致{subject}的函件草稿（AI生成）",
    result_label="函件草稿与使用清单",
    next_step="复制或下载函件草稿；如需正式律师函，请升级人工复核",
    review_title=None,
    review_description="AI已生成函件草稿与使用清单",
    document_stage_title="AI自助处理包",
    document_stage_description="AI已生成函件草稿；正式律师函需律师复核或律所出具",
    next_active_stage_key="letter",
    next_active_stage_description="待自行使用草稿、记录结果或升级人工复核",
  ),
  "labor_dispute": _SelfServiceTemplate(
    document_type="arbitration_material",
    title_pattern="劳动仲裁申请建议书（AI生成）",
    result_label="劳动争议自助材料包",
    next_step="整理劳动关系证据、沟通记录和仲裁准备清单，并记录处理结果",
    review_title=None,
    review_description="AI已生成劳动争议自助材料包",
    document_stage_title="AI自助处理包",
    document_stage_description="AI已生成劳动争议材料清单、沟通模板和仲裁准备建议",
    next_active_stage_key="letter",
    next_active_stage_description="待自行沟通、准备仲裁材料或升级人工复核",
  ),
  "rental_dispute": _SelfServiceTemplate(
    document_type="lawyer_letter",
    title_pattern="租赁纠纷协商函（AI草稿）",
    result_label="租赁纠纷自助处理包",
    next_step="复制或下载协商函，记录对方回应、押金/租金处理结果",
    review_title=None,
    review_description="AI已生成租赁纠纷协商函与处理清单",
    document_stage_title="AI自助处理包",
    document_stage_description="AI已生成协商函草稿、证据清单和回应记录指引",
    next_active_stage_key="letter",
    next_active_stage_description="待自行沟通、记录回应或升级人工复核",
  ),
  "contract_review": _SelfServiceTemplate(
    document_type="contract_review_opinion",
    title_pattern="合同审查意见（AI生成）",
    result_label="合同风险清单与修改建议",
    next_step="核对风险条款，记录是否采纳修改建议或需要人工复核",
    review_title=None,
    review_description="AI已生成合同风险清单与修改建议",
    document_stage_title="AI自助处理包",
    document_stage_description="AI已生成风险条款清单、修改建议和谈判要点",
    next_active_stage_key="letter",
    next_active_stage_description="待确认采纳结果、对方反馈或升级律师精审",
    todo_stage_notes=(("negotiation", "如需可升级律师精审关键条款"),),
  ),
}


def build_self_service_payload(law_case: LawCase) -> SelfServicePayload:
  case_type = normalize_case_type(law_case.caseType)
  template = _TEMPLATES[case_type]
  subject = law_case.counterpartyName or law_case.debtorName
  title = template.title_pattern.format(subject=subject)
  return SelfServicePayload(
    documentType=template.document_type,
    title=title,
    body=_build_body(law_case, template, title),
    fields={
      "source": "ai_self_service",
      "caseType": case_type,
      "generatedAt": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
    },
    resultLabel=template.result_label,
    nextStep=template.next_step,
    statusText=f"AI自助处理完成：已生成{template.result_label}",
    taskSummary=f"已生成《{title}》；下一步：{template.next_step}。",
    messageTitle="AI自助处理包已生成",
    messageBody=f"AI已生成《{title}》和自助处理清单；请复制或下载模板，并在案件详情记录自行处理结果。",
  )


def apply_self_service_outcome(law_case: LawCase, payload: SelfServicePayload, completed_at: str) -> None:
  template = _TEMPLATES[normalize_case_type(law_case.caseType)]
  law_case.status = payload.statusText
  for stage in law_case.stages:
    if stage.key == "review":
      if template.review_title is not None:
        stage.title = template.review_title
      stage.description = template.review_description
      stage.status = "done"
      stage.at = completed_at
    elif stage.key == template.next_active_stage_key:
      if template.document_stage_title is not None:
        stage.title = template.document_stage_title
      stage.description = template.document_stage_description
      stage.status = "active"
      stage.at = None
  for stage_key, note in template.todo_stage_notes:
    stage = next((item for item in law_case.stages if item.key == stage_key), None)
    if stage is not None and stage.status == "todo":
      stage.description = note


def ensure_ai_notice(body: str) -> str:
  if AI_GENERATED_NOTICE in body:
    return body
  return f"{body.rstrip()}\n\n{AI_GENERATED_NOTICE}"


def _build_body(law_case: LawCase, template: _SelfServiceTemplate, title: str) -> str:
  copy = get_assessment_copy(law_case.caseType)
  subject = law_case.counterpartyName or law_case.debtorName
  missing = _missing_required_evidence(law_case)
  assessment = law_case.assessment
  route = assessment.suggestedRoute if assessment is not None else "补充材料后重新评估"
  estimated = assessment.estimatedDays if assessment is not None else "视材料补充情况而定"
  dispute = law_case.claimSummary or law_case.dispute
  lines = [
    f"《{title}》",
    "",
    "一、案件信息",
    f"- 业务类型：{get_case_type_label(law_case.caseType)}",
    f"- {copy.subject_label}：{subject}",
    f"- {copy.amount_label}：￥{law_case.amount:,.0f}",
    f"- 争议概述：{dispute}",
    "",
    "二、AI 处理建议",
    f"- 建议路径：{route}",
    f"- 预计周期：{estimated}",
    f"- 证据缺口：{'、'.join(missing) if missing else '暂无缺失的必传材料'}",
    f"- 时效提示：{copy.timing_finding}",
    "",
    "三、下一步行动",
    f"1. {template.next_step}",
    "2. 补充完善关键证据，保留沟通与履行记录",
    "3. 如对方无回应或争议升级，可升级律师服务跟进",
    "",
    f"重要提示：{copy.boundary_notice}",
    AI_GENERATED_NOTICE,
  ]
  return "\n".join(lines)


def _missing_required_evidence(law_case: LawCase) -> list[str]:
  return [
    category.name
    for category in law_case.evidence
    if category.required and not category.files and category.status != "recognized"
  ]
