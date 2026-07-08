import { Link } from '@tanstack/react-router';
import { FileQuestion, Home } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
      <span className="grid size-14 place-items-center rounded-lg bg-slate-100 text-slate-700">
        <FileQuestion size={28} />
      </span>
      <div>
        <h1 className="text-2xl font-black tracking-normal">页面不存在</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">当前入口还没有对应页面，请返回首页继续处理案件。</p>
      </div>
      <Link to="/" className="flex h-12 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 font-black text-white">
        <Home size={18} />
        返回首页
      </Link>
    </div>
  );
}
