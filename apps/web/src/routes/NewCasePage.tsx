import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, ArrowRight, Check, HelpCircle, ShieldCheck } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { useCreateCaseMutation } from '../hooks/useCaseQueries';
import { getCaseCatalogItem, isCaseType } from '../lib/caseCatalog';
import type { CaseField } from '../lib/caseCatalog';
import type { CaseType, CreateCaseInput, MatterFields } from '../lib/types';

const topLevelFields = new Set<string>([
  'caseType',
  'debtorName',
  'contactName',
  'contactPhone',
  'amount',
  'contractDate',
  'dispute',
  'dueStatus',
  'partyRole',
  'counterpartyName',
  'region',
  'incidentDate',
  'claimType',
  'claimSummary',
  'privacyConsent'
]);

function defaultCase(caseType: CaseType): CreateCaseInput {
  const catalog = getCaseCatalogItem(caseType);
  return {
    caseType,
    debtorName: '',
    contactName: '',
    contactPhone: '',
    amount: 0,
    contractDate: '',
    dispute: '',
    dueStatus: '已到期',
    partyRole: '',
    counterpartyName: '',
    region: '',
    incidentDate: '',
    claimType: catalog.claimOptions[0] ?? '',
    claimSummary: '',
    privacyConsent: false,
    matterFields: { ...catalog.defaultMatterFields }
  };
}

export function NewCasePage() {
  const navigate = useNavigate();
  const createCase = useCreateCaseMutation();
  const searchCaseType = new URLSearchParams(window.location.search).get('caseType');
  const caseType = isCaseType(searchCaseType) ? searchCaseType : 'debt_collection';
  const catalog = getCaseCatalogItem(caseType);
  const [step, setStep] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [privacyTouched, setPrivacyTouched] = useState(false);
  const [form, setForm] = useState<CreateCaseInput>(() => defaultCase(caseType));
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const stepFields = useMemo(() => catalog.fields.filter((field) => field.step === step), [catalog.fields, step]);

  function closeHelp() {
    setHelpOpen(false);
    helpButtonRef.current?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < 2) {
      setStep((value) => value + 1);
      return;
    }
    if (!form.privacyConsent) {
      setPrivacyTouched(true);
      return;
    }
    const lawCase = await createCase.mutateAsync(form);
    await navigate({ to: '/cases/$caseId/evidence', params: { caseId: lawCase.id } });
  }

  function updateField(field: CaseField, value: string | number | boolean) {
    if (topLevelFields.has(String(field.id))) {
      setForm((current) => ({ ...current, [field.id]: value }));
      return;
    }
    setForm((current) => ({
      ...current,
      matterFields: { ...current.matterFields, [field.id]: value }
    }));
  }

  function readField(field: CaseField) {
    if (topLevelFields.has(String(field.id))) {
      return form[field.id as keyof CreateCaseInput] ?? '';
    }
    return form.matterFields[field.id] ?? '';
  }

  const canContinue =
    stepFields.every((field) => isFieldValid(field, readField(field))) &&
    (step < 2 || form.privacyConsent);

  return (
    <form className="flex flex-1 flex-col gap-5" onSubmit={handleSubmit}>
      <Header
        step={step}
        title={catalog.formTitle}
        description={catalog.description}
        onBack={() => (step === 0 ? navigate({ to: '/' }) : setStep((value) => value - 1))}
        onHelp={() => setHelpOpen(true)}
        helpButtonRef={helpButtonRef}
      />
      {helpOpen && <HelpDialog onClose={closeHelp} />}
      <section className="space-y-4 rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
        {stepFields.map((field) => (
          <Field key={String(field.id)} label={field.label}>
            <CaseInput
              field={field}
              value={readField(field)}
              claimOptions={catalog.claimOptions}
              onChange={(value) => updateField(field, value)}
            />
          </Field>
        ))}
      </section>
      {step === 2 && (
        <label className="flex gap-3 rounded-lg border border-slate-100 bg-white p-4 text-sm font-semibold leading-6 text-slate-700 shadow-sm">
          <input
            className="mt-1 size-4 shrink-0 accent-blue-600"
            type="checkbox"
            checked={form.privacyConsent}
            onChange={(event) => {
              setPrivacyTouched(true);
              setForm({ ...form, privacyConsent: event.target.checked });
            }}
          />
          <span>
            {catalog.privacyCopy}
            <Link className="ml-1 font-black text-blue-700" to="/legal/case-authorization" onClick={(event) => event.stopPropagation()}>
              案件资料授权书
            </Link>
          </span>
        </label>
      )}
      <p className="flex gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
        <ShieldCheck className="mt-0.5 shrink-0" size={16} />
        {step === 2 ? catalog.boundaryCopy : '你的信息将严格保密，仅用于案件处理和评估。'}
      </p>
      {privacyTouched && step === 2 && !form.privacyConsent && (
        <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">请先勾选隐私授权后提交。</div>
      )}
      {createCase.isError && <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">案件创建失败，请检查必填项。</div>}
      <button className="mt-auto flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 font-black text-white shadow-sm shadow-blue-100 disabled:opacity-50" type="submit" disabled={!canContinue || createCase.isPending}>
        {step < 2 ? '下一步' : '下一步：上传证据'}
        {step < 2 ? <ArrowRight size={18} /> : <Check size={18} />}
      </button>
    </form>
  );
}

function isFieldValid(field: CaseField, value: CreateCaseInput[keyof CreateCaseInput] | MatterFields[string]) {
  if (!field.required) return true;
  if (field.type === 'number') return Number(value) > 0;
  return String(value ?? '').trim().length >= (field.minLength ?? 1);
}

function CaseInput({
  field,
  value,
  claimOptions,
  onChange
}: {
  field: CaseField;
  value: CreateCaseInput[keyof CreateCaseInput] | MatterFields[string];
  claimOptions: string[];
  onChange: (value: string | number | boolean) => void;
}) {
  const className = 'h-12 w-full rounded-lg bg-slate-50 px-4 outline-none focus:ring-2 focus:ring-blue-500';
  const stringValue = String(value ?? '');

  if (field.type === 'textarea') {
    return (
      <>
        <textarea className="min-h-36 w-full rounded-lg bg-slate-50 px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500" value={stringValue} maxLength={500} placeholder={field.placeholder} onInput={(event) => onChange(event.currentTarget.value)} />
        <small className="mt-1 block text-right text-xs text-slate-400">{stringValue.length}/500</small>
      </>
    );
  }

  if (field.type === 'select') {
    const options = field.id === 'claimType' ? claimOptions : field.options ?? [];
    return (
      <select className={className} value={stringValue} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option}>{option}</option>
        ))}
      </select>
    );
  }

  return (
    <input
      className={className}
      inputMode={field.type === 'number' ? 'decimal' : field.type === 'tel' ? 'tel' : undefined}
      type={field.type === 'number' || field.type === 'date' ? field.type : 'text'}
      value={field.type === 'number' && Number(value) === 0 ? '' : stringValue}
      placeholder={field.placeholder}
      onInput={(event) => onChange(field.type === 'number' ? Number(event.currentTarget.value) : event.currentTarget.value)}
    />
  );
}

function Header({
  step,
  title,
  description,
  onBack,
  onHelp,
  helpButtonRef
}: {
  step: number;
  title: string;
  description: string;
  onBack: () => void;
  onHelp: () => void;
  helpButtonRef: RefObject<HTMLButtonElement | null>;
}) {
  const labels = ['基本信息', '联系方式', '诉求描述'];
  return (
    <header className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm" type="button" onClick={onBack}>
          <ArrowLeft size={17} />
          返回
        </button>
        <button
          ref={helpButtonRef}
          className="flex items-center gap-1 rounded-lg bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700"
          type="button"
          aria-haspopup="dialog"
          onClick={onHelp}
        >
          <HelpCircle size={16} />
          帮助
        </button>
      </div>
      <div>
        <p className="text-sm font-bold text-blue-700">第 {step + 1} 步 / 3 · {labels[step]}</p>
        <h1 className="mt-1 text-2xl font-black tracking-normal">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((item) => (
          <span key={item} className={`h-2 rounded-full ${item <= step ? 'bg-blue-600' : 'bg-white shadow-sm'}`} />
        ))}
      </div>
    </header>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 sm:items-center">
      <section
        className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-5 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-case-help-title"
      >
        <div>
          <h2 id="new-case-help-title" className="text-xl font-black text-slate-950">不知道怎么填？</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">简单写清楚两件事即可，后续还可以结合证据继续补充。</p>
        </div>
        <ol className="space-y-2 text-sm leading-6 text-slate-700">
          <li><b>1. 选择案件类型：</b>选择最接近当前问题的一类。</li>
          <li><b>2. 填写基本信息：</b>填写事项、联系人和联系方式。</li>
          <li><b>3. 用一句话描述：</b>分别说明“发生了什么”和“希望什么结果”。</li>
        </ol>
        <div className="space-y-2 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-950">
          <p><b>发生了什么：</b>对方收货后一直没付款。</p>
          <p><b>希望什么结果：</b>希望对方尽快付款。</p>
        </div>
        <p className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          下一步可上传合同、聊天记录、转账或付款凭证等，系统会结合材料继续梳理。
        </p>
        <button
          className="h-11 w-full rounded-lg bg-blue-600 font-black text-white"
          type="button"
          autoFocus
          onClick={onClose}
        >
          关闭帮助
        </button>
      </section>
    </div>
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
