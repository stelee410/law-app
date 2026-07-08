import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { ArrowLeft, Camera, Check, FileText } from 'lucide-react';
import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { EvidenceUploadPanel } from '../components/h5/EvidenceUploadPanel';
import { SectionHeader } from '../components/h5/SectionHeader';
import { StateBlock } from '../components/StateBlock';
import { useCaseQuery, useEvaluateCaseMutation, useUploadEvidenceMutation } from '../hooks/useCaseQueries';
import { fileSizeLabel } from '../lib/format';

export function EvidencePage() {
  const navigate = useNavigate();
  const { caseId } = useParams({ strict: false }) as { caseId: string };
  const fileRef = useRef<HTMLInputElement | null>(null);
  const caseQuery = useCaseQuery(caseId);
  const upload = useUploadEvidenceMutation(caseId);
  const evaluate = useEvaluateCaseMutation(caseId);
  const lawCase = caseQuery.data;
  const [categoryId, setCategoryId] = useState('');

  useEffect(() => {
    if (!categoryId && lawCase?.evidence[0]) setCategoryId(lawCase.evidence[0].id);
  }, [categoryId, lawCase]);

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const selected = categoryId || lawCase?.evidence[0]?.id;
    if (file && selected) await upload.mutateAsync({ categoryId: selected, file });
    event.currentTarget.value = '';
  }

  async function handleEvaluate() {
    await evaluate.mutateAsync(undefined);
    await navigate({ to: '/cases/$caseId/assessment', params: { caseId } });
  }

  if (!lawCase) return <StateBlock title="证据清单加载中" />;

  return (
    <div className="space-y-5">
      <Link to="/cases/$caseId" params={{ caseId }} className="flex items-center gap-2 text-sm font-bold text-slate-600">
        <ArrowLeft size={17} />
        返回案件
      </Link>

      <header className="space-y-3">
        <p className="text-sm font-bold text-blue-700">{lawCase.caseNo}</p>
        <h1 className="text-2xl font-black tracking-normal">证据上传</h1>
        <div className="grid grid-cols-4 gap-2">
          {['填写信息', '上传证据', '案件评估', '确认方案'].map((item, index) => (
            <span className={`rounded-lg px-2 py-2 text-center text-[11px] font-bold ${index <= 1 ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-500'}`} key={item}>
              {item}
            </span>
          ))}
        </div>
      </header>

      <EvidenceUploadPanel pending={upload.isPending} onUpload={() => fileRef.current?.click()} />
      <input ref={fileRef} className="hidden" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={handleFile} />

      <section className="space-y-3">
        <SectionHeader title="材料清单" subtitle="先选择材料类型，再上传对应文件" />
        {lawCase.evidence.map((category) => (
          <button
            key={category.id}
            className={`w-full rounded-lg border p-4 text-left shadow-sm ${
              categoryId === category.id ? 'border-blue-500 bg-white' : 'border-transparent bg-white'
            }`}
            type="button"
            onClick={() => setCategoryId(category.id)}
          >
            <span className="flex items-start gap-3">
              <span className={`grid size-10 shrink-0 place-items-center rounded-lg ${category.files.length ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {category.files.length ? <Check size={18} /> : <FileText size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center justify-between gap-3">
                  <strong>{category.name}</strong>
                  <em className="shrink-0 text-xs font-bold not-italic text-slate-500">{category.required ? '必传' : '可选'}</em>
                </span>
                <span className="mt-1 block text-sm leading-5 text-slate-500">{category.insight ?? '等待上传和识别'}</span>
                {category.files.map((file) => (
                  <small key={file.id} className="mt-2 block truncate rounded-lg bg-slate-50 px-3 py-2 text-slate-600">
                    {file.name} · {fileSizeLabel(file.size)}
                  </small>
                ))}
              </span>
            </span>
          </button>
        ))}
      </section>

      <section className="rounded-lg bg-white p-4 shadow-sm">
        <SectionHeader title="AI初步识别" subtitle="基于已上传证据生成" />
        <div className="mt-3 space-y-2">
          {(lawCase.assessment?.findings ?? lawCase.evidence.flatMap((item) => item.insight ? [item.insight] : [])).slice(0, 3).map((finding) => (
            <p className="flex gap-2 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700" key={finding}>
              <Check className="mt-0.5 shrink-0 text-emerald-600" size={16} />
              <span className="break-words">{finding}</span>
            </p>
          ))}
          {!lawCase.assessment && lawCase.evidence.every((item) => !item.insight) && (
            <p className="rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-500">上传材料后会显示金额、日期、付款承诺等识别结果。</p>
          )}
        </div>
      </section>

      {upload.isError && <div className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-700">上传失败，请检查文件大小和网络。</div>}
      <div className="sticky bottom-20 grid grid-cols-[0.9fr_1.1fr] gap-2">
        <button className="flex h-12 items-center justify-center gap-2 rounded-lg bg-white font-black text-slate-800 shadow-sm" type="button" onClick={() => fileRef.current?.click()}>
          <Camera size={18} />
          拍照
        </button>
        <button className="h-12 rounded-lg bg-blue-600 font-black text-white shadow-lg shadow-blue-200 disabled:opacity-50" type="button" disabled={evaluate.isPending} onClick={handleEvaluate}>
          下一步：生成方案
        </button>
      </div>
    </div>
  );
}
