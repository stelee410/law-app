import { Link, useParams } from '@tanstack/react-router';
import { ArrowLeft, CheckCircle2, FilePenLine, FileText, Send } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { SectionHeader } from '../components/h5/SectionHeader';
import { StateBlock } from '../components/StateBlock';
import { useLawyerCaseDocumentsQuery, useLawyerTaskQuery, useRecordLawyerFullServiceActionMutation, useSubmitDocumentMutation, useSubmitReviewMutation } from '../hooks/useCaseQueries';
import { getLawyerEvidenceFile } from '../lib/api';
import { formatCaseAmount } from '../lib/format';
import type { EvidenceFile, FullServiceResponse, ReviewNextAction, RiskLevel } from '../lib/types';

const nextActionOptions: Array<{ value: ReviewNextAction; label: string }> = [
  { value: 'draft_lawyer_letter', label: '起草律师函' },
  { value: 'prepare_arbitration', label: '准备仲裁材料' },
  { value: 'deliver_contract_review', label: '交付合同审查意见' },
  { value: 'request_evidence', label: '要求补充证据' },
  { value: 'close_case', label: '建议结案' }
];

export function LawyerTaskPage() {
  const { taskId } = useParams({ strict: false }) as { taskId: string };
  const taskQuery = useLawyerTaskQuery(taskId);
  const lawCase = taskQuery.data?.case;
  const task = taskQuery.data?.task;
  const documentsQuery = useLawyerCaseDocumentsQuery(lawCase?.id ?? '');
  const submitReview = useSubmitReviewMutation(taskId);
  const submitDocument = useSubmitDocumentMutation(lawCase?.id ?? '');
  const recordFullServiceAction = useRecordLawyerFullServiceActionMutation(lawCase?.id ?? '');
  const [conclusion, setConclusion] = useState('材料基本完整，可先发律师函催告。');
  const [riskLevel, setRiskLevel] = useState<RiskLevel>('medium');
  const [evidenceGaps, setEvidenceGaps] = useState('补充最近一次催款聊天记录');
  const [advice, setAdvice] = useState('建议先发送律师函，保留后续诉讼准备。');
  const [nextAction, setNextAction] = useState<ReviewNextAction>('draft_lawyer_letter');
  const [fullServiceNote, setFullServiceNote] = useState('');
  const [followUpDecision, setFollowUpDecision] = useState<FullServiceResponse>('promised');
  const [openingEvidenceFileId, setOpeningEvidenceFileId] = useState<string | null>(null);
  const [evidenceOpenError, setEvidenceOpenError] = useState('');

  async function handleReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitReview.mutateAsync({
      conclusion,
      riskLevel,
      evidenceGaps: evidenceGaps.split('\n').map((item) => item.trim()).filter(Boolean),
      advice,
      nextAction
    });
  }

  async function handleOpenEvidenceFile(categoryId: string, file: EvidenceFile) {
    if (!lawCase) return;
    const canPreview = file.mimeType.startsWith('image/') || file.mimeType === 'application/pdf';
    const previewWindow = canPreview ? window.open('', '_blank') : null;
    setOpeningEvidenceFileId(file.id);
    setEvidenceOpenError('');
    try {
      const blob = await getLawyerEvidenceFile(lawCase.id, categoryId, file.id);
      const objectUrl = URL.createObjectURL(blob);
      if (canPreview) {
        if (previewWindow) {
          previewWindow.location.href = objectUrl;
        } else {
          window.open(objectUrl, '_blank');
        }
      } else {
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = file.name;
        document.body.append(link);
        link.click();
        link.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      if (previewWindow && !previewWindow.closed) previewWindow.close();
      setEvidenceOpenError('材料打开失败，请稍后重试');
    } finally {
      setOpeningEvidenceFileId(null);
    }
  }

  async function handleConfirmSendProof() {
    await recordFullServiceAction.mutateAsync({
      action: 'confirm_send_proof',
      note: fullServiceNote || '律师确认已收到发送凭证'
    });
  }

  async function handleRejectSendProof() {
    await recordFullServiceAction.mutateAsync({
      action: 'reject_send_proof',
      note: fullServiceNote || '发送凭证信息不足，请客户补充'
    });
  }

  async function handleFullServiceDecision(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await recordFullServiceAction.mutateAsync({
      action: 'decide_response',
      decision: followUpDecision,
      note: fullServiceNote || `律师判断：${followUpDecision}`
    });
  }

  if (taskQuery.isPending) return <StateBlock title="待办加载中" />;
  if (!task || !lawCase) return <StateBlock title="待办不存在" />;

  const documents = documentsQuery.data ?? [];

  return (
    <div className="space-y-5">
      <Link to="/lawyer" className="flex items-center gap-2 text-sm font-bold text-slate-600">
        <ArrowLeft size={17} />
        返回律师工作台
      </Link>

      <section className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <p className="text-sm font-bold text-blue-700">{lawCase.caseNo}</p>
            <h1 className="mt-1 break-words text-2xl font-black tracking-normal">{task.title}</h1>
          </span>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${task.status === 'pending' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {task.status === 'pending' ? '待处理' : '已完成'}
          </span>
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-500">{task.summary}</p>
      </section>

      <section className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
        <SectionHeader title="案件资料" subtitle="律师复核前需核对事实、证据和 AI 评估" />
        <div className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
          <p><b>相对方：</b>{lawCase.counterpartyName || lawCase.debtorName}</p>
          <p><b>金额：</b>{formatCaseAmount(lawCase.amount)}</p>
          <p><b>争议摘要：</b>{lawCase.claimSummary || lawCase.dispute}</p>
          <p><b>AI 建议：</b>{lawCase.assessment?.suggestedRoute ?? '待评估'}</p>
        </div>
      </section>

      <section className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
        <SectionHeader title="证据材料" subtitle="判断是否需要补证" />
        <div className="mt-3 space-y-2">
          {lawCase.evidence.map((item) => (
            <div key={item.id} className="flex items-center gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <FileText className={item.files.length ? 'text-emerald-600' : 'text-slate-400'} size={18} />
              <span className="min-w-0 flex-1">
                <strong className="block">{item.name}</strong>
                {item.files.length ? (
                  <span className="mt-1 block space-y-1">
                    {item.files.map((file) => (
                      <button
                        key={file.id}
                        className="block max-w-full truncate text-left text-slate-500 underline-offset-2 hover:text-blue-700 hover:underline disabled:opacity-50"
                        type="button"
                        disabled={openingEvidenceFileId === file.id}
                        onClick={() => handleOpenEvidenceFile(item.id, file)}
                      >
                        {openingEvidenceFileId === file.id ? '打开中...' : file.name}
                      </button>
                    ))}
                  </span>
                ) : (
                  <small className="block truncate text-slate-500">{item.required ? '必传未上传' : '可选'}</small>
                )}
              </span>
            </div>
          ))}
        </div>
        {evidenceOpenError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">{evidenceOpenError}</p>}
      </section>

      {task.kind === 'send_proof_review' && (
        <section className="space-y-3 rounded-lg border border-blue-100 bg-white p-4 shadow-sm">
          <SectionHeader title="确认发送凭证" subtitle="确认客户确已自行发送，并核对凭证与收函主体是否一致" />
          <p className="rounded-lg bg-blue-50 p-3 text-sm font-semibold leading-6 text-blue-800">{task.summary}</p>
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
            value={fullServiceNote}
            onChange={(event) => setFullServiceNote(event.target.value)}
            placeholder="填写核对意见，例如：已核对微信截图、收函主体和发送时间"
          />
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 font-black text-white shadow-sm shadow-blue-100 disabled:opacity-50"
            type="button"
            disabled={recordFullServiceAction.isPending || task.status === 'completed'}
            onClick={() => void handleConfirmSendProof()}
          >
            <CheckCircle2 size={18} />
            确认已收到发送凭证
          </button>
          <button
            className="flex h-11 w-full items-center justify-center rounded-lg bg-slate-100 px-3 text-sm font-black text-slate-700 disabled:opacity-50"
            type="button"
            disabled={recordFullServiceAction.isPending || task.status === 'completed'}
            onClick={() => void handleRejectSendProof()}
          >
            凭证需补充
          </button>
        </section>
      )}

      {task.kind === 'lawyer_follow_up' && (
        <form className="space-y-3 rounded-lg border border-blue-100 bg-white p-4 shadow-sm" onSubmit={handleFullServiceDecision}>
          <SectionHeader title="处理对方回应" subtitle="根据客户记录决定继续协商、结案或准备诉讼/仲裁材料" />
          <p className="rounded-lg bg-blue-50 p-3 text-sm font-semibold leading-6 text-blue-800">{task.summary}</p>
          <select
            className="h-12 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold"
            value={followUpDecision}
            onChange={(event) => setFollowUpDecision(event.target.value as FullServiceResponse)}
          >
            <option value="paid">对方已履行，结案</option>
            <option value="promised">承诺付款，继续跟进</option>
            <option value="installment">分期履行，继续跟进</option>
            <option value="mediation_requested">请求协商，继续跟进</option>
            <option value="no_response">无回应，准备材料</option>
            <option value="rejected">拒绝处理，准备材料</option>
            <option value="delivery_failed">发送异常，重新确认</option>
          </select>
          <textarea
            className="min-h-24 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500 focus:bg-white"
            value={fullServiceNote}
            onChange={(event) => setFullServiceNote(event.target.value)}
            placeholder="填写律师跟进意见"
          />
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 font-black text-white shadow-sm shadow-blue-100 disabled:opacity-50"
            type="submit"
            disabled={recordFullServiceAction.isPending || task.status === 'completed'}
          >
            <CheckCircle2 size={18} />
            提交律师判断
          </button>
        </form>
      )}

      {task.kind === 'lawyer_review' && (
        <>
          <form className="space-y-3 rounded-lg border border-slate-100 bg-white p-4 shadow-sm" onSubmit={handleReview}>
            <SectionHeader title="复核意见" subtitle="提交后用户端会收到通知" />
            <textarea className="min-h-20 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500 focus:bg-white" value={conclusion} onChange={(event) => setConclusion(event.target.value)} />
            <select className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" value={riskLevel} onChange={(event) => setRiskLevel(event.target.value as RiskLevel)}>
              <option value="low">低风险</option>
              <option value="medium">中风险</option>
              <option value="high">高风险</option>
            </select>
            <textarea className="min-h-16 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500 focus:bg-white" value={evidenceGaps} onChange={(event) => setEvidenceGaps(event.target.value)} placeholder="每行一条补证要求" />
            <textarea className="min-h-20 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500 focus:bg-white" value={advice} onChange={(event) => setAdvice(event.target.value)} />
            <select className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" value={nextAction} onChange={(event) => setNextAction(event.target.value as ReviewNextAction)}>
              {nextActionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <button className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 font-black text-white shadow-sm shadow-blue-100 disabled:opacity-50" type="submit" disabled={submitReview.isPending || task.status === 'completed'}>
              <CheckCircle2 size={18} />
              {task.status === 'completed' ? '复核已提交' : '提交复核意见'}
            </button>
          </form>

          <section className="space-y-3">
            <SectionHeader
              title="法律文书"
              subtitle="律师函、仲裁材料、合同审查意见"
              action={<Link to="/lawyer/cases/$caseId/documents/$documentId" params={{ caseId: lawCase.id, documentId: 'new' }} className="text-sm font-bold text-blue-700">新增</Link>}
            />
            {documents.map((document) => (
              <div key={document.id} className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <strong className="block break-words">{document.title}</strong>
                    <small className="mt-1 block text-slate-500">v{document.version} · {document.status}</small>
                  </span>
                  <FilePenLine className="shrink-0 text-blue-600" size={20} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-bold">
                  <Link to="/lawyer/cases/$caseId/documents/$documentId" params={{ caseId: lawCase.id, documentId: document.id }} className="rounded-lg bg-slate-100 px-3 py-2 text-center">编辑</Link>
                  <button className="flex items-center justify-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-white shadow-sm shadow-blue-100 disabled:opacity-50" type="button" disabled={submitDocument.isPending || document.status !== 'draft'} onClick={() => submitDocument.mutate(document.id)}>
                    <Send size={15} />
                    提交用户
                  </button>
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
