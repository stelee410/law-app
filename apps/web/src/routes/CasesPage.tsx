import { Link } from '@tanstack/react-router';
import { FilePlus2, Plus } from 'lucide-react';
import { BrandHeader } from '../components/h5/BrandHeader';
import { CaseCard } from '../components/h5/CaseCard';
import { EmptyState } from '../components/h5/EmptyState';
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
      <header className="space-y-4">
        <BrandHeader
          title="案件"
          description="所有追偿案件、证据进度和服务状态统一归档"
          action={
            <Link to="/cases/new" className="flex h-10 items-center gap-1 rounded-lg bg-blue-600 px-3 text-sm font-black text-white shadow-sm shadow-blue-100">
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
        <EmptyState
          icon={<FilePlus2 size={24} />}
          title="暂无案件"
          description="你发起的追偿案件会统一归档在这里。"
          action={
            <Link to="/cases/new" className="inline-flex h-11 items-center rounded-lg bg-blue-600 px-4 font-black text-white">
              发起追偿
            </Link>
          }
        />
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
