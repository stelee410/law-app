import { cleanup, render, screen, waitFor } from '@testing-library/react';
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
        id: 'lawyer-review',
        name: '律师复核包',
        subtitle: '平衡效率和专业度',
        price: 1499,
        fee: '固定费 + 成功费 5%',
        features: ['律师复核证据', '发函催告'],
        recommended: true
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
  assessment: {
    ...assessedCase.assessment,
    plans: [
      ...assessedCase.assessment.plans,
      {
        id: 'self-service',
        name: 'AI 自助包',
        subtitle: '轻量自动引导',
        price: 299,
        fee: '固定费',
        features: ['AI 补证提示', '材料草稿生成']
      }
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

const archivedLawyerDocument = {
  ...lawyerDocument,
  status: 'archived',
  title: 'Archived lawyer letter'
};

const selfServiceCase = {
  ...assessedCase,
  selectedPlan: 'self-service',
  status: 'AI自助处理完成：已生成催收函草稿与追偿行动建议',
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
      title: '发送律师函',
      description: 'AI已生成催收函草稿，可参考草稿发送催告',
      status: 'done',
      at: '2026-06-03'
    },
    {
      key: 'negotiation',
      title: '协商调解',
      description: '跟进对方回应，保留送达、沟通和履行记录',
      status: 'active'
    }
  ]
};

const selfServiceWorkItems = [
  {
    id: 'task-ai-guidance',
    caseId: 'case-test',
    kind: 'ai_guidance',
    status: 'completed',
    title: 'AI自助任务',
    summary: '已生成《致测试债务人有限公司的催收函（AI草稿）》；下一步：查看催收函草稿。'
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
  title: '致测试债务人有限公司的催收函（AI草稿）',
  fields: {
    source: 'ai_self_service',
    generatedAt: '2026-06-03T00:00:00.000Z'
  },
  body: '一、案件信息\n二、AI 处理建议\n本文书由人工智能（AI）生成，供参考使用。',
  version: 1,
  createdBy: 'user-test',
  updatedBy: 'user-test',
  createdAt: '2026-06-03T00:00:00.000Z',
  updatedAt: '2026-06-03T00:00:00.000Z'
};

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

beforeEach(() => {
  window.history.pushState({}, '', '/');
  localStorage.clear();
  queryClient.clear();
  useAuthStore.setState({ token: null, user: null, expiresAt: null });
  createdCasePayload = undefined;
  adminUpdatePayload = undefined;
  adminReviewPayload = undefined;
  window.scrollTo = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      const method = input instanceof Request ? input.method : init?.method;
      if (url.endsWith('/api/v1/auth/request-code')) {
        return Promise.resolve(jsonResponse({ phone: '13800001234', mockCode: '654321', expiresAt: '2026-07-30T00:00:00.000Z' }));
      }
      if (url.endsWith('/api/v1/auth/register/client')) {
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

    expect(await screen.findByText('AI帮你追回应收账款')).toBeInTheDocument();
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

  it('keeps client registration consent unchecked and required', async () => {
    const user = userEvent.setup();
    await router.navigate({ to: '/register/client' });

    render(<App />);

    expect(await screen.findByText('客户注册')).toBeInTheDocument();
    await user.type(screen.getByLabelText('姓名'), '王先生');
    await user.type(screen.getByLabelText('手机号'), '13800001234');
    await user.type(screen.getByLabelText('验证码'), '654321');

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
    expect(await screen.findByText('选择此方案')).toBeInTheDocument();
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

    await user.click(await screen.findByRole('button', { name: '选择此方案' }));
    expect(selectSpy).not.toHaveBeenCalled();
    expect(await screen.findByText('确认选择服务方案')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: '确认选择' }));

    await waitFor(() => expect(selectSpy).toHaveBeenCalledWith('case-test', 'lawyer-review'));
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

    expect(await screen.findByRole('button', { name: '已选择' })).toBeDisabled();
    expect(await screen.findByRole('button', { name: '选择此方案' })).toBeDisabled();
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

  it('renders self-service result tasks and AI generated document read-only', async () => {
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

    expect(await screen.findByText('AI自助处理结果')).toBeInTheDocument();
    expect(await screen.findByText('已完成')).toBeInTheDocument();
    expect(await screen.findByText('待处理')).toBeInTheDocument();
    expect(screen.queryByText('处理中')).not.toBeInTheDocument();
    expect((await screen.findByText('发送律师函')).parentElement).not.toHaveTextContent('进行中');
    expect((await screen.findByText('协商调解')).parentElement).toHaveTextContent('进行中');
    expect(await screen.findByText('致测试债务人有限公司的催收函（AI草稿）')).toBeInTheDocument();
    expect(await screen.findByText('AI生成')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认文书并进入下一阶段' })).not.toBeInTheDocument();
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
