import { Check } from 'lucide-react';
import type { CaseStage } from '../../lib/types';

export function Timeline({ stages }: { stages: CaseStage[] }) {
  if (stages.length === 0) {
    return <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-500">案件阶段将在提交证据后生成。</p>;
  }

  return (
    <div className="space-y-4">
      {stages.map((stage) => (
        <div className="grid grid-cols-[1.75rem_1fr] gap-3" key={stage.key}>
          <span
            className={`mt-0.5 grid size-7 place-items-center rounded-full ${
              stage.status === 'done'
                ? 'bg-emerald-100 text-emerald-700'
                : stage.status === 'active'
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-slate-200 text-slate-500'
            }`}
          >
            {stage.status === 'done' ? <Check size={15} /> : stage.status === 'active' ? '' : ''}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <strong className="break-words text-sm text-slate-950">{stage.title}</strong>
              {stage.status === 'active' && (
                <em className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold not-italic text-blue-700">进行中</em>
              )}
            </span>
            <small className="mt-1 block break-words text-sm leading-5 text-slate-500">{stage.description}</small>
            {stage.at && <time className="mt-1 block text-xs text-slate-400">{stage.at}</time>}
          </span>
        </div>
      ))}
    </div>
  );
}
