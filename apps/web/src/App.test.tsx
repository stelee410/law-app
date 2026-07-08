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
      status: 'pending',
      required: true,
      files: [],
      insight: '等待上传和识别'
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

beforeEach(() => {
  window.history.pushState({}, '', '/');
  localStorage.clear();
  queryClient.clear();
  useAuthStore.setState({ token: null, user: null, expiresAt: null });
  createdCasePayload = undefined;
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
      if (url.endsWith('/api/v1/admin/users')) {
        return Promise.resolve(jsonResponse({ users: [testAdmin, testUser, secondActiveUser, disabledUser, secondDisabledUser] }));
      }
      if (url.endsWith('/api/v1/admin/lawyers')) {
        return Promise.resolve(jsonResponse({ lawyers: [pendingLawyer, rejectedLawyer] }));
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
    expect(await screen.findByText('手机号验证码登录')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '客户注册' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: '律师入驻' })).toBeInTheDocument();
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
    expect(await screen.findAllByRole('button', { name: '调整角色' })).toHaveLength(2);
    expect(await screen.findAllByRole('button', { name: '禁用账号' })).toHaveLength(2);
    expect(await screen.findAllByRole('button', { name: '恢复账号' })).toHaveLength(2);
    expect(await screen.findByText('管理')).toBeInTheDocument();
    expect(await screen.findByText('用户')).toBeInTheDocument();
    expect(await screen.findByText('律师')).toBeInTheDocument();
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
    expect(await screen.findByText('查看下一步建议')).toBeInTheDocument();
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
