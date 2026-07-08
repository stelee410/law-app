import type { ReactNode } from 'react';
import type { Tone } from '../../lib/viewModel';

const toneClass: Record<Tone, string> = {
  blue: 'border-blue-100 bg-white text-blue-800',
  green: 'border-emerald-100 bg-white text-emerald-800',
  warm: 'border-amber-100 bg-white text-amber-800',
  slate: 'border-slate-100 bg-white text-slate-800',
  red: 'border-red-100 bg-white text-red-700'
};

export function MetricCard({
  label,
  value,
  hint,
  tone = 'slate',
  icon
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  icon?: ReactNode;
}) {
  return (
    <div className={`min-w-0 rounded-lg border p-3 shadow-sm ${toneClass[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold opacity-80">{label}</span>
        {icon && <span className="shrink-0">{icon}</span>}
      </div>
      <strong className="mt-2 block break-words text-xl font-black leading-tight tracking-normal">{value}</strong>
      {hint && <span className="mt-1 block text-[11px] leading-4 opacity-75">{hint}</span>}
    </div>
  );
}
