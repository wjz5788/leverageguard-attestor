import {
  EXCHANGE_OPTIONS,
  findExchangeOption,
  findPairOption,
  getPairsForExchange,
  type ExchangeId,
  type TradingPairId,
  type TradingPairOption,
} from '../config/verification';
import {
  fetchSkus,
  submitVerification,
  createOrder,
  createClaim,
  type SkuOption,
  type VerificationRequest,
  type VerificationResponse,
  type OrderRecord,
  type ClaimRecord,
} from '../services/verify';
import { ApiError } from '../services/apiClient';
import {
  clearAuth,
  getAuthState,
  setConnectedAddress,
  subscribeAuth,
  type AuthState,
} from '../services/auth';
import { sha256Hex } from '../utils/crypto';
import type { SupportedLanguage } from '../utils/language';

type StepId = 'exchange' | 'pair' | 'order' | 'evidence';

const STEP_SEQUENCE: StepId[] = ['exchange', 'pair', 'order', 'evidence'];

type CopyBlock = Record<SupportedLanguage, string>;

interface ParsedEvidenceSummary {
  exchange?: string;
  pair?: string;
  contractType?: string;
  instType?: string;
  warnings: string[];
}

const COPY = {
  hints: {
    exchangeDefault: {
      zh: 'Currently supports Binance and OKX only; more exchanges will follow.',
      en: 'Currently supports Binance and OKX only; more exchanges will follow.',
    },
    pairDefault: {
      zh: 'Select an exchange first to unlock the allowed perpetual trading pairs.',
      en: 'Select an exchange first to unlock the allowed perpetual trading pairs.',
    },
    pairNotice: {
      zh: 'Supported pairs: BTC perpetual contracts (USDT or USDC margined).',
      en: 'Supported pairs: BTC perpetual contracts (USDT or USDC margined).',
    },
    orderDefault: {
      zh: 'Enter the original numeric order id issued by the exchange.',
      en: 'Enter the original numeric order id issued by the exchange.',
    },
    orderInvalid: {
      zh: 'Order id must contain at least six digits and no other characters.',
      en: 'Order id must contain at least six digits and no other characters.',
    },
    skuLoading: {
      zh: 'Loading SKU definitions…',
      en: 'Loading SKU definitions…',
    },
    skuDefault: {
      zh: 'Select the insurance SKU (e.g. DAY_24H_FIXED).',
      en: 'Select the insurance SKU (e.g. DAY_24H_FIXED).',
    },
    envDefault: {
      zh: 'Choose the operating environment: simulated or production.',
      en: 'Choose the operating environment: simulated or production.',
    },
    principalDefault: {
      zh: 'Enter the intended insured principal in USDT.',
      en: 'Enter the intended insured principal in USDT.',
    },
    principalInvalid: {
      zh: 'Principal must be a numeric value greater than zero.',
      en: 'Principal must be a numeric value greater than zero.',
    },
    leverageDefault: {
      zh: 'Enter the order leverage multiplier (e.g. 10).',
      en: 'Enter the order leverage multiplier (e.g. 10).',
    },
    leverageInvalid: {
      zh: 'Leverage must be a positive number.',
      en: 'Leverage must be a positive number.',
    },
    evidenceIdle: {
      zh: 'Upload JSON/TXT evidence containing fields like instId or contractType.',
      en: 'Upload JSON/TXT evidence containing fields like instId or contractType.',
    },
    evidenceProcessing: {
      zh: 'Parsing the evidence file…',
      en: 'Parsing the evidence file…',
    },
    evidenceMismatch: {
      zh: 'Evidence does not match your selections; please verify the trading pair or re-export the file.',
      en: 'Evidence does not match your selections; please verify the trading pair or re-export the file.',
    },
    evidenceReady: {
      zh: 'Evidence matches your selections. Ready to submit the verification request.',
      en: 'Evidence matches your selections. Ready to submit the verification request.',
    },
  },
  feedback: {
    missingFields: {
      zh: 'Select the exchange, perpetual pair, enter the order id, and upload valid evidence before submitting.',
      en: 'Select the exchange, perpetual pair, enter the order id, and upload valid evidence before submitting.',
    },
    fileError: {
      zh: 'Unable to read or parse the file. Ensure it is JSON/TXT and contains the required fields.',
      en: 'Unable to read or parse the file. Ensure it is JSON/TXT and contains the required fields.',
    },
    mismatch: {
      zh: 'Form selections do not match the evidence content; submission blocked.',
      en: 'Form selections do not match the evidence content; submission blocked.',
    },
    cryptoUnavailable: {
      zh: 'SHA-256 hashing is unavailable in this browser; cannot prepare the verification payload.',
      en: 'SHA-256 hashing is unavailable in this browser; cannot prepare the verification payload.',
    },
    submissionFailed: {
      zh: 'Submission failed. Please retry later or contact the on-call teammate.',
      en: 'Submission failed. Please retry later or contact the on-call teammate.',
    },
    submissionSuccess: {
      zh: 'Verification payload prepared. Review the summary below or submit another request.',
      en: 'Verification payload prepared. Review the summary below or submit another request.',
    },
    authRequired: {
      zh: 'Please complete the wallet sign-in first so the Authorization token is available.',
      en: 'Please complete the wallet sign-in first so the Authorization token is available.',
    },
    skuLoadFailed: {
      zh: 'Failed to load SKU definitions. A fallback option is used; refresh later for full data.',
      en: 'Failed to load SKU definitions. A fallback option is used; refresh later for full data.',
    },
    upstreamUnauthorized: {
      zh: 'Token missing or expired. Please click "Sign Login" again to refresh authentication.',
      en: 'Token missing or expired. Please click "Sign Login" again to refresh authentication.',
    },
    upstreamError: {
      zh: 'Upstream service returned an error. Check your order details or retry later.',
      en: 'Upstream service returned an error. Check your order details or retry later.',
    },
  },
  summary: {
    fileName: { zh: 'File name', en: 'File name' },
    fileSize: { zh: 'File size', en: 'File size' },
    parsedExchange: { zh: 'Parsed exchange', en: 'Parsed exchange' },
    parsedPair: { zh: 'Parsed pair', en: 'Parsed pair' },
    parsedInstType: { zh: 'Contract type (instType)', en: 'Contract type (instType)' },
    parsedContractType: { zh: 'Contract mode (contractType)', en: 'Contract mode (contractType)' },
    warnings: { zh: 'Parse notes', en: 'Parse notes' },
    orderHash: { zh: 'OrderId hash', en: 'OrderId hash' },
    skuCode: { zh: 'SKU code', en: 'SKU code' },
    env: { zh: 'Environment', en: 'Environment' },
    principal: { zh: 'Principal (USDT)', en: 'Principal (USDT)' },
    leverage: { zh: 'Leverage', en: 'Leverage' },
    wallet: { zh: 'Wallet', en: 'Wallet' },
    exchange: { zh: 'Exchange', en: 'Exchange' },
    pair: { zh: 'Trading pair', en: 'Trading pair' },
    orderId: { zh: 'Order id', en: 'Order id' },
    evidenceDigest: { zh: 'Evidence SHA-256', en: 'Evidence SHA-256' },
    eligibility: { zh: 'Eligibility', en: 'Eligibility' },
    premium: { zh: 'Premium', en: 'Premium' },
    payoutCap: { zh: 'Payout cap', en: 'Payout cap' },
    currency: { zh: 'Currency', en: 'Currency' },
    policyId: { zh: 'Policy id', en: 'Policy id' },
    evidenceHint: { zh: 'Evidence hint', en: 'Evidence hint' },
    diagnostics: { zh: 'Diagnostics', en: 'Diagnostics' },
    processedAt: { zh: 'Processed at', en: 'Processed at' },
    parsedSide: { zh: 'Parsed side', en: 'Parsed side' },
    parsedAvgPx: { zh: 'Parsed avgPx', en: 'Parsed avgPx' },
    parsedQty: { zh: 'Parsed qty', en: 'Parsed qty' },
    parsedLiqPx: { zh: 'Parsed liqPx', en: 'Parsed liqPx' },
  },
  statuses: {
    accepted: { zh: 'Accepted (mock)', en: 'Accepted (mock)' },
  },
};

const MISMATCH_MESSAGES: Record<string, CopyBlock> = {
  'parsed-pair-missing': {
    zh: 'Trading pair field (instId / symbol) not found in evidence. Please re-export or verify the file content.',
    en: 'The evidence is missing the trading pair field (instId / symbol). Re-export the file or verify its contents.',
  },
  'pair-mismatch': {
    zh: 'The trading pair in the evidence does not match the form selection. Please ensure both are supported BTC perpetual contracts.',
    en: 'The trading pair inside the evidence differs from your selection. Verify both are supported BTC perpetuals.',
  },
  'inst-type-mismatch': {
    zh: 'The instType in the evidence does not match expectations. Should be SWAP perpetual contract.',
    en: 'The evidence instType does not match the expected SWAP perpetual contract.',
  },
  'contract-type-mismatch': {
    zh: 'The contractType in the evidence does not match expectations. Should be PERPETUAL perpetual contract.',
    en: 'The evidence contractType does not match the expected PERPETUAL perpetual contract.',
  },
};

type EnvironmentId = 'okx-simulated' | 'binance-futures-testnet' | 'prod';

interface EnvironmentOption {
  value: EnvironmentId;
  exchanges?: ExchangeId[];
  label: CopyBlock;
}

const ENVIRONMENT_OPTIONS: EnvironmentOption[] = [
  {
    value: 'okx-simulated',
    exchanges: ['OKX'],
    label: {
      zh: 'OKX Demo',
      en: 'OKX Simulated',
    },
  },
  {
    value: 'binance-futures-testnet',
    exchanges: ['Binance'],
    label: {
      zh: 'Binance Contract Testnet',
      en: 'Binance Futures Testnet',
    },
  },
  {
    value: 'prod',
    label: {
      zh: 'Production Environment',
      en: 'Production',
    },
  },
];

interface FormElements {
  form: HTMLFormElement;
  exchangeSelect: HTMLSelectElement;
  exchangeHint: HTMLElement;
  pairSelect: HTMLSelectElement;
  pairHint: HTMLElement;
  orderInput: HTMLInputElement;
  orderHint: HTMLElement;
  skuSelect: HTMLSelectElement;
  skuHint: HTMLElement;
  envSelect: HTMLSelectElement;
  envHint: HTMLElement;
  principalInput: HTMLInputElement;
  principalHint: HTMLElement;
  leverageInput: HTMLInputElement;
  leverageHint: HTMLElement;
  refCodeInput?: HTMLInputElement;
  dropzone: HTMLElement;
  evidenceInput: HTMLInputElement;
  evidenceName: HTMLElement;
  preview: HTMLElement;
  previewList: HTMLDListElement;
  previewRaw: HTMLPreElement;
  clearEvidenceButton: HTMLButtonElement;
  authStatus: HTMLElement;
  feedback: HTMLElement;
  submitButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  stepper: HTMLElement | null;
  resultCard: HTMLElement;
  resultList: HTMLDListElement;
  resultClose: HTMLButtonElement;
  resultActions: HTMLElement;
  orderButton: HTMLButtonElement;
  claimButton: HTMLButtonElement;
}

interface ParsedEvidence extends ParsedEvidenceSummary {
  rawText: string;
}

interface VerificationState {
  exchangeId?: ExchangeId;
  pairId?: TradingPairId;
  orderId: string;
  orderValid: boolean;
  skuCode?: string;
  env?: string;
  principal?: number;
  principalValid: boolean;
  leverage?: number;
  leverageValid: boolean;
  refCode?: string;
  evidenceFile?: File;
  parsed?: ParsedEvidence;
  evidenceError?: string;
  mismatch?: string;
  isSubmitting: boolean;
  skuOptions: SkuOption[];
  skuLoading: boolean;
  skuLoadFailed?: boolean;
  walletAddress?: string;
  authReady: boolean;
  orderIdempotencyKey?: string;
  claimIdempotencyKey?: string;
  createdOrder?: OrderRecord;
  lastClaim?: ClaimRecord;
  isOrdering: boolean;
  isClaiming: boolean;
  lastResult?:
    | {
        request: VerificationRequest & {
          evidenceDigest: string;
          parsed: ParsedEvidenceSummary;
          orderHash: string;
        };
        response: VerificationResponse;
        processedAt: string;
      }
    | undefined;
}

function getCurrentLanguage(): SupportedLanguage {
  const attr = document.body.dataset.currentLang;
  if (attr === 'zh' || attr === 'en') {
    return attr;
  }
  return 'en';
}

function onLanguageChange(callback: (lang: SupportedLanguage) => void): () => void {
  let previous = getCurrentLanguage();
  callback(previous);
  const observer = new MutationObserver(() => {
    const next = getCurrentLanguage();
    if (next !== previous) {
      previous = next;
      callback(next);
    }
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['data-current-lang'] });
  return () => observer.disconnect();
}

function translate(block: CopyBlock, lang: SupportedLanguage = getCurrentLanguage()): string {
  return block[lang];
}

function authStateReady(auth: AuthState): boolean {
  return true;
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idempo-${Math.random().toString(36).slice(2)}${Date.now()}`;
}

function setButtonLabels(
  button: HTMLButtonElement,
  labels: { zh: string; en: string }
): void {
  const zhNode = button.querySelector<HTMLSpanElement>('[data-lang="zh"]');
  const enNode = button.querySelector<HTMLSpanElement>('[data-lang="en"]');
  if (zhNode) {
    zhNode.textContent = labels.zh;
  }
  if (enNode) {
    enNode.textContent = labels.en;
  }
}

function normalizePair(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function formatFileSize(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let current = size / 1024;
  for (const unit of units) {
    if (current < 1024) {
      return `${current.toFixed(current >= 10 ? 0 : 1)} ${unit}`;
    }
    current /= 1024;
  }
  return `${current.toFixed(1)} TB`;
}

function parsePositiveNumber(value: string): number | undefined {
  if (!value) {
    return undefined;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return NaN;
  }
  return numeric;
}

function recomputeOrderValidity(state: VerificationState): boolean {
  const ready = Boolean(
    state.orderId.length >= 6 &&
      state.skuCode &&
      state.env &&
      state.principalValid &&
      state.leverageValid
  );
  state.orderValid = ready;
  return ready;
}

function formatNumeric(value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return String(value);
  }
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function clearChildren(node: Element) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function createDefinitionRow(
  label: CopyBlock,
  value: string,
  lang: SupportedLanguage,
  options?: { emphasize?: boolean }
): [HTMLDTElement, HTMLDDElement] {
  const dt = document.createElement('dt');
  dt.textContent = translate(label, lang);
  const dd = document.createElement('dd');
  dd.textContent = value;
  if (options?.emphasize) {
    dd.classList.add('highlight');
  }
  return [dt, dd];
}

function renderEvidenceSummary(
  elements: FormElements,
  parsed: ParsedEvidence | undefined,
  file: File | undefined,
  lang: SupportedLanguage
) {
  clearChildren(elements.previewList);

  if (!file) {
    elements.preview.classList.remove('has-content');
    elements.previewRaw.hidden = true;
    return;
  }

  const rows: Array<[HTMLDTElement, HTMLDDElement]> = [
    createDefinitionRow(COPY.summary.fileName, file.name, lang),
    createDefinitionRow(COPY.summary.fileSize, formatFileSize(file.size), lang),
  ];

  if (parsed) {
    if (parsed.exchange) {
      rows.push(createDefinitionRow(COPY.summary.parsedExchange, parsed.exchange, lang));
    }
    if (parsed.pair) {
      rows.push(createDefinitionRow(COPY.summary.parsedPair, parsed.pair, lang));
    }
    if (parsed.instType) {
      rows.push(createDefinitionRow(COPY.summary.parsedInstType, parsed.instType, lang));
    }
    if (parsed.contractType) {
      rows.push(createDefinitionRow(COPY.summary.parsedContractType, parsed.contractType, lang));
    }
    if (parsed.warnings.length) {
      rows.push(
        createDefinitionRow(
          COPY.summary.warnings,
          parsed.warnings.join(' · '),
          lang,
          parsed.warnings.some((warning) => warning.toLowerCase().includes('mismatch'))
            ? { emphasize: true }
            : undefined
        )
      );
    }
    elements.previewRaw.hidden = false;
    elements.previewRaw.textContent =
      parsed.rawText.length > 1200 ? `${parsed.rawText.slice(0, 1200)}\n…` : parsed.rawText;
  } else {
    elements.previewRaw.hidden = true;
  }

  for (const [dt, dd] of rows) {
    elements.previewList.appendChild(dt);
    elements.previewList.appendChild(dd);
  }
  elements.preview.classList.add('has-content');
}

function renderResultSummary(
  elements: FormElements,
  summary: NonNullable<VerificationState['lastResult']>,
  lang: SupportedLanguage
) {
  clearChildren(elements.resultList);

  const { request, response, processedAt } = summary;

  const rows: Array<[HTMLDTElement, HTMLDDElement]> = [
    createDefinitionRow(COPY.summary.exchange, request.exchange, lang),
    createDefinitionRow(COPY.summary.pair, request.pairId, lang),
    createDefinitionRow(COPY.summary.orderId, request.orderId, lang),
    createDefinitionRow(
      COPY.summary.orderHash,
      summary.request.orderHash,
      lang,
      { emphasize: true }
    ),
    createDefinitionRow(COPY.summary.wallet, request.wallet ?? '—', lang),
    createDefinitionRow(COPY.summary.skuCode, request.skuCode ?? '—', lang),
    createDefinitionRow(COPY.summary.env, request.env ?? '—', lang),
    createDefinitionRow(
      COPY.summary.principal,
      formatNumeric(request.principal),
      lang
    ),
    createDefinitionRow(
      COPY.summary.leverage,
      formatNumeric(request.leverage),
      lang
    ),
    createDefinitionRow(
      COPY.summary.evidenceDigest,
      summary.request.evidenceDigest,
      lang
    ),
    createDefinitionRow(
      COPY.summary.eligibility,
      typeof response.eligible === 'boolean'
        ? response.eligible
          ? lang === 'zh'
            ? 'Match'
            : 'Eligible'
          : lang === 'zh'
          ? 'Mismatch'
          : 'Not eligible'
        : '—',
      lang,
      response.eligible ? { emphasize: true } : undefined
    ),
  ];

  if (response.quote) {
    rows.push(
      createDefinitionRow(
        COPY.summary.premium,
        formatNumeric(response.quote.premium),
        lang
      ),
      createDefinitionRow(
        COPY.summary.payoutCap,
        formatNumeric(response.quote.payoutCap),
        lang
      ),
      createDefinitionRow(COPY.summary.currency, response.quote.currency ?? '—', lang)
    );
  }

  if (response.policyId) {
    rows.push(createDefinitionRow(COPY.summary.policyId, response.policyId, lang));
  }

  if (response.evidenceHint) {
    rows.push(createDefinitionRow(COPY.summary.evidenceHint, response.evidenceHint, lang));
  }

  if (response.parsed) {
    if (response.parsed.side) {
      rows.push(createDefinitionRow(COPY.summary.parsedSide, response.parsed.side, lang));
    }
    if (response.parsed.avgPx) {
      rows.push(createDefinitionRow(COPY.summary.parsedAvgPx, response.parsed.avgPx, lang));
    }
    if (response.parsed.qty) {
      rows.push(createDefinitionRow(COPY.summary.parsedQty, response.parsed.qty, lang));
    }
    if (response.parsed.liqPx) {
      rows.push(createDefinitionRow(COPY.summary.parsedLiqPx, response.parsed.liqPx, lang));
    }
  }

  if (response.diag && Array.isArray(response.diag) && response.diag.length) {
    rows.push(
      createDefinitionRow(
        COPY.summary.diagnostics,
        response.diag.map((item) => (typeof item === 'string' ? item : JSON.stringify(item))).join(
          '\n'
        ),
        lang
      )
    );
  }

  rows.push(createDefinitionRow(COPY.summary.processedAt, processedAt, lang));

  for (const [dt, dd] of rows) {
    elements.resultList.append(dt, dd);
  }
}

function setFeedback(elements: FormElements, message: CopyBlock | null, variant: 'info' | 'error' | 'success') {
  elements.feedback.dataset.state = variant;
  if (message) {
    elements.feedback.textContent = translate(message);
    elements.feedback.hidden = false;
  } else {
    elements.feedback.textContent = '';
    elements.feedback.hidden = true;
  }
}

function updateAuthStatusDisplay(
  elements: FormElements,
  auth: AuthState,
  lang: SupportedLanguage
) {
  const { authStatus } = elements;
  const shorten = (address: string) =>
    address.length <= 12 ? address : `${address.slice(0, 6)}…${address.slice(-4)}`;

  let state = 'idle';
  let message: string;

  if (!auth.address) {
    state = 'disconnected';
    message =
      lang === 'zh'
        ? 'Wallet not connected. Please connect and sign in at the top.'
        : 'Wallet disconnected. Connect and sign in above.';
  } else if (auth.status === 'authenticating') {
    state = 'loading';
    message =
      lang === 'zh'
        ? `Waiting for ${shorten(auth.address)} to confirm signature in MetaMask…`
        : `Waiting for ${shorten(auth.address)} to confirm the signature in MetaMask…`;
  } else if (auth.status === 'error') {
    state = 'error';
    const err = auth.lastError || (lang === 'zh' ? 'Signature verification failed. Please confirm the signature in MetaMask.' : 'Authentication failed');
    message = err;
  } else if (authStateReady(auth)) {
    state = 'ready';
    const expiry = auth.tokenExpiresAt
      ? new Date(auth.tokenExpiresAt)
          .toISOString()
          .replace(/\.\d{3}Z$/, 'Z')
      : null;
    if (lang === 'zh') {
      message = expiry
        ? `Authenticated as ${shorten(auth.address)} · Token valid until ${expiry}`
        : `Authenticated as ${shorten(auth.address)} · Token active`;
    } else {
      message = expiry
        ? `Authenticated as ${shorten(auth.address)} · token valid until ${expiry}`
        : `Authenticated as ${shorten(auth.address)} · token active`;
    }
  } else {
    state = 'pending';
    message =
      lang === 'zh'
        ? `Connected as ${shorten(auth.address)} · Click "Sign Login" to authenticate`
        : `Connected as ${shorten(auth.address)} · click “Sign Login” to authenticate`;
  }

  authStatus.dataset.state = state;
  authStatus.textContent = message;
}

async function parseEvidenceFile(file: File): Promise<ParsedEvidence> {
  const rawText = await file.text();
  let parsed: unknown;
  let warnings: string[] = [];
  try {
    parsed = JSON.parse(rawText);
  } catch (error) {
    // Attempt to parse line-by-line JSON fragments or key-value pairs.
    const cleaned = rawText
      .trim()
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const maybeJson = cleaned.join('');
    try {
      parsed = JSON.parse(maybeJson);
      warnings.push('Reconstructed JSON from stripped lines.');
    } catch (secondaryError) {
      throw new Error(
        secondaryError instanceof Error ? secondaryError.message : 'Unsupported file format'
      );
    }
  }

  const searchQueue: unknown[] = Array.isArray(parsed) ? [...parsed] : [parsed];
  const candidates: Record<string, string> = {};

  const pushCandidate = (key: string, value: unknown) => {
    if (typeof value === 'string' || typeof value === 'number') {
      candidates[key.toLowerCase()] = String(value);
    }
  };

  while (searchQueue.length) {
    const current = searchQueue.shift();
    if (!current || typeof current !== 'object') {
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      pushCandidate(key, value);
      if (value && typeof value === 'object') {
        searchQueue.push(value);
      }
    }
  }

  const exchange =
    candidates.exchange ||
    candidates.exchangeid ||
    candidates.platform ||
    candidates.source ||
    undefined;
  const pair =
    candidates.instid ||
    candidates.symbol ||
    candidates.pair ||
    candidates.instrumentid ||
    candidates.contract ||
    undefined;
  const instType =
    candidates.insttype || candidates.instrumenttype || candidates.type || undefined;
  const contractType =
    candidates.contracttype ||
    candidates.contractmode ||
    candidates.category ||
    candidates.producttype ||
    undefined;

  if (!pair) {
    warnings.push('Unable to locate instId / symbol in the evidence payload.');
  }

  return {
    exchange: exchange ? String(exchange).toUpperCase() : undefined,
    pair: pair ? String(pair).toUpperCase() : undefined,
    instType: instType ? String(instType).toUpperCase() : undefined,
    contractType: contractType ? String(contractType).toUpperCase() : undefined,
    warnings,
    rawText,
  };
}

function evaluateMismatch(
  state: VerificationState,
  pairOption: TradingPairOption | undefined
): string | undefined {
  if (!state.parsed || !pairOption) {
    return undefined;
  }

  const normalizedSelectedPair = normalizePair(pairOption.id);
  const normalizedParsedPair = state.parsed.pair ? normalizePair(state.parsed.pair) : null;

  if (!normalizedParsedPair) {
    return 'parsed-pair-missing';
  }

  if (normalizedParsedPair !== normalizedSelectedPair) {
    return 'pair-mismatch';
  }

  if (pairOption.expectedInstType) {
    const parsedInstType = state.parsed.instType?.toUpperCase();
    if (parsedInstType && parsedInstType !== pairOption.expectedInstType) {
      return 'inst-type-mismatch';
    }
  }

  if (pairOption.expectedContractType) {
    const parsedContractType = state.parsed.contractType?.toUpperCase();
    if (parsedContractType && parsedContractType !== pairOption.expectedContractType) {
      return 'contract-type-mismatch';
    }
  }

  return undefined;
}

function updatePairOptions(
  elements: FormElements,
  exchangeId: ExchangeId | undefined,
  lang: SupportedLanguage
) {
  const { pairSelect, pairHint } = elements;
  pairSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = lang === 'zh' ? 'Please select' : 'Select…';
  pairSelect.appendChild(defaultOption);

  if (!exchangeId) {
    pairSelect.disabled = true;
    pairHint.textContent = translate(COPY.hints.pairDefault, lang);
    return;
  }

  const options = getPairsForExchange(exchangeId);
  options.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.id;
    opt.dataset.labelZh = option.label.zh;
    opt.dataset.labelEn = option.label.en;
    opt.textContent = option.label[lang];
    pairSelect.appendChild(opt);
  });

  pairSelect.disabled = false;
  pairHint.textContent = translate(COPY.hints.pairNotice, lang);
}

function updateExchangeOptions(elements: FormElements, lang: SupportedLanguage) {
  const { exchangeSelect, exchangeHint } = elements;
  exchangeSelect.innerHTML = '';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = lang === 'zh' ? 'Please select' : 'Select…';
  exchangeSelect.appendChild(defaultOption);

  EXCHANGE_OPTIONS.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.id;
    opt.dataset.labelZh = option.label.zh;
    opt.dataset.labelEn = option.label.en;
    opt.dataset.descriptionZh = option.description.zh;
    opt.dataset.descriptionEn = option.description.en;
    opt.textContent = option.label[lang];
    exchangeSelect.appendChild(opt);
  });

  exchangeHint.textContent = translate(COPY.hints.exchangeDefault, lang);
}

function updateSkuOptions(elements: FormElements, state: VerificationState, lang: SupportedLanguage) {
  const { skuSelect, skuHint } = elements;
  const currentValue = state.skuCode ?? '';
  skuSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.selected = !currentValue;
  placeholder.textContent = state.skuLoading
    ? translate(COPY.hints.skuLoading, lang)
    : translate(COPY.hints.skuDefault, lang);
  skuSelect.appendChild(placeholder);

  state.skuOptions.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.code;
    opt.textContent = option.label;
    if (option.description) {
      opt.dataset.description = option.description;
    }
    if (option.code === currentValue) {
      opt.selected = true;
    }
    skuSelect.appendChild(opt);
  });

  skuSelect.disabled = state.skuLoading || state.skuOptions.length === 0;

  if (currentValue) {
    const selected = state.skuOptions.find((option) => option.code === currentValue);
    skuHint.textContent = selected?.description ?? translate(COPY.hints.skuDefault, lang);
  } else {
    skuHint.textContent = state.skuLoading
      ? translate(COPY.hints.skuLoading, lang)
      : translate(COPY.hints.skuDefault, lang);
  }
}

function updateEnvOptions(
  elements: FormElements,
  state: VerificationState,
  exchangeId: ExchangeId | undefined,
  lang: SupportedLanguage
) {
  const { envSelect, envHint } = elements;
  const available = ENVIRONMENT_OPTIONS.filter((option) => {
    if (!option.exchanges || option.exchanges.length === 0) {
      return true;
    }
    return exchangeId ? option.exchanges.includes(exchangeId) : false;
  });

  envSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.disabled = true;
  placeholder.selected = !state.env;
  placeholder.textContent = translate(COPY.hints.envDefault, lang);
  envSelect.appendChild(placeholder);

  available.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label[lang];
    if (option.value === state.env) {
      opt.selected = true;
    }
    envSelect.appendChild(opt);
  });

  if (!state.env || !available.some((option) => option.value === state.env)) {
    state.env = available[0]?.value;
  }

  if (state.env) {
    envSelect.value = state.env;
  }

  envSelect.disabled = available.length === 0;
  envHint.textContent = translate(COPY.hints.envDefault, lang);
}

function updateStepper(stepper: HTMLElement | null, state: VerificationState) {
  if (!stepper) {
    return;
  }

  const completed = new Set<StepId>();
  if (state.exchangeId) {
    completed.add('exchange');
  }
  if (state.pairId) {
    completed.add('pair');
  }
  if (state.orderValid) {
    completed.add('order');
  }
  if (state.parsed && !state.mismatch && state.evidenceFile) {
    completed.add('evidence');
  }

  let firstIncomplete: StepId | undefined = undefined;
  for (const step of STEP_SEQUENCE) {
    if (!completed.has(step)) {
      firstIncomplete = step;
      break;
    }
  }

  stepper.querySelectorAll<HTMLElement>('[data-step]').forEach((item) => {
    const stepId = item.dataset.step as StepId | undefined;
    if (!stepId) {
      return;
    }
    item.classList.toggle('is-complete', completed.has(stepId));
    item.classList.toggle('is-active', stepId === firstIncomplete);
    item.classList.toggle('is-pending', !completed.has(stepId) && stepId !== firstIncomplete);
  });
}

async function handleSubmit(
  event: SubmitEvent,
  elements: FormElements,
  state: VerificationState
) {
  event.preventDefault();

  if (state.isSubmitting) {
    return;
  }

  if (
    !state.exchangeId ||
    !state.pairId ||
    !state.orderValid ||
    !state.parsed ||
    !state.evidenceFile ||
    !state.skuCode ||
    !state.env ||
    !state.principalValid ||
    !state.leverageValid
  ) {
    setFeedback(elements, COPY.feedback.missingFields, 'error');
    return;
  }

  if (state.mismatch) {
    setFeedback(elements, COPY.feedback.mismatch, 'error');
    return;
  }

  try {
    state.isSubmitting = true;
    elements.submitButton.disabled = true;
    elements.submitButton.dataset.loading = 'true';

    const orderHash = await sha256Hex(`${state.orderId}${state.pairId}`);
    const evidenceDigest = await sha256Hex(state.parsed.rawText);

    const requestPayload: VerificationRequest = {
      exchange: state.exchangeId,
      pairId: state.pairId,
      orderId: state.orderId,
      wallet: state.walletAddress ?? '',
      skuCode: state.skuCode,
      env: state.env,
      principal: state.principal ?? 0,
      leverage: state.leverage ?? 0,
      refCode: state.refCode,
    };

    const response = await submitVerification(requestPayload);

    const processedAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

    state.lastResult = {
      request: {
        ...requestPayload,
        evidenceDigest,
        parsed: state.parsed,
        orderHash,
      },
      response,
      processedAt,
    };

    renderResultSummary(elements, state.lastResult, getCurrentLanguage());

    setFeedback(elements, COPY.feedback.submissionSuccess, 'success');
    elements.resultCard.hidden = false;
    elements.form.classList.add('is-submitted');
  } catch (error) {
    if (error instanceof Error && error.message.includes('crypto.subtle')) {
      setFeedback(elements, COPY.feedback.cryptoUnavailable, 'error');
    } else if (error instanceof ApiError && error.status === 401) {
      const previousAddress = state.walletAddress;
      setFeedback(elements, COPY.feedback.upstreamUnauthorized, 'error');
      state.authReady = false;
      clearAuth();
      if (previousAddress) {
        setConnectedAddress(previousAddress);
      }
      updateAuthStatusDisplay(elements, authState, currentLanguage);
    } else if (error instanceof ApiError) {
      console.error('[verify] upstream error', error.status, error.message, error.body);
      setFeedback(elements, COPY.feedback.upstreamError, 'error');
    } else {
      setFeedback(elements, COPY.feedback.submissionFailed, 'error');
    }
    console.error(error);
  } finally {
    state.isSubmitting = false;
    elements.submitButton.disabled = false;
    delete elements.submitButton.dataset.loading;
  }
}

function resetState(
  elements: FormElements,
  state: VerificationState,
  lang: SupportedLanguage
) {
  state.exchangeId = undefined;
  state.pairId = undefined;
  state.orderId = '';
  state.orderValid = false;
  state.skuCode = undefined;
  state.env = undefined;
  state.principal = undefined;
  state.principalValid = false;
  state.leverage = undefined;
  state.leverageValid = false;
  state.refCode = undefined;
  state.skuLoading = false;
  state.evidenceFile = undefined;
  state.parsed = undefined;
  state.evidenceError = undefined;
  state.mismatch = undefined;
  state.lastResult = undefined;

  elements.form.classList.remove('is-submitted');
  elements.resultCard.hidden = true;
  clearChildren(elements.resultList);
  elements.evidenceInput.value = '';
  elements.evidenceName.textContent = '';
  renderEvidenceSummary(elements, undefined, undefined, lang);
  setFeedback(elements, COPY.hints.evidenceIdle, 'info');
  updateExchangeOptions(elements, lang);
  updatePairOptions(elements, undefined, lang);
  updateEnvOptions(elements, state, state.exchangeId, lang);
  updateSkuOptions(elements, state, lang);
  elements.skuSelect.value = '';
  elements.skuHint.textContent = translate(COPY.hints.skuDefault, lang);
  elements.principalInput.value = '';
  elements.principalHint.textContent = translate(COPY.hints.principalDefault, lang);
  elements.leverageInput.value = '';
  elements.leverageHint.textContent = translate(COPY.hints.leverageDefault, lang);
  if (elements.refCodeInput) {
    elements.refCodeInput.value = '';
  }
  elements.orderHint.textContent = translate(COPY.hints.orderDefault, lang);
  elements.submitButton.disabled = true;
  updateStepper(elements.stepper, state);
  updateAuthStatusDisplay(elements, getAuthState(), lang);
}

export function initVerify() {
  const root = document.querySelector<HTMLElement>('[data-verify-root]');
  if (!root) {
    console.warn('Verify page root missing');
    return;
  }

  const form = root.querySelector<HTMLFormElement>('[data-verify-form]');
  const exchangeSelect = root.querySelector<HTMLSelectElement>('[data-verify-exchange]');
  const exchangeHint = root.querySelector<HTMLElement>('[data-verify-exchange-hint]');
  const pairSelect = root.querySelector<HTMLSelectElement>('[data-verify-pair]');
  const pairHint = root.querySelector<HTMLElement>('[data-verify-pair-hint]');
  const orderInput = root.querySelector<HTMLInputElement>('[data-verify-order]');
  const orderHint = root.querySelector<HTMLElement>('[data-verify-order-hint]');
  const skuSelect = root.querySelector<HTMLSelectElement>('[data-verify-sku]');
  const skuHint = root.querySelector<HTMLElement>('[data-verify-sku-hint]');
  const envSelect = root.querySelector<HTMLSelectElement>('[data-verify-env]');
  const envHint = root.querySelector<HTMLElement>('[data-verify-env-hint]');
  const principalInput = root.querySelector<HTMLInputElement>('[data-verify-principal]');
  const principalHint = root.querySelector<HTMLElement>('[data-verify-principal-hint]');
  const leverageInput = root.querySelector<HTMLInputElement>('[data-verify-leverage]');
  const leverageHint = root.querySelector<HTMLElement>('[data-verify-leverage-hint]');
  const refCodeInput = root.querySelector<HTMLInputElement>('[data-verify-refcode]');
  const dropzone = root.querySelector<HTMLElement>('[data-verify-dropzone]');
  const evidenceInput = root.querySelector<HTMLInputElement>('[data-verify-evidence]');
  const evidenceName = root.querySelector<HTMLElement>('[data-verify-evidence-name]');
  const preview = root.querySelector<HTMLElement>('[data-verify-preview]');
  const previewList = root.querySelector<HTMLDListElement>('[data-verify-summary]');
  const previewRaw = root.querySelector<HTMLPreElement>('[data-verify-raw]');
  const clearEvidenceButton = root.querySelector<HTMLButtonElement>('[data-verify-clear]');
  const authStatus = root.querySelector<HTMLElement>('[data-verify-auth-status]');
  const feedback = root.querySelector<HTMLElement>('[data-verify-feedback]');
  const submitButton = root.querySelector<HTMLButtonElement>('[data-verify-submit]');
  const resetButton = root.querySelector<HTMLButtonElement>('[data-verify-reset]');
  const stepper = root.querySelector<HTMLElement>('[data-verify-stepper]');
  const resultCard = root.querySelector<HTMLElement>('[data-verify-result]');
  const resultList = root.querySelector<HTMLDListElement>('[data-verify-result-details]');
  const resultClose = root.querySelector<HTMLButtonElement>('[data-verify-result-close]');

  if (
    !form ||
    !exchangeSelect ||
    !exchangeHint ||
    !pairSelect ||
    !pairHint ||
    !orderInput ||
    !orderHint ||
    !skuSelect ||
    !skuHint ||
    !envSelect ||
    !envHint ||
    !principalInput ||
    !principalHint ||
    !leverageInput ||
    !leverageHint ||
    !dropzone ||
    !evidenceInput ||
    !evidenceName ||
    !preview ||
    !previewList ||
    !previewRaw ||
    !clearEvidenceButton ||
    !authStatus ||
    !feedback ||
    !submitButton ||
    !resetButton ||
    !resultCard ||
    !resultList ||
    !resultClose
  ) {
    console.warn('Verify page missing required form elements');
    return;
  }

  const elements: FormElements = {
    form,
    exchangeSelect,
    exchangeHint,
    pairSelect,
    pairHint,
    orderInput,
    orderHint,
    skuSelect,
    skuHint,
    envSelect,
    envHint,
    principalInput,
    principalHint,
    leverageInput,
    leverageHint,
    refCodeInput: refCodeInput ?? undefined,
    dropzone,
    evidenceInput,
    evidenceName,
    preview,
    previewList,
    previewRaw,
    clearEvidenceButton,
    authStatus,
    feedback,
    submitButton,
    resetButton,
    stepper,
    resultCard,
    resultList,
    resultClose,
  };

  let authState = getAuthState();

  const state: VerificationState = {
    orderId: '',
    orderValid: false,
    principalValid: false,
    leverageValid: false,
    isSubmitting: false,
    skuOptions: [],
    skuLoading: false,
    authReady: authStateReady(authState),
    walletAddress: authState.address,
  };

  let currentLanguage = getCurrentLanguage();
  updateExchangeOptions(elements, currentLanguage);
  updatePairOptions(elements, undefined, currentLanguage);
  state.skuLoading = true;
  updateSkuOptions(elements, state, currentLanguage);
  updateEnvOptions(elements, state, state.exchangeId, currentLanguage);
  elements.orderHint.textContent = translate(COPY.hints.orderDefault, currentLanguage);
  elements.principalHint.textContent = translate(COPY.hints.principalDefault, currentLanguage);
  elements.leverageHint.textContent = translate(COPY.hints.leverageDefault, currentLanguage);
  updateAuthStatusDisplay(elements, authState, currentLanguage);
  elements.feedback.hidden = true;

  const unsubscribeAuth = subscribeAuth((next) => {
    authState = next;
    state.walletAddress = next.address;
    state.authReady = authStateReady(next);
    updateAuthStatusDisplay(elements, authState, currentLanguage);
    updateSubmitButton();
  });

  async function loadSkuDefinitions() {
    state.skuLoading = true;
    updateSkuOptions(elements, state, currentLanguage);
    try {
      const skus = await fetchSkus();
      if (skus.length) {
        state.skuOptions = skus;
        state.skuLoadFailed = false;
      } else {
        state.skuOptions = [{ code: 'DAY_24H_FIXED', label: 'DAY_24H_FIXED' }];
        state.skuLoadFailed = true;
      }
    } catch (error) {
      console.error('[verify] failed to load sku definitions', error);
      state.skuOptions = [{ code: 'DAY_24H_FIXED', label: 'DAY_24H_FIXED' }];
      state.skuLoadFailed = true;
    } finally {
      state.skuLoading = false;
      updateSkuOptions(elements, state, currentLanguage);
      recomputeOrderValidity(state);
      updateSubmitButton();
      if (state.skuLoadFailed) {
        console.warn('Falling back to default SKU list');
      }
    }
  }

  void loadSkuDefinitions();

  const invalidateResult = () => {
    if (state.lastResult) {
      state.lastResult = undefined;
      elements.resultCard.hidden = true;
      elements.form.classList.remove('is-submitted');
      clearChildren(elements.resultList);
    }
  };

  const unsubscribeLanguage = onLanguageChange((lang) => {
    currentLanguage = lang;
    updateExchangeOptions(elements, lang);
    updatePairOptions(elements, state.exchangeId, lang);
    updateEnvOptions(elements, state, state.exchangeId, lang);
    updateSkuOptions(elements, state, lang);
    renderEvidenceSummary(elements, state.parsed, state.evidenceFile, lang);
    const orderIdValid = state.orderId.length >= 6;
    elements.orderHint.textContent = translate(
      orderIdValid || !state.orderId ? COPY.hints.orderDefault : COPY.hints.orderInvalid,
      lang
    );
    elements.principalHint.textContent = translate(
      state.principalValid || !state.principal ? COPY.hints.principalDefault : COPY.hints.principalInvalid,
      lang
    );
    elements.leverageHint.textContent = translate(
      state.leverageValid || !state.leverage ? COPY.hints.leverageDefault : COPY.hints.leverageInvalid,
      lang
    );
    updateAuthStatusDisplay(elements, authState, lang);
    if (state.mismatch) {
      const copy = MISMATCH_MESSAGES[state.mismatch] ?? COPY.hints.evidenceMismatch;
      setFeedback(elements, copy, 'error');
    } else if (state.parsed && state.evidenceFile) {
      setFeedback(elements, COPY.hints.evidenceReady, 'success');
    } else {
      setFeedback(elements, COPY.hints.evidenceIdle, 'info');
    }
    if (state.lastResult) {
      renderResultSummary(elements, state.lastResult, lang);
    }
  });

  function updateSubmitButton() {
    const ready =
      state.exchangeId &&
      state.pairId &&
      state.orderValid &&
      state.parsed &&
      !state.mismatch &&
      !state.skuLoading;
    elements.submitButton.disabled = !ready;
  }

  exchangeSelect.addEventListener('change', () => {
    const value = exchangeSelect.value as ExchangeId | '';
    invalidateResult();
    state.exchangeId = value || undefined;
    const option = value ? findExchangeOption(value) : undefined;
    if (option) {
      elements.exchangeHint.textContent = option.description[currentLanguage];
    } else {
      elements.exchangeHint.textContent = translate(COPY.hints.exchangeDefault, currentLanguage);
    }
    state.pairId = undefined;
    pairSelect.value = '';
    updatePairOptions(elements, state.exchangeId, currentLanguage);
    updateEnvOptions(elements, state, state.exchangeId, currentLanguage);
    renderEvidenceSummary(elements, state.parsed, state.evidenceFile, currentLanguage);
    state.mismatch = evaluateMismatch(state, undefined);
    recomputeOrderValidity(state);
    updateStepper(elements.stepper, state);
    updateSubmitButton();
  });

  pairSelect.addEventListener('change', () => {
    const value = pairSelect.value as TradingPairId | '';
    invalidateResult();
    state.pairId = value || undefined;
    const pairOption = value ? findPairOption(value) : undefined;
    if (pairOption) {
      elements.pairHint.textContent = pairOption.notice[currentLanguage];
    } else {
      elements.pairHint.textContent = translate(COPY.hints.pairNotice, currentLanguage);
    }
    state.mismatch = evaluateMismatch(state, pairOption);
    if (state.mismatch) {
      const copy = MISMATCH_MESSAGES[state.mismatch] ?? COPY.hints.evidenceMismatch;
      setFeedback(elements, copy, 'error');
    } else if (state.parsed && state.evidenceFile) {
      setFeedback(elements, COPY.hints.evidenceReady, 'success');
    }
    recomputeOrderValidity(state);
    updateStepper(elements.stepper, state);
    updateSubmitButton();
  });

  orderInput.addEventListener('input', () => {
    const sanitized = orderInput.value.replace(/\D/g, '');
    invalidateResult();
    if (sanitized !== orderInput.value) {
      orderInput.value = sanitized;
    }
    state.orderId = sanitized;
    elements.orderHint.textContent = translate(
      sanitized.length >= 6 || !sanitized ? COPY.hints.orderDefault : COPY.hints.orderInvalid,
      currentLanguage
    );
    recomputeOrderValidity(state);
    updateStepper(elements.stepper, state);
    updateSubmitButton();
  });

  skuSelect.addEventListener('change', () => {
    invalidateResult();
    state.skuCode = skuSelect.value || undefined;
    const selected = state.skuOptions.find((option) => option.code === state.skuCode);
    elements.skuHint.textContent = selected?.description ?? translate(COPY.hints.skuDefault, currentLanguage);
    recomputeOrderValidity(state);
    updateSubmitButton();
  });

  envSelect.addEventListener('change', () => {
    invalidateResult();
    state.env = (envSelect.value as EnvironmentId | '') || undefined;
    recomputeOrderValidity(state);
    updateSubmitButton();
  });

  principalInput.addEventListener('input', () => {
    invalidateResult();
    const value = principalInput.value.trim();
    const numeric = parsePositiveNumber(value);
    if (numeric === undefined) {
      state.principal = undefined;
      state.principalValid = false;
    } else if (Number.isNaN(numeric)) {
      state.principal = undefined;
      state.principalValid = false;
    } else {
      state.principal = numeric;
      state.principalValid = true;
    }
    elements.principalHint.textContent = translate(
      state.principalValid || !value ? COPY.hints.principalDefault : COPY.hints.principalInvalid,
      currentLanguage
    );
    recomputeOrderValidity(state);
    updateSubmitButton();
  });

  leverageInput.addEventListener('input', () => {
    invalidateResult();
    const value = leverageInput.value.trim();
    const numeric = parsePositiveNumber(value);
    if (numeric === undefined) {
      state.leverage = undefined;
      state.leverageValid = false;
    } else if (Number.isNaN(numeric)) {
      state.leverage = undefined;
      state.leverageValid = false;
    } else {
      state.leverage = numeric;
      state.leverageValid = true;
    }
    elements.leverageHint.textContent = translate(
      state.leverageValid || !value ? COPY.hints.leverageDefault : COPY.hints.leverageInvalid,
      currentLanguage
    );
    recomputeOrderValidity(state);
    updateSubmitButton();
  });

  if (elements.refCodeInput) {
    elements.refCodeInput.addEventListener('input', () => {
      state.refCode = elements.refCodeInput?.value?.trim() || undefined;
    });
  }

  async function handleFile(file: File) {
    invalidateResult();
    state.evidenceFile = file;
    state.parsed = undefined;
    state.evidenceError = undefined;
    state.mismatch = undefined;
    setFeedback(elements, COPY.hints.evidenceProcessing, 'info');
    elements.evidenceName.textContent = file.name;
    renderEvidenceSummary(elements, undefined, file, currentLanguage);
    updateSubmitButton();

    try {
      const parsed = await parseEvidenceFile(file);
      state.parsed = parsed as ParsedEvidence;
      const pairOption = state.pairId ? findPairOption(state.pairId) : undefined;
      state.mismatch = evaluateMismatch(state, pairOption);
      renderEvidenceSummary(elements, state.parsed, file, currentLanguage);

      if (state.mismatch) {
        const copy = MISMATCH_MESSAGES[state.mismatch] ?? COPY.hints.evidenceMismatch;
        setFeedback(elements, copy, 'error');
      } else {
        setFeedback(elements, COPY.hints.evidenceReady, 'success');
      }
    } catch (error) {
      state.evidenceError =
        error instanceof Error ? error.message : translate(COPY.feedback.fileError);
      setFeedback(elements, COPY.feedback.fileError, 'error');
      console.error(error);
    }
    updateStepper(elements.stepper, state);
    updateSubmitButton();
  }

  evidenceInput.addEventListener('change', () => {
    const [file] = evidenceInput.files ?? [];
    if (file) {
      void handleFile(file);
    }
  });

  dropzone.addEventListener('dragover', (event) => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('is-dragging');
  });

  dropzone.addEventListener('drop', (event) => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      evidenceInput.files = event.dataTransfer?.files ?? null;
      void handleFile(file);
    }
  });

  clearEvidenceButton.addEventListener('click', () => {
    invalidateResult();
    state.evidenceFile = undefined;
    state.parsed = undefined;
    state.mismatch = undefined;
    state.evidenceError = undefined;
    elements.evidenceInput.value = '';
    elements.evidenceName.textContent = '';
    renderEvidenceSummary(elements, undefined, undefined, currentLanguage);
    setFeedback(elements, COPY.hints.evidenceIdle, 'info');
    updateStepper(elements.stepper, state);
    updateSubmitButton();
  });

  form.addEventListener('submit', (event) => {
    void handleSubmit(event, elements, state);
    updateStepper(elements.stepper, state);
  });

  resetButton.addEventListener('click', () => {
    resetState(elements, state, currentLanguage);
  });

  resultClose.addEventListener('click', () => {
    resetState(elements, state, currentLanguage);
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  setFeedback(elements, COPY.hints.evidenceIdle, 'info');
  updateStepper(elements.stepper, state);

  window.addEventListener('beforeunload', unsubscribeLanguage, { once: true });
  window.addEventListener('beforeunload', () => unsubscribeAuth(), { once: true });
}
