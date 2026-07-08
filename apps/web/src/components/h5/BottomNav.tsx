import { Link } from '@tanstack/react-router';
import { BriefcaseBusiness, ClipboardList, Home, MessageCircle, Plus, UserRound } from 'lucide-react';
import type { UserRole } from '../../lib/types';

export function BottomNav({ pathname, role = 'client' }: { pathname: string; role?: UserRole }) {
  const clientItems = [
    { to: '/', label: '首页', icon: Home, active: pathname === '/' },
    { to: '/cases/new', label: '发起', icon: Plus, active: pathname === '/cases/new' },
    {
      to: '/cases',
      label: '案件',
      icon: BriefcaseBusiness,
      active: pathname === '/cases' || (pathname.startsWith('/cases/') && pathname !== '/cases/new')
    },
    { to: '/messages', label: '消息', icon: MessageCircle, active: pathname === '/messages' },
    { to: '/me', label: '我的', icon: UserRound, active: pathname === '/me' }
  ] as const;
  const lawyerItems = [
    { to: '/lawyer', label: '待办', icon: ClipboardList, active: pathname === '/lawyer' || pathname.startsWith('/lawyer/') },
    { to: '/messages', label: '消息', icon: MessageCircle, active: pathname === '/messages' },
    { to: '/me', label: '我的', icon: UserRound, active: pathname === '/me' }
  ] as const;
  const items = role === 'lawyer' ? lawyerItems : clientItems;

  return (
    <nav className={`absolute inset-x-0 bottom-0 grid border-t border-slate-200 bg-white/95 px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur ${role === 'lawyer' ? 'grid-cols-3' : 'grid-cols-5'}`}>
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex min-w-0 flex-col items-center gap-1 rounded-lg px-1 py-1.5 text-[11px] font-semibold ${
              item.active ? 'bg-blue-50 text-blue-700' : 'text-slate-500'
            }`}
          >
            <Icon size={19} />
            <span className="w-full truncate text-center">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
