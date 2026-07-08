import { BriefcaseBusiness, FileSearch, HandCoins, ScrollText, UsersRound } from 'lucide-react';

const features = [
  { label: '欠款追偿', icon: HandCoins, tone: 'bg-blue-50 text-blue-700' },
  { label: '律师函', icon: ScrollText, tone: 'bg-[#f5f4ed] text-[#8a4b36]' },
  { label: '劳动争议', icon: UsersRound, tone: 'bg-emerald-50 text-emerald-700' },
  { label: '租赁纠纷', icon: BriefcaseBusiness, tone: 'bg-slate-100 text-slate-700' },
  { label: '合同审查', icon: FileSearch, tone: 'bg-amber-50 text-amber-700' }
] as const;

export function FeatureStrip({ onStart }: { onStart?: () => void }) {
  return (
    <section className="grid grid-cols-5 gap-2">
      {features.map((item) => {
        const Icon = item.icon;
        return (
          <button
            className="flex min-w-0 flex-col items-center gap-2 rounded-lg bg-white px-1.5 py-3 text-center shadow-sm"
            key={item.label}
            type="button"
            onClick={item.label === '欠款追偿' ? onStart : undefined}
          >
            <span className={`grid size-9 place-items-center rounded-lg ${item.tone}`}>
              <Icon size={20} />
            </span>
            <span className="w-full text-[11px] font-bold leading-4 text-slate-700">{item.label}</span>
          </button>
        );
      })}
    </section>
  );
}
