import type { SupportedLanguage } from '../utils/language';
import { SUPPORTED_LANGUAGES } from '../utils/language';

export type HelpSectionId = 'overview' | 'flow' | 'faq' | 'compliance';

export interface InlineListBlock {
  type: 'list';
  items: string[];
}

export interface InlineParagraphBlock {
  type: 'paragraph';
  text: string;
}

export type ContentBlock = InlineListBlock | InlineParagraphBlock;

export interface SectionSubsection {
  heading?: string;
  blocks: ContentBlock[];
}

export interface SectionContent {
  title: string;
  summary: ContentBlock[];
  subsections: SectionSubsection[];
}

export interface LocalizedSection {
  id: HelpSectionId;
  label: Record<SupportedLanguage, string>;
  content: Record<SupportedLanguage, SectionContent>;
  sources: Partial<Record<SupportedLanguage, string>>;
}

const HELP_DOC_MODULES = import.meta.glob<string>(
  '../../docs/**/*{H,h}elp*.md',
  { as: 'raw', eager: true }
);

interface MarkdownSection {
  heading: string;
  lines: string[];
}

interface SectionConfig {
  id: HelpSectionId;
  label: Record<SupportedLanguage, string>;
  sourcePatterns: Record<SupportedLanguage, RegExp[]>;
}

const SECTION_CONFIG: SectionConfig[] = [
  {
    id: 'overview',
    label: { zh: 'Overview', en: 'Overview' },
    sourcePatterns: {
      zh: [/^Project Overview/i],
      en: [/^Project Overview/i],
    },
  },
  {
    id: 'flow',
    label: { zh: 'Usage Flow', en: 'Usage Flow' },
    sourcePatterns: {
      zh: [/Product & Claim Workflow/i],
      en: [/Product & Claim Workflow/i],
    },
  },
  {
    id: 'faq',
    label: { zh: 'FAQ', en: 'FAQ' },
    sourcePatterns: {
      zh: [/Why Users Connect Exchange Data/i],
      en: [/Why Users Connect Exchange Data/i],
    },
  },
  {
    id: 'compliance',
    label: { zh: 'Interfaces & Privacy / Compliance', en: 'Interfaces & Privacy / Compliance' },
    sourcePatterns: {
      zh: [/Data and Privacy/i, /Pricing and Risk Control/i, /Contact/i],
      en: [/Data and Privacy/i, /Pricing and Risk Control/i, /Contact/i],
    },
  },
];

interface DocCandidate {
  path: string;
  content: string;
  lang: SupportedLanguage;
  version: number;
  weight: number;
  length: number;
}

function detectLanguageFromContent(path: string, content: string): SupportedLanguage {
  const normalizedPath = path.toLowerCase();
  if (/(_en\b|english)/i.test(normalizedPath)) {
    return 'en';
  }
  if (/(_cn\b|zh|中文)/i.test(normalizedPath)) {
    return 'zh';
  }

  const hanCount = (content.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latinCount = (content.match(/[A-Za-z]/g) ?? []).length;
  return hanCount >= latinCount ? 'zh' : 'en';
}

function extractVersionToken(path: string, content: string): number {
  const matches: number[] = [];
  for (const match of path.matchAll(/v(\d+)/gi)) {
    matches.push(Number.parseInt(match[1], 10));
  }
  for (const match of content.matchAll(/v(?:ersion)?\s*(\d+)/gi)) {
    matches.push(Number.parseInt(match[1], 10));
  }
  for (const match of content.matchAll(/版本[：: ]*(\d+)/gi)) {
    matches.push(Number.parseInt(match[1], 10));
  }
  return matches.length ? Math.max(...matches) : 0;
}

function computeCandidateWeight(path: string): number {
  const normalized = path.toLowerCase();
  let weight = 0;
  if (normalized.includes('helpdoc')) {
    weight += 4;
  }
  if (normalized.includes('final')) {
    weight += 2;
  }
  if (normalized.includes('v')) {
    weight += 1;
  }
  return weight;
}

function collectDocCandidates(): DocCandidate[] {
  return Object.entries(HELP_DOC_MODULES)
    .map(([path, content]) => {
      const text = content as string;
      const lang = detectLanguageFromContent(path, text);
      return {
        path,
        content: text,
        lang,
        version: extractVersionToken(path, text),
        weight: computeCandidateWeight(path),
        length: text.length,
      } satisfies DocCandidate;
    })
    .filter((candidate) => candidate.content.trim().length > 0);
}

function selectLatestDoc(candidates: DocCandidate[], lang: SupportedLanguage): DocCandidate | null {
  const filtered = candidates.filter((candidate) => candidate.lang === lang);
  if (!filtered.length) {
    return null;
  }

  filtered.sort((a, b) => {
    if (b.weight !== a.weight) {
      return b.weight - a.weight;
    }
    if (b.version !== a.version) {
      return b.version - a.version;
    }
    if (b.length !== a.length) {
      return b.length - a.length;
    }
    return a.path.localeCompare(b.path);
  });

  return filtered[0];
}

function splitMarkdownSections(content: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  const lines = content.split(/\r?\n/);
  let current: MarkdownSection | null = null;

  for (const line of lines) {
    if (line.trim().startsWith('## ')) {
      const heading = line.trim().replace(/^##\s*/, '').trim();
      current = { heading, lines: [] };
      sections.push(current);
      continue;
    }

    if (!current) {
      continue;
    }
    current.lines.push(line);
  }

  return sections;
}

function normalizeParagraph(lines: string[]): string {
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function parseContentBlocks(lines: string[]): { summary: ContentBlock[]; subsections: SectionSubsection[] } {
  const summary: ContentBlock[] = [];
  const subsections: SectionSubsection[] = [];
  let currentBlocks = summary;
  let currentSubsection: SectionSubsection | null = null;
  let pendingParagraph: string[] = [];
  let pendingList: string[] | null = null;

  const flushParagraph = () => {
    if (pendingParagraph.length) {
      const text = normalizeParagraph(pendingParagraph);
      if (text) {
        currentBlocks.push({ type: 'paragraph', text });
      }
      pendingParagraph = [];
    }
  };

  const flushList = () => {
    if (pendingList && pendingList.length) {
      currentBlocks.push({ type: 'list', items: [...pendingList] });
      pendingList = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || /^---+$/.test(line)) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      const heading = line.replace(/^###\s*/, '').trim();
      currentSubsection = { heading, blocks: [] };
      subsections.push(currentSubsection);
      currentBlocks = currentSubsection.blocks;
      continue;
    }

    if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      flushParagraph();
      if (!pendingList) {
        pendingList = [];
      }
      pendingList.push(line.replace(/^([-*+]|\d+\.)\s+/, '').trim());
      continue;
    }

    if (line.startsWith('>')) {
      flushParagraph();
      flushList();
      const text = line.replace(/^>\s?/, '').trim();
      if (text) {
        currentBlocks.push({ type: 'paragraph', text });
      }
      continue;
    }

    pendingParagraph.push(line);
  }

  flushParagraph();
  flushList();

  return { summary, subsections };
}

function buildSectionContent(
  sections: MarkdownSection[],
  patterns: RegExp[],
  fallbackTitle: string
): SectionContent {
  const matchedSections = patterns
    .map((pattern) => sections.find((section) => pattern.test(section.heading)))
    .filter((section): section is MarkdownSection => Boolean(section));

  if (!matchedSections.length) {
    return {
      title: fallbackTitle,
      summary: [],
      subsections: [],
    };
  }

  const combinedSummary: ContentBlock[] = [];
  const combinedSubsections: SectionSubsection[] = [];

  matchedSections.forEach((section) => {
    const { summary, subsections } = parseContentBlocks(section.lines);
    combinedSummary.push(...summary);
    combinedSubsections.push(...subsections);
  });

  return {
    title: fallbackTitle,
    summary: combinedSummary,
    subsections: combinedSubsections,
  };
}

function parseHelpDoc(raw: string, lang: SupportedLanguage): Record<HelpSectionId, SectionContent> {
  const sections = splitMarkdownSections(raw);
  const result = new Map<HelpSectionId, SectionContent>();

  SECTION_CONFIG.forEach((config) => {
    const content = buildSectionContent(sections, config.sourcePatterns[lang], config.label[lang]);
    result.set(config.id, content);
  });

  return Object.fromEntries(result) as Record<HelpSectionId, SectionContent>;
}

function buildHelpSections(): LocalizedSection[] {
  const candidates = collectDocCandidates();
  const zhDoc = selectLatestDoc(candidates, 'zh');
  const enDoc = selectLatestDoc(candidates, 'en') ?? zhDoc;

  const zhParsed = parseHelpDoc(zhDoc?.content ?? '', 'zh');
  const enParsed = parseHelpDoc(enDoc?.content ?? zhDoc?.content ?? '', 'en');

  return SECTION_CONFIG.map((config) => ({
    id: config.id,
    label: config.label,
    content: {
      zh: zhParsed[config.id],
      en: enParsed[config.id],
    },
    sources: {
      zh: zhDoc?.path,
      en: enDoc?.path,
    },
  }));
}

export const helpSections = buildHelpSections();

export const helpToc = helpSections.map((section) => ({
  id: section.id,
  label: section.label,
}));

export const helpSources = helpSections.reduce<Partial<Record<SupportedLanguage, string>>>((acc, section) => {
  SUPPORTED_LANGUAGES.forEach((lang) => {
    if (!acc[lang] && section.sources[lang]) {
      acc[lang] = section.sources[lang];
    }
  });
  return acc;
}, {});
