import { Link, useParams } from '@tanstack/react-router';
import { AlertTriangle, ArrowLeft, Bot, CheckCircle2 } from 'lucide-react';
import { AssessmentSummary } from '../components/h5/AssessmentSummary';
import { StateBlock } from '../components/StateBlock';
import { useEvaluateCaseMutation, useCaseQuery } from '../hooks/useCaseQueries';
import { getCaseCatalogItem } from '../lib/caseCatalog';

export function AssessmentPage() {
  const { caseId } = useParams({ strict: false }) as { caseId: string };
  const caseQuery = useCaseQuery(caseId);
  const evaluate = useEvaluateCaseMutation(caseId);
  const lawCase = caseQuery.data;
  const assessment = lawCase?.assessment;

  if (!lawCase) return <StateBlock title="评估数据加载中" />;
  const catalog = getCaseCatalogItem(lawCase.caseType);
  const missingRequiredEvidence = lawCase.evidence.filter((category) =>
    category.required && category.files.length === 0 && category.status !== 'recognized'
  );
  const hasMissingRequiredEvidence = missingRequiredEvidence.length > 0;

  return (
    <div className="space-y-5">
      <Link to="/cases/$caseId" params={{ caseId }} className="flex items-center gap-2 text-sm font-bold text-slate-600">
        <ArrowLeft size={17} />
        返回案件
      </Link>

      <header>
        <p className="text-sm font-bold text-blue-700">AI评估结果 · {catalog.label}</p>
        <h1 className="mt-1 break-words text-2xl font-black tracking-normal">{lawCase.debtorName}</h1>
      </header>

      {!assessment && (
        <section className="space-y-4 rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3 rounded-lg border border-amber-100 bg-amber-50 p-3 text-amber-800">
            <Bot className="mt-0.5 shrink-0" size={22} />
            <div>
              <strong className="block">开始 AI 案件评估</strong>
              <span className="mt-1 block text-sm leading-6">系统会读取案件事实、核验证据完整度，并生成胜率与路径建议。</span>
            </div>
          </div>
          {hasMissingRequiredEvidence && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-sm font-semibold leading-6 text-amber-800">
              <span className="flex items-center gap-2 font-black">
                <AlertTriangle size={17} />
                必传材料未补齐
              </span>
              <span className="mt-1 block">
                还缺 {missingRequiredEvidence.map((item) => item.name).join('、')}，补齐后才能开始评估。
              </span>
              <Link to="/cases/$caseId/evidence" params={{ caseId }} className="mt-3 inline-flex h-10 items-center rounded-lg bg-white px-4 font-black text-amber-800">
                去补充证据
              </Link>
            </div>
          )}
          {['读取案件事实', '核验证据完整度', '生成胜率与路径'].map((item, index) => (
            <div key={item} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
              <span className={`grid size-9 place-items-center rounded-full ${index === 0 ? 'bg-blue-100 text-blue-700' : 'bg-slate-200 text-slate-500'}`}>
                {index + 1}
              </span>
              <strong>{item}</strong>
            </div>
          ))}
          {evaluate.isError && <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">评估失败，请稍后重试。</div>}
          <button className="h-12 w-full rounded-lg bg-blue-600 px-3 font-black text-white shadow-sm shadow-blue-100 disabled:opacity-50" type="button" disabled={evaluate.isPending || hasMissingRequiredEvidence} onClick={() => evaluate.mutate(undefined)}>
            {hasMissingRequiredEvidence ? '请先补齐必传材料' : evaluate.isPending ? '评估中' : '开始评估'}
          </button>
        </section>
      )}

      {assessment && (
        <>
          <div className={`flex items-center gap-2 rounded-lg p-3 text-sm font-bold ${hasMissingRequiredEvidence ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {hasMissingRequiredEvidence ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />}
            {hasMissingRequiredEvidence ? '关键材料缺失，已生成初步评估' : '证据已上传，AI评估完成'}
          </div>
          <AssessmentSummary assessment={assessment} caseId={caseId} selectedPlan={lawCase.selectedPlan} />
        </>
      )}
    </div>
  );
}
