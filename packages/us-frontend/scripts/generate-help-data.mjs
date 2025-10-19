#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(packageRoot, '..', '..');
const docsRoot = path.join(repoRoot, 'docs');

const SECTION_CONFIG = [
  {
    id: 'overview',
    label: { zh: '概述', en: 'Overview' },
    patterns: {
      zh: [/^项目简介/i],
      en: [/^Project Overview/i],
    },
  },
  {
    id: 'flow',
    label: { zh: '使用流程', en: 'Usage Flow' },
    patterns: {
      zh: [/产品与理赔流程/i],
      en: [/Product & Claim Workflow/i],
    },
  },
  {
    id: 'faq',
    label: { zh: '常见问题（FAQ）', en: 'FAQ' },
    patterns: {
      zh: [/为什么用户愿意绑定交易所信息/i],
      en: [/Why Users Connect Exchange Data/i],
    },
  },
  {
    id: 'compliance',
    label: { zh: '接口与隐私 / 合规说明', en: 'Interfaces & Privacy / Compliance' },
    patterns: {
      zh: [/数据与隐私/i, /定价与风控说明/i, /联系方式/i],
      en: [/Data and Privacy/i, /Pricing and Risk Control/i, /Contact/i],
    },
  },
];

function walkMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(entryPath));
    } else if (entry.isFile()) {
      if (/\.md$/i.test(entry.name) && /help|帮助/i.test(entryPath)) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

function detectLanguage(filePath, content) {
  const normalized = filePath.toLowerCase();
  if (/(_en\b|english)/.test(normalized)) return 'en';
  if (/(_cn\b|zh|中文)/.test(normalized)) return 'zh';
  const hanCount = (content.match(/[\u4e00-\u9fff]/g) ?? []).length;
  const latinCount = (content.match(/[A-Za-z]/g) ?? []).length;
  return hanCount >= latinCount ? 'zh' : 'en';
}

function extractVersion(filePath, content) {
  const matches = [];
  for (const match of filePath.matchAll(/v(\d+)/gi)) {
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

function computeWeight(filePath) {
  const normalized = filePath.toLowerCase();
  let weight = 0;
  if (normalized.includes('helpdoc')) weight += 4;
  if (normalized.includes('final')) weight += 2;
  if (normalized.includes('v')) weight += 1;
  return weight;
}

function collectCandidates() {
  if (!fs.existsSync(docsRoot)) {
    return [];
  }
  return walkMarkdownFiles(docsRoot).map((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    return {
      path: filePath,
      relativePath: path.relative(repoRoot, filePath),
      content,
      lang: detectLanguage(filePath, content),
      version: extractVersion(filePath, content),
      weight: computeWeight(filePath),
      length: content.length,
    };
  });
}

function selectDoc(candidates, lang) {
  const filtered = candidates.filter((candidate) => candidate.lang === lang);
  if (!filtered.length) return null;
  filtered.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    if (b.version !== a.version) return b.version - a.version;
    if (b.length !== a.length) return b.length - a.length;
    return a.relativePath.localeCompare(b.relativePath);
  });
  return filtered[0];
}

function splitSections(content) {
  const sections = [];
  const lines = content.split(/\r?\n/);
  let current = null;
  for (const line of lines) {
    if (line.trim().startsWith('## ')) {
      current = {
        heading: line.trim().replace(/^##\s*/, '').trim(),
        lines: [],
      };
      sections.push(current);
      continue;
    }
    if (!current) continue;
    current.lines.push(line);
  }
  return sections;
}

function normalizeParagraph(lines) {
  return lines.join(' ').replace(/\s+/g, ' ').trim();
}

function parseBlocks(lines) {
  const summary = [];
  const subsections = [];
  let currentBlocks = summary;
  let currentSubsection = null;
  let pendingParagraph = [];
  let pendingList = null;

  const flushParagraph = () => {
    if (!pendingParagraph.length) return;
    const text = normalizeParagraph(pendingParagraph);
    if (text) {
      currentBlocks.push({ type: 'paragraph', text });
    }
    pendingParagraph = [];
  };

  const flushList = () => {
    if (!pendingList || !pendingList.length) return;
    currentBlocks.push({ type: 'list', items: [...pendingList] });
    pendingList = null;
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
      currentSubsection = {
        heading: line.replace(/^###\s*/, '').trim(),
        blocks: [],
      };
      subsections.push(currentSubsection);
      currentBlocks = currentSubsection.blocks;
      continue;
    }
    if (/^[-*+]\s+/.test(line) || /^\d+\.\s+/.test(line)) {
      flushParagraph();
      if (!pendingList) pendingList = [];
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

function buildSectionContent(sections, patterns, fallbackTitle) {
  const matched = patterns
    .map((pattern) => sections.find((section) => pattern.test(section.heading)))
    .filter(Boolean);
  if (!matched.length) {
    return { title: fallbackTitle, summary: [], subsections: [] };
  }
  const summary = [];
  const subsections = [];
  for (const section of matched) {
    const blocks = parseBlocks(section.lines);
    summary.push(...blocks.summary);
    subsections.push(...blocks.subsections);
  }
  return { title: fallbackTitle, summary, subsections };
}

function parseDoc(content, lang) {
  const sections = splitSections(content);
  const result = {};
  for (const config of SECTION_CONFIG) {
    result[config.id] = buildSectionContent(
      sections,
      config.patterns[lang],
      config.label[lang]
    );
  }
  return result;
}

function writeJson(targetPath, data) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(data, null, 2));
}

const candidates = collectCandidates();
const zhDoc = selectDoc(candidates, 'zh');
const enDoc = selectDoc(candidates, 'en') ?? zhDoc;

const zhParsed = parseDoc(zhDoc?.content ?? '', 'zh');
const enParsed = parseDoc(enDoc?.content ?? zhDoc?.content ?? '', 'en');

const output = {
  generatedAt: new Date().toISOString(),
  sources: {
    zh: zhDoc ? zhDoc.relativePath : null,
    en: enDoc ? enDoc.relativePath : zhDoc ? zhDoc.relativePath : null,
  },
  sections: SECTION_CONFIG.map((config) => ({
    id: config.id,
    label: config.label,
    content: {
      zh: zhParsed[config.id],
      en: enParsed[config.id],
    },
  })),
};

writeJson(path.join(packageRoot, 'public', 'content', 'help-data.json'), output);
writeJson(path.join(packageRoot, 'src', 'content', 'help-data.json'), output);
