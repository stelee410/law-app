import type { ReactNode } from 'react';
import type { Tone } from '../../lib/viewModel';

const toneClass: Record<Tone, string> = {
  blue: 'bg-blue-50 text-blue-800',
  green: 'bg-emerald-50 text-emerald-800',
  warm: 'bg-[#f5f4ed] text-[#8a4b36]',
  slate: 'bg-slate-100 text-slate-800',
  red: 'bg-red-50 text-red-700'
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
    <div className={`min-w-0 rounded-lg p-3 ${toneClass[tone]}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-semibold opacity-80">{label}</span>
        {icon && <span className="shrink-0">{icon}</span>}
      </div>
      <strong className="mt-2 block break-words text-xl font-black leading-tight tracking-normal">{value}</strong>
      {hint && <span className="mt-1 block text-[11px] leading-4 opacity-75">{hint}</span>}
    </div>
  );
}
