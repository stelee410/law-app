import { MessageCircle } from 'lucide-react';
import { MessageList } from '../components/h5/MessageList';
import { SectionHeader } from '../components/h5/SectionHeader';
import { StateBlock } from '../components/StateBlock';
import { useCasesQuery } from '../hooks/useCaseQueries';
import { deriveMessages } from '../lib/viewModel';

export function MessagesPage() {
  const casesQuery = useCasesQuery();
  const messages = deriveMessages(casesQuery.data ?? []);
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

      {casesQuery.isPending && <StateBlock title="消息同步中" />}
      {casesQuery.isError && (
        <section className="rounded-lg bg-red-50 p-4 text-sm font-semibold leading-6 text-red-700">
          消息加载失败，请检查案件列表接口。
        </section>
      )}
      {!casesQuery.isPending && !casesQuery.isError && <MessageList messages={messages} />}
    </div>
  );
}
