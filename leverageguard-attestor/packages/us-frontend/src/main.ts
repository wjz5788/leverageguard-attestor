import './styles/main.css';

import { initHelp } from './pages/help';
import { initHome } from './pages/home';
import { detectLanguage, persistLanguage, type SupportedLanguage } from './utils/language';

function applyLanguage(lang: SupportedLanguage, buttons: HTMLButtonElement[]) {
  document.body.dataset.currentLang = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';

  buttons.forEach((button) => {
    const isActive = button.dataset.lang === lang;
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function initLanguageControls(): SupportedLanguage {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>('[data-lang-option]')
  );

  const initialLang = detectLanguage();
  applyLanguage(initialLang, buttons);

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const lang = button.dataset.lang as SupportedLanguage | undefined;
      if (!lang || lang === document.body.dataset.currentLang) {
        return;
      }
      persistLanguage(lang);
      applyLanguage(lang, buttons);
    });
  });

  return initialLang;
}

function initNavigation() {
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) {
      return;
    }
    const normalized = href.replace(/\/+$/, '') || '/';
    const isActive = normalized === currentPath;
    if (isActive) {
      link.setAttribute('aria-current', 'page');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initLanguageControls();
  initNavigation();

  const page = document.body.dataset.page;
  if (page === 'home') {
    initHome();
  } else if (page === 'help') {
    initHelp();
  }
});
