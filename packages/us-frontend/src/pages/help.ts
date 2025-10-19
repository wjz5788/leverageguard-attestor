import { helpSections, tocOrder, type HelpSection, type HelpSubsection } from '../content/help';
import type { SupportedLanguage } from '../utils/language';

const LANGS: SupportedLanguage[] = ['zh', 'en'];

function createLocalizedHeading(tag: 'h1' | 'h2' | 'h3', text: { zh: string; en: string }) {
  const fragment = document.createDocumentFragment();
  LANGS.forEach((lang) => {
    const el = document.createElement(tag);
    el.classList.add('lang-block');
    el.dataset.lang = lang;
    el.textContent = text[lang] || text.zh;
    el.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : 'en');
    fragment.appendChild(el);
  });
  return fragment;
}

function createLocalizedParagraph(text: { zh: string; en: string }) {
  const fragment = document.createDocumentFragment();
  LANGS.forEach((lang) => {
    const paragraph = document.createElement('p');
    paragraph.classList.add('lang-block');
    paragraph.dataset.lang = lang;
    paragraph.textContent = text[lang] || text.zh;
    paragraph.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : 'en');
    fragment.appendChild(paragraph);
  });
  return fragment;
}

function createLocalizedList(items: Array<{ zh: string; en: string }>) {
  const fragment = document.createDocumentFragment();
  LANGS.forEach((lang) => {
    const list = document.createElement('ul');
    list.classList.add('section-list', 'lang-block');
    list.dataset.lang = lang;
    list.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : 'en');
    items.forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item[lang] || item.zh;
      list.appendChild(li);
    });
    fragment.appendChild(list);
  });
  return fragment;
}

function renderSubsection(sectionEl: HTMLElement, subsection: HelpSubsection) {
  if (subsection.heading) {
    sectionEl.appendChild(createLocalizedHeading('h3', subsection.heading));
  }
  subsection.paragraphs?.forEach((paragraph) => {
    sectionEl.appendChild(createLocalizedParagraph(paragraph));
  });
  if (subsection.list?.length) {
    sectionEl.appendChild(createLocalizedList(subsection.list));
  }
}

function renderSection(section: HelpSection) {
  const container = document.createElement('section');
  container.className = 'card help-section';
  container.id = section.id;
  container.setAttribute('tabindex', '-1');

  container.appendChild(createLocalizedHeading('h2', section.title));

  section.summary?.forEach((paragraph) => {
    container.appendChild(createLocalizedParagraph(paragraph));
  });

  section.subsections?.forEach((subsection) => renderSubsection(container, subsection));

  return container;
}

function renderToc(tocRoot: HTMLElement) {
  tocRoot.innerHTML = '';

  const title = document.createElement('p');
  title.className = 'help-toc-title';
  title.textContent = '目录 · Contents';
  tocRoot.appendChild(title);

  const list = document.createElement('div');
  list.className = 'help-toc-list';

  tocOrder.forEach((item) => {
    const link = document.createElement('a');
    link.href = `#${item.id}`;
    link.className = 'help-toc-link';
    link.dataset.sectionTarget = item.id;

    LANGS.forEach((lang) => {
      const span = document.createElement('span');
      span.classList.add('lang-block');
      span.dataset.lang = lang;
      span.textContent = item.label[lang] || item.label.zh;
      span.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : 'en');
      link.appendChild(span);
    });

    list.appendChild(link);
  });

  tocRoot.appendChild(list);
}

function setupTocInteraction(tocRoot: HTMLElement) {
  tocRoot.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (event) => {
      event.preventDefault();
      const targetId = anchor.getAttribute('href')?.slice(1);
      if (!targetId) {
        return;
      }
      const target = document.getElementById(targetId);
      if (target) {
        target.focus({ preventScroll: true });
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });
}

export function initHelp() {
  const helpRoot = document.querySelector<HTMLElement>('[data-help-root]');
  const tocRoot = document.querySelector<HTMLElement>('[data-help-toc]');

  if (!helpRoot || !tocRoot) {
    console.warn('Help page containers missing');
    return;
  }

  helpSections.forEach((section) => {
    helpRoot.appendChild(renderSection(section));
  });

  renderToc(tocRoot);
  setupTocInteraction(tocRoot);
}
