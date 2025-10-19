export type SupportedLanguage = 'zh' | 'en';

const STORAGE_KEY = 'us-frontend-language';

export function detectLanguage(): SupportedLanguage {
  const stored = window.localStorage.getItem(STORAGE_KEY) as SupportedLanguage | null;
  if (stored === 'zh' || stored === 'en') {
    return stored;
  }

  const browser = navigator.language.toLowerCase();
  if (browser.startsWith('zh')) {
    return 'zh';
  }

  return 'en';
}

export function persistLanguage(lang: SupportedLanguage) {
  window.localStorage.setItem(STORAGE_KEY, lang);
}
