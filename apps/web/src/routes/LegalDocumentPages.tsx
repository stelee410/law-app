import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

const documents = {
  terms: {
    title: '服务协议',
    sections: [
      '本协议适用于平台向用户提供的法律案件信息整理、证据材料管理、AI 辅助评估、律师协作和案件进度服务。',
      '用户应提交真实、准确、完整的信息，不得冒用他人身份或上传与案件无关、违法违规的材料。',
      '平台提供的 AI 评估结果仅作为案件处理参考，不替代律师正式法律意见、司法机关裁判或仲裁机构决定。',
      '用户选择律师服务后，具体服务范围、费用、交付内容和沟通方式以页面展示、双方确认或后续服务文件为准。',
      '平台可因账号安全、违法违规、资料虚假或服务风控需要限制账号功能，并保留依法配合监管和司法机关的权利。'
    ]
  },
  privacy: {
    title: '隐私政策',
    sections: [
      '平台会根据注册、登录、案件处理、证据上传、律师审核和客户服务需要收集手机号、姓名、案件资料、证据文件和操作记录。',
      '平台仅在提供服务、保障安全、履行法定义务和处理争议所必需的范围内使用个人信息和案件资料。',
      '涉及律师协作时，平台会向经授权或经审核的律师展示处理案件所需的必要资料。',
      '平台会采取访问控制、传输保护、权限隔离和日志记录等措施保护信息安全。',
      '用户可依法请求查询、更正、删除个人信息或撤回授权，但撤回授权可能影响案件服务继续提供。'
    ]
  },
  authorization: {
    title: '案件资料授权书',
    sections: [
      '用户确认其提交的案件信息、合同、聊天记录、付款凭证、身份或主体资料等材料用于案件评估和法律服务处理。',
      '用户授权平台在案件处理目的范围内对材料进行存储、结构化整理、AI 辅助分析、风险识别和进度展示。',
      '用户选择律师复核、律师函、仲裁材料、合同审查等服务时，授权平台向负责该事项的律师展示必要案件资料。',
      '用户应确保上传材料来源合法，不侵犯第三方合法权益，并对材料真实性和完整性负责。',
      '本授权独立于平台注册服务协议和隐私政策勾选，在每次发起案件时由用户单独确认。'
    ]
  }
};

export function TermsPage() {
  return <LegalDocumentPage document={documents.terms} />;
}

export function PrivacyPage() {
  return <LegalDocumentPage document={documents.privacy} />;
}

export function CaseAuthorizationPage() {
  return <LegalDocumentPage document={documents.authorization} />;
}

function LegalDocumentPage({ document }: { document: { title: string; sections: string[] } }) {
  return (
    <article className="space-y-5">
      <Link className="flex items-center gap-2 text-sm font-bold text-slate-600" to="/login">
        <ArrowLeft size={17} />
        返回
      </Link>
      <header>
        <p className="text-sm font-black text-blue-700">法灵 AI</p>
        <h1 className="mt-2 text-2xl font-black tracking-normal text-slate-950">{document.title}</h1>
      </header>
      <section className="space-y-4 rounded-lg bg-white p-4 text-sm font-semibold leading-7 text-slate-700 shadow-sm">
        {document.sections.map((section, index) => (
          <p key={section}>
            {index + 1}. {section}
          </p>
        ))}
      </section>
    </article>
  );
}
