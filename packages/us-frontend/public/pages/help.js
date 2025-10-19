import { loadHelpData } from '../content/helpData.js';
import { SUPPORTED_LANGS } from '../utils/language.js';

function createLangElement(tag, lang) {
  const element = document.createElement(tag);
  element.classList.add('lang-block');
  element.dataset.lang = lang;
  element.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : 'en');
  return element;
}

const INLINE_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\)]+\))/g;

function appendInline(target, text) {
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_TOKEN)) {
    const [token] = match;
    const index = match.index ?? 0;
    if (index > lastIndex) {
      target.appendChild(document.createTextNode(text.slice(lastIndex, index)));
    }
    if (token.startsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = token.slice(2, -2);
      target.appendChild(strong);
    } else if (token.startsWith('`')) {
      const code = document.createElement('code');
      code.textContent = token.slice(1, -1);
      target.appendChild(code);
    } else if (token.startsWith('[')) {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const anchor = document.createElement('a');
        anchor.href = linkMatch[2];
        anchor.textContent = linkMatch[1];
        anchor.target = '_blank';
        anchor.rel = 'noreferrer noopener';
        target.appendChild(anchor);
      }
    }
    lastIndex = index + token.length;
  }
  if (lastIndex < text.length) {
    target.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
}

function appendBlocks(container, blocks) {
  blocks.forEach((block) => {
    if (block.type === 'paragraph') {
      const paragraph = document.createElement('p');
      appendInline(paragraph, block.text);
      container.appendChild(paragraph);
    } else if (block.type === 'list') {
      const list = document.createElement('ul');
      list.classList.add('section-list');
      block.items.forEach((item) => {
        const li = document.createElement('li');
        appendInline(li, item);
        list.appendChild(li);
      });
      container.appendChild(list);
    }
  });
}

function renderSection(section) {
  const container = document.createElement('section');
  container.className = 'card help-section';
  container.id = section.id;
  container.setAttribute('tabindex', '-1');

  SUPPORTED_LANGS.forEach((lang) => {
    const content = section.content[lang];
    const wrapper = createLangElement('div', lang);

    const heading = document.createElement('h2');
    heading.textContent = content.title || section.label[lang];
    wrapper.appendChild(heading);

    appendBlocks(wrapper, content.summary || []);

    (content.subsections || []).forEach((subsection) => {
      if (subsection.heading) {
        const subHeading = document.createElement('h3');
        subHeading.textContent = subsection.heading;
        wrapper.appendChild(subHeading);
      }
      appendBlocks(wrapper, subsection.blocks || []);
    });

    container.appendChild(wrapper);
  });

  return container;
}

function renderToc(tocRoot, sections) {
  tocRoot.innerHTML = '';

  const title = document.createElement('p');
  title.className = 'help-toc-title';
  title.textContent = '目录 · Contents';
  tocRoot.appendChild(title);

  const list = document.createElement('div');
  list.className = 'help-toc-list';

  sections.forEach((section) => {
    const link = document.createElement('a');
    link.href = `#${section.id}`;
    link.className = 'help-toc-link';
    link.dataset.sectionTarget = section.id;

    SUPPORTED_LANGS.forEach((lang) => {
      const span = createLangElement('span', lang);
      span.classList.add('help-toc-text');
      span.textContent = section.label[lang];
      link.appendChild(span);
    });

    list.appendChild(link);
  });

  tocRoot.appendChild(list);
}

function setupTocInteraction(tocRoot) {
  tocRoot.querySelectorAll('a[href^="#"]').forEach((anchor) => {
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

export async function initHelpPage() {
  const helpRoot = document.querySelector('[data-help-root]');
  const tocRoot = document.querySelector('[data-help-toc]');

  if (!helpRoot || !tocRoot) {
    console.warn('Help page containers missing');
    return;
  }

  let data;
  try {
    data = await loadHelpData();
  } catch (error) {
    console.error('Failed to load help content', error);
    const errorMessage = document.createElement('p');
    errorMessage.textContent = 'Help content failed to load. Please refresh later.';
    helpRoot.appendChild(errorMessage);
    return;
  }

  (data.sections || []).forEach((section) => {
    helpRoot.appendChild(renderSection(section));
  });

  renderToc(tocRoot, data.sections || []);
  setupTocInteraction(tocRoot);
}
