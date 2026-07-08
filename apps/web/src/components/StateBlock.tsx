type StateBlockProps = {
  title: string;
};

export function StateBlock({ title }: StateBlockProps) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-slate-100 bg-white p-6 text-center text-sm font-bold text-slate-500 shadow-sm">
      {title}
    </div>
  );
}
