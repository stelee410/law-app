import { MessageCircle } from 'lucide-react';
import { SectionHeader } from '../components/h5/SectionHeader';
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
      <SectionHeader title="消息" subtitle="案件提醒、律师沟通和系统通知都会在这里汇总" />

      <section className="flex items-center gap-3 rounded-lg bg-blue-600 p-4 text-white shadow-lg shadow-blue-200">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-white/15">
          <MessageCircle size={24} />
        </span>
        <span className="min-w-0">
          <strong className="block text-lg font-black">{unread} 条未读消息</strong>
          <span className="mt-1 block text-sm leading-5 text-blue-100">证据、评估、方案和阶段变化会自动生成提醒。</span>
        </span>
      </section>

      {messagesQuery.isPending && <StateBlock title="消息同步中" />}
      {messagesQuery.isError && (
        <section className="rounded-lg bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
          消息加载失败，请检查通知接口。
        </section>
      )}
      {!messagesQuery.isPending && !messagesQuery.isError && messages.length === 0 && (
        <section className="rounded-lg bg-white p-5 text-center shadow-sm">
          <strong>暂无通知</strong>
          <p className="mt-2 text-sm leading-6 text-slate-500">选择服务方案、律师提交意见或文书待确认时，会在这里生成通知。</p>
        </section>
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
