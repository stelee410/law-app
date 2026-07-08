import { Outlet, useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomNav } from '../components/h5/BottomNav';
import { StatusBar } from '../components/h5/StatusBar';
import { useMeQuery } from '../hooks/useCaseQueries';
import { useAuthStore } from '../state/authStore';

export function RootLayout() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const meQuery = useMeQuery();
  const isLogin = location.pathname === '/login';

  useEffect(() => {
    if (meQuery.data) setUser(meQuery.data);
  }, [meQuery.data, setUser]);

  useEffect(() => {
    if (meQuery.isError) logout();
  }, [logout, meQuery.isError]);

  useEffect(() => {
    if (!token && !isLogin) {
      void navigate({ to: '/login', replace: true });
    }
    if (token && isLogin) {
      void navigate({ to: '/', replace: true });
    }
  }, [isLogin, navigate, token]);

  const showNav = Boolean(token && !isLogin);
  const needsAuthRedirect = !token && !isLogin;
  const isRestoring = Boolean(token && !user && meQuery.isPending);

  return (
    <main className="min-h-dvh bg-[#eef2f7] px-3 py-3 text-slate-950">
      <section className="phone-shell mx-auto flex min-h-[calc(100dvh-1.5rem)] w-full max-w-[430px] flex-col overflow-hidden border border-white/80 bg-slate-50 shadow-2xl">
        <StatusBar />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-28 pt-3">
          {needsAuthRedirect || isRestoring ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
              <span className="grid size-14 place-items-center rounded-lg bg-blue-600 text-xl font-black text-white shadow-lg shadow-blue-200">
                律
              </span>
              <strong>{t('appName')}</strong>
              <span className="text-sm text-slate-500">正在恢复案件工作台</span>
            </div>
          ) : (
            <Outlet />
          )}
        </div>
        {showNav && <BottomNav pathname={location.pathname} />}
      </section>
    </main>
  );
}
