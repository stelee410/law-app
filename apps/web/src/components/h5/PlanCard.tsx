import { Check, Star } from 'lucide-react';
import { formatMoney } from '../../lib/format';
import type { ServicePlan } from '../../lib/types';

export function PlanCard({
  plan,
  selected,
  locked,
  pending,
  onSelect
}: {
  plan: ServicePlan;
  selected: boolean;
  locked: boolean;
  pending: boolean;
  onSelect: () => void;
}) {
  return (
    <article className={`relative rounded-lg border bg-white p-4 shadow-sm ${plan.recommended ? 'border-blue-500' : 'border-slate-100'}`}>
      {plan.recommended && (
        <span className="absolute right-4 top-4 flex items-center gap-1 rounded-full bg-blue-600 px-3 py-1 text-xs font-black text-white">
          <Star size={13} />
          推荐方案
        </span>
      )}
      <h2 className="pr-24 text-xl font-black tracking-normal text-slate-950">{plan.name}</h2>
      <p className="mt-2 break-words text-sm leading-6 text-slate-500">{plan.subtitle}</p>
      <div className="mt-4 flex flex-wrap items-end gap-2">
        <strong className="text-3xl font-black tracking-normal text-slate-950">{formatMoney(plan.price)}</strong>
        <span className="pb-1 text-sm font-semibold text-slate-500">{plan.fee}</span>
      </div>
      <div className="mt-4 space-y-2">
        {plan.features.map((feature) => (
          <div key={feature} className="flex gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-700">
            <Check className="mt-0.5 shrink-0 text-emerald-600" size={16} />
            <span className="break-words">{feature}</span>
          </div>
        ))}
      </div>
      <button
        className={`mt-4 h-12 w-full rounded-lg font-black ${
          selected ? 'bg-emerald-100 text-emerald-700' : plan.recommended ? 'bg-blue-600 text-white' : 'bg-slate-950 text-white'
        } disabled:opacity-50`}
        type="button"
        disabled={pending || locked}
        onClick={onSelect}
      >
        {selected ? '已选择' : '选择此方案'}
      </button>
    </article>
  );
}
