import { Camera, CloudUpload, Image, ShieldCheck } from 'lucide-react';

export function EvidenceUploadPanel({
  onUpload,
  pending
}: {
  onUpload: () => void;
  pending?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start gap-2 rounded-lg bg-[#f5f4ed] p-3 text-sm leading-6 text-[#8a4b36]">
        <ShieldCheck className="mt-0.5 shrink-0" size={17} />
        <span>证据越完整，AI 评估越准确。优先上传合同、聊天记录、转账凭证和催收记录。</span>
      </div>
      <button
        className="flex w-full flex-col items-center gap-3 rounded-lg border border-dashed border-blue-300 bg-blue-50 p-6 text-blue-800 disabled:opacity-60"
        type="button"
        disabled={pending}
        onClick={onUpload}
      >
        <CloudUpload size={36} />
        <strong className="text-base">点击上传证据材料</strong>
        <span className="text-center text-sm leading-5 text-blue-700">支持图片、PDF、Word、Excel、聊天记录截图，单个文件不超过 50MB</span>
        <span className="grid w-full grid-cols-2 gap-2 text-xs font-bold">
          <span className="flex items-center justify-center gap-1 rounded-lg bg-white/80 px-2 py-2">
            <Camera size={15} />
            拍照上传
          </span>
          <span className="flex items-center justify-center gap-1 rounded-lg bg-white/80 px-2 py-2">
            <Image size={15} />
            相册选择
          </span>
        </span>
      </button>
    </section>
  );
}
