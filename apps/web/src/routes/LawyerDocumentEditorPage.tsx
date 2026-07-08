import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { Archive, ArrowLeft, Save, Send } from 'lucide-react';
import { FormEvent, useEffect, useState } from 'react';
import { SectionHeader } from '../components/h5/SectionHeader';
import { StateBlock } from '../components/StateBlock';
import {
  useArchiveDocumentMutation,
  useCreateDocumentMutation,
  useLawyerCaseDocumentsQuery,
  useSubmitDocumentMutation,
  useUpdateDocumentMutation
} from '../hooks/useCaseQueries';
import type { LegalDocumentStatus, LegalDocumentType } from '../lib/types';

const documentTypes: Array<{ value: LegalDocumentType; label: string }> = [
  { value: 'lawyer_letter', label: '律师函' },
  { value: 'arbitration_material', label: '仲裁材料' },
  { value: 'contract_review_opinion', label: '合同审查意见' }
];

const statusLabels: Record<LegalDocumentStatus, string> = {
  draft: '草稿',
  pending_client_approval: '待客户确认',
  approved: '已确认',
  sent: '已发送',
  archived: '已归档'
};

export function LawyerDocumentEditorPage() {
  const navigate = useNavigate();
  const { caseId, documentId } = useParams({ strict: false }) as { caseId: string; documentId: string };
  const isNew = documentId === 'new';
  const documentsQuery = useLawyerCaseDocumentsQuery(caseId);
  const document = documentsQuery.data?.find((item) => item.id === documentId);
  const createDocument = useCreateDocumentMutation(caseId);
  const updateDocument = useUpdateDocumentMutation(caseId, documentId);
  const submitDocument = useSubmitDocumentMutation(caseId);
  const archiveDocument = useArchiveDocumentMutation(caseId);
  const [type, setType] = useState<LegalDocumentType>('lawyer_letter');
  const [title, setTitle] = useState('催款律师函');
  const [recipient, setRecipient] = useState('');
  const [request, setRequest] = useState('');
  const [deadline, setDeadline] = useState('');
  const [body, setBody] = useState('请贵司收到本函后及时履行付款或处理义务。');
  const isDraft = isNew || document?.status === 'draft';
  const readOnly = !isDraft;

  useEffect(() => {
    if (!document) return;
    setType(document.type);
    setTitle(document.title);
    setRecipient(String(document.fields.recipient ?? ''));
    setRequest(String(document.fields.request ?? ''));
    setDeadline(String(document.fields.deadline ?? ''));
    setBody(document.body);
  }, [document]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly) return;
    const fields = { recipient, request, deadline };
    if (isNew) {
      const created = await createDocument.mutateAsync({ type, title, fields, body });
      await navigate({ to: '/lawyer/cases/$caseId/documents/$documentId', params: { caseId, documentId: created.id } });
      return;
    }
    await updateDocument.mutateAsync({ title, fields, body });
  }

  async function handleSend() {
    if (isNew) return;
    await submitDocument.mutateAsync(documentId);
  }

  async function handleArchive() {
    if (isNew) return;
    await archiveDocument.mutateAsync(documentId);
    await navigate({ to: '/lawyer' });
  }

  if (!isNew && documentsQuery.isPending) return <StateBlock title="文书加载中" />;
  if (!isNew && !document) return <StateBlock title="文书不存在" />;

  return (
    <div className="space-y-5">
      <Link to="/lawyer" className="flex items-center gap-2 text-sm font-bold text-slate-600">
        <ArrowLeft size={17} />
        返回律师工作台
      </Link>

      <form className="space-y-4 rounded-lg bg-white p-4 shadow-sm" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-3">
          <SectionHeader title={isNew ? '新增法律文书' : '编辑法律文书'} subtitle="结构化字段用于生成和审查，正文保留律师可编辑空间" />
          {!isNew && document && (
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">
              {statusLabels[document.status]}
            </span>
          )}
        </div>
        {readOnly && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm font-semibold leading-6 text-slate-600">
            当前文书已进入确认或归档状态，仅可查看，不可继续编辑。
          </div>
        )}
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">文书类型</span>
          <select className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm" value={type} onChange={(event) => setType(event.target.value as LegalDocumentType)} disabled={!isNew}>
            {documentTypes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">标题</span>
          <input className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-500 focus:bg-white disabled:text-slate-500" value={title} onChange={(event) => setTitle(event.target.value)} disabled={readOnly} />
        </label>
        <div className="grid grid-cols-1 gap-3">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">收件人 / 对方当事人</span>
            <input className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-500 focus:bg-white disabled:text-slate-500" value={recipient} onChange={(event) => setRecipient(event.target.value)} disabled={readOnly} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">请求事项 / 审查目标</span>
            <input className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-500 focus:bg-white disabled:text-slate-500" value={request} onChange={(event) => setRequest(event.target.value)} disabled={readOnly} />
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-700">履行期限 / 交付期限</span>
            <input className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-500 focus:bg-white disabled:text-slate-500" value={deadline} onChange={(event) => setDeadline(event.target.value)} disabled={readOnly} />
          </label>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-700">正文</span>
          <textarea className="min-h-56 w-full rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm leading-6 outline-none focus:border-blue-500 focus:bg-white disabled:text-slate-500" value={body} onChange={(event) => setBody(event.target.value)} disabled={readOnly} />
        </label>
        <button className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 font-black text-white disabled:opacity-50" type="submit" disabled={createDocument.isPending || updateDocument.isPending || !isDraft}>
          <Save size={18} />
          保存文书
        </button>
      </form>

      {!isNew && (
        <section className="grid grid-cols-2 gap-2">
          <button className="flex h-12 items-center justify-center gap-2 rounded-lg bg-white font-bold text-slate-700 shadow-sm disabled:opacity-50" type="button" disabled={archiveDocument.isPending || !isDraft} onClick={handleArchive}>
            <Archive size={18} />
            归档
          </button>
          <button className="flex h-12 items-center justify-center gap-2 rounded-lg bg-slate-950 font-bold text-white shadow-sm disabled:opacity-50" type="button" disabled={submitDocument.isPending || !isDraft} onClick={handleSend}>
            <Send size={18} />
            提交用户
          </button>
        </section>
      )}
    </div>
  );
}
