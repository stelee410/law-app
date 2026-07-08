import { cleanup, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { caseKeys } from './hooks/useCaseQueries';
import { queryClient } from './lib/queryClient';
import { router } from './router';
import { useAuthStore } from './state/authStore';

const testUser = {
  id: 'user-test',
  phone: '13800001234',
  name: '测试用户',
  createdAt: '2026-06-29T00:00:00.000Z'
};

const testCase = {
  id: 'case-test',
  debtorName: '测试债务人有限公司',
  contactName: '张先生',
  contactPhone: '13800001234',
  amount: 86500,
  contractDate: '2024-01-15',
  dispute: '对方未按合同约定支付尾款，已经多次催收。',
  dueStatus: '已到期',
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

beforeEach(() => {
  window.history.pushState({}, '', '/');
  localStorage.clear();
  queryClient.clear();
  useAuthStore.setState({ token: null, user: null, expiresAt: null });
  window.scrollTo = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.endsWith('/api/v1/me')) {
        return Promise.resolve(jsonResponse({ user: testUser }));
      }
      if (url.endsWith('/api/v1/cases')) {
        return Promise.resolve(jsonResponse({ cases: [testCase] }));
      }
      if (url.endsWith('/api/v1/cases/case-test')) {
        return Promise.resolve(jsonResponse({ case: assessedCase }));
      }
      return Promise.resolve(jsonResponse({}));
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
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
    expect(await screen.findByText('欠款追偿')).toBeInTheDocument();
    expect(await screen.findByText('今日进展')).toBeInTheDocument();
    expect(await screen.findByText('测试债务人有限公司')).toBeInTheDocument();
    expect(await screen.findByText('首页')).toBeInTheDocument();
    expect(await screen.findByText('发起')).toBeInTheDocument();
    expect(await screen.findByText('案件')).toBeInTheDocument();
    expect((await screen.findAllByText('消息')).length).toBeGreaterThan(0);
    expect(await screen.findByText('我的')).toBeInTheDocument();
  });

  it('renders login when no token exists', async () => {
    render(<App />);

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(await screen.findByText('手机号验证码登录')).toBeInTheDocument();
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

  it('renders message center from case state', async () => {
    useAuthStore.getState().setSession({
      token: 'test-token',
      user: testUser,
      expiresAt: '2026-07-30T00:00:00.000Z'
    });
    queryClient.setQueryData(caseKeys.me, testUser);
    queryClient.setQueryData(caseKeys.lists, [assessedCase]);
    await router.navigate({ to: '/messages' });

    render(<App />);

    expect((await screen.findAllByText('消息')).length).toBeGreaterThan(0);
    expect(await screen.findByText('AI评估结果已更新')).toBeInTheDocument();
    expect(await screen.findByText('平台服务通知')).toBeInTheDocument();
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

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json'
    }
  });
}
