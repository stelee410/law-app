import { Link } from '@tanstack/react-router';
import { ChevronRight, ClipboardList } from 'lucide-react';
import { BrandHeader } from '../components/h5/BrandHeader';
import { EmptyState } from '../components/h5/EmptyState';
import { SectionHeader } from '../components/h5/SectionHeader';
import { StateBlock } from '../components/StateBlock';
import { useLawyerTasksQuery } from '../hooks/useCaseQueries';
import { formatDate } from '../lib/format';

export function LawyerDashboardPage() {
  const tasksQuery = useLawyerTasksQuery();
  const tasks = tasksQuery.data ?? [];
  const pending = tasks.filter((task) => task.status === 'pending');

  return (
    <div className="space-y-5">
      <BrandHeader
        eyebrow="律师工作台"
        title="待办复核"
        description="核对案件资料、补充复核意见并维护法律文书。"
        meta={
          <div className="grid grid-cols-2 gap-2 text-sm font-bold">
            <span className="rounded-lg bg-white p-3 shadow-sm">待处理 {pending.length}</span>
            <span className="rounded-lg bg-white p-3 shadow-sm">全部 {tasks.length}</span>
          </div>
        }
      />

      <SectionHeader title="律师待办" subtitle="查看案件资料、提交复核意见并维护法律文书" />
      {tasksQuery.isPending && <StateBlock title="待办加载中" />}
      {tasksQuery.isError && <section className="rounded-lg bg-red-50 p-4 text-sm font-semibold text-red-700">待办加载失败，请确认当前账号为律师角色。</section>}
      {!tasksQuery.isPending && !tasksQuery.isError && tasks.length === 0 && (
        <EmptyState icon={<ClipboardList size={24} />} title="暂无律师待办" description="用户选择律师复核或全程代办后，会在这里生成待办。" />
      )}
      <div className="space-y-3">
        {tasks.map((task) => (
          <Link key={task.id} to="/lawyer/tasks/$taskId" params={{ taskId: task.id }} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-white p-4 shadow-sm">
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${task.status === 'pending' ? 'bg-blue-600' : 'bg-emerald-600'}`} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <strong className="break-words text-sm">{task.title}</strong>
                <time className="shrink-0 text-xs text-slate-400">{formatDate(task.createdAt)}</time>
              </span>
              <span className="mt-1 block break-words text-sm leading-6 text-slate-500">{task.summary}</span>
            </span>
            <ChevronRight className="shrink-0 text-slate-400" size={17} />
          </Link>
        ))}
      </div>
    </div>
  );
}
