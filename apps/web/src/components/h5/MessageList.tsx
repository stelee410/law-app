import type { H5Message, Tone } from '../../lib/viewModel';

const dotClass: Record<Tone, string> = {
  blue: 'bg-blue-600',
  green: 'bg-emerald-600',
  warm: 'bg-[#c96442]',
  slate: 'bg-slate-400',
  red: 'bg-red-600'
};

export function MessageList({ messages }: { messages: H5Message[] }) {
  return (
    <div className="space-y-3">
      {messages.map((message) => (
        <a
          className="flex items-start gap-3 rounded-lg bg-white p-4 shadow-sm"
          key={message.id}
          href={message.href}
        >
          <span className={`mt-1 size-2.5 shrink-0 rounded-full ${message.unread ? dotClass[message.tone] : 'bg-slate-300'}`} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-3">
              <strong className="min-w-0 break-words text-sm text-slate-950">{message.title}</strong>
              <time className="shrink-0 text-xs text-slate-400">{message.time}</time>
            </span>
            <span className="mt-1 block break-words text-sm leading-6 text-slate-500">{message.body}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
