import { Link, useNavigate } from '@tanstack/react-router';
import { ChevronRight, FileCheck2, Headphones, HelpCircle, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import type { ReactNode } from 'react';
import { BrandHeader } from '../components/h5/BrandHeader';
import { MetricCard } from '../components/h5/MetricCard';
import { SectionHeader } from '../components/h5/SectionHeader';
import { useCasesQuery } from '../hooks/useCaseQueries';
import { formatDate } from '../lib/format';
import { queryClient } from '../lib/queryClient';
import { deriveDashboard } from '../lib/viewModel';
import { useAuthStore } from '../state/authStore';

export function ProfilePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const casesQuery = useCasesQuery();
  const dashboard = deriveDashboard(casesQuery.data ?? []);
  const returnAction =
    user?.role === 'lawyer'
      ? { to: '/lawyer' as const, label: '返回律师工作台' }
      : user?.role === 'admin'
        ? { to: '/admin' as const, label: '返回管理后台' }
        : { to: '/cases' as const, label: '返回案件列表' };

  async function handleLogout() {
    logout();
    queryClient.clear();
    await navigate({ to: '/login', replace: true });
  }

  return (
    <div className="space-y-5">
      <BrandHeader title="我的" description="账号、安全、文书和服务入口统一管理" />

      <section className="rounded-lg bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-700">
            <UserRound size={30} />
          </span>
          <div className="min-w-0">
            <h1 className="break-words text-2xl font-black tracking-normal">{user?.name ?? '用户'}</h1>
            <p className="mt-1 text-sm text-slate-500">{user?.phone ?? '--'}</p>
            <p className="mt-1 text-xs text-slate-400">加入时间：{user?.createdAt ? formatDate(user.createdAt) : '--'}</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3">
        {dashboard.metrics.slice(0, 2).map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="space-y-3">
        <SectionHeader title="我的服务" subtitle="账号、安全、文书和顾问入口" />
        <div className="overflow-hidden rounded-lg bg-white shadow-sm">
          <MenuLink icon={<ShieldCheck size={21} />} label="账户与安全" value="token 访问保护" />
          <MenuLink icon={<FileCheck2 size={21} />} label="法律文书" value="律师函与材料归档" />
          <MenuLink icon={<Headphones size={21} />} label="咨询客服" value="案件进展咨询" />
          <MenuLink icon={<HelpCircle size={21} />} label="帮助中心" value="上传和评估指南" />
        </div>
      </section>

      <Link to={returnAction.to} className="block h-12 rounded-lg border border-slate-200 bg-white pt-3 text-center font-black text-slate-700 shadow-sm">
        {returnAction.label}
      </Link>
      <button className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-red-50 font-black text-red-700" type="button" onClick={handleLogout}>
        <LogOut size={18} />
        退出登录
      </button>
    </div>
  );
}

function MenuLink({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <button className="flex w-full items-center gap-3 border-b border-slate-100 px-4 py-4 text-left last:border-b-0" type="button">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-700">{icon}</span>
      <span className="min-w-0 flex-1">
        <strong className="block text-sm text-slate-950">{label}</strong>
        <small className="mt-1 block truncate text-slate-500">{value}</small>
      </span>
      <ChevronRight className="shrink-0 text-slate-400" size={18} />
    </button>
  );
}
