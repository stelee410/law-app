from __future__ import annotations

from dataclasses import dataclass

from app.schemas import CaseStage, CaseType, EvidenceCategory


@dataclass(frozen=True)
class EvidenceTemplate:
  id: str
  name: str
  required: bool
  insight: str


@dataclass(frozen=True)
class StageTemplate:
  key: str
  title: str
  description: str


@dataclass(frozen=True)
class AssessmentCopy:
  high_summary: str
  mid_summary: str
  high_route: str
  mid_route: str
  estimated_days_high: str
  estimated_days_mid: str
  subject_label: str
  amount_label: str
  timing_finding: str
  boundary_notice: str


CASE_TYPE_LABELS: dict[CaseType, str] = {
  "debt_collection": "欠款追偿",
  "lawyer_letter": "律师函",
  "labor_dispute": "劳动争议",
  "rental_dispute": "租赁纠纷",
  "contract_review": "合同审查",
}

EVIDENCE_TEMPLATES: dict[CaseType, list[EvidenceTemplate]] = {
  "debt_collection": [
    EvidenceTemplate("contract", "合同/协议", True, "确认交易基础"),
    EvidenceTemplate("chat", "聊天记录", True, "证明催收与确认欠款"),
    EvidenceTemplate("transfer", "转账记录", True, "证明付款与欠款金额"),
    EvidenceTemplate("invoice", "发票/对账单", False, "补充金额依据"),
    EvidenceTemplate("delivery", "交付证明", False, "证明已履行义务"),
    EvidenceTemplate("send_proof", "发送/送达凭证", False, "留存律师函自行发送、快递单或签收记录"),
    EvidenceTemplate("other", "其他证据", False, "选填项"),
  ],
  "lawyer_letter": [
    EvidenceTemplate("identity", "主体信息", True, "确认委托人与收函方"),
    EvidenceTemplate("facts", "事实说明材料", True, "支撑律师函事实基础"),
    EvidenceTemplate("contract", "合同/协议", False, "补充权利义务依据"),
    EvidenceTemplate("communication", "沟通记录", True, "证明已沟通或催告"),
    EvidenceTemplate("demand", "诉求材料", True, "明确履行期限与请求"),
    EvidenceTemplate("send_proof", "发送/送达凭证", False, "留存函件发送截图、快递单或签收记录"),
    EvidenceTemplate("other", "其他证据", False, "选填项"),
  ],
  "labor_dispute": [
    EvidenceTemplate("labor_contract", "劳动合同", False, "证明劳动关系"),
    EvidenceTemplate("payroll", "工资流水", True, "证明工资标准与欠付金额"),
    EvidenceTemplate("attendance", "考勤记录", False, "证明工作事实"),
    EvidenceTemplate("termination", "解除/离职通知", False, "证明争议时间"),
    EvidenceTemplate("communication", "聊天记录", True, "证明管理关系与争议经过"),
    EvidenceTemplate("social_security", "社保记录", False, "补充劳动关系证据"),
    EvidenceTemplate("send_proof", "发送/送达凭证", False, "留存沟通函件、调解通知或仲裁材料发送凭证"),
  ],
  "rental_dispute": [
    EvidenceTemplate("lease_contract", "租赁合同", True, "确认租期、租金与押金"),
    EvidenceTemplate("payment", "付款/押金凭证", True, "证明支付或欠付金额"),
    EvidenceTemplate("handover", "交接记录", False, "证明交付和退租状态"),
    EvidenceTemplate("property_media", "房屋照片/视频", False, "证明损坏或占用情况"),
    EvidenceTemplate("communication", "沟通记录", True, "证明协商与催告经过"),
    EvidenceTemplate("send_proof", "发送/送达凭证", False, "留存协商函、律师函或快递签收凭证"),
    EvidenceTemplate("other", "其他证据", False, "选填项"),
  ],
  "contract_review": [
    EvidenceTemplate("contract_draft", "待审合同", True, "AI 初审的核心材料"),
    EvidenceTemplate("attachments", "附件/补充协议", False, "识别完整交易文件"),
    EvidenceTemplate("background", "交易背景说明", True, "判断条款商业目的"),
    EvidenceTemplate("focus_terms", "重点关注条款", False, "突出需审查风险"),
    EvidenceTemplate("communication", "历史沟通记录", False, "补充谈判背景"),
    EvidenceTemplate("other", "其他材料", False, "选填项"),
  ],
}

STAGE_TEMPLATES: dict[CaseType, list[StageTemplate]] = {
  "debt_collection": [
    StageTemplate("submit", "提交信息", "已提交追偿基础信息"),
    StageTemplate("evidence", "上传证据", "等待上传关键证据"),
    StageTemplate("review", "律师复核", "律师将复核证据与案情"),
    StageTemplate("letter", "发送律师函", "生成并发送律师函"),
    StageTemplate("negotiation", "协商调解", "跟进对方回应"),
    StageTemplate("filing", "立案材料准备", "调解未果将进入立案准备阶段"),
    StageTemplate("recovery", "回款 / 结案", "回款完成或法院判决后结案"),
  ],
  "lawyer_letter": [
    StageTemplate("submit", "提交事实", "已提交发函事实与诉求"),
    StageTemplate("evidence", "补充材料", "等待补充发函依据材料"),
    StageTemplate("review", "函件草稿", "AI 生成律师函草稿"),
    StageTemplate("letter", "律师复核", "律师复核事实、措辞与发送边界"),
    StageTemplate("negotiation", "发送确认", "确认发函方式与收函方信息"),
    StageTemplate("filing", "回应跟踪", "跟进对方履行或回复"),
    StageTemplate("recovery", "归档 / 升级", "归档函件或升级争议处理"),
  ],
  "labor_dispute": [
    StageTemplate("submit", "提交争议", "已提交劳动争议基础信息"),
    StageTemplate("evidence", "上传证据", "等待上传劳动关系与工资证据"),
    StageTemplate("review", "AI评估", "评估仲裁请求和证据缺口"),
    StageTemplate("letter", "材料整理", "整理仲裁申请材料"),
    StageTemplate("negotiation", "调解沟通", "尝试与用人单位调解"),
    StageTemplate("filing", "仲裁准备", "准备劳动仲裁立案材料"),
    StageTemplate("recovery", "结案", "调解、裁决或履行后结案"),
  ],
  "rental_dispute": [
    StageTemplate("submit", "提交纠纷", "已提交租赁纠纷基础信息"),
    StageTemplate("evidence", "上传证据", "等待上传合同、付款和交接材料"),
    StageTemplate("review", "AI评估", "评估押金、租金和违约责任"),
    StageTemplate("letter", "协商/发函", "生成协商函或律师函建议"),
    StageTemplate("negotiation", "调解跟进", "跟进双方协商与调解"),
    StageTemplate("filing", "起诉准备", "准备诉讼材料"),
    StageTemplate("recovery", "结案", "履行、和解或判决后结案"),
  ],
  "contract_review": [
    StageTemplate("submit", "提交需求", "已提交合同审查需求"),
    StageTemplate("evidence", "上传合同", "等待上传待审合同和附件"),
    StageTemplate("review", "AI初审", "识别重点风险条款"),
    StageTemplate("letter", "修改建议", "生成条款修改建议"),
    StageTemplate("negotiation", "律师复核", "律师精审关键条款"),
    StageTemplate("filing", "定稿确认", "确认修改版和谈判要点"),
    StageTemplate("recovery", "归档", "合同审查完成并归档"),
  ],
}

ASSESSMENT_COPIES: dict[CaseType, AssessmentCopy] = {
  "debt_collection": AssessmentCopy(
    high_summary="证据较充分，对方违约事实清晰，追偿可行性较高",
    mid_summary="基础证据已建立，建议继续补充交付、对账和催款记录",
    high_route="律师函催告 → 协商调解 → 立案追偿",
    mid_route="补充证据 → 律师复核 → 发函催告",
    estimated_days_high="约 30-45 天",
    estimated_days_mid="约 45-60 天",
    subject_label="债务人",
    amount_label="识别欠款金额",
    timing_finding="需关注还款期限和诉讼时效风险",
    boundary_notice="AI 可生成追偿建议，律师函发送需经律师复核确认",
  ),
  "lawyer_letter": AssessmentCopy(
    high_summary="发函事实和诉求较完整，适合进入律师函草稿与复核流程",
    mid_summary="已具备发函基础，建议补充主体信息、收函地址和履行期限",
    high_route="AI草稿 → 律师复核 → 确认发送 → 回应跟踪",
    mid_route="补充事实材料 → 律师复核 → 发函或改走协商",
    estimated_days_high="约 3-7 天",
    estimated_days_mid="约 7-14 天",
    subject_label="收函方",
    amount_label="诉求金额/标的",
    timing_finding="需明确履行期限，避免函件措辞超过事实依据",
    boundary_notice="AI 仅生成律师函草稿，律师署名或代发必须经律师复核",
  ),
  "labor_dispute": AssessmentCopy(
    high_summary="劳动关系和核心请求较清晰，可进入仲裁材料准备",
    mid_summary="劳动关系线索已建立，建议补充工资、考勤和解除证据",
    high_route="证据整理 → 仲裁请求测算 → 调解/仲裁准备",
    mid_route="补充劳动关系证据 → 律师复核 → 仲裁材料整理",
    estimated_days_high="约 30-60 天",
    estimated_days_mid="约 45-75 天",
    subject_label="用人单位",
    amount_label="争议金额",
    timing_finding="需重点核对劳动仲裁时效和解除/离职时间",
    boundary_notice="AI 可辅助整理仲裁请求，正式仲裁材料建议律师复核",
  ),
  "rental_dispute": AssessmentCopy(
    high_summary="租赁合同、付款和沟通证据较完整，具备协商或起诉准备基础",
    mid_summary="租赁关系已初步明确，建议补充交接、房屋状态和付款凭证",
    high_route="协商函 → 调解 → 起诉材料准备",
    mid_route="补充交接证据 → 律师复核 → 协商/发函",
    estimated_days_high="约 15-45 天",
    estimated_days_mid="约 30-60 天",
    subject_label="相对方",
    amount_label="押金/租金争议金额",
    timing_finding="需核对租期、退租时间、押金返还条件和违约责任",
    boundary_notice="AI 可生成协商路径，正式法律文书需律师复核",
  ),
  "contract_review": AssessmentCopy(
    high_summary="合同材料和交易背景较完整，可输出风险条款和修改建议",
    mid_summary="已具备初审材料，建议补充交易背景、附件和重点关注条款",
    high_route="AI初审 → 风险条款清单 → 修改建议 → 律师精审",
    mid_route="补充背景材料 → AI初审 → 律师复核关键条款",
    estimated_days_high="约 1-3 天",
    estimated_days_mid="约 3-7 天",
    subject_label="合同相对方",
    amount_label="合同金额",
    timing_finding="需关注签署状态、履行期限、违约责任和争议解决条款",
    boundary_notice="AI 审查不替代律师意见，重大交易建议律师精审",
  ),
}


def normalize_case_type(case_type: str | None) -> CaseType:
  if case_type in CASE_TYPE_LABELS:
    return case_type  # type: ignore[return-value]
  return "debt_collection"


def get_case_type_label(case_type: CaseType) -> str:
  return CASE_TYPE_LABELS[normalize_case_type(case_type)]


def create_evidence_categories(case_type: CaseType) -> list[EvidenceCategory]:
  templates = EVIDENCE_TEMPLATES[normalize_case_type(case_type)]
  return [
    EvidenceCategory(
      id=item.id,
      name=item.name,
      required=item.required,
      status="pending" if item.required else "optional",
      files=[],
      insight=item.insight,
    )
    for item in templates
  ]


def create_case_stages(case_type: CaseType, submitted_at: str) -> list[CaseStage]:
  stages: list[CaseStage] = []
  for index, item in enumerate(STAGE_TEMPLATES[normalize_case_type(case_type)]):
    stages.append(
      CaseStage(
        key=item.key,  # type: ignore[arg-type]
        title=item.title,
        description=item.description,
        status="done" if index == 0 else "active" if index == 1 else "todo",
        at=submitted_at if index == 0 else None,
      )
    )
  return stages


def get_assessment_copy(case_type: CaseType) -> AssessmentCopy:
  return ASSESSMENT_COPIES[normalize_case_type(case_type)]
