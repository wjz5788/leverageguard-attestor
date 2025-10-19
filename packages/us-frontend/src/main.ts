import './styles/main.css';

import { routes } from './App';
import { normalizePath } from './router';
import {
  SUPPORTED_LANGUAGES,
  detectLanguage,
  persistLanguage,
  type SupportedLanguage,
} from './utils/language';

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

function buildNavigation() {
  const navRoot = document.querySelector<HTMLElement>('[data-nav-links]');
  if (!navRoot) {
    return;
  }

  navRoot.innerHTML = '';

  routes.forEach((route) => {
    const link = document.createElement('a');
    link.className = 'nav-link';
    link.href = route.path;
    link.dataset.navLink = '';
    link.dataset.routeId = route.id;

    SUPPORTED_LANGUAGES.forEach((lang) => {
      const span = document.createElement('span');
      span.className = 'lang-block';
      span.dataset.lang = lang;
      span.textContent = route.label[lang];
      link.appendChild(span);
    });

    navRoot.appendChild(link);
  });
}

function initNavigation(currentPath: string) {
  document.querySelectorAll<HTMLAnchorElement>('[data-nav-link]').forEach((link) => {
    const href = link.getAttribute('href');
    if (!href) {
      return;
    }
    const normalized = normalizePath(href);
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
  buildNavigation();

  const currentPath = normalizePath(window.location.pathname);
  initNavigation(currentPath);

  const activeRoute = routes.find((route) => route.path === currentPath);
  if (activeRoute) {
    document.body.dataset.page = activeRoute.id;
    activeRoute.init?.();
  }
});
