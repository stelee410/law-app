import { formatDate, formatMoney } from './format';
import type { CaseEvent, CaseStage, LawCase } from './types';

export type Tone = 'blue' | 'green' | 'warm' | 'slate' | 'red';

export type DashboardMetric = {
  label: string;
  value: string;
  hint: string;
  tone: Tone;
};

export type DashboardView = {
  metrics: DashboardMetric[];
  latestCases: LawCase[];
  todayProgress: Array<{
    id: string;
    title: string;
    body: string;
    href: string;
    tone: Tone;
  }>;
};

export type H5Message = {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  href: string;
  tone: Tone;
};

export function evidenceProgress(lawCase: LawCase) {
  const required = lawCase.evidence.filter((item) => item.required);
  const baseline = required.length > 0 ? required : lawCase.evidence;
  const total = baseline.length;
  const uploaded = baseline.filter((item) => item.files.length > 0).length;
  return {
    total,
    uploaded,
    label: total === 0 ? '待生成清单' : `${uploaded}/${total} 项材料`,
    percent: total === 0 ? 0 : Math.round((uploaded / total) * 100)
  };
}

export function deriveDashboard(cases: LawCase[]): DashboardView {
  const totalAmount = cases.reduce((sum, item) => sum + item.amount, 0);
  const assessed = cases.filter((item) => item.assessment).length;
  const selectedPlan = cases.filter((item) => item.selectedPlan).length;
  const latestCases = [...cases]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3);

  return {
    latestCases,
    metrics: [
      { label: '案件数', value: `${cases.length}`, hint: '全部追偿案件', tone: 'blue' },
      { label: '追偿金额', value: formatMoney(totalAmount), hint: '当前登记本金', tone: 'slate' },
      { label: '已评估', value: `${assessed}`, hint: 'AI 已生成方案', tone: 'green' },
      { label: '服务中', value: `${selectedPlan}`, hint: '已选择闭环路径', tone: 'warm' }
    ],
    todayProgress: deriveTodayProgress(latestCases)
  };
}

export function deriveMessages(cases: LawCase[]): H5Message[] {
  if (cases.length === 0) {
    return [
      {
        id: 'welcome',
        title: '欢迎使用法灵 AI法务',
        body: '发起第一笔追偿案件后，证据提醒、评估结果和方案进展会在这里汇总。',
        time: '刚刚',
        unread: true,
        href: '/cases/new',
        tone: 'blue'
      },
      {
        id: 'evidence-guide',
        title: '证据上传提醒',
        body: '合同、聊天记录、转账凭证和催收记录会直接影响 AI 评估质量。',
        time: '今天',
        unread: false,
        href: '/cases/new',
        tone: 'warm'
      }
    ];
  }

  const latestCases = [...cases].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5);
  const caseMessages = latestCases.map((lawCase) => {
    const progress = evidenceProgress(lawCase);
    const body = lawCase.assessment
      ? `${lawCase.debtorName} 胜率参考 ${lawCase.assessment.winRate}%，建议路径：${lawCase.assessment.suggestedRoute}`
      : `${lawCase.debtorName} 当前状态：${lawCase.status}，证据进度 ${progress.label}`;
    return {
      id: `case-${lawCase.id}`,
      title: lawCase.assessment ? 'AI评估结果已更新' : '案件状态更新',
      body,
      time: formatDate(lawCase.createdAt),
      unread: !lawCase.selectedPlan,
      href: `/cases/${lawCase.id}`,
      tone: lawCase.assessment ? 'green' : 'blue'
    } satisfies H5Message;
  });

  return [
    ...caseMessages,
    {
      id: 'service',
      title: '平台服务通知',
      body: '案件数据、证据上传和服务方案均已接入当前本地 API。',
      time: '系统',
      unread: false,
      href: '/me',
      tone: 'slate'
    }
  ];
}

export function deriveLatestProgress(lawCase: LawCase, events: CaseEvent[] = []) {
  const activeStage = lawCase.stages.find((stage) => stage.status === 'active') ?? lawCase.stages.at(-1);
  const selfServiceStage = lawCase.selectedPlan === 'self-service' ? lawCase.stages.find((stage) => stage.key === 'letter') : null;
  const latestEvent = lawCase.selectedPlan === 'self-service'
    ? events.find((event) => event.type !== 'stage.changed' || event.title !== '发送律师函')
    : events[0];

  if (lawCase.selectedPlan === 'self-service' && lawCase.status === '已完成自助处理') {
    return {
      title: '自助处理已完成',
      body: '已记录回款、履行或结案结果；建议继续保存付款凭证、沟通记录和履行材料。',
      time: activeStage?.at ?? formatDate(lawCase.createdAt),
      href: `/cases/${lawCase.id}#self-service-actions`
    };
  }

  if (selfServiceStage && selfServiceStage.status === 'active') {
    return {
      title: selfServiceStage.title,
      body: selfServiceActiveBody(lawCase),
      time: selfServiceStage.at ?? formatDate(lawCase.createdAt),
      href: `/cases/${lawCase.id}`
    };
  }

  if (latestEvent) {
    return {
      title: latestEvent.title,
      body: latestEvent.message,
      time: formatDate(latestEvent.createdAt),
      href: `/cases/${lawCase.id}`
    };
  }

  if (activeStage) {
    return {
      title: activeStage.title,
      body: activeStage.description,
      time: activeStage.at ?? formatDate(lawCase.createdAt),
      href: `/cases/${lawCase.id}`
    };
  }

  return {
    title: '案件已创建',
    body: '请先补充证据材料，系统会继续生成 AI 评估和方案建议。',
    time: formatDate(lawCase.createdAt),
    href: `/cases/${lawCase.id}/evidence`
  };
}

function selfServiceActiveBody(lawCase: LawCase) {
  if (lawCase.caseType === 'debt_collection') {
    return '请先复制或下载付款催告函模板，自行发送/使用后记录凭证和对方回应。';
  }
  return '请先复制或下载 AI 自助模板，按当前业务场景核对后使用，并记录凭证和对方回应。';
}

function deriveTodayProgress(cases: LawCase[]): DashboardView['todayProgress'] {
  if (cases.length === 0) {
    return [
      {
        id: 'empty',
        title: '等待发起第一笔追偿',
        body: '填写案件信息后，证据、评估和方案进度会自动形成闭环。',
        href: '/cases/new',
        tone: 'warm'
      }
    ];
  }

  return cases.map((lawCase) => {
    const progress = evidenceProgress(lawCase);
    return {
      id: lawCase.id,
      title: lawCase.status,
      body: `${lawCase.debtorName} · ${lawCase.assessment ? 'AI评估已完成' : `证据进度 ${progress.label}`}`,
      href: `/cases/${lawCase.id}`,
      tone: lawCase.assessment ? 'green' : 'blue'
    };
  });
}

export function stageProgress(stages: CaseStage[]) {
  if (stages.length === 0) return { done: 0, total: 0, label: '待启动' };
  const done = stages.filter((stage) => stage.status === 'done').length;
  return {
    done,
    total: stages.length,
    label: `${done}/${stages.length} 阶段完成`
  };
}
