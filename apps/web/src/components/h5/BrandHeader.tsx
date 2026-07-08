import type { ReactNode } from 'react';
import brandLogo from '../../assets/brand-logo.png';

export function BrandHeader({
  eyebrow = '法灵 AI',
  title,
  description,
  action,
  meta
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <header className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <img className="size-11 shrink-0 rounded-xl object-cover shadow-md shadow-blue-100" src={brandLogo} alt="法灵 AI" loading="eager" />
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-normal text-blue-700">{eyebrow}</p>
            <h1 className="mt-1 break-words text-2xl font-black leading-tight tracking-normal text-slate-950">{title}</h1>
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {description && <p className="text-sm leading-6 text-slate-500">{description}</p>}
      {meta && <div>{meta}</div>}
    </header>
  );
}
