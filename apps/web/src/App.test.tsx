import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import App from './App';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            user: { id: 'user-test', phone: '13800001234', name: '测试用户', createdAt: '2026-06-29T00:00:00.000Z' }
          })
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          cases: [
            {
              id: 'case-test',
              debtorName: '测试债务人有限公司',
              contactName: '张先生',
              contactPhone: '138 0000 1234',
              amount: 86500,
              contractDate: '2024-01-15',
              dispute: '对方未按合同约定支付尾款。',
              dueStatus: '已到期',
              status: '协商中',
              createdAt: '2026-06-01T02:21:00.000Z',
              caseNo: 'AL2024060100123',
              evidence: [],
              stages: []
            }
          ]
        })
      });
    })
  );
});

describe('App', () => {
  it('renders the legal AI home screen', async () => {
    localStorage.setItem('law-ai-token', 'test-token');
    render(<App />);
    expect(await screen.findByText('AI帮你追回应收账款')).toBeInTheDocument();
    expect(await screen.findByText('测试债务人有限公司')).toBeInTheDocument();
  });

  it('renders login when no token exists', async () => {
    render(<App />);
    expect(await screen.findByText('手机号验证码登录')).toBeInTheDocument();
  });
});
