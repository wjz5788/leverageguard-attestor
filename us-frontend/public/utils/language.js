const STORAGE_KEY = 'us-frontend-language';

export const SUPPORTED_LANGS = ['zh', 'en'];

export function detectLanguage() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'zh' || stored === 'en') {
      return stored;
    }
  } catch (error) {
    console.warn('Unable to access localStorage for language preference', error);
  }

  const browser = (navigator.language || '').toLowerCase();
  if (browser.startsWith('zh')) {
    return 'zh';
  }
  return 'en';
}

export function persistLanguage(lang) {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch (error) {
    console.warn('Unable to persist language preference', error);
  }
}
