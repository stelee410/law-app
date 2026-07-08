import { useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, HelpCircle, ShieldCheck } from 'lucide-react';
import { FormEvent, useState } from 'react';
import type { ReactNode } from 'react';
import { useCreateCaseMutation } from '../hooks/useCaseQueries';
import type { CreateCaseInput } from '../lib/types';

const defaultCase: CreateCaseInput = {
  debtorName: '',
  contactName: '',
  contactPhone: '',
  amount: 0,
  contractDate: '',
  dispute: '',
  dueStatus: '已到期'
};

export function NewCasePage() {
  const navigate = useNavigate();
  const createCase = useCreateCaseMutation();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CreateCaseInput>(defaultCase);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 2) {
      setStep((value) => value + 1);
      return;
    }
    const lawCase = await createCase.mutateAsync(form);
    await navigate({ to: '/cases/$caseId/evidence', params: { caseId: lawCase.id } });
  }

  const canContinue =
    (step === 0 && form.debtorName.trim().length >= 2 && form.amount > 0 && form.contractDate.length >= 8) ||
    (step === 1 && form.contactName.trim().length >= 2 && form.contactPhone.trim().length >= 6) ||
    (step === 2 && form.dispute.trim().length >= 10);

  return (
    <form className="flex flex-1 flex-col gap-5" onSubmit={handleSubmit}>
      <Header step={step} onBack={() => (step === 0 ? navigate({ to: '/' }) : setStep((value) => value - 1))} />
      {step === 0 && (
        <section className="space-y-4 rounded-lg bg-white p-4 shadow-sm">
          <Field label="债务人/公司">
            <input className="h-12 w-full rounded-lg bg-slate-50 px-4 outline-none focus:ring-2 focus:ring-blue-500" value={form.debtorName} onChange={(event) => setForm({ ...form, debtorName: event.target.value })} />
          </Field>
          <Field label="欠款金额">
            <input className="h-12 w-full rounded-lg bg-slate-50 px-4 outline-none focus:ring-2 focus:ring-blue-500" inputMode="decimal" type="number" value={form.amount || ''} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })} />
          </Field>
          <Field label="合同日期">
            <input className="h-12 w-full rounded-lg bg-slate-50 px-4 outline-none focus:ring-2 focus:ring-blue-500" type="date" value={form.contractDate} onChange={(event) => setForm({ ...form, contractDate: event.target.value })} />
          </Field>
        </section>
      )}
      {step === 1 && (
        <section className="space-y-4 rounded-lg bg-white p-4 shadow-sm">
          <Field label="联系人">
            <input className="h-12 w-full rounded-lg bg-slate-50 px-4 outline-none focus:ring-2 focus:ring-blue-500" value={form.contactName} onChange={(event) => setForm({ ...form, contactName: event.target.value })} />
          </Field>
          <Field label="联系电话">
            <input className="h-12 w-full rounded-lg bg-slate-50 px-4 outline-none focus:ring-2 focus:ring-blue-500" inputMode="tel" value={form.contactPhone} onChange={(event) => setForm({ ...form, contactPhone: event.target.value })} />
          </Field>
          <Field label="到期状态">
            <select className="h-12 w-full rounded-lg bg-slate-50 px-4 outline-none focus:ring-2 focus:ring-blue-500" value={form.dueStatus} onChange={(event) => setForm({ ...form, dueStatus: event.target.value as CreateCaseInput['dueStatus'] })}>
              <option>已到期</option>
              <option>部分到期</option>
              <option>不确定</option>
            </select>
          </Field>
        </section>
      )}
      {step === 2 && (
        <section className="space-y-4 rounded-lg bg-white p-4 shadow-sm">
          <Field label="争议描述">
            <textarea className="min-h-44 w-full rounded-lg bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" value={form.dispute} maxLength={300} onChange={(event) => setForm({ ...form, dispute: event.target.value })} />
            <small className="mt-1 block text-right text-xs text-slate-400">{form.dispute.length}/300</small>
          </Field>
          <div className="rounded-lg bg-blue-50 p-3 text-sm font-semibold leading-6 text-blue-700">
            平台会根据你填写的信息生成证据 checklist，并进入上传与评估流程。
          </div>
        </section>
      )}
      <p className="flex gap-2 rounded-lg bg-[#f5f4ed] p-3 text-sm font-semibold leading-6 text-[#8a4b36]">
        <ShieldCheck className="mt-0.5 shrink-0" size={16} />
        你的信息将严格保密，仅用于案件处理和评估。
      </p>
      {createCase.isError && <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">案件创建失败，请检查必填项。</div>}
      <button className="mt-auto flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 font-black text-white disabled:opacity-50" type="submit" disabled={!canContinue || createCase.isPending}>
        {step < 2 ? '下一步' : '下一步：上传证据'}
        {step < 2 ? <ArrowRight size={18} /> : <Check size={18} />}
      </button>
    </form>
  );
}

function Header({ step, onBack }: { step: number; onBack: () => void }) {
  const labels = ['基本信息', '联系方式', '争议描述'];
  return (
    <header className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button className="flex items-center gap-2 text-sm font-bold text-slate-600" type="button" onClick={onBack}>
          <ArrowLeft size={17} />
          返回
        </button>
        <button className="flex items-center gap-1 text-sm font-bold text-blue-700" type="button">
          <HelpCircle size={16} />
          帮助
        </button>
      </div>
      <div>
        <p className="text-sm font-bold text-blue-700">第 {step + 1} 步 / 3 · {labels[step]}</p>
        <h1 className="mt-1 text-2xl font-black tracking-normal">发起追偿</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">填写案件基本信息，AI 将为你定制追偿方案。</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((item) => (
          <span key={item} className={`h-2 rounded-full ${item <= step ? 'bg-blue-600' : 'bg-slate-200'}`} />
        ))}
      </div>
    </header>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-black text-slate-700">{label}</span>
      {children}
    </label>
  );
}
