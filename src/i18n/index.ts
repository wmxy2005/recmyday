import { getLocales } from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './locales/en';
import zhCN from './locales/zh-CN';

const resources = {
  'zh-CN': { translation: zhCN },
  en: { translation: en },
} as const;

function resolveLanguageTag() {
  const locale = getLocales()[0];
  const languageCode = locale?.languageCode ?? 'zh';

  if (languageCode === 'zh') {
    return 'zh-CN';
  }

  if (languageCode in resources) {
    return languageCode;
  }

  return 'zh-CN';
}

if (!i18n.isInitialized) {
  // eslint-disable-next-line import/no-named-as-default-member
  i18n.use(initReactI18next).init({
    resources,
    lng: resolveLanguageTag(),
    fallbackLng: 'zh-CN',
    interpolation: {
      escapeValue: false,
    },
    compatibilityJSON: 'v4',
  });
}

export default i18n;
