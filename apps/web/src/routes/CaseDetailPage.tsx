import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, Check, CheckCircle2, ChevronRight, ClipboardCopy, CloudUpload, Contact, Download, FileCheck2, FileSearch, Headphones, MessageCircle, Radio, Scale, Send, UploadCloud } from 'lucide-react';
import { useState } from 'react';
import { MetricCard } from '../components/h5/MetricCard';
import { SectionHeader } from '../components/h5/SectionHeader';
import { Timeline } from '../components/h5/Timeline';
import { StateBlock } from '../components/StateBlock';
import { useCaseEvents } from '../hooks/useCaseEvents';
import { useApproveDocumentMutation, useCaseDocumentsQuery, useCaseQuery, useCaseWorkItemsQuery, useRecordSelfServiceActionMutation } from '../hooks/useCaseQueries';
import { getCaseCatalogItem } from '../lib/caseCatalog';
import { fileSizeLabel, formatDate, formatMoney } from '../lib/format';
import type { CaseStage, SelfServiceActionInput } from '../lib/types';
import { deriveLatestProgress, evidenceProgress, stageProgress } from '../lib/viewModel';

export function CaseDetailPage() {
  const { caseId } = useParams({ strict: false }) as { caseId: string };
  const caseQuery = useCaseQuery(caseId);
  const workItemsQuery = useCaseWorkItemsQuery(caseId);
  const documentsQuery = useCaseDocumentsQuery(caseId);
  const approveDocument = useApproveDocumentMutation(caseId);
  const recordSelfServiceAction = useRecordSelfServiceActionMutation(caseId);
  const { events, connected } = useCaseEvents(caseId, Boolean(caseQuery.data));
  const lawCase = caseQuery.data;
  const [expandedDocumentIds, setExpandedDocumentIds] = useState<Set<string>>(() => new Set());

  if (caseQuery.isPending) return <StateBlock title="案件加载中" />;
  if (!lawCase) return <StateBlock title="案件不存在" />;

  const evidence = evidenceProgress(lawCase);
  const stages = stageProgress(lawCase.stages);
  const isSelfService = lawCase.selectedPlan === 'self-service';
  const displayStages = isSelfService
    ? normalizeSelfServiceStages(lawCase.stages)
    : lawCase.stages;
  const displayCase = isSelfService ? { ...lawCase, stages: displayStages } : lawCase;
  const latest = deriveLatestProgress(displayCase, events);
  const catalog = getCaseCatalogItem(lawCase.caseType);
  const workItems = workItemsQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const pendingDocuments = isSelfService ? [] : documents.filter((document) => document.status === 'pending_client_approval');
  const selfServiceDocuments = isSelfService
    ? documents.filter((document) => document.status === 'approved' && document.fields.source === 'ai_self_service')
    : [];
  const missingRequiredEvidence = lawCase.evidence.filter((category) =>
    category.required && category.files.length === 0 && category.status !== 'recognized'
  );
  const nextAction = missingRequiredEvidence.length > 0
    ? { href: `/cases/${caseId}/evidence`, label: '补充必传证据' }
    : !lawCase.assessment
      ? { href: `/cases/${caseId}/assessment`, label: '生成AI评估' }
      : !lawCase.selectedPlan
        ? { href: `/cases/${caseId}/plans`, label: '选择服务方案' }
        : pendingDocuments.length > 0
          ? { href: `/cases/${caseId}#pending-documents`, label: '确认待办文书' }
          : isSelfService
            ? { href: `#self-service-actions`, label: '继续自助处理' }
            : { href: '/messages', label: '查看服务通知' };
  const serviceTitle = isSelfService ? 'AI自助处理包' : lawCase.selectedPlan ? '律师服务闭环' : '服务待选择';
  const serviceSubtitle = isSelfService ? '复制或下载 AI 模板，自行处理后记录凭证、回应和下一步结果' : '服务方案选择后，待办、复核意见和文书确认会在这里汇总';

  function toggleDocument(documentId: string) {
    setExpandedDocumentIds((current) => {
      const next = new Set(current);
      if (next.has(documentId)) {
        next.delete(documentId);
      } else {
        next.add(documentId);
      }
      return next;
    });
  }

  const primarySelfServiceDocument = selfServiceDocuments[0];

  function recordAction(input: SelfServiceActionInput) {
    recordSelfServiceAction.mutate(input);
  }

  async function handleCopyTemplate() {
    if (primarySelfServiceDocument?.body && navigator.clipboard) {
      await navigator.clipboard.writeText(primarySelfServiceDocument.body).catch(() => undefined);
    }
    recordAction({ action: 'copy_template', note: '用户已复制 AI 自助模板' });
  }

  function handleDownloadTemplate() {
    if (primarySelfServiceDocument) {
      const blob = new Blob([primarySelfServiceDocument.body], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${primarySelfServiceDocument.title}.txt`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
    recordAction({ action: 'download_template', note: '用户已下载 AI 自助模板' });
  }

  return (
    <div className="space-y-5">
      <Link to="/cases" className="flex items-center gap-2 text-sm font-bold text-slate-600">
        <ArrowLeft size={17} />
        返回案件列表
      </Link>

      <section className="overflow-hidden rounded-lg border border-blue-100 bg-white p-5 text-slate-950 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
            <Scale size={25} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="break-words text-2xl font-black tracking-normal">{lawCase.debtorName}</h1>
            <p className="mt-1 break-words text-sm leading-5 text-slate-500">
              {catalog.label} · {lawCase.caseNo} · {formatDate(lawCase.createdAt)}
            </p>
            <strong className="mt-4 block break-words text-3xl tracking-normal">{formatMoney(lawCase.amount)}</strong>
          </div>
        </div>
        <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-600">
          当前阶段：<b>{lawCase.status}</b>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <MetricCard label="证据进度" value={evidence.label} hint={`${evidence.percent}% 完成`} tone="blue" />
        <MetricCard label="案件阶段" value={stages.label} hint={connected ? '实时连接' : '等待事件'} tone={connected ? 'green' : 'slate'} />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Link to="/cases/$caseId/evidence" params={{ caseId }} className="rounded-lg bg-white p-4 shadow-sm">
          <CloudUpload className="text-blue-600" size={24} />
          <strong className="mt-3 block">证据上传</strong>
          <span className="mt-1 block text-sm leading-5 text-slate-500">{evidence.label}</span>
        </Link>
        <Link to="/cases/$caseId/plans" params={{ caseId }} className="rounded-lg bg-white p-4 shadow-sm">
          <FileSearch className="text-emerald-600" size={24} />
          <strong className="mt-3 block">方案选择</strong>
          <span className="mt-1 block text-sm leading-5 text-slate-500">{lawCase.selectedPlan ? '已选择服务方案' : '待确认'}</span>
        </Link>
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <SectionHeader title="案件进度" />
          <span className={`flex shrink-0 items-center gap-1 text-xs font-bold ${connected ? 'text-emerald-600' : 'text-slate-400'}`}>
            <Radio size={14} />
            {connected ? '实时连接' : '等待事件'}
          </span>
        </div>
        <Timeline stages={displayStages} />
      </section>

      <section className="rounded-lg border border-amber-100 bg-amber-50 p-4 text-amber-900 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-black">
          <MessageCircle size={20} />
          最新进展
          <span className="ml-auto text-xs font-semibold opacity-70">{latest.time}</span>
        </div>
        <p className="mt-2 break-words text-sm leading-6">{latest.body}</p>
        <a href={nextAction.href || latest.href} className="mt-3 flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm font-bold">
          平台建议：{nextAction.label}
          <ChevronRight size={17} />
        </a>
      </section>

      {lawCase.selectedPlan && (
        <section id="pending-documents" className="rounded-lg bg-white p-4 shadow-sm">
          <SectionHeader title={serviceTitle} subtitle={serviceSubtitle} />
          <div className="mt-4 space-y-3">
            {workItems.map((item) => (
              <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm leading-6">
                <div className="flex items-center justify-between gap-3">
                  <strong>{item.title}</strong>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${workItemStatusClass(item.status)}`}>
                    {workItemStatusLabel(item.status)}
                  </span>
                </div>
                <p className="mt-1 text-slate-500">{item.summary}</p>
              </div>
            ))}
            {selfServiceDocuments.map((document) => {
              const expanded = expandedDocumentIds.has(document.id);
              return (
                <div key={document.id} className="rounded-lg border border-emerald-100 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
                  <div className="flex items-start justify-between gap-3">
                    <strong className="min-w-0 break-words">{document.title}</strong>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-black text-emerald-700">AI生成</span>
                  </div>
                  <p className={`mt-2 whitespace-pre-wrap break-words text-slate-600 ${expanded ? '' : 'max-h-24 overflow-hidden'}`}>
                    {document.body}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-3 text-xs font-semibold text-emerald-800">
                    <span>下一步建议见 AI 自助任务摘要</span>
                    <button className="shrink-0 font-black text-emerald-700" type="button" onClick={() => toggleDocument(document.id)}>
                      {expanded ? '收起全文' : '展开全文'}
                    </button>
                  </div>
                </div>
              );
            })}
            {pendingDocuments.map((document) => (
              <div key={document.id} className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm leading-6 text-blue-900">
                <strong className="block">{document.title}</strong>
                <p className="mt-1 break-words">{document.body}</p>
                <button
                  className="mt-3 h-10 w-full rounded-lg bg-blue-600 font-black text-white disabled:opacity-50"
                  type="button"
                  disabled={approveDocument.isPending}
                  onClick={() => approveDocument.mutate(document.id)}
                >
                  确认文书并进入下一阶段
                </button>
              </div>
            ))}
            {workItems.length === 0 && pendingDocuments.length === 0 && selfServiceDocuments.length === 0 && (
              <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-500">等待系统生成服务待办。</p>
            )}
          </div>
        </section>
      )}

      {isSelfService && (
        <section id="self-service-actions" className="rounded-lg border border-emerald-100 bg-white p-4 shadow-sm">
          <SectionHeader
            title="399 自助闭环"
            subtitle="平台只提供模板和指引；请自行处理后记录凭证、回应和结案结果"
          />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-100 px-2 text-sm font-black text-slate-700 disabled:opacity-50"
              type="button"
              disabled={recordSelfServiceAction.isPending || !primarySelfServiceDocument}
              onClick={() => void handleCopyTemplate()}
            >
              <ClipboardCopy size={16} />
              复制文案
            </button>
            <button
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-100 px-2 text-sm font-black text-slate-700 disabled:opacity-50"
              type="button"
              disabled={recordSelfServiceAction.isPending || !primarySelfServiceDocument}
              onClick={handleDownloadTemplate}
            >
              <Download size={16} />
              下载模板
            </button>
            <button
              className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-2 text-sm font-black text-white shadow-sm shadow-blue-100 disabled:opacity-50"
              type="button"
              disabled={recordSelfServiceAction.isPending}
              onClick={() => recordAction({ action: 'mark_sent', channel: '自行发送', note: '用户确认已自行发送或使用 AI 自助材料' })}
            >
              <Send size={16} />
              我已自行发送/使用
            </button>
            <button
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-50 px-2 text-sm font-black text-emerald-700 disabled:opacity-50"
              type="button"
              disabled={recordSelfServiceAction.isPending}
              onClick={() => recordAction({ action: 'upload_proof', channel: '自行留痕', note: '用户已记录送达或处理凭证' })}
            >
              <UploadCloud size={16} />
              已留存凭证
            </button>
            <button
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-2 text-sm font-black text-white disabled:opacity-50"
              type="button"
              disabled={recordSelfServiceAction.isPending}
              onClick={() => recordAction({ action: 'record_response', response: 'paid', note: '用户确认已付款或事项已完成' })}
            >
              <CheckCircle2 size={16} />
              已付款/已完成
            </button>
            <button
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-amber-50 px-2 text-sm font-black text-amber-800 disabled:opacity-50"
              type="button"
              disabled={recordSelfServiceAction.isPending}
              onClick={() => recordAction({ action: 'record_response', response: 'no_response', note: '用户记录对方无回应或拒绝处理' })}
            >
              无回应/拒绝
            </button>
            <button
              className="flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-2 text-sm font-black text-white disabled:opacity-50"
              type="button"
              disabled={recordSelfServiceAction.isPending}
              onClick={() => recordAction({ action: 'upgrade_service', note: '用户申请升级人工复核或代办服务' })}
            >
              升级人工服务
            </button>
          </div>
          <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-xs font-semibold leading-5 text-emerald-800">
            399 自助版不代发、不代理、不出具正式律师函；正式律师函、调解或代办服务需升级人工服务。
          </p>
          {recordSelfServiceAction.isError && (
            <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">自助进度记录失败，请稍后重试。</p>
          )}
        </section>
      )}

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <SectionHeader
          title="证据 checklist"
          action={
            <Link to="/cases/$caseId/evidence" params={{ caseId }} className="text-sm font-bold text-blue-700">
              补充
            </Link>
          }
        />
        <div className="mt-4 space-y-3">
          {lawCase.evidence.map((category) => (
            <Link key={category.id} to="/cases/$caseId/evidence" params={{ caseId }} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3">
              <span className={`grid size-8 shrink-0 place-items-center rounded-full ${category.files.length ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                {category.files.length ? <Check size={16} /> : category.required ? '!' : '-'}
              </span>
              <span className="min-w-0 flex-1">
                <strong className="block break-words text-sm">{category.name}</strong>
                <small className="block truncate text-slate-500">
                  {category.files[0] ? `${category.files[0].name} · ${fileSizeLabel(category.files[0].size)}` : category.required ? '必传材料' : '可选补充'}
                </small>
              </span>
              <ChevronRight className="shrink-0 text-slate-400" size={17} />
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-2">
        <Link to="/cases/$caseId/evidence" params={{ caseId }} className="flex items-center gap-3 rounded-lg bg-white p-4 font-bold shadow-sm">
          <FileCheck2 className="text-blue-600" size={23} />
          <span className="min-w-0 flex-1">
            <span className="block">补充证据</span>
            <small className="block text-sm font-semibold text-slate-500">上传新的证据材料</small>
          </span>
        </Link>
        <Link to="/messages" className="flex items-center gap-3 rounded-lg bg-white p-4 font-bold shadow-sm">
          <Contact className="text-emerald-600" size={23} />
          <span className="min-w-0 flex-1">
            <span className="block">联系顾问</span>
            <small className="block text-sm font-semibold text-slate-500">咨询案件进展</small>
          </span>
        </Link>
        <a href={nextAction.href} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 font-black text-white shadow-sm shadow-blue-100">
          <Headphones size={18} />
          {nextAction.label}
          <ChevronRight size={18} />
        </a>
      </section>
    </div>
  );
}

function workItemStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return '待处理';
    case 'in_progress':
      return '处理中';
    case 'completed':
      return '已完成';
    case 'cancelled':
      return '已取消';
    default:
      return status;
  }
}

function workItemStatusClass(status: string) {
  switch (status) {
    case 'pending':
      return 'bg-slate-100 text-slate-600';
    case 'in_progress':
      return 'bg-blue-100 text-blue-700';
    case 'completed':
      return 'bg-emerald-100 text-emerald-700';
    case 'cancelled':
      return 'bg-slate-200 text-slate-500';
    default:
      return 'bg-slate-100 text-slate-600';
  }
}

function normalizeSelfServiceStages(stages: CaseStage[]) {
  const activePriority = ['filing', 'negotiation', 'letter'];
  const activeStageKey = activePriority.find((key) => stages.some((stage) => stage.key === key && stage.status === 'active'));

  return stages.map((stage) => {
    const normalizedStage = activeStageKey && stage.status === 'active' && stage.key !== activeStageKey
      ? { ...stage, status: 'done' as const }
      : stage;
    if (normalizedStage.key !== 'letter') return normalizedStage;
    return {
      ...normalizedStage,
      title: 'AI自助处理包',
      description:
        normalizedStage.status === 'done'
          ? 'AI自助处理包已使用并记录结果'
          : '复制或下载模板，自行发送后记录送达凭证与回应'
    };
  });
}
