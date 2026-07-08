import { Link } from '@tanstack/react-router';
import { BriefcaseBusiness, CheckCircle2, ShieldCheck, UsersRound, XCircle } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import {
  useAdminLawyersQuery,
  useAdminOverviewQuery,
  useAdminUsersQuery,
  useReviewAdminLawyerMutation,
  useUpdateAdminUserMutation
} from '../hooks/useCaseQueries';
import type { User, UserRole } from '../lib/types';

export function AdminDashboardPage() {
  const overview = useAdminOverviewQuery();
  const summary = overview.data?.summary;
  return (
    <div className="space-y-5">
      <AdminHeader title="管理后台" description="查看平台账号、律师入驻和案件运营数据。" />
      <section className="grid grid-cols-3 gap-2">
        <Metric label="用户" value={summary?.totalUsers ?? 0} />
        <Metric label="案件" value={summary?.totalCases ?? 0} />
        <Metric label="待审" value={summary?.pendingLawyers ?? 0} />
      </section>
      <section className="grid grid-cols-2 gap-3">
        <AdminLink to="/admin/users" icon={<UsersRound size={20} />} title="用户管理" body="禁用、恢复账号，调整角色" />
        <AdminLink to="/admin/lawyers" icon={<ShieldCheck size={20} />} title="律师审核" body="批准或拒绝律师入驻" />
      </section>
      <section className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-black text-slate-900">
          <BriefcaseBusiness size={18} />
          最近案件
        </div>
        {(overview.data?.recentCases ?? []).slice(0, 5).map((lawCase) => (
          <div key={lawCase.id} className="rounded-lg bg-slate-50 p-3">
            <div className="font-black text-slate-900">{lawCase.debtorName}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">{lawCase.status}</div>
          </div>
        ))}
      </section>
    </div>
  );
}

export function AdminUsersPage() {
  const users = useAdminUsersQuery();
  const updateUser = useUpdateAdminUserMutation();
  const userList = users.data ?? [];

  return (
    <div className="space-y-5">
      <AdminHeader title="用户管理" description="账号只做禁用/恢复和角色调整，不做物理删除。" />
      <section className="space-y-3">
        {userList.map((user) => (
          <article key={user.id} className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="truncate text-base font-black text-slate-950">{user.name}</h2>
                <p className="mt-1 text-xs font-semibold text-slate-500">{user.phone}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs font-black ${user.accountStatus === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {user.accountStatus === 'active' ? '正常' : '已禁用'}
              </span>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-black">
              <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{roleLabel(user.role)}</span>
              {user.role === 'lawyer' && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-700">{reviewLabel(user.lawyerReviewStatus)}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              {user.accountStatus === 'active' && (
                <>
                  <label className="flex h-10 items-center gap-2 rounded-lg bg-slate-100 px-3 text-sm font-black text-slate-700">
                    <span>角色</span>
                    <select
                      aria-label={`${user.name}角色`}
                      className="bg-transparent font-black outline-none"
                      value={user.role}
                      onChange={(event) => updateUser.mutate({ userId: user.id, input: { role: event.target.value as UserRole } })}
                    >
                      <option value="client">客户</option>
                      <option value="lawyer">律师</option>
                      <option value="admin">管理员</option>
                    </select>
                  </label>
                  <button aria-label={`禁用${user.name}`} className="rounded-lg bg-red-50 px-3 py-2 text-sm font-black text-red-700" type="button" onClick={() => updateUser.mutate({ userId: user.id, input: { accountStatus: 'disabled' } })}>
                    禁用账号
                  </button>
                </>
              )}
              {user.accountStatus === 'disabled' && (
                <button className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700" type="button" onClick={() => updateUser.mutate({ userId: user.id, input: { accountStatus: 'active' } })}>
                  恢复账号
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export function AdminLawyersPage() {
  const lawyers = useAdminLawyersQuery();
  const reviewLawyer = useReviewAdminLawyerMutation();
  const [reason, setReason] = useState('资料暂未通过核验');

  return (
    <div className="space-y-5">
      <AdminHeader title="律师审核" description="审核律师入驻资料，批准后才开放律师工作台。" />
      <label className="block rounded-lg bg-white p-4 shadow-sm">
        <span className="mb-2 block text-sm font-black text-slate-700">拒绝原因</span>
        <input className="h-11 w-full rounded-lg bg-slate-50 px-3 outline-none focus:ring-2 focus:ring-blue-500" value={reason} onChange={(event) => setReason(event.target.value)} />
      </label>
      <section className="space-y-3">
        {(lawyers.data ?? []).map((lawyer) => (
          <article key={lawyer.id} className="space-y-3 rounded-lg bg-white p-4 shadow-sm">
            <div>
              <h2 className="text-base font-black text-slate-950">{lawyer.name}</h2>
              <p className="mt-1 text-xs font-semibold text-slate-500">{lawyer.lawFirm} · {lawyer.practiceRegion}</p>
            </div>
            <div className="text-sm font-semibold leading-6 text-slate-600">
              <div>执业证号：{lawyer.licenseNumber}</div>
              <div>擅长领域：{lawyer.specialties.join('、') || '未填写'}</div>
              <div>审核状态：{reviewLabel(lawyer.lawyerReviewStatus)}</div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className="flex items-center justify-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-700" type="button" onClick={() => reviewLawyer.mutate({ userId: lawyer.id, input: { status: 'approved' } })}>
                <CheckCircle2 size={16} />
                通过
              </button>
              <button className="flex items-center justify-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-black text-red-700" type="button" onClick={() => reviewLawyer.mutate({ userId: lawyer.id, input: { status: 'rejected', rejectedReason: reason } })}>
                <XCircle size={16} />
                拒绝
              </button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function AdminHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="space-y-2">
      <p className="text-sm font-black text-blue-700">Admin</p>
      <h1 className="text-2xl font-black tracking-normal text-slate-950">{title}</h1>
      <p className="text-sm leading-6 text-slate-500">{description}</p>
    </header>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-white p-3 text-center shadow-sm">
      <div className="text-xl font-black text-slate-950">{value}</div>
      <div className="mt-1 text-xs font-semibold text-slate-500">{label}</div>
    </div>
  );
}

function AdminLink({ to, icon, title, body }: { to: '/admin/users' | '/admin/lawyers'; icon: ReactNode; title: string; body: string }) {
  return (
    <Link className="rounded-lg bg-white p-4 shadow-sm" to={to}>
      <span className="grid size-10 place-items-center rounded-lg bg-blue-50 text-blue-700">{icon}</span>
      <strong className="mt-3 block text-base text-slate-950">{title}</strong>
      <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{body}</span>
    </Link>
  );
}

function roleLabel(role: UserRole) {
  if (role === 'admin') return '管理员';
  if (role === 'lawyer') return '律师';
  return '客户';
}

function reviewLabel(status: User['lawyerReviewStatus']) {
  if (status === 'approved') return '已通过';
  if (status === 'rejected') return '已拒绝';
  if (status === 'pending_review') return '待审核';
  return '无';
}
