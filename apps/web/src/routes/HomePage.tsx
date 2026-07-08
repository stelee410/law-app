import { Link, useNavigate } from '@tanstack/react-router';
import { Check, ChevronRight, FilePlus2, MessageCircle, Search, Scale } from 'lucide-react';
import { CaseCard } from '../components/h5/CaseCard';
import { FeatureStrip } from '../components/h5/FeatureStrip';
import { MetricCard } from '../components/h5/MetricCard';
import { SectionHeader } from '../components/h5/SectionHeader';
import { useCasesQuery } from '../hooks/useCaseQueries';
import type { CaseType } from '../lib/types';
import { deriveDashboard } from '../lib/viewModel';
import { useAuthStore } from '../state/authStore';

export function HomePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const casesQuery = useCasesQuery();
  const cases = casesQuery.data ?? [];
  const dashboard = deriveDashboard(cases);

  function startCase(caseType: CaseType = 'debt_collection') {
    void navigate({ to: '/cases/new', search: { caseType } });
  }

  return (
    <div className="space-y-5">
      <header className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-black text-blue-700">
              <strong>法灵</strong>
              <span>AI法务</span>
            </div>
            <h1 className="mt-2 break-words text-2xl font-black leading-tight tracking-normal text-slate-950">
              你好，{user?.name ?? '用户'}
            </h1>
            <p className="mt-1 text-sm leading-5 text-slate-500">专注 AI 法律服务，让维权更简单</p>
          </div>
          <div className="flex shrink-0 gap-2 text-slate-600">
            <span className="grid size-9 place-items-center rounded-lg bg-white shadow-sm">
              <Search size={19} />
            </span>
            <Link to="/messages" className="grid size-9 place-items-center rounded-lg bg-white shadow-sm">
              <MessageCircle size={19} />
            </Link>
          </div>
        </div>

        <section className="overflow-hidden rounded-lg bg-slate-950 p-5 text-white shadow-lg shadow-slate-300">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white text-blue-700">
              <Scale size={24} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-2xl font-black leading-tight tracking-normal">AI帮你追回应收账款</h2>
              <div className="mt-3 space-y-2 text-sm leading-5 text-slate-200">
                {['智能分析证据，高效追款', '律师函在线生成，一键发送', '全程进度跟踪，回款更有保障'].map((item) => (
                  <p className="flex gap-2" key={item}>
                    <Check className="mt-0.5 shrink-0 text-emerald-300" size={15} />
                    <span className="break-words">{item}</span>
                  </p>
                ))}
              </div>
              <Link
                to="/cases/new"
                search={{ caseType: 'debt_collection' }}
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white"
              >
                立即发起
                <ChevronRight size={17} />
              </Link>
            </div>
          </div>
        </section>
      </header>

      <FeatureStrip onStart={startCase} />

      <section className="grid grid-cols-2 gap-3">
        {dashboard.metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="我的案件"
          subtitle={casesQuery.isPending ? '正在同步案件数据' : '最近三笔案件状态'}
          action={
            <Link to="/cases" className="flex items-center gap-1 text-sm font-bold text-blue-700">
              全部案件
              <ChevronRight size={16} />
            </Link>
          }
        />
        {casesQuery.isError && cases.length > 0 && (
          <div className="rounded-lg bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">案件列表加载失败，请稍后重试。</div>
        )}
        {!casesQuery.isPending && cases.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-center">
            <FilePlus2 className="mx-auto text-blue-600" size={34} />
            <strong className="mt-3 block">暂无案件</strong>
            <span className="mt-1 block text-sm leading-6 text-slate-500">
              {casesQuery.isError ? '案件数据暂未同步，可先发起追偿或稍后刷新。' : '发起第一笔追偿后，案件进度会显示在这里。'}
            </span>
            <Link to="/cases/new" search={{ caseType: 'debt_collection' }} className="mt-4 inline-flex h-11 items-center rounded-lg bg-blue-600 px-4 font-black text-white">
              立即发起
            </Link>
          </div>
        )}
        {!casesQuery.isError &&
          dashboard.latestCases.map((item) => (
            <CaseCard key={item.id} lawCase={item} />
          ))}
      </section>

      <section className="space-y-3">
        <SectionHeader title="今日进展" subtitle="证据、评估和服务阶段的最新提醒" />
        <div className="space-y-2">
          {dashboard.todayProgress.map((item) => (
            <a key={item.id} href={item.href} className="block rounded-lg bg-white p-4 shadow-sm">
              <strong className="block break-words text-sm text-slate-950">{item.title}</strong>
              <span className="mt-1 block break-words text-sm leading-6 text-slate-500">{item.body}</span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
