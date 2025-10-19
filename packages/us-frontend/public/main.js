import { initHelpPage } from './pages/help.js';
import { initHomePage } from './pages/home.js';
import { detectLanguage, persistLanguage } from './utils/language.js';

function applyLanguage(lang, buttons) {
  document.body.dataset.currentLang = lang;
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en';

  buttons.forEach((button) => {
    const isActive = button.dataset.lang === lang;
    button.setAttribute('aria-pressed', String(isActive));
  });
}

function initLanguageControls() {
  const buttons = Array.from(document.querySelectorAll('[data-lang-option]'));
  const initialLang = detectLanguage();
  applyLanguage(initialLang, buttons);

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const lang = button.dataset.lang;
      if (!lang || lang === document.body.dataset.currentLang) {
        return;
      }
      persistLanguage(lang);
      applyLanguage(lang, buttons);
    });
  });
}

function initNavigation() {
  const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
  document.querySelectorAll('[data-nav-link]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) {
      return;
    }
    const normalized = href.replace(/\/+$/, '') || '/';
    if (normalized === currentPath) {
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
    initHomePage();
  } else if (page === 'help') {
    initHelpPage();
  }
});
