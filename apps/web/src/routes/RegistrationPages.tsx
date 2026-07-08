import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Send, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import type { ReactNode } from 'react';
import { useOnboardLawyerMutation, useRegisterClientMutation, useRequestCodeMutation } from '../hooks/useCaseQueries';

type ConsentState = {
  acceptedTerms: boolean;
  acceptedPrivacy: boolean;
};

export function ClientRegistrationPage() {
  const navigate = useNavigate();
  const requestCode = useRequestCodeMutation();
  const registerClient = useRegisterClientMutation();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [consent, setConsent] = useState<ConsentState>({ acceptedTerms: false, acceptedPrivacy: false });
  const canSubmit = name.trim().length > 0 && phone.length >= 6 && code.length >= 4 && consent.acceptedTerms && consent.acceptedPrivacy;

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
        <CodeFields phone={phone} code={code} setPhone={setPhone} setCode={setCode} requestCode={() => requestCode.mutate(phone)} disabled={phone.length < 6 || requestCode.isPending} />
        <ConsentFields consent={consent} setConsent={setConsent} />
        {requestCode.data?.mockCode && <Hint>测试验证码：{requestCode.data.mockCode}</Hint>}
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
    phone.length >= 6 &&
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
    <RegistrationShell title="律师入驻" description="提交执业资料后等待平台审核，通过后才能进入律师工作台。">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <TextField label="姓名" value={name} onChange={setName} placeholder="赵律师" />
        <CodeFields phone={phone} code={code} setPhone={setPhone} setCode={setCode} requestCode={() => requestCode.mutate(phone)} disabled={phone.length < 6 || requestCode.isPending} />
        <TextField label="律所" value={lawFirm} onChange={setLawFirm} placeholder="某某律师事务所" />
        <TextField label="执业证号" value={licenseNumber} onChange={setLicenseNumber} placeholder="11101202010123456" />
        <TextField label="执业地区" value={practiceRegion} onChange={setPracticeRegion} placeholder="上海" />
        <TextField label="擅长领域" value={specialtiesText} onChange={setSpecialtiesText} placeholder="合同纠纷,债务催收" />
        <ConsentFields consent={consent} setConsent={setConsent} />
        {requestCode.data?.mockCode && <Hint>测试验证码：{requestCode.data.mockCode}</Hint>}
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
  return (
    <div className="space-y-5">
      <header className="space-y-4">
        <button className="flex items-center gap-2 text-sm font-bold text-slate-600" type="button" onClick={() => navigate({ to: '/login' })}>
          <ArrowLeft size={17} />
          返回登录
        </button>
        <div>
          <p className="text-sm font-black text-blue-700">法灵 AI</p>
          <h1 className="mt-2 text-2xl font-black tracking-normal text-slate-950">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
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
  disabled
}: {
  phone: string;
  code: string;
  setPhone: (value: string) => void;
  setCode: (value: string) => void;
  requestCode: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <TextField label="手机号" value={phone} onChange={setPhone} placeholder="13800001234" inputMode="tel" />
      <label className="block">
        <span className="mb-2 block text-sm font-black text-slate-700">验证码</span>
        <div className="flex gap-2">
          <input className="h-12 min-w-0 flex-1 rounded-lg bg-slate-50 px-4 outline-none focus:ring-2 focus:ring-blue-500" inputMode="numeric" value={code} onChange={(event) => setCode(event.target.value)} placeholder="654321" />
          <button className="h-12 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50" type="button" disabled={disabled} onClick={requestCode}>
            获取
          </button>
        </div>
      </label>
    </>
  );
}

function TextField({ label, value, onChange, placeholder, inputMode }: { label: string; value: string; onChange: (value: string) => void; placeholder: string; inputMode?: 'tel' | 'numeric' }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">{label}</span>
      <input className="h-12 w-full rounded-lg bg-slate-50 px-4 outline-none focus:ring-2 focus:ring-blue-500" inputMode={inputMode} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function ConsentFields({ consent, setConsent }: { consent: ConsentState; setConsent: (value: ConsentState) => void }) {
  return (
    <div className="space-y-3">
      <label className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700">
        <input className="mt-1 size-4 shrink-0 accent-blue-600" type="checkbox" checked={consent.acceptedTerms} onChange={(event) => setConsent({ ...consent, acceptedTerms: event.target.checked })} />
        <span>
          我已阅读并同意
          <Link className="font-black text-blue-700" to="/legal/terms" onClick={(event) => event.stopPropagation()}>
            服务协议
          </Link>
        </span>
      </label>
      <label className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-700">
        <input className="mt-1 size-4 shrink-0 accent-blue-600" type="checkbox" checked={consent.acceptedPrivacy} onChange={(event) => setConsent({ ...consent, acceptedPrivacy: event.target.checked })} />
        <span>
          我已阅读并同意
          <Link className="font-black text-blue-700" to="/legal/privacy" onClick={(event) => event.stopPropagation()}>
            隐私政策
          </Link>
        </span>
      </label>
    </div>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">{children}</div>;
}

function ErrorText({ children }: { children: ReactNode }) {
  return <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{children}</div>;
}
