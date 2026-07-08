import { useNavigate } from '@tanstack/react-router';
import { ShieldCheck, Smartphone } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLoginMutation, useRequestCodeMutation } from '../hooks/useCaseQueries';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const requestCode = useRequestCodeMutation();
  const login = useLoginMutation();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await login.mutateAsync({ phone, code });
    await navigate({ to: '/' });
  }

  return (
    <div className="flex flex-1 flex-col justify-between gap-8 py-6">
      <section className="space-y-5">
        <div className="flex items-center justify-between">
          <span className="grid size-14 place-items-center rounded-lg bg-blue-600 text-xl font-black text-white shadow-lg shadow-blue-200">
            律
          </span>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
            <ShieldCheck className="mr-1 inline" size={14} />
            隐私保护
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-blue-700">{t('appName')}</p>
          <h1 className="mt-2 text-3xl font-black tracking-normal text-slate-950">{t('loginTitle')}</h1>
          <p className="mt-3 text-sm leading-6 text-slate-500">登录后继续管理案件、证据、AI评估和服务方案。</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-blue-700 shadow-sm" type="button" onClick={() => { setPhone('13800001234'); setCode(requestCode.data?.mockCode ?? '123456'); }}>
            客户演示
          </button>
          <button className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-700 shadow-sm" type="button" onClick={() => { setPhone('13900009999'); setCode(requestCode.data?.mockCode ?? '123456'); }}>
            律师演示
          </button>
        </div>
      </section>

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
