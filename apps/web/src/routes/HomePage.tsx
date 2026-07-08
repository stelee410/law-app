import { Link, useNavigate } from '@tanstack/react-router';
import { Check, ChevronRight, MessageCircle, Search } from 'lucide-react';
import loginHero from '../assets/login-hero.png';
import { BrandHeader } from '../components/h5/BrandHeader';
import { CaseCard } from '../components/h5/CaseCard';
import { EmptyState } from '../components/h5/EmptyState';
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
      <BrandHeader
        title={`你好，${user?.name ?? '用户'}`}
        description="专注 AI 法律服务，让维权更简单"
        action={
          <div className="flex gap-2 text-slate-600">
            <span className="grid size-9 place-items-center rounded-lg bg-white shadow-sm">
              <Search size={19} />
            </span>
            <Link to="/messages" className="grid size-9 place-items-center rounded-lg bg-white shadow-sm" aria-label="消息">
              <MessageCircle size={19} />
            </Link>
          </div>
        }
      />

      <section className="overflow-hidden rounded-lg border border-blue-100 bg-white shadow-sm">
        <img className="h-28 w-full object-cover" src={loginHero} alt="AI 法律服务协作" loading="eager" />
        <div className="p-4">
          <h2 className="break-words text-2xl font-black leading-tight tracking-normal">AI帮你追回应收账款</h2>
          <div className="mt-3 space-y-2 text-sm leading-5 text-slate-600">
            {['智能分析证据，高效追款', '律师函在线生成，一键发送', '全程进度跟踪，回款更有保障'].map((item) => (
              <p className="flex gap-2" key={item}>
                <Check className="mt-0.5 shrink-0 text-emerald-600" size={15} />
                <span className="break-words">{item}</span>
              </p>
            ))}
          </div>
          <Link
            to="/cases/new"
            search={{ caseType: 'debt_collection' }}
            className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-black text-white shadow-sm shadow-blue-100"
          >
            立即发起
            <ChevronRight size={17} />
          </Link>
        </div>
      </section>

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
          <EmptyState
            title="暂无案件"
            description={casesQuery.isError ? '案件数据暂未同步，可先发起追偿或稍后刷新。' : '发起第一笔追偿后，案件进度会显示在这里。'}
            action={
              <Link to="/cases/new" search={{ caseType: 'debt_collection' }} className="inline-flex h-11 items-center rounded-lg bg-blue-600 px-4 font-black text-white">
              立即发起
              </Link>
            }
          />
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
