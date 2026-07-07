import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createEvidence } from './data.js';
import { assessCase } from './ai.js';
import type { AuthSession, EvidenceFile, LawCase, PlanId, User } from './types.js';

export type CreateCaseInput = Pick<
  LawCase,
  'debtorName' | 'contactName' | 'contactPhone' | 'amount' | 'contractDate' | 'dispute' | 'dueStatus'
>;

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
const usePostgres = Boolean(databaseUrl);
const pool = usePostgres ? new Pool({ connectionString: databaseUrl }) : null;
const mockOtpCode = process.env.MOCK_OTP_CODE || '123456';
const memoryUsers = new Map<string, User>();
const memoryOtps = new Map<string, { code: string; expiresAt: string }>();
const memorySessions = new Map<string, { userId: string; expiresAt: string }>();
const memoryCases: LawCase[] = [];

type CaseRow = {
  id: string;
  user_id: string;
  debtor_name: string;
  contact_name: string;
  contact_phone: string;
  amount: string | number;
  contract_date: string;
  dispute: string;
  due_status: LawCase['dueStatus'];
  status: string;
  created_at: Date | string;
  case_no: string;
  selected_plan: PlanId | null;
  evidence: LawCase['evidence'];
  assessment: LawCase['assessment'] | null;
  stages: LawCase['stages'];
};

export async function initStore(): Promise<void> {
  if (!pool) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS otp_codes (
      phone TEXT PRIMARY KEY,
      code TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS cases (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      debtor_name TEXT NOT NULL,
      contact_name TEXT NOT NULL,
      contact_phone TEXT NOT NULL,
      amount NUMERIC(14, 2) NOT NULL,
      contract_date TEXT NOT NULL,
      dispute TEXT NOT NULL,
      due_status TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL,
      case_no TEXT NOT NULL,
      selected_plan TEXT,
      evidence JSONB NOT NULL,
      assessment JSONB,
      stages JSONB NOT NULL
    );
  `);
}

export async function requestLoginCode(phone: string): Promise<{ phone: string; code: string; expiresAt: string }> {
  const normalizedPhone = normalizePhone(phone);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  if (!pool) {
    memoryOtps.set(normalizedPhone, { code: mockOtpCode, expiresAt });
    return { phone: normalizedPhone, code: mockOtpCode, expiresAt };
  }

  await pool.query(
    `INSERT INTO otp_codes (phone, code, expires_at)
     VALUES ($1, $2, $3)
     ON CONFLICT (phone) DO UPDATE SET code = EXCLUDED.code, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
    [normalizedPhone, mockOtpCode, expiresAt]
  );

  return { phone: normalizedPhone, code: mockOtpCode, expiresAt };
}

export async function loginWithCode(phone: string, code: string): Promise<AuthSession | undefined> {
  const normalizedPhone = normalizePhone(phone);
  const validCode = await getValidOtp(normalizedPhone);
  if (validCode !== code) return undefined;

  const user = await getOrCreateUser(normalizedPhone);
  const token = `local_${randomUUID().replaceAll('-', '')}`;
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  if (!pool) {
    memorySessions.set(hashToken(token), { userId: user.id, expiresAt });
    return { token, user, expiresAt };
  }

  await pool.query(
    `INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)`,
    [hashToken(token), user.id, expiresAt]
  );

  return { token, user, expiresAt };
}

export async function getUserByToken(token: string): Promise<User | undefined> {
  const tokenHash = hashToken(token);

  if (!pool) {
    const session = memorySessions.get(tokenHash);
    if (!session || new Date(session.expiresAt).getTime() < Date.now()) return undefined;
    return [...memoryUsers.values()].find((user) => user.id === session.userId);
  }

  const result = await pool.query(
    `SELECT users.id, users.phone, users.name, users.created_at
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = $1 AND sessions.expires_at > NOW()`,
    [tokenHash]
  );
  return result.rows[0] ? mapUser(result.rows[0]) : undefined;
}

export async function listCases(userId: string): Promise<LawCase[]> {
  if (!pool) {
    return memoryCases.filter((item) => item.userId === userId);
  }

  const result = await pool.query(`SELECT * FROM cases WHERE user_id = $1 ORDER BY created_at DESC`, [userId]);
  return result.rows.map(mapCase);
}

export async function getCase(userId: string, id: string): Promise<LawCase | undefined> {
  if (!pool) {
    return memoryCases.find((item) => item.userId === userId && item.id === id);
  }

  const result = await pool.query(`SELECT * FROM cases WHERE user_id = $1 AND id = $2`, [userId, id]);
  return result.rows[0] ? mapCase(result.rows[0]) : undefined;
}

export async function createCase(userId: string, input: CreateCaseInput): Promise<LawCase> {
  const id = `case-${randomUUID().slice(0, 8)}`;
  const createdAt = new Date().toISOString();
  const lawCase: LawCase = {
    id,
    userId,
    ...input,
    status: '待补充证据',
    createdAt,
    caseNo: `AL${new Date().toISOString().slice(0, 10).replaceAll('-', '')}${Math.floor(Math.random() * 9000 + 1000)}`,
    evidence: createEvidence(),
    stages: [
      { key: 'submit', title: '提交信息', description: '已提交案件信息', status: 'done', at: formatDateTime(createdAt) },
      { key: 'evidence', title: '上传证据', description: '等待上传关键证据', status: 'active' },
      { key: 'review', title: '律师复核', description: '律师将复核证据与案情', status: 'todo' },
      { key: 'letter', title: '发送律师函', description: '生成并发送律师函', status: 'todo' },
      { key: 'negotiation', title: '协商调解', description: '跟进对方回应', status: 'todo' },
      { key: 'filing', title: '立案材料准备', description: '调解未果将进入立案准备阶段', status: 'todo' },
      { key: 'recovery', title: '回款 / 结案', description: '回款完成或法院判决后结案', status: 'todo' }
    ]
  };

  await upsertCase(lawCase);
  return lawCase;
}

export async function addEvidence(userId: string, caseId: string, categoryId: string, file: Omit<EvidenceFile, 'id' | 'uploadedAt'>): Promise<LawCase | undefined> {
  const lawCase = await getCase(userId, caseId);
  const category = lawCase?.evidence.find((item) => item.id === categoryId);
  if (!lawCase || !category) return undefined;

  category.files.push({
    id: `file-${randomUUID().slice(0, 8)}`,
    uploadedAt: new Date().toISOString(),
    ...file
  });
  category.status = 'recognized';
  category.insight = '已识别关键信息';
  lawCase.status = 'AI评估中';
  const evidenceStage = lawCase.stages.find((stage) => stage.key === 'evidence');
  if (evidenceStage) {
    evidenceStage.status = 'done';
    evidenceStage.at = formatDateTime(new Date().toISOString());
    evidenceStage.description = `已上传 ${lawCase.evidence.reduce((total, item) => total + item.files.length, 0)} 份证据`;
  }
  await upsertCase(lawCase);
  return lawCase;
}

export async function evaluateCase(userId: string, caseId: string): Promise<LawCase | undefined> {
  const lawCase = await getCase(userId, caseId);
  if (!lawCase) return undefined;
  lawCase.assessment = assessCase(lawCase);
  lawCase.status = '待选择方案';
  await upsertCase(lawCase);
  return lawCase;
}

export async function selectPlan(userId: string, caseId: string, planId: PlanId): Promise<LawCase | undefined> {
  const lawCase = await getCase(userId, caseId);
  if (!lawCase || !lawCase.assessment?.plans.some((plan) => plan.id === planId)) return undefined;
  lawCase.selectedPlan = planId;
  lawCase.status = planId === 'self-service' ? '文书生成中' : '律师复核中';
  const reviewStage = lawCase.stages.find((stage) => stage.key === 'review');
  if (reviewStage) {
    reviewStage.status = 'active';
    reviewStage.description = lawCase.status;
  }
  await upsertCase(lawCase);
  return lawCase;
}

async function getValidOtp(phone: string): Promise<string | undefined> {
  if (!pool) {
    const record = memoryOtps.get(phone);
    if (!record || new Date(record.expiresAt).getTime() < Date.now()) return undefined;
    return record.code;
  }

  const result = await pool.query(`SELECT code FROM otp_codes WHERE phone = $1 AND expires_at > NOW()`, [phone]);
  return result.rows[0]?.code;
}

async function getOrCreateUser(phone: string): Promise<User> {
  if (!pool) {
    const existing = memoryUsers.get(phone);
    if (existing) return existing;
    const user: User = { id: `user-${randomUUID().slice(0, 8)}`, phone, name: maskPhone(phone), createdAt: new Date().toISOString() };
    memoryUsers.set(phone, user);
    return user;
  }

  const existing = await pool.query(`SELECT id, phone, name, created_at FROM users WHERE phone = $1`, [phone]);
  if (existing.rows[0]) return mapUser(existing.rows[0]);

  const user: User = { id: `user-${randomUUID().slice(0, 8)}`, phone, name: maskPhone(phone), createdAt: new Date().toISOString() };
  await pool.query(`INSERT INTO users (id, phone, name, created_at) VALUES ($1, $2, $3, $4)`, [
    user.id,
    user.phone,
    user.name,
    user.createdAt
  ]);
  return user;
}

async function upsertCase(lawCase: LawCase): Promise<void> {
  if (!pool) {
    const index = memoryCases.findIndex((item) => item.id === lawCase.id);
    if (index >= 0) {
      memoryCases[index] = cloneCase(lawCase);
    } else {
      memoryCases.unshift(cloneCase(lawCase));
    }
    return;
  }

  await pool.query(
    `INSERT INTO cases (
       id, user_id, debtor_name, contact_name, contact_phone, amount, contract_date,
       dispute, due_status, status, created_at, case_no, selected_plan, evidence, assessment, stages
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (id) DO UPDATE SET
       debtor_name = EXCLUDED.debtor_name,
       contact_name = EXCLUDED.contact_name,
       contact_phone = EXCLUDED.contact_phone,
       amount = EXCLUDED.amount,
       contract_date = EXCLUDED.contract_date,
       dispute = EXCLUDED.dispute,
       due_status = EXCLUDED.due_status,
       status = EXCLUDED.status,
       selected_plan = EXCLUDED.selected_plan,
       evidence = EXCLUDED.evidence,
       assessment = EXCLUDED.assessment,
       stages = EXCLUDED.stages`,
    [
      lawCase.id,
      lawCase.userId,
      lawCase.debtorName,
      lawCase.contactName,
      lawCase.contactPhone,
      lawCase.amount,
      lawCase.contractDate,
      lawCase.dispute,
      lawCase.dueStatus,
      lawCase.status,
      lawCase.createdAt,
      lawCase.caseNo,
      lawCase.selectedPlan ?? null,
      JSON.stringify(lawCase.evidence),
      lawCase.assessment ? JSON.stringify(lawCase.assessment) : null,
      JSON.stringify(lawCase.stages)
    ]
  );
}

function mapCase(row: CaseRow): LawCase {
  return {
    id: row.id,
    userId: row.user_id,
    debtorName: row.debtor_name,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    amount: Number(row.amount),
    contractDate: row.contract_date,
    dispute: row.dispute,
    dueStatus: row.due_status,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    caseNo: row.case_no,
    selectedPlan: row.selected_plan ?? undefined,
    evidence: row.evidence,
    assessment: row.assessment ?? undefined,
    stages: row.stages
  };
}

function mapUser(row: { id: string; phone: string; name: string; created_at: Date | string }): User {
  return {
    id: row.id,
    phone: row.phone,
    name: row.name,
    createdAt: new Date(row.created_at).toISOString()
  };
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

function maskPhone(phone: string): string {
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function cloneCase(lawCase: LawCase): LawCase {
  return JSON.parse(JSON.stringify(lawCase)) as LawCase;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Shanghai'
  })
    .format(new Date(value))
    .replace(/\//g, '-');
}
