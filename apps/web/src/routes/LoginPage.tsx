import { Link, useNavigate } from '@tanstack/react-router';
import { ShieldCheck, Smartphone, UserPlus } from 'lucide-react';
import { FormEvent, useState } from 'react';
import brandLogo from '../assets/brand-logo.png';
import loginHero from '../assets/login-hero.png';
import { useLoginMutation, useRequestCodeMutation } from '../hooks/useCaseQueries';

export function LoginPage() {
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const requestCode = useRequestCodeMutation();
  const login = useLoginMutation();
  const enableDemoLogin = import.meta.env.VITE_ENABLE_DEMO_LOGIN === 'true';

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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
        <div className="grid grid-cols-2 gap-2">
          <Link className="flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-3 text-sm font-bold text-blue-700 shadow-sm" to="/register/client">
            <UserPlus size={16} />
            客户注册
          </Link>
          <Link className="flex items-center justify-center gap-2 rounded-lg bg-white px-3 py-3 text-sm font-bold text-slate-700 shadow-sm" to="/register/lawyer">
            <ShieldCheck size={16} />
            律师入驻
          </Link>
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

      <img
        className="h-32 w-full rounded-lg object-cover object-center shadow-sm shadow-blue-100"
        src={loginHero}
        alt="法律服务安全协作插图"
        loading="eager"
      />

      <form className="space-y-4 rounded-lg border border-white bg-white p-4 shadow-xl shadow-slate-200/70" onSubmit={handleSubmit}>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">手机号</span>
          <input
            className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-blue-500 focus:bg-white"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="13800001234"
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">验证码</span>
          <div className="flex gap-2">
            <input
              className="h-12 min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 text-base outline-none focus:border-blue-500 focus:bg-white"
              inputMode="numeric"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="123456"
            />
            <button
              className="h-12 rounded-lg bg-slate-900 px-4 text-sm font-bold text-white disabled:opacity-50"
              type="button"
              disabled={phone.length < 6 || requestCode.isPending}
              onClick={() => requestCode.mutate(phone)}
            >
              获取
            </button>
          </div>
        </label>
        {requestCode.data?.mockCode && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
            测试验证码：{requestCode.data.mockCode}
          </div>
        )}
        {login.isError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">登录失败，请检查验证码。</div>}
        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 text-base font-black text-white shadow-lg shadow-blue-200 disabled:opacity-50"
          type="submit"
          disabled={phone.length < 6 || code.length < 4 || login.isPending}
        >
          <Smartphone size={18} />
          登录
        </button>
      </form>
    </div>
  );
}
