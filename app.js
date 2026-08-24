// EuroInference - Multi-Provider LLM Price Comparison
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)
// See LICENSE file in the project root for full license text.

// State Variables
let mammouthModels = [];
let cortecsModels = [];
let mistralModels = [];
let edenaiModels = [];
let opperModels = [];
let eurouterModels = [];
let requestyModels = [];
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

// Workload estimator inputs (used to compute the "Cost (your workload)" column).
// Defaults: 10K input / 1K output tokens — near the OpenRouter 2025 medians with light headroom.
// Default to a practical context size for regular chat, coding, and agent work.
let minContextSize = 32000;
let workloadInputTokens = 10000;
let workloadOutputTokens = 1000;

// Prompt-caching assumptions behind the "Cost (your workload)" column.
// cacheAwareCost toggles the blended formula on/off; cachedInputShare is the assumed
// share of input tokens served from cache; cacheReuseRounds (R) amortizes write
// premiums across the average number of times a cached context is re-read.
let cacheAwareCost = true;
let cachedInputShare = 0.8; // Agentic preset
let cacheReuseRounds = 4;
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

// Sorting state
let currentSortColumn = 'id';
let currentSortDirection = 'asc'; // 'asc' or 'desc'

// Map of raw creator strings to clean display names
const CREATOR_NAMES = {
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'google': 'Google',
  'deepseek': 'DeepSeek',
  'mistral ai': 'Mistral AI',
  'mistral': 'Mistral AI',
  'mistral ai regional': 'Mistral AI Regional',
  'alibaba cloud': 'Alibaba Cloud',
  'alibaba': 'Alibaba Cloud',
  'z.ai': 'Zhipu AI',
  'zhipu': 'Zhipu AI',
  'zhipu ai': 'Zhipu AI',
  'moonshot ai': 'Moonshot AI',
  'moonshot': 'Moonshot AI',
  'moonshotai': 'Moonshot AI',
  'nvidia': 'NVIDIA',
  'amazon': 'Amazon',
  'aws': 'Amazon',
  'meta': 'Meta',
  'nousresearch': 'Nous Research',
  'nous research': 'Nous Research',
  'xiaomimimo': 'Xiaomi',
  'xiaomi': 'Xiaomi',
  'tencent hy': 'Tencent',
  'tencent': 'Tencent',
  'swiss ai initiative': 'Swiss AI',
  'swiss ai': 'Swiss AI',
  'h company': 'H Company',
  'openbmb': 'OpenBMB',
  'ibm': 'IBM',
  'cohere': 'Cohere',
  'ai21': 'AI21 Labs',
  'ai21 labs': 'AI21 Labs',
  'writer': 'Writer',
  'perplexity': 'Perplexity',
  'xai': 'xAI',
  'x.ai': 'xAI',
  'databricks': 'Databricks',
  'microsoft': 'Microsoft',
  'snowflake': 'Snowflake',
  'deepinfra': 'Deepinfra',
  'cloudflare': 'Cloudflare'
};

// --- DATA FETCHING & INITIALIZATION ---

async function init() {
  loadExchangeRate();
  updateLastUpdatedDisplay();
  renderUpdateWarning();
  await fetchModels();

  processAndUnifyModels();
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
  console.log('Loading generated model data...');
  mammouthModels = (typeof MAMMOUTH_DATA !== 'undefined') ? MAMMOUTH_DATA : [];
  cortecsModels = (typeof CORTECS_DATA !== 'undefined') ? CORTECS_DATA : [];
  mistralModels = (typeof MISTRAL_DATA !== 'undefined') ? MISTRAL_DATA : [];
  edenaiModels = (typeof EDENAI_DATA !== 'undefined') ? EDENAI_DATA : [];
  opperModels = (typeof OPPER_DATA !== 'undefined') ? OPPER_DATA : [];
  eurouterModels = (typeof EUROUTER_DATA !== 'undefined') ? EUROUTER_DATA : [];
  requestyModels = (typeof REQUESTY_DATA !== 'undefined') ? REQUESTY_DATA : [];
  
  console.log('Loaded models count:', 
    mammouthModels.length, cortecsModels.length, mistralModels.length,
    edenaiModels.length, opperModels.length, eurouterModels.length, requestyModels.length
  );
}

// --- NORMALIZATION & MATCHING ENGINE ---

function getCleanModelId(id) {
  if (!id) return '';
  let clean = id.toLowerCase();
  
  // Strip trailing region suffix like @eu, @us, @global, @europe-west1, @us-east-1
  clean = clean.replace(/@[a-z0-9_-]+$/i, '');
  
  if (clean.includes('/')) {
    clean = clean.split('/').pop();
  }
  
  if (clean.includes(':')) {
    clean = clean.split(':')[0];
  }
  
  // Amazon Bedrock keeps the family as a vendor prefix: deepseek.v3.2 -> deepseek-v3.2 (not v3.2)
  clean = clean.replace(/^deepseek\./i, 'deepseek-');
  // Strip vendor dot prefixes (Amazon Bedrock <vendor>.<model> convention)
  clean = clean.replace(/^(anthropic|openai|google|meta|cohere|mistral|amazon|ibm|alibaba|zhipu|moonshot|moonshotai|microsoft|snowflake|deepseek|ai21|writer|qwen|zai|nvidia|minimax)\./i, '');
  // Strip leading Zai/Zhipu vendor hyphen/underscore prefixes (e.g. zai-glm-4.7 -> glm-4.7)
  clean = clean.replace(/^(zai|zhipu)[-_]/i, '');
  // Strip host hyphen prefixes
  clean = clean.replace(/^(databricks|vertex|bedrock|azure|deepinfra|novita|together|cloudflare|anyscale|replicate|amazon|aws|nvidia|meta)-/i, '');
  // Strip trailing region suffix like -eu, -us, -global
  clean = clean.replace(/-(eu|us|global)$/i, '');
  // Strip -v1, -v2
  clean = clean.replace(/-v\d+$/i, '');
  // Strip date snapshots like -2026-04-23, -2025-12-11
  clean = clean.replace(/-\d{4}-\d{2}-\d{2}$/, '');
  // Strip 8-digit date snapshots like -20251001, -20240307
  clean = clean.replace(/-\d{8}$/, '');
  // Strip 4-digit date suffixes on models with base version (e.g. gpt-4-0613, gpt-3.5-turbo-0125, mistral-large-2402)
  clean = clean.replace(/(gpt-4|gpt-3\.5-turbo|mistral-large|mistral-small|pixtral-large)-(\d{4})$/, '$1');
  
  // Normalize Llama family boundary (llama3.1-70b-instruct -> llama-3.1-70b-instruct) before version normalization
  clean = clean.replace(/^llama(\d)/, 'llama-$1');

  // Normalize hyphenated decimal versions (gpt-5-5-pro -> gpt-5.5-pro, jamba-1-5 -> jamba-1.5, mistral-medium-3-5 -> mistral-medium-3.5)
  // ONLY if not followed by b/t (e.g. 70b, 2.4t)
  clean = clean.replace(/(^|[a-z]-)(\d+)-(\d+)(?![bBtT\d])/g, '$1$2.$3');

  // Normalize underscore version separators (nemotron-3_5-lightning -> nemotron-3.5-lightning, llama-3_1-* -> llama-3.1-*)
  clean = clean.replace(/(\d+)_(\d+)/g, '$1.$2');

  // Normalize Claude aliases uniformly to: claude-[version]-[tier][modifier]
  clean = clean.replace(/^claude-(opus|sonnet|haiku|fable)-(\d+(?:\.\d+)?)(.*)$/, 'claude-$2-$1$3');
  clean = clean.replace(/^claude-(\d+(?:\.\d+)?)-(opus|sonnet|haiku|fable)(.*)$/, 'claude-$1-$2$3');

  // Normalize Mistral aliases
  clean = clean.replace(/^open-mistral-nemo$/, 'mistral-nemo');
  clean = clean.replace(/^mistral-medium-3\.5$/, 'mistral-3.5-medium');
  clean = clean.replace(/^mistral-medium-3\.1$/, 'mistral-3.1-medium');
  clean = clean.replace(/^mistral-large-3$/, 'mistral-3-large');
  clean = clean.replace(/^codestral-latest$/, 'codestral');
  clean = clean.replace(/^mistral-large-latest$/, 'mistral-large');
  clean = clean.replace(/^mistral-small-latest$/, 'mistral-small');

  // Normalize Qwen aliases (qwen-2.5 -> qwen2.5, qwen-3 -> qwen3)
  clean = clean.replace(/^qwen-(\d+(?:\.\d+)?)/, 'qwen$1');

  // Normalize GLM aliases (glm-5p2 -> glm-5.2)
  clean = clean.replace(/^glm-(\d+)p(\d+)/, 'glm-$1.$2');

  return clean;
}

function getGeneratedCanonicalId(rawModel) {
  const canonical = rawModel && typeof rawModel.canonical_id === 'string' && rawModel.canonical_id
    ? rawModel.canonical_id
    : rawModel && rawModel.id;
  return getCleanModelId(canonical);
}

function normalizeSlug(slug) {
  if (!slug) return '';
  const clean = getCleanModelId(slug);
  return clean
    .replace(/[-_.]/g, '')
    .replace(/(chat|preview|instruct|it|image|latest|highspeed|customtools|coder|scout|maverick|v\d+)/g, '')
    .trim();
}

function getHumanFriendlyName(id) {
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
}

let unifiedModels = [];

function getCleanCreatorName(ownedBy) {
  if (!ownedBy) return 'Other';
  const raw = ownedBy.toLowerCase().trim();
  for (const [key, value] of Object.entries(CREATOR_NAMES)) {
    if (raw === key || raw.includes(key)) {
      return value;
    }
  }
  return ownedBy.charAt(0).toUpperCase() + ownedBy.slice(1);
}

function getModelCreator(modelId, rawOwnedBy) {
  const cleanId = getCleanModelId(modelId);
  const id = cleanId.toLowerCase();
  const rawId = (modelId || '').toLowerCase();
  
  if (id.startsWith('gpt-') || id.startsWith('text-embedding-') || id.startsWith('gpt') || id.startsWith('o1') || id.startsWith('o3') || id.startsWith('o4') || rawId.includes('openai')) return 'OpenAI';
  if (id.startsWith('claude-') || id.includes('claude') || rawId.includes('anthropic')) return 'Anthropic';
  if (id.startsWith('gemini-') || id.startsWith('gemma-') || id.startsWith('gemma') || rawId.includes('google/')) return 'Google';
  if (id.startsWith('deepseek-') || id.startsWith('deepseek') || id === 'r1' || rawId.includes('deepseek')) return 'DeepSeek';
  if (id.startsWith('mistral-') || id.startsWith('ministral-') || id.startsWith('pixtral-') || id.startsWith('codestral-') || id.startsWith('devstral-') || id.startsWith('voxtral') || id.startsWith('mixtral-') || rawId.includes('mistral')) return 'Mistral AI';
  if (id.startsWith('qwen-') || id.startsWith('qwen') || id.startsWith('qwq') || rawId.includes('alibaba') || rawId.includes('qwen')) return 'Alibaba Cloud';
  if (id.startsWith('glm-') || id.startsWith('glm') || rawId.includes('zhipu') || rawId.includes('zai-org')) return 'Zhipu AI';
  if (id.startsWith('kimi-') || id.startsWith('kimi') || rawId.includes('moonshot')) return 'Moonshot AI';
  if (id.startsWith('llama-') || id.startsWith('llama') || rawId.includes('meta-llama') || rawId.includes('meta/')) return 'Meta';
  if (id.startsWith('minimax-') || id.startsWith('minimax')) return 'MiniMax AI';
  if (id.startsWith('grok-') || id.startsWith('grok') || rawId.includes('xai')) return 'xAI';
  if (id.startsWith('sonar-') || id.startsWith('sonar') || rawId.includes('perplexity')) return 'Perplexity';
  if (id.startsWith('nova-') || id.startsWith('amazon-nova')) return 'Amazon';
  if (id.startsWith('apertus-')) return 'Swiss AI';
  if (id.startsWith('hy3') || rawId.includes('tencent')) return 'Tencent';
  if (id.startsWith('mimo-') || rawId.includes('xiaomi')) return 'Xiaomi';
  if (id.startsWith('cosmos') || id.startsWith('nvidia-') || id.startsWith('nemotron-') || rawId.includes('nvidia')) return 'NVIDIA';
  if (id.startsWith('hermes-') || rawId.includes('nousresearch')) return 'Nous Research';
  if (id.startsWith('holo')) return 'H Company';
  if (id.startsWith('granite-') || rawId.includes('ibm')) return 'IBM';
  if (id.startsWith('command-') || id.startsWith('cohere-') || rawId.includes('cohere')) return 'Cohere';
  if (id.startsWith('jamba-') || rawId.includes('ai21')) return 'AI21 Labs';
  if (id.startsWith('palmyra-') || rawId.includes('writer')) return 'Writer';
  if (id.startsWith('minicpm-') || rawId.includes('openbmb')) return 'OpenBMB';
  
  return getCleanCreatorName(rawOwnedBy);
}

const STANDARD_CAPABILITIES = ['Reasoning', 'Tools', 'Vision', 'Code', 'Audio', 'Structured Output', 'Prompt Caching'];

const CAPABILITY_DESCRIPTIONS = {
  Reasoning: 'Extended thinking for multi-step analysis and complex problem solving.',
  Tools: 'Can call external tools or functions during a request.',
  Vision: 'Can understand and analyze images or other visual inputs.',
  Code: 'Optimized for writing, reviewing, or completing code.',
  Audio: 'Supports audio input or output, depending on the provider.',
  'Structured Output': 'Can return responses in a required schema or structured format.',
  'Prompt Caching': 'Can reuse prompt content to reduce latency and input cost.'
};

const PROVIDER_DISPLAY_NAMES = {
  mammouth: 'Mammouth AI',
  cortecs: 'Cortecs',
  mistral: 'Mistral AI',
  edenai: 'Eden AI',
  opper: 'Opper AI',
  eurouter: 'EURouter',
  requesty: 'Requesty AI'
};

const PROVIDER_BADGE_CLASS = 'badge-provider';

function areCostsEqual(a, b) {
  return Math.abs(a - b) <= Math.max(1e-9, Math.max(Math.abs(a), Math.abs(b)) * 1e-9);
}

function renderUpdateWarning() {
  const el = document.getElementById('update-warning');
  if (!el || typeof UPDATE_STATUS === 'undefined') return;
  const names = {
    mammouth: 'Mammouth AI', cortecs: 'Cortecs', mistral: 'Mistral AI',
    edenai: 'Eden AI', opper: 'Opper AI', eurouter: 'EURouter', requesty: 'Requesty AI'
  };
  const failed = Object.entries(names)
    .filter(([id]) => UPDATE_STATUS[id] === false)
    .map(([, name]) => name);
  if (UPDATE_STATUS.exchangeRate === false) failed.push('exchange rates');
  if (failed.length === 0) return;
  el.textContent = `Warning: the last update failed for: ${failed.join(', ')}.`;
  el.hidden = false;
}

function normalizeOffer(providerId, rawModel) {
  if (!rawModel) return null;
  const effectiveProviderId = providerId === 'mistral-regional' ? 'mistral' : providerId;
  const idLower = (rawModel.id || '').toLowerCase();
  
  // 1. Creator extraction
  const rawOwner = rawModel.owned_by || rawModel.author || (rawModel.author_info && rawModel.author_info.display_name) || rawModel.provider_display_name;
  let creator = rawModel.creator || getModelCreator(rawModel.id, rawOwner);
  if (effectiveProviderId === 'mistral') {
    creator = /@regional$/i.test(rawModel.id || '') ? 'Mistral AI Regional' : 'Mistral AI';
  }

  // 2. Limits extraction
  let contextSize = null;
  let maxOutputTokens = null;

  if (providerId === 'cortecs') {
    contextSize = typeof rawModel.context_size === 'number' ? rawModel.context_size : null;
    maxOutputTokens = typeof rawModel.max_output_tokens === 'number' ? rawModel.max_output_tokens : null;
  } else if (providerId === 'mammouth') {
    if (rawModel.model_info) {
      contextSize = rawModel.model_info.max_input_tokens || rawModel.model_info.max_output_tokens || null;
      maxOutputTokens = rawModel.model_info.max_output_tokens || null;
    }
  } else if (effectiveProviderId === 'mistral') {
    contextSize = typeof rawModel.context_size === 'number' ? rawModel.context_size : null;
  } else if (providerId === 'edenai') {
    contextSize = typeof rawModel.context_length === 'number' ? rawModel.context_length : null;
  } else if (providerId === 'opper') {
    contextSize = typeof rawModel.context_window === 'number' ? rawModel.context_window : null;
    maxOutputTokens = typeof rawModel.max_output_tokens === 'number' ? rawModel.max_output_tokens : null;
  } else if (providerId === 'eurouter') {
    contextSize = typeof rawModel.context_length === 'number' ? rawModel.context_length : null;
  } else if (providerId === 'requesty') {
    contextSize = typeof rawModel.context_window === 'number' ? rawModel.context_window : null;
    maxOutputTokens = typeof rawModel.max_output_tokens === 'number' ? rawModel.max_output_tokens : null;
  }

  // 3. Capabilities extraction
  const capabilities = new Set();
  const capabilityStatus = {};
  const capabilityObject = rawModel.capabilities && !Array.isArray(rawModel.capabilities) ? rawModel.capabilities : {};
  const explicitlyFalse = (...values) => values.some(value => value === false);
  const recordCapability = (capability, supported, unsupported) => {
    capabilityStatus[capability] = supported ? 'supported' : (unsupported ? 'unsupported' : 'unknown');
    if (supported) capabilities.add(capability);
  };

  // Explicit or inferred Reasoning
  const hasReasoning = 
    (providerId === 'cortecs' && ((Array.isArray(rawModel.supported_features) && rawModel.supported_features.includes('reasoning')) || (Array.isArray(rawModel.tags) && rawModel.tags.includes('Reasoning')))) ||
    (providerId === 'requesty' && rawModel.supports_reasoning === true) ||
    (providerId === 'opper' && Array.isArray(rawModel.capabilities) && rawModel.capabilities.includes('reasoning')) ||
    (providerId === 'eurouter' && (rawModel.reasoning === true || (Array.isArray(rawModel.tags) && rawModel.tags.includes('reasoning')))) ||
    (providerId === 'edenai' && rawModel.capabilities && (rawModel.capabilities.reasoning || rawModel.capabilities.thought)) ||
    (/\b(reason|reasoner|reasoning|r1|thinking|cot)\b/i.test(idLower) || /qwen3.*thinking/i.test(idLower));
  recordCapability('Reasoning', hasReasoning, explicitlyFalse(
    rawModel.supports_reasoning,
    capabilityObject.supports_reasoning,
    capabilityObject.reasoning,
    capabilityObject.thought
  ));

  // Explicit or inferred Tools / Function Calling
  const hasTools = 
    (providerId === 'cortecs' && ((Array.isArray(rawModel.supported_features) && rawModel.supported_features.includes('tools')) || (Array.isArray(rawModel.tags) && rawModel.tags.includes('Tools')))) ||
    (providerId === 'requesty' && rawModel.supports_tool_calling === true) ||
    (providerId === 'opper' && Array.isArray(rawModel.capabilities) && rawModel.capabilities.includes('tools')) ||
    (providerId === 'eurouter' && Array.isArray(rawModel.tags) && (rawModel.tags.includes('tools') || rawModel.tags.includes('function_calling'))) ||
    (providerId === 'edenai' && rawModel.capabilities && (rawModel.capabilities.tools || rawModel.capabilities.function_calling)) ||
    (providerId === 'mammouth' && /^(gpt-|claude-|gemini-|mistral-|qwen|glm-|minimax-|deepseek-v)/i.test(idLower)) ||
    (/\b(tools?|fc)\b/i.test(idLower));
  recordCapability('Tools', hasTools, explicitlyFalse(
    rawModel.supports_tool_calling,
    capabilityObject.tools,
    capabilityObject.function_calling
  ));

  // Explicit or inferred Vision / Multimodal
  const hasVision = 
    (providerId === 'cortecs' && ((Array.isArray(rawModel.input_modalities) && rawModel.input_modalities.includes('image')) || (Array.isArray(rawModel.tags) && rawModel.tags.includes('Image')))) ||
    (providerId === 'requesty' && rawModel.supports_vision === true) ||
    (providerId === 'opper' && Array.isArray(rawModel.capabilities) && rawModel.capabilities.includes('vision')) ||
    (providerId === 'eurouter' && Array.isArray(rawModel.tags) && (rawModel.tags.includes('vision') || rawModel.tags.includes('multimodal'))) ||
    (providerId === 'edenai' && rawModel.capabilities && (rawModel.capabilities.vision || (Array.isArray(rawModel.capabilities.input_modalities) && rawModel.capabilities.input_modalities.includes('image')))) ||
    (providerId === 'mammouth' && /^(gpt-4|gpt-5|claude-|gemini-|gemma-3|qwen.*vl|pixtral|glm-5v|llama-4|minimax-m3)/i.test(idLower)) ||
    (/\b(vision|image|vl|omni|pixtral|glm-5v)\b/i.test(idLower));
  recordCapability('Vision', hasVision, explicitlyFalse(
    rawModel.supports_vision,
    capabilityObject.vision
  ));

  // Explicit or inferred Code
  const hasCode = 
    (providerId === 'cortecs' && Array.isArray(rawModel.tags) && rawModel.tags.includes('Code')) ||
    (providerId === 'edenai' && rawModel.capabilities && rawModel.capabilities.code) ||
    (/\b(code|coder|codex|devstral|codestral)\b/i.test(idLower));
  recordCapability('Code', hasCode, explicitlyFalse(
    rawModel.supports_code,
    capabilityObject.code
  ));

  // Explicit or inferred Audio
  const hasAudio = 
    (providerId === 'cortecs' && ((Array.isArray(rawModel.input_modalities) && rawModel.input_modalities.includes('audio')) || (Array.isArray(rawModel.tags) && rawModel.tags.includes('Audio')))) ||
    (providerId === 'edenai' && rawModel.capabilities && Array.isArray(rawModel.capabilities.input_modalities) && rawModel.capabilities.input_modalities.includes('audio')) ||
    (/\b(audio|voice|speech|voxtral)\b/i.test(idLower));
  recordCapability('Audio', hasAudio, explicitlyFalse(
    rawModel.supports_audio,
    capabilityObject.audio
  ));

  // Explicit or inferred Structured Output / JSON Mode
  const hasStructuredOutput = 
    (providerId === 'cortecs' && Array.isArray(rawModel.supported_features) && rawModel.supported_features.includes('json_mode')) ||
    (providerId === 'requesty' && (rawModel.supports_output_json_schema || rawModel.supports_output_json_object)) ||
    (providerId === 'opper' && Array.isArray(rawModel.capabilities) && rawModel.capabilities.includes('structured_output')) ||
    (providerId === 'edenai' && rawModel.capabilities && rawModel.capabilities.structured_output) ||
    (providerId === 'mammouth' && /^(gpt-|claude-|gemini-|mistral)/i.test(idLower));
  recordCapability('Structured Output', hasStructuredOutput, explicitlyFalse(
    rawModel.supports_output_json_schema,
    rawModel.supports_output_json_object,
    capabilityObject.structured_output
  ));

  // Prompt Caching — tri-state via published rates or explicit provider flags
  const cachingState = getOfferCacheSupport(effectiveProviderId, rawModel);
  recordCapability('Prompt Caching',
    cachingState === 'priced' || cachingState === 'flagged',
    explicitlyFalse(
      rawModel.supports_caching,
      capabilityObject.caching,
      capabilityObject.prompt_caching
    ) || cachingState === 'unsupported'
  );

  // 4. Description extraction
  const description = rawModel.description && typeof rawModel.description === 'string' && rawModel.description.trim() ? rawModel.description.trim() : null;

  // 5. European Infrastructure & Privacy
  const hosts = (Array.isArray(rawModel.providers) ? rawModel.providers : [])
    .map(h => typeof h === 'string' ? h : (h?.name || h?.id || h?.provider || ''))
    .filter(Boolean);
  const regions = (Array.isArray(rawModel.regions) ? rawModel.regions : (rawModel.region ? [rawModel.region] : []))
    .map(r => typeof r === 'string' ? r : (r?.name || r?.code || r?.region || ''))
    .filter(Boolean);
  const zeroRetention = rawModel.data_retention_days === 0;
  const noTraining = rawModel.data_used_for_training === false;

  return {
    providerId,
    providerName: PROVIDER_DISPLAY_NAMES[providerId] || providerId,
    rawModelId: rawModel.id,
    rawModel,
    creator,
    contextSize,
    maxOutputTokens,
    capabilities: [...capabilities],
    capabilityStatus,
    description,
    infrastructure: {
      hosts,
      regions,
      zeroRetention,
      noTraining,
      geolocation: rawModel.geolocation || null
    }
  };
}

function extractVersionNumber(id) {
  if (!id) return 0;
  const m = id.match(/(?:^|[^\d])(\d+(?:\.\d+)?)(?![bBtT\d])/);
  return m ? parseFloat(m[1]) : 0;
}

function resolveLatestAliases(groups) {
  const latestGroups = groups.filter(g => g.canonicalId.endsWith('-latest'));

  for (const latestGroup of latestGroups) {
    const providerIds = Object.keys(latestGroup.normalizedOffers);

    for (const providerId of providerIds) {
      const latestNorm = latestGroup.normalizedOffers[providerId];
      const latestRaw = latestGroup.offers[providerId];
      const inCost = getOfferInputCost(providerId, latestRaw);
      const outCost = getOfferOutputCost(providerId, latestRaw);
      const context = latestNorm.contextSize;
      const creator = latestGroup.creator;

      // Extract family keywords to match appropriate sibling groups
      const idStr = latestGroup.canonicalId.toLowerCase();
      let famKeyword = '';
      if (idStr.includes('opus')) famKeyword = 'opus';
      else if (idStr.includes('sonnet')) famKeyword = 'sonnet';
      else if (idStr.includes('haiku')) famKeyword = 'haiku';
      else if (idStr.includes('fable')) famKeyword = 'fable';
      else if (idStr.includes('flash')) famKeyword = 'flash';
      else if (idStr.includes('pro')) famKeyword = 'pro';
      else if (idStr.includes('mini')) famKeyword = 'mini';
      else if (idStr.includes('grok-4')) famKeyword = 'grok-4';
      else if (idStr.includes('grok-3')) famKeyword = 'grok-3';
      else if (idStr.includes('devstral')) famKeyword = 'devstral';
      else if (idStr.includes('magistral')) famKeyword = 'magistral';
      else if (idStr.includes('mistral')) famKeyword = 'mistral';

      // Find candidates from the same provider and same creator
      const candidates = groups.filter(g => {
        if (g === latestGroup) return false;
        if (g.canonicalId.endsWith('-latest')) return false;
        if (g.creator !== creator) return false;
        if (!g.normalizedOffers[providerId]) return false;
        if (famKeyword && !g.canonicalId.includes(famKeyword)) return false;

        const targetRaw = g.offers[providerId];
        const targetNorm = g.normalizedOffers[providerId];
        const targetIn = getOfferInputCost(providerId, targetRaw);
        const targetOut = getOfferOutputCost(providerId, targetRaw);

        // Check costs (allowing minor regional routing variance up to 15%)
        const diffIn = Math.abs(targetIn - inCost) / (Math.max(targetIn, inCost) || 1);
        const diffOut = Math.abs(targetOut - outCost) / (Math.max(targetOut, outCost) || 1);
        if (diffIn > 0.15 || diffOut > 0.15) return false;
        // Check context if available
        if (context > 0 && targetNorm.contextSize > 0 && targetNorm.contextSize !== context) return false;

        return true;
      });

      if (candidates.length > 0) {
        // Sort by highest version number descending
        candidates.sort((a, b) => extractVersionNumber(b.canonicalId) - extractVersionNumber(a.canonicalId));
        const bestTarget = candidates[0];

        const targetNorm = bestTarget.normalizedOffers[providerId];
        targetNorm.alternateSlugs = targetNorm.alternateSlugs || [];
        targetNorm.alternateSlugs.push({
          rawModelId: latestNorm.rawModelId,
          label: 'latest'
        });

        delete latestGroup.offers[providerId];
        delete latestGroup.normalizedOffers[providerId];
      }
    }
  }

  // Remove empty latest groups
  for (let i = groups.length - 1; i >= 0; i--) {
    if (Object.keys(groups[i].normalizedOffers).length === 0) {
      groups.splice(i, 1);
    }
  }
}

function processAndUnifyModels() {
  if (!Array.isArray(cortecsModels)) cortecsModels = [];
  if (!Array.isArray(mammouthModels)) mammouthModels = [];
  if (!Array.isArray(mistralModels)) mistralModels = [];
  if (!Array.isArray(edenaiModels)) edenaiModels = [];
  if (!Array.isArray(opperModels)) opperModels = [];
  if (!Array.isArray(eurouterModels)) eurouterModels = [];
  if (!Array.isArray(requestyModels)) requestyModels = [];

  const groups = []; // Array of grouped canonical models
  const canonicalRawIds = new Map(); // canonicalId -> Map(providerId -> Set(raw ID))

  function recordRawId(canonicalId, providerId, rawId) {
    if (!rawId) return;
    if (!canonicalRawIds.has(canonicalId)) canonicalRawIds.set(canonicalId, new Map());
    const byProvider = canonicalRawIds.get(canonicalId);
    if (!byProvider.has(providerId)) byProvider.set(providerId, new Set());
    byProvider.get(providerId).add(rawId);
  }
  
  function findGroup(rawModel) {
    const cleanBaseId = getGeneratedCanonicalId(rawModel);
    const slug = normalizeSlug(rawModel.id);
    const digits = cleanBaseId.replace(/[^0-9]/g, '');
    const canonicalId = cleanBaseId;
    
    return groups.find(g => {
      if (g.canonicalId === canonicalId) return true;
      
      const gSlug = normalizeSlug(g.canonicalId);
      const gCleanBaseId = getCleanModelId(g.canonicalId);
      const gDigits = gCleanBaseId.replace(/[^0-9]/g, '');
      return gSlug === slug && gDigits === digits;
    });
  }
  
  function addOffer(providerId, rawModel) {
    const normalized = normalizeOffer(providerId, rawModel);
    if (!normalized) return;

    let group = findGroup(rawModel);
    if (!group) {
      const cleanBaseId = getGeneratedCanonicalId(rawModel);
      const canonicalId = cleanBaseId;
      
      group = {
        canonicalId,
        creator: normalized.creator,
        offers: {},
        normalizedOffers: {}
      };
      groups.push(group);
    }
    
    const offerKey = providerId === 'mistral' && /@regional$/i.test(rawModel.id)
      ? 'mistral-regional'
      : providerId;
    group.offers[offerKey] = rawModel;
    group.normalizedOffers[offerKey] = normalized;
    recordRawId(group.canonicalId, offerKey, rawModel.id);
    
    if (providerId === 'cortecs' || group.creator === 'Other' || (normalized.creator && normalized.creator !== 'Other')) {
      group.creator = getModelCreator(group.canonicalId, normalized.creator);
    }
  }
  
  cortecsModels.forEach(m => addOffer('cortecs', m));
  mammouthModels.forEach(m => addOffer('mammouth', m));
  mistralModels.forEach(m => addOffer('mistral', m));
  edenaiModels.forEach(m => addOffer('edenai', m));
  opperModels.forEach(m => addOffer('opper', m));
  eurouterModels.forEach(m => addOffer('eurouter', m));
  requestyModels.forEach(m => addOffer('requesty', m));

  // Smart resolution of generic floating latest models into the provider's matching concrete version
  resolveLatestAliases(groups);
  
  unifiedModels = groups.map(g => {
    const offerList = Object.values(g.normalizedOffers);
    const totalOffers = offerList.length;

    // Strict Consensus Capabilities: Supported by 100% of providers offering this model
    const universalCapabilities = STANDARD_CAPABILITIES.filter(cap => 
      offerList.every(off => off.capabilities.includes(cap))
    );

    // Partial Capabilities: Supported by at least one but NOT all providers
    const partialCapabilities = STANDARD_CAPABILITIES
      .filter(cap => offerList.some(off => off.capabilities.includes(cap)) && !offerList.every(off => off.capabilities.includes(cap)))
      .map(cap => {
        const supportedProviders = offerList.filter(off => off.capabilities.includes(cap)).map(off => off.providerName);
        return {
          capability: cap,
          supportedCount: supportedProviders.length,
          totalCount: totalOffers,
          providers: supportedProviders
        };
      });

    // Guaranteed Limits: Minimum floor across all offering providers
    const validContexts = offerList.map(off => off.contextSize).filter(v => typeof v === 'number' && v > 0);
    const contextMin = validContexts.length > 0 ? Math.min(...validContexts) : null;
    const contextMax = validContexts.length > 0 ? Math.max(...validContexts) : null;

    const validOutputs = offerList.map(off => off.maxOutputTokens).filter(v => typeof v === 'number' && v > 0);
    const maxOutputMin = validOutputs.length > 0 ? Math.min(...validOutputs) : null;
    const maxOutputMax = validOutputs.length > 0 ? Math.max(...validOutputs) : null;

    // Pick richest description available
    const descriptions = offerList.map(off => off.description).filter(Boolean);
    descriptions.sort((a, b) => b.length - a.length);
    const description = descriptions.length > 0 ? descriptions[0] : null;

    // Per-provider capability lookup
    const supportsCaching = {};
    for (const off of offerList) {
      supportsCaching[off.providerId] = off.capabilities.includes('Prompt Caching');
    }

    return {
      id: g.canonicalId,
      name: offerList.find(off => off.rawModel.display_name)?.rawModel.display_name || g.canonicalId,
      creator: g.creator,
      description,
      context_size: contextMin,
      contextMin,
      contextMax,
      maxOutput: maxOutputMin,
      maxOutputMin,
      maxOutputMax,
      tags: universalCapabilities,
      universalCapabilities,
      partialCapabilities,
      offers: g.offers,
      normalizedOffers: g.normalizedOffers,
      supportsCaching,
      matched: totalOffers >= 2,
      cortecs: g.offers.cortecs || null,
      mammouth: g.offers.mammouth || null,
       mistral: g.offers.mistral || null,
      edenai: g.offers.edenai || null,
      opper: g.offers.opper || null,
      eurouter: g.offers.eurouter || null,
      requesty: g.offers.requesty || null,
      alternateIdsByProvider: Object.fromEntries(
        [...(canonicalRawIds.get(g.canonicalId) || new Map()).entries()].map(([pid, set]) => [pid, [...set].sort()])
      )
    };
  }).filter(model => {
    return getInputCostPerMillion(model) !== null && getOutputCostPerMillion(model) !== null;
  });
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
  
  if (providerId === 'mistral') {
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

  if (providerId === 'requesty') {
    if (offer.input_price === undefined) return null;
    const priceUsd = offer.input_price * 1000000;
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
  
  if (providerId === 'mistral') {
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

  if (providerId === 'requesty') {
    if (offer.output_price === undefined) return null;
    const priceUsd = offer.output_price * 1000000;
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
  } else if (providerId === 'mistral') {
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
  } else if (providerId === 'requesty') {
    read = convertPerMillionRate(usdPerTokenToPerMillion(offer.cached_price), 'USD', currency);
    write = convertPerMillionRate(usdPerTokenToPerMillion(offer.caching_price), 'USD', currency);
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
  const activeOffers = [];
  for (const [providerId, offer] of getActiveOffers(modelObj)) {
    const cost = getOfferInputCost(providerId, offer, currency);
    if (cost !== null) activeOffers.push(cost);
  }
  return activeOffers.length > 0 ? Math.min(...activeOffers) : null;
}

function getOutputCostPerMillion(modelObj, currency = selectedCurrency) {
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

    const largestCost = unifiedModels.reduce((max, model) => {
      const cost = getter(model);
      return typeof cost === 'number' ? Math.max(max, cost) : max;
    }, 0);
    const scaleMax = Math.max(largestCost, COST_LOG_MIN);
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

function applyFiltersAndRender() {
  let filtered = unifiedModels.filter(m => {
    // 1. Model ID filter (Search Query)
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const cleanName = getHumanFriendlyName(m.id).toLowerCase();
      if (!m.id.toLowerCase().includes(q) && !cleanName.includes(q)) return false;
    }

    // 2. Source / Provider Select (multi)
    if (selectedProvider.length > 0) {
      let showRow = false;
      for (const sel of selectedProvider) {
        if (sel === 'matched' && m.matched) { showRow = true; break; }
        if (m.offers[sel]) { showRow = true; break; }
      }
      if (!showRow) return false;
    }

    // 3. Creator Select
    if (selectedCreator !== 'all' && m.creator !== selectedCreator) return false;

    // 4. Min Context Size Filter
    const contextRange = getContextRange(m);
    if (minContextSize > 0) {
      // Unknown context limits should remain visible; the filter only excludes
      // models whose known minimum is below the requested threshold.
      if (contextRange.min && contextRange.min < minContextSize) return false;
    }

    // 5. Best input/output price ranges
    const inputCost = getInputCostPerMillion(m);
    const outputCost = getOutputCostPerMillion(m);
    if (inputCost === null || outputCost === null) return false;
    const inputRange = costFilterRanges.input;
    const outputRange = costFilterRanges.output;
    if (inputCost === null
      ? inputRange.min > 0 || inputRange.max < inputRange.scaleMax
      : inputCost < inputRange.min || inputCost > inputRange.max) return false;
    if (outputCost === null
      ? outputRange.min > 0 || outputRange.max < outputRange.scaleMax
      : outputCost < outputRange.min || outputCost > outputRange.max) return false;

    return true;
  });

  // Apply Sorting
  filtered.sort((a, b) => {
    let valA, valB;
    
    switch (currentSortColumn) {
      case 'id':
        // Sort by the name shown in the table, not the provider-specific ID.
        valA = getHumanFriendlyName(a.id || '');
        valB = getHumanFriendlyName(b.id || '');
        break;
      case 'creator':
        valA = a.creator;
        valB = b.creator;
        break;
      case 'context':
        valA = getContextRange(a).min || 0;
        valB = getContextRange(b).min || 0;
        break;
      case 'input':
        valA = getInputCostPerMillion(a) ?? Infinity;
        valB = getInputCostPerMillion(b) ?? Infinity;
        break;
      case 'output':
        valA = getOutputCostPerMillion(a) ?? Infinity;
        valB = getOutputCostPerMillion(b) ?? Infinity;
        break;
      case 'workload':
        valA = getWorkloadCost(a) || Infinity;
        valB = getWorkloadCost(b) || Infinity;
        break;
      default:
        valA = a.id;
        valB = b.id;
    }

    if (typeof valA === 'string') {
      const comparison = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
      if (comparison !== 0) {
        return currentSortDirection === 'asc' ? comparison : -comparison;
      }

      // Keep models with identical display names deterministic.
      const idComparison = String(a.id || '').localeCompare(String(b.id || ''), undefined, { sensitivity: 'base' });
      return currentSortDirection === 'asc' ? idComparison : -idComparison;
    } else {
      return currentSortDirection === 'asc' 
        ? valA - valB 
        : valB - valA;
    }
  });

  const countDisplay = document.getElementById('model-count-display');
  if (countDisplay) {
    countDisplay.textContent = `${filtered.length}/${unifiedModels.length} shown`;
  }

  const totalDisplay = document.getElementById('model-total-display');
  if (totalDisplay) totalDisplay.textContent = unifiedModels.length;

  renderTable(filtered);
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

  // Active-filter hint on the collapsed summary line
  const hint = document.getElementById('workload-active-hint');
  if (hint) {
    hint.hidden = !onlyCachingProviders;
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
  
  if (val < 0.01) {
    return `${sym}${val.toFixed(4)}`;
  }
  return `${sym}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderTable(models) {
  const tbody = document.getElementById('models-table-body');
  if (!tbody) return;

  if (models.length === 0) {
    const isInitialLoad = (typeof unifiedModels === 'undefined' || unifiedModels.length === 0);
    if (isInitialLoad) return;
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            <p>No models match your filter criteria.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = models.map(m => {
    const inputCost = getInputCostPerMillion(m);
    const outputCost = getOutputCostPerMillion(m);

    // Minimum context format for the currently selected providers.
    const contextRange = getContextRange(m);
    let contextStr = '<span style="color: var(--text-dark);">Unknown</span>';
    if (contextRange.min) {
      if (contextRange.max !== null && contextRange.min < contextRange.max) {
        const tooltip = `Minimum Context Window: ${contextRange.min.toLocaleString()} tokens\n(Range across ${contextRange.count} providers: ${contextRange.min.toLocaleString()} – ${contextRange.max.toLocaleString()} tokens)`;
        contextStr = `<span title="${tooltip}" style="cursor: help; border-bottom: 1px dotted;">${contextRange.min.toLocaleString()}</span>`;
      } else {
        contextStr = contextRange.min.toLocaleString();
      }
    }

    // Provider badges list (respects the caching visibility filter)
    const availableProvidersHtml = getActiveOffers(m).map(([providerId]) => {
      const providerName = PROVIDER_DISPLAY_NAMES[providerId] || providerId;
      return `<span class="badge ${PROVIDER_BADGE_CLASS}" style="margin-right: 4px; font-size: 0.7rem;">${providerName}</span>`;
    }).join('');

    // Best Provider details column — same per-offer basis as the workload cost
    const bestDetails = getBestProviderDetails(m);
    let bestProviderHtml = '<span style="color: var(--text-dark);">N/A</span>';
    if (bestDetails) {
      const allOfferCosts = getActiveOffers(m)
        .map(([pid, offer]) => {
          const ic = getOfferEffectiveInputCost(pid, offer);
          const oc = getOfferOutputCost(pid, offer);
          if (ic === null || oc === null) return null;
          return { pid, name: PROVIDER_DISPLAY_NAMES[pid] || pid, total: ic + oc };
        })
        .filter(Boolean)
        .sort((a, b) => a.total - b.total);
      const bestTotal = allOfferCosts.length ? allOfferCosts[0].total : null;
      const tooltipLines = allOfferCosts.map(o => {
        if (!areCostsEqual(o.total, bestTotal)) {
          const mult = (o.total / bestTotal).toFixed(1);
          return `${o.name} ${mult}×`;
        }
        return `${o.name} (lowest listed price)`;
      });
      const tooltipAttr = tooltipLines.length > 1
        ? ` title="All providers (sorted by cost):\n${tooltipLines.join('\n')}"`
        : '';
      const lowestProviderBadges = bestDetails.providerIds.map(providerId => {
        const providerName = PROVIDER_DISPLAY_NAMES[providerId] || providerId;
        return `<span class="badge ${PROVIDER_BADGE_CLASS}" style="margin-right: 4px; font-size: 0.7rem;">${providerName}</span>`;
      }).join('');
      bestProviderHtml = `<span style="cursor: help;"${tooltipAttr}>${lowestProviderBadges}</span>`;
    }

    // Cost (your workload) column — cache-adjusted when the math toggle is on
    const workloadCost = getWorkloadCost(m);
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
        `(${workloadInputTokens.toLocaleString()} in + ${workloadOutputTokens.toLocaleString()} out) ÷ 1,000,000`;
    } else {
      workloadTooltip =
        `Lowest-priced offer: ${formatCurrency(inputCost)} input + ${formatCurrency(outputCost)} output per 1M\n` +
        `(${workloadInputTokens.toLocaleString()} in + ${workloadOutputTokens.toLocaleString()} out) × rate ÷ 1,000,000`;
    }
    const workloadHtml = `<span title="${workloadTooltip}" style="cursor: help; border-bottom: 1px dotted;">${workloadFmt}</span>`;

    // Strict Universal Capabilities on Table Row
    const tagsHtml = m.universalCapabilities && m.universalCapabilities.length > 0
      ? m.universalCapabilities.slice(0, 4).map(t => `<span class="tag-badge" title="Universal capability: supported by 100% of providers offering this model">${t}</span>`).join('')
      : '';

    return `
      <tr class="clickable-row" onclick="openComparison('${m.id}')" title="Click to view details and provider comparison">
        <td>
          <div class="model-name">${getHumanFriendlyName(m.id)}</div>
          <div class="tag-list" style="margin-top: 4px;">
            ${tagsHtml}
          </div>
        </td>
        <td>
          <span style="font-weight: 500; font-size: 0.85rem;">${m.creator}</span>
        </td>
        <td>
          <div style="display: flex; flex-wrap: wrap; gap: 4px;">
            ${availableProvidersHtml}
          </div>
        </td>
        <td style="font-family: var(--font-mono);">${contextStr}</td>
        <td style="font-family: var(--font-mono);">${formatCurrency(inputCost)}</td>
        <td style="font-family: var(--font-mono);">${formatCurrency(outputCost)}</td>
        <td style="font-family: var(--font-mono);">${workloadHtml}</td>
        <td>${bestProviderHtml}</td>
      </tr>
    `;
  }).join('');
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
  }
  return out;
}

function openModalWithSelection(modelObj) {
  const overlay = document.getElementById('detail-overlay');
  const modalContent = document.querySelector('.modal-content');

  if (!overlay || !modalContent) return;

  document.getElementById('modal-title-text').textContent = getHumanFriendlyName(modelObj.id);

  const offersList = [];
  // Respect the caching visibility filter so the modal matches the table's offers.
  for (const [providerId, rawOffer] of getActiveOffers(modelObj)) {
    const normOffer = (modelObj.normalizedOffers && modelObj.normalizedOffers[providerId]) || normalizeOffer(providerId, rawOffer);
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
    }

    offersList.push({
      providerId,
      providerName: normOffer.providerName,
      inCost,
      outCost,
      cacheRates,
      cacheSupportState,
      nativeCache,
      totalCost: inCost !== null && outCost !== null ? inCost + outCost : Infinity,
      origIn,
      origOut,
      normOffer,
      offer: rawOffer
    });
  }

  offersList.sort((a, b) => a.totalCost - b.totalCost);

  // 1. Overview Section: Description + Consensus Guarantee Bar
  const descHtml = modelObj.description 
    ? `<div class="modal-model-desc">${modelObj.description}</div>`
    : '';

  const guaranteedContextStr = modelObj.contextMin 
    ? (modelObj.contextMin < modelObj.contextMax ? `${modelObj.contextMin.toLocaleString()} tokens (up to ${modelObj.contextMax.toLocaleString()})` : `${modelObj.contextMin.toLocaleString()} tokens`)
    : 'Unknown';

  const guaranteedMaxOutStr = modelObj.maxOutputMin 
    ? (modelObj.maxOutputMin < modelObj.maxOutputMax ? `${modelObj.maxOutputMin.toLocaleString()} tokens (up to ${modelObj.maxOutputMax.toLocaleString()})` : `${modelObj.maxOutputMin.toLocaleString()} tokens`)
    : 'Standard';

  const universalBadgesHtml = (modelObj.universalCapabilities && modelObj.universalCapabilities.length > 0)
    ? modelObj.universalCapabilities.map(c => `<span class="cap-badge-universal" title="Guaranteed across ALL providers offering this model">✓ ${c}</span>`).join('')
    : '<span style="font-size:0.75rem; color:var(--text-dark);">None guaranteed across all offers</span>';

  const partialBadgesHtml = (modelObj.partialCapabilities && modelObj.partialCapabilities.length > 0)
    ? modelObj.partialCapabilities.map(p => `<span class="cap-badge-partial" title="Supported by ${p.providers.join(', ')} only (${p.supportedCount}/${p.totalCount} providers)">⚠ ${p.capability} (${p.providers.join(', ')})</span>`).join('')
    : '';

  const overviewHtml = `
    <div class="modal-overview-section">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <span style="font-size:0.75rem; color:var(--text-dark); text-transform:uppercase; font-weight:800; letter-spacing:0.04em;">Creator: <span style="color:var(--text-main);">${modelObj.creator}</span></span>
        <span style="font-size:0.72rem; color:var(--text-muted); background:rgba(255,255,255,0.04); padding:2px 8px; border-radius:4px; border:1px solid var(--border-color);">${offersList.length} Active European Offer${offersList.length > 1 ? 's' : ''}</span>
      </div>
      ${descHtml}
      <div class="modal-consensus-bar">
        <div class="consensus-metric-group">
          <div class="consensus-metric">
            <span class="metric-lbl">Guaranteed Context</span>
            <span class="metric-val">${guaranteedContextStr}</span>
          </div>
          <div class="consensus-metric">
            <span class="metric-lbl">Guaranteed Max Output</span>
            <span class="metric-val">${guaranteedMaxOutStr}</span>
          </div>
        </div>
        <div class="consensus-caps">
          ${universalBadgesHtml}
          ${partialBadgesHtml}
        </div>
      </div>
    </div>
  `;

  // 2. Provider Comparison Cards Grid
  const cardsHtml = offersList.map((off, idx) => {
    const badgeClass = PROVIDER_BADGE_CLASS;
    const cardStyle = 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color);';

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
            <span class="val" style="font-size:0.9rem; font-weight:700; font-family:var(--font-mono); color:var(--savings-color);">${formatCurrency(off.cacheRates.read)}<span style="font-size:0.68rem; color:var(--text-muted); font-weight:400;"> ${off.nativeCache.read}</span></span>
          </div>
        `);
      }
      if (off.cacheRates.write !== null) {
        cacheRows.push(`
          <div style="display:flex; justify-content:space-between; align-items:baseline; gap:8px;">
            <span class="lbl" style="font-size:0.65rem; color:var(--savings-color); text-transform:uppercase; font-weight:700;">Cache Write / 1M</span>
            <span class="val" style="font-size:0.9rem; font-weight:700; font-family:var(--font-mono); color:var(--savings-color);">${formatCurrency(off.cacheRates.write)}<span style="font-size:0.68rem; color:var(--text-muted); font-weight:400;"> ${off.nativeCache.write}</span></span>
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

    // Infrastructure / EU Host Badges
    const infra = off.normOffer.infrastructure || {};
    const infraItems = [];
    if (infra.hosts && Array.isArray(infra.hosts) && infra.hosts.length > 0) {
      const formattedHosts = infra.hosts.map(h => {
        if (!h) return '';
        const str = typeof h === 'string' ? h : (h.name || h.id || h.provider || String(h));
        return str ? (str.charAt(0).toUpperCase() + str.slice(1)) : '';
      }).filter(Boolean);
      if (formattedHosts.length > 0) {
        infraItems.push(`EU Hosts: ${formattedHosts.join(', ')}`);
      }
    }
    if (infra.regions && Array.isArray(infra.regions) && infra.regions.length > 0) {
      const formattedRegions = infra.regions.map(r => {
        if (!r) return '';
        return typeof r === 'string' ? r : (r.name || r.code || r.region || String(r));
      }).filter(Boolean);
      if (formattedRegions.length > 0) {
        infraItems.push(`Region: ${formattedRegions.join(', ')}`);
      }
    }
    if (infra.zeroRetention) {
      infraItems.push(`🛡 0-Day Retention`);
    }
    if (infra.noTraining) {
      infraItems.push(`🔒 No Training`);
    }

    const infraHtml = infraItems.length > 0
      ? `<div style="font-size:0.68rem; color:var(--text-muted); background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:4px; border:1px solid var(--border-color); margin-top:4px;">${infraItems.join(' • ')}</div>`
      : '';

    const offerContext = off.normOffer.contextSize ? `${off.normOffer.contextSize.toLocaleString()} context` : 'Standard context';
    const offerMaxOut = off.normOffer.maxOutputTokens ? `${off.normOffer.maxOutputTokens.toLocaleString()} max out` : '';
    const limitsStr = [offerContext, offerMaxOut].filter(Boolean).join(' • ');

    // Other raw IDs this provider lists for the same canonical model (region pins collapsed)
    const providerAltIds = [...new Set(
      ((modelObj.alternateIdsByProvider && modelObj.alternateIdsByProvider[off.providerId]) || [])
        .map(displayModelId)
        .filter(Boolean)
        .filter(id => id !== displayModelId(off.normOffer.rawModelId))
    )];
    const sameModelIdsHtml = providerAltIds.length > 0
      ? `<div style="margin-top: 6px;">
          <span style="font-size:0.6rem; color:var(--text-dark); text-transform:uppercase; font-weight:700; display:block; margin-bottom: 3px;">Same Model Listed As (${providerAltIds.length})</span>
          <div style="display:flex; flex-wrap:wrap; gap:4px;">
            ${providerAltIds.map(id => `<code style="font-family:var(--font-mono); font-size:0.66rem; color:var(--text-muted); background:rgba(255,255,255,0.03); border:1px solid var(--border-color); padding:1px 5px; border-radius:4px;">${escapeHtml(id)}</code>`).join('')}
          </div>
        </div>`
      : '';

    return `
      <div class="modal-model-card" style="--card-i:${idx}; ${cardStyle}">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="badge ${badgeClass}">${off.providerName}</span>
        </div>

        <div class="modal-card-slug">
          <span style="font-size:0.65rem; color:var(--text-dark); text-transform:uppercase; font-weight:700; display:block; margin-bottom: 4px;">API Model Slug</span>
          <div class="slug-copy-container" style="display:flex; align-items:center; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 5px 8px; border-radius: 6px; justify-content:space-between; gap: 8px;">
            <code style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-main); word-break:break-all;">${displayModelId(off.normOffer.rawModelId)}</code>
            <button class="copy-slug-btn" onclick="navigator.clipboard.writeText('${displayModelId(off.normOffer.rawModelId)}'); showCopyTooltip(this);" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding: 2px; display:flex; align-items:center; transition: color 0.15s;" title="Copy to clipboard">
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

        ${off.normOffer.alternateSlugs && off.normOffer.alternateSlugs.length > 0 ? `
          <div style="margin-top: auto; padding-top: 0.25rem;">
            <span style="font-size:0.6rem; color:var(--text-dark); text-transform:uppercase; font-weight:700; display:block; margin-bottom: 3px;">Also Available As (Rolling Alias)</span>
            ${off.normOffer.alternateSlugs.map(alt => `
              <div class="slug-copy-container" style="display:flex; align-items:center; background: rgba(255,255,255,0.015); border: 1px dashed var(--border-color); padding: 3px 6px; border-radius: 5px; justify-content:space-between; gap: 6px; margin-bottom: 4px;">
                  <code style="font-family:var(--font-mono); font-size:0.7rem; color:var(--text-muted); word-break:break-all;">${displayModelId(alt.rawModelId)}</code>
                <button class="copy-slug-btn" onclick="navigator.clipboard.writeText('${displayModelId(alt.rawModelId)}'); showCopyTooltip(this);" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding: 2px; display:flex; align-items:center;" title="Copy alias slug">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2 2v1"></path></svg>
                </button>
              </div>
            `).join('')}
          </div>
        ` : ''}
        ${sameModelIdsHtml}
        ${infraHtml}
      </div>
    `;
  }).join('');

  modalContent.innerHTML = `
    ${overviewHtml}
    <div class="modal-cards-grid">
      ${cardsHtml}
    </div>
    <p class="comparison-note">
      <strong>Price comparison only.</strong> Listed prices do not indicate overall suitability. Before choosing a provider, verify supported features such as caching and tools, rate limits and quotas, context and output limits, latency, availability and reliability, data retention and training policies, data residency, security and compliance requirements, API compatibility, support, and SLA terms.
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
      
      selectedCurrency = option.dataset.currency;
      console.log('Switched currency to:', selectedCurrency);
      
      configureCostFilters();
      applyFiltersAndRender();
    });
  }

  // 3. Inline Header Filters
  const filterIdInput = document.getElementById('filter-id');
  if (filterIdInput) {
    filterIdInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      applyFiltersAndRender();
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

    minInput.addEventListener('input', e => updateRange('min', e));
    maxInput.addEventListener('input', e => updateRange('max', e));
    minInput.addEventListener('change', () => applyFiltersAndRender());
    maxInput.addEventListener('change', () => applyFiltersAndRender());
  });

  // 2b. Workload estimator inputs
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
      applyFiltersAndRender();
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
        applyFiltersAndRender();
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
        applyFiltersAndRender();
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

  // Prevent sorting when clicking inside header filter inputs/selects
  document.querySelectorAll('.header-filter-input, .provider-filter-toggle, .provider-filter-menu').forEach(el => {
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
