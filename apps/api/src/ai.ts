import { servicePlans } from './data.js';
import type { Assessment, LawCase } from './types.js';

export function assessCase(lawCase: LawCase): Assessment {
  const uploadedFiles = lawCase.evidence.reduce((total, category) => total + category.files.length, 0);
  const requiredCategories = lawCase.evidence.filter((category) => category.required);
  const coveredRequired = requiredCategories.filter((category) => category.files.length > 0 || category.status === 'recognized').length;
  const evidenceCoverage = requiredCategories.length === 0 ? 1 : coveredRequired / requiredCategories.length;
  const dueBonus = lawCase.dueStatus === '已到期' ? 12 : lawCase.dueStatus === '部分到期' ? 6 : 0;
  const amountRisk = lawCase.amount > 200000 ? -8 : lawCase.amount > 100000 ? -3 : 4;
  const score = Math.max(42, Math.min(92, Math.round(48 + evidenceCoverage * 24 + Math.min(uploadedFiles, 10) * 1.2 + dueBonus + amountRisk)));
  const confidence = score >= 82 ? '高' : score >= 68 ? '较高' : '中等';
  const estimatedRecovery = Math.round(lawCase.amount * (score >= 75 ? 1 : score >= 62 ? 0.82 : 0.65));

  return {
    winRate: score,
    confidence,
    summary: score >= 70 ? '证据较充分，对方违约事实清晰，可行性较高' : '基础证据已建立，建议继续补充交付与催款记录',
    suggestedRoute: score >= 70 ? '先发律师函 → 协商调解 → 立案' : '补充证据 → 律师复核 → 发函催告',
    estimatedDays: score >= 70 ? '约 30-45 天' : '约 45-60 天',
    estimatedRecovery,
    findings: [
      `识别欠款金额：￥${lawCase.amount.toLocaleString('zh-CN')}`,
      `已覆盖关键证据类型：${coveredRequired}/${requiredCategories.length}`,
      `当前已上传证据：${uploadedFiles} 份`,
      lawCase.dueStatus === '已到期' ? '款项已到期，具备催告与追偿基础' : '建议进一步确认款项到期节点'
    ],
    plans: servicePlans,
    generatedAt: new Date().toISOString()
  };
}
