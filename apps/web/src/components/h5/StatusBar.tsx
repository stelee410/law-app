export function StatusBar() {
  return (
    <div className="flex h-9 items-center justify-between px-6 text-xs font-semibold text-slate-700" aria-hidden="true">
      <span>9:41</span>
      <span className="h-1.5 w-16 rounded-full bg-slate-900/80" />
      <span>5G</span>
    </div>
  );
}
