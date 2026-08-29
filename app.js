// EuroInference - Multi-Provider LLM Price Comparison
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)
// See LICENSE file in the project root for full license text.

// State Variables
let unifiedModels = []; // Pre-unified at generation time (see unify.js / data.js UNIFIED_MODELS)
const BENCHMARK_PROVIDER_ID = 'openrouter';
let exchangeRate = 1.1406; // Overwritten at init from data.js EXCHANGE_RATE constant
let exchangeRateDate = '2026-07-15'; // Overwritten at init from data.js EXCHANGE_RATE constant
let selectedCurrency = 'EUR'; // 'EUR' or 'USD'
let selectedTheme = document.documentElement.dataset.theme || 'dark';

// Filter state
let searchQuery = '';
let activeTab = 'all'; // 'all', 'matched', 'mammouth', 'cortecs'
let selectedProvider = []; // array of selected provider filter values; empty = no filter
let selectedCreator = 'all'; // 'all' or specific creator name
let selectedTag = 'all'; // 'all' or specific capability tag
let dedupeLatestTwo = true; // variant-aware latest 2 per family enabled by default (first-paint variant-aware)
let dateFilter = '12m'; // preset Last 12 months (reasonable default to reduce wall; 'all' = no date filter)
let hideUnknownDates = true; // when date filter active, hide models with no release_date (toggle-controlled)

// Workload estimator inputs (used to compute the "Cost (your workload)" column).
// Defaults: 50K input / 5K output tokens — realistic agentic per-task (ChatDev ~54% input, 5-step ~50k total; see research).
// RAG 20K/1K, Chat 2K/0.5K are set via preset chips. Min context default 32k for regular coding.
let minContextSize = 32000;
let workloadInputTokens = 50000;
let workloadOutputTokens = 5000;

// Prompt-caching assumptions behind the "Cost (your workload)" column.
// cacheAwareCost toggles the blended formula on/off; cachedInputShare is the assumed
// share of input tokens served from cache; cacheReuseRounds (R) amortizes write
// premiums across the average number of times a cached context is re-read.
let cacheAwareCost = true;
let cachedInputShare = 0.8; // Agentic preset (realistic: 80% cached, R=8)
let cacheReuseRounds = 8;
let onlyCachingProviders = false; // visibility filter: hide offers without caching support

// Single source of truth for every cache-math explanation rendered in the UI.
const CACHE_FORMULA_TEXT = 'p_eff = base·(1−s) + (s/R)·[w + (R−1)·r]';
const CACHE_FORMULA_RULES = [
  'No published write rate → writes are billed at full input price (w = base).',
  'No published read rate (or read ≥ base price) → cached tokens are billed at full input price.',
  'Unknown caching support never counts as a discount — only published rates reduce the estimate.'
];
const CACHE_SHARE_PRESETS = [
  { label: 'Chat', share: 0 },
  { label: 'RAG', share: 40 },
  { label: 'Agentic', share: 80 }
];
const DEFAULT_CACHE_REUSE_ROUNDS = 4;

const COST_SLIDER_STEPS = 1000;
const COST_LOG_MIN = 0.0001;
let costFilterRanges = {
  input: { min: 0, max: Infinity, scaleMax: Infinity },
  output: { min: 0, max: Infinity, scaleMax: Infinity }
};

let _currencySwitchPending = false;
let _lastCurrency = selectedCurrency;
const _numberFmt = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const _intFmt = new Intl.NumberFormat(undefined);
function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
let _deferredRender = false;
function scheduleRender() {
  if (document.hidden) { _deferredRender = true; return; }
  if (scheduleRender._raf) return;
  scheduleRender._raf = requestAnimationFrame(() => {
    scheduleRender._raf = null;
    applyFiltersAndRender();
  });
}

// Sorting state — default Value desc so first paint shows best quality per dollar (variant-aware dedupe keeps wall low)
let currentSortColumn = 'value';
let currentSortDirection = 'desc'; // 'asc' or 'desc'

// --- DATA FETCHING & INITIALIZATION ---

async function init() {
  loadExchangeRate();
  updateLastUpdatedDisplay();
  renderUpdateWarning();
  await fetchModels();

  configureCostFilters();
  setupUIEventListeners();
  renderCreatorsFilter();
  updateCacheControls();
  applyFiltersAndRender();
}

function formatLastUpdated(isoString) {
  if (!isoString) return 'recently';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const hours = String(d.getUTCHours()).padStart(2, '0');
    const mins = String(d.getUTCMinutes()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${mins} UTC`;
  } catch (e) {
    return isoString;
  }
}

function updateLastUpdatedDisplay() {
  const el = document.getElementById('last-updated-display');
  if (!el) return;
  const raw = (typeof LAST_UPDATED !== 'undefined') ? LAST_UPDATED : (typeof exchangeRateDate !== 'undefined' ? exchangeRateDate : '');
  el.textContent = formatLastUpdated(raw);
  if (raw) {
    el.title = `Data timestamp: ${raw}`;
  }
}

function loadExchangeRate() {
  // Exchange rate is generated alongside model data by scripts/update_data.js
  // (twice a day, via GitHub Actions) and shipped in data.js as the EXCHANGE_RATE constant.
  // No network call is made at page load — see project rule: local connections only.
  const rate = (typeof EXCHANGE_RATE !== 'undefined') ? EXCHANGE_RATE : null;
  if (rate) {
    if (Array.isArray(rate) && rate[0]) {
      exchangeRate = rate[0].rate;
      exchangeRateDate = rate[0].date;
    } else if (rate.rate) {
      exchangeRate = rate.rate;
      exchangeRateDate = rate.date;
    } else if (rate.rates && rate.rates.USD) {
      exchangeRate = rate.rates.USD;
      exchangeRateDate = rate.date;
    }
  }
  const exchangeRateBanner = document.getElementById('exchange-rate-val');
  if (exchangeRateBanner) {
    exchangeRateBanner.textContent = exchangeRate.toFixed(4);
    const todayStr = new Date().toISOString().split('T')[0];
    let dateTooltip = `Reference date: ${exchangeRateDate}`;
    if (exchangeRateDate > todayStr) {
      dateTooltip += ' (ECB Next Business Day)';
    }
    document.getElementById('exchange-rate-banner').title = dateTooltip;
  }
  console.log(`Exchange rate loaded from data.js: 1 EUR = ${exchangeRate} USD (${exchangeRateDate})`);
}

async function fetchModels() {
  console.log('Loading pre-unified model data...');
  unifiedModels = (typeof UNIFIED_MODELS !== 'undefined' && Array.isArray(UNIFIED_MODELS)) ? UNIFIED_MODELS : [];

  const offerTally = {};
  for (const m of unifiedModels) {
    for (const key of Object.keys(m.offers || {})) {
      offerTally[key] = (offerTally[key] || 0) + 1;
    }
  }
  const withRef = unifiedModels.filter(m => m.benchmarkOffer).length;
  console.log(`Loaded ${unifiedModels.length} unified models:`, offerTally,
    `(plus ${withRef} non-EU reference offers)`);
}

// --- NORMALIZATION & MATCHING ENGINE ---

// Grouping/normalization live in the shared engine unify.js (used by the
// data updater at generation time). The browser only renders; these thin
// aliases serve render-time helpers below.
const getCleanModelId = (id) => EuroUnify.getCleanModelId(id);
const STANDARD_CAPABILITIES = EuroUnify.STANDARD_CAPABILITIES;
const PROVIDER_DISPLAY_NAMES = EuroUnify.PROVIDER_DISPLAY_NAMES;
const REGION_PIN_LABELS = EuroUnify.REGION_PIN_LABELS;
const regionBucketFromCode = EuroUnify.regionBucketFromCode;


const _friendlyNameCache = new Map();
const _origGetHumanFriendlyName = function(id) {
  if (!id) return '';
  let clean = getCleanModelId(id);
  const lower = clean.toLowerCase().trim();

  // 1. Exact Manual Mappings for specific models
  const manualMappings = {
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'gpt-35-turbo': 'GPT-3.5 Turbo',
    'gpt-4': 'GPT-4',
    'gpt-5.1-chat': 'GPT-5.1 Chat',
    'gpt-5.1-codex-max': 'GPT-5.1 Codex Max',
    'o1': 'o1',
    'o1-mini': 'o1-mini',
    'o1-pro': 'o1-pro',
    'o3': 'o3',
    'o3-mini': 'o3-mini',
    'o3-pro': 'o3-pro',
    'o4-mini': 'o4-mini',
    'o3-deep-research': 'o3 Deep Research',
    'o4-mini-deep-research': 'o4-mini Deep Research',
    'deepseek-chat': 'DeepSeek V3 (Chat)',
    'deepseek-coder': 'DeepSeek Coder',
    'deepseek-reasoner': 'DeepSeek R1 (Reasoner)',
    'deepseek-r1': 'DeepSeek R1',
    'deepseek-v3': 'DeepSeek V3',
    'deepseek-v3.2': 'DeepSeek V3.2',
    'deepseek-v4-flash': 'DeepSeek V4 Flash',
    'deepseek-v4-pro': 'DeepSeek V4 Pro',
    'codestral': 'Codestral',
    'ministral-3b': 'Ministral 3B',
    'ministral-8b': 'Ministral 8B',
    'mistral-nemo': 'Mistral Nemo',
    'mistral-large': 'Mistral Large',
    'mistral-medium': 'Mistral Medium',
    'mistral-small': 'Mistral Small',
    'sonar-small-chat': 'Sonar Small Chat',
    'sonar-medium-chat': 'Sonar Medium Chat',
    'sonar-deep-research': 'Sonar Deep Research',
    'sonar-pro': 'Sonar Pro',
    'sonar-reasoning-pro': 'Sonar Reasoning Pro',
    'sonar': 'Sonar'
  };

  if (manualMappings[lower]) {
    return manualMappings[lower];
  }

  // 2. Generic systematic family formatting:
  
  // A. Claude (e.g. Claude 5 Opus, Claude 4.5 Haiku, Claude 5 Opus Fast, Claude 3.5 Sonnet)
  if (lower.startsWith('claude')) {
    let sub = lower;
    let modifier = '';
    const modMatch = sub.match(/-(fast|latest|preview|thinking|deep-research)$/);
    if (modMatch) {
      modifier = modMatch[1].charAt(0).toUpperCase() + modMatch[1].slice(1);
      sub = sub.replace(/-(fast|latest|preview|thinking|deep-research)$/, '');
    }
    
    let family = '';
    const famMatch = sub.match(/(opus|sonnet|haiku|fable)/);
    if (famMatch) {
      family = famMatch[1].charAt(0).toUpperCase() + famMatch[1].slice(1);
      sub = sub.replace(/-(opus|sonnet|haiku|fable)|(opus|sonnet|haiku|fable)-?/, '');
    }
    
    let version = sub.replace(/^claude-?/, '').replace(/[-_]/g, '.');
    if (version) {
      version = version.replace(/\.+$/, '');
    }
    
    const parts = ['Claude'];
    if (version) parts.push(version);
    if (family) parts.push(family);
    if (modifier) parts.push(modifier === 'Fast' ? 'Fast' : `(${modifier})`);
    return parts.join(' ');
  }

  // B. Mistral / Mixtral / Ministral / Codestral / Pixtral / Voxtral / Devstral
  if (/^(mistral|mixtral|ministral|codestral|pixtral|voxtral|devstral)/.test(lower)) {
    let sub = lower;
    let brandMatch = sub.match(/^(mistral|mixtral|ministral|codestral|pixtral|voxtral|devstral)/);
    let brand = brandMatch[1].charAt(0).toUpperCase() + brandMatch[1].slice(1);
    sub = sub.replace(/^(mistral|mixtral|ministral|codestral|pixtral|voxtral|devstral)-?/, '');
    
    let version = '';
    const verMatch = sub.match(/^(\d+(?:\.\d+)?)(?![bBtT\d])[-_]?/);
    if (verMatch) {
      version = verMatch[1];
      sub = sub.slice(verMatch[0].length);
    }

    const restWords = sub.split(/[-_]/).filter(Boolean).map(w => {
      if (/^\d+[bB]$/i.test(w)) return w.toUpperCase();
      if (/^\d+x\d+[bB]$/i.test(w)) return w.toUpperCase();
      if (['instruct', 'it', 'lora', 'latest'].includes(w)) return `(${w.charAt(0).toUpperCase() + w.slice(1)})`;
      return w.charAt(0).toUpperCase() + w.slice(1);
    });

    const parts = [brand];
    if (version) parts.push(version);
    parts.push(...restWords);
    return parts.join(' ').replace(/\s+\(/g, ' (');
  }

  // C. Gemini / Gemma
  if (/^(gemini|gemma)/.test(lower)) {
    let sub = lower;
    let brand = sub.startsWith('gemini') ? 'Gemini' : 'Gemma';
    sub = sub.replace(/^(gemini|gemma)-?/, '');

    let version = '';
    const verMatch = sub.match(/^(\d+(?:\.\d+)?)(?![bBtT\d])[-_]?/);
    if (verMatch) {
      version = verMatch[1];
      sub = sub.slice(verMatch[0].length);
    }

    const restWords = sub.split(/[-_]/).filter(Boolean).map(w => {
      if (/^\d+[bB]$/i.test(w)) return w.toUpperCase();
      if (/^\d+[bB]-a\d+[bB]$/i.test(w)) return w.toUpperCase();
      if (['preview', 'exp', 'experimental', 'it', 'instruct', 'lora'].includes(w)) {
        return `(${w.charAt(0).toUpperCase() + w.slice(1)})`;
      }
      return w.charAt(0).toUpperCase() + w.slice(1);
    });

    const parts = [brand];
    if (version) parts.push(version);
    parts.push(...restWords);
    return parts.join(' ').replace(/\s+\(/g, ' (');
  }

  // D. Qwen / QwQ
  if (/^(qwen|qwq)/.test(lower)) {
    let sub = lower;
    let brand = sub.startsWith('qwq') ? 'QwQ' : 'Qwen';
    sub = sub.replace(/^(qwen|qwq)-?/, '');

    let version = '';
    const verMatch = sub.match(/^(\d+(?:\.\d+)?)(?![bBtT\d])[-_]?/);
    if (verMatch) {
      version = verMatch[1];
      sub = sub.slice(verMatch[0].length);
    }

    const restWords = sub.split(/[-_]/).filter(Boolean).map(w => {
      if (/^\d+[bB]$/i.test(w)) return w.toUpperCase();
      if (/^\d+(\.\d+)?[tT]$/i.test(w)) return w.toUpperCase();
      if (/^\d+(\.\d+)?[tT]-a\d+[bB]$/i.test(w)) return w.toUpperCase();
      if (/^\d+[bB]-a\d+[bB]$/i.test(w)) return w.toUpperCase();
      if (w === 'vl') return 'VL';
      if (w === 'instruct') return '(Instruct)';
      if (w === 'coder') return 'Coder';
      return w.charAt(0).toUpperCase() + w.slice(1);
    });

    const parts = [brand];
    if (version) parts.push(version);
    parts.push(...restWords);
    return parts.join(' ').replace(/\s+\(/g, ' (');
  }

  // E. GLM
  if (/^glm/.test(lower)) {
    let sub = lower;
    sub = sub.replace(/^glm-?/, '');
    let version = '';
    const verMatch = sub.match(/^(\d+(?:\.\d+)?)(?![bBtT\d])[-_]?/);
    if (verMatch) {
      version = verMatch[1];
      sub = sub.slice(verMatch[0].length);
    }

    const restWords = sub.split(/[-_]/).filter(Boolean).map(w => {
      if (w === 'v') return 'V';
      if (w === 'turbo') return 'Turbo';
      if (w === 'flash') return 'Flash';
      if (w === 'air') return 'Air';
      if (w === 'maas') return 'MaaS';
      return w.charAt(0).toUpperCase() + w.slice(1);
    });

    const parts = ['GLM'];
    if (version) parts.push(version);
    parts.push(...restWords);
    return parts.join(' ');
  }

  // F. Llama
  if (/^llama/.test(lower)) {
    let sub = lower;
    sub = sub.replace(/^llama-?/, '');
    let version = '';
    const verMatch = sub.match(/^(\d+(?:\.\d+)?)(?![bBtT\d])[-_]?/);
    if (verMatch) {
      version = verMatch[1];
      sub = sub.slice(verMatch[0].length);
    }

    const restWords = sub.split(/[-_]/).filter(Boolean).map(w => {
      if (/^\d+[bB]$/i.test(w)) return w.toUpperCase();
      if (['instruct', 'it'].includes(w)) return '(Instruct)';
      return w.charAt(0).toUpperCase() + w.slice(1);
    });

    const parts = ['Llama'];
    if (version) parts.push(version);
    parts.push(...restWords);
    return parts.join(' ').replace(/\s+\(/g, ' (');
  }

  // G. GPT
  if (/^gpt/.test(lower)) {
    let sub = lower;
    sub = sub.replace(/^gpt-?/, '');
    let version = '';
    const verMatch = sub.match(/^(\d+(?:\.\d+)?)(?![bBtT\d])[-_]?/);
    if (verMatch) {
      version = verMatch[1];
      sub = sub.slice(verMatch[0].length);
    }

    const restWords = sub.split(/[-_]/).filter(Boolean).map(w => {
      if (/^\d+[bB]$/i.test(w)) return w.toUpperCase();
      if (['oss'].includes(w)) return 'OSS';
      if (['api'].includes(w)) return 'API';
      if (['preview', 'exp'].includes(w)) return `(${w.charAt(0).toUpperCase() + w.slice(1)})`;
      return w.charAt(0).toUpperCase() + w.slice(1);
    });

    const parts = ['GPT'];
    if (version) parts.push(version);
    parts.push(...restWords);
    return parts.join(' ').replace(/\s+\(/g, ' (');
  }

  // Fallback Capitalizer for all other models
  let name = clean;
  name = name.replace(/-(eu|us|global)$/i, '');
  
  return name
    .split(/[-_]/)
    .map(word => {
      if (!word) return '';
      if (/^\d+[bB]$/i.test(word)) return word.toUpperCase();
      if (/^\d+(\.\d+)?[tT]$/i.test(word)) return word.toUpperCase();
      if (['gpt', 'llm', 'moe', 'ecb', 'api', 'vl', 'glm', 'oss', 'ibm', 'ai', 'r1', 'v3', 'v4'].includes(word.toLowerCase())) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
};
function getHumanFriendlyName(id) {
  if (_friendlyNameCache.has(id)) return _friendlyNameCache.get(id);
  const v = _origGetHumanFriendlyName(id);
  _friendlyNameCache.set(id, v);
  if (_friendlyNameCache.size > 2000) _friendlyNameCache.clear();
  return v;
}


const CAPABILITY_DESCRIPTIONS = {
  Reasoning: 'Extended thinking for multi-step analysis and complex problem solving.',
  Tools: 'Can call external tools or functions during a request.',
  Vision: 'Can understand and analyze images or other visual inputs.',
  Code: 'Optimized for writing, reviewing, or completing code.',
  Audio: 'Supports audio input or output, depending on the provider.',
  'Structured Output': 'Can return responses in a required schema or structured format.',
  'Prompt Caching': 'Can reuse prompt content to reduce latency and input cost.'
};


const PROVIDER_BADGE_CLASS = 'badge-provider';

// --- Data sovereignty display helpers (facts resolved in unify.js) ---

function flagEmoji(code) {
  const c = String(code || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return '';
  return String.fromCodePoint(...[...c].map(ch => 127397 + ch.charCodeAt(0)));
}


function areCostsEqual(a, b) {
  return Math.abs(a - b) <= Math.max(1e-9, Math.max(Math.abs(a), Math.abs(b)) * 1e-9);
}

function renderUpdateWarning() {
  const el = document.getElementById('update-warning');
  if (!el || typeof UPDATE_STATUS === 'undefined') return;
  const names = {
    mammouth: 'Mammouth AI', cortecs: 'Cortecs', mistral: 'Mistral AI',
    edenai: 'Eden AI', opper: 'Opper AI', eurouter: 'EURouter', greenpt: 'GreenPT', requesty: 'Requesty AI',
    openrouter: 'OpenRouter (reference)'
  };
  const failed = Object.entries(names)
    .filter(([id]) => UPDATE_STATUS[id] === false)
    .map(([, name]) => name);
  if (UPDATE_STATUS.exchangeRate === false) failed.push('exchange rates');
  if (failed.length === 0) return;
  el.textContent = `Warning: the last update failed for: ${failed.join(', ')}.`;
  el.hidden = false;
}

function getOfferInputCost(providerId, offer, currency = selectedCurrency) {
  if (!offer) return null;
  
  if (providerId === 'cortecs') {
    if (!offer.pricing || offer.pricing.input_token === undefined) return null;
    const priceEur = offer.pricing.input_token;
    return currency === 'EUR' ? priceEur : priceEur * exchangeRate;
  }
  
  if (providerId === 'mammouth') {
    if (!offer.model_info || offer.model_info.input_cost_per_token === undefined) return null;
    const priceUsd = offer.model_info.input_cost_per_token * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }
  
  if (providerId === 'mistral' || providerId === 'mistral-regional') {
    if (!offer.pricing) return null;
    if (currency === 'EUR') return offer.pricing.input_token_eur ?? null;
    return offer.pricing.input_token ?? null;
  }

  if (providerId === 'edenai') {
    if (!offer.pricing || offer.pricing.input_cost_per_token === undefined) return null;
    const priceUsd = offer.pricing.input_cost_per_token * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'opper') {
    if (!offer.pricing || !Array.isArray(offer.pricing.input) || offer.pricing.input.length === 0) return null;
    const priceUsd = offer.pricing.input[0];
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'eurouter') {
    if (!offer.pricing || offer.pricing.prompt === undefined) return null;
    const origCur = offer.pricing.currency || 'EUR';
    const priceVal = parseFloat(offer.pricing.prompt) * 1000000;
    if (origCur === 'EUR') {
      return currency === 'EUR' ? priceVal : priceVal * exchangeRate;
    } else {
      return currency === 'USD' ? priceVal : priceVal / exchangeRate;
    }
  }

  if (providerId === 'greenpt') {
    if (!offer.pricing || offer.pricing.promptToken === undefined) return null;
    const priceEur = offer.pricing.promptToken;
    return currency === 'EUR' ? priceEur : priceEur * exchangeRate;
  }

  if (providerId === 'requesty') {
    if (offer.input_price === undefined) return null;
    const priceUsd = offer.input_price * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'openrouter') {
    if (!offer.pricing || offer.pricing.prompt === undefined) return null;
    const priceUsd = offer.pricing.prompt * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }
  
  return null;
}

function getOfferOutputCost(providerId, offer, currency = selectedCurrency) {
  if (!offer) return null;
  
  if (providerId === 'cortecs') {
    if (!offer.pricing || offer.pricing.output_token === undefined) return null;
    const priceEur = offer.pricing.output_token;
    return currency === 'EUR' ? priceEur : priceEur * exchangeRate;
  }
  
  if (providerId === 'mammouth') {
    if (!offer.model_info || offer.model_info.output_cost_per_token === undefined) return null;
    const priceUsd = offer.model_info.output_cost_per_token * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }
  
  if (providerId === 'mistral' || providerId === 'mistral-regional') {
    if (!offer.pricing) return null;
    if (currency === 'EUR') return offer.pricing.output_token_eur ?? null;
    return offer.pricing.output_token ?? null;
  }

  if (providerId === 'edenai') {
    if (!offer.pricing || offer.pricing.output_cost_per_token === undefined) return null;
    const priceUsd = offer.pricing.output_cost_per_token * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'opper') {
    if (!offer.pricing || !Array.isArray(offer.pricing.output) || offer.pricing.output.length === 0) return null;
    const priceUsd = offer.pricing.output[0];
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'eurouter') {
    if (!offer.pricing || offer.pricing.completion === undefined) return null;
    const origCur = offer.pricing.currency || 'EUR';
    const priceVal = parseFloat(offer.pricing.completion) * 1000000;
    if (origCur === 'EUR') {
      return currency === 'EUR' ? priceVal : priceVal * exchangeRate;
    } else {
      return currency === 'USD' ? priceVal : priceVal / exchangeRate;
    }
  }

  if (providerId === 'greenpt') {
    if (!offer.pricing || offer.pricing.completionToken === undefined) return null;
    const priceEur = offer.pricing.completionToken;
    return currency === 'EUR' ? priceEur : priceEur * exchangeRate;
  }

  if (providerId === 'requesty') {
    if (offer.output_price === undefined) return null;
    const priceUsd = offer.output_price * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'openrouter') {
    if (!offer.pricing || offer.pricing.completion === undefined) return null;
    const priceUsd = offer.pricing.completion * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }
  
  return null;
}

function positiveRate(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

// USD per-token rates (Requesty/Eden AI convention) normalized to per-1M.
function usdPerTokenToPerMillion(value) {
  const rate = positiveRate(value);
  return rate === null ? null : rate * 1000000;
}

// Convert a per-1M native-currency rate into the display currency.
function convertPerMillionRate(value, nativeCurrency, currency) {
  if (value === null || nativeCurrency === currency) return value;
  // exchangeRate is USD per EUR (ECB reference from data.js)
  return nativeCurrency === 'EUR' ? value * exchangeRate : value / exchangeRate;
}

// Published prompt-cache rates for a single offer, normalized to the selected
// currency, per 1M tokens. `read` is only returned when it is a genuine discount
// (finite, > 0 and strictly below the base input rate); zero/absent means "not
// offered", never "free". `write` is any published write premium as-is.
function getOfferCacheRates(providerId, offer, currency = selectedCurrency) {
  const empty = { read: null, write: null };
  if (!offer) return empty;

  let read = null;
  let write = null;

  if (providerId === 'cortecs') {
    read = convertPerMillionRate(positiveRate(offer.pricing?.cache_read_cost), 'EUR', currency);
    write = convertPerMillionRate(positiveRate(offer.pricing?.cache_write_cost), 'EUR', currency);
  } else if (providerId === 'mistral' || providerId === 'mistral-regional') {
    read = currency === 'EUR'
      ? positiveRate(offer.pricing?.cached_input_token_eur)
      : positiveRate(offer.pricing?.cached_input_token);
  } else if (providerId === 'edenai') {
    read = usdPerTokenToPerMillion(offer.pricing?.cache_read_input_token_cost)
      ?? usdPerTokenToPerMillion(offer.pricing?.input_cost_per_token_cache_hit);
    write = usdPerTokenToPerMillion(offer.pricing?.cache_creation_input_token_cost);
    read = convertPerMillionRate(read, 'USD', currency);
    write = convertPerMillionRate(write, 'USD', currency);
  } else if (providerId === 'opper') {
    read = positiveRate(Array.isArray(offer.pricing?.cached_input) ? offer.pricing.cached_input[0] : undefined);
    write = positiveRate(Array.isArray(offer.pricing?.cache_creation) ? offer.pricing.cache_creation[0] : undefined);
    read = convertPerMillionRate(read, 'USD', currency);
    write = convertPerMillionRate(write, 'USD', currency);
  } else if (providerId === 'eurouter') {
    const origCur = offer.pricing?.currency || 'EUR';
    const rawRead = parseFloat(offer.pricing?.input_cache_read);
    const rawWrite = parseFloat(offer.pricing?.input_cache_write);
    read = Number.isFinite(rawRead) && rawRead > 0 ? rawRead * 1000000 : null;
    write = Number.isFinite(rawWrite) && rawWrite > 0 ? rawWrite * 1000000 : null;
    read = convertPerMillionRate(read, origCur, currency);
    write = convertPerMillionRate(write, origCur, currency);
  } else if (providerId === 'greenpt') {
    read = convertPerMillionRate(positiveRate(offer.pricing?.cachedPromptToken), 'EUR', currency);
  } else if (providerId === 'requesty') {
    read = convertPerMillionRate(usdPerTokenToPerMillion(offer.cached_price), 'USD', currency);
    write = convertPerMillionRate(usdPerTokenToPerMillion(offer.caching_price), 'USD', currency);
  } else if (providerId === 'openrouter') {
    read = convertPerMillionRate(usdPerTokenToPerMillion(offer.pricing?.input_cache_read), 'USD', currency);
  }

  const baseIn = getOfferInputCost(providerId, offer, currency);
  if (read !== null && baseIn !== null && read >= baseIn) read = null;
  return { read, write };
}

// Tri-state caching support for one offer:
//   'priced'      — a published cache rate exists
//   'flagged'     — provider explicitly reports caching support without a published rate
//   'unsupported' — provider explicitly reports no caching support
//   'unknown'     — no signal in either direction
function getOfferCacheSupport(providerId, offer) {
  if (!offer) return 'unknown';
  const { read, write } = getOfferCacheRates(providerId, offer);
  if (read !== null || write !== null) return 'priced';
  if (providerId === 'requesty') {
    if (offer.supports_caching === true) return 'flagged';
    if (offer.supports_caching === false) return 'unsupported';
  }
  if (providerId === 'edenai' && offer.capabilities) {
    if (offer.capabilities.supports_prompt_caching === true) return 'flagged';
    if (offer.capabilities.supports_prompt_caching === false) return 'unsupported';
  }
  return 'unknown';
}

// Legacy single-value accessor (kept for modal/display call sites).
function getOfferCacheReadCost(providerId, offer, currency = selectedCurrency) {
  return getOfferCacheRates(providerId, offer, currency).read;
}

// Effective blended input rate for one offer under the current cache assumptions:
//   p_eff = base·(1−s) + (s/R)·[w + (R−1)·r]
// with w → base when no write rate is published and r → base when no usable read
// rate is published. At s = 0 (or with caching math disabled) this equals base.
function getOfferEffectiveInputCost(providerId, offer, currency = selectedCurrency) {
  const baseIn = getOfferInputCost(providerId, offer, currency);
  if (baseIn === null) return null;
  if (!cacheAwareCost || cachedInputShare <= 0) return baseIn;
  const share = Math.min(Math.max(cachedInputShare, 0), 1);
  const rounds = cacheReuseRounds >= 1 ? cacheReuseRounds : DEFAULT_CACHE_REUSE_ROUNDS;
  const { read, write } = getOfferCacheRates(providerId, offer, currency);
  const readRate = read !== null ? read : baseIn;
  const writeRate = write !== null ? write : baseIn;
  const amortizedCachedRate = Number.isFinite(rounds)
    ? (writeRate + (rounds - 1) * readRate) / rounds
    : readRate; // steady state: write premium fully amortized
  return baseIn * (1 - share) + share * amortizedCachedRate;
}

// Offers considered under the current visibility filter. With "only caching-capable
// providers" enabled, offers without caching support are excluded from every column.
function getActiveOffers(modelObj) {
  const entries = Object.entries(modelObj.offers);
  if (!onlyCachingProviders) return entries;
  return entries.filter(([providerKey, offer]) => {
    const providerId = providerKey === 'mistral-regional' ? 'mistral' : providerKey;
    const state = getOfferCacheSupport(providerId, offer);
    return state === 'priced' || state === 'flagged';
  });
}

function getInputCostPerMillion(modelObj, currency = selectedCurrency) {
  if (modelObj.baked && isDefaultBakedView()) {
    const v = currency === 'EUR' ? modelObj.baked.lowestInputEUR : modelObj.baked.lowestInputUSD;
    if (Number.isFinite(v)) return v;
  }
  const activeOffers = [];
  for (const [providerId, offer] of getActiveOffers(modelObj)) {
    const cost = getOfferInputCost(providerId, offer, currency);
    if (cost !== null) activeOffers.push(cost);
  }
  return activeOffers.length > 0 ? Math.min(...activeOffers) : null;
}

function getOutputCostPerMillion(modelObj, currency = selectedCurrency) {
  if (modelObj.baked && isDefaultBakedView()) {
    const v = currency === 'EUR' ? modelObj.baked.lowestOutputEUR : modelObj.baked.lowestOutputUSD;
    if (Number.isFinite(v)) return v;
  }
  const activeOffers = [];
  for (const [providerId, offer] of getActiveOffers(modelObj)) {
    const cost = getOfferOutputCost(providerId, offer, currency);
    if (cost !== null) activeOffers.push(cost);
  }
  return activeOffers.length > 0 ? Math.min(...activeOffers) : null;
}

// Total workload cost for the cheapest complete offer. Rates are never mixed across
// offers: input, output and cache rates of one provider are evaluated together.
function getBestWorkloadOffer(modelObj, currency = selectedCurrency) {
  let best = null;
  for (const [providerId, offer] of getActiveOffers(modelObj)) {
    const inEff = getOfferEffectiveInputCost(providerId, offer, currency);
    const outRate = getOfferOutputCost(providerId, offer, currency);
    if (inEff === null || outRate === null) continue;
    const total = (inEff * workloadInputTokens + outRate * workloadOutputTokens) / 1000000;
    if (best === null || total < best.total) {
      best = { providerId, offer, inEff, outRate, total };
    }
  }
  return best;
}

function getWorkloadCost(modelObj, currency = selectedCurrency) {
  const best = getBestWorkloadOffer(modelObj, currency);
  return best ? best.total : null;
}

function getBestProviderDetails(modelObj, currency = selectedCurrency) {
  const activeOffers = [];
  for (const [providerId, offer] of getActiveOffers(modelObj)) {
    // Same per-offer basis as the workload column so the "Lowest-Price Provider"
    // ranking stays consistent with the cost figure (cache-adjusted when enabled).
    const inCost = getOfferEffectiveInputCost(providerId, offer, currency);
    const outCost = getOfferOutputCost(providerId, offer, currency);
    if (inCost !== null && outCost !== null) {
      activeOffers.push({
        providerId,
        totalCost: inCost + outCost,
        inCost,
        outCost
      });
    }
  }
  
  if (activeOffers.length === 0) return null;
  
  activeOffers.sort((a, b) => a.totalCost - b.totalCost);
  
  const bestTotal = activeOffers[0].totalCost;
  const lowestOffers = activeOffers.filter(offer => areCostsEqual(offer.totalCost, bestTotal));

  return {
    providerIds: lowestOffers.map(offer => offer.providerId)
  };
}

// --- READABLE BENCHMARKS (models.deggo.fyi) HELPERS ---
function getQualityValue(m) {
  return m && m.deggo && Number.isFinite(m.deggo.qualityValue) ? m.deggo.qualityValue : null;
}
// EUR Value pipeline-baked: Quality (deggo) × affordabilityEU over cheapest EU blended (EuroInference heuristic, no browser calc)
// Stored in data.js as deggo.euValueEUR / euValueUSD for convenience (EuroInference's calculation, not deggo's); browser just reads per selectedCurrency.
function getValueScore(m) {
  if (!m || !m.deggo) return null;
  // EUR Value is EUR-anchored (cheapest EU blended in EUR). Both euValueEUR/USD are now identical (EUR-based),
  // so currency toggle must not affect the score — prefer EUR, fall back to USD for old data.js.
  if (Number.isFinite(m.deggo.euValueEUR)) return m.deggo.euValueEUR;
  if (Number.isFinite(m.deggo.euValueUSD)) return m.deggo.euValueUSD;
  if (Number.isFinite(m.deggo.priceValue)) return m.deggo.priceValue; // legacy fallback
  return null;
}
function getBlendedEUR(m) {
  if (!m || !m.deggo) return null;
  if (Number.isFinite(m.deggo.blendedEUR)) return m.deggo.blendedEUR;
  if (Number.isFinite(m.deggo.blendedPrice)) return m.deggo.blendedPrice;
  return null;
}
function getBlendedForCurrency(m) {
  const eur = getBlendedEUR(m);
  if (eur === null) return null;
  return selectedCurrency === 'USD' ? eur * exchangeRate : eur;
}
function formatScore(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '?';
  if (v >= 10) return v.toFixed(1);
  return v.toFixed(1);
}

// --- FILTER & SORT LOGIC ---

function renderCreatorsFilter() {
  const select = document.getElementById('filter-creator');
  if (!select) return;
  
  const creators = [...new Set(unifiedModels.map(m => m.creator))].sort();
  
  select.innerHTML = '<option value="all">All Creators</option>' + 
    creators.map(creator => `<option value="${creator}">${creator}</option>`).join('');
}

function costToSliderValue(cost, scaleMax) {
  if (cost <= 0) return 0;
  if (scaleMax <= COST_LOG_MIN) return COST_SLIDER_STEPS;
  const logRange = Math.log(scaleMax) - Math.log(COST_LOG_MIN);
  return Math.round(((Math.log(cost) - Math.log(COST_LOG_MIN)) / logRange) * COST_SLIDER_STEPS);
}

function sliderToCost(value, scaleMax) {
  if (value <= 0) return 0;
  if (scaleMax <= COST_LOG_MIN) return scaleMax;
  const logRange = Math.log(scaleMax) - Math.log(COST_LOG_MIN);
  return Math.exp(Math.log(COST_LOG_MIN) + (value / COST_SLIDER_STEPS) * logRange);
}

function updateCostFilterDisplay(key) {
  const range = costFilterRanges[key];
  const minInput = document.getElementById(`${key}-cost-min`);
  const maxInput = document.getElementById(`${key}-cost-max`);
  const minLabel = document.getElementById(`${key}-cost-min-label`);
  const maxLabel = document.getElementById(`${key}-cost-max-label`);
  const fill = document.getElementById(`${key}-cost-range-fill`);
  if (!minInput || !maxInput || !minLabel || !maxLabel || !fill) return;

  const minSliderValue = costToSliderValue(range.min, range.scaleMax);
  const maxSliderValue = costToSliderValue(range.max, range.scaleMax);
  minInput.value = minSliderValue;
  maxInput.value = maxSliderValue;
  minLabel.textContent = `From ${formatCurrency(range.min)}`;
  maxLabel.textContent = `To ${formatCurrency(range.max)}`;

  fill.style.left = `${(minSliderValue / COST_SLIDER_STEPS) * 100}%`;
  fill.style.right = `${100 - (maxSliderValue / COST_SLIDER_STEPS) * 100}%`;
}

function configureCostFilters() {
  const filters = [
    { key: 'input', getter: getInputCostPerMillion },
    { key: 'output', getter: getOutputCostPerMillion }
  ];
  filters.forEach(({ key, getter }) => {
    const minInput = document.getElementById(`${key}-cost-min`);
    const maxInput = document.getElementById(`${key}-cost-max`);
    if (!minInput || !maxInput) return;
    const prev = costFilterRanges[key];
    let scaleMax;
    // On currency switch, avoid scanning all models – just convert previous scale via exchangeRate
    if (_currencySwitchPending && Number.isFinite(prev.scaleMax) && prev.scaleMax > 0 && prev.scaleMax !== Infinity) {
      const toUSD = _lastCurrency === 'EUR' && selectedCurrency === 'USD';
      const toEUR = _lastCurrency === 'USD' && selectedCurrency === 'EUR';
      const factor = toUSD ? exchangeRate : toEUR ? 1 / exchangeRate : 1;
      scaleMax = Math.max(prev.scaleMax * factor, COST_LOG_MIN);
      const ratio = factor;
      minInput.max = COST_SLIDER_STEPS;
      maxInput.max = COST_SLIDER_STEPS;
      minInput.step = 1;
      maxInput.step = 1;
      costFilterRanges[key] = { min: prev.min * ratio, max: prev.max * ratio, scaleMax };
      updateCostFilterDisplay(key);
      return;
    }
    const needsRecalc = !Number.isFinite(prev.scaleMax) || prev.scaleMax === Infinity;
    if (needsRecalc) {
      const largestCost = unifiedModels.reduce((max, model) => {
        const cost = getter(model);
        return typeof cost === 'number' ? Math.max(max, cost) : max;
      }, 0);
      scaleMax = Math.max(largestCost, COST_LOG_MIN);
    } else {
      scaleMax = prev.scaleMax;
    }
    minInput.max = COST_SLIDER_STEPS;
    maxInput.max = COST_SLIDER_STEPS;
    minInput.step = 1;
    maxInput.step = 1;
    costFilterRanges[key] = { min: 0, max: scaleMax, scaleMax };
    updateCostFilterDisplay(key);
  });
}

function getContextRange(modelObj) {
  const offerIds = getActiveOffers(modelObj).map(([providerId]) => providerId);
  const selectedOfferIds = selectedProvider.length === 0
    ? offerIds
    : offerIds.filter(providerId => selectedProvider.includes(providerId) || (selectedProvider.includes('matched') && modelObj.matched));
  const contextValues = selectedOfferIds
    .map(providerId => modelObj.normalizedOffers[providerId]?.contextSize)
    .filter(value => typeof value === 'number' && value > 0);

  if (contextValues.length === 0) return { min: null, max: null, count: 0 };
  return {
    min: Math.min(...contextValues),
    max: Math.max(...contextValues),
    count: contextValues.length
  };
}

function getDedupeFamilyKey(model) {
  if (!model || !model.id) return String(model.id || '');
  // Variant-aware: use clean id without version so flash/turbo/vision etc stay separate families
  // e.g. deepseek-v4-flash-vision-exp → deepseek-v-flash-vision-exp, glm-5.3 → glm, glm-5.3-flash → glm-flash
  // Do not use modelsDev.family (too coarse: lumps r1/v4-pro/reasoner as deepseek-thinking)
  let clean = getCleanModelId(model.id || '');
  clean = clean.replace(/-?\d+(?:\.\d+)?/g, '');
  clean = clean.replace(/--+/g, '-').replace(/^-|-$/g, '');
  return clean.toLowerCase() || String(model.id).toLowerCase();
}
function extractVersionForDedupe(id) {
  const m = String(id || '').match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : 0;
}
function getDateCutoff() {
  if (dateFilter === 'all') return null;
  const now = new Date();
  if (dateFilter === '6m') { const d = new Date(now); d.setMonth(d.getMonth() - 6); return d; }
  if (dateFilter === '12m') { const d = new Date(now); d.setMonth(d.getMonth() - 12); return d; }
  if (dateFilter === '18m') { const d = new Date(now); d.setMonth(d.getMonth() - 18); return d; }
  if (dateFilter === '24m') { const d = new Date(now); d.setMonth(d.getMonth() - 24); return d; }
  return null;
}
function isDefaultBakedView() {
  return selectedProvider.length === 0 && !onlyCachingProviders && workloadInputTokens === 50000 && workloadOutputTokens === 5000 && cacheAwareCost === true && Math.abs(cachedInputShare - 0.8) < 1e-9 && cacheReuseRounds === 8;
}

let _renderId = 0;
let _renderRaf = null;
let _renderTimeout = null;
function applyFiltersAndRender() {
  if (document.hidden) { _deferredRender = true; return; }
  _deferredRender = false;
  const myId = ++_renderId;
  if (_renderRaf) cancelAnimationFrame(_renderRaf);
  if (_renderTimeout) { clearTimeout(_renderTimeout); _renderTimeout = null; }
  // Precompute per-model derived values once (friendly name, costs, context) to avoid N× repeated getters
  const qLower = searchQuery ? searchQuery.toLowerCase() : '';
  const inputRange = costFilterRanges.input;
  const outputRange = costFilterRanges.output;
  const computed = new Map(); // model -> {inputCost, outputCost, workloadCost, friendly, friendlyLower, ctx, quality, value}
  for (const m of unifiedModels) {
    const friendly = getHumanFriendlyName(m.id || '');
    computed.set(m, {
      friendly,
      friendlyLower: friendly.toLowerCase(),
      inputCost: getInputCostPerMillion(m),
      outputCost: getOutputCostPerMillion(m),
      workloadCost: getWorkloadCost(m),
      ctx: getContextRange(m),
      quality: getQualityValue(m),
      value: getValueScore(m)
    });
  }
  const dateCutoff = getDateCutoff();
  let filtered = unifiedModels.filter(m => {
    const c = computed.get(m);
    if (qLower) {
      if (!m.id.toLowerCase().includes(qLower) && !c.friendlyLower.includes(qLower)) return false;
    }
    if (selectedProvider.length > 0) {
      let showRow = false;
      for (const sel of selectedProvider) {
        if (sel === 'matched' && m.matched) { showRow = true; break; }
        if (m.offers[sel]) { showRow = true; break; }
      }
      if (!showRow) return false;
    }
    if (selectedCreator !== 'all' && m.creator !== selectedCreator) return false;
    if (dateCutoff) {
      const _rel = m.modelsDev && m.modelsDev.release_date ? new Date(m.modelsDev.release_date) : null;
      const hasDate = _rel && !isNaN(_rel.getTime());
      if (!hasDate) {
        if (hideUnknownDates) return false;
      } else if (_rel < dateCutoff) return false;
    }
    if (minContextSize > 0) {
      if (c.ctx.min && c.ctx.min < minContextSize) return false;
    }
    if (c.inputCost === null || c.outputCost === null) return false;
    if (c.inputCost < inputRange.min || c.inputCost > inputRange.max) return false;
    if (c.outputCost < outputRange.min || c.outputCost > outputRange.max) return false;
    return true;
  });

  // Variant-aware dedupe: latest 2 distinct core versions per family (first-paint), bypass when searching
  if (dedupeLatestTwo && !qLower) {
    const byFamily = new Map();
    for (const m of filtered) {
      const key = getDedupeFamilyKey(m);
      if (!byFamily.has(key)) byFamily.set(key, []);
      byFamily.get(key).push(m);
    }
    const deduped = [];
    for (const [, list] of byFamily) {
      // Sort family by release_date desc, then quality desc, then version desc to pick latest 2
      list.sort((a, b) => {
        const aTime = a.modelsDev && a.modelsDev.release_date ? Date.parse(a.modelsDev.release_date) : 0;
        const bTime = b.modelsDev && b.modelsDev.release_date ? Date.parse(b.modelsDev.release_date) : 0;
        if (aTime !== bTime) return bTime - aTime;
        const aQ = getQualityValue(a); const bQ = getQualityValue(b);
        const av = aQ !== null ? aQ : -Infinity; const bv = bQ !== null ? bQ : -Infinity;
        if (av !== bv) return bv - av;
        return extractVersionForDedupe(b.id) - extractVersionForDedupe(a.id);
      });
      // Keep latest 2 per variant-family (release_date desc already)
      for (let i = 0; i < Math.min(2, list.length); i++) deduped.push(list[i]);
    }
    filtered = deduped;
  }

  filtered.sort((a, b) => {
    const ca = computed.get(a), cb = computed.get(b);
    let valA, valB;
    switch (currentSortColumn) {
      case 'id': valA = ca.friendly; valB = cb.friendly; break;
      case 'creator': valA = a.creator; valB = b.creator; break;
      case 'quality': valA = ca.quality !== null ? ca.quality : -Infinity; valB = cb.quality !== null ? cb.quality : -Infinity; break;
      case 'value': valA = ca.value !== null ? ca.value : -Infinity; valB = cb.value !== null ? cb.value : -Infinity; break;
      case 'context': valA = (ca.ctx || getContextRange(a)).min || 0; valB = (cb.ctx || getContextRange(b)).min || 0; break;
      case 'input': valA = ca.inputCost ?? Infinity; valB = cb.inputCost ?? Infinity; break;
      case 'output': valA = ca.outputCost ?? Infinity; valB = cb.outputCost ?? Infinity; break;
      case 'workload': valA = ca.workloadCost || Infinity; valB = cb.workloadCost || Infinity; break;
      default: valA = a.id; valB = b.id;
    }
    if (typeof valA === 'string') {
      const cmp = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
      if (cmp !== 0) return currentSortDirection === 'asc' ? cmp : -cmp;
      const idCmp = String(a.id || '').localeCompare(String(b.id || ''), undefined, { sensitivity: 'base' });
      return currentSortDirection === 'asc' ? idCmp : -idCmp;
    }
    return currentSortDirection === 'asc' ? valA - valB : valB - valA;
  });

  const countDisplay = document.getElementById('model-count-display');
  if (countDisplay) countDisplay.textContent = `${filtered.length}/${unifiedModels.length} shown`;
  const totalDisplay = document.getElementById('model-total-display');
  if (totalDisplay) totalDisplay.textContent = unifiedModels.length;

  // Chunked render: first paint quickly, rest in rAF batches to keep UI responsive on currency switch
  renderTableChunked(filtered, computed, myId);
}

// --- PROMPT CACHING CONTROLS ---

function buildCacheExplainerHtml() {
  const sharePct = Math.round(cachedInputShare * 100);
  const reuseLabel = Number.isFinite(cacheReuseRounds) ? `${cacheReuseRounds}` : '∞ (steady state)';
  return `
    <p><code>${CACHE_FORMULA_TEXT}</code></p>
    <ul>
      <li><strong>base</strong> — listed input price per 1M tokens</li>
      <li><strong>s</strong> — assumed share of input tokens served from cache (current: ${sharePct}%)</li>
      <li><strong>R</strong> — average times each cached context is re-read (current: ${reuseLabel})</li>
      <li><strong>r / w</strong> — published cache-read / cache-write rate per 1M tokens</li>
    </ul>
    <p>Fallback rules:</p>
    <ul>
      ${CACHE_FORMULA_RULES.map(rule => `<li>${rule}</li>`).join('')}
    </ul>
    <p>Full details, provider field mapping and calibration: <a href="methodology.html" target="_blank" rel="noopener">Cost &amp; Caching Methodology</a>.</p>
  `;
}

function updateCacheControls() {
  // Cost column header toggle + "(cache-adjusted)" suffix
  const suffix = document.getElementById('cost-header-suffix');
  if (suffix) suffix.hidden = !cacheAwareCost;

  // Share preset chips
  document.querySelectorAll('.cache-chip').forEach(chip => {
    const chipShare = parseFloat(chip.dataset.share);
    const isActive = Number.isFinite(chipShare) && Math.abs(chipShare - cachedInputShare) < 1e-9;
    chip.classList.toggle('active', isActive);
    chip.setAttribute('aria-pressed', String(isActive));
    chip.disabled = !cacheAwareCost;
  });

  // Reuse rounds select
  const reuseSelect = document.getElementById('filter-cache-reuse');
  if (reuseSelect) {
    reuseSelect.disabled = !cacheAwareCost || cachedInputShare <= 0;
  }

  // Live explainer content
  const explainer = document.getElementById('cache-math-explainer');
  if (explainer) {
    explainer.innerHTML = buildCacheExplainerHtml();
  }
}

// --- RENDER FUNCTIONS ---

function formatCurrency(val, currency = selectedCurrency) {
  const sym = currency === 'USD' ? '$' : '€';
  if (val === null || val === undefined || Number.isNaN(val)) return 'N/A';
  if (val === 0) return `${sym}0.00`;
  if (val < 0.01) return `${sym}${val.toFixed(4)}`;
  return `${sym}${_numberFmt.format(val)}`;
}

function buildRowHtml(m, precomputed) {
  const inputCost = precomputed ? precomputed.inputCost : getInputCostPerMillion(m);
  const outputCost = precomputed ? precomputed.outputCost : getOutputCostPerMillion(m);
  const workloadCost = precomputed ? precomputed.workloadCost : getWorkloadCost(m);
  const contextRange = precomputed && precomputed.ctx ? precomputed.ctx : getContextRange(m);
  let contextStr = '<span style="color: var(--text-dark);">Unknown</span>';
  if (contextRange.min) {
    if (contextRange.max !== null && contextRange.min < contextRange.max) {
      const tooltip = `Minimum Context Window: ${_intFmt.format(contextRange.min)} tokens\n(Range across ${contextRange.count} providers: ${_intFmt.format(contextRange.min)} – ${_intFmt.format(contextRange.max)} tokens)`;
      contextStr = `<span title="${tooltip}" style="cursor: help; border-bottom: 1px dotted;">${_intFmt.format(contextRange.min)}</span>`;
    } else {
      contextStr = _intFmt.format(contextRange.min);
    }
  }
  // Merge "Providers": sorted by workload cost (cache-adjusted), cheapest first + highlighted — baked fast path for default view
  let allOfferCosts;
  if (m.baked && isDefaultBakedView() && Array.isArray(m.baked.providerWorkloads) && m.baked.providerWorkloads.length) {
    allOfferCosts = m.baked.providerWorkloads.map(x => ({
      pid: x.pid,
      name: PROVIDER_DISPLAY_NAMES[x.pid] || x.pid,
      total: selectedCurrency === 'EUR' ? x.wlEUR : x.wlUSD
    }));
  } else {
    allOfferCosts = getActiveOffers(m)
      .map(([pid, offer]) => {
        const ic = getOfferEffectiveInputCost(pid, offer);
        const oc = getOfferOutputCost(pid, offer);
        if (ic === null || oc === null) return null;
        return { pid, name: PROVIDER_DISPLAY_NAMES[pid] || pid, total: (ic * workloadInputTokens + oc * workloadOutputTokens) / 1000000 };
      })
      .filter(Boolean)
      .sort((a, b) => a.total - b.total);
  }
  const bestTotal = allOfferCosts.length ? allOfferCosts[0].total : null;
  let mergedProvidersHtml = '<span style="color: var(--text-dark);">N/A</span>';
  if (allOfferCosts.length > 0) {
    const tooltipLines = allOfferCosts.map(o => {
      if (!areCostsEqual(o.total, bestTotal)) {
        const pct = Math.round((o.total / bestTotal - 1) * 100);
        return `${o.name} +${pct}% compared to cheapest`;
      }
      return `${o.name} (lowest)`;
    });
    const containerTitle = tooltipLines.length > 1 ? ` title="Sorted by cost (cheapest first):\n${tooltipLines.join('\n')}"` : '';
    mergedProvidersHtml = `<div style="display:flex; flex-wrap:wrap; gap:4px; cursor:help;"${containerTitle}>` + allOfferCosts.map(o => {
      const isBest = areCostsEqual(o.total, bestTotal);
      const pct = Math.round((o.total / bestTotal - 1) * 100);
      const title = isBest ? 'Lowest-price provider' : `+${pct}% compared to cheapest`;
      const extraCls = isBest ? ' badge-cheapest' : '';
      const star = isBest ? '<span class="cheapest-star">★</span> ' : '';
      return `<span class="badge ${PROVIDER_BADGE_CLASS}${extraCls}" style="margin-right:0; font-size:0.7rem;" title="${title}">${star}${escapeHtml(o.name)}</span>`;
    }).join('') + `</div>`;
  }
  const workloadFmt = workloadCost === null ? 'N/A' : formatCurrency(workloadCost);
  const cacheActive = cacheAwareCost && cachedInputShare > 0;
  const reuseLabel = Number.isFinite(cacheReuseRounds) ? `${cacheReuseRounds}×` : 'steady state';
  let workloadTooltip;
  if (workloadCost === null) {
    workloadTooltip = 'Pricing unavailable';
  } else if (cacheActive) {
    const bestOffer = getBestWorkloadOffer(m);
    workloadTooltip =
      `Cache-adjusted via ${CACHE_FORMULA_TEXT}\n` +
      `Winning offer: ${formatCurrency(bestOffer.inEff)} eff. input (${Math.round(cachedInputShare * 100)}% cached, ${reuseLabel}) + ${formatCurrency(bestOffer.outRate)} output per 1M\n` +
      `(${_intFmt.format(workloadInputTokens)} in + ${_intFmt.format(workloadOutputTokens)} out) ÷ 1,000,000`;
  } else {
    workloadTooltip =
      `Lowest-priced offer: ${formatCurrency(inputCost)} input + ${formatCurrency(outputCost)} output per 1M\n` +
      `(${_intFmt.format(workloadInputTokens)} in + ${_intFmt.format(workloadOutputTokens)} out) × rate ÷ 1,000,000`;
  }
  const workloadHtml = `<span title="${workloadTooltip}" style="cursor: help; border-bottom: 1px dotted;">${workloadFmt}</span>`;
  const qScore = precomputed ? precomputed.quality : getQualityValue(m);
  const vScore = precomputed ? precomputed.value : getValueScore(m);
  const qTitle = qScore === null ? 'No quality score for this model yet' : `Quality Score ${qScore.toFixed(1)} — deggo Quality v4, via models.deggo.fyi`;
  const vTitle = vScore === null ? 'No value score for this model yet (needs Quality + cheapest EU blended price)' : `EUR Value Score ${vScore.toFixed(1)} — Quality × affordabilityEU (cheapest EU offer's (in+out)/2, same offer) — affordability = 1/(1+log10(1+blended*8)*0.45)`;
  const qualityHtml = qScore === null
    ? `<span style="color:var(--text-dark);" title="${qTitle}">?</span>`
    : `<span style="cursor:help;" title="${escapeHtml(qTitle)}">${_numberFmt.format(qScore)}</span>`;
  const valueHtml = vScore === null
    ? `<span style="color:var(--text-dark);" title="${vTitle}">?</span>`
    : `<span style="cursor:help;" title="${escapeHtml(vTitle)}">${_numberFmt.format(vScore)}</span>`;
  const friendly = precomputed ? precomputed.friendly : getHumanFriendlyName(m.id);
  return `
      <tr class="clickable-row" onclick="openComparison('${m.id}')" title="Click to view details and provider comparison">
        <td><div class="model-name">${friendly}</div></td>
        <td><span style="font-weight: 500; font-size: 0.85rem;">${m.creator}</span></td>
        <td style="font-family:var(--font-mono); text-align:center;">${valueHtml}</td>
        <td style="font-family:var(--font-mono); text-align:center;">${qualityHtml}</td>
        <td style="font-family: var(--font-mono);">${contextStr}</td>
        <td style="font-family: var(--font-mono);">${formatCurrency(inputCost)}</td>
        <td style="font-family: var(--font-mono);">${formatCurrency(outputCost)}</td>
        <td style="font-family: var(--font-mono);">${workloadHtml}</td>
        <td>${mergedProvidersHtml}</td>
      </tr>
    `;
}

function renderTable(models) {
  const tbody = document.getElementById('models-table-body');
  if (!tbody) return;
  if (models.length === 0) {
    const isInitialLoad = (typeof unifiedModels === 'undefined' || unifiedModels.length === 0);
    if (isInitialLoad) return;
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><p>No models match your filter criteria.</p></div></td></tr>`;
    return;
  }
  tbody.innerHTML = models.map(m => buildRowHtml(m, null)).join('');
}

function renderTableChunked(models, computed, renderId) {
  const tbody = document.getElementById('models-table-body');
  if (!tbody) return;
  if (window._tableObserver) { try { window._tableObserver.disconnect(); } catch {} window._tableObserver = null; }
  if (_renderRaf) { cancelAnimationFrame(_renderRaf); _renderRaf = null; }
  if (_renderTimeout) { clearTimeout(_renderTimeout); _renderTimeout = null; }
  if (models.length === 0) {
    const isInitialLoad = (typeof unifiedModels === 'undefined' || unifiedModels.length === 0);
    if (isInitialLoad) return;
    tbody.innerHTML = `<tr><td colspan="9"><div class="empty-state"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg><p>No models match your filter criteria.</p></div></td></tr>`;
    return;
  }
  const PAGE = 80;
  let idx = 0;
  const firstEnd = Math.min(PAGE, models.length);
  let html = '';
  for (let i = 0; i < firstEnd; i++) html += buildRowHtml(models[i], computed.get(models[i]));
  if (firstEnd < models.length) {
    html += `<tr id="table-sentinel"><td colspan="9" style="text-align:center; padding:12px; color:var(--text-muted); font-size:0.8rem;">Showing ${firstEnd} of ${models.length} — scroll to load more</td></tr>`;
  }
  tbody.innerHTML = html;
  idx = firstEnd;
  if (idx >= models.length) {
    window._loadAllTableRows = null;
    return;
  }
  // For END / disclaimer: load all remaining rows so anchor jump reaches footer
  window._loadAllTableRows = () => {
    if (renderId !== _renderId) return;
    if (window._tableObserver) { try { window._tableObserver.disconnect(); } catch {} window._tableObserver = null; }
    const s = document.getElementById('table-sentinel');
    if (s) s.remove();
    if (idx >= models.length) return;
    let allHtml = '';
    for (let i = idx; i < models.length; i++) allHtml += buildRowHtml(models[i], computed.get(models[i]));
    tbody.insertAdjacentHTML('beforeend', allHtml);
    idx = models.length;
  };
  const observer = new IntersectionObserver(entries => {
    if (!entries[0] || !entries[0].isIntersecting) return;
    if (renderId !== _renderId) { observer.disconnect(); return; }
    if (document.hidden) return;
    observer.disconnect();
    const start = performance.now();
    const nextEnd = Math.min(idx + 60, models.length);
    let chunkHtml = '';
    for (let i = idx; i < nextEnd; i++) chunkHtml += buildRowHtml(models[i], computed.get(models[i]));
    idx = nextEnd;
    const sentinel = document.getElementById('table-sentinel');
    if (sentinel) sentinel.remove();
    tbody.insertAdjacentHTML('beforeend', chunkHtml);
    if (idx < models.length) {
      tbody.insertAdjacentHTML('beforeend', `<tr id="table-sentinel"><td colspan="8" style="text-align:center; padding:12px; color:var(--text-muted); font-size:0.8rem;">Showing ${idx} of ${models.length} — scroll to load more</td></tr>`);
      const newSentinel = document.getElementById('table-sentinel');
      if (newSentinel) {
        // yield to layout before re-observing
        const elapsed = performance.now() - start;
        if (elapsed > 8) setTimeout(() => observer.observe(newSentinel), 0);
        else observer.observe(newSentinel);
      }
      window._tableObserver = observer;
    }
  }, { root: null, rootMargin: '800px', threshold: 0 });
  window._tableObserver = observer;
  const sentinel = document.getElementById('table-sentinel');
  if (sentinel) observer.observe(sentinel);
}

// --- MODAL POPUP SPLIT DETAILS ---

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// For display: drop region-pin routing suffixes (e.g. bedrock/claude-sonnet-4@eu-north-1 -> bedrock/claude-sonnet-4).
// Region pins only affect which region the provider routes the call to; the base id is what matters for comparison.
function displayModelId(rawId) {
  return rawId ? String(rawId).replace(/@[a-z0-9_-]+$/i, '') : '';
}

window.openComparison = function(modelId) {
  const model = unifiedModels.find(m => m.id === modelId);
  if (!model) return;

  openModalWithSelection(model);
};

// Native-unit strings for published cache rates displayed in the detail modal.
function getNativeCacheStrings(providerId, rawOffer) {
  const out = { read: '', write: '' };
  if (!rawOffer) return out;
  if (providerId === 'cortecs') {
    if (positiveRate(rawOffer.pricing?.cache_read_cost) !== null) out.read = `€${rawOffer.pricing.cache_read_cost.toFixed(2)} EUR`;
    if (positiveRate(rawOffer.pricing?.cache_write_cost) !== null) out.write = `€${rawOffer.pricing.cache_write_cost.toFixed(2)} EUR`;
  } else if (providerId === 'mistral') {
    if (positiveRate(rawOffer.pricing?.cached_input_token) !== null) out.read = `$${rawOffer.pricing.cached_input_token.toFixed(2)} USD`;
  } else if (providerId === 'edenai') {
    if (positiveRate(rawOffer.pricing?.cache_read_input_token_cost) !== null) out.read = `$${(rawOffer.pricing.cache_read_input_token_cost * 1000000).toFixed(4)} USD`;
    else if (positiveRate(rawOffer.pricing?.input_cost_per_token_cache_hit) !== null) out.read = `$${(rawOffer.pricing.input_cost_per_token_cache_hit * 1000000).toFixed(4)} USD`;
    if (positiveRate(rawOffer.pricing?.cache_creation_input_token_cost) !== null) out.write = `$${(rawOffer.pricing.cache_creation_input_token_cost * 1000000).toFixed(4)} USD`;
  } else if (providerId === 'opper') {
    const r = Array.isArray(rawOffer.pricing?.cached_input) ? positiveRate(rawOffer.pricing.cached_input[0]) : null;
    const w = Array.isArray(rawOffer.pricing?.cache_creation) ? positiveRate(rawOffer.pricing.cache_creation[0]) : null;
    if (r !== null) out.read = `$${r.toFixed(2)} USD`;
    if (w !== null) out.write = `$${w.toFixed(2)} USD`;
  } else if (providerId === 'eurouter') {
    const cur = rawOffer.pricing?.currency || 'EUR';
    const sym = cur === 'USD' ? '$' : '€';
    const rr = parseFloat(rawOffer.pricing?.input_cache_read);
    const rw = parseFloat(rawOffer.pricing?.input_cache_write);
    if (Number.isFinite(rr) && rr > 0) out.read = `${sym}${(rr * 1000000).toFixed(2)} ${cur}`;
    if (Number.isFinite(rw) && rw > 0) out.write = `${sym}${(rw * 1000000).toFixed(2)} ${cur}`;
  } else if (providerId === 'requesty') {
    if (positiveRate(rawOffer.cached_price) !== null) out.read = `$${(rawOffer.cached_price * 1000000).toFixed(2)} USD`;
    if (positiveRate(rawOffer.caching_price) !== null) out.write = `$${(rawOffer.caching_price * 1000000).toFixed(2)} USD`;
  } else if (providerId === 'openrouter') {
    if (positiveRate(rawOffer.pricing?.input_cache_read) !== null) out.read = `$${(rawOffer.pricing.input_cache_read * 1000000).toFixed(4)} USD`;
  }
  return out;
}

// Shared per-offer computation for detail-modal cards (EU providers and the
// non-EU reference offer alike). `normOffer` comes from the precomputed
// normalizedOffers when available, otherwise it is derived on the fly.
// `sovereignty` is precomputed at generation time (see unify.js).
function buildModalOffer(providerId, rawOffer, normOffer, sovereignty) {
  const pricingProviderId = providerId === 'mistral-regional' ? 'mistral' : providerId;
  const inCost = getOfferInputCost(pricingProviderId, rawOffer, selectedCurrency);
  const outCost = getOfferOutputCost(pricingProviderId, rawOffer, selectedCurrency);
  const cacheRates = getOfferCacheRates(pricingProviderId, rawOffer, selectedCurrency);
  const cacheSupportState = getOfferCacheSupport(pricingProviderId, rawOffer);
  const nativeCache = getNativeCacheStrings(pricingProviderId, rawOffer);

  let origIn = '', origOut = '';
  if (providerId === 'mammouth' && rawOffer && rawOffer.model_info) {
    if (typeof rawOffer.model_info.input_cost_per_token === 'number') {
      origIn = `$${(rawOffer.model_info.input_cost_per_token * 1000000).toFixed(2)} USD`;
    }
    if (typeof rawOffer.model_info.output_cost_per_token === 'number') {
      origOut = `$${(rawOffer.model_info.output_cost_per_token * 1000000).toFixed(2)} USD`;
    }
  } else if (providerId === 'cortecs' && rawOffer && rawOffer.pricing) {
    if (typeof rawOffer.pricing.input_token === 'number') {
      origIn = `€${rawOffer.pricing.input_token.toFixed(2)} EUR`;
    }
    if (typeof rawOffer.pricing.output_token === 'number') {
      origOut = `€${rawOffer.pricing.output_token.toFixed(2)} EUR`;
    }
  } else if (pricingProviderId === 'mistral' && rawOffer && rawOffer.pricing) {
    if (typeof rawOffer.pricing.input_token === 'number') {
      origIn = `$${rawOffer.pricing.input_token.toFixed(2)} USD`;
    }
    if (typeof rawOffer.pricing.output_token === 'number') {
      origOut = `$${rawOffer.pricing.output_token.toFixed(2)} USD`;
    }
  } else if (providerId === 'edenai' && rawOffer && rawOffer.pricing) {
    if (typeof rawOffer.pricing.input_cost_per_token === 'number') {
      origIn = `$${(rawOffer.pricing.input_cost_per_token * 1000000).toFixed(2)} USD`;
    }
    if (typeof rawOffer.pricing.output_cost_per_token === 'number') {
      origOut = `$${(rawOffer.pricing.output_cost_per_token * 1000000).toFixed(2)} USD`;
    }
  } else if (providerId === 'opper' && rawOffer && rawOffer.pricing) {
    const inVal = Array.isArray(rawOffer.pricing.input) ? rawOffer.pricing.input[0] : rawOffer.pricing.input;
    const outVal = Array.isArray(rawOffer.pricing.output) ? rawOffer.pricing.output[0] : rawOffer.pricing.output;
    if (typeof inVal === 'number') origIn = `$${inVal.toFixed(2)} USD`;
    if (typeof outVal === 'number') origOut = `$${outVal.toFixed(2)} USD`;
  } else if (providerId === 'eurouter' && rawOffer && rawOffer.pricing) {
    const origCur = rawOffer.pricing.currency || 'EUR';
    const sym = origCur === 'USD' ? '$' : '€';
    if (rawOffer.pricing.prompt !== undefined && rawOffer.pricing.prompt !== null && !isNaN(parseFloat(rawOffer.pricing.prompt))) {
      origIn = `${sym}${(parseFloat(rawOffer.pricing.prompt) * 1000000).toFixed(2)} ${origCur}`;
    }
    if (rawOffer.pricing.completion !== undefined && rawOffer.pricing.completion !== null && !isNaN(parseFloat(rawOffer.pricing.completion))) {
      origOut = `${sym}${(parseFloat(rawOffer.pricing.completion) * 1000000).toFixed(2)} ${origCur}`;
    }
  } else if (providerId === 'requesty' && rawOffer) {
    if (typeof rawOffer.input_price === 'number') {
      origIn = `$${(rawOffer.input_price * 1000000).toFixed(2)} USD`;
    }
    if (typeof rawOffer.output_price === 'number') {
      origOut = `$${(rawOffer.output_price * 1000000).toFixed(2)} USD`;
    }
  } else if (providerId === 'openrouter' && rawOffer && rawOffer.pricing) {
    if (typeof rawOffer.pricing.prompt === 'number') {
      origIn = `$${(rawOffer.pricing.prompt * 1000000).toFixed(2)} USD`;
    }
    if (typeof rawOffer.pricing.completion === 'number') {
      origOut = `$${(rawOffer.pricing.completion * 1000000).toFixed(2)} USD`;
    }
  }

  const effInCost = getOfferEffectiveInputCost(pricingProviderId, rawOffer, selectedCurrency);
  const workloadCost = effInCost !== null && outCost !== null
    ? (effInCost * workloadInputTokens + outCost * workloadOutputTokens) / 1000000
    : null;
  return {
    providerId,
    providerName: normOffer.providerName,
    inCost,
    outCost,
    effInCost,
    workloadCost,
    cacheRates,
    cacheSupportState,
    nativeCache,
    totalCost: workloadCost !== null ? workloadCost : (inCost !== null && outCost !== null ? inCost + outCost : Infinity),
    origIn,
    origOut,
    normOffer,
    offer: rawOffer,
    sovereignty
  };
}

function openModalWithSelection(modelObj) {
  const overlay = document.getElementById('detail-overlay');
  const modalContent = document.querySelector('.modal-content');

  if (!overlay || !modalContent) return;

  {
    const mdTitleName = (modelObj.modelsDev && modelObj.modelsDev.name) || getHumanFriendlyName(modelObj.id);
    // Use the pretty creator/lab name (modelObj.creator is already via CREATOR_NAMES), not the raw models.dev lab slug.
    const mdTitleLab = modelObj.creator || (modelObj.modelsDev && modelObj.modelsDev.lab) || '';
    document.getElementById('modal-title-text').textContent = mdTitleLab ? `${mdTitleName} (${mdTitleLab})` : mdTitleName;
  }

  const offersList = [];
  // Respect the caching visibility filter so the modal matches the table's offers.
  for (const [providerId, rawOffer] of getActiveOffers(modelObj)) {
    const normOffer = (modelObj.normalizedOffers && modelObj.normalizedOffers[providerId]) || EuroUnify.normalizeOffer(providerId, rawOffer);
    const sovereignty = (modelObj.sovereigntyByProvider || {})[providerId] || {};
    offersList.push(buildModalOffer(providerId, rawOffer, normOffer, sovereignty));
  }

  // Non-EU reference offer (OpenRouter), shown greyed out below the EU cards.
  let benchmarkOfferEntry = null;
  if (modelObj.benchmarkOffer) {
    benchmarkOfferEntry = buildModalOffer(
      BENCHMARK_PROVIDER_ID,
      modelObj.benchmarkOffer,
      EuroUnify.normalizeOffer(BENCHMARK_PROVIDER_ID, modelObj.benchmarkOffer),
      modelObj.benchmarkSovereignty || {}
    );
  }

  offersList.sort((a, b) => a.totalCost - b.totalCost);
  const cheapestModalTotal = offersList.length && offersList[0].totalCost !== Infinity ? offersList[0].totalCost : null;

  // 1. Overview Section: Description + Consensus Guarantee Bar (+ models.dev enrichment)
  // Description comes from models.dev when available — render it inside the models.dev container.
  const dev = modelObj.modelsDev || null;
  const rawDesc = (dev && dev.description) || modelObj.description || '';
  const descStandaloneHtml = rawDesc ? `<div class="modal-model-desc">${escapeHtml(rawDesc)}</div>` : '';
  const descInsideHtml = rawDesc ? `<div class="modal-model-desc" style="grid-column:1/-1; margin-bottom:2px;">${escapeHtml(rawDesc)}</div>` : '';
  const devHtml = dev ? `
      <div class="modal-modelsdev" style="margin-top:10px; padding:10px; background:rgba(255,204,0,0.035); border:1px solid rgba(255,204,0,0.13); border-radius:8px; display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.75rem;">
        ${descInsideHtml}
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div><span style="color:var(--text-dark); text-transform:uppercase; font-size:0.65rem; font-weight:700;">Release</span><br><span style="color:var(--text-main);">${dev.release_date ? escapeHtml(dev.release_date) : '—'}</span></div>
          <div><span style="color:var(--text-dark); text-transform:uppercase; font-size:0.65rem; font-weight:700;">Knowledge cutoff</span><br><span style="color:var(--text-main);">${dev.knowledge ? escapeHtml(dev.knowledge) : '—'}</span></div>
          <div><span style="color:var(--text-dark); text-transform:uppercase; font-size:0.65rem; font-weight:700;">Weights</span><br>${dev.open_weights === true ? `<span style="color:var(--savings-color);">✓ Open</span>` : dev.open_weights === false ? `<span>✗ Closed</span>` : `<span style="color:var(--text-muted);">?</span>`} ${Array.isArray(dev.weights) && dev.weights.length ? dev.weights.map(w => `<a href="${escapeHtml(w.url)}" target="_blank" rel="noopener" style="margin-left:6px; color:var(--eu-yellow); text-decoration:underline; font-size:0.68rem;">${escapeHtml(w.label || 'weights')}</a>`).join('') : ''}</div>
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          <div><span style="color:var(--text-dark); text-transform:uppercase; font-size:0.65rem; font-weight:700;">Context / Output</span><br><span style="color:var(--text-main); font-family:var(--font-mono);">${dev.context ? dev.context.toLocaleString() : '—'} / ${dev.output ? dev.output.toLocaleString() : '—'}</span> <span style="color:var(--text-muted); font-size:0.68rem;">tokens</span></div>
          <div style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
            <span style="color:var(--text-dark); text-transform:uppercase; font-size:0.65rem; font-weight:700; margin-right:4px;">Input types</span>
            ${dev.modalities && Array.isArray(dev.modalities.input) ? dev.modalities.input.map(m => `<span class="badge" style="font-size:0.68rem; border:1px solid var(--border-color);">${escapeHtml(m)}</span>`).join('') : '<span style="color:var(--text-muted);">—</span>'}
            <span style="margin-left:8px; color:var(--text-dark); text-transform:uppercase; font-size:0.65rem; font-weight:700; margin-right:4px;">Output</span>
            ${dev.modalities && Array.isArray(dev.modalities.output) ? dev.modalities.output.map(m => `<span class="badge" style="font-size:0.68rem; border:1px solid var(--border-color);">${escapeHtml(m)}</span>`).join('') : '<span style="color:var(--text-muted);">—</span>'}
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:4px; justify-content:space-between; align-items:center;">
            <span style="display:flex; flex-wrap:wrap; gap:4px;"><span class="badge" title="Supports reasoning / chain-of-thought (thinking mode)" style="font-size:0.68rem; border:1px solid var(--border-color); ${dev.reasoning ? 'color:var(--savings-color); border-color:var(--savings-color);' : 'color:var(--text-muted);'}">${dev.reasoning ? '✓' : dev.reasoning === false ? '—' : '?'} Reasoning</span>
            <span class="badge" title="Supports tool / function calling" style="font-size:0.68rem; border:1px solid var(--border-color); ${dev.tool_call ? 'color:var(--savings-color); border-color:var(--savings-color);' : 'color:var(--text-muted);'}">${dev.tool_call ? '✓' : dev.tool_call === false ? '—' : '?'} Tool Call</span>
            <span class="badge" title="Supports structured output (e.g. JSON mode / constrained decoding)" style="font-size:0.68rem; border:1px solid var(--border-color); ${dev.structured_output ? 'color:var(--savings-color); border-color:var(--savings-color);' : 'color:var(--text-muted);'}">${dev.structured_output ? '✓' : dev.structured_output === false ? '—' : '?'} Structured</span></span>
            <span style="font-size:0.62rem; color:var(--text-dark); white-space:nowrap;">via <a href="https://models.dev/models/${encodeURIComponent(dev.lab)}/${encodeURIComponent(modelObj.id)}/" target="_blank" rel="noopener" style="color:var(--text-muted); text-decoration:underline;">models.dev</a></span>
          </div>
        </div>
      </div>
  ` : '';

  // Readable benchmarks overview block — Quality (deggo) + EUR Value (EuroInference heuristic)
  const deggo = modelObj.deggo || null;
  const deggoMeta = (typeof DEGGO_META !== 'undefined' && DEGGO_META) ? DEGGO_META : null;
  let deggoHtml = '';
  if (deggo) {
    const qv = deggo.qualityValue, pv = getValueScore(modelObj);
    const qStr = qv !== null ? _numberFmt.format(qv) : '?';
    const pStr = pv !== null ? _numberFmt.format(pv) : '?';
    const blendedEUR = getBlendedEUR(modelObj);
    const blendedStr = blendedEUR !== null ? `€${blendedEUR.toFixed(2)}` : '—';
    const qualityTitle = `Quality v4 — deggo Quality Score (0–100), see models.deggo.fyi/docs for methodology.`;
    const valueTitle = `EUR Value — Quality × affordabilityEU (EU cheapest offer's (in+out)/2 ${(blendedEUR!==null?`€${blendedEUR.toFixed(2)}`:'' )}, same offer). affordability = 1/(1+log10(1+blendedEUR*8)*0.45).`;
    const qualityBox = `
      <div style="padding:10px 12px; background:rgba(255,204,0,0.035); border:1px solid rgba(255,204,0,0.13); border-radius:8px; display:flex; flex-direction:column; gap:6px;">
        <div title="${qualityTitle}" style="cursor:help;">
          <span style="color:var(--text-dark); text-transform:uppercase; font-size:0.62rem; font-weight:800; letter-spacing:0.04em;">Quality Score</span><br>
          <span style="font-family:var(--font-mono); font-size:1.45rem; font-weight:800; color:var(--text-main);">${qStr}</span><span style="font-size:0.7rem; color:var(--text-muted);"> / 100</span>
        </div>
        <div style="font-size:0.62rem; color:var(--text-dark); text-align:right;">via <a href="https://models.deggo.fyi/" target="_blank" rel="noopener" style="color:var(--text-muted); text-decoration:underline;">models.deggo.fyi</a> · Quality v4${deggoMeta && deggoMeta.updatedAt ? ` · ${escapeHtml(deggoMeta.updatedAt.slice(0,10))}` : ''}</div>
      </div>`;
    const valueBox = `
      <div style="padding:10px 12px; background:rgba(255,204,0,0.035); border:1px solid rgba(255,204,0,0.13); border-radius:8px; display:flex; flex-direction:column; gap:6px;">
        <div title="${valueTitle}" style="cursor:help;">
          <span style="color:var(--text-dark); text-transform:uppercase; font-size:0.62rem; font-weight:800; letter-spacing:0.04em;">EUR Value Score</span><br>
          <span style="font-family:var(--font-mono); font-size:1.45rem; font-weight:800; color:var(--text-main);">${pStr}</span><span style="font-size:0.7rem; color:var(--text-muted);"> / 100</span>
          <span style="margin-left:8px; font-size:0.68rem; color:var(--text-muted);" title="EU cheapest blended list price: (input + output)/2 from the single cheapest EU offer, same offer (not cache-/workload-adjusted)">blended ${escapeHtml(blendedStr)}/1M</span>
        </div>
        <div style="font-size:0.62rem; color:var(--text-dark); text-align:right;">calculated by <a href="methodology.html" target="_blank" rel="noopener" style="color:var(--text-muted); text-decoration:underline;">EuroInference</a></div>
      </div>`;
    deggoHtml = `<div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:10px;">${qualityBox}${valueBox}</div>`;
  } else {
    deggoHtml = '';
  }

  const overviewHtml = `
      ${dev ? '' : `<div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;"><span style="font-size:0.75rem; color:var(--text-dark); text-transform:uppercase; font-weight:800; letter-spacing:0.04em;">Creator: <span style="color:var(--text-main);">${escapeHtml(modelObj.creator)}</span></span></div>`}
      ${dev ? devHtml : descStandaloneHtml}
      ${deggoHtml}
  `;

  // 2. Provider Comparison Cards Grid (+ optional greyed-out non-EU reference card)
  const renderProviderCard = (off, idx, isBenchmark) => {
    const badgeClass = PROVIDER_BADGE_CLASS;
    const isCheapest = !isBenchmark && cheapestModalTotal !== null && areCostsEqual(off.totalCost, cheapestModalTotal);
    const badgeExtra = isCheapest ? ' badge-cheapest' : '';
    const starHtml = isCheapest ? '<span class="cheapest-star" title="Lowest-price provider">★</span> ' : '';
    const workloadVal = off.workloadCost !== null ? formatCurrency(off.workloadCost) : 'N/A';
    const workloadSub = `${_intFmt.format(workloadInputTokens)} in + ${_intFmt.format(workloadOutputTokens)} out${cacheAwareCost && cachedInputShare>0 ? ` · ${Math.round(cachedInputShare*100)}% cached` : ''}`;
    const workloadRowHtml = `
        <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px; margin-top:0.5rem; padding-top:0.5rem; border-top:1px solid var(--border-color);">
          <span class="lbl" style="font-size:0.65rem; color:var(--text-dark); text-transform:uppercase; font-weight:700;">Workload Cost <span style="text-transform:none; font-weight:400; color:var(--text-muted);">/ req</span></span>
          <span class="val" style="font-size:0.95rem; font-weight:700; font-family:var(--font-mono); color:${isCheapest ? 'var(--savings-color)' : 'var(--text-main)'};" title="${isCheapest ? 'Lowest workload cost' : workloadSub}">${workloadVal}</span>
        </div>
        <div style="font-size:0.62rem; color:var(--text-muted); text-align:right; margin-top:2px;">${workloadSub}</div>
    `;
    // Benchmark cards get their faded look from CSS classes; emitting the shared
    // inline background/border here would override those class rules.
    const cardStyle = isBenchmark
      ? ''
      : 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color);';

    // Provider Capabilities Checklist
    const capChecklistHtml = STANDARD_CAPABILITIES.map(cap => {
      const status = off.normOffer.capabilityStatus[cap] || 'unknown';
      const statusMeta = {
        supported: { symbol: '✓', color: '#34d399', label: 'Supported' },
        unknown: { symbol: '?', color: '#94a3b8', label: 'Not reported' },
        unsupported: { symbol: '—', color: '#475569', label: 'Explicitly unsupported' }
      }[status];
      return `
        <span title="${CAPABILITY_DESCRIPTIONS[cap]} ${statusMeta.label}." aria-label="${cap}: ${CAPABILITY_DESCRIPTIONS[cap]} ${statusMeta.label}." style="font-size:0.7rem; padding: 1px 5px; border-radius: 3px; color:${statusMeta.color}; background:rgba(255,255,255,0.02); border:1px solid var(--border-color); font-weight:600;">
          ${statusMeta.symbol} ${cap}
        </span>
      `;
    }).join('');

    // Prompt Caching details: published rates when available, otherwise an explicit state
    let cacheRowHtml = '';
    if (off.cacheRates.read !== null || off.cacheRates.write !== null) {
      const cacheRows = [];
      if (off.cacheRates.read !== null) {
        cacheRows.push(`
          <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
            <span class="lbl" style="font-size:0.65rem; color:var(--savings-color); text-transform:uppercase; font-weight:700;">Cache Read / 1M</span>
            <span class="val" style="font-size:0.9rem; font-weight:700; font-family:var(--font-mono); color:var(--savings-color);">${formatCurrency(off.cacheRates.read)}${off.nativeCache.read && !off.nativeCache.read.includes(selectedCurrency) ? `<span style="font-size:0.68rem; color:var(--text-muted); font-weight:400;"> ${off.nativeCache.read}</span>` : ''}</span>
          </div>
        `);
      }
      if (off.cacheRates.write !== null) {
        cacheRows.push(`
          <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
            <span class="lbl" style="font-size:0.65rem; color:var(--savings-color); text-transform:uppercase; font-weight:700;">Cache Write / 1M</span>
            <span class="val" style="font-size:0.9rem; font-weight:700; font-family:var(--font-mono); color:var(--savings-color);">${formatCurrency(off.cacheRates.write)}${off.nativeCache.write && !off.nativeCache.write.includes(selectedCurrency) ? `<span style="font-size:0.68rem; color:var(--text-muted); font-weight:400;"> ${off.nativeCache.write}</span>` : ''}</span>
          </div>
        `);
      }
      cacheRowHtml = `
        <div class="modal-card-cache modal-field" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--border-color); display:flex; flex-direction:column; gap:3px;">
          ${cacheRows.join('')}
        </div>
      `;
    } else {
      const cacheStateText = off.cacheSupportState === 'unsupported'
        ? 'Not supported per this provider listing.'
        : off.cacheSupportState === 'flagged'
          ? 'Supported by this provider — no rate published; cached tokens are estimated at full input price.'
          : 'No caching information published; cached tokens are estimated at full input price.';
      cacheRowHtml = `
        <div class="modal-card-cache" style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px dashed var(--border-color);">
          <span style="font-size:0.68rem; color:var(--text-muted);">Prompt caching: ${cacheStateText}</span>
        </div>
      `;
    }

    // Data sovereignty footer: fixed tri-state rows (jurisdiction, retention,
    // training, hosting, inference, routing) — hosting vs inference split per user request.
    // Unknown stays visible — it is never filled in or dropped. Scalar answers
    // are precomputed per offer; narrative details merge from SOVEREIGNTY_META.
    const sov = off.sovereignty || {};
    const sovMeta = (typeof SOVEREIGNTY_META !== 'undefined' && SOVEREIGNTY_META)
      ? SOVEREIGNTY_META[off.providerId === 'mistral-regional' ? 'mistral' : off.providerId] || {}
      : {};
    const sovTitle = (key, extra) => {
      const metaBlock = key === 'jurisdiction' ? sovMeta.jurisdiction : sovMeta[key];
      const parts = [];
      if (extra) parts.push(extra);
      if (sov.od && sov.od[key]) parts.push(sov.od[key]);
      if (metaBlock && metaBlock.detail) parts.push(metaBlock.detail);
      if (metaBlock && metaBlock.source) parts.push(`Source: ${metaBlock.source}`);
      return escapeHtml(parts.join(' '));
    };
    const pos = 'color:var(--savings-color);';
    const unk = 'color:var(--text-muted);';

    let jurisdictionVal;
    if (sovMeta.jurisdiction) {
      const countryFlag = flagEmoji(sovMeta.jurisdiction.code);
      const flags = sovMeta.jurisdiction.inEu ? `${countryFlag} 🇪🇺` : countryFlag;
      jurisdictionVal = `<span style="${pos}" title="${sovTitle('jurisdiction')}">${flags} ${escapeHtml(sovMeta.jurisdiction.country)}</span>`;
    } else {
      jurisdictionVal = `<span style="${unk}">? Unknown</span>`;
    }

    let retentionVal;
    if (sov.zeroRetention === true) {
      retentionVal = `<span style="${pos}">✓ Zero-day</span>`;
    } else if (sov.zeroRetention === false) {
      retentionVal = `<span>✗ Retained${Number.isFinite(sov.retentionDays) && sov.retentionDays > 0 ? ` ≤ ${sov.retentionDays}d` : ''}</span>`;
    } else {
      retentionVal = `<span style="${unk}">? Unknown</span>`;
    }

    let trainingVal;
    if (sov.training === false) {
      trainingVal = `<span style="${pos}">✓ No</span>`;
    } else if (sov.training === true) {
      trainingVal = `<span title="Depends on the routed backend; check the provider's policy.">✗ Possible</span>`;
    } else {
      trainingVal = `<span style="${unk}">? Unknown</span>`;
    }

    const pinList = ((modelObj.regionPinsByProvider || {})[off.providerId] || [])
      .map(p => p === 'none' ? 'Unpinned' : (REGION_PIN_LABELS[p] || p));
    const regionTooltipExtra = pinList.length > 1
      ? `This provider lists several routings for the model: ${pinList.join(', ')}.`
      : '';
    const usHostingRe = /aws|azure|gcp|google cloud|microsoft|bedrock|cloudflare/i;
    const hostingDetail = (sov.details?.hosting?.detail) || (sovMeta.hosting && sovMeta.hosting.detail) || '';
    const isUSHosting = sov.hosting === 'eu' && (usHostingRe.test(hostingDetail) || /^(opper|requesty)$/.test(off.providerId) || (hostingDetail.includes('Stockholm') && hostingDetail.includes('AWS')));
    const isHostingSovereign = sovMeta.jurisdiction && sovMeta.jurisdiction.inEu && sov.hosting === 'eu' && !isUSHosting;
    let hostingVal;
    if (sov.hosting === 'eu') {
      if (isHostingSovereign) {
        hostingVal = `<span style="${pos}" title="${sovTitle('hosting')} — EU-Sovereign (non-US provider)">✓ EU-Sovereign</span>`;
      } else if (isUSHosting) {
        hostingVal = `<span style="${pos}" title="${sovTitle('hosting')} — US-owned provider: CLOUD Act may apply despite EU location">✓ EU (US)</span>`;
      } else {
        hostingVal = `<span style="${pos}" title="${sovTitle('hosting')}">✓ EU</span>`;
      }
    } else if (sov.hosting === 'us') {
      hostingVal = `<span title="${sovTitle('hosting')}">US</span>`;
    } else if (sov.hosting === 'global') {
      hostingVal = `<span title="${sovTitle('hosting')}">Global</span>`;
    } else {
      hostingVal = `<span style="${unk}" title="${sovTitle('hosting')}">? Unknown</span>`;
    }
    const usInferenceRe = /aws|bedrock|azure|gcp|vertex|fireworks|xai|openai|anthropic|google/i;
    const regionDetail = (sov.details?.region?.detail) || (sovMeta.region && sovMeta.region.detail) || '';
    const creatorIsUS = /^(openai|anthropic|google|amazon|microsoft|xai|perplexity|meta|nousresearch|cohere|writer)$/i.test(modelObj.creator || '');
    const isUSInferenceEU = sov.region === 'eu' && (
      usInferenceRe.test(regionDetail) ||
      creatorIsUS ||
      (off.providerId === 'requesty' && /bedrock|azure|vertex/i.test(off.normOffer.rawModelId || ''))
    );
    // EU-Sovereign = jurisdiction EU + hosting EU non-US + inference EU non-US + (European model OR open-weights hosted by non-US) per strict definition
    const isEuropeanModel = /^(mistral ai)$/i.test(modelObj.creator || '');
    const isOpenWeightsModel = /llama|qwen|deepseek|gemma|mistral|mixtral|ministral|codestral|voxtral|devstral|pixtral|glm|kimi|granite|command|hermes|minicpm|phi|falcon|bloom|openbmb|nous/i.test((modelObj.id || '').toLowerCase()) || /^(meta|mistral ai|alibaba cloud|deepseek|moonshot ai|zhipu ai|cohere|ibm|nousresearch|swiss ai|tencent|xiaomi|nvidia)$/i.test(modelObj.creator || '');
    const isSovereign = sovMeta.jurisdiction && sovMeta.jurisdiction.inEu && sov.hosting === 'eu' && !isUSHosting && sov.region === 'eu' && !isUSInferenceEU && (isEuropeanModel || isOpenWeightsModel);
    let regionVal;
    if (sov.region === 'eu') {
      if (isUSInferenceEU) {
        regionVal = `<span style="${pos}" title="${sovTitle('region', regionTooltipExtra)} — EU region of US provider, CLOUD Act applicable">✓ EU (US)</span>`;
      } else if (isSovereign) {
        regionVal = `<span style="${pos}" title="${sovTitle('region', regionTooltipExtra)} — EU-Sovereign (non-US provider)">✓ EU-Sovereign</span>`;
      } else {
        regionVal = `<span style="${pos}" title="${sovTitle('region', regionTooltipExtra)}">✓ EU</span>`;
      }
    } else if (sov.region === 'us') {
      regionVal = `<span title="${sovTitle('region', regionTooltipExtra)}">US</span>`;
    } else if (sov.region === 'global') {
      regionVal = `<span title="${sovTitle('region', regionTooltipExtra)}">Global</span>`;
    } else {
      regionVal = `<span style="${unk}" title="${sovTitle('region', regionTooltipExtra)}">? Unknown</span>`;
    }

    const infra = off.normOffer.infrastructure || {};
    const hostNames = (Array.isArray(infra.hosts) ? infra.hosts : [])
      .map(h => typeof h === 'string' ? h : (h && (h.name || h.id || h.provider)) || '')
      .filter(Boolean);
    const routingExtra = hostNames.length ? `EU hosting partners: ${hostNames.join(', ')}.` : '';
    let routingVal;
    if (sov.routing === 'direct') {
      routingVal = `<span style="${pos}" title="${sovTitle('routing', routingExtra)}">Direct</span>`;
    } else if (sov.routing === 'aggregator') {
      routingVal = `<span title="${sovTitle('routing', routingExtra)}">Aggregator</span>`;
    } else {
      routingVal = `<span style="${unk}" title="${sovTitle('routing', routingExtra)}">? Unknown</span>`;
    }

    const sovereigntyHtml = `
        <div class="modal-card-sovereignty">
          <span class="lbl" style="font-size:0.65rem; color:var(--text-dark); text-transform:uppercase; font-weight:700; display:block; margin-bottom: 4px;">Data Sovereignty</span>
          <div class="sov-row"><span class="sov-lbl">Jurisdiction</span><span class="sov-val">${jurisdictionVal}</span></div>
          <div class="sov-row"><span class="sov-lbl">Retention</span><span class="sov-val" title="${sovTitle('retention')}">${retentionVal}</span></div>
          <div class="sov-row"><span class="sov-lbl">Training</span><span class="sov-val" title="${sovTitle('training')}">${trainingVal}</span></div>
          <div class="sov-row"><span class="sov-lbl">Hosting</span><span class="sov-val" title="${sovTitle('hosting')}">${hostingVal}</span></div>
          <div class="sov-row"><span class="sov-lbl">Inference</span><span class="sov-val">${regionVal}</span></div>
          <div class="sov-row"><span class="sov-lbl">Routing</span><span class="sov-val">${routingVal}</span></div>
        </div>
      `;

    const offerContext = off.normOffer.contextSize ? `${off.normOffer.contextSize.toLocaleString()} context` : 'Standard context';
    const offerMaxOut = off.normOffer.maxOutputTokens ? `${off.normOffer.maxOutputTokens.toLocaleString()} max out` : '';
    const limitsStr = [offerContext, offerMaxOut].filter(Boolean).join(' • ');

    // Other raw IDs this provider lists for the same canonical model (region pins collapsed)
    const providerAltIds = [...new Set(
      ((modelObj.alternateIdsByProvider && modelObj.alternateIdsByProvider[off.providerId]) || [])
    )]
      .map(raw => {
        const label = displayModelId(raw);
        const pinMatch = /@([a-z][a-z0-9-]*)$/i.exec(String(raw || ''));
        const bucket = pinMatch ? regionBucketFromCode(pinMatch[1]) : null;
        return { raw, label, pinTitle: bucket ? `Region routing: ${REGION_PIN_LABELS[bucket] || bucket}` : '' };
      })
      .filter(item => item.label && item.label !== displayModelId(off.normOffer.rawModelId));
    const sameModelIdsHtml = providerAltIds.length > 0
      ? `<div style="margin-top: 6px;">
          <span style="font-size:0.6rem; color:var(--text-dark); text-transform:uppercase; font-weight:700; display:block; margin-bottom: 3px;">Same Model Listed As (${providerAltIds.length})</span>
          <div style="display:flex; flex-wrap:wrap; gap:4px;">
            ${providerAltIds.map(item => `<code title="${escapeHtml(item.pinTitle)}" style="font-family:var(--font-mono); font-size:0.66rem; color:var(--text-muted); background:rgba(255,255,255,0.03); border:1px solid var(--border-color); padding:1px 5px; border-radius:4px;">${escapeHtml(item.label)}</code>`).join('')}
          </div>
        </div>`
      : '';

    return `
      <div class="modal-model-card${isBenchmark ? ' benchmark-card' : ''}" style="--card-i:${idx}; ${cardStyle}">
        <div style="display:flex; justify-content:${isBenchmark ? 'space-between' : 'flex-start'}; align-items:center; gap:6px; flex-wrap:wrap;">
          <span class="badge ${badgeClass}${badgeExtra}">${starHtml}${escapeHtml(off.providerName)}</span>
          ${isBenchmark ? '<span class="badge badge-benchmark" title="Non-European aggregator, listed purely for price comparison">Non-EU Reference</span>' : ''}
        </div>

        <div class="modal-card-slug">
          <span style="font-size:0.65rem; color:var(--text-dark); text-transform:uppercase; font-weight:700; display:block; margin-bottom: 4px;">API Model Slug${sov.region === 'eu' && off.normOffer.rawModelId.includes('@') ? ' <span style=&quot;color:var(--savings-color); text-transform:none; font-weight:400;&quot;>(EU pin required for ✓ EU below)</span>' : ''}</span>
          <div class="slug-copy-container" style="display:flex; align-items:center; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 5px 8px; border-radius: 6px; justify-content:space-between; gap: 8px; min-width:0;">
            <code style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-main); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0;">${escapeHtml(off.normOffer.rawModelId)}</code>
            <button class="copy-slug-btn" onclick="navigator.clipboard.writeText('${off.normOffer.rawModelId.replace(/'/g, "\\'")}'); showCopyTooltip(this);" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding: 2px; display:flex; align-items:center; transition: color 0.15s; flex-shrink:0;" title="Copy to clipboard">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          <div class="modal-field">
            <span class="lbl" style="font-size:0.65rem; color:var(--text-dark); text-transform:uppercase; font-weight:700;">Input / 1M</span>
            <span class="val" style="font-size:1rem; font-weight:700; font-family:var(--font-mono); color:var(--text-main)">${formatCurrency(off.inCost)}</span>
            <span class="desc" style="font-size:0.68rem; color:var(--text-muted);">${off.origIn}</span>
          </div>

          <div class="modal-field">
            <span class="lbl" style="font-size:0.65rem; color:var(--text-dark); text-transform:uppercase; font-weight:700;">Output / 1M</span>
            <span class="val" style="font-size:1rem; font-weight:700; font-family:var(--font-mono); color:var(--text-main)">${formatCurrency(off.outCost)}</span>
            <span class="desc" style="font-size:0.68rem; color:var(--text-muted);">${off.origOut}</span>
          </div>
        </div>

        ${workloadRowHtml}

        ${cacheRowHtml}

        <div class="modal-card-limits">
          <span class="lbl" style="font-size:0.65rem; color:var(--text-dark); text-transform:uppercase; font-weight:700; display:block; margin-bottom: 2px;">Limits</span>
          <span style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-main);">${limitsStr}</span>
        </div>

        <div>
          <span class="lbl" style="font-size:0.65rem; color:var(--text-dark); text-transform:uppercase; font-weight:700; display:block; margin-bottom: 4px;">Provider Features</span>
          <div style="display:flex; flex-wrap:wrap; gap:4px;">
            ${capChecklistHtml}
          </div>
        </div>

        ${sovereigntyHtml}

        ${off.normOffer.alternateSlugs && off.normOffer.alternateSlugs.length > 0 ? `
          <div style="margin-top: auto; padding-top: 0.25rem;">
            <span style="font-size:0.6rem; color:var(--text-dark); text-transform:uppercase; font-weight:700; display:block; margin-bottom: 3px;">Also Available As (Rolling Alias)</span>
            ${off.normOffer.alternateSlugs.map(alt => `
              <div class="slug-copy-container" style="display:flex; align-items:center; background: rgba(255,255,255,0.015); border: 1px dashed var(--border-color); padding: 3px 6px; border-radius: 5px; justify-content:space-between; gap: 6px; margin-bottom: 4px; min-width:0;">
                  <code style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; flex:1; min-width:0;">${displayModelId(alt.rawModelId)}</code>
                <button class="copy-slug-btn" onclick="navigator.clipboard.writeText('${displayModelId(alt.rawModelId)}'); showCopyTooltip(this);" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding: 2px; display:flex; align-items:center; flex-shrink:0;" title="Copy alias slug">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${sameModelIdsHtml}
      </div>
    `;
  };

  // Non-EU reference card renders inside the same grid, always last, faded.
  const cardsHtml = offersList.map((off, idx) => renderProviderCard(off, idx, false)).join('');
  const benchmarkCardHtml = benchmarkOfferEntry
    ? renderProviderCard(benchmarkOfferEntry, offersList.length, true)
    : '';

  modalContent.innerHTML = `
    ${overviewHtml}
    <div class="modal-cards-grid">
      ${cardsHtml}
      ${benchmarkCardHtml}
    </div>
    <p class="comparison-note">
      <strong>Price, Quality, and EUR Value comparison only.</strong> Listed prices, Quality (deggo Quality v4, synthesized) and EUR Value (Quality × affordabilityEU heuristic — not an official rating) do not indicate overall suitability. Sovereignty badges summarize self-published provider policies and listing signals (omitted = unknown, not a certification); data reflects the last successful refresh and may lag live catalogs. Before choosing a provider, verify supported features such as caching and tools, rate limits and quotas, context and output limits, latency, availability and reliability, data retention and training policies, data residency, security and compliance requirements, API compatibility, support, and SLA terms. Prices exclude VAT and are converted at the periodic ECB rate shown in the header.
      ${benchmarkCardHtml ? ' The greyed-out <strong>OpenRouter</strong> card is a non-EU aggregator shown purely for price comparison; it is excluded from all rankings, filters and cost estimates on this site.' : ''}
    </p>
  `;

  overlay.classList.remove('closing');
  overlay.classList.add('active');
}

// Close with the drop-out animation (unless reduced motion), then hide.
function closeDetailOverlay() {
  const overlay = document.getElementById('detail-overlay');
  if (!overlay || !overlay.classList.contains('active')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    overlay.classList.remove('active');
    return;
  }
  overlay.classList.add('closing');
  setTimeout(() => {
    overlay.classList.remove('active', 'closing');
  }, 190);
}

// --- SETUP EVENT LISTENERS ---

// Animated theme switch: circular wipe expanding from the toggle button where the
// View Transitions API is available (Chromium/Safari), staggered section fade as
// fallback (Firefox), instant swap when the user prefers reduced motion.
function animateThemeChange(apply) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    apply();
    return;
  }

  if (document.startViewTransition) {
    const toggle = document.getElementById('theme-toggle');
    const rect = toggle ? toggle.getBoundingClientRect() : null;
    const x = rect ? rect.left + rect.width / 2 : window.innerWidth - 60;
    const y = rect ? rect.top + rect.height / 2 : 60;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    const viewTransition = document.startViewTransition(apply);
    viewTransition.ready.then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`
          ]
        },
        {
          duration: 550,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)'
        }
      );
    }).catch(() => {});
    return;
  }

  // Fallback: fade the marked page sections out step by step, swap the theme
  // while they are invisible, then let them reappear in the same order.
  if (document.body.classList.contains('theme-fading-out')) {
    apply();
    return;
  }
  const steps = Array.from(document.querySelectorAll('[data-theme-step]'));
  steps.forEach((el, index) => el.style.setProperty('--theme-step', String(index)));
  const staggerMs = 300 + steps.length * 45;
  document.body.classList.add('theme-fading-out');
  setTimeout(() => {
    apply();
    document.body.classList.remove('theme-fading-out');
    document.body.classList.add('theme-fading-in');
    setTimeout(() => document.body.classList.remove('theme-fading-in'), staggerMs);
  }, staggerMs);
}

function setupUIEventListeners() {
  // 1. Theme toggle
  const themeToggle = document.getElementById('theme-toggle');
  if (themeToggle) {
    const updateThemeToggle = () => {
      const isLight = selectedTheme === 'light';
      document.documentElement.dataset.theme = selectedTheme;
      localStorage.setItem('euroinference-theme', selectedTheme);
      themeToggle.setAttribute('aria-label', `Switch to ${isLight ? 'dark' : 'light' } mode`);
      themeToggle.title = `Switch to ${isLight ? 'dark' : 'light'} mode`;
    };
    updateThemeToggle();
    themeToggle.addEventListener('click', () => {
      const nextTheme = selectedTheme === 'light' ? 'dark' : 'light';
      animateThemeChange(() => {
        selectedTheme = nextTheme;
        updateThemeToggle();
      });
    });
  }

  // Regional Mistral pricing is a separate offer for the same API family.
  // Keep it as its own detail card rather than collapsing it into the base offer.

  // 2. Currency Switcher Widget
  const switcher = document.getElementById('currency-switcher-widget');
  if (switcher) {
    switcher.addEventListener('click', (e) => {
      const option = e.target.closest('.currency-option');
      if (!option) return;
      
      document.querySelectorAll('.currency-option').forEach(o => o.classList.remove('active'));
      option.classList.add('active');
      
      const newCur = option.dataset.currency;
      if (newCur === selectedCurrency) return;
      _lastCurrency = selectedCurrency;
      selectedCurrency = newCur;
      _currencySwitchPending = true;
      // Clear friendly cache not needed, but ensure_int formatters use new currency symbol
      requestAnimationFrame(() => {
        configureCostFilters();
        _currencySwitchPending = false;
        // Direct call uses precomputed map + chunked render, keeps UI responsive
        applyFiltersAndRender();
      });
    });
  }

  // 3. Inline Header Filters
  const filterIdInput = document.getElementById('filter-id');
  if (filterIdInput) {
    const debouncedSearch = debounce((val) => {
      searchQuery = val;
      applyFiltersAndRender();
    }, 250);
    filterIdInput.addEventListener('input', (e) => {
      debouncedSearch(e.target.value);
    });
  }

  const providerDropdown = document.getElementById('filter-source-dropdown');
  const providerToggle = document.getElementById('filter-source-toggle');
  const providerMenu = document.getElementById('filter-source-menu');
  if (providerDropdown && providerToggle && providerMenu) {
    const providerCheckboxes = Array.from(providerMenu.querySelectorAll('input[type="checkbox"]'));

    const updateProviderFilter = () => {
      selectedProvider = providerCheckboxes.filter(input => input.checked).map(input => input.value);
      providerToggle.textContent = selectedProvider.length === 0
        ? 'All Providers'
        : `${selectedProvider.length} selected`;
      applyFiltersAndRender();
    };

    const positionProviderMenu = () => {
      const rect = providerToggle.getBoundingClientRect();
      const menuWidth = Math.max(rect.width, providerMenu.offsetWidth);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8));
      providerMenu.style.top = `${rect.bottom + 4}px`;
      providerMenu.style.left = `${left}px`;
      providerMenu.style.minWidth = `${rect.width}px`;
    };

    const closeProviderMenu = () => {
      providerMenu.hidden = true;
      providerToggle.setAttribute('aria-expanded', 'false');
    };

    providerToggle.addEventListener('click', () => {
      const isOpening = providerMenu.hidden;
      providerMenu.hidden = !isOpening;
      providerToggle.setAttribute('aria-expanded', String(isOpening));
      if (isOpening) positionProviderMenu();
    });

    providerToggle.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeProviderMenu();
      } else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        providerMenu.hidden = false;
        providerToggle.setAttribute('aria-expanded', 'true');
        positionProviderMenu();
      }
    });

    providerCheckboxes.forEach(input => input.addEventListener('change', updateProviderFilter));
    providerDropdown.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', closeProviderMenu);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeProviderMenu();
    });
    window.addEventListener('resize', () => {
      if (!providerMenu.hidden) positionProviderMenu();
    });
  }

  const filterCreatorSelect = document.getElementById('filter-creator');
  if (filterCreatorSelect) {
    filterCreatorSelect.addEventListener('change', (e) => {
      selectedCreator = e.target.value;
      applyFiltersAndRender();
    });
  }

  const dedupeToggle = document.getElementById('filter-dedupe');
  if (dedupeToggle) {
    dedupeToggle.addEventListener('change', (e) => {
      dedupeLatestTwo = e.target.checked;
      applyFiltersAndRender();
    });
  }

  const dateSelect = document.getElementById('filter-date');
  if (dateSelect) {
    dateFilter = dateSelect.value;
    dateSelect.addEventListener('change', (e) => {
      dateFilter = e.target.value;
      applyFiltersAndRender();
    });
  }

  const hideUnknownToggle = document.getElementById('filter-hide-unknown');
  if (hideUnknownToggle) {
    hideUnknownDates = hideUnknownToggle.checked;
    hideUnknownToggle.addEventListener('change', (e) => {
      hideUnknownDates = e.target.checked;
      applyFiltersAndRender();
    });
    const syncHideUnknownDisabled = () => {
      const disabled = dateFilter === 'all';
      hideUnknownToggle.disabled = disabled;
      hideUnknownToggle.parentElement.style.opacity = disabled ? '0.5' : '1';
    };
    syncHideUnknownDisabled();
    if (dateSelect) dateSelect.addEventListener('change', syncHideUnknownDisabled);
  }

  ['input', 'output'].forEach(key => {
    const minInput = document.getElementById(`${key}-cost-min`);
    const maxInput = document.getElementById(`${key}-cost-max`);
    if (!minInput || !maxInput) return;

    const updateRange = (bound, e) => {
      const range = costFilterRanges[key];
      const value = sliderToCost(Number(e.target.value), range.scaleMax);
      if (bound === 'min') {
        range.min = value;
        if (range.min > range.max) range.max = range.min;
      } else {
        range.max = value;
        if (range.max < range.min) range.min = range.max;
      }
      updateCostFilterDisplay(key);
    };

    const debouncedApply = debounce(applyFiltersAndRender, 150);
    minInput.addEventListener('input', e => updateRange('min', e));
    maxInput.addEventListener('input', e => updateRange('max', e));
    minInput.addEventListener('change', debouncedApply);
    maxInput.addEventListener('change', debouncedApply);
  });

  // 2b. Workload estimator inputs (debounced)
  const debouncedWorkloadApply = debounce(applyFiltersAndRender, 250);
  const minContextInputs = Array.from(document.querySelectorAll('#filter-context-size'));
  if (minContextInputs.length > 0) {
    const handler = (e) => {
      const v = parseInt(e.target.value, 10);
      minContextSize = isNaN(v) || v < 0 ? 0 : v;
      minContextInputs.forEach(input => {
        if (input !== e.target) {
          input.value = minContextSize || '';
        }
      });
      debouncedWorkloadApply();
    };
    minContextInputs.forEach(input => {
      input.addEventListener('input', handler);
      input.addEventListener('change', handler);
    });
  }
  const inputTokensInput = document.getElementById('filter-input-tokens');
  if (inputTokensInput) {
    const handler = (e) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v > 0) {
        workloadInputTokens = v;
        debouncedWorkloadApply();
      }
    };
    inputTokensInput.addEventListener('input', handler);
    inputTokensInput.addEventListener('change', handler);
  }
  const outputTokensInput = document.getElementById('filter-output-tokens');
  if (outputTokensInput) {
    const handler = (e) => {
      const v = parseInt(e.target.value, 10);
      if (!isNaN(v) && v > 0) {
        workloadOutputTokens = v;
        debouncedWorkloadApply();
      }
    };
    outputTokensInput.addEventListener('input', handler);
    outputTokensInput.addEventListener('change', handler);
  }

  // 2c. Prompt-caching controls (cost math toggle, share presets, reuse rounds,
  // caching-only visibility filter)
  const cacheAwareToggle = document.getElementById('filter-cache-aware');
  if (cacheAwareToggle) {
    cacheAwareToggle.addEventListener('change', (e) => {
      cacheAwareCost = e.target.checked;
      updateCacheControls();
      applyFiltersAndRender();
    });
  }

  const cacheOnlyToggle = document.getElementById('filter-cache-only');
  if (cacheOnlyToggle) {
    cacheOnlyToggle.addEventListener('change', (e) => {
      onlyCachingProviders = e.target.checked;
      updateCacheControls();
      applyFiltersAndRender();
    });
  }

  document.querySelectorAll('.cache-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const share = parseFloat(chip.dataset.share);
      if (Number.isNaN(share)) return;
      cachedInputShare = share;
      // Realistic token presets per workflow (research: agentic ~50k/5k, RAG ~20k/1k, Chat ~2k/0.5k)
      if (Math.abs(share - 0.8) < 1e-9) {
        workloadInputTokens = 50000; workloadOutputTokens = 5000; cacheReuseRounds = 8;
      } else if (Math.abs(share - 0.4) < 1e-9) {
        workloadInputTokens = 20000; workloadOutputTokens = 1000; cacheReuseRounds = 4;
      } else if (Math.abs(share) < 1e-9) {
        workloadInputTokens = 2000; workloadOutputTokens = 500; cacheReuseRounds = 2;
      }
      const inEl = document.getElementById('filter-input-tokens');
      const outEl = document.getElementById('filter-output-tokens');
      const reuseEl = document.getElementById('filter-cache-reuse');
      if (inEl) inEl.value = workloadInputTokens;
      if (outEl) outEl.value = workloadOutputTokens;
      if (reuseEl) reuseEl.value = String(cacheReuseRounds);
      updateCacheControls();
      applyFiltersAndRender();
    });
  });

  const cacheReuseSelect = document.getElementById('filter-cache-reuse');
  if (cacheReuseSelect) {
    cacheReuseSelect.addEventListener('change', (e) => {
      const value = e.target.value === 'Infinity' ? Infinity : parseFloat(e.target.value);
      if (value === Infinity || (Number.isFinite(value) && value >= 1)) {
        cacheReuseRounds = value;
      }
      updateCacheControls();
      applyFiltersAndRender();
    });
  }

  // Show all — clear every filter so every model is shown
  const showAllBtn = document.getElementById('show-all-btn');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // Text search
      searchQuery = '';
      const searchInput = document.getElementById('filter-id');
      if (searchInput) searchInput.value = '';
      // Creator
      selectedCreator = 'all';
      const creatorSelect = document.getElementById('filter-creator');
      if (creatorSelect) creatorSelect.value = 'all';
      // Provider (multi-select checkboxes)
      selectedProvider = [];
      const providerMenu = document.getElementById('filter-source-menu');
      if (providerMenu) {
        providerMenu.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
      }
      const providerToggle = document.getElementById('filter-source-toggle');
      if (providerToggle) {
        providerToggle.textContent = 'All Providers';
        providerToggle.setAttribute('aria-expanded', 'false');
      }
      if (providerMenu) providerMenu.hidden = true;
      // Dedupe — show all versions
      dedupeLatestTwo = false;
      const dedupeEl = document.getElementById('filter-dedupe');
      if (dedupeEl) dedupeEl.checked = false;
      // Date + hide unknown — show all dates, include unknown
      dateFilter = 'all';
      const dateEl = document.getElementById('filter-date');
      if (dateEl) dateEl.value = 'all';
      hideUnknownDates = false;
      const hideUnknownEl = document.getElementById('filter-hide-unknown');
      if (hideUnknownEl) {
        hideUnknownEl.checked = false;
        hideUnknownEl.disabled = true;
        if (hideUnknownEl.parentElement) hideUnknownEl.parentElement.style.opacity = '0.5';
      }
      // Min context — no minimum
      minContextSize = 0;
      const ctxEl = document.getElementById('filter-context-size');
      if (ctxEl) ctxEl.value = '';
      document.querySelectorAll('#filter-context-size').forEach(el => { if (el !== ctxEl) el.value = ''; });
      // Caching-only — show all providers
      onlyCachingProviders = false;
      const cacheOnlyEl = document.getElementById('filter-cache-only');
      if (cacheOnlyEl) cacheOnlyEl.checked = false;
      // Cost price filters — full range
      costFilterRanges.input = { min: 0, max: Infinity, scaleMax: Infinity };
      costFilterRanges.output = { min: 0, max: Infinity, scaleMax: Infinity };
      configureCostFilters();
      updateCacheControls();
      applyFiltersAndRender();
    });
  }

  // Prevent sorting when clicking inside header filter inputs/selects
  document.querySelectorAll('.header-filter-input, .provider-filter-toggle, .provider-filter-menu, .show-all-btn').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });

  // 3. Modal Close Button
  const modalClose = document.getElementById('modal-close-btn');
  const overlay = document.getElementById('detail-overlay');
  if (modalClose && overlay) {
    modalClose.addEventListener('click', closeDetailOverlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeDetailOverlay();
      }
    });
  }

  // 4. Table headers sorting triggers
  document.querySelectorAll('table.models-table th.sortable').forEach(th => {
    th.addEventListener('click', (e) => {
      const column = e.currentTarget.dataset.sort;
      
      if (currentSortColumn === column) {
        currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortColumn = column;
        currentSortDirection = 'asc';
      }

      document.querySelectorAll('table.models-table th.sortable').forEach(header => {
        header.classList.remove('active-sort');
        const indicator = header.querySelector('span.sort-indicator');
        if (indicator) indicator.textContent = '';
      });

      th.classList.add('active-sort');
      const indicator = th.querySelector('span.sort-indicator');
      if (indicator) {
        indicator.textContent = currentSortDirection === 'asc' ? '▲' : '▼';
      }

      applyFiltersAndRender();
    });
  });

  // Pause heavy work when hidden — prevents queue burst that freezes whole system on tab return (10-15s report)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (_renderRaf) { cancelAnimationFrame(_renderRaf); _renderRaf = null; }
      if (_renderTimeout) { clearTimeout(_renderTimeout); _renderTimeout = null; }
      if (scheduleRender._raf) { cancelAnimationFrame(scheduleRender._raf); scheduleRender._raf = null; }
      if (window._tableObserver) { try { window._tableObserver.disconnect(); } catch {} }
    } else if (_deferredRender) {
      _deferredRender = false;
      requestAnimationFrame(() => applyFiltersAndRender());
    } else if (window._tableObserver) {
      const sentinel = document.getElementById('table-sentinel');
      if (sentinel) { try { window._tableObserver.observe(sentinel); } catch {} }
    }
  });

  // Ensure END / disclaimer anchor work with paginated table (only 80 rows initially)
  document.querySelectorAll('a[href="#data-notice"]').forEach(a => {
    a.addEventListener('click', () => {
      if (document.getElementById('table-sentinel') && window._loadAllTableRows) window._loadAllTableRows();
    });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'End' && document.getElementById('table-sentinel') && window._loadAllTableRows) {
      window._loadAllTableRows();
    }
  });
}

// Start Application on DOM Content Loaded or immediately if already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Global copy tooltip helper
window.showCopyTooltip = function(btn) {
  const origHtml = btn.innerHTML;
  btn.innerHTML = '<span style="font-size:0.7rem; color:var(--savings-color); font-weight:700;">Copied!</span>';
  setTimeout(() => {
    btn.innerHTML = origHtml;
  }, 1500);
};
