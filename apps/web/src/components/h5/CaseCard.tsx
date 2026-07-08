import { Link } from '@tanstack/react-router';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { getCaseCatalogItem } from '../../lib/caseCatalog';
import { formatDate, formatMoney } from '../../lib/format';
import { evidenceProgress } from '../../lib/viewModel';
import type { LawCase } from '../../lib/types';

export function CaseCard({ lawCase }: { lawCase: LawCase }) {
  const progress = evidenceProgress(lawCase);
  const catalog = getCaseCatalogItem(lawCase.caseType);

  return (
    <Link
      to="/cases/$caseId"
      params={{ caseId: lawCase.id }}
      className="block rounded-lg border border-slate-100 bg-white p-4 shadow-sm transition active:scale-[0.99]"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-slate-50 text-blue-700">
          <ShieldCheck size={22} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 flex-wrap items-start gap-2">
            <strong className="min-w-[8rem] flex-1 break-words text-base leading-5 text-slate-950">{lawCase.debtorName}</strong>
            <em className="max-w-full break-words rounded-full bg-slate-100 px-2 py-1 text-[11px] font-bold not-italic text-slate-700">
              {lawCase.status}
            </em>
          </span>
          <span className="mt-1 block text-xs font-bold text-blue-700">{catalog.label}</span>
          <span className="mt-2 block text-sm font-black text-slate-900">{formatMoney(lawCase.amount)}</span>
          <span className="mt-1 block break-words text-xs leading-5 text-slate-500">
            {lawCase.caseNo} · {formatDate(lawCase.createdAt)} · {progress.label}
          </span>
        </span>
        <ChevronRight className="mt-3 shrink-0 text-slate-400" size={18} />
      </div>
    </Link>
  );
}
