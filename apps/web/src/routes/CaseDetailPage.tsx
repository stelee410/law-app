import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, BookOpenText, Check, CheckCircle2, ChevronRight, ClipboardCopy, CloudUpload, Contact, Download, FileCheck2, FileSearch, FileText, Headphones, Landmark, MessageCircle, Radio, Scale, Send, ShieldCheck, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { MetricCard } from '../components/h5/MetricCard';
import { SectionHeader } from '../components/h5/SectionHeader';
import { Timeline } from '../components/h5/Timeline';
import { StateBlock } from '../components/StateBlock';
import { useCaseEvents } from '../hooks/useCaseEvents';
import { useApproveDocumentMutation, useCaseDocumentsQuery, useCaseQuery, useCaseWorkItemsQuery, useRecordSelfServiceActionMutation } from '../hooks/useCaseQueries';
import { getCaseCatalogItem } from '../lib/caseCatalog';
import { fileSizeLabel, formatDate, formatMoney } from '../lib/format';
import type { CaseStage, LawCase, SelfServiceActionInput } from '../lib/types';
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
  const [selfServiceNotice, setSelfServiceNotice] = useState('');
  const [manualCopySheetOpen, setManualCopySheetOpen] = useState(false);

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
            ? { href: `#self-service-actions`, label: '查看当前任务' }
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
  const primarySelfServiceBody = primarySelfServiceDocument
    ? normalizeSelfServiceDocumentBody(primarySelfServiceDocument.body, lawCase)
    : '';
  const selfServiceStep = getSelfServiceStep(displayStages, lawCase.status, lawCase.caseType);
  const isSelfServiceCompleted = isSelfService && selfServiceStep.key === 'completed';
  const selfServiceCopy = getSelfServiceCopy(lawCase.caseType);
  const supportEvidenceLabel = isSelfServiceCompleted ? '补充留存材料' : '补充证据';
  const supportEvidenceHint = isSelfServiceCompleted ? '保存付款、沟通或履行凭证' : '上传新的证据材料';
  const primaryNextAction = isSelfServiceCompleted
    ? { href: '#self-service-actions', label: '查看处理记录' }
    : nextAction;

  function recordAction(input: SelfServiceActionInput) {
    recordSelfServiceAction.mutate(input);
  }

  async function handleCopyTemplate() {
    if (!primarySelfServiceBody) return;
    setManualCopySheetOpen(false);
    const copied = await copyTextToClipboard(primarySelfServiceBody);
    const legacyCopied = copied || copyTextWithLegacySelection(primarySelfServiceBody);
    if (legacyCopied) {
      setSelfServiceNotice(selfServiceCopy.copiedNotice);
      recordAction({ action: 'copy_template', note: '用户已复制 AI 自助模板' });
      return;
    }
    setSelfServiceNotice('一键复制受当前浏览器限制，请打开手动复制面板选中全文。');
    setManualCopySheetOpen(true);
  }

  function handleDownloadTemplate() {
    if (!primarySelfServiceDocument) return;
    const blob = new Blob([primarySelfServiceBody], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${normalizeSelfServiceDocumentTitle(primarySelfServiceDocument.title, lawCase.caseType)}.txt`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
    setSelfServiceNotice('TXT 模板已生成，请到浏览器下载记录查看。');
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
        <a href={primaryNextAction.href || latest.href} className="mt-3 flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm font-bold">
          平台建议：{primaryNextAction.label}
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
                <p className="mt-1 text-slate-500">{isSelfService ? normalizeSelfServiceWorkItemSummary(item.summary, isSelfServiceCompleted) : item.summary}</p>
              </div>
            ))}
            {selfServiceDocuments.map((document) => {
              const expanded = expandedDocumentIds.has(document.id);
              const legacyUpgraded = isLegacySelfServiceDocument(document.body, lawCase);
              const body = normalizeSelfServiceDocumentBody(document.body, lawCase);
              return (
                <SelfServiceDocumentPreview
                  key={document.id}
                  title={normalizeSelfServiceDocumentTitle(document.title, lawCase.caseType)}
                  body={body}
                  legacyUpgraded={legacyUpgraded}
                  expanded={expanded}
                  showNextHint={!isSelfServiceCompleted}
                  onToggle={() => toggleDocument(document.id)}
                />
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
            title={isSelfServiceCompleted ? '处理记录' : '399 自助任务'}
            subtitle="平台只提供模板和指引；请自行处理后记录凭证、回应和结案结果"
          />
          <div className="mt-4 rounded-lg bg-slate-50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <strong className="block break-words text-base text-slate-950">{selfServiceStep.title}</strong>
                <p className="mt-1 break-words text-sm leading-6 text-slate-500">{selfServiceStep.body}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-black ${isSelfServiceCompleted ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                {isSelfServiceCompleted ? '已完成' : '当前任务'}
              </span>
            </div>
          </div>
          {selfServiceStep.key === 'prepare' && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-100 px-2 text-sm font-black text-slate-700 disabled:opacity-50"
                  type="button"
                  disabled={recordSelfServiceAction.isPending || !primarySelfServiceDocument}
                  onClick={() => void handleCopyTemplate()}
                >
                  <ClipboardCopy size={16} />
                  {selfServiceCopy.copyButton}
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
              </div>
              <button
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-2 text-sm font-black text-white shadow-sm shadow-blue-100 disabled:opacity-50"
                type="button"
                disabled={recordSelfServiceAction.isPending}
                onClick={() => recordAction({ action: 'mark_sent', channel: '自行发送', note: '用户确认已自行发送或使用 AI 自助材料' })}
              >
                <Send size={16} />
                下一步：我已自行发送/使用
              </button>
            </div>
          )}
          {selfServiceStep.key === 'waiting' && (
            <div className="mt-3 grid grid-cols-2 gap-2">
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
            </div>
          )}
          {selfServiceStep.key === 'escalate' && (
            <div className="mt-3 grid grid-cols-2 gap-2">
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
                className="flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-2 text-sm font-black text-white disabled:opacity-50"
                type="button"
                disabled={recordSelfServiceAction.isPending}
                onClick={() => recordAction({ action: 'upgrade_service', note: '用户申请升级人工复核或代办服务' })}
              >
                升级人工服务
              </button>
            </div>
          )}
          {selfServiceNotice && (
            <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm font-semibold leading-5 text-blue-700">{selfServiceNotice}</p>
          )}
          {selfServiceStep.key === 'completed' && (
            <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-semibold leading-5 text-emerald-700">自助处理已记录完成，可继续保留付款、沟通和履行凭证。</p>
          )}
          {selfServiceStep.key === 'handoff' && (
            <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm font-semibold leading-5 text-blue-700">已提交升级申请，后续由人工服务跟进；399 自助任务不再重复操作。</p>
          )}
          {!primarySelfServiceDocument && selfServiceStep.key === 'prepare' && (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-semibold leading-5 text-amber-800">AI 自助模板生成中，请稍后刷新。</p>
          )}
          {!isSelfServiceCompleted && (
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-slate-500">
              <span className="rounded-lg bg-slate-50 px-2 py-2">1. 取模板</span>
              <span className="rounded-lg bg-slate-50 px-2 py-2">2. 自行处理</span>
              <span className="rounded-lg bg-slate-50 px-2 py-2">3. 记录结果</span>
            </div>
          )}
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
            <span className="block">{supportEvidenceLabel}</span>
            <small className="block text-sm font-semibold text-slate-500">{supportEvidenceHint}</small>
          </span>
        </Link>
        <Link to="/messages" className="flex items-center gap-3 rounded-lg bg-white p-4 font-bold shadow-sm">
          <Contact className="text-emerald-600" size={23} />
          <span className="min-w-0 flex-1">
            <span className="block">联系顾问</span>
            <small className="block text-sm font-semibold text-slate-500">咨询案件进展</small>
          </span>
        </Link>
        <a href={primaryNextAction.href} className="flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 font-black text-white shadow-sm shadow-blue-100">
          <Headphones size={18} />
          {primaryNextAction.label}
          <ChevronRight size={18} />
        </a>
      </section>
      {manualCopySheetOpen && primarySelfServiceDocument && (
        <ManualCopySheet
          title={normalizeSelfServiceDocumentTitle(primarySelfServiceDocument.title, lawCase.caseType)}
          body={primarySelfServiceBody}
          onDownload={handleDownloadTemplate}
          onClose={() => setManualCopySheetOpen(false)}
        />
      )}
    </div>
  );
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false;
  return navigator.clipboard.writeText(text).then(() => true).catch(() => false);
}

function copyTextWithLegacySelection(text: string): boolean {
  if (!document.body || typeof document.execCommand !== 'function') return false;
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.width = '1px';
  textarea.style.height = '1px';
  textarea.style.opacity = '0';
  textarea.style.fontSize = '16px';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

type ManualCopySheetProps = {
  title: string;
  body: string;
  onDownload: () => void;
  onClose: () => void;
};

function ManualCopySheet({ title, body, onDownload, onClose }: ManualCopySheetProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSelectAll() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 px-0" role="dialog" aria-modal="true" aria-labelledby="manual-copy-title">
      <div className="w-full rounded-t-2xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-300" />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-blue-700">手动复制模板</p>
            <h2 id="manual-copy-title" className="mt-1 break-words text-lg font-black leading-6 text-slate-950">{title}</h2>
          </div>
          <button className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600" type="button" onClick={onClose}>
            <X size={18} />
            <span className="sr-only">关闭</span>
          </button>
        </div>
        <p className="mt-3 rounded-lg bg-blue-50 p-3 text-sm font-semibold leading-5 text-blue-700">
          当前浏览器限制一键复制，请选中全文后使用系统复制。
        </p>
        <textarea
          ref={textareaRef}
          className="mt-3 h-72 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 p-3 text-[16px] leading-6 text-slate-800 outline-none focus:border-blue-400 focus:bg-white"
          value={body}
          readOnly
          aria-label={`${title}全文`}
        />
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button className="flex h-11 items-center justify-center gap-2 rounded-lg bg-blue-600 px-2 text-sm font-black text-white" type="button" onClick={handleSelectAll}>
            <ClipboardCopy size={16} />
            选中全文
          </button>
          <button className="flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-100 px-2 text-sm font-black text-slate-700" type="button" onClick={onDownload}>
            <Download size={16} />
            下载 TXT
          </button>
          <button className="flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-2 text-sm font-black text-white" type="button" onClick={onClose}>
            <X size={16} />
            关闭
          </button>
        </div>
      </div>
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

type SelfServiceDocumentPreviewProps = {
  title: string;
  body: string;
  legacyUpgraded: boolean;
  expanded: boolean;
  showNextHint: boolean;
  onToggle: () => void;
};

function SelfServiceDocumentPreview({ title, body, legacyUpgraded, expanded, showNextHint, onToggle }: SelfServiceDocumentPreviewProps) {
  const sections = parseDocumentSections(body);
  return (
    <div className="overflow-hidden rounded-lg border border-black/10 bg-white text-sm leading-6 text-slate-900 shadow-[0_4px_18px_rgba(0,0,0,0.04),0_2px_8px_rgba(0,0,0,0.03)]">
      <div className="border-b border-black/10 bg-[#f6f5f4] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="text-xs font-semibold text-slate-500">文书预览</span>
            <strong className="mt-1 block break-words text-lg font-black leading-6 text-slate-950">{title}</strong>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="rounded-full bg-[#f2f9ff] px-2 py-0.5 text-xs font-bold text-[#097fe8]">AI生成</span>
            {legacyUpgraded && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">旧版补全</span>
            )}
          </div>
        </div>
      </div>
      <div className={`space-y-3 p-3 ${expanded ? '' : 'max-h-80 overflow-hidden'}`}>
        {sections.length > 0 ? sections.map((section) => (
          <DocumentSection key={section.heading} section={section} />
        )) : (
          <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">{body}</p>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-black/10 bg-white px-3 py-2 text-xs font-semibold text-slate-500">
        {showNextHint ? <span>处理动作见下方 399 自助任务</span> : <span>自助处理已完成，文书仅作记录留存</span>}
        <button className="shrink-0 font-black text-[#0075de]" type="button" onClick={onToggle}>
          {expanded ? '收起全文' : '展开全文'}
        </button>
      </div>
    </div>
  );
}

type ParsedDocumentSection = {
  heading: string;
  lines: string[];
};

function parseDocumentSections(body: string): ParsedDocumentSection[] {
  const rawLines = body.split('\n').map((line) => line.trim()).filter(Boolean);
  const sections: ParsedDocumentSection[] = [];
  let current: ParsedDocumentSection | null = null;

  for (const line of rawLines) {
    const match = line.match(/^[一二三四五六七八九十]+、(.+)$/);
    if (match) {
      current = { heading: match[1], lines: [] };
      sections.push(current);
      continue;
    }
    if (current) {
      current.lines.push(line);
    }
  }

  return sections;
}

function DocumentSection({ section }: { section: ParsedDocumentSection }) {
  const Icon = getDocumentSectionIcon(section.heading);
  return (
    <section className="rounded-lg border border-black/10 bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-[#f6f5f4] text-slate-700">
          <Icon size={15} />
        </span>
        <strong className="text-sm font-black text-slate-950">{section.heading}</strong>
      </div>
      <div className="space-y-1 text-sm leading-6 text-slate-600">
        {section.lines.map((line) => (
          <p key={line} className="break-words">{line}</p>
        ))}
      </div>
    </section>
  );
}

function getDocumentSectionIcon(heading: string) {
  if (heading.includes('法律')) return Landmark;
  if (heading.includes('送达') || heading.includes('留痕')) return ShieldCheck;
  if (heading.includes('催告')) return FileText;
  if (heading.includes('后续')) return BookOpenText;
  return FileCheck2;
}

function normalizeSelfServiceStages(stages: CaseStage[]) {
  const activePriority = ['filing', 'negotiation', 'letter'];
  const activeStageKey = activePriority.find((key) => stages.some((stage) => stage.key === key && stage.status === 'active'));

  return stages.map((stage) => {
    const normalizedStage = activeStageKey && stage.status === 'active' && stage.key !== activeStageKey
      ? { ...stage, status: 'done' as const }
      : stage;
    if (normalizedStage.key === 'review') {
      return {
        ...normalizedStage,
        description: normalizeSelfServiceDocumentBody(normalizedStage.description)
      };
    }
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

type SelfServiceStep = {
  key: 'prepare' | 'waiting' | 'escalate' | 'completed' | 'handoff';
  title: string;
  body: string;
};

function getSelfServiceCopy(caseType: LawCase['caseType']) {
  if (caseType === 'debt_collection') {
    return {
      copyButton: '复制催告文案',
      copiedNotice: '催告文案已复制，可通过微信、短信、邮件或快递自行发送。'
    };
  }
  return {
    copyButton: '复制模板内容',
    copiedNotice: '模板内容已复制，请按当前业务场景自行核对后使用。'
  };
}

function getSelfServiceStep(stages: CaseStage[], caseStatus: string, caseType: LawCase['caseType']): SelfServiceStep {
  if (caseStatus === '已申请升级人工服务') {
    return {
      key: 'handoff',
      title: '已申请升级人工服务',
      body: '399 自助处理已交接，后续由人工服务确认服务方案、材料复核和下一步处理。'
    };
  }
  const activeStage = stages.find((stage) => stage.status === 'active');
  if (activeStage?.key === 'letter') {
    if (caseType !== 'debt_collection') {
      return {
        key: 'prepare',
        title: '先取出自助模板',
        body: '复制或下载 AI 自助模板，按当前业务场景自行核对后使用；处理后再点下一步记录结果。'
      };
    }
    return {
      key: 'prepare',
      title: '先取出付款催告函模板',
      body: '复制或下载 AI 生成的付款催告函模板，通过微信、短信、邮件或快递自行发送/使用；处理后再点下一步记录结果。'
    };
  }
  if (activeStage?.key === 'negotiation') {
    return {
      key: 'waiting',
      title: '等待对方回应',
      body: '如果对方付款或事项完成，直接记录完成；如果对方无回应或拒绝，再进入材料准备或升级人工服务。'
    };
  }
  if (activeStage?.key === 'filing') {
    return {
      key: 'escalate',
      title: '决定是否升级人工服务',
      body: '对方无回应或拒绝时，可整理材料包继续自助留痕；需要正式律师函、调解或代办时升级人工服务。'
    };
  }
  return {
    key: 'completed',
    title: '自助处理已完成',
    body: '已记录回款、履行或结案结果；建议继续保存付款凭证、沟通记录和履行材料。'
  };
}

function normalizeSelfServiceDocumentBody(body: string, lawCase?: LawCase) {
  const normalized = body
    .replaceAll('律师函催告 → 协商调解 → 立案追偿', '自行催告 → 记录回应 → 准备材料或升级人工')
    .replaceAll('查看催收函草稿，按建议发送催告并跟进对方回应', '复制或下载付款催告函模板，自行发送/使用后记录凭证和对方回应')
    .replaceAll('催收函草稿', '付款催告函模板')
    .replaceAll('催收函（AI草稿）', '付款催告函（AI 自助模板）')
    .replaceAll('催收函', '付款催告函')
    .replaceAll('按建议发送催告并跟进对方回应', '自行发送/使用后记录凭证和对方回应')
    .replaceAll('AI 可生成追偿建议，律师函发送需经律师复核确认', '399 自助版不代发、不代理、不出具正式律师函；如需正式律师函、调解或代办服务，请升级人工服务')
    .replaceAll('正式署名或对外发送前建议由执业律师审核', '正式法律文书或律师服务需升级人工服务');

  if (!lawCase || !isLegacySelfServiceDocument(normalized, lawCase)) return normalized;
  return buildSelfServiceLegacyDocument(lawCase);
}

function normalizeSelfServiceDocumentTitle(title: string, caseType?: LawCase['caseType']) {
  if (caseType && caseType !== 'debt_collection') {
    return title
      .replaceAll('AI草稿', 'AI 自助模板')
      .replaceAll('AI生成', 'AI 自助模板');
  }
  return title
    .replace(/致.+的催收函（AI草稿）/, '付款催告函（AI 自助模板）')
    .replace(/致.+的催告模板（AI生成）/, '付款催告函（AI 自助模板）')
    .replaceAll('催收函', '付款催告函')
    .replaceAll('AI草稿', 'AI 自助模板')
    .replaceAll('AI生成', 'AI 自助模板');
}

function normalizeSelfServiceWorkItemSummary(summary: string, completed: boolean) {
  const normalized = normalizeSelfServiceDocumentBody(summary);
  if (!completed) return normalized;
  return normalized.replace(/；下一步：[^。]+。?/, '；自助处理结果已记录。');
}

function isLegacySelfServiceDocument(body: string, lawCase?: LawCase) {
  return Boolean(lawCase) && !body.includes('法律依据');
}

function buildSelfServiceLegacyDocument(lawCase: LawCase) {
  switch (lawCase.caseType) {
    case 'debt_collection':
      return buildSelfServicePaymentDemand(lawCase);
    case 'lawyer_letter':
      return buildSelfServiceLawyerLetter(lawCase);
    case 'labor_dispute':
      return buildSelfServiceLaborDispute(lawCase);
    case 'rental_dispute':
      return buildSelfServiceRentalDispute(lawCase);
    case 'contract_review':
      return buildSelfServiceContractReview(lawCase);
  }
}

const SELF_SERVICE_LEGAL_REFERENCES: Record<LawCase['caseType'], string[]> = {
  debt_collection: [
    '《中华人民共和国民法典》第五百七十七条：合同义务未按约履行时，可主张继续履行、补救措施或赔偿损失等违约责任。',
    '《中华人民共和国民法典》第五百七十九条：未支付价款、报酬、租金、利息或其他金钱债务时，可请求支付。',
    '《中华人民共和国民法典》第五百八十三条：违约处理后仍有其他损失的，可结合证据主张赔偿。'
  ],
  lawyer_letter: [
    '《中华人民共和国律师法》第二十八条：律师可以接受自然人、法人或者其他组织委托，提供法律咨询、代写法律文书等法律服务。',
    '《中华人民共和国民法典》第一百七十九条：承担民事责任的方式包括停止侵害、排除妨碍、返还财产、赔偿损失、支付违约金等。',
    '《中华人民共和国民法典》第五百七十七条：如争议基础为合同关系，可结合事实主张违约责任。'
  ],
  labor_dispute: [
    '《中华人民共和国劳动争议调解仲裁法》第二条：劳动关系确认、劳动合同履行、解除终止、劳动报酬、工伤医疗费、经济补偿或赔偿金等争议适用劳动争议处理规则。',
    '《中华人民共和国劳动争议调解仲裁法》第六条：发生劳动争议，当事人对自己提出的主张有责任提供证据。',
    '《中华人民共和国劳动争议调解仲裁法》第二十七条：劳动争议申请仲裁的时效期间通常为一年。',
    '《中华人民共和国劳动合同法》第三十条：用人单位应当按照劳动合同约定和国家规定，及时足额支付劳动报酬。'
  ],
  rental_dispute: [
    '《中华人民共和国民法典》第七百零三条：租赁合同是出租人将租赁物交付承租人使用、收益，承租人支付租金的合同。',
    '《中华人民共和国民法典》第七百二十一条：承租人应当按照约定期限支付租金。',
    '《中华人民共和国民法典》第七百二十二条：承租人无正当理由未支付或迟延支付租金的，出租人可请求在合理期限内支付；逾期不支付的，出租人可解除合同。',
    '《中华人民共和国民法典》第七百三十三条：租赁期限届满，承租人应当返还租赁物。'
  ],
  contract_review: [
    '《中华人民共和国民法典》第四百六十五条：依法成立的合同受法律保护。',
    '《中华人民共和国民法典》第四百七十条：合同内容一般包括当事人信息、标的、数量、质量、价款、履行期限地点方式、违约责任和争议解决等条款。',
    '《中华人民共和国民法典》第四百九十六条：采用格式条款订立合同的，提供方应遵循公平原则，并采取合理方式提示与说明重大利害关系条款。',
    '《中华人民共和国民法典》第五百零九条：当事人应当按照约定全面履行自己的义务，并遵循诚信原则。'
  ]
};

function buildSelfServiceContext(lawCase: LawCase) {
  const uploadedEvidence = lawCase.evidence
    .filter((category) => category.files.length > 0 || category.status === 'recognized')
    .map((category) => category.name);
  const missingEvidence = lawCase.evidence
    .filter((category) => category.required && category.files.length === 0 && category.status !== 'recognized')
    .map((category) => category.name);
  return {
    subject: lawCase.counterpartyName || lawCase.debtorName,
    dispute: lawCase.claimSummary || lawCase.dispute || '请结合现有材料核对事实、金额、期限和责任基础。',
    amount: lawCase.amount.toLocaleString('zh-CN'),
    uploadedEvidence: uploadedEvidence.length > 0 ? uploadedEvidence.join('、') : '暂无已识别材料，请先补充关键材料',
    missingEvidence: missingEvidence.length > 0 ? missingEvidence.join('、') : '暂无缺失的必传材料'
  };
}

function buildSelfServicePaymentDemand(lawCase: LawCase) {
  const context = buildSelfServiceContext(lawCase);
  const dispute = (lawCase.claimSummary || lawCase.dispute || '请结合合同、聊天记录、转账记录等材料核对欠款事实。')
    .replaceAll('催收函', '付款催告函')
    .replaceAll('催收材料', '欠款追偿材料');

  return [
    '付款催告函（AI 自助模板）',
    '',
    '一、发函主体与相对方',
    `发函主体：${lawCase.partyRole || '债权人'}（请在发送前补充真实姓名/公司名称、联系方式与地址）`,
    `相对方：${context.subject}`,
    `案件编号：${lawCase.caseNo}`,
    '',
    '二、事实摘要',
    `根据现有材料，${context.subject}与发函主体之间存在欠款追偿事项。`,
    `当前识别欠款金额为人民币 ${context.amount} 元。`,
    `争议概述：${dispute}`,
    `已上传或识别材料：${context.uploadedEvidence}。`,
    `证据缺口：${context.missingEvidence}。`,
    '',
    '三、法律依据',
    '以下为通用合同/金钱债务条款，具体适用以事实和证据为准。',
    ...SELF_SERVICE_LEGAL_REFERENCES.debt_collection,
    '借款合同专门条款需在确认存在借款法律关系后再适用。',
    '',
    '四、催告事项',
    `1. 请相对方在收到本函后 5 个工作日内核对并支付欠款人民币 ${context.amount} 元。`,
    '2. 如相对方对金额、履行期限或付款责任有异议，请在上述期限内以书面方式说明理由并提交相应凭证。',
    '3. 逾期未付款且未提出合理异议的，发函主体可继续整理证据，并依法考虑调解、仲裁、诉讼或升级人工法律服务。',
    '',
    '五、送达与留痕建议',
    '建议通过微信、短信、电子邮件或 EMS/顺丰等可查询物流的快递方式自行发送，并保存发送截图、邮件回执、快递面单、签收记录和沟通记录。',
    '发送后请在本系统记录对方是否付款、是否提出异议、是否无回应或拒绝处理。',
    '',
    '六、后续路径',
    '建议路径：自行催告 → 记录回应 → 准备材料或升级人工',
    '时效提示：需关注还款期限和诉讼时效风险',
    '',
    '重要提示：399 自助版不代发、不代理、不出具正式律师函；如需正式律师函、调解或代办服务，请升级人工服务。',
    '本文书由人工智能（AI）生成，供参考使用；正式法律文书或律师服务需升级人工服务。'
  ].join('\n');
}

function buildSelfServiceLawyerLetter(lawCase: LawCase) {
  const context = buildSelfServiceContext(lawCase);
  return [
    `《致${context.subject}的函件草稿（AI 自助模板）》`,
    '',
    '一、使用边界',
    '本文件为普通函件草稿（AI 自助模板），供发函主体自行核对事实、诉求和证据后使用。',
    '399 自助版不以律师或律所名义出具正式律师函，也不提供代发、代理或律师署名服务。',
    '',
    '二、发函主体与相对方',
    `发函主体：${lawCase.partyRole || '权利主张方'}（请在发送前补充真实姓名/公司名称、联系方式与地址）`,
    `相对方：${context.subject}`,
    `案件编号：${lawCase.caseNo}`,
    '',
    '三、事实与诉求摘要',
    `诉求金额/标的：人民币 ${context.amount} 元`,
    `争议概述：${context.dispute}`,
    `已上传或识别材料：${context.uploadedEvidence}。`,
    `证据缺口：${context.missingEvidence}。`,
    '',
    '四、法律依据与适用提示',
    '399 自助版仅生成普通函件草稿和事实诉求清单，不以律师或律所名义出具正式律师函。',
    ...SELF_SERVICE_LEGAL_REFERENCES.lawyer_letter,
    '',
    '五、函件诉求',
    '1. 请相对方在收到本函件草稿后 5 个工作日内核对事实，并就上述事项作出书面回复或履行相应义务。',
    '2. 如相对方对事实、金额、履行期限或责任承担有异议，请在上述期限内说明理由并提交凭证。',
    '3. 逾期未回复或争议扩大的，发函主体可继续整理证据，并考虑调解、诉讼、仲裁或升级人工法律服务。',
    '',
    '六、证据与留痕清单',
    '需核对发函主体、收函主体、联系方式、事实依据、诉求金额/事项、履行期限和已沟通记录。',
    '建议自行发送后保存发送截图、邮件回执、快递面单、签收记录和沟通记录。',
    '',
    '七、后续路径',
    '建议路径：自行使用草稿 → 记录回应 → 升级人工复核',
    '处理建议：如需要律师署名、律所函头、代发或法律策略判断，应升级人工律师服务。',
    '',
    '重要提示：399 自助版不代发、不代理、不出具正式律师函；如需正式律师函、调解或代办服务，请升级人工服务。',
    '本文书由人工智能（AI）生成，供参考使用；正式法律文书或律师服务需升级人工服务。'
  ].join('\n');
}

function buildSelfServiceLaborDispute(lawCase: LawCase) {
  const context = buildSelfServiceContext(lawCase);
  return [
    '《劳动仲裁申请建议书（AI 自助模板）》',
    '',
    '一、申请人与用人单位',
    `申请人：${lawCase.partyRole || '劳动者'}（请在提交前补充真实姓名、身份证号、联系方式与送达地址）`,
    `用人单位：${context.subject}`,
    `案件编号：${lawCase.caseNo}`,
    '',
    '二、劳动争议事实摘要',
    `争议类型：${lawCase.claimType || '劳动争议'}`,
    `争议金额：人民币 ${context.amount} 元`,
    `争议概述：${context.dispute}`,
    `已上传或识别材料：${context.uploadedEvidence}。`,
    `证据缺口：${context.missingEvidence}。`,
    '',
    '三、法律依据与适用提示',
    '本模板用于整理劳动争议事实、证据和仲裁准备事项，不替代劳动仲裁申请书的人工复核。',
    ...SELF_SERVICE_LEGAL_REFERENCES.labor_dispute,
    '',
    '四、自助处理清单',
    '1. 核对劳动合同、工资流水、考勤、社保、工作沟通、工牌或入职材料。',
    '2. 核对请求项目，工资、加班费、经济补偿、赔偿金等需分别列明计算期间和依据。',
    '3. 核对仲裁时效，通常需关注知道或应当知道权利被侵害之日起一年的时效风险。',
    '4. 如准备仲裁，建议升级人工复核请求和证据。',
    '',
    '五、证据与留痕建议',
    '需重点保留劳动合同、工资流水、考勤、社保记录、工作沟通、离职/解除通知和欠薪计算依据。',
    '',
    '六、后续路径',
    '建议路径：整理证据 → 自行沟通 → 准备仲裁材料或升级人工',
    '处理建议：先核对仲裁时效、劳动关系证据和请求金额；材料不足或争议复杂时升级人工复核。',
    '',
    '重要提示：399 自助版不代发、不代理、不出具正式律师函；如需正式律师函、调解或代办服务，请升级人工服务。',
    '本文书由人工智能（AI）生成，供参考使用；正式法律文书或律师服务需升级人工服务。'
  ].join('\n');
}

function buildSelfServiceRentalDispute(lawCase: LawCase) {
  const context = buildSelfServiceContext(lawCase);
  return [
    '《租赁纠纷协商函（AI 自助模板）》',
    '',
    '一、发函主体与相对方',
    `发函主体：${lawCase.partyRole || '租赁合同当事人'}（请在发送前补充真实姓名/公司名称、联系方式与地址）`,
    `相对方：${context.subject}`,
    `案件编号：${lawCase.caseNo}`,
    '',
    '二、租赁纠纷事实摘要',
    `争议金额：人民币 ${context.amount} 元`,
    `争议概述：${context.dispute}`,
    `已上传或识别材料：${context.uploadedEvidence}。`,
    `证据缺口：${context.missingEvidence}。`,
    '',
    '三、法律依据与适用提示',
    '押金返还、房屋损坏和违约金通常需结合租赁合同、交接记录、付款凭证和房屋状态判断，不默认作单方结论。',
    ...SELF_SERVICE_LEGAL_REFERENCES.rental_dispute,
    '',
    '四、协商事项',
    '1. 请相对方核对租赁合同、付款凭证、交接记录和房屋状态资料。',
    `2. 请相对方在收到本协商函后 5 个工作日内就人民币 ${context.amount} 元争议金额说明处理意见。`,
    '3. 如涉及押金返还，请结合合同约定、退租交接和房屋状态记录确认返还条件。',
    '4. 如涉及欠付租金、占用费或损坏赔偿，请列明期间、金额、计算方式和证据。',
    '',
    '五、证据与留痕建议',
    '需重点保留租赁合同、押金/租金付款凭证、交接记录、房屋照片视频、维修记录和协商沟通记录。',
    '',
    '六、后续路径',
    '建议路径：自行协商 → 记录回应 → 准备材料或升级人工',
    '处理建议：先用协商函明确返还/支付请求、依据和期限；对方拒绝或无回应时准备调解、诉讼或升级人工服务。',
    '',
    '重要提示：399 自助版不代发、不代理、不出具正式律师函；如需正式律师函、调解或代办服务，请升级人工服务。',
    '本文书由人工智能（AI）生成，供参考使用；正式法律文书或律师服务需升级人工服务。'
  ].join('\n');
}

function buildSelfServiceContractReview(lawCase: LawCase) {
  const context = buildSelfServiceContext(lawCase);
  return [
    '《合同审查意见（AI 自助模板）》',
    '',
    '一、审查对象',
    `合同相对方：${context.subject}`,
    `合同金额：人民币 ${context.amount} 元`,
    `案件编号：${lawCase.caseNo}`,
    `交易背景：${context.dispute}`,
    `已上传或识别材料：${context.uploadedEvidence}。`,
    `证据缺口：${context.missingEvidence}。`,
    '',
    '二、法律依据与审查口径',
    'AI 自助审查仅输出风险清单和修改建议，不对交易成败、最终签署或诉讼结果作保证。',
    ...SELF_SERVICE_LEGAL_REFERENCES.contract_review,
    '',
    '三、重点审查清单',
    '1. 主体与授权：核对签约主体、联系人、授权文件、印章和签署权限。',
    '2. 交易条款：核对标的、数量、质量、价款、付款节点、交付验收和发票安排。',
    '3. 违约与解除：核对违约责任、解除条件、通知方式、逾期处理和损失范围。',
    '4. 格式条款：对免除或限制责任、加重对方责任、排除主要权利的条款进行重点提示。',
    '5. 争议解决：核对管辖、仲裁、法律适用、送达地址和证据留存约定。',
    '',
    '四、修改与谈判建议',
    '1. 对金额、期限、验收、违约金、解除和争议解决条款逐条标注是否接受、需修改或需人工复核。',
    '2. 对重大交易、长期合作、格式合同或高风险条款，建议升级律师精审后再签署。',
    '3. 已签署合同如需解除、变更或追责，应结合履行证据另行判断，不仅按初审意见处理。',
    '',
    '五、材料与留痕建议',
    '需上传完整合同正文、附件、补充协议、交易背景、重点关注条款和历史谈判记录。',
    '',
    '六、后续路径',
    '建议路径：AI初审 → 自行核对修改 → 需要时升级律师精审',
    '处理建议：先核对主体、价款、履行、违约、解除、保密、知识产权和争议解决条款；重大交易应升级律师精审。',
    '',
    '重要提示：399 自助版不代发、不代理、不出具正式律师函；如需正式律师函、调解或代办服务，请升级人工服务。',
    '本文书由人工智能（AI）生成，供参考使用；正式法律文书或律师服务需升级人工服务。'
  ].join('\n');
}
