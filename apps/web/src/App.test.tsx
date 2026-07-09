import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { caseKeys } from './hooks/useCaseQueries';
import { api, apiUrl, resolveApiBaseUrl } from './lib/api';
import * as apiModule from './lib/api';
import { queryClient } from './lib/queryClient';
import { router } from './router';
import { useAuthStore } from './state/authStore';

const testUser = {
  id: 'user-test',
  phone: '13800001234',
  name: '测试用户',
  role: 'client',
  accountStatus: 'active',
  lawyerReviewStatus: 'none',
  specialties: [],
  createdAt: '2026-06-29T00:00:00.000Z'
};

const testLawyer = {
  id: 'lawyer-test',
  phone: '13900009999',
  name: '律师9999',
  role: 'lawyer',
  accountStatus: 'active',
  lawyerReviewStatus: 'approved',
  lawFirm: '测试律师事务所',
  licenseNumber: '11101202010123456',
  practiceRegion: '上海',
  specialties: ['合同纠纷'],
  createdAt: '2026-06-29T00:00:00.000Z'
};

const pendingLawyer = {
  ...testLawyer,
  id: 'lawyer-pending',
  phone: '13900008888',
  lawyerReviewStatus: 'pending_review'
};

const rejectedLawyer = {
  ...testLawyer,
  id: 'lawyer-rejected',
  phone: '13900007777',
  lawyerReviewStatus: 'rejected',
  rejectedReason: '执业证号无法核验'
};

const testAdmin = {
  id: 'admin-test',
  phone: '13600000000',
  name: '平台管理员',
  role: 'admin',
  accountStatus: 'active',
  lawyerReviewStatus: 'none',
  specialties: [],
  createdAt: '2026-06-29T00:00:00.000Z'
};

const disabledUser = {
  ...testUser,
  id: 'user-disabled',
  phone: '13800006666',
  accountStatus: 'disabled'
};

const secondActiveUser = {
  ...testUser,
  id: 'user-second-active',
  phone: '13800005555',
  name: '第二位用户'
};

const secondDisabledUser = {
  ...testUser,
  id: 'user-second-disabled',
  phone: '13800004444',
  name: '第二位禁用用户',
  accountStatus: 'disabled'
};

const testCase = {
  id: 'case-test',
  caseType: 'debt_collection',
  debtorName: '测试债务人有限公司',
  contactName: '张先生',
  contactPhone: '13800001234',
  amount: 86500,
  contractDate: '2024-01-15',
  dispute: '对方未按合同约定支付尾款，已经多次催收。',
  dueStatus: '已到期',
  partyRole: '债权人',
  counterpartyName: '测试债务人有限公司',
  region: '上海',
  incidentDate: '2024-02-01',
  claimType: '催收回款',
  claimSummary: '希望追回欠款',
  privacyConsent: true,
  matterFields: {},
  status: '证据收集中',
  createdAt: '2026-06-01T02:21:00.000Z',
  caseNo: 'AL2024060100123',
  evidence: [
    {
      id: 'contract',
      name: '合同与订单',
      status: 'uploaded',
      required: true,
      files: [
        {
          id: 'file-contract',
          name: '合同.pdf',
          size: 204800,
          mimeType: 'application/pdf',
          uploadedAt: '2026-06-01T02:22:00.000Z'
        }
      ],
      insight: '已识别合同金额与付款日期。'
    },
    {
      id: 'chat',
      name: '聊天记录',
      status: 'uploaded',
      required: true,
      files: [
        {
          id: 'file-chat',
          name: '聊天记录.pdf',
          size: 102400,
          mimeType: 'application/pdf',
          uploadedAt: '2026-06-01T02:23:00.000Z'
        }
      ],
      insight: '已识别催收沟通记录。'
    }
  ],
  stages: [
    {
      key: 'submit',
      title: '提交案件',
      description: '案件信息已提交。',
      status: 'done',
      at: '2026-06-01'
    },
    {
      key: 'evidence',
      title: '证据收集',
      description: '继续补充合同、聊天记录和转账凭证。',
      status: 'active',
      at: '2026-06-02'
    }
  ]
};

const assessedCase = {
  ...testCase,
  assessment: {
    winRate: 78,
    confidence: '较高',
    summary: '证据较充分，对方违约事实清晰。',
    suggestedRoute: '先发律师函，再协商调解。',
    estimatedDays: '约 30-45 天',
    estimatedRecovery: 72000,
    generatedAt: '2026-06-01T02:25:00.000Z',
    findings: ['合同与转账记录可形成基础证据链。'],
    plans: [
      {
        id: 'self-service',
        name: 'AI自助版',
        subtitle: '适合预算有限 / 自主操作',
        price: 399,
        fee: '一次性服务费',
        features: ['AI自助材料包', '复制或下载模板，自行发送/使用', '记录结果']
      },
      {
        id: 'lawyer-review',
        name: '律师复核包',
        subtitle: '平衡效率和专业度',
        price: 1499,
        fee: '固定费 + 成功费 5%',
        features: ['律师复核证据', '发函催告'],
        recommended: true
      },
      {
        id: 'full-service',
        name: '全程代办版',
        subtitle: '省心省力 / 全程托管',
        price: 5999,
        fee: '固定费 + 成功费 10%',
        features: ['律师全程代理', '协商调解和材料提交']
      }
    ]
  }
};

const missingEvidenceCase = {
  ...assessedCase,
  evidence: assessedCase.evidence.map((category) => ({
    ...category,
    status: 'pending',
    files: []
  }))
};

const lockedPlanCase = {
  ...assessedCase,
  selectedPlan: 'lawyer-review',
  stages: [
    {
      key: 'submit',
      title: '提交案件',
      description: '案件信息已提交。',
      status: 'done',
      at: '2026-06-01'
    },
    {
      key: 'evidence',
      title: '证据收集',
      description: '已上传关键证据。',
      status: 'done',
      at: '2026-06-02'
    },
    {
      key: 'review',
      title: '律师复核',
      description: '律师复核中',
      status: 'active'
    },
    {
      key: 'letter',
      title: '发送律师函',
      description: '生成并发送律师函',
      status: 'todo'
    },
    {
      key: 'negotiation',
      title: '协商调解',
      description: '跟进对方回应',
      status: 'todo'
    },
    {
      key: 'filing',
      title: '立案材料准备',
      description: '调解未果将进入立案准备阶段',
      status: 'todo'
    },
    {
      key: 'recovery',
      title: '回款 / 结案',
      description: '回款完成或法院判决后结案',
      status: 'todo'
    }
  ],
  assessment: {
    ...assessedCase.assessment,
    plans: [
      ...assessedCase.assessment.plans
    ]
  }
};

const lawyerTask = {
  id: 'task-review',
  caseId: 'case-test',
  kind: 'lawyer_review',
  status: 'pending',
  assigneeId: 'lawyer-test',
  title: '律师复核待办',
  summary: '复核测试债务人有限公司的案件资料、证据和 AI 评估结果。',
  dueAt: '2026-06-30T00:00:00.000Z',
  createdAt: '2026-06-29T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z'
};

const lawyerDocument = {
  id: 'doc-lawyer-letter',
  caseId: 'case-test',
  type: 'lawyer_letter',
  status: 'draft',
  title: 'Lawyer letter draft',
  fields: {
    recipient: 'Test Debtor Ltd.',
    request: 'Pay within three days',
    deadline: '3 days'
  },
  body: 'Please pay the outstanding amount within three days.',
  version: 1,
  createdBy: 'lawyer-test',
  updatedBy: 'lawyer-test',
  createdAt: '2026-06-29T00:00:00.000Z',
  updatedAt: '2026-06-29T00:00:00.000Z'
};

const pendingLawyerDocument = {
  ...lawyerDocument,
  status: 'pending_client_approval'
};

const approvedLawyerServiceDocument = {
  ...lawyerDocument,
  status: 'approved',
  title: '正式催款律师函',
  body: '请贵司收到本函后三日内支付全部欠款及逾期损失。'
};

const approvedLawyerServiceCase = {
  ...assessedCase,
  selectedPlan: 'lawyer-review',
  status: '律师函已定稿，待客户自行发送',
  stages: [
    {
      key: 'submit',
      title: '提交案件',
      description: '案件信息已提交。',
      status: 'done',
      at: '2026-06-01'
    },
    {
      key: 'evidence',
      title: '证据收集',
      description: '已上传关键证据。',
      status: 'done',
      at: '2026-06-02'
    },
    {
      key: 'review',
      title: '律师复核',
      description: '律师已提交复核意见',
      status: 'done',
      at: '2026-06-03'
    },
    {
      key: 'letter',
      title: '发送律师函',
      description: '律师函已定稿，待客户下载或复制后自行发送',
      status: 'active'
    },
    {
      key: 'negotiation',
      title: '协商跟进',
      description: '客户自行发送后记录对方回应',
      status: 'todo'
    },
    {
      key: 'filing',
      title: '立案材料准备',
      description: '对方无回应或拒绝后准备立案材料',
      status: 'todo'
    },
    {
      key: 'recovery',
      title: '回款 / 结案',
      description: '回款完成或法院判决后结案',
      status: 'todo'
    }
  ]
};

const archivedLawyerDocument = {
  ...lawyerDocument,
  status: 'archived',
  title: 'Archived lawyer letter'
};

const selfServiceCase = {
  ...assessedCase,
  selectedPlan: 'self-service',
  status: 'AI自助处理完成：已生成催告模板与自助追偿清单',
  stages: [
    {
      key: 'submit',
      title: '提交案件',
      description: '案件信息已提交。',
      status: 'done',
      at: '2026-06-01'
    },
    {
      key: 'evidence',
      title: '证据收集',
      description: '已上传关键证据。',
      status: 'done',
      at: '2026-06-02'
    },
    {
      key: 'review',
      title: 'AI自助处理',
      description: 'AI已生成催收函草稿与追偿行动建议',
      status: 'done',
      at: '2026-06-03'
    },
    {
      key: 'letter',
      title: 'AI自助处理包',
      description: '复制或下载模板，自行发送后记录送达凭证与对方回应',
      status: 'active'
    },
    {
      key: 'negotiation',
      title: '协商调解',
      description: '记录对方回应后进入下一步建议',
      status: 'todo'
    }
  ]
};

const nonDebtSelfServiceStages = selfServiceCase.stages.map((stage) => {
  if (stage.key === 'review') {
    return {
      ...stage,
      description: 'AI已生成对应类型的自助处理包'
    };
  }
  if (stage.key === 'letter') {
    return {
      ...stage,
      description: '复制或下载模板，自行使用后记录凭证与对方回应'
    };
  }
  return stage;
});

const selfServiceEscalationCase = {
  ...selfServiceCase,
  status: '建议准备材料或升级人工服务',
  stages: [
    ...selfServiceCase.stages.slice(0, 4).map((stage) =>
      stage.key === 'letter'
        ? {
            ...stage,
            status: 'done',
            description: 'AI自助处理包已使用并记录结果',
            at: '2026-06-04'
          }
        : stage
    ),
    {
      key: 'negotiation',
      title: '协商调解',
      description: '等待对方回应，继续保留送达、沟通和履行记录',
      status: 'active'
    },
    {
      key: 'filing',
      title: '立案材料准备',
      description: '可整理材料包，或升级人工复核/代办服务',
      status: 'active'
    },
    {
      key: 'recovery',
      title: '回款 / 结案',
      description: '回款完成或法院判决后结案',
      status: 'todo'
    }
  ]
};

const selfServiceUpgradedCase = {
  ...selfServiceEscalationCase,
  status: '已申请升级人工服务',
  stages: selfServiceEscalationCase.stages.map((stage) => {
    if (stage.key === 'filing') {
      return {
        ...stage,
        status: 'done',
        description: '已申请升级人工服务，399 自助处理已交接',
        at: '2026-06-05'
      };
    }
    if (stage.key === 'negotiation') {
      return {
        ...stage,
        status: 'done',
        description: '已记录对方拒绝、无回应或需人工复核',
        at: '2026-06-05'
      };
    }
    return stage;
  })
};

const selfServiceWorkItems = [
  {
    id: 'task-ai-guidance',
    caseId: 'case-test',
    kind: 'ai_guidance',
    status: 'in_progress',
    title: 'AI自助处理包',
    summary: '已生成《付款催告函（AI 自助模板）》；下一步：复制或下载付款催告函模板，自行发送/使用后记录送达凭证与对方回应。'
  },
  {
    id: 'task-ai-pending',
    caseId: 'case-test',
    kind: 'ai_guidance',
    status: 'pending',
    title: '补充发送记录',
    summary: '发送后上传回执。'
  }
];

const selfServiceDocument = {
  id: 'doc-ai-letter',
  caseId: 'case-test',
  type: 'lawyer_letter',
  status: 'approved',
  title: '付款催告函（AI 自助模板）',
  fields: {
    source: 'ai_self_service',
    generatedAt: '2026-06-03T00:00:00.000Z'
  },
  body: '付款催告函（AI 自助模板）\n\n一、发函主体与相对方\n发函主体：测试用户\n相对方：测试债务人有限公司\n\n二、事实摘要\n经初步整理，测试债务人有限公司尚欠款项人民币 86,500 元。\n\n三、法律依据\n以下为通用合同/金钱债务条款，具体适用以事实和证据为准。\n《中华人民共和国民法典》第五百七十七条、第五百七十九条。\n借款合同专门条款需在确认存在借款法律关系后再适用。\n\n四、催告事项\n请在收到本函后 5 个工作日内完成付款或提出书面异议。\n\n五、送达与留痕建议\n建议通过微信、短信、电子邮件或 EMS/顺丰等可查询物流的快递方式自行发送，并保留送达凭证。\n\n六、后续路径\n自行催告 → 记录回应 → 准备材料或升级人工\n\n重要提示：399 自助版不代发、不代理、不出具正式律师函；如需正式律师函、调解或代办服务，请升级人工服务。\n本文书由人工智能（AI）生成，供参考使用；正式法律文书或律师服务需升级人工服务。',
  version: 1,
  createdBy: 'user-test',
  updatedBy: 'user-test',
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z'
};

const staleSelfServiceDocument = {
  ...selfServiceDocument,
  title: '致测试债务人有限公司的催收函（AI草稿）',
  body: '《致测试债务人有限公司的催收函（AI草稿）》\n\n一、案件信息\n- 业务类型：欠款追偿\n- 债务人：测试债务人有限公司\n- 识别欠款金额：￥86,500\n- 争议概述：希望生成自助催收材料和下一步行动清单。\n\n二、AI 处理建议\n- 建议路径：律师函催告 → 协商调解 → 立案追偿\n- 预计周期：约 30-45 天\n- 证据缺口：暂无缺失的必传材料\n\n三、下一步行动\n1. 复制或下载催告模板，自行发送/使用后记录凭证和对方回应\n\n重要提示：AI 可生成追偿建议，律师函发送需经律师复核确认\n本文书由人工智能（AI）生成，供参考使用；正式署名或对外发送前建议由执业律师审核。'
};

const contractReviewSelfServiceCase = {
  ...selfServiceCase,
  id: 'case-contract-review',
  caseType: 'contract_review',
  debtorName: '合同审查测试交易方',
  counterpartyName: '合同审查测试交易方',
  partyRole: '合同签署方',
  amount: 50000,
  dispute: '准备签署服务合同，希望识别付款、违约和解除条款风险。',
  claimSummary: '准备签署服务合同，希望识别付款、违约和解除条款风险。',
  stages: nonDebtSelfServiceStages,
  status: 'AI自助处理完成：已生成合同风险清单与修改建议'
};

const contractReviewSelfServiceWorkItems = [
  {
    id: 'task-contract-review-ai',
    caseId: 'case-contract-review',
    kind: 'ai_guidance',
    status: 'in_progress',
    title: 'AI自助处理包',
    summary: '已生成《合同审查意见（AI生成）》；下一步：核对风险条款，记录是否采纳修改建议或需要人工复核。'
  }
];

const contractReviewSelfServiceDocument = {
  id: 'doc-contract-review-ai',
  caseId: 'case-contract-review',
  type: 'contract_review_opinion',
  status: 'approved',
  title: '合同审查意见（AI生成）',
  fields: {
    source: 'ai_self_service',
    generatedAt: '2026-06-03T00:00:00.000Z'
  },
  body: '《合同审查意见（AI生成）》\n\n一、案件信息\n- 业务类型：合同审查\n- 合同相对方：合同审查测试交易方\n- 合同金额：￥50,000\n- 争议概述：准备签署服务合同，希望识别付款、违约和解除条款风险。\n\n二、AI 处理建议\n- 建议路径：AI初审 → 自行核对修改 → 需要时升级律师精审\n- 预计周期：约 30-45 天\n- 证据缺口：暂无缺失的必传材料\n\n三、下一步行动\n1. 核对风险条款，记录是否采纳修改建议或需要人工复核\n2. 如需正式法律意见书或律师服务，请升级人工服务\n\n重要提示：399 自助版不代发、不代理、不出具正式律师函；如需正式律师函、调解或代办服务，请升级人工服务。\n本文书由人工智能（AI）生成，供参考使用；正式法律文书或律师服务需升级人工服务。',
  version: 1,
  createdBy: 'user-test',
  updatedBy: 'user-test',
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z'
};

const nonDebtLegacySelfServiceFixtures = [
  {
    caseId: 'case-lawyer-letter',
    lawCase: {
      ...selfServiceCase,
      id: 'case-lawyer-letter',
      caseType: 'lawyer_letter',
      debtorName: '海南有钱公司',
      counterpartyName: '海南有钱公司',
      partyRole: '权利主张方',
      amount: 80000,
      dispute: '相对方未按约履行合作义务，需要普通函件草稿进行事实核对和履行提醒。',
      claimSummary: '需要函件草稿提醒对方核对事实、限期回复并保留沟通记录。',
      stages: nonDebtSelfServiceStages,
      status: 'AI自助处理完成：已生成函件草稿与使用清单'
    },
    workItems: [{
      id: 'task-lawyer-letter-ai',
      caseId: 'case-lawyer-letter',
      kind: 'ai_guidance',
      status: 'in_progress',
      title: 'AI自助处理包',
      summary: '已生成《致海南有钱公司的函件草稿（AI生成）》；下一步：复制或下载函件草稿；如需正式律师函，请升级人工复核。'
    }],
    document: {
      ...contractReviewSelfServiceDocument,
      id: 'doc-lawyer-letter-ai',
      caseId: 'case-lawyer-letter',
      type: 'lawyer_letter',
      title: '致海南有钱公司的函件草稿（AI生成）',
      body: '《致海南有钱公司的函件草稿（AI生成）》\n\n一、案件信息\n- 业务类型：律师函\n- 相对方：海南有钱公司\n\n二、AI 处理建议\n- 建议自行核对事实并保留沟通记录\n\n三、下一步行动\n复制或下载函件草稿，如需正式律师函，请升级人工复核。'
    },
    expectedTitle: '致海南有钱公司的函件草稿（AI 自助模板）',
    expectedHeading: '法律依据与适用提示',
    expectedLaw: /《中华人民共和国律师法》第二十八条/,
    forbiddenText: /付款催告函|欠款追偿|债务人/
  },
  {
    caseId: 'case-labor-dispute',
    lawCase: {
      ...selfServiceCase,
      id: 'case-labor-dispute',
      caseType: 'labor_dispute',
      debtorName: '上海用工科技有限公司',
      counterpartyName: '上海用工科技有限公司',
      partyRole: '劳动者',
      amount: 36000,
      dispute: '用人单位拖欠工资并要求离职，需要整理劳动关系证据和仲裁准备材料。',
      claimType: '拖欠工资',
      claimSummary: '需要核对工资流水、考勤和沟通记录，准备劳动仲裁材料。',
      stages: nonDebtSelfServiceStages,
      status: 'AI自助处理完成：已生成劳动争议自助材料包'
    },
    workItems: [{
      id: 'task-labor-ai',
      caseId: 'case-labor-dispute',
      kind: 'ai_guidance',
      status: 'in_progress',
      title: 'AI自助处理包',
      summary: '已生成《劳动仲裁申请建议书（AI生成）》；下一步：整理劳动关系证据、沟通记录和仲裁准备清单，并记录处理结果。'
    }],
    document: {
      ...contractReviewSelfServiceDocument,
      id: 'doc-labor-ai',
      caseId: 'case-labor-dispute',
      type: 'arbitration_material',
      title: '劳动仲裁申请建议书（AI生成）',
      body: '《劳动仲裁申请建议书（AI生成）》\n\n一、案件信息\n- 业务类型：劳动争议\n- 用人单位：上海用工科技有限公司\n\n二、AI 处理建议\n- 整理工资流水、考勤和沟通记录\n\n三、下一步行动\n准备劳动仲裁材料。'
    },
    expectedTitle: '劳动仲裁申请建议书（AI 自助模板）',
    expectedHeading: '法律依据与适用提示',
    expectedLaw: /《中华人民共和国劳动争议调解仲裁法》第二十七条/,
    forbiddenText: /付款催告函|欠款追偿|债务人/
  },
  {
    caseId: 'case-rental-dispute',
    lawCase: {
      ...selfServiceCase,
      id: 'case-rental-dispute',
      caseType: 'rental_dispute',
      debtorName: '杭州房东服务有限公司',
      counterpartyName: '杭州房东服务有限公司',
      partyRole: '承租人',
      amount: 12000,
      dispute: '退租后相对方拒绝返还押金并主张房屋损坏，需要整理租赁合同和交接证据协商处理。',
      claimType: '押金返还',
      claimSummary: '需要协商押金返还和房屋状态争议，并保留交接、照片和沟通记录。',
      stages: nonDebtSelfServiceStages,
      status: 'AI自助处理完成：已生成租赁纠纷自助处理包'
    },
    workItems: [{
      id: 'task-rental-ai',
      caseId: 'case-rental-dispute',
      kind: 'ai_guidance',
      status: 'in_progress',
      title: 'AI自助处理包',
      summary: '已生成《租赁纠纷协商函（AI草稿）》；下一步：复制或下载协商函，记录对方回应、押金/租金处理结果。'
    }],
    document: {
      ...contractReviewSelfServiceDocument,
      id: 'doc-rental-ai',
      caseId: 'case-rental-dispute',
      type: 'lawyer_letter',
      title: '租赁纠纷协商函（AI草稿）',
      body: '《租赁纠纷协商函（AI草稿）》\n\n一、案件信息\n- 业务类型：租赁纠纷\n- 相对方：杭州房东服务有限公司\n\n二、AI 处理建议\n- 整理租赁合同、押金付款凭证和交接照片\n\n三、下一步行动\n复制或下载协商函并记录对方回应。'
    },
    expectedTitle: '租赁纠纷协商函（AI 自助模板）',
    expectedHeading: '法律依据与适用提示',
    expectedLaw: /《中华人民共和国民法典》第七百二十二条/,
    forbiddenText: /付款催告函|欠款追偿|债务人/
  },
  {
    caseId: 'case-contract-review',
    lawCase: contractReviewSelfServiceCase,
    workItems: contractReviewSelfServiceWorkItems,
    document: contractReviewSelfServiceDocument,
    expectedTitle: '合同审查意见（AI 自助模板）',
    expectedHeading: '法律依据与审查口径',
    expectedLaw: /《中华人民共和国民法典》第四百九十六条/,
    forbiddenText: /付款催告函|欠款追偿|债务人|发送律师函/
  }
];

const testMessage = {
  id: 'msg-review',
  recipientUserId: 'user-test',
  caseId: 'case-test',
  type: 'task',
  title: '律师复核已受理',
  body: '系统已生成律师复核待办，律师将查看材料并反馈补证或处理建议。',
  unread: true,
  actionHref: '/cases/case-test',
  createdAt: '2026-06-29T00:00:00.000Z'
};

let createdCasePayload: unknown;
let adminUpdatePayload: Record<string, unknown> | undefined;
let adminReviewPayload: Record<string, unknown> | undefined;
let passwordLoginPayload: Record<string, unknown> | undefined;
let clientRegisterPayload: Record<string, unknown> | undefined;

beforeEach(() => {
  window.history.pushState({}, '', '/');
  localStorage.clear();
  queryClient.clear();
  useAuthStore.setState({ token: null, user: null, expiresAt: null });
  createdCasePayload = undefined;
  adminUpdatePayload = undefined;
  adminReviewPayload = undefined;
  passwordLoginPayload = undefined;
  clientRegisterPayload = undefined;
  window.scrollTo = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = input instanceof Request ? input.method : init?.method;
      if (url.endsWith('/api/v1/auth/request-code')) {
        return Promise.resolve(jsonResponse({ phone: '13800001234', mockCode: '654321', expiresAt: '2026-07-30T00:00:00.000Z' }));
      }
      if (url.endsWith('/api/v1/auth/login/password')) {
        passwordLoginPayload = input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse({ token: 'client-token', user: testUser, expiresAt: '2026-07-30T00:00:00.000Z' }));
      }
      if (url.endsWith('/api/v1/auth/register/client')) {
        clientRegisterPayload = input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse({ token: 'client-token', user: testUser, expiresAt: '2026-07-30T00:00:00.000Z' }));
      }
      if (url.endsWith('/api/v1/auth/onboard-lawyer')) {
        return Promise.resolve(jsonResponse({ token: 'lawyer-pending-token', user: pendingLawyer, expiresAt: '2026-07-30T00:00:00.000Z' }));
      }
      if (url.endsWith('/api/v1/cases') && method === 'POST') {
        createdCasePayload = input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
        return jsonResponse({ case: { ...testCase, ...(createdCasePayload as object), id: 'case-created' } });
      }
      if (url.endsWith('/api/v1/me')) {
        return Promise.resolve(jsonResponse({ user: useAuthStore.getState().user ?? testUser }));
      }
      if (url.endsWith('/api/v1/messages')) {
        return Promise.resolve(jsonResponse({ messages: [testMessage] }));
      }
      if (url.includes('/api/v1/admin/users/') && method === 'PATCH') {
        const userId = url.split('/').pop();
        const sourceUser = [testAdmin, testUser, secondActiveUser, disabledUser, secondDisabledUser].find((item) => item.id === userId) ?? testUser;
        adminUpdatePayload = input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse({ user: { ...sourceUser, ...adminUpdatePayload } }));
      }
      if (url.includes('/api/v1/admin/lawyers/') && url.endsWith('/review') && method === 'POST') {
        adminReviewPayload = input instanceof Request ? await input.clone().json() : JSON.parse(String(init?.body));
        return Promise.resolve(jsonResponse({ user: { ...pendingLawyer, lawyerReviewStatus: adminReviewPayload?.status ?? 'approved', rejectedReason: adminReviewPayload?.rejectedReason } }));
      }
      if (url.endsWith('/api/v1/admin/users')) {
        return Promise.resolve(jsonResponse({ users: [testAdmin, testUser, secondActiveUser, disabledUser, secondDisabledUser] }));
      }
      if (url.endsWith('/api/v1/admin/lawyers')) {
        return Promise.resolve(jsonResponse({ lawyers: [pendingLawyer, testLawyer, rejectedLawyer] }));
      }
      if (url.endsWith('/api/v1/admin/cases')) {
        return Promise.resolve(jsonResponse({ cases: [testCase] }));
      }
      if (url.endsWith('/api/v1/admin/overview')) {
        return Promise.resolve(jsonResponse({ summary: { totalUsers: 4, totalCases: 1, pendingLawyers: 1 }, recentCases: [testCase] }));
      }
      if (url.endsWith('/api/v1/cases/case-test/work-items')) {
        return Promise.resolve(jsonResponse({ workItems: [lawyerTask] }));
      }
      if (url.endsWith('/api/v1/cases/case-test/documents')) {
        return Promise.resolve(jsonResponse({ documents: [] }));
      }
      if (url.endsWith('/api/v1/cases/case-contract-review/work-items')) {
        return Promise.resolve(jsonResponse({ workItems: contractReviewSelfServiceWorkItems }));
      }
      if (url.endsWith('/api/v1/cases/case-contract-review/documents')) {
        return Promise.resolve(jsonResponse({ documents: [contractReviewSelfServiceDocument] }));
      }
      if (url.endsWith('/api/v1/cases/case-contract-review')) {
        return Promise.resolve(jsonResponse({ case: contractReviewSelfServiceCase }));
      }
      if (url.endsWith('/api/v1/lawyer/cases/case-test/documents')) {
        return Promise.resolve(jsonResponse({ documents: [lawyerDocument] }));
      }
      if (url.endsWith('/api/v1/lawyer/tasks')) {
        return Promise.resolve(jsonResponse({ tasks: [lawyerTask] }));
      }
      if (url.endsWith('/api/v1/lawyer/tasks/task-review')) {
        return Promise.resolve(jsonResponse({ task: lawyerTask, case: assessedCase }));
      }
      if (url.endsWith('/api/v1/cases')) {
        return Promise.resolve(jsonResponse({ cases: [testCase] }));
      }
      if (url.endsWith('/api/v1/cases/case-test')) {
        return Promise.resolve(jsonResponse({ case: assessedCase }));
      }
      if (url.endsWith('/api/v1/cases/case-created')) {
        return Promise.resolve(jsonResponse({ case: { ...testCase, id: 'case-created' } }));
      }
      return Promise.resolve(jsonResponse({}));
    })
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('uses a configurable API base with the dev proxy fallback', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('/api/v1');
    expect(resolveApiBaseUrl('')).toBe('/api/v1');
    expect(resolveApiBaseUrl(' https://demo.example.com/api/v1/ ')).toBe('https://demo.example.com/api/v1');
    expect(apiUrl('/health')).toBe('/api/v1/health');
    expect(apiUrl('health')).toBe('/api/v1/health');
  });

  it('attaches the bearer token to API requests', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });

    await api.get('http://localhost/api/v1/cases').json<{ cases: unknown[] }>();

    const fetchMock = vi.mocked(fetch);
    const lastCall = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const [input, init] = lastCall;
    const headers = input instanceof Request ? input.headers : new Headers(init?.headers);
    expect(headers.get('Authorization')).toBe('Bearer test-token');
  });

  it('renders the mobile home for authenticated users', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.lists, [testCase]);

    render(<App />);

    expect(await screen.findByText('399自助闭环追回应收账款')).toBeInTheDocument();
    expect((await screen.findAllByText('欠款追偿')).length).toBeGreaterThan(0);
    expect(await screen.findByText('律师函')).toBeInTheDocument();
    expect(await screen.findByText('劳动争议')).toBeInTheDocument();
    expect(await screen.findByText('租赁纠纷')).toBeInTheDocument();
    expect(await screen.findByText('合同审查')).toBeInTheDocument();
    expect(await screen.findByText('今日进展')).toBeInTheDocument();
    expect(await screen.findByText('测试债务人有限公司')).toBeInTheDocument();
    expect(await screen.findByText('首页')).toBeInTheDocument();
    expect(await screen.findByText('发起')).toBeInTheDocument();
    expect(await screen.findByText('案件')).toBeInTheDocument();
    expect((await screen.findAllByText('消息')).length).toBeGreaterThan(0);
    expect(await screen.findByText('我的')).toBeInTheDocument();
  });

  it('opens a typed new case page from a non-debt entry', async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.lists, [testCase]);

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '劳动争议' }));

    expect(await screen.findByText('发起劳动争议')).toBeInTheDocument();
    expect(await screen.findByLabelText('用人单位')).toBeInTheDocument();
    expect(window.location.search).toContain('caseType=labor_dispute');
  });

  it('submits typed case payload with caseType and privacyConsent', async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    await router.navigate({ to: '/cases/new', search: { caseType: 'lawyer_letter' } });
    vi.spyOn(apiModule, 'createLawCase').mockImplementation(async (input) => {
      createdCasePayload = input;
      return { ...testCase, ...input, id: 'case-created' };
    });

    render(<App />);

    await user.type(await screen.findByLabelText('收函方名称'), '上海某公司');
    await user.type(await screen.findByLabelText('对方联系人/主体'), '李经理');
    await user.type(await screen.findByLabelText('事项发生日期'), '2026-07-01');
    await user.click(screen.getByRole('button', { name: '下一步' }));

    await user.type(await screen.findByLabelText('联系人'), '王女士');
    await user.type(await screen.findByLabelText('联系电话'), '13800000000');
    await user.type(await screen.findByLabelText('所在地区'), '上海');
    await user.type(await screen.findByLabelText('你的身份'), '委托人');
    await user.click(screen.getByRole('button', { name: '下一步' }));

    await screen.findByText('争议描述');
    const textareas = screen.getAllByRole('textbox');
    await user.type(textareas[0], '对方一直拖延履约，需要正式发函催告。');
    await user.type(textareas[1], '希望要求对方限期履约并保留追责权利。');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: '下一步：上传证据' }));

    await waitFor(() =>
      expect(createdCasePayload).toMatchObject({
        caseType: 'lawyer_letter',
        privacyConsent: true,
        debtorName: '上海某公司',
        claimType: '付款催告'
      })
    );
  });

  it('renders login when no token exists', async () => {
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(await screen.findByRole('link', { name: '客户注册' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '律师入驻' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: '法灵 AI 品牌标识' })).toBeInTheDocument();
    expect(screen.queryByText('手机号验证码登录')).not.toBeInTheDocument();
    expect(screen.queryByText('登录后继续管理案件、证据、AI评估和服务方案。')).not.toBeInTheDocument();
    expect(screen.queryByText('9:41')).not.toBeInTheDocument();
    expect(screen.queryByText('5G')).not.toBeInTheDocument();
    expect(await screen.findByRole('img', { name: '法律服务安全协作插图' })).toBeInTheDocument();
    expect(screen.queryByText('客户演示')).not.toBeInTheDocument();
    expect(screen.queryByText('律师演示')).not.toBeInTheDocument();
  });

  it('submits password login and never persists the raw password', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: '密码登录' }));
    await user.type(screen.getByLabelText('手机号'), '13800001234');
    await user.type(screen.getByLabelText('密码'), 'ClientPass123!');
    await user.click(screen.getByRole('button', { name: '登录' }));

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    const fetchMock = vi.mocked(fetch);
    const passwordLoginCall = fetchMock.mock.calls.find(([input]) => (input instanceof Request ? input.url : input.toString()).endsWith('/api/v1/auth/login/password'));
    expect(passwordLoginCall).toBeTruthy();
    expect(passwordLoginPayload).toEqual({
      phone: '13800001234',
      password: 'ClientPass123!'
    });
    expect(window.localStorage.getItem('law-ai-auth')).not.toContain('ClientPass123!');
  });

  it('keeps client registration consent unchecked and required', async () => {
    const user = userEvent.setup();
    await router.navigate({ to: '/register/client' });

    render(<App />);

    expect(await screen.findByText('客户注册')).toBeInTheDocument();
    await user.type(screen.getByLabelText('姓名'), '王先生');
    await user.type(screen.getByLabelText('手机号'), '13800001234');
    await user.type(screen.getByLabelText('验证码'), '654321');
    await user.type(screen.getByLabelText('设置密码'), 'ClientPass123!');
    await user.type(screen.getByLabelText('确认密码'), 'ClientPass123!');

    const terms = screen.getByLabelText(/服务协议/);
    const privacy = screen.getByLabelText(/隐私政策/);
    const submit = screen.getByRole('button', { name: '完成注册' });
    expect(terms).not.toBeChecked();
    expect(privacy).not.toBeChecked();
    expect(submit).toBeDisabled();

    await user.click(terms);
    expect(submit).toBeDisabled();
    await user.click(privacy);
    expect(submit).toBeEnabled();
  });

  it('blocks client registration when password confirmation does not match', async () => {
    const user = userEvent.setup();
    await router.navigate({ to: '/register/client' });

    render(<App />);

    await user.type(await screen.findByLabelText('姓名'), '王先生');
    await user.type(screen.getByLabelText('手机号'), '13800001234');
    await user.type(screen.getByLabelText('验证码'), '654321');
    await user.type(screen.getByLabelText('设置密码'), 'ClientPass123!');
    await user.type(screen.getByLabelText('确认密码'), 'OtherPass123!');
    await user.click(screen.getByLabelText(/服务协议/));
    await user.click(screen.getByLabelText(/隐私政策/));
    await user.click(screen.getByRole('button', { name: '完成注册' }));

    expect(await screen.findByText('两次输入的密码不一致')).toBeInTheDocument();
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock.mock.calls.some(([input]) => (input instanceof Request ? input.url : input.toString()).endsWith('/api/v1/auth/register/client'))).toBe(false);
  });

  it('submits client registration password without confirmation', async () => {
    const user = userEvent.setup();
    await router.navigate({ to: '/register/client' });

    render(<App />);

    await user.type(await screen.findByLabelText('姓名'), '王先生');
    await user.type(screen.getByLabelText('手机号'), '13800001234');
    await user.type(screen.getByLabelText('验证码'), '654321');
    await user.type(screen.getByLabelText('设置密码'), 'ClientPass123!');
    await user.type(screen.getByLabelText('确认密码'), 'ClientPass123!');
    await user.click(screen.getByLabelText(/服务协议/));
    await user.click(screen.getByLabelText(/隐私政策/));
    await user.click(screen.getByRole('button', { name: '完成注册' }));

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    const fetchMock = vi.mocked(fetch);
    const registerCall = fetchMock.mock.calls.find(([input]) => (input instanceof Request ? input.url : input.toString()).endsWith('/api/v1/auth/register/client'));
    expect(registerCall).toBeTruthy();
    expect(clientRegisterPayload).toMatchObject({
      phone: '13800001234',
      password: 'ClientPass123!'
    });
    expect(clientRegisterPayload).not.toHaveProperty('confirmPassword');
  });

  it('renders registration pages with branded hero and touch-friendly legal links', async () => {
    await router.navigate({ to: '/register/lawyer' });

    render(<App />);

    expect(await screen.findByRole('img', { name: '法灵 AI 品牌标识' })).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: '法律服务安全协作插图' })).toBeInTheDocument();
    expect(await screen.findByText('律师入驻')).toBeInTheDocument();
    expect(await screen.findByText('律师入驻需提交真实执业身份，审核通过后才能接收待办和处理文书。')).toBeInTheDocument();

    const termsLink = await screen.findByRole('link', { name: '查看服务协议' });
    const privacyLink = await screen.findByRole('link', { name: '查看隐私政策' });
    expect(termsLink).toHaveClass('h-11');
    expect(privacyLink).toHaveClass('h-11');
  });

  it('opens registration legal links from explicit view actions', async () => {
    const user = userEvent.setup();
    await router.navigate({ to: '/register/client' });

    render(<App />);

    const terms = await screen.findByLabelText(/服务协议/);
    const privacy = await screen.findByLabelText(/隐私政策/);
    expect(await screen.findByRole('link', { name: '查看服务协议' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '查看隐私政策' })).toBeInTheDocument();
    expect(terms).not.toBeChecked();
    expect(privacy).not.toBeChecked();

    await user.click(screen.getByRole('link', { name: '查看服务协议' }));
    await waitFor(() => expect(window.location.pathname).toBe('/legal/terms'));
    expect(await screen.findByText('服务协议')).toBeInTheDocument();

    await router.navigate({ to: '/register/client' });
    expect(await screen.findByRole('link', { name: '查看隐私政策' })).toBeInTheDocument();
    expect(screen.getByLabelText(/服务协议/)).not.toBeChecked();
    expect(screen.getByLabelText(/隐私政策/)).not.toBeChecked();

    await user.click(screen.getByRole('link', { name: '查看隐私政策' }));
    await waitFor(() => expect(window.location.pathname).toBe('/legal/privacy'));
    expect(await screen.findByText('隐私政策')).toBeInTheDocument();
  });

  it('submits lawyer onboarding and routes pending lawyers to review status', async () => {
    const user = userEvent.setup();
    await router.navigate({ to: '/register/lawyer' });

    render(<App />);

    expect(await screen.findByText('律师入驻')).toBeInTheDocument();
    await user.type(screen.getByLabelText('姓名'), '赵律师');
    await user.type(screen.getByLabelText('手机号'), '13900008888');
    await user.type(screen.getByLabelText('验证码'), '654321');
    await user.type(screen.getByLabelText('设置密码'), 'LawyerPass123!');
    await user.type(screen.getByLabelText('确认密码'), 'LawyerPass123!');
    await user.type(screen.getByLabelText('律所'), '测试律师事务所');
    await user.type(screen.getByLabelText('执业证号'), '11101202010123456');
    await user.type(screen.getByLabelText('执业地区'), '上海');
    await user.type(screen.getByLabelText('擅长领域'), '合同纠纷,债务催收');
    await user.click(screen.getByLabelText(/服务协议/));
    await user.click(screen.getByLabelText(/隐私政策/));
    await user.click(screen.getByRole('button', { name: '提交入驻申请' }));

    await waitFor(() => expect(window.location.pathname).toBe('/lawyer/review-status'));
    expect(await screen.findByText('入驻审核中')).toBeInTheDocument();
  });

  it('shows rejected lawyer review reason', async () => {
    useAuthStore.getState().setSession({
      token: 'lawyer-rejected-token',
      user: rejectedLawyer,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, rejectedLawyer);
    await router.navigate({ to: '/lawyer/review-status' });

    render(<App />);

    expect(await screen.findByText('入驻未通过')).toBeInTheDocument();
    expect(await screen.findByText('执业证号无法核验')).toBeInTheDocument();
  });

  it('lets pending lawyers logout from review status', async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setSession({
      token: 'lawyer-pending-token',
      user: pendingLawyer,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, pendingLawyer);
    await router.navigate({ to: '/lawyer/review-status' });

    render(<App />);

    expect(await screen.findByText('入驻审核中')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '退出登录' }));

    await waitFor(() => expect(useAuthStore.getState().token).toBeNull());
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  it('renders admin navigation and user management actions', async () => {
    useAuthStore.getState().setSession({
      token: 'admin-token',
      user: testAdmin,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testAdmin);
    queryClient.setQueryData(caseKeys.adminUsers, [testAdmin, testUser, secondActiveUser, disabledUser, secondDisabledUser]);
    await router.navigate({ to: '/admin/users' });

    render(<App />);

    expect(await screen.findByText('用户管理')).toBeInTheDocument();
    expect(await screen.findByText('平台管理员')).toBeInTheDocument();
    expect(await screen.findByText('第二位用户')).toBeInTheDocument();
    expect(await screen.findByText('第二位禁用用户')).toBeInTheDocument();
    expect(await screen.findByRole('combobox', { name: '平台管理员角色' })).toHaveValue('admin');
    expect(await screen.findByRole('button', { name: '禁用平台管理员' })).toBeInTheDocument();
    expect(await screen.findAllByRole('combobox', { name: /角色/ })).toHaveLength(3);
    expect(await screen.findAllByRole('button', { name: /禁用/ })).toHaveLength(3);
    expect(await screen.findAllByRole('button', { name: '恢复账号' })).toHaveLength(2);
    expect(await screen.findByRole('link', { name: '管理' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '用户' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '律师' })).toBeInTheDocument();
  });

  it('lets admins explicitly promote users to admin from user management', async () => {
    const user = userEvent.setup();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    useAuthStore.getState().setSession({
      token: 'admin-token',
      user: testAdmin,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testAdmin);
    queryClient.setQueryData(caseKeys.adminUsers, [testAdmin, testUser, secondActiveUser, disabledUser, secondDisabledUser]);
    await router.navigate({ to: '/admin/users' });

    render(<App />);

    await user.selectOptions(await screen.findByRole('combobox', { name: '第二位用户角色' }), 'admin');

    await waitFor(() => expect(adminUpdatePayload).toEqual({ role: 'admin' }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: caseKeys.adminOverview });
  });

  it('refreshes admin overview after lawyer reviews', async () => {
    const user = userEvent.setup();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    useAuthStore.getState().setSession({
      token: 'admin-token',
      user: testAdmin,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testAdmin);
    queryClient.setQueryData(caseKeys.adminLawyers, [pendingLawyer, rejectedLawyer]);
    await router.navigate({ to: '/admin/lawyers' });

    render(<App />);

    const approveButtons = await screen.findAllByRole('button', { name: '通过' });
    await user.click(approveButtons[0]);

    await waitFor(() => expect(adminReviewPayload).toEqual({ status: 'approved' }));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: caseKeys.adminOverview });
  });

  it('only shows lawyer review actions for pending applications', async () => {
    useAuthStore.getState().setSession({
      token: 'admin-token',
      user: testAdmin,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testAdmin);
    queryClient.setQueryData(caseKeys.adminLawyers, [pendingLawyer, testLawyer, rejectedLawyer]);
    await router.navigate({ to: '/admin/lawyers' });

    render(<App />);

    expect(await screen.findByText('律师审核')).toBeInTheDocument();
    expect(await screen.findByText(/已通过/)).toBeInTheDocument();
    expect(await screen.findByText(/已拒绝/)).toBeInTheDocument();
    expect(await screen.findAllByRole('button', { name: '通过' })).toHaveLength(1);
    expect(await screen.findAllByRole('button', { name: '拒绝' })).toHaveLength(1);
  });

  it('redirects clients away from admin and lawyer route shells', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    await router.navigate({ to: '/admin/lawyers' as never });

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByText('律师审核')).not.toBeInTheDocument();

    await router.navigate({ to: '/lawyer' });
    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByText('律师工作台')).not.toBeInTheDocument();
  });

  it('redirects admins away from client workflow route shells', async () => {
    useAuthStore.getState().setSession({
      token: 'admin-token',
      user: testAdmin,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testAdmin);
    await router.navigate({ to: '/cases/new' });

    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/admin'));
    expect(screen.queryByText('发起追偿')).not.toBeInTheDocument();
  });

  it('shows unread message count in the bottom navigation', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.messages, [testMessage]);

    render(<App />);

    expect(await screen.findByLabelText('消息，1 条未读')).toBeInTheDocument();
  });

  it('renders admin case operations page from admin navigation', async () => {
    useAuthStore.getState().setSession({
      token: 'admin-token',
      user: testAdmin,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testAdmin);
    await router.navigate({ to: '/admin/cases' as never });

    render(<App />);

    expect(await screen.findByText('案件运营')).toBeInTheDocument();
    expect(await screen.findByText('测试债务人有限公司')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '案件' })).toBeInTheDocument();
  });

  it('renders built-in legal document pages', async () => {
    await router.navigate({ to: '/legal/terms' });
    render(<App />);

    expect(await screen.findByText('服务协议')).toBeInTheDocument();
    await router.navigate({ to: '/legal/privacy' });
    expect(await screen.findByText('隐私政策')).toBeInTheDocument();
    await router.navigate({ to: '/legal/case-authorization' });
    expect(await screen.findByText('案件资料授权书')).toBeInTheDocument();
  });

  it('clears local session when backend reports a disabled account', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.endsWith('/api/v1/me')) {
          return jsonResponse({ detail: 'ACCOUNT_DISABLED' }, 403);
        }
        if (url.endsWith('/api/v1/cases')) {
          return jsonResponse({ cases: [] });
        }
        return jsonResponse({});
      })
    );
    useAuthStore.getState().setSession({
      token: 'disabled-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });

    render(<App />);

    await waitFor(() => expect(useAuthStore.getState().token).toBeNull());
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
  });

  it('renders assessment result and plan entry', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), assessedCase);
    await router.navigate({ to: '/cases/$caseId/assessment', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('案件胜率参考')).toBeInTheDocument();
    expect(await screen.findByText('78%')).toBeInTheDocument();
    expect(await screen.findByText('选择服务方案')).toBeInTheDocument();
    expect(await screen.findByText('法灵平台保障')).toBeInTheDocument();
  });

  it('hides the plan entry after a service plan is selected', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), { ...assessedCase, selectedPlan: 'self-service' });
    await router.navigate({ to: '/cases/$caseId/assessment', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('案件胜率参考')).toBeInTheDocument();
    expect(await screen.findByText('已选择服务方案')).toBeInTheDocument();
    expect(screen.queryByText('选择服务方案')).not.toBeInTheDocument();
  });

  it('shows missing required evidence before an assessment is treated as complete', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), missingEvidenceCase);
    await router.navigate({ to: '/cases/$caseId/assessment', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('关键材料缺失，已生成初步评估')).toBeInTheDocument();
    expect(screen.queryByText('证据已上传，AI评估完成')).not.toBeInTheDocument();
  });

  it('blocks assessment until required evidence is uploaded', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), { ...missingEvidenceCase, assessment: undefined });
    await router.navigate({ to: '/cases/$caseId/assessment', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('必传材料未补齐')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '请先补齐必传材料' })).toBeDisabled();
    expect(await screen.findByText('去补充证据')).toBeInTheDocument();
  });

  it('disables evidence flow generation when required materials are missing', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), missingEvidenceCase);
    await router.navigate({ to: '/cases/$caseId/evidence', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('还需补充必传材料')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '请先补齐必传材料' })).toBeDisabled();
  });

  it('renders duplicate evidence insights without React key warnings', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), {
      ...testCase,
      evidence: testCase.evidence.map((category) => ({
        ...category,
        insight: '已识别关键信息'
      }))
    });
    await router.navigate({ to: '/cases/$caseId/evidence', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('AI初步识别')).toBeInTheDocument();
    await waitFor(() => {
      const duplicateKeyCalls = errorSpy.mock.calls.filter((call) =>
        String(call[0]).includes('Encountered two children with the same key')
      );
      expect(duplicateKeyCalls).toHaveLength(0);
    });
    errorSpy.mockRestore();
  });

  it('renders service plan cards', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), assessedCase);
    await router.navigate({ to: '/cases/$caseId/plans', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('选择案件闭环路径')).toBeInTheDocument();
    expect(await screen.findByText('律师复核包')).toBeInTheDocument();
    expect((await screen.findAllByText('选择此方案')).length).toBeGreaterThan(0);
  });

  it('confirms service plan selection before committing it', async () => {
    const user = userEvent.setup();
    const selectSpy = vi.spyOn(apiModule, 'selectCasePlan').mockResolvedValue({ ...assessedCase, selectedPlan: 'lawyer-review' });
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), assessedCase);
    await router.navigate({ to: '/cases/$caseId/plans', params: { caseId: 'case-test' } });

    render(<App />);

    await user.click(await screen.findByRole('button', { name: /选择律师复核包.*1499/ }));
    expect(selectSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('确认选择服务方案')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: '确认选择' }));

    await waitFor(() => expect(selectSpy).toHaveBeenCalledWith('case-test', 'lawyer-review'));
  });

  it('highlights the pending service plan action before confirmation', async () => {
    const user = userEvent.setup();
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), assessedCase);
    await router.navigate({ to: '/cases/$caseId/plans', params: { caseId: 'case-test' } });

    render(<App />);

    const selfServiceButton = await screen.findByRole('button', { name: /选择AI自助版.*399/ });
    expect(selfServiceButton).toHaveClass('bg-slate-100');

    await user.click(selfServiceButton);

    expect(await screen.findByText('确认选择服务方案')).toBeInTheDocument();
    expect(selfServiceButton).toHaveClass('bg-blue-600');
    expect(selfServiceButton).toHaveClass('text-white');
  });

  it('locks service plan buttons after a plan is selected', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), lockedPlanCase);
    await router.navigate({ to: '/cases/$caseId/plans', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByRole('button', { name: /已选择律师复核包.*1499/ })).toBeDisabled();
    expect(await screen.findByRole('button', { name: /选择AI自助版.*399/ })).toBeDisabled();
  });

  it('renders message center from backend notifications', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.messages, [testMessage]);
    await router.navigate({ to: '/messages' });

    render(<App />);

    expect((await screen.findAllByText('消息')).length).toBeGreaterThan(0);
    expect(await screen.findByText('律师复核已受理')).toBeInTheDocument();
    expect(await screen.findByText('系统已生成律师复核待办，律师将查看材料并反馈补证或处理建议。')).toBeInTheDocument();
  });

  it('renders lawyer task workspace for lawyer role', async () => {
    useAuthStore.getState().setSession({
      token: 'lawyer-token',
      user: testLawyer,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testLawyer);
    queryClient.setQueryData(caseKeys.lawyerTasks, [lawyerTask]);
    await router.navigate({ to: '/lawyer' });

    render(<App />);

    expect(await screen.findByText('律师工作台')).toBeInTheDocument();
    expect(await screen.findByText('待处理 1')).toBeInTheDocument();
    expect(await screen.findByText('律师复核待办')).toBeInTheDocument();
  });

  it('renders role-aware profile return action for lawyers', async () => {
    useAuthStore.getState().setSession({
      token: 'lawyer-token',
      user: testLawyer,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testLawyer);
    queryClient.setQueryData(caseKeys.lists, []);
    await router.navigate({ to: '/me' });

    render(<App />);

    const returnLink = await screen.findByRole('link', { name: '返回律师工作台' });
    expect(returnLink).toHaveAttribute('href', '/lawyer');
    expect(returnLink).not.toHaveClass('bg-slate-950');
    expect(screen.queryByRole('link', { name: '返回案件列表' })).not.toBeInTheDocument();
  });

  it('requests lawyer case documents through lawyer endpoint', async () => {
    const getSpy = vi.spyOn(apiModule.api, 'get').mockReturnValue({
      json: async () => ({ documents: [lawyerDocument] })
    } as ReturnType<typeof apiModule.api.get>);

    const documents = await apiModule.getLawyerCaseDocuments('case-test');

    expect(documents).toEqual([lawyerDocument]);
    expect(getSpy).toHaveBeenCalledWith('/api/v1/lawyer/cases/case-test/documents');
    expect(getSpy).not.toHaveBeenCalledWith('/api/v1/cases/case-test/documents');
  });

  it('opens uploaded evidence files from lawyer task workspace', async () => {
    const user = userEvent.setup();
    const createObjectURL = vi.fn(() => 'blob:contract');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const previewWindow = { closed: false, close: vi.fn(), location: { href: '' } } as unknown as Window;
    vi.spyOn(window, 'open').mockReturnValue(previewWindow);
    const getSpy = vi.spyOn(apiModule.api, 'get').mockImplementation((url) => {
      const path = String(url);
      if (path.endsWith('/lawyer/cases/case-test/evidence/contract/files/file-contract')) {
        return { blob: async () => new Blob(['pdf bytes'], { type: 'application/pdf' }) } as ReturnType<typeof apiModule.api.get>;
      }
      if (path.endsWith('/lawyer/cases/case-test/documents')) {
        return { json: async () => ({ documents: [] }) } as ReturnType<typeof apiModule.api.get>;
      }
      if (path.endsWith('/lawyer/tasks/task-review')) {
        return { json: async () => ({ task: lawyerTask, case: assessedCase }) } as ReturnType<typeof apiModule.api.get>;
      }
      return { json: async () => ({}) } as ReturnType<typeof apiModule.api.get>;
    });
    useAuthStore.getState().setSession({
      token: 'lawyer-token',
      user: testLawyer,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testLawyer);
    queryClient.setQueryData(caseKeys.lawyerTask('task-review'), { task: lawyerTask, case: assessedCase });
    queryClient.setQueryData(caseKeys.lawyerDocuments('case-test'), []);
    await router.navigate({ to: '/lawyer/tasks/$taskId', params: { taskId: 'task-review' } });

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '合同.pdf' }));

    await waitFor(() =>
      expect(getSpy).toHaveBeenCalledWith('/api/v1/lawyer/cases/case-test/evidence/contract/files/file-contract')
    );
    expect(createObjectURL).toHaveBeenCalled();
    expect(previewWindow.location.href).toBe('blob:contract');
  });

  it('disables lawyer document actions after submitting to client', async () => {
    useAuthStore.getState().setSession({
      token: 'lawyer-token',
      user: testLawyer,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testLawyer);
    queryClient.setQueryData(caseKeys.lawyerDocuments('case-test'), [pendingLawyerDocument]);
    await router.navigate({
      to: '/lawyer/cases/$caseId/documents/$documentId',
      params: { caseId: 'case-test', documentId: 'doc-lawyer-letter' }
    });

    render(<App />);

    expect(await screen.findByRole('button', { name: '保存文书' })).toBeDisabled();
    expect(await screen.findByRole('button', { name: '归档' })).toBeDisabled();
    expect(await screen.findByRole('button', { name: '提交用户' })).toBeDisabled();
  });

  it('requires structured lawyer document fields before saving or submitting', async () => {
    const user = userEvent.setup();
    const updateSpy = vi.spyOn(apiModule, 'updateLawyerDocument');
    const submitSpy = vi.spyOn(apiModule, 'submitLawyerDocument');
    useAuthStore.getState().setSession({
      token: 'lawyer-token',
      user: testLawyer,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testLawyer);
    queryClient.setQueryData(caseKeys.lawyerDocuments('case-test'), [
      { ...lawyerDocument, fields: { recipient: '', request: '', deadline: '' } }
    ]);
    await router.navigate({
      to: '/lawyer/cases/$caseId/documents/$documentId',
      params: { caseId: 'case-test', documentId: 'doc-lawyer-letter' }
    });

    render(<App />);

    await user.click(await screen.findByRole('button', { name: '保存文书' }));
    expect(await screen.findByText('请先填写收件人 / 对方当事人、请求事项 / 审查目标、履行期限 / 交付期限。')).toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: '提交用户' }));
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('renders archived lawyer documents as read-only with Chinese status', async () => {
    useAuthStore.getState().setSession({
      token: 'lawyer-token',
      user: testLawyer,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testLawyer);
    queryClient.setQueryData(caseKeys.lawyerDocuments('case-test'), [archivedLawyerDocument]);
    await router.navigate({
      to: '/lawyer/cases/$caseId/documents/$documentId',
      params: { caseId: 'case-test', documentId: 'doc-lawyer-letter' }
    });

    render(<App />);

    expect(await screen.findByText('已归档')).toBeInTheDocument();
    expect(await screen.findByLabelText('标题')).toBeDisabled();
    expect(await screen.findByLabelText('收件人 / 对方当事人')).toBeDisabled();
    expect(await screen.findByLabelText('请求事项 / 审查目标')).toBeDisabled();
    expect(await screen.findByLabelText('履行期限 / 交付期限')).toBeDisabled();
    expect(await screen.findByLabelText('正文')).toBeDisabled();
    expect(await screen.findByRole('button', { name: '保存文书' })).toBeDisabled();
  });

  it('renders case progress quick actions', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), assessedCase);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('案件进度')).toBeInTheDocument();
    expect(await screen.findByText('最新进展')).toBeInTheDocument();
    expect(await screen.findByText('补充证据')).toBeInTheDocument();
    expect(await screen.findByText('联系顾问')).toBeInTheDocument();
    expect(await screen.findByText('选择服务方案')).toBeInTheDocument();
  });

  it('renders self-service action package and AI generated document read-only', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), selfServiceCase);
    queryClient.setQueryData(caseKeys.workItems('case-test'), selfServiceWorkItems);
    queryClient.setQueryData(caseKeys.documents('case-test'), [selfServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });

    render(<App />);

    expect((await screen.findAllByText('AI自助处理包')).length).toBeGreaterThan(0);
    expect(await screen.findByText('处理中')).toBeInTheDocument();
    expect(await screen.findByText('待处理')).toBeInTheDocument();
    expect((await screen.findAllByText('AI自助处理包'))[0].parentElement).toHaveTextContent('进行中');
    expect((await screen.findByText('协商调解')).parentElement).not.toHaveTextContent('进行中');
    expect(await screen.findByRole('button', { name: '复制催告文案' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '下载模板' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '下一步：我已自行发送/使用' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '已付款/已完成' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '无回应/拒绝' })).not.toBeInTheDocument();
    expect(await screen.findByText('付款催告函（AI 自助模板）')).toBeInTheDocument();
    expect(await screen.findByText('文书预览')).toBeInTheDocument();
    expect(await screen.findByText('发函主体与相对方')).toBeInTheDocument();
    expect(await screen.findByText('法律依据')).toBeInTheDocument();
    expect(await screen.findByText(/以下为通用合同\/金钱债务条款/)).toBeInTheDocument();
    expect(await screen.findByText(/《中华人民共和国民法典》第五百七十七条/)).toBeInTheDocument();
    expect(screen.queryByText(/《中华人民共和国民法典》第六百七十五条/)).not.toBeInTheDocument();
    expect(screen.queryByText(/《中华人民共和国民法典》第六百七十六条/)).not.toBeInTheDocument();
    expect(await screen.findByText(/借款合同专门条款需在确认存在借款法律关系后再适用/)).toBeInTheDocument();
    expect(await screen.findByText('送达与留痕建议')).toBeInTheDocument();
    expect(await screen.findByText('AI生成')).toBeInTheDocument();
    expect(await screen.findByText(/自行催告 → 记录回应 → 准备材料或升级人工/)).toBeInTheDocument();
    expect(screen.queryByText(/律师函催告 → 协商调解 → 立案追偿/)).not.toBeInTheDocument();
    expect(screen.queryByText(/律师函发送需经律师复核确认/)).not.toBeInTheDocument();
    expect(screen.queryByText(/催收函/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认文书并进入下一阶段' })).not.toBeInTheDocument();
    expect(await screen.findByText('399 自助版不代发、不代理、不出具正式律师函；正式律师函、调解或代办服务需升级人工服务。')).toBeInTheDocument();
  });

  it('upgrades stale self-service document summaries into formal payment demand previews', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), selfServiceCase);
    queryClient.setQueryData(caseKeys.workItems('case-test'), selfServiceWorkItems);
    queryClient.setQueryData(caseKeys.documents('case-test'), [staleSelfServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('付款催告函（AI 自助模板）')).toBeInTheDocument();
    expect(await screen.findByText('旧版补全')).toBeInTheDocument();
    expect(await screen.findByText('法律依据')).toBeInTheDocument();
    expect(await screen.findByText(/以下为通用合同\/金钱债务条款/)).toBeInTheDocument();
    expect(await screen.findByText(/《中华人民共和国民法典》第五百七十七条/)).toBeInTheDocument();
    expect(await screen.findByText(/《中华人民共和国民法典》第五百八十三条/)).toBeInTheDocument();
    expect(screen.queryByText(/《中华人民共和国民法典》第六百七十五条/)).not.toBeInTheDocument();
    expect(screen.queryByText(/《中华人民共和国民法典》第六百七十六条/)).not.toBeInTheDocument();
    expect(await screen.findByText('送达与留痕建议')).toBeInTheDocument();
    expect(await screen.findByText(/建议通过微信、短信、电子邮件或 EMS\/顺丰等可查询物流的快递方式自行发送/)).toBeInTheDocument();
    expect(screen.queryByText(/催收函/)).not.toBeInTheDocument();
    expect(screen.queryByText(/律师函催告 → 协商调解 → 立案追偿/)).not.toBeInTheDocument();
  });

  it.each(nonDebtLegacySelfServiceFixtures)('upgrades stale $caseId self-service previews with case-specific legal basis', async ({ caseId, lawCase, workItems, document, expectedTitle, expectedHeading, expectedLaw, forbiddenText }) => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail(caseId), lawCase);
    queryClient.setQueryData(caseKeys.workItems(caseId), workItems);
    queryClient.setQueryData(caseKeys.documents(caseId), [document]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId } });

    render(<App />);

    expect(await screen.findByText(expectedTitle)).toBeInTheDocument();
    expect(await screen.findByText(expectedHeading)).toBeInTheDocument();
    expect(await screen.findByText(expectedLaw)).toBeInTheDocument();
    expect(await screen.findByText('旧版补全')).toBeInTheDocument();
    expect(screen.queryByText('付款催告函（AI 自助模板）')).not.toBeInTheDocument();
    expect(screen.queryByText(forbiddenText)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复制催告文案' })).not.toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '复制模板内容' })).toBeInTheDocument();
  });

  it('normalizes stale self-service stages to one active next action', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), selfServiceEscalationCase);
    queryClient.setQueryData(caseKeys.workItems('case-test'), selfServiceWorkItems);
    queryClient.setQueryData(caseKeys.documents('case-test'), [selfServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });

    render(<App />);

    expect((await screen.findByText('立案材料准备')).parentElement).toHaveTextContent('进行中');
    expect((await screen.findByText('协商调解')).parentElement).not.toHaveTextContent('进行中');
    expect(screen.getAllByText('进行中')).toHaveLength(1);
    expect(await screen.findByRole('button', { name: '升级人工服务' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '已付款/已完成' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复制催告文案' })).not.toBeInTheDocument();
  });

  it('shows upgraded self-service cases as handed off instead of repeatable actions', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), selfServiceUpgradedCase);
    queryClient.setQueryData(caseKeys.workItems('case-test'), selfServiceWorkItems);
    queryClient.setQueryData(caseKeys.documents('case-test'), [selfServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });

    render(<App />);

    expect((await screen.findAllByText('已申请升级人工服务')).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/399 自助处理已交接/)).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: '升级人工服务' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '已付款/已完成' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '无回应/拒绝' })).not.toBeInTheDocument();
  });

  it('closes completed self-service cases without next-step document hints or primary evidence actions', async () => {
    const completedCase = {
      ...selfServiceCase,
      status: '已完成自助处理',
      stages: [
        ...selfServiceCase.stages.map((stage) => ({
          ...stage,
          status: 'done',
          at: stage.at ?? '2026-06-05'
        })),
        {
          key: 'filing',
          title: '立案材料准备',
          description: '自助处理已完成，无需继续准备立案材料',
          status: 'done',
          at: '2026-06-05'
        },
        {
          key: 'recovery',
          title: '回款 / 结案',
          description: '已确认回款或自助处理完成',
          status: 'done',
          at: '2026-06-05'
        }
      ]
    };
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), completedCase);
    queryClient.setQueryData(caseKeys.workItems('case-test'), selfServiceWorkItems);
    queryClient.setQueryData(caseKeys.documents('case-test'), [selfServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('自助处理已完成')).toBeInTheDocument();
    expect(await screen.findByText('处理记录')).toBeInTheDocument();
    expect(screen.queryByText('下一步建议见 AI 自助任务摘要')).not.toBeInTheDocument();
    expect(screen.queryByText('补充证据')).not.toBeInTheDocument();
    expect(await screen.findByText('补充留存材料')).toBeInTheDocument();
    expect(await screen.findByText('查看处理记录')).toBeInTheDocument();
  });

  it('records self-service action from the case detail panel', async () => {
    const updatedCase = {
      ...selfServiceCase,
      status: '已自行处理，等待对方回应'
    };
    const recordSpy = vi
      .spyOn(apiModule as unknown as { recordSelfServiceAction: (caseId: string, input: unknown) => Promise<typeof updatedCase> }, 'recordSelfServiceAction')
      .mockResolvedValue(updatedCase);
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), selfServiceCase);
    queryClient.setQueryData(caseKeys.workItems('case-test'), selfServiceWorkItems);
    queryClient.setQueryData(caseKeys.documents('case-test'), [selfServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '下一步：我已自行发送/使用' }));

    await waitFor(() => {
      expect(recordSpy).toHaveBeenCalledWith('case-test', {
        action: 'mark_sent',
        channel: '自行发送',
        note: '用户确认已自行发送或使用 AI 自助材料'
      });
    });
  });

  it('renders lawyer finalized document delivery actions for 1499 cases', async () => {
    const updatedCase = {
      ...approvedLawyerServiceCase,
      status: '已记录自行发送，等待对方回应'
    };
    const recordSpy = vi
      .spyOn(apiModule as unknown as { recordLawyerServiceAction: (caseId: string, input: unknown) => Promise<typeof updatedCase> }, 'recordLawyerServiceAction')
      .mockResolvedValue(updatedCase);
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), approvedLawyerServiceCase);
    queryClient.setQueryData(caseKeys.workItems('case-test'), [lawyerTask]);
    queryClient.setQueryData(caseKeys.documents('case-test'), [approvedLawyerServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('律师定稿文书')).toBeInTheDocument();
    expect(await screen.findByText('客户自行发送，不是平台代发或律师代发；发送后请保留送达和沟通凭证。')).toBeInTheDocument();
    expect(await screen.findByText('正式催款律师函')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /补充送达\/沟通凭证/ })).toHaveAttribute('href', '/cases/case-test/evidence');

    await userEvent.click(await screen.findByRole('button', { name: '我已自行发送' }));

    await waitFor(() => {
      expect(recordSpy).toHaveBeenCalledWith('case-test', {
        action: 'mark_sent',
        channel: '自行发送',
        note: '客户确认已自行发送律师定稿文书'
      });
    });
  });

  it('copies and downloads the lawyer finalized document for 1499 cases', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    });
    const clickSpy = vi.fn();
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:lawyer-letter'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName) as HTMLElement;
      if (tagName === 'a') {
        Object.defineProperty(element, 'click', { value: clickSpy });
      }
      return element;
    });
    const recordSpy = vi
      .spyOn(apiModule as unknown as { recordLawyerServiceAction: (caseId: string, input: unknown) => Promise<typeof approvedLawyerServiceCase> }, 'recordLawyerServiceAction')
      .mockResolvedValue(approvedLawyerServiceCase);
    const fetchMock = vi.mocked(fetch);
    const defaultFetch = fetchMock.getMockImplementation();
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/v1/cases/case-test/documents')) {
        return jsonResponse({ documents: [approvedLawyerServiceDocument] });
      }
      if (url.endsWith('/api/v1/cases/case-test')) {
        return jsonResponse({ case: approvedLawyerServiceCase });
      }
      return defaultFetch?.(input, init) ?? jsonResponse({});
    });
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), approvedLawyerServiceCase);
    queryClient.setQueryData(caseKeys.workItems('case-test'), [lawyerTask]);
    queryClient.setQueryData(caseKeys.documents('case-test'), [approvedLawyerServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '下载定稿文书' }));
    await userEvent.click(await screen.findByRole('button', { name: '复制定稿文书' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('请贵司收到本函后三日内支付全部欠款及逾期损失。'));
      expect(recordSpy).toHaveBeenCalledWith('case-test', {
        action: 'copy_document',
        note: '客户已复制律师定稿文书'
      });
      expect(recordSpy).toHaveBeenCalledWith('case-test', {
        action: 'download_document',
        note: '客户已下载律师定稿文书'
      });
    });
    expect(appendSpy).toHaveBeenCalled();
    expect(removeSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('records opponent response from the 1499 negotiation follow-up panel', async () => {
    const waitingCase = {
      ...approvedLawyerServiceCase,
      status: '已记录自行发送，等待对方回应',
      stages: approvedLawyerServiceCase.stages.map((stage) => {
        if (stage.key === 'letter') return { ...stage, status: 'done', at: '2026-06-04' };
        if (stage.key === 'negotiation') return { ...stage, status: 'active', description: '等待对方回应' };
        return stage;
      })
    };
    const recordSpy = vi
      .spyOn(apiModule as unknown as { recordLawyerServiceAction: (caseId: string, input: unknown) => Promise<typeof waitingCase> }, 'recordLawyerServiceAction')
      .mockResolvedValue(waitingCase);
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), waitingCase);
    queryClient.setQueryData(caseKeys.workItems('case-test'), [lawyerTask]);
    queryClient.setQueryData(caseKeys.documents('case-test'), [approvedLawyerServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('发送与回应跟进')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '无回应/拒绝' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: '请律师继续跟进' })).toBeInTheDocument();

    await userEvent.click(await screen.findByRole('button', { name: '承诺付款/协商中' }));

    await waitFor(() => {
      expect(recordSpy).toHaveBeenCalledWith('case-test', {
        action: 'record_response',
        response: 'promised',
        note: '客户记录对方承诺付款或要求继续协商'
      });
    });
  });

  it('copies the self-service template and records copy success only after clipboard succeeds', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    });
    const recordSpy = vi
      .spyOn(apiModule as unknown as { recordSelfServiceAction: (caseId: string, input: unknown) => Promise<typeof contractReviewSelfServiceCase> }, 'recordSelfServiceAction')
      .mockResolvedValue(contractReviewSelfServiceCase);
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-contract-review'), contractReviewSelfServiceCase);
    queryClient.setQueryData(caseKeys.workItems('case-contract-review'), contractReviewSelfServiceWorkItems);
    queryClient.setQueryData(caseKeys.documents('case-contract-review'), [contractReviewSelfServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-contract-review' } });

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '复制模板内容' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('合同审查意见'));
      expect(recordSpy).toHaveBeenCalledWith('case-contract-review', {
        action: 'copy_template',
        note: '用户已复制 AI 自助模板'
      });
    });
    expect(await screen.findByText('模板内容已复制，请按当前业务场景自行核对后使用。')).toBeInTheDocument();
  });

  it('opens a manual copy sheet without recording copy success when browser copy is blocked', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard blocked'));
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true
    });
    Object.defineProperty(document, 'execCommand', {
      value: undefined,
      configurable: true
    });
    const recordSpy = vi
      .spyOn(apiModule as unknown as { recordSelfServiceAction: (caseId: string, input: unknown) => Promise<typeof contractReviewSelfServiceCase> }, 'recordSelfServiceAction')
      .mockResolvedValue(contractReviewSelfServiceCase);
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-contract-review'), contractReviewSelfServiceCase);
    queryClient.setQueryData(caseKeys.workItems('case-contract-review'), contractReviewSelfServiceWorkItems);
    queryClient.setQueryData(caseKeys.documents('case-contract-review'), [contractReviewSelfServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-contract-review' } });

    render(<App />);

    await userEvent.click(await screen.findByRole('button', { name: '复制模板内容' }));

    const dialog = await screen.findByRole('dialog', { name: '合同审查意见（AI 自助模板）' });
    expect(within(dialog).getByText('手动复制模板')).toBeInTheDocument();
    expect(within(dialog).getByText('合同审查意见（AI 自助模板）')).toBeInTheDocument();
    const textArea = within(dialog).getByRole('textbox', { name: '合同审查意见（AI 自助模板）全文' });
    expect((textArea as HTMLTextAreaElement).value).toContain('风险条款');
    expect(within(dialog).getByRole('button', { name: '下载 TXT' })).toBeEnabled();
    expect(recordSpy).not.toHaveBeenCalledWith('case-contract-review', {
      action: 'copy_template',
      note: '用户已复制 AI 自助模板'
    });
  });

  it('downloads the self-service template as a mounted txt link', async () => {
    const clickSpy = vi.fn();
    vi.spyOn(apiModule as unknown as { recordSelfServiceAction: (caseId: string, input: unknown) => Promise<typeof selfServiceCase> }, 'recordSelfServiceAction')
      .mockResolvedValue(selfServiceCase);
    const appendSpy = vi.spyOn(document.body, 'appendChild');
    const removeSpy = vi.spyOn(document.body, 'removeChild');
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:test-template'), configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true });
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      const element = document.createElementNS('http://www.w3.org/1999/xhtml', tagName) as HTMLElement;
      if (tagName === 'a') {
        Object.defineProperty(element, 'click', { value: clickSpy });
      }
      return element as HTMLElementTagNameMap[keyof HTMLElementTagNameMap];
    });
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), selfServiceCase);
    queryClient.setQueryData(caseKeys.workItems('case-test'), selfServiceWorkItems);
    queryClient.setQueryData(caseKeys.documents('case-test'), [selfServiceDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });
    render(<App />);
    appendSpy.mockClear();
    removeSpy.mockClear();

    await userEvent.click(await screen.findByRole('button', { name: '下载模板' }));

    expect(appendSpy).toHaveBeenCalledWith(expect.objectContaining({
      download: '付款催告函（AI 自助模板）.txt',
      href: 'blob:test-template'
    }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(removeSpy).toHaveBeenCalled();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-template');
  });

  it('keeps self-service controls out of lawyer-review and full-service cases', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.detail('case-test'), lockedPlanCase);
    queryClient.setQueryData(caseKeys.workItems('case-test'), [lawyerTask]);
    queryClient.setQueryData(caseKeys.documents('case-test'), [pendingLawyerDocument]);
    await router.navigate({ to: '/cases/$caseId', params: { caseId: 'case-test' } });

    render(<App />);

    expect(await screen.findByText('律师服务闭环')).toBeInTheDocument();
    expect(await screen.findByText('发送律师函')).toBeInTheDocument();
    expect(await screen.findByText('确认文书并进入下一阶段')).toBeInTheDocument();
    expect(screen.queryByText('399 自助闭环')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '复制催告文案' })).not.toBeInTheDocument();
    expect(screen.queryByText('399 自助版不代发、不代理、不出具正式律师函；正式律师函、调解或代办服务需升级人工服务。')).not.toBeInTheDocument();
  });
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
