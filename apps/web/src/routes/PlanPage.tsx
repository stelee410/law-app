import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, BadgeCheck, Headphones, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { PlanCard } from '../components/h5/PlanCard';
import { SectionHeader } from '../components/h5/SectionHeader';
import { StateBlock } from '../components/StateBlock';
import { useCaseQuery, useSelectPlanMutation } from '../hooks/useCaseQueries';
import { getCaseCatalogItem } from '../lib/caseCatalog';
import type { PlanId } from '../lib/types';

export function PlanPage() {
  const navigate = useNavigate();
  const { caseId } = useParams({ strict: false }) as { caseId: string };
  const caseQuery = useCaseQuery(caseId);
  const selectPlan = useSelectPlanMutation(caseId);
  const [pendingPlanId, setPendingPlanId] = useState<PlanId | null>(null);
  const lawCase = caseQuery.data;
  const plans = lawCase?.assessment?.plans ?? [];
  const planLocked = Boolean(lawCase?.selectedPlan);
  const pendingPlan = plans.find((plan) => plan.id === pendingPlanId);

  async function handleSelect(planId: PlanId) {
    if (planLocked) return;
    await selectPlan.mutateAsync(planId);
    await navigate({ to: '/cases/$caseId', params: { caseId } });
  }

  if (!lawCase) return <StateBlock title="方案加载中" />;
  const catalog = getCaseCatalogItem(lawCase.caseType);

  return (
    <div className="space-y-5">
      <Link to="/cases/$caseId" params={{ caseId }} className="flex items-center gap-2 text-sm font-bold text-slate-600">
        <ArrowLeft size={17} />
        返回案件
      </Link>

      <header>
        <p className="text-sm font-bold text-blue-700">服务方案 · {catalog.label}</p>
        <h1 className="mt-1 text-2xl font-black tracking-normal">选择案件闭环路径</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">基于案件金额、证据完整度和回款目标推荐服务方案。</p>
      </header>

      {plans.length === 0 && (
        <section className="rounded-lg border border-slate-100 bg-white p-5 text-center shadow-sm">
          <ShieldCheck className="mx-auto text-blue-600" size={34} />
          <strong className="mt-3 block">需要先完成 AI 评估</strong>
          <Link to="/cases/$caseId/assessment" params={{ caseId }} className="mt-4 block h-12 rounded-lg bg-blue-600 pt-3 font-black text-white shadow-sm shadow-blue-100">
            前往评估
          </Link>
        </section>
      )}

      <section className="space-y-3">
        {plans.length > 0 && <SectionHeader title="为你推荐最佳方案" subtitle="可先选择轻量服务，后续按进度升级" />}
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            selected={lawCase.selectedPlan === plan.id}
            locked={planLocked}
            pending={selectPlan.isPending}
            onSelect={() => setPendingPlanId(plan.id)}
          />
        ))}
      </section>

      <section className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-black">平台保障</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-semibold text-slate-700">
          <span className="flex items-center gap-2 rounded-lg bg-blue-50 p-3 text-blue-700">
            <BadgeCheck size={18} />
            律师审核
          </span>
          <span className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-700">
            <Headphones size={18} />
            顾问跟进
          </span>
          <span className="flex items-center gap-2 rounded-lg bg-slate-50 p-3">
            <ShieldCheck size={18} />
            资金安全
          </span>
          <span className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-amber-800">
            <ShieldCheck size={18} />
            隐私保护
          </span>
        </div>
      </section>
      {pendingPlan && (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" role="dialog" aria-modal="true" aria-labelledby="plan-confirm-title">
          <section className="mx-auto w-full max-w-[430px] rounded-t-2xl bg-white p-4 shadow-2xl">
            <h2 id="plan-confirm-title" className="text-lg font-black tracking-normal text-slate-950">确认选择服务方案</h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              选择后将按“{pendingPlan.name}”生成后续待办，演示环境暂不进入真实支付。
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="h-12 rounded-lg bg-slate-100 font-black text-slate-700" type="button" disabled={selectPlan.isPending} onClick={() => setPendingPlanId(null)}>
                再看看
              </button>
              <button className="h-12 rounded-lg bg-blue-600 font-black text-white shadow-sm shadow-blue-100 disabled:opacity-50" type="button" disabled={selectPlan.isPending} onClick={() => handleSelect(pendingPlan.id)}>
                确认选择
              </button>
            </div>
          </section>
        </div>
      )}
      {selectPlan.isError && <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">方案选择失败，请稍后重试。</div>}
    </div>
  );
}
