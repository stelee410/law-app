import { useNavigate } from '@tanstack/react-router';
import { ShieldCheck, Smartphone } from 'lucide-react';
import { FormEvent, useState } from 'react';
import brandLogo from '../assets/brand-logo.png';
import loginHero from '../assets/login-hero.png';
import { useLoginMutation, useRequestCodeMutation } from '../hooks/useCaseQueries';
import { useSmsCountdown } from '../hooks/useSmsCountdown';

export function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [loginErrorDetail, setLoginErrorDetail] = useState<string | null>(null);
  const requestCode = useRequestCodeMutation();
  const login = useLoginMutation();
  const { remainingSeconds, startCountdown } = useSmsCountdown();
  const enableDemoLogin = import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginErrorDetail(null);
    try {
      const session = await login.mutateAsync({ phone, code });
      if (session.user.role === 'admin') {
        await navigate({ to: '/admin' });
        return;
      }
      if (session.user.role === 'lawyer') {
        await navigate({ to: session.user.lawyerReviewStatus === 'approved' ? '/lawyer' : '/lawyer/review-status' });
        return;
      }
      await navigate({ to: '/' });
    } catch (error) {
      setLoginErrorDetail(await readApiErrorDetail(error));
    }
  }

  function handleRequestCode() {
    requestCode.mutate({ phone, purpose: 'login' }, { onSuccess: startCountdown });
  }

  return (
    <div className="flex flex-1 flex-col gap-4 py-4">
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3" aria-label="法灵 AI">
            <img className="size-14 rounded-xl object-cover shadow-lg shadow-blue-200" src={brandLogo} alt="法灵 AI 品牌标识" loading="eager" />
            <span className="text-base font-black text-blue-700">法灵 AI</span>
          </div>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="mr-1 inline" size={14} />
            隐私保护
          </span>
        </div>

        {enableDemoLogin && (
          <div className="grid grid-cols-2 gap-2">
            <button className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-blue-700" type="button" onClick={() => { setPhone('13800001234'); setCode(requestCode.data?.mockCode ?? '123456'); }}>
              客户演示
            </button>
            <button className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700" type="button" onClick={() => { setPhone('13900009999'); setCode(requestCode.data?.mockCode ?? '123456'); }}>
              律师演示
            </button>
          </div>
        )}
      </section>

      <img className="h-32 w-full rounded-lg object-cover object-center shadow-sm shadow-blue-100" src={loginHero} alt="法律服务安全协作插图" loading="eager" />

      <form className="space-y-4 rounded-lg border border-white bg-white p-4 shadow-xl shadow-slate-200/70" onSubmit={handleSubmit}>

        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">手机号</span>
          <input aria-label="手机号" className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-blue-500 focus:bg-white" inputMode="tel" autoComplete="tel" maxLength={11} value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, ''))} placeholder="请输入 11 位手机号" />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">短信验证码</span>
          <div className="flex gap-2">
            <input aria-label="短信验证码" className="h-12 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-blue-500 focus:bg-white" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} placeholder="请输入验证码" />
            <button className="h-12 min-w-28 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50" type="button" disabled={phone.length !== 11 || requestCode.isPending || remainingSeconds > 0} onClick={handleRequestCode}>
              {requestCode.isPending ? '发送中' : remainingSeconds > 0 ? `${remainingSeconds}s` : '获取验证码'}
            </button>
          </div>
        </label>
        {requestCode.data?.mockCode && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">测试验证码：{requestCode.data.mockCode}</div>}
        {requestCode.isSuccess && !requestCode.data.mockCode && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">验证码已发送，请查看短信。</div>}
        {requestCode.isError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">验证码发送失败，请稍后重试。</div>}

        {login.isError && loginErrorDetail === 'INVALID_CODE' && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">验证码错误或已过期，请重新获取。</div>}
        {login.isError && loginErrorDetail !== 'INVALID_CODE' && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">登录失败，请稍后重试。</div>}
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-200 disabled:opacity-50" type="submit" disabled={phone.length !== 11 || code.length < 4 || login.isPending}>
          <Smartphone size={18} />
          登录
        </button>
      </form>
    </div>
  );
}
async function readApiErrorDetail(error: unknown): Promise<string | null> {
  if (typeof error !== 'object' || error === null || !('response' in error)) return null;
  const response = (error as { response?: Response }).response;
  if (!response) return null;
  const body = await response.clone().json().catch(() => undefined) as { detail?: unknown } | undefined;
  return typeof body?.detail === 'string' ? body.detail : null;
}
