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
        <p className="mt-2 text-sm leading-6 text-slate-500">先看服务内容和边界，再按预算与处理深度选择对应费用。</p>
      </header>

      <section className="rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
        <SectionHeader title="我们提供什么" subtitle="399、1499、5999 是三条不同服务路径，不互相混用" />
        <div className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
          <p><b className="text-slate-950">399 AI自助版：</b>平台生成模板和指引，用户自行发送/使用，并记录凭证、回应和结案结果。</p>
          <p><b className="text-slate-950">1499 律师复核版：</b>进入人工/律师复核，支持正式函件或专业意见、协商建议和材料准备。</p>
          <p><b className="text-slate-950">5999 诉前全程跟进版：</b>律师签章定稿后，客户自行发送并提交凭证；律师确认凭证、跟进对方回应，并按结果决定继续协商、结案或准备诉讼/仲裁材料。</p>
        </div>
      </section>

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
        {plans.length > 0 && <SectionHeader title="服务费用" subtitle="确认后按所选方案生成对应待办；演示环境不进入真实支付" />}
        {plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            selected={lawCase.selectedPlan === plan.id}
            active={pendingPlanId === plan.id}
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
            分层服务
          </span>
          <span className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-emerald-700">
            <Headphones size={18} />
            边界清晰
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
