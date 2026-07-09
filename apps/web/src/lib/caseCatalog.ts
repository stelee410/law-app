import type { CaseType, CreateCaseInput, MatterFields } from './types';

export type CaseFieldId = keyof CreateCaseInput | string;

export type CaseField = {
  id: CaseFieldId;
  label: string;
  type: 'text' | 'tel' | 'number' | 'date' | 'textarea' | 'select';
  step: 0 | 1 | 2;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  minLength?: number;
};

export type CaseCatalogItem = {
  type: CaseType;
  label: string;
  description: string;
  heroTitle: string;
  formTitle: string;
  fields: CaseField[];
  claimOptions: string[];
  defaultMatterFields: MatterFields;
  boundaryCopy: string;
  privacyCopy: string;
};

const dueStatusOptions = ['已到期', '部分到期', '不确定'];

const baseContactFields: CaseField[] = [
  { id: 'contactName', label: '联系人', type: 'text', step: 1, required: true, minLength: 2 },
  { id: 'contactPhone', label: '联系电话', type: 'tel', step: 1, required: true, minLength: 6 },
  { id: 'region', label: '所在地区', type: 'text', step: 1, required: true, placeholder: '例如：上海市浦东新区' },
  { id: 'partyRole', label: '你的身份', type: 'text', step: 1, required: true }
];

const claimSummaryField: CaseField = {
  id: 'claimSummary',
  label: '核心诉求',
  type: 'textarea',
  step: 2,
  required: true,
  minLength: 8,
  placeholder: '说明你希望平台协助达成的结果'
};

const disputeField: CaseField = {
  id: 'dispute',
  label: '争议描述',
  type: 'textarea',
  step: 2,
  required: true,
  minLength: 10,
  placeholder: '简要说明事实、关键时间和当前卡点'
};

export const caseCatalog: Record<CaseType, CaseCatalogItem> = {
  debt_collection: {
    type: 'debt_collection',
    label: '欠款追偿',
    description: '应收账款、借款、货款回收',
    heroTitle: 'AI 帮你追回应收账款',
    formTitle: '发起追偿',
    fields: [
      { id: 'debtorName', label: '债务人/公司', type: 'text', step: 0, required: true, minLength: 2 },
      { id: 'amount', label: '欠款金额', type: 'number', step: 0, required: true },
      { id: 'contractDate', label: '合同/借款日期', type: 'date', step: 0, required: true },
      { id: 'counterpartyName', label: '对方名称', type: 'text', step: 0, placeholder: '可与债务人一致' },
      ...baseContactFields,
      { id: 'dueStatus', label: '到期状态', type: 'select', step: 1, required: true, options: dueStatusOptions },
      { id: 'claimType', label: '诉求类型', type: 'select', step: 2, required: true },
      disputeField,
      claimSummaryField
    ],
    claimOptions: ['催收回款', '律师函催告', '诉前调解', '起诉准备'],
    defaultMatterFields: { paymentEvidence: '', reminderCount: '' },
    boundaryCopy: '平台会根据欠款事实生成证据 checklist，并进入上传与评估流程。',
    privacyCopy: '我同意平台仅为案件处理、证据评估和服务推荐使用上述信息。'
  },
  lawyer_letter: {
    type: 'lawyer_letter',
    label: '律师函',
    description: '催告、声明、侵权制止',
    heroTitle: '快速生成律师函服务单',
    formTitle: '发起律师函',
    fields: [
      { id: 'debtorName', label: '收函方名称', type: 'text', step: 0, required: true, minLength: 2 },
      { id: 'counterpartyName', label: '对方联系人/主体', type: 'text', step: 0, required: true, minLength: 2 },
      { id: 'amount', label: '涉及金额', type: 'number', step: 0 },
      { id: 'contractDate', label: '事项发生日期', type: 'date', step: 0, required: true },
      ...baseContactFields,
      { id: 'claimType', label: '发函目的', type: 'select', step: 2, required: true },
      disputeField,
      claimSummaryField
    ],
    claimOptions: ['付款催告', '履约催告', '侵权制止', '解除/终止通知'],
    defaultMatterFields: { deliveryAddress: '', letterDeadline: '' },
    boundaryCopy: '律师函服务会先核对事实与送达信息，复杂争议需律师进一步确认。',
    privacyCopy: '我同意平台为生成、审核和送达律师函处理上述信息。'
  },
  labor_dispute: {
    type: 'labor_dispute',
    label: '劳动争议',
    description: '欠薪、赔偿、离职纠纷',
    heroTitle: '梳理劳动争议维权路径',
    formTitle: '发起劳动争议',
    fields: [
      { id: 'debtorName', label: '用人单位', type: 'text', step: 0, required: true, minLength: 2 },
      { id: 'amount', label: '主张金额', type: 'number', step: 0, required: true },
      { id: 'contractDate', label: '入职日期', type: 'date', step: 0, required: true },
      { id: 'incidentDate', label: '争议发生日期', type: 'date', step: 0, required: true },
      ...baseContactFields,
      { id: 'claimType', label: '争议类型', type: 'select', step: 2, required: true },
      disputeField,
      claimSummaryField
    ],
    claimOptions: ['拖欠工资', '违法解除', '经济补偿', '工伤/社保', '加班费'],
    defaultMatterFields: { employmentType: '', salaryStandard: '' },
    boundaryCopy: '劳动争议会优先梳理仲裁时效、劳动关系证据和可主张项目。',
    privacyCopy: '我同意平台为劳动争议评估和服务推荐使用上述个人与用工信息。'
  },
  rental_dispute: {
    type: 'rental_dispute',
    label: '租赁纠纷',
    description: '押金、租金、退租交割',
    heroTitle: '处理租赁合同与押金纠纷',
    formTitle: '发起租赁纠纷',
    fields: [
      { id: 'debtorName', label: '房东/租客/中介', type: 'text', step: 0, required: true, minLength: 2 },
      { id: 'amount', label: '争议金额', type: 'number', step: 0, required: true },
      { id: 'contractDate', label: '租赁合同日期', type: 'date', step: 0, required: true },
      { id: 'incidentDate', label: '退租/违约日期', type: 'date', step: 0 },
      ...baseContactFields,
      { id: 'claimType', label: '纠纷类型', type: 'select', step: 2, required: true },
      disputeField,
      claimSummaryField
    ],
    claimOptions: ['押金退还', '租金欠付', '提前退租', '房屋维修', '违约赔偿'],
    defaultMatterFields: { propertyAddress: '', depositAmount: '' },
    boundaryCopy: '租赁纠纷会围绕合同、交割、付款和沟通记录生成证据清单。',
    privacyCopy: '我同意平台为租赁纠纷处理和评估使用上述房屋与合同信息。'
  },
  contract_review: {
    type: 'contract_review',
    label: '合同审查',
    description: '风险扫描、条款建议、履约提醒',
    heroTitle: '提交合同进行 AI 风险审查',
    formTitle: '发起合同审查',
    fields: [
      { id: 'debtorName', label: '合同相对方', type: 'text', step: 0, required: true, minLength: 2 },
      { id: 'contractDate', label: '合同签署/拟签日期', type: 'date', step: 0, required: true },
      { id: 'amount', label: '合同金额', type: 'number', step: 0 },
      { id: 'counterpartyName', label: '对方主体', type: 'text', step: 0 },
      ...baseContactFields,
      { id: 'claimType', label: '审查重点', type: 'select', step: 2, required: true },
      {
        id: 'dispute',
        label: '合同背景',
        type: 'textarea',
        step: 2,
        required: true,
        minLength: 10,
        placeholder: '说明交易背景、担心的风险或希望重点审查的条款'
      },
      claimSummaryField
    ],
    claimOptions: ['付款条款', '违约责任', '解除条款', '交付验收', '知识产权', '整体风险'],
    defaultMatterFields: { contractScenario: '', reviewDeadline: '' },
    boundaryCopy: '合同审查 MVP 会先输出风险摘要和证据/材料清单，不替代律师正式出具法律意见。',
    privacyCopy: '我同意平台为合同风险审查和服务推荐处理上述合同信息。'
  }
};

export const caseTypeOptions = Object.values(caseCatalog);

export function isCaseType(value: string | null): value is CaseType {
  return Boolean(value && value in caseCatalog);
}

export function getCaseCatalogItem(caseType: CaseType) {
  return caseCatalog[caseType];
}
