import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import multer from 'multer';
import { z } from 'zod';
import {
  addEvidence,
  createCase,
  evaluateCase,
  getCase,
  getUserByToken,
  listCases,
  loginWithCode,
  requestLoginCode,
  selectPlan
} from './store.js';
import type { PlanId, User } from './types.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024
  }
});

const createCaseSchema = z.object({
  debtorName: z.string().min(2),
  contactName: z.string().min(2),
  contactPhone: z.string().min(6),
  amount: z.coerce.number().positive(),
  contractDate: z.string().min(8),
  dispute: z.string().min(10),
  dueStatus: z.enum(['已到期', '部分到期', '不确定'])
});

const planSchema = z.object({
  planId: z.enum(['self-service', 'lawyer-review', 'full-service'])
});

const phoneSchema = z.object({
  phone: z.string().min(6)
});

const loginSchema = phoneSchema.extend({
  code: z.string().min(4)
});

type AuthedRequest = Request & { user: User };
type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'law-ai-api', storage: process.env.DATABASE_URL ? 'postgres' : 'memory' });
  });

  app.post('/api/auth/request-code', asyncHandler(async (req, res) => {
    const parsed = phoneSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_PHONE' });
      return;
    }

    const otp = await requestLoginCode(parsed.data.phone);
    res.json({ phone: otp.phone, expiresAt: otp.expiresAt, mockCode: otp.code });
  }));

  app.post('/api/auth/login', asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_LOGIN' });
      return;
    }

    const session = await loginWithCode(parsed.data.phone, parsed.data.code);
    if (!session) {
      res.status(401).json({ error: 'INVALID_CODE' });
      return;
    }

    res.json(session);
  }));

  app.get('/api/me', requireAuth, (req, res) => {
    res.json({ user: (req as AuthedRequest).user });
  });

  app.get('/api/cases', requireAuth, asyncHandler(async (req, res) => {
    res.json({ cases: await listCases((req as AuthedRequest).user.id) });
  }));

  app.post('/api/cases', requireAuth, asyncHandler(async (req, res) => {
    const parsed = createCaseSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_CASE', details: parsed.error.flatten() });
      return;
    }
    res.status(201).json({ case: await createCase((req as AuthedRequest).user.id, parsed.data) });
  }));

  app.get('/api/cases/:caseId', requireAuth, asyncHandler(async (req, res) => {
    const lawCase = await getCase((req as AuthedRequest).user.id, req.params.caseId);
    if (!lawCase) {
      res.status(404).json({ error: 'CASE_NOT_FOUND' });
      return;
    }
    res.json({ case: lawCase });
  }));

  app.post('/api/cases/:caseId/evidence/:categoryId', requireAuth, upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'FILE_REQUIRED' });
      return;
    }
    const lawCase = await addEvidence((req as AuthedRequest).user.id, req.params.caseId, req.params.categoryId, {
      name: req.file.originalname,
      size: req.file.size,
      mimeType: req.file.mimetype
    });
    if (!lawCase) {
      res.status(404).json({ error: 'CASE_OR_CATEGORY_NOT_FOUND' });
      return;
    }
    res.json({ case: lawCase });
  }));

  app.post('/api/cases/:caseId/evaluate', requireAuth, asyncHandler(async (req, res) => {
    const lawCase = await evaluateCase((req as AuthedRequest).user.id, req.params.caseId);
    if (!lawCase) {
      res.status(404).json({ error: 'CASE_NOT_FOUND' });
      return;
    }
    res.json({ case: lawCase });
  }));

  app.post('/api/cases/:caseId/plan', requireAuth, asyncHandler(async (req, res) => {
    const parsed = planSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_PLAN' });
      return;
    }
    const lawCase = await selectPlan((req as AuthedRequest).user.id, req.params.caseId, parsed.data.planId as PlanId);
    if (!lawCase) {
      res.status(404).json({ error: 'CASE_OR_PLAN_NOT_FOUND' });
      return;
    }
    res.json({ case: lawCase });
  }));

  app.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error(error);
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });

  return app;
}

function asyncHandler(handler: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  void (async () => {
    const authHeader = req.header('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
    if (!token) {
      res.status(401).json({ error: 'AUTH_REQUIRED' });
      return;
    }

    const user = await getUserByToken(token);
    if (!user) {
      res.status(401).json({ error: 'INVALID_TOKEN' });
      return;
    }

    (req as AuthedRequest).user = user;
    next();
  })().catch(next);
}
