export function formatMoney(amount: number) {
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0
  }).format(amount);
}

export function formatCaseAmount(amount: number) {
  return amount > 0 ? formatMoney(amount) : '未填写';
}

export function formatDate(value: string) {
  return value ? value.slice(0, 10) : '--';
}

export function fileSizeLabel(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
