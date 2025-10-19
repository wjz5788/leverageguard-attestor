import {
  helpSections,
  helpToc,
  type ContentBlock,
  type HelpSectionId,
  type LocalizedSection,
} from '../content/help';
import type { AnchorDefinition, PageDescriptor } from '../router';
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../utils/language';

const HELP_ANCHORS: AnchorDefinition[] = [
  {
    id: 'what',
    label: {
      zh: '是什么',
      en: 'What',
    },
  },
  {
    id: 'how',
    label: {
      zh: '如何运作',
      en: 'How',
    },
  },
  {
    id: 'faq',
    label: {
      zh: '常见问题',
      en: 'FAQ',
    },
  },
];

const SECTION_ANCHOR_MAP: Partial<Record<HelpSectionId, AnchorDefinition>> = {
  overview: HELP_ANCHORS[0],
  flow: HELP_ANCHORS[1],
  faq: HELP_ANCHORS[2],
};

function createLangElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  lang: SupportedLanguage
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.classList.add('lang-block');
  element.dataset.lang = lang;
  element.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : 'en');
  return element;
}

const INLINE_TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^\)]+\))/g;

function appendInlineContent(target: HTMLElement, text: string) {
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

function appendBlocks(container: HTMLElement, blocks: ContentBlock[]) {
  blocks.forEach((block) => {
    if (block.type === 'paragraph') {
      const paragraph = document.createElement('p');
      appendInlineContent(paragraph, block.text);
      container.appendChild(paragraph);
    } else if (block.type === 'list') {
      const list = document.createElement('ul');
      list.classList.add('section-list');
      block.items.forEach((item) => {
        const li = document.createElement('li');
        appendInlineContent(li, item);
        list.appendChild(li);
      });
      container.appendChild(list);
    }
  });
}

function renderSection(section: LocalizedSection) {
  const container = document.createElement('section');
  container.className = 'card help-section';
  const anchor = SECTION_ANCHOR_MAP[section.id];
  const anchorId = anchor?.id ?? section.id;
  container.id = anchorId;
  container.dataset.sectionId = section.id;
  container.setAttribute('tabindex', '-1');

  SUPPORTED_LANGUAGES.forEach((lang) => {
    const content = section.content[lang];
    const wrapper = createLangElement('div', lang);

    const heading = document.createElement('h2');
    const defaultTitle = content.title || section.label[lang];
    const anchorLabel = anchor?.label[lang];

    if (anchorLabel && anchorLabel !== defaultTitle) {
      const anchorBadge = document.createElement('span');
      anchorBadge.className = 'help-anchor-label';
      anchorBadge.textContent = anchorLabel;

      const titleText = document.createElement('span');
      titleText.className = 'help-section-title-text';
      titleText.textContent = defaultTitle;

      heading.appendChild(anchorBadge);
      heading.appendChild(document.createTextNode(' · '));
      heading.appendChild(titleText);
    } else {
      heading.textContent = defaultTitle;
    }
    wrapper.appendChild(heading);

    appendBlocks(wrapper, content.summary);

    content.subsections.forEach((subsection) => {
      if (subsection.heading) {
        const subHeading = document.createElement('h3');
        subHeading.textContent = subsection.heading;
        wrapper.appendChild(subHeading);
      }
      appendBlocks(wrapper, subsection.blocks);
    });

    container.appendChild(wrapper);
  });

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

  helpToc.forEach((item) => {
    const link = document.createElement('a');
    const anchor = SECTION_ANCHOR_MAP[item.id];
    const anchorId = anchor?.id ?? item.id;
    link.href = `#${anchorId}`;
    link.className = 'help-toc-link';
    link.dataset.sectionTarget = item.id;
    link.dataset.sectionAnchor = anchorId;

    SUPPORTED_LANGUAGES.forEach((lang) => {
      const span = createLangElement('span', lang);
      span.classList.add('help-toc-text');
      const anchorLabel = anchor?.label[lang];
      span.textContent = anchorLabel ? `${anchorLabel} · ${item.label[lang]}` : item.label[lang];
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
      const anchorId = anchor.dataset.sectionAnchor ?? anchor.getAttribute('href')?.slice(1);
      const sectionId = anchor.dataset.sectionTarget;
      const target =
        (anchorId && document.getElementById(anchorId)) ||
        (sectionId
          ? document.querySelector<HTMLElement>(`[data-section-id="${sectionId}"]`)
          : null);

      if (!target) {
        return;
      }

      target.focus({ preventScroll: true });
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

export function HelpPage(): PageDescriptor {
  return {
    id: 'help',
    label: {
      zh: '帮助',
      en: 'Help',
    },
    anchors: HELP_ANCHORS.map((anchor) => ({ ...anchor })),
    init: initHelp,
  };
}
