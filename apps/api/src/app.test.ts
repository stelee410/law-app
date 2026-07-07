import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from './app.js';

const app = createApp();

describe('law AI API', () => {
  async function login() {
    const codeResponse = await request(app).post('/api/auth/request-code').send({ phone: '13800001234' });
    expect(codeResponse.status).toBe(200);
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({ phone: '13800001234', code: codeResponse.body.mockCode });
    expect(loginResponse.status).toBe(200);
    return loginResponse.body.token as string;
  }

  it('returns no cases before the user creates one', async () => {
    const token = await login();
    const response = await request(app).get('/api/cases').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.cases).toHaveLength(0);
  });

  it('creates, evaluates, and selects a plan', async () => {
    const token = await login();
    const created = await request(app)
      .post('/api/cases')
      .set('Authorization', `Bearer ${token}`)
      .send({
        debtorName: '北京YY贸易有限公司',
        contactName: '李女士',
        contactPhone: '13900001111',
        amount: 52300,
        contractDate: '2024-05-02',
        dispute: '对方确认收货后长期拖欠尾款，已有多次书面催收记录。',
        dueStatus: '已到期'
      });

    expect(created.status).toBe(201);
    const caseId = created.body.case.id;

    const evaluated = await request(app).post(`/api/cases/${caseId}/evaluate`).set('Authorization', `Bearer ${token}`);
    expect(evaluated.status).toBe(200);
    expect(evaluated.body.case.assessment.winRate).toBeGreaterThanOrEqual(60);

    const selected = await request(app)
      .post(`/api/cases/${caseId}/plan`)
      .set('Authorization', `Bearer ${token}`)
      .send({ planId: 'lawyer-review' });
    expect(selected.status).toBe(200);
    expect(selected.body.case.selectedPlan).toBe('lawyer-review');
  });
});
