type StateBlockProps = {
  title: string;
};

export function StateBlock({ title }: StateBlockProps) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg bg-white p-6 text-center font-bold text-slate-500">
      {title}
    </div>
  );
}
