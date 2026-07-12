from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.cases.catalog import get_assessment_copy, get_case_type_label, normalize_case_type
from app.schemas import CaseType, LawCase, LegalDocumentType

# 《人工智能生成合成内容标识办法》显式标识：须同时含“人工智能/AI”与“生成”要素。
AI_GENERATED_NOTICE = "本文书由人工智能（AI）生成，供参考使用；正式法律文书或律师服务需升级人工服务。"
SELF_SERVICE_BOUNDARY_NOTICE = "399 自助版不代发、不代理、不出具正式律师函；如需正式律师函、调解或代办服务，请升级人工服务。"
DEBT_COLLECTION_TITLE = "付款催告函（AI 自助模板）"
LEGAL_KNOWLEDGE_VERSION = "cn-law-self-service-2026-07-09"
CIVIL_CODE_SOURCE_URL = "https://www.moj.gov.cn/pub/sfbgw/zwgkztzl/2025nianzhuanti/2025mfdxcy/2025mfdxcy_mfdql/202505/t20250507_518708.html"
LABOR_ARBITRATION_SOURCE_URL = "https://www.gjxfj.gov.cn/gjxfj/xxgk/fgwj/flfg/webinfo/2016/03/1460585589964384.htm"
LABOR_CONTRACT_SOURCE_URL = "https://www.gjxfj.gov.cn/gjxfj/xxgk/fgwj/flfg/webinfo/2016/03/1460585589931971.htm"
LAWYER_LAW_SOURCE_URL = "https://gongbao.court.gov.cn/Details/9d97a441edfcd9f72406ce9b758751.html"


@dataclass(frozen=True)
class _LegalReference:
  law: str
  article: str
  note: str
  source_url: str
  effective_date: str
  article_text_key: str


@dataclass(frozen=True)
class _CaseLegalKnowledge:
  references: tuple[_LegalReference, ...]
  scope_note: str
  evidence_note: str
  action_note: str


LEGAL_KNOWLEDGE: dict[CaseType, _CaseLegalKnowledge] = {
  "debt_collection": _CaseLegalKnowledge(
    references=(
      _LegalReference("《中华人民共和国民法典》", "第五百七十七条", "合同义务未按约履行时，可主张继续履行、补救措施或赔偿损失等违约责任。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "不履行合同义务或者履行合同义务不符合约定"),
      _LegalReference("《中华人民共和国民法典》", "第五百七十九条", "未支付价款、报酬、租金、利息或其他金钱债务时，可请求支付。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "未支付价款、报酬、租金、利息"),
      _LegalReference("《中华人民共和国民法典》", "第五百八十三条", "违约处理后仍有其他损失的，可结合证据主张赔偿。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "履行义务或者采取补救措施后"),
    ),
    scope_note="以下为通用合同/金钱债务条款，具体适用以事实和证据为准；借款合同专门条款需在确认存在借款法律关系后再适用。",
    evidence_note="需重点保留合同/协议、对账或结算记录、交付记录、付款记录、催告记录和对方确认欠款的沟通内容。",
    action_note="本模板用于自行催告和留痕，不等同于正式律师函或律师代理意见。",
  ),
  "lawyer_letter": _CaseLegalKnowledge(
    references=(
      _LegalReference("《中华人民共和国律师法》", "第二十八条", "律师可以接受自然人、法人或者其他组织委托，担任法律顾问，提供法律咨询、代写法律文书等法律服务。", LAWYER_LAW_SOURCE_URL, "现行有效", "接受自然人、法人或者其他组织的委托"),
      _LegalReference("《中华人民共和国民法典》", "第一百七十九条", "承担民事责任的方式包括停止侵害、排除妨碍、返还财产、赔偿损失、支付违约金等。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "承担民事责任的方式"),
      _LegalReference("《中华人民共和国民法典》", "第五百七十七条", "如争议基础为合同关系，可结合事实主张违约责任。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "不履行合同义务或者履行合同义务不符合约定"),
    ),
    scope_note="399 自助版仅生成普通函件草稿和事实诉求清单，不以律师或律所名义出具正式律师函。",
    evidence_note="需核对发函主体、收函主体、联系方式、事实依据、诉求金额/事项、履行期限和已沟通记录。",
    action_note="如需要律师署名、律所函头、代发或法律策略判断，应升级人工律师服务。",
  ),
  "labor_dispute": _CaseLegalKnowledge(
    references=(
      _LegalReference("《中华人民共和国劳动争议调解仲裁法》", "第二条", "劳动关系确认、劳动合同履行、解除终止、劳动报酬、工伤医疗费、经济补偿或赔偿金等争议适用劳动争议处理规则。", LABOR_ARBITRATION_SOURCE_URL, "2008-05-01", "中华人民共和国境内的用人单位与劳动者发生的下列劳动争议"),
      _LegalReference("《中华人民共和国劳动争议调解仲裁法》", "第六条", "发生劳动争议，当事人对自己提出的主张有责任提供证据。", LABOR_ARBITRATION_SOURCE_URL, "2008-05-01", "当事人对自己提出的主张，有责任提供证据"),
      _LegalReference("《中华人民共和国劳动争议调解仲裁法》", "第二十七条", "劳动争议申请仲裁的时效期间通常为一年，需结合知道或应当知道权利被侵害之日核对。", LABOR_ARBITRATION_SOURCE_URL, "2008-05-01", "劳动争议申请仲裁的时效期间为一年"),
      _LegalReference("《中华人民共和国劳动合同法》", "第三十条", "用人单位应当按照劳动合同约定和国家规定，及时足额支付劳动报酬。", LABOR_CONTRACT_SOURCE_URL, "2008-01-01", "及时足额支付劳动报酬"),
    ),
    scope_note="本模板用于整理劳动争议事实、证据和仲裁准备事项，不替代劳动仲裁申请书的人工复核。",
    evidence_note="需重点保留劳动合同、工资流水、考勤、社保记录、工作沟通、离职/解除通知和欠薪计算依据。",
    action_note="先核对仲裁时效、劳动关系证据和请求金额；材料不足或争议复杂时升级人工复核。",
  ),
  "rental_dispute": _CaseLegalKnowledge(
    references=(
      _LegalReference("《中华人民共和国民法典》", "第七百零三条", "租赁合同是出租人将租赁物交付承租人使用、收益，承租人支付租金的合同。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "出租人将租赁物交付承租人使用、收益"),
      _LegalReference("《中华人民共和国民法典》", "第七百二十一条", "承租人应当按照约定期限支付租金。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "承租人应当按照约定的期限支付租金"),
      _LegalReference("《中华人民共和国民法典》", "第七百二十二条", "承租人无正当理由未支付或迟延支付租金的，出租人可请求在合理期限内支付；逾期不支付的，出租人可解除合同。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "承租人无正当理由未支付或者迟延支付租金"),
      _LegalReference("《中华人民共和国民法典》", "第七百三十三条", "租赁期限届满，承租人应当返还租赁物，返还物应符合约定或使用后的状态。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "租赁期限届满，承租人应当返还租赁物"),
    ),
    scope_note="押金返还、房屋损坏和违约金通常需结合租赁合同、交接记录、付款凭证和房屋状态判断，不默认作单方结论。",
    evidence_note="需重点保留租赁合同、押金/租金付款凭证、交接记录、房屋照片视频、维修记录和协商沟通记录。",
    action_note="先用协商函明确返还/支付请求、依据和期限；对方拒绝或无回应时准备调解、诉讼或升级人工服务。",
  ),
  "contract_review": _CaseLegalKnowledge(
    references=(
      _LegalReference("《中华人民共和国民法典》", "第四百六十五条", "依法成立的合同受法律保护。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "依法成立的合同，受法律保护"),
      _LegalReference("《中华人民共和国民法典》", "第四百七十条", "合同内容一般包括当事人信息、标的、数量、质量、价款、履行期限地点方式、违约责任和争议解决等条款。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "合同的内容由当事人约定"),
      _LegalReference("《中华人民共和国民法典》", "第四百九十六条", "采用格式条款订立合同的，提供方应遵循公平原则，并采取合理方式提示与说明重大利害关系条款。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "格式条款是当事人为了重复使用而预先拟定"),
      _LegalReference("《中华人民共和国民法典》", "第五百零九条", "当事人应当按照约定全面履行自己的义务，并遵循诚信原则。", CIVIL_CODE_SOURCE_URL, "2021-01-01", "当事人应当按照约定全面履行自己的义务"),
    ),
    scope_note="AI 自助审查仅输出风险清单和修改建议，不对交易成败、最终签署或诉讼结果作保证。",
    evidence_note="需上传完整合同正文、附件、补充协议、交易背景、重点关注条款和历史谈判记录。",
    action_note="先核对主体、价款、履行、违约、解除、保密、知识产权和争议解决条款；重大交易应升级律师精审。",
  ),
}


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
  suggested_route: str
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
    title_pattern=DEBT_COLLECTION_TITLE,
    result_label="催告模板与自助追偿清单",
    next_step="复制或下载付款催告函模板，自行发送/使用后记录送达凭证与对方回应",
    suggested_route="自行催告 → 记录回应 → 准备材料或升级人工",
    review_title="AI自助处理",
    review_description="AI已整理案件信息、证据缺口并生成付款催告函自助模板",
    document_stage_title="AI自助处理包",
    document_stage_description="复制或下载模板，自行发送/使用后记录凭证与对方回应",
    next_active_stage_key="letter",
    next_active_stage_description="待自行发送/使用模板，并记录处理结果",
  ),
  "lawyer_letter": _SelfServiceTemplate(
    document_type="lawyer_letter",
    title_pattern="致{subject}的函件草稿（AI生成）",
    result_label="函件草稿与使用清单",
    next_step="复制或下载函件草稿；如需正式律师函，请升级人工复核",
    suggested_route="自行使用草稿 → 记录回应 → 升级人工复核",
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
    suggested_route="整理证据 → 自行沟通 → 准备仲裁材料或升级人工",
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
    suggested_route="自行协商 → 记录回应 → 准备材料或升级人工",
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
    suggested_route="AI初审 → 自行核对修改 → 需要时升级律师精审",
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
      "legalKnowledgeVersion": LEGAL_KNOWLEDGE_VERSION,
      "legalReferences": legal_reference_metadata(case_type),
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


def legal_reference_metadata(case_type: CaseType) -> list[dict[str, str]]:
  knowledge = LEGAL_KNOWLEDGE[normalize_case_type(case_type)]
  return [
    {
      "law": reference.law,
      "article": reference.article,
      "sourceUrl": reference.source_url,
      "effectiveDate": reference.effective_date,
      "articleTextKey": reference.article_text_key,
    }
    for reference in knowledge.references
  ]


def required_self_service_terms(case_type: CaseType) -> tuple[str, ...]:
  knowledge = LEGAL_KNOWLEDGE[normalize_case_type(case_type)]
  return (
    AI_GENERATED_NOTICE,
    SELF_SERVICE_BOUNDARY_NOTICE,
    *(
      f"{reference.law}{reference.article}"
      for reference in knowledge.references
    ),
  )


def forbidden_self_service_terms(case_type: CaseType) -> tuple[str, ...]:
  normalized_type = normalize_case_type(case_type)
  if normalized_type == "debt_collection":
    return ("第六百七十五条", "第六百七十六条", "正式律师函需律师复核确认")
  forbidden = ("付款催告函", "欠款追偿", "债务人")
  if normalized_type == "contract_review":
    return (*forbidden, "发送律师函")
  return forbidden


def validate_self_service_body(law_case: LawCase, body: str) -> bool:
  case_type = normalize_case_type(law_case.caseType)
  if "法律依据" not in body:
    return False
  if any(term not in body for term in required_self_service_terms(case_type)):
    return False
  if any(term in body for term in forbidden_self_service_terms(case_type)):
    return False
  if law_case.amount <= 0 and case_type in {"lawyer_letter", "contract_review"}:
    zero_amount_patterns = (
      r"[￥¥]\s*0(?:[.,]0+)?(?:\s*元)?",
      r"人民币\s*0(?:[.,]0+)?\s*元",
      r"(?:金额|标的)[^\n。]{0,12}(?:：|:|为)\s*0(?:[.,]0+)?\s*元?",
    )
    if any(re.search(pattern, body) for pattern in zero_amount_patterns):
      return False
  return True


def _build_body(law_case: LawCase, template: _SelfServiceTemplate, title: str) -> str:
  case_type = normalize_case_type(law_case.caseType)
  if case_type == "debt_collection":
    return _build_debt_collection_body(law_case, template, title)
  if case_type == "lawyer_letter":
    return _build_lawyer_letter_body(law_case, template, title)
  if case_type == "labor_dispute":
    return _build_labor_dispute_body(law_case, template, title)
  if case_type == "rental_dispute":
    return _build_rental_dispute_body(law_case, template, title)
  return _build_contract_review_body(law_case, template, title)


def _build_debt_collection_body(law_case: LawCase, template: _SelfServiceTemplate, title: str) -> str:
  copy = get_assessment_copy(law_case.caseType)
  knowledge = LEGAL_KNOWLEDGE["debt_collection"]
  subject = law_case.counterpartyName or law_case.debtorName
  missing = _missing_required_evidence(law_case)
  assessment = law_case.assessment
  estimated = assessment.estimatedDays if assessment is not None else "视材料补充情况而定"
  dispute = law_case.claimSummary or law_case.dispute
  evidence_names = [
    category.name
    for category in law_case.evidence
    if category.files or category.status == "recognized"
  ]
  lines = [
    title,
    "",
    "一、发函主体与相对方",
    f"发函主体：{law_case.partyRole or '债权人'}（请在发送前补充真实姓名/公司名称、联系方式与地址）",
    f"相对方：{subject}",
    f"案件编号：{law_case.caseNo}",
    "",
    "二、事实摘要",
    f"根据现有材料，{subject}与发函主体之间存在{get_case_type_label(law_case.caseType)}事项。",
    f"当前识别欠款金额为人民币 {law_case.amount:,.0f} 元。",
    f"争议概述：{dispute}",
    f"已上传或识别材料：{'、'.join(evidence_names) if evidence_names else '暂无已识别材料，请先补充合同、聊天记录、转账记录等材料'}。",
    f"证据缺口：{'、'.join(missing) if missing else '暂无缺失的必传材料'}。",
    "",
    "三、法律依据",
    knowledge.scope_note,
    *_format_references(knowledge),
    "",
    "四、催告事项",
    f"1. 请相对方在收到本函后 5 个工作日内核对并支付欠款人民币 {law_case.amount:,.0f} 元。",
    "2. 如相对方对金额、履行期限或付款责任有异议，请在上述期限内以书面方式说明理由并提交相应凭证。",
    "3. 逾期未付款且未提出合理异议的，发函主体可继续整理证据，并依法考虑调解、仲裁、诉讼或升级人工法律服务。",
    "",
    "五、送达与留痕建议",
    "建议通过微信、短信、电子邮件或 EMS/顺丰等可查询物流的快递方式自行发送，并保存发送截图、邮件回执、快递面单、签收记录和沟通记录。",
    "发送后请在本系统记录对方是否付款、是否提出异议、是否无回应或拒绝处理。",
    "",
    "六、后续路径",
    f"建议路径：{template.suggested_route}",
    f"预计周期：{estimated}",
    f"时效提示：{copy.timing_finding}",
    f"处理建议：{knowledge.action_note}",
    "",
    f"重要提示：{SELF_SERVICE_BOUNDARY_NOTICE}",
    AI_GENERATED_NOTICE,
  ]
  return "\n".join(lines)


def _build_lawyer_letter_body(law_case: LawCase, template: _SelfServiceTemplate, title: str) -> str:
  context = _document_context(law_case, template)
  knowledge = LEGAL_KNOWLEDGE["lawyer_letter"]
  lines = [
    f"《{title}》",
    "",
    "一、使用边界",
    "本文件为普通函件草稿（AI 自助模板），供发函主体自行核对事实、诉求和证据后使用。",
    "399 自助版不以律师或律所名义出具正式律师函，也不提供代发、代理或律师署名服务。",
    "",
    "二、发函主体与相对方",
    f"发函主体：{law_case.partyRole or '权利主张方'}（请在发送前补充真实姓名/公司名称、联系方式与地址）",
    f"相对方：{context['subject']}",
    f"案件编号：{law_case.caseNo}",
    "",
    "三、事实与诉求摘要",
    f"业务类型：{get_case_type_label(law_case.caseType)}",
    *([f"诉求金额/标的：人民币 {law_case.amount:,.0f} 元"] if law_case.amount > 0 else []),
    f"争议概述：{context['dispute']}",
    f"已上传或识别材料：{context['evidence_names']}。",
    f"证据缺口：{context['missing']}。",
    "",
    "四、法律依据与适用提示",
    knowledge.scope_note,
    *_format_references(knowledge),
    "",
    "五、函件诉求",
    f"1. 请相对方在收到本函件草稿后 5 个工作日内核对事实，并就上述事项作出书面回复或履行相应义务。",
    "2. 如相对方对事实、金额、履行期限或责任承担有异议，请在上述期限内说明理由并提交凭证。",
    "3. 逾期未回复或争议扩大的，发函主体可继续整理证据，并考虑调解、诉讼、仲裁或升级人工法律服务。",
    "",
    "六、证据与留痕清单",
    knowledge.evidence_note,
    "建议通过微信、短信、电子邮件或可查询物流的快递方式自行发送，并保存发送截图、邮件回执、快递面单、签收记录和沟通记录。",
    "",
    "七、后续路径",
    f"建议路径：{template.suggested_route}",
    f"预计周期：{context['estimated']}",
    f"时效提示：{context['timing']}",
    f"处理建议：{knowledge.action_note}",
    "",
    f"重要提示：{SELF_SERVICE_BOUNDARY_NOTICE}",
    AI_GENERATED_NOTICE,
  ]
  return "\n".join(lines)


def _build_labor_dispute_body(law_case: LawCase, template: _SelfServiceTemplate, title: str) -> str:
  context = _document_context(law_case, template)
  knowledge = LEGAL_KNOWLEDGE["labor_dispute"]
  lines = [
    f"《{title}》",
    "",
    "一、申请人与用人单位",
    f"申请人：{law_case.partyRole or '劳动者'}（请在提交前补充真实姓名、身份证号、联系方式与送达地址）",
    f"用人单位：{context['subject']}",
    f"案件编号：{law_case.caseNo}",
    "",
    "二、劳动争议事实摘要",
    f"争议类型：{law_case.claimType or get_case_type_label(law_case.caseType)}",
    f"争议金额：人民币 {law_case.amount:,.0f} 元",
    f"争议概述：{context['dispute']}",
    f"已上传或识别材料：{context['evidence_names']}。",
    f"证据缺口：{context['missing']}。",
    "",
    "三、法律依据与适用提示",
    knowledge.scope_note,
    *_format_references(knowledge),
    "",
    "四、自助处理清单",
    "1. 核对劳动关系证据：劳动合同、工资流水、考勤、社保、工作沟通、工牌或入职材料。",
    "2. 核对请求项目：工资、加班费、经济补偿、赔偿金、未签合同二倍工资等需分别列明计算期间和依据。",
    "3. 核对仲裁时效：通常需关注知道或应当知道权利被侵害之日起一年的时效风险。",
    "4. 如与用人单位沟通，请保留协商记录；如准备仲裁，建议升级人工复核请求和证据。",
    "",
    "五、证据与留痕建议",
    knowledge.evidence_note,
    "涉及解除、离职、欠薪或工伤等复杂事项时，不建议仅凭 AI 模板直接提交，应先由人工复核。",
    "",
    "六、后续路径",
    f"建议路径：{template.suggested_route}",
    f"预计周期：{context['estimated']}",
    f"时效提示：{context['timing']}",
    f"处理建议：{knowledge.action_note}",
    "",
    f"重要提示：{SELF_SERVICE_BOUNDARY_NOTICE}",
    AI_GENERATED_NOTICE,
  ]
  return "\n".join(lines)


def _build_rental_dispute_body(law_case: LawCase, template: _SelfServiceTemplate, title: str) -> str:
  context = _document_context(law_case, template)
  knowledge = LEGAL_KNOWLEDGE["rental_dispute"]
  lines = [
    f"《{title}》",
    "",
    "一、发函主体与相对方",
    f"发函主体：{law_case.partyRole or '租赁合同当事人'}（请在发送前补充真实姓名/公司名称、联系方式与地址）",
    f"相对方：{context['subject']}",
    f"案件编号：{law_case.caseNo}",
    "",
    "二、租赁纠纷事实摘要",
    f"争议金额：人民币 {law_case.amount:,.0f} 元",
    f"争议概述：{context['dispute']}",
    f"已上传或识别材料：{context['evidence_names']}。",
    f"证据缺口：{context['missing']}。",
    "",
    "三、法律依据与适用提示",
    knowledge.scope_note,
    *_format_references(knowledge),
    "",
    "四、协商事项",
    "1. 请相对方核对租赁合同、付款凭证、交接记录和房屋状态资料。",
    f"2. 请相对方在收到本协商函后 5 个工作日内就人民币 {law_case.amount:,.0f} 元争议金额说明处理意见。",
    "3. 如涉及押金返还，请结合合同约定、退租交接和房屋状态记录确认返还条件。",
    "4. 如涉及欠付租金、占用费或损坏赔偿，请列明期间、金额、计算方式和证据。",
    "",
    "五、证据与留痕建议",
    knowledge.evidence_note,
    "建议自行发送协商函后保存发送凭证、对方回复、付款记录、房屋交接和维修沟通记录。",
    "",
    "六、后续路径",
    f"建议路径：{template.suggested_route}",
    f"预计周期：{context['estimated']}",
    f"时效提示：{context['timing']}",
    f"处理建议：{knowledge.action_note}",
    "",
    f"重要提示：{SELF_SERVICE_BOUNDARY_NOTICE}",
    AI_GENERATED_NOTICE,
  ]
  return "\n".join(lines)


def _build_contract_review_body(law_case: LawCase, template: _SelfServiceTemplate, title: str) -> str:
  context = _document_context(law_case, template)
  knowledge = LEGAL_KNOWLEDGE["contract_review"]
  lines = [
    f"《{title}》",
    "",
    "一、审查对象",
    f"合同相对方：{context['subject']}",
    *([f"合同金额：人民币 {law_case.amount:,.0f} 元"] if law_case.amount > 0 else []),
    f"案件编号：{law_case.caseNo}",
    f"交易背景：{context['dispute']}",
    f"已上传或识别材料：{context['evidence_names']}。",
    f"证据缺口：{context['missing']}。",
    "",
    "二、法律依据与审查口径",
    knowledge.scope_note,
    *_format_references(knowledge),
    "",
    "三、重点审查清单",
    "1. 主体与授权：核对签约主体、联系人、授权文件、印章和签署权限。",
    "2. 交易条款：核对标的、数量、质量、价款、付款节点、交付验收和发票安排。",
    "3. 违约与解除：核对违约责任、解除条件、通知方式、逾期处理和损失范围。",
    "4. 格式条款：对免除或限制责任、加重对方责任、排除主要权利的条款进行重点提示。",
    "5. 争议解决：核对管辖、仲裁、法律适用、送达地址和证据留存约定。",
    "",
    "四、修改与谈判建议",
    "1. 对金额、期限、验收、违约金、解除和争议解决条款逐条标注是否接受、需修改或需人工复核。",
    "2. 对重大交易、长期合作、格式合同或高风险条款，建议升级律师精审后再签署。",
    "3. 已签署合同如需解除、变更或追责，应结合履行证据另行判断，不仅按初审意见处理。",
    "",
    "五、材料与留痕建议",
    knowledge.evidence_note,
    "建议保存合同版本、修订痕迹、谈判记录、对方确认记录和最终签署版本。",
    "",
    "六、后续路径",
    f"建议路径：{template.suggested_route}",
    f"预计周期：{context['estimated']}",
    f"时效提示：{context['timing']}",
    f"处理建议：{knowledge.action_note}",
    "",
    f"重要提示：{SELF_SERVICE_BOUNDARY_NOTICE}",
    AI_GENERATED_NOTICE,
  ]
  return "\n".join(lines)


def _document_context(law_case: LawCase, template: _SelfServiceTemplate) -> dict[str, str]:
  copy = get_assessment_copy(law_case.caseType)
  missing = _missing_required_evidence(law_case)
  assessment = law_case.assessment
  estimated = assessment.estimatedDays if assessment is not None else "视材料补充情况而定"
  evidence_names = [
    category.name
    for category in law_case.evidence
    if category.files or category.status == "recognized"
  ]
  return {
    "subject": law_case.counterpartyName or law_case.debtorName,
    "dispute": law_case.claimSummary or law_case.dispute,
    "estimated": estimated,
    "timing": copy.timing_finding,
    "missing": "、".join(missing) if missing else "暂无缺失的必传材料",
    "evidence_names": "、".join(evidence_names) if evidence_names else "暂无已识别材料，请先补充关键材料",
    "route": template.suggested_route,
  }


def _format_references(knowledge: _CaseLegalKnowledge) -> list[str]:
  return [
    f"{reference.law}{reference.article}：{reference.note}"
    for reference in knowledge.references
  ]


def _missing_required_evidence(law_case: LawCase) -> list[str]:
  return [
    category.name
    for category in law_case.evidence
    if category.required and not category.files and category.status != "recognized"
  ]
