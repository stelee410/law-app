import { Link, useNavigate } from '@tanstack/react-router';
import { Clock3, LogOut, XCircle } from 'lucide-react';
import { queryClient } from '../lib/queryClient';
import { useAuthStore } from '../state/authStore';

export function LawyerReviewStatusPage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const isRejected = user?.lawyerReviewStatus === 'rejected';
  const Icon = isRejected ? XCircle : Clock3;

  async function handleLogout() {
    logout();
    queryClient.clear();
    await navigate({ to: '/login', replace: true });
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-5 py-10 text-center">
      <span className={`mx-auto grid size-16 place-items-center rounded-lg ${isRejected ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-700'}`}>
        <Icon size={30} />
      </span>
      <div>
        <h1 className="text-2xl font-black tracking-normal text-slate-950">{isRejected ? '入驻未通过' : '入驻审核中'}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          {isRejected ? '你的律师入驻申请暂未通过审核。' : '平台正在核验你的执业资料，审核通过后会开放律师工作台。'}
        </p>
      </div>
      {isRejected && user?.rejectedReason && (
        <div className="rounded-lg bg-red-50 p-4 text-left text-sm font-semibold leading-6 text-red-700">
          {user.rejectedReason}
        </div>
      )}
      <Link className="mx-auto rounded-lg bg-white px-5 py-3 text-sm font-black text-slate-800 shadow-sm" to="/me">
        查看账号
      </Link>
      <button className="mx-auto flex h-11 items-center justify-center gap-2 rounded-lg bg-red-50 px-5 text-sm font-black text-red-700" type="button" onClick={handleLogout}>
        <LogOut size={17} />
        退出登录
      </button>
    </div>
  );
}
