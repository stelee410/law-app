import { BriefcaseBusiness, FileSearch, HandCoins, ScrollText, UsersRound } from 'lucide-react';
import { caseTypeOptions } from '../../lib/caseCatalog';
import type { CaseType } from '../../lib/types';

const features = [
  { type: 'debt_collection', icon: HandCoins, tone: 'bg-blue-50 text-blue-700' },
  { type: 'lawyer_letter', icon: ScrollText, tone: 'bg-[#f5f4ed] text-[#8a4b36]' },
  { type: 'labor_dispute', icon: UsersRound, tone: 'bg-emerald-50 text-emerald-700' },
  { type: 'rental_dispute', icon: BriefcaseBusiness, tone: 'bg-slate-100 text-slate-700' },
  { type: 'contract_review', icon: FileSearch, tone: 'bg-amber-50 text-amber-700' }
] as const;

export function FeatureStrip({ onStart }: { onStart?: (caseType: CaseType) => void }) {
  return (
    <section className="grid grid-cols-5 gap-2">
      {features.map((item) => {
        const Icon = item.icon;
        const catalog = caseTypeOptions.find((option) => option.type === item.type);
        return (
          <button
            className="flex min-w-0 flex-col items-center gap-2 rounded-lg bg-white px-1.5 py-3 text-center shadow-sm"
            key={item.type}
            type="button"
            onClick={() => onStart?.(item.type)}
          >
            <span className={`grid size-9 place-items-center rounded-lg ${item.tone}`}>
              <Icon size={20} />
            </span>
            <span className="w-full text-[11px] font-bold leading-4 text-slate-700">{catalog?.label}</span>
          </button>
        );
      })}
    </section>
  );
}
