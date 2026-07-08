import { Link } from '@tanstack/react-router';
import { BadgeCheck, CheckCircle2, Headphones, ShieldCheck } from 'lucide-react';
import { formatMoney } from '../../lib/format';
import type { AssessmentResult } from '../../lib/types';
import { MetricCard } from './MetricCard';

export function AssessmentSummary({ assessment, caseId }: { assessment: AssessmentResult; caseId: string }) {
  return (
    <div className="space-y-4">
      <section className="rounded-lg bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-500">案件胜率参考</p>
            <strong className="mt-2 block text-5xl font-black tracking-normal text-blue-700">{assessment.winRate}%</strong>
            <span className="mt-2 inline-block rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              {assessment.confidence}
            </span>
          </div>
          <div className="rounded-lg bg-[#f5f4ed] px-3 py-2 text-right text-xs font-bold leading-5 text-[#8a4b36]">
            AI评估
            <br />
            律师复核
          </div>
        </div>
        <p className="mt-4 break-words text-sm leading-6 text-slate-600">{assessment.summary}</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <MetricCard label="建议路径" value={assessment.suggestedRoute} tone="blue" />
        <MetricCard label="预计周期" value={assessment.estimatedDays} tone="warm" />
        <MetricCard label="预计回收" value={formatMoney(assessment.estimatedRecovery)} tone="green" />
        <MetricCard label="证据可信度" value={assessment.confidence} tone="slate" />
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="text-lg font-black">关键发现</h2>
        <div className="mt-3 space-y-2">
          {assessment.findings.map((finding) => (
            <div key={finding} className="flex gap-2 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700">
              <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={17} />
              <span className="break-words">{finding}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <h2 className="text-lg font-black">法灵平台保障</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold text-slate-700">
          <span className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-blue-700">
            <BadgeCheck size={18} />
            平台律师审核
          </span>
          <span className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-700">
            <Headphones size={18} />
            人类律师兜底
          </span>
          <span className="flex items-center gap-2 rounded-lg bg-slate-50 p-3">
            <ShieldCheck size={18} />
            资金安全保障
          </span>
          <span className="flex items-center gap-2 rounded-lg bg-[#f5f4ed] p-3 text-[#8a4b36]">
            <ShieldCheck size={18} />
            隐私安全保护
          </span>
        </div>
      </section>

      <Link
        to="/cases/$caseId/plans"
        params={{ caseId }}
        className="block h-12 rounded-lg bg-blue-600 pt-3 text-center font-black text-white shadow-lg shadow-blue-200"
      >
        选择服务方案
      </Link>
    </div>
  );
}
