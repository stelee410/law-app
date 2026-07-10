import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink, Send, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import type { ReactNode } from 'react';
import brandLogo from '../assets/brand-logo.png';
import loginHero from '../assets/login-hero.png';
import { useOnboardLawyerMutation, useRegisterClientMutation, useRequestCodeMutation } from '../hooks/useCaseQueries';
import { useSmsCountdown } from '../hooks/useSmsCountdown';

type ConsentState = {
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
};

export function ClientRegistrationPage() {
  const navigate = useNavigate();
  const requestCode = useRequestCodeMutation();
  const registerClient = useRegisterClientMutation();
  const { remainingSeconds, startCountdown } = useSmsCountdown();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState<ConsentState>({ acceptedTerms: false, acceptedPrivacy: false });
  const canSubmit = name.trim().length > 0 && phone.length === 11 && code.length >= 4 && consent.acceptedTerms && consent.acceptedPrivacy;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    await registerClient.mutateAsync({ phone, code, name, ...consent });

    await navigate({ to: '/' });
  }

  return (
    <RegistrationShell title="客户注册" description="注册后可以发起案件、上传证据并查看案件进度。">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <TextField label="姓名" value={name} onChange={setName} placeholder="王先生" />
        <CodeFields phone={phone} code={code} setPhone={setPhone} setCode={setCode} requestCode={() => requestCode.mutate({ phone, purpose: 'register' }, { onSuccess: startCountdown })} disabled={phone.length !== 11 || requestCode.isPending || remainingSeconds > 0} remainingSeconds={remainingSeconds} />
        <ConsentFields consent={consent} setConsent={setConsent} />
        {requestCode.data?.mockCode && <Hint>测试验证码：{requestCode.data.mockCode}</Hint>}
        {requestCode.isSuccess && !requestCode.data.mockCode && <SuccessText>验证码已发送，请查看短信。</SuccessText>}
        {requestCode.isError && <ErrorText>验证码发送失败，请稍后重试。</ErrorText>}
        {registerClient.isError && <ErrorText>注册失败，请检查验证码和必填信息。</ErrorText>}
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 font-black text-white disabled:opacity-50" type="submit" disabled={!canSubmit || registerClient.isPending}>
          <Send size={18} />
          完成注册
        </button>
      </form>
    </RegistrationShell>
  );
}

export function LawyerOnboardingPage() {
  const navigate = useNavigate();
  const requestCode = useRequestCodeMutation();
  const onboardLawyer = useOnboardLawyerMutation();
  const { remainingSeconds, startCountdown } = useSmsCountdown();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [lawFirm, setLawFirm] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [practiceRegion, setPracticeRegion] = useState('');
  const [specialtiesText, setSpecialtiesText] = useState('');
  const [consent, setConsent] = useState<ConsentState>({ acceptedTerms: false, acceptedPrivacy: false });
  const specialties = specialtiesText.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  const canSubmit =
    name.trim().length > 0 &&
    phone.length === 11 &&
    code.length >= 4 &&
    lawFirm.trim().length > 0 &&
    licenseNumber.trim().length > 0 &&
    practiceRegion.trim().length > 0 &&
    specialties.length > 0 &&
    consent.acceptedTerms &&
    consent.acceptedPrivacy;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    await onboardLawyer.mutateAsync({
      phone,
      code,
      name,
      lawFirm,
      licenseNumber,
      practiceRegion,
      specialties,
      ...consent
    });
    await navigate({ to: '/lawyer/review-status' });
  }

  return (
    <RegistrationShell title="律师入驻" description="律师入驻需提交真实执业身份，审核通过后才能接收待办和处理文书。">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <TextField label="姓名" value={name} onChange={setName} placeholder="赵律师" />
        <CodeFields phone={phone} code={code} setPhone={setPhone} setCode={setCode} requestCode={() => requestCode.mutate({ phone, purpose: 'register' }, { onSuccess: startCountdown })} disabled={phone.length !== 11 || requestCode.isPending || remainingSeconds > 0} remainingSeconds={remainingSeconds} />
        <TextField label="律所" value={lawFirm} onChange={setLawFirm} placeholder="某某律师事务所" />
        <TextField label="执业证号" value={licenseNumber} onChange={setLicenseNumber} placeholder="11101202010123456" />
        <TextField label="执业地区" value={practiceRegion} onChange={setPracticeRegion} placeholder="上海" />
        <TextField label="擅长领域" value={specialtiesText} onChange={setSpecialtiesText} placeholder="合同纠纷,债务催收" />
        <ConsentFields consent={consent} setConsent={setConsent} />
        {requestCode.data?.mockCode && <Hint>测试验证码：{requestCode.data.mockCode}</Hint>}
        {requestCode.isSuccess && !requestCode.data.mockCode && <SuccessText>验证码已发送，请查看短信。</SuccessText>}
        {requestCode.isError && <ErrorText>验证码发送失败，请稍后重试。</ErrorText>}
        {onboardLawyer.isError && <ErrorText>入驻提交失败，请检查验证码和必填信息。</ErrorText>}
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 font-black text-white disabled:opacity-50" type="submit" disabled={!canSubmit || onboardLawyer.isPending}>
          <ShieldCheck size={18} />
          提交入驻申请
        </button>
      </form>
    </RegistrationShell>
  );
}

function RegistrationShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const navigate = useNavigate();
  const badgeText = title === '律师入驻' ? '入驻审核' : '隐私保护';

  return (
    <div className="space-y-4">
      <header className="space-y-3">
        <button className="flex items-center gap-2 text-sm font-bold text-slate-600" type="button" onClick={() => navigate({ to: '/login' })}>
          <ArrowLeft size={17} />
          返回登录
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3" aria-label="法灵 AI">
            <img className="size-12 rounded-xl object-cover shadow-md shadow-blue-200" src={brandLogo} alt="法灵 AI 品牌标识" loading="eager" />
            <span className="text-base font-black text-blue-700">法灵 AI</span>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="mr-1 inline" size={14} />
            {badgeText}
          </span>
        </div>
        <img className="h-24 w-full rounded-lg object-cover object-center shadow-sm shadow-blue-100" src={loginHero} alt="法律服务安全协作插图" loading="eager" />
        <div className="space-y-1">
          <h1 className="text-2xl font-black tracking-normal text-slate-950">{title}</h1>
          <p className="text-sm leading-6 text-slate-500">{description}</p>
        </div>
      </header>
      <section className="rounded-lg bg-white p-4 shadow-sm">{children}</section>
    </div>
  );
}

function CodeFields({
  phone,
  code,
  setPhone,
  setCode,
  requestCode,
  disabled,
  remainingSeconds
}: {
  phone: string;
  code: string;
  setPhone: (value: string) => void;
  setCode: (value: string) => void;
  requestCode: () => void;
  disabled: boolean;
  remainingSeconds: number;
}) {
  return (
    <>
      <TextField label="手机号" value={phone} onChange={(value) => setPhone(value.replace(/\D/g, '').slice(0, 11))} placeholder="请输入 11 位手机号" inputMode="tel" />
      <label className="block">
        <span className="mb-2 block text-sm font-black text-slate-700">验证码</span>
        <div className="flex gap-2">
          <input className="h-12 min-w-0 flex-1 rounded-lg bg-slate-50 px-4 outline-none focus:ring-2 focus:ring-blue-500" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="请输入验证码" />
          <button className="h-12 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50" type="button" disabled={disabled} onClick={requestCode}>
            {remainingSeconds > 0 ? `${remainingSeconds}s` : '获取验证码'}
          </button>
        </div>
      </label>
    </>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
  type = 'text',
  autoComplete
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  inputMode?: 'tel' | 'numeric';
  type?: 'text' | 'password';
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">{label}</span>
      <input className="h-12 w-full rounded-lg bg-slate-50 px-4 outline-none focus:ring-2 focus:ring-blue-500" inputMode={inputMode} type={type} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function ConsentFields({ consent, setConsent }: { consent: ConsentState; setConsent: (value: ConsentState) => void }) {
  const consentItems = [
    {
      key: 'acceptedTerms' as const,
      label: '我已阅读并同意服务协议',
      linkLabel: '查看服务协议',
      to: '/legal/terms'
    },
    {
      key: 'acceptedPrivacy' as const,
      label: '我已阅读并同意隐私政策',
      linkLabel: '查看隐私政策',
      to: '/legal/privacy'
    }
  ];

  return (
    <div className="space-y-2">
      {consentItems.map((item) => (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700 shadow-sm" key={item.key}>
          <div className="flex flex-col gap-3">
            <label className="flex min-h-11 min-w-0 items-center gap-3 font-semibold">
              <input className="size-6 shrink-0 rounded border-slate-300 accent-blue-600" type="checkbox" checked={consent[item.key]} onChange={(event) => setConsent({ ...consent, [item.key]: event.target.checked })} />
              <span className="leading-6">{item.label}</span>
            </label>
            <Link className="inline-flex h-11 w-fit items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-3 text-xs font-black text-blue-700" to={item.to}>
              {item.linkLabel}
              <ExternalLink size={13} />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">{children}</div>;
}

function SuccessText({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">{children}</div>;
}

function ErrorText({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{children}</div>;
}
