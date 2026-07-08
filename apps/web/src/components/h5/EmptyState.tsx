import type { ReactNode } from 'react';
import { FilePlus2 } from 'lucide-react';

export function EmptyState({
  icon,
  title,
  description,
  action
}: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-slate-100 bg-white px-5 py-6 text-center shadow-sm">
      <span className="mx-auto grid size-12 place-items-center rounded-lg bg-slate-50 text-blue-700">
        {icon ?? <FilePlus2 size={24} />}
      </span>
      <strong className="mt-3 block text-base text-slate-950">{title}</strong>
      <p className="mt-2 text-sm leading-6 text-slate-500">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </section>
  );
}
