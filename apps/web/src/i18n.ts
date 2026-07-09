import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

void i18n.use(initReactI18next).init({
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  interpolation: {
    escapeValue: false
  },
  resources: {
    'zh-CN': {
      translation: {
        appName: '法灵 AI',
        loginTitle: '手机号验证码登录',
        homeTitle: '案件工作台',
        newCase: '新建案件'
      }
    }
  }
});

export default i18n;
