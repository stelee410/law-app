import { Link } from '@tanstack/react-router';
import { Plus } from 'lucide-react';
import { CaseCard } from '../components/h5/CaseCard';
import { MetricCard } from '../components/h5/MetricCard';
import { SectionHeader } from '../components/h5/SectionHeader';
import { StateBlock } from '../components/StateBlock';
import { useCasesQuery } from '../hooks/useCaseQueries';
import { deriveDashboard } from '../lib/viewModel';

export function CasesPage() {
  const casesQuery = useCasesQuery();
  const cases = casesQuery.data ?? [];
  const dashboard = deriveDashboard(cases);

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <SectionHeader
          title="案件"
          subtitle="所有追偿案件、证据进度和服务状态统一归档"
          action={
            <Link to="/cases/new" className="flex h-9 items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm font-black text-white">
              <Plus size={16} />
              新建
            </Link>
          }
        />
        <section className="grid grid-cols-2 gap-3">
          {dashboard.metrics.slice(0, 2).map((metric) => (
            <MetricCard key={metric.label} {...metric} />
          ))}
        </section>
      </header>

      {casesQuery.isPending && <StateBlock title="案件同步中" />}
      {casesQuery.isError && (
        <section className="rounded-lg bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
          案件列表加载失败，请检查本地 API 或稍后重试。
        </section>
      )}
      {!casesQuery.isPending && !casesQuery.isError && cases.length === 0 && (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
          <strong className="block text-lg">暂无案件</strong>
          <span className="mt-2 block text-sm leading-6 text-slate-500">你发起的追偿案件会统一归档在这里。</span>
          <Link to="/cases/new" className="mt-4 inline-flex h-11 items-center rounded-lg bg-blue-600 px-4 font-black text-white">
            发起追偿
          </Link>
        </section>
      )}
      {!casesQuery.isError && cases.length > 0 && (
        <section className="space-y-3">
          {cases.map((lawCase) => (
            <CaseCard key={lawCase.id} lawCase={lawCase} />
          ))}
        </section>
      )}
    </div>
  );
}
