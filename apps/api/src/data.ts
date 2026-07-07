import type { EvidenceCategory, ServicePlan } from './types.js';

export const servicePlans: ServicePlan[] = [
  {
    id: 'self-service',
    name: 'AI自助版',
    subtitle: '适合预算有限 / 自主操作',
    price: 399,
    fee: '一次性服务费',
    features: ['AI生成法律文书', '发送律师函指引', '进度跟踪提醒']
  },
  {
    id: 'lawyer-review',
    name: '律师复核版',
    subtitle: '平衡效率与专业',
    price: 1499,
    fee: '服务费 + 成功费 5%',
    recommended: true,
    features: ['平台律师复核文书', '发送律师函 + 谈判指导', '协商谈判支持', '诉讼材料准备支持']
  },
  {
    id: 'full-service',
    name: '全程代办版',
    subtitle: '省心省力 / 全程托管',
    price: 5999,
    fee: '服务费 + 成功费 10%',
    features: ['律师全程代理', '协商谈判 + 立案', '出庭应诉（如需）', '执行跟进']
  }
];

export function createEvidence(): EvidenceCategory[] {
  return [
    { id: 'contract', name: '合同/协议', required: true, status: 'pending', files: [], insight: '待上传' },
    { id: 'invoice', name: '发票', required: false, status: 'pending', files: [], insight: '待上传' },
    { id: 'chat', name: '聊天记录', required: true, status: 'pending', files: [], insight: '待上传' },
    { id: 'transfer', name: '转账记录', required: true, status: 'pending', files: [], insight: '待上传' },
    { id: 'delivery', name: '交付证明', required: false, status: 'pending', files: [], insight: '待上传' },
    { id: 'other', name: '其他证据', required: false, status: 'optional', files: [], insight: '选填项' }
  ];
}
