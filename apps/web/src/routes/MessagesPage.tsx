import { Link } from '@tanstack/react-router';
import { Bell, MessageCircle } from 'lucide-react';
import { BrandHeader } from '../components/h5/BrandHeader';
import { EmptyState } from '../components/h5/EmptyState';
import { StateBlock } from '../components/StateBlock';
import { useMarkMessageReadMutation, useMessagesQuery } from '../hooks/useCaseQueries';
import { formatDate } from '../lib/format';

export function MessagesPage() {
  const messagesQuery = useMessagesQuery();
  const markRead = useMarkMessageReadMutation();
  const messages = messagesQuery.data ?? [];
  const unread = messages.filter((item) => item.unread).length;

  return (
    <div className="space-y-5">
      <BrandHeader title="消息" description="案件提醒、律师沟通和系统通知都会在这里汇总" />

      <section className="flex items-center gap-3 rounded-lg border border-blue-100 bg-white p-4 text-slate-950 shadow-sm">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
          <MessageCircle size={24} />
        </span>
        <span className="min-w-0">
          <strong className="block text-lg font-black">{unread} 条未读消息</strong>
          <span className="mt-1 block text-sm leading-5 text-slate-500">证据、评估、方案和阶段变化会自动生成提醒。</span>
        </span>
      </section>

      {messagesQuery.isPending && <StateBlock title="消息同步中" />}
      {messagesQuery.isError && (
        <section className="rounded-lg bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
          消息加载失败，请检查通知接口。
        </section>
      )}
      {!messagesQuery.isPending && !messagesQuery.isError && messages.length === 0 && (
        <EmptyState
          icon={<Bell size={24} />}
          title="暂无通知"
          description="选择服务方案、律师提交意见或文书待确认时，会在这里生成通知。"
          action={
            <Link to="/cases" className="inline-flex h-10 items-center rounded-lg bg-slate-100 px-4 text-sm font-black text-slate-700">
              查看案件
            </Link>
          }
        />
      )}
      <div className="space-y-3">
        {messages.map((message) => (
          <a
            key={message.id}
            href={message.actionHref}
            className="flex items-start gap-3 rounded-lg bg-white p-4 shadow-sm"
            onClick={() => {
              if (message.unread) markRead.mutate(message.id);
            }}
          >
            <span className={`mt-1 size-2.5 shrink-0 rounded-full ${message.unread ? 'bg-blue-600' : 'bg-slate-300'}`} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-3">
                <strong className="min-w-0 break-words text-sm text-slate-950">{message.title}</strong>
                <time className="shrink-0 text-xs text-slate-400">{formatDate(message.createdAt)}</time>
              </span>
              <span className="mt-1 block break-words text-sm leading-6 text-slate-500">{message.body}</span>
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}
