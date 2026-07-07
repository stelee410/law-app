import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BadgeCheck,
  Banknote,
  Bot,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardCheck,
  CloudUpload,
  Contact,
  FileCheck2,
  FileSearch,
  Folder,
  Headphones,
  Home,
  Image,
  Mail,
  MessageCircle,
  MoreHorizontal,
  Phone,
  Plus,
  Scale,
  Search,
  Send,
  ShieldCheck,
  User as UserIcon,
  WalletCards
} from 'lucide-react';
import type { ComponentType } from 'react';
import {
  clearAuthToken,
  createLawCase,
  evaluateCase,
  getAuthToken,
  getCases,
  getMe,
  loginWithCode,
  requestLoginCode,
  selectPlan as selectCasePlan,
  uploadEvidence
} from './api';
import type { CaseInput, EvidenceCategory, LawCase, PlanId, User as AppUser } from './types';

type Screen = 'home' | 'create' | 'upload' | 'assessment' | 'cases' | 'progress' | 'messages' | 'me';
type NavTab = 'home' | 'start' | 'cases' | 'messages' | 'me';

const defaultInput: CaseInput = {
  debtorName: '',
  contactName: '',
  contactPhone: '',
  amount: 0,
  contractDate: '',
  dispute: '',
  dueStatus: '已到期'
};

const categoryIcons: Record<string, ComponentType<{ size?: number }>> = {
  contract: FileCheck2,
  invoice: ClipboardCheck,
  chat: MessageCircle,
  transfer: Send,
  delivery: Folder,
  other: BadgeCheck
};

const featureItems = [
  { label: '欠款追偿', icon: Banknote, tone: 'blue' },
  { label: '律师函', icon: FileCheck2, tone: 'teal' },
  { label: '劳动争议', icon: Contact, tone: 'orange' },
  { label: '租赁纠纷', icon: Home, tone: 'violet' },
  { label: '合同审查', icon: FileSearch, tone: 'blue' }
];

function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [cases, setCases] = useState<LawCase[]>([]);
  const [activeCase, setActiveCase] = useState<LawCase | null>(null);
  const [form, setForm] = useState<CaseInput>(defaultInput);
  const [selectedCategory, setSelectedCategory] = useState('contract');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [bootstrapping, setBootstrapping] = useState(true);
  const [user, setUser] = useState<AppUser | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!getAuthToken()) {
      setBootstrapping(false);
      return;
    }

    void (async () => {
      try {
        const currentUser = await getMe();
        setUser(currentUser);
        await loadCases();
      } catch {
        clearAuthToken();
        setUser(null);
      } finally {
        setBootstrapping(false);
      }
    })();
  }, []);

  const currentCase = activeCase ?? cases[0];
  const totalRecovered = useMemo(() => cases.reduce((sum, item) => sum + Math.round(item.amount * 0.62), 0), [cases]);
  const canSubmitCase =
    form.debtorName.trim().length >= 2 &&
    form.contactName.trim().length >= 2 &&
    form.contactPhone.trim().length >= 6 &&
    form.amount > 0 &&
    form.contractDate.trim().length >= 8 &&
    form.dispute.trim().length >= 10;

  async function loadCases() {
    const items = await getCases();
    setCases(items);
    setActiveCase(items[0] ?? null);
  }

  async function handleLogin(phone: string, code: string) {
    setBusy(true);
    setError('');
    try {
      const session = await loginWithCode(phone, code);
      setUser(session.user);
      await loadCases();
      setScreen('home');
    } catch {
      setError('验证码不正确或已过期，请重新获取');
    } finally {
      setBusy(false);
    }
  }

  async function handleRequestCode(phone: string) {
    setBusy(true);
    setError('');
    try {
      return await requestLoginCode(phone);
    } catch {
      setError('验证码发送失败，请稍后再试');
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function submitCase() {
    setBusy(true);
    setError('');
    try {
      const created = await createLawCase(form);
      setActiveCase(created);
      setCases((items) => [created, ...items]);
      setScreen('upload');
    } catch {
      setError('案件信息校验失败，请补充完整后重试');
    } finally {
      setBusy(false);
    }
  }

  async function handleUpload(file: File) {
    if (!currentCase) return;
    setBusy(true);
    setError('');
    try {
      const updated = await uploadEvidence(currentCase.id, selectedCategory, file);
      updateCurrentCase(updated);
    } catch {
      setError('上传失败，请检查文件大小是否超过 50MB');
    } finally {
      setBusy(false);
    }
  }

  async function generateAssessment() {
    if (!currentCase) return;
    setBusy(true);
    setError('');
    try {
      const updated = await evaluateCase(currentCase.id);
      updateCurrentCase(updated);
      setScreen('assessment');
    } catch {
      setError('AI评估生成失败，请稍后再试');
    } finally {
      setBusy(false);
    }
  }

  async function choosePlan(planId: PlanId) {
    if (!currentCase) return;
    setBusy(true);
    try {
      const updated = await selectCasePlan(currentCase.id, planId);
      updateCurrentCase(updated);
      setScreen('progress');
    } finally {
      setBusy(false);
    }
  }

  function updateCurrentCase(updated: LawCase) {
    setActiveCase(updated);
    setCases((items) => items.map((item) => (item.id === updated.id ? updated : item)));
  }

  function navigate(tab: NavTab) {
    if (tab === 'home') setScreen('home');
    if (tab === 'start') setScreen('create');
    if (tab === 'cases') setScreen('cases');
    if (tab === 'messages') setScreen('messages');
    if (tab === 'me') setScreen('me');
  }

  function logout() {
    clearAuthToken();
    setUser(null);
    setCases([]);
    setActiveCase(null);
    setScreen('home');
  }

  const activeTab: NavTab =
    screen === 'home'
      ? 'home'
      : screen === 'create' || screen === 'upload' || screen === 'assessment'
        ? 'start'
        : screen === 'messages'
          ? 'messages'
          : screen === 'me'
            ? 'me'
            : 'cases';

  return (
    <main className="app-stage">
      <section className="phone-shell" aria-label="法灵 AI 法务应用">
        <StatusBar />
        {error && <div className="toast">{error}</div>}
        {!user && !bootstrapping && (
          <LoginScreen busy={busy} onLogin={handleLogin} onRequestCode={handleRequestCode} />
        )}
        {bootstrapping && (
          <div className="screen loading-screen">
            <BotAvatar />
            <strong>正在恢复登录状态</strong>
          </div>
        )}
        {user && screen === 'home' && (
          <HomeScreen
            user={user}
            cases={cases}
            totalRecovered={totalRecovered}
            onStart={() => setScreen('create')}
            onOpenCase={(item) => {
              setActiveCase(item);
              setScreen('progress');
            }}
          />
        )}
        {user && screen === 'create' && (
          <CreateScreen
            form={form}
            busy={busy}
            onBack={() => setScreen('home')}
            onChange={setForm}
            onSubmit={submitCase}
            canSubmit={canSubmitCase}
          />
        )}
        {user && screen === 'upload' && currentCase && (
          <UploadScreen
            lawCase={currentCase}
            busy={busy}
            selectedCategory={selectedCategory}
            onBack={() => setScreen('create')}
            onCategory={setSelectedCategory}
            onPickFile={() => fileInputRef.current?.click()}
            onEvaluate={generateAssessment}
          />
        )}
        {user && screen === 'assessment' && currentCase?.assessment && (
          <AssessmentScreen
            lawCase={currentCase}
            busy={busy}
            onBack={() => setScreen('upload')}
            onChoosePlan={choosePlan}
          />
        )}
        {user && screen === 'cases' && (
          <CasesScreen
            cases={cases}
            onBack={() => setScreen('home')}
            onStart={() => setScreen('create')}
            onOpenCase={(item) => {
              setActiveCase(item);
              setScreen('progress');
            }}
          />
        )}
        {user && screen === 'progress' && currentCase && (
          <ProgressScreen lawCase={currentCase} onBack={() => setScreen('cases')} onUpload={() => setScreen('upload')} />
        )}
        {user && screen === 'messages' && (
          <MessagesScreen cases={cases} onBack={() => setScreen('home')} onOpenCases={() => setScreen('cases')} />
        )}
        {user && screen === 'me' && (
          <MeScreen user={user} cases={cases} onBack={() => setScreen('home')} onLogout={logout} />
        )}
        <input
          ref={fileInputRef}
          type="file"
          className="visually-hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleUpload(file);
            event.currentTarget.value = '';
          }}
        />
        {user && (
          <BottomNav active={activeTab} onNavigate={navigate} />
        )}
      </section>
    </main>
  );
}

function StatusBar() {
  return (
    <div className="status-bar" aria-hidden="true">
      <span>9:41</span>
      <div className="status-pill" />
      <div className="status-icons">
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

function TopBar({ title, right, onBack }: { title: string; right?: React.ReactNode; onBack: () => void }) {
  return (
    <header className="top-bar">
      <button className="icon-button" type="button" onClick={onBack} aria-label="返回">
        <ArrowLeft size={24} />
      </button>
      <h1>{title}</h1>
      <div className="top-right">{right}</div>
    </header>
  );
}

function LoginScreen({
  busy,
  onLogin,
  onRequestCode
}: {
  busy: boolean;
  onLogin: (phone: string, code: string) => Promise<void>;
  onRequestCode: (phone: string) => Promise<{ mockCode: string } | undefined>;
}) {
  const [phone, setPhone] = useState('13800001234');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);

  async function sendCode() {
    const response = await onRequestCode(phone);
    if (response) {
      setCode(response.mockCode);
      setSent(true);
    }
  }

  return (
    <div className="screen login-screen">
      <section className="login-brand">
        <div className="brand-row">
          <strong>法灵</strong>
          <span>AI法务</span>
        </div>
        <h1>手机号验证码登录</h1>
        <p>登录后你的案件、证据和追偿进度将持久保存</p>
      </section>
      <section className="login-card">
        <BotAvatar />
        <label>
          <span><Phone size={18} />手机号</span>
          <input value={phone} inputMode="tel" onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label>
          <span><ShieldCheck size={18} />验证码</span>
          <div className="code-row">
            <input value={code} inputMode="numeric" placeholder="请输入验证码" onChange={(event) => setCode(event.target.value)} />
            <button className="outline-button" type="button" disabled={busy} onClick={sendCode}>
              {sent ? '重新获取' : '获取验证码'}
            </button>
          </div>
        </label>
        <button className="primary-button wide" type="button" disabled={busy || phone.length < 6 || code.length < 4} onClick={() => void onLogin(phone, code)}>
          登录并进入 <ChevronRight size={20} />
        </button>
      </section>
      <section className="login-note">
        <ShieldCheck size={18} />
        <div>
          <strong>本地开发验证码服务为 mock</strong>
          <p>点击获取验证码后会自动填入测试码 123456</p>
        </div>
      </section>
    </div>
  );
}

function HomeScreen({
  user,
  cases,
  totalRecovered,
  onStart,
  onOpenCase
}: {
  user: AppUser;
  cases: LawCase[];
  totalRecovered: number;
  onStart: () => void;
  onOpenCase: (item: LawCase) => void;
}) {
  return (
    <div className="screen home-screen">
      <header className="brand-header">
        <div>
          <div className="brand-row">
            <strong>法灵</strong>
            <span>AI法务</span>
          </div>
          <h1>你好，{user.name}</h1>
          <p>专注AI法律服务，让维权更简单</p>
        </div>
        <div className="header-actions">
          <Search size={26} />
          <MessageCircle size={26} />
        </div>
      </header>

      <section className="hero-card">
        <div className="hero-copy">
          <h2>AI帮你追回应收账款</h2>
          <p><Check size={16} />智能分析证据，高效追款</p>
          <p><Check size={16} />律师函在线生成，一键发送</p>
          <p><Check size={16} />全程进度跟踪，回款更有保障</p>
          <button className="primary-button compact" type="button" onClick={onStart}>
            立即发起 <ChevronRight size={18} />
          </button>
        </div>
        <LegalHeroArt />
      </section>

      <section className="feature-strip">
        {featureItems.map((item) => (
          <button className="feature-button" key={item.label} type="button" onClick={item.label === '欠款追偿' ? onStart : undefined}>
            <span className={`feature-icon ${item.tone}`}>
              <item.icon size={26} />
            </span>
            <span>{item.label}</span>
          </button>
        ))}
      </section>

      <section className="section-title">
        <h2>我的案件</h2>
        <button type="button">全部案件 <ChevronRight size={16} /></button>
      </section>
      <section className="case-list">
        {cases.length === 0 && (
          <div className="empty-cases">
            <Folder size={28} />
            <strong>暂无案件</strong>
            <span>发起第一笔追偿后，案件进度会显示在这里</span>
            <button className="outline-button" type="button" onClick={onStart}>立即发起</button>
          </div>
        )}
        {cases.slice(0, 3).map((item, index) => (
          <button className="case-row" key={item.id} type="button" onClick={() => onOpenCase(item)}>
            <span className={`case-logo tone-${index + 1}`}>{index === 0 ? '欠' : index === 1 ? <Scale size={26} /> : <Mail size={26} />}</span>
            <span className="case-main">
              <strong>{item.debtorName}</strong>
              <small>欠款金额 <b>￥{item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</b></small>
              <small>创建时间 {item.createdAt.slice(0, 10)}</small>
            </span>
            <span className="case-state">
              <em>{item.status}</em>
              <small>{index === 0 ? '还需补充 2 项证据' : index === 1 ? '预计 1-2 个工作日' : '已发送 2024-05-12'}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
      </section>

      <section className="metrics-card">
        <div className="card-heading">
          <h2>今日进展</h2>
          <span>数据每日更新</span>
        </div>
        <div className="metric-grid">
          <Metric icon={WalletCards} label="已追回金额（本月）" value={`￥${totalRecovered.toLocaleString('zh-CN')}`} delta="较上月 ↑ 38%" />
          <Metric icon={Folder} label="进行中案件" value="18" delta="较上月 ↑ 12%" />
          <Metric icon={CalendarDays} label="平均响应时间" value="2.4 小时" delta="较上月 ↓ 18%" good />
        </div>
      </section>
    </div>
  );
}

function CreateScreen({
  form,
  busy,
  onBack,
  onChange,
  onSubmit,
  canSubmit
}: {
  form: CaseInput;
  busy: boolean;
  onBack: () => void;
  onChange: (form: CaseInput) => void;
  onSubmit: () => void;
  canSubmit: boolean;
}) {
  return (
    <div className="screen create-screen">
      <TopBar title="发起追偿" onBack={onBack} right={<button className="text-action" type="button"><CircleHelp size={18} />帮助</button>} />
      <p className="subtitle">填写案件基本信息，AI将为你定制最佳追偿方案</p>
      <StepDots current={1} labels={['基本信息', '上传证据', '案件评估', '确认提交']} />
      <section className="form-card">
        <Field icon={WalletCards} label="欠款金额">
          <div className="amount-field">￥
            <input
              value={form.amount || ''}
              placeholder="请输入本金金额，元"
              inputMode="decimal"
              onChange={(event) => onChange({ ...form, amount: Number(event.target.value) })}
              aria-label="欠款金额"
            />
          </div>
        </Field>
        <Field icon={BriefcaseBusiness} label="对方主体名称">
          <input value={form.debtorName} placeholder="请输入公司或个人名称" onChange={(event) => onChange({ ...form, debtorName: event.target.value })} />
        </Field>
        <Field icon={Phone} label="联系人 / 手机号">
          <input
            value={form.contactName}
            placeholder="联系人姓名"
            onChange={(event) => onChange({ ...form, contactName: event.target.value })}
          />
          <input
            value={form.contactPhone}
            placeholder="手机号"
            inputMode="tel"
            onChange={(event) => onChange({ ...form, contactPhone: event.target.value })}
          />
        </Field>
        <Field icon={CalendarDays} label="合同签署日期">
          <input value={form.contractDate} placeholder="例如 2026-06-29" onChange={(event) => onChange({ ...form, contractDate: event.target.value })} />
        </Field>
        <Field icon={MessageCircle} label="争议简述">
          <textarea value={form.dispute} placeholder="请简要描述对方未付款、催收沟通和当前诉求" maxLength={300} onChange={(event) => onChange({ ...form, dispute: event.target.value })} />
          <small>{form.dispute.length}/300</small>
        </Field>
      </section>
      <section className="ai-question">
        <BotAvatar />
        <div>
          <h2>这笔款项是否已经到期？</h2>
          <p>准确的到期信息有助于我们评估可行的追偿方案</p>
          <div className="segmented">
            {(['已到期', '部分到期', '不确定'] as const).map((item) => (
              <button className={form.dueStatus === item ? 'active' : ''} key={item} type="button" onClick={() => onChange({ ...form, dueStatus: item })}>
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>
      <p className="privacy"><ShieldCheck size={15} />你的信息将严格保密，仅用于案件处理</p>
      <button className="primary-button wide" type="button" disabled={busy || !canSubmit} onClick={onSubmit}>
        下一步：上传证据 <ChevronRight size={20} />
      </button>
    </div>
  );
}

function UploadScreen({
  lawCase,
  busy,
  selectedCategory,
  onBack,
  onCategory,
  onPickFile,
  onEvaluate
}: {
  lawCase: LawCase;
  busy: boolean;
  selectedCategory: string;
  onBack: () => void;
  onCategory: (id: string) => void;
  onPickFile: () => void;
  onEvaluate: () => void;
}) {
  return (
    <div className="screen upload-screen">
      <TopBar title="证据上传" onBack={onBack} right={<button className="text-action" type="button"><CircleHelp size={18} />上传指南</button>} />
      <StepDots current={2} labels={['填写信息', '上传证据', '选择诉求', '确认提交']} />
      <div className="hint-bar">
        <ShieldCheck size={18} />
        <span>证据越完整，AI分析越准确，胜诉率越高</span>
        <button type="button">如何收集证据 <ChevronRight size={16} /></button>
      </div>
      <button className="upload-dropzone" type="button" onClick={onPickFile}>
        <CloudUpload size={54} />
        <strong>点击或拖拽文件到此处上传</strong>
        <span>支持图片、PDF、Word、Excel、聊天记录截图等</span>
        <small>单个文件不超过 50MB</small>
        <div>
          <span><Camera size={18} />拍照上传</span>
          <span><Image size={18} />从相册选择</span>
        </div>
      </button>
      <section className="evidence-grid">
        {lawCase.evidence.map((category) => (
          <EvidenceCard
            key={category.id}
            category={category}
            selected={category.id === selectedCategory}
            onClick={() => {
              onCategory(category.id);
              onPickFile();
            }}
          />
        ))}
      </section>
      <section className="ai-summary">
        <div>
          <BotAvatar small />
          <h2>AI初步识别</h2>
          <span>基于已上传证据</span>
        </div>
        {(lawCase.assessment?.findings ?? ['已识别欠款金额：￥52,300', '发现付款承诺聊天记录 3 条', '识别合同约定付款日期：2024-05-02']).map((finding) => (
          <p key={finding}><Check size={16} />{finding}</p>
        ))}
        <LegalHeroArt mini />
      </section>
      <div className="sticky-actions">
        <button className="secondary-button" type="button" onClick={onPickFile}><Camera size={20} />拍照上传</button>
        <button className="primary-button" type="button" disabled={busy} onClick={onEvaluate}>下一步：生成方案</button>
      </div>
    </div>
  );
}

function AssessmentScreen({
  lawCase,
  busy,
  onBack,
  onChoosePlan
}: {
  lawCase: LawCase;
  busy: boolean;
  onBack: () => void;
  onChoosePlan: (planId: PlanId) => void;
}) {
  const assessment = lawCase.assessment!;
  return (
    <div className="screen assessment-screen">
      <TopBar title="AI评估结果" onBack={onBack} right={<MoreHorizontal size={24} />} />
      <div className="complete-line"><Check size={18} />证据已上传，AI评估完成</div>
      <section className="assessment-card">
        <div className="assessment-top">
          <div>
            <h2>案件胜率参考</h2>
            <strong>{assessment.winRate}%</strong>
            <span>{assessment.confidence}</span>
            <p>{assessment.summary}</p>
          </div>
          <LegalHeroArt mini />
        </div>
        <div className="assessment-stats">
          <div><span>建议路径</span><strong>{assessment.suggestedRoute.split('→')[0].trim()}</strong><small>{assessment.suggestedRoute}</small></div>
          <div><span>预计周期</span><strong>{assessment.estimatedDays}</strong></div>
          <div><span>预计可回收金额</span><strong>￥{assessment.estimatedRecovery.toLocaleString('zh-CN')}.00</strong></div>
        </div>
      </section>
      <section className="section-title plan-heading">
        <div>
          <h2>为你推荐最佳方案</h2>
          <p>基于你的案件情况和风险偏好，我们为你提供以下方案</p>
        </div>
        <button type="button"><Scale size={18} />方案对比</button>
      </section>
      <section className="plan-grid">
        {assessment.plans.map((plan) => (
          <article className={`plan-card ${plan.recommended ? 'recommended' : ''}`} key={plan.id}>
            {plan.recommended && <span className="ribbon">推荐方案</span>}
            <h3>{plan.name}</h3>
            <p>{plan.subtitle}</p>
            <ul>
              {plan.features.map((feature) => <li key={feature}><ShieldCheck size={14} />{feature}</li>)}
            </ul>
            <strong>￥{plan.price.toLocaleString('zh-CN')}{plan.id === 'full-service' ? ' 起' : ''}</strong>
            <small>{plan.fee}</small>
            <button className={plan.recommended ? 'primary-button' : 'outline-button'} type="button" disabled={busy} onClick={() => onChoosePlan(plan.id)}>
              选择此方案
            </button>
          </article>
        ))}
      </section>
      <section className="assurance-card">
        <h2>法灵平台保障</h2>
        <div>
          <span><BadgeCheck size={20} />平台律师审核</span>
          <span><Headphones size={20} />人类律师兜底</span>
          <span><ShieldCheck size={20} />资金安全保障</span>
          <span><ShieldCheck size={20} />隐私安全保护</span>
        </div>
      </section>
      <button className="primary-button wide" type="button" disabled={busy} onClick={() => onChoosePlan('lawyer-review')}>
        立即启动追偿
      </button>
    </div>
  );
}

function ProgressScreen({ lawCase, onBack, onUpload }: { lawCase: LawCase; onBack: () => void; onUpload: () => void }) {
  return (
    <div className="screen progress-screen">
      <TopBar title="案件进度" onBack={onBack} right={<div className="top-icons"><Headphones size={23} /><MoreHorizontal size={23} /></div>} />
      <section className="case-hero">
        <div>
          <span className="case-logo tone-1">欠</span>
          <h2>{lawCase.debtorName}</h2>
          <p>欠款金额 <b>￥{lawCase.amount.toLocaleString('zh-CN')}.00</b></p>
          <p>创建时间 {lawCase.createdAt.slice(0, 10)} ｜ 案件编号 {lawCase.caseNo}</p>
          <div className="stage-note">当前阶段：<strong>{lawCase.status}</strong><span />平台律师正在与对方沟通，请耐心等待</div>
        </div>
        <LegalHeroArt mini />
      </section>
      <section className="timeline-card">
        <h2>案件进度</h2>
        <div className="timeline">
          {lawCase.stages.map((stage) => (
            <div className={`timeline-item ${stage.status}`} key={stage.key}>
              <span className="dot">{stage.status === 'done' ? <Check size={15} /> : ''}</span>
              <span className="stage-icon"><StageIcon stage={stage.key} /></span>
              <div>
                <strong>{stage.title}{stage.status === 'active' && <em>进行中</em>}</strong>
                <p>{stage.description}</p>
              </div>
              <time>{stage.at}</time>
            </div>
          ))}
        </div>
      </section>
      <section className="latest-card">
        <div><MessageCircle size={22} /><strong>最新进展</strong><span>今天 14:20</span></div>
        <p>2026-06-29 14:20 对方已阅读律师函</p>
        <button type="button">平台建议：等待48小时后发起二次催告 <ChevronRight size={18} /></button>
      </section>
      <section className="quick-actions">
        <button type="button" onClick={onUpload}><FileCheck2 size={24} />补充证据<span>上传新的证据材料</span></button>
        <button type="button"><Contact size={24} />联系顾问<span>咨询案件进展</span></button>
        <button className="primary-button" type="button">查看下一步建议 <ChevronRight size={18} /></button>
      </section>
    </div>
  );
}

function CasesScreen({
  cases,
  onBack,
  onStart,
  onOpenCase
}: {
  cases: LawCase[];
  onBack: () => void;
  onStart: () => void;
  onOpenCase: (item: LawCase) => void;
}) {
  const totalAmount = cases.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="screen cases-screen">
      <TopBar title="案件" onBack={onBack} right={<button className="text-action" type="button" onClick={onStart}><Plus size={18} />新建</button>} />
      <section className="cases-overview">
        <div>
          <span>进行中案件</span>
          <strong>{cases.length}</strong>
        </div>
        <div>
          <span>追偿金额</span>
          <strong>￥{totalAmount.toLocaleString('zh-CN')}</strong>
        </div>
      </section>
      <section className="case-list full-list">
        {cases.length === 0 && (
          <div className="empty-cases tall">
            <Folder size={34} />
            <strong>暂无案件</strong>
            <span>你发起的追偿案件会统一归档在这里</span>
            <button className="primary-button" type="button" onClick={onStart}>发起追偿</button>
          </div>
        )}
        {cases.map((item, index) => (
          <button className="case-row" key={item.id} type="button" onClick={() => onOpenCase(item)}>
            <span className={`case-logo tone-${(index % 3) + 1}`}>{index % 3 === 0 ? '欠' : index % 3 === 1 ? <Scale size={26} /> : <Mail size={26} />}</span>
            <span className="case-main">
              <strong>{item.debtorName}</strong>
              <small>欠款金额 <b>￥{item.amount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</b></small>
              <small>案件编号 {item.caseNo}</small>
            </span>
            <span className="case-state">
              <em>{item.status}</em>
              <small>{item.createdAt.slice(0, 10)}</small>
            </span>
            <ChevronRight size={18} />
          </button>
        ))}
      </section>
    </div>
  );
}

function MessagesScreen({ cases, onBack, onOpenCases }: { cases: LawCase[]; onBack: () => void; onOpenCases: () => void }) {
  const latestCase = cases[0];
  const messages = [
    {
      title: latestCase ? '案件状态更新' : '欢迎使用法灵 AI法务',
      body: latestCase ? `${latestCase.debtorName} 当前状态：${latestCase.status}` : '完成手机号登录后，你可以发起第一笔追偿案件。',
      time: '刚刚',
      unread: true
    },
    {
      title: '证据上传提醒',
      body: latestCase ? '补充合同、聊天记录和转账记录后，AI评估会更准确。' : '发起案件后，这里会提醒你补充关键证据。',
      time: '今天',
      unread: true
    },
    {
      title: '平台服务通知',
      body: '验证码登录与案件数据已接入本地 PostgreSQL 持久化。',
      time: '系统',
      unread: false
    }
  ];

  return (
    <div className="screen messages-screen">
      <TopBar title="消息" onBack={onBack} right={<MoreHorizontal size={24} />} />
      <section className="message-summary">
        <MessageCircle size={30} />
        <div>
          <strong>{messages.filter((item) => item.unread).length} 条未读消息</strong>
          <span>案件提醒、律师沟通和系统通知都会在这里汇总</span>
        </div>
      </section>
      <section className="message-list">
        {messages.map((item) => (
          <button className="message-row" key={item.title} type="button" onClick={onOpenCases}>
            <span className={item.unread ? 'message-dot unread' : 'message-dot'} />
            <div>
              <strong>{item.title}</strong>
              <p>{item.body}</p>
            </div>
            <time>{item.time}</time>
          </button>
        ))}
      </section>
    </div>
  );
}

function MeScreen({
  user,
  cases,
  onBack,
  onLogout
}: {
  user: AppUser;
  cases: LawCase[];
  onBack: () => void;
  onLogout: () => void;
}) {
  const totalAmount = cases.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div className="screen me-screen">
      <TopBar title="我的" onBack={onBack} right={<CircleHelp size={22} />} />
      <section className="profile-card">
        <span className="profile-avatar"><UserIcon size={34} /></span>
        <div>
          <h2>{user.name}</h2>
          <p>{user.phone}</p>
        </div>
      </section>
      <section className="profile-stats">
        <div><strong>{cases.length}</strong><span>案件数</span></div>
        <div><strong>￥{totalAmount.toLocaleString('zh-CN')}</strong><span>追偿金额</span></div>
      </section>
      <section className="profile-menu">
        <button type="button"><ShieldCheck size={22} /><span>账户与安全</span><ChevronRight size={18} /></button>
        <button type="button"><FileCheck2 size={22} /><span>法律文书</span><ChevronRight size={18} /></button>
        <button type="button"><Headphones size={22} /><span>咨询客服</span><ChevronRight size={18} /></button>
      </section>
      <button className="logout-button" type="button" onClick={onLogout}>退出登录</button>
    </div>
  );
}

function StepDots({ current, labels }: { current: number; labels: string[] }) {
  return (
    <div className="steps">
      {labels.map((label, index) => {
        const step = index + 1;
        return (
          <div className={step <= current ? 'active' : ''} key={label}>
            <span>{step < current ? <Check size={14} /> : step}</span>
            <small>{step}/{labels.length} {label}</small>
          </div>
        );
      })}
    </div>
  );
}

function Field({ icon: Icon, label, children }: { icon: ComponentType<{ size?: number }>; label: string; children: React.ReactNode }) {
  return (
    <label className="field-row">
      <span><Icon size={19} />{label}</span>
      {children}
    </label>
  );
}

function EvidenceCard({ category, selected, onClick }: { category: EvidenceCategory; selected: boolean; onClick: () => void }) {
  const Icon = categoryIcons[category.id] ?? FileCheck2;
  const statusText = category.files.length > 0 || category.status === 'recognized' ? '已上传' : category.status === 'optional' ? '选填' : '待上传';
  return (
    <button className={`evidence-card ${selected ? 'selected' : ''}`} type="button" onClick={onClick}>
      <div>
        <span className={`evidence-icon ${category.id}`}><Icon size={24} /></span>
        <strong>{category.name}</strong>
        <em>{statusText}</em>
      </div>
      <p>{category.files.length} 份文件</p>
      <div className="thumb-row">
        {category.files.slice(0, 2).map((file) => <span key={file.id}>{file.name.slice(0, 4)}</span>)}
        <span className="add-thumb"><Plus size={22} /></span>
      </div>
      <small className={category.status === 'pending' ? 'pending' : ''}>
        {category.insight ?? '待识别'}
      </small>
    </button>
  );
}

function Metric({ icon: Icon, label, value, delta, good }: { icon: ComponentType<{ size?: number }>; label: string; value: string; delta: string; good?: boolean }) {
  return (
    <div className="metric">
      <Icon size={25} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={good ? 'good' : ''}>{delta}</small>
    </div>
  );
}

function LegalHeroArt({ mini }: { mini?: boolean }) {
  return (
    <div className={`legal-art ${mini ? 'mini' : ''}`} aria-hidden="true">
      <div className="art-ring" />
      <div className="art-shield">￥</div>
      <div className="art-paper one" />
      <div className="art-paper two" />
      <span />
      <span />
    </div>
  );
}

function BotAvatar({ small }: { small?: boolean }) {
  return (
    <span className={`bot-avatar ${small ? 'small' : ''}`}>
      <Bot size={small ? 22 : 34} />
    </span>
  );
}

function StageIcon({ stage }: { stage: string }) {
  const map: Record<string, ComponentType<{ size?: number }>> = {
    submit: FileCheck2,
    evidence: CloudUpload,
    review: UserIcon,
    letter: Mail,
    negotiation: Scale,
    filing: Folder,
    recovery: ShieldCheck
  };
  const Icon = map[stage] ?? FileCheck2;
  return <Icon size={24} />;
}

function BottomNav({ active, onNavigate }: { active: NavTab; onNavigate: (tab: NavTab) => void }) {
  const tabs = [
    { id: 'home' as const, label: '首页', icon: Home },
    { id: 'start' as const, label: '发起', icon: Plus },
    { id: 'cases' as const, label: '案件', icon: Folder },
    { id: 'messages' as const, label: '消息', icon: MessageCircle, badge: '2' },
    { id: 'me' as const, label: '我的', icon: UserIcon }
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <button className={active === tab.id ? 'active' : ''} key={tab.id} type="button" aria-label={tab.label} onClick={() => onNavigate(tab.id)}>
          <span>
            <tab.icon size={25} />
            {tab.badge && <em aria-hidden="true">{tab.badge}</em>}
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export default App;
