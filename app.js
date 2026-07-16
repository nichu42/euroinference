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

// Filter state
let searchQuery = '';
let activeTab = 'all'; // 'all', 'matched', 'mammouth', 'cortecs'
let selectedProvider = []; // array of selected provider filter values; empty = no filter
let selectedCreator = 'all'; // 'all' or specific creator name
let selectedTag = 'all'; // 'all' or specific capability tag

// Workload estimator inputs (used to compute the "Cost (your workload)" column).
// Defaults: 10K input / 1K output tokens — near the OpenRouter 2025 medians with light headroom.
// 0 = no minimum context filter (the table already skews long-context; 87% of models are 128K+).
let minContextSize = 0;
let workloadInputTokens = 10000;
let workloadOutputTokens = 1000;

// Sorting state
let currentSortColumn = 'id';
let currentSortDirection = 'asc'; // 'asc' or 'desc'

// Explicit overrides mapping (Cortecs ID -> Mammouth ID)
const STRICT_ALIASES = {
  'claude-opus4-8': 'claude-opus-4-8',
  'claude-opus4-7': 'claude-opus-4-7',
  'claude-opus4-6': 'claude-opus-4-6',
  'claude-opus4-5': 'claude-opus-4-5',
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite-preview',
  'mistral-small-3.2-24b-instruct-2506': 'mistral-small-3.2-24b-instruct',
  'mistral-medium-3.5': 'mistral-medium-3-5',
  'claude-4-6-sonnet': 'claude-sonnet-4-6',
  'claude-4-5-sonnet': 'claude-sonnet-4-5',
  'claude-4-opus': 'claude-opus-4',
  'claude-4-sonnet': 'claude-sonnet-4',
  'claude-4-haiku': 'claude-haiku-4',
  'mistral-large-latest': 'mistral-large',
  'mistral-small-latest': 'mistral-small',
  'codestral-latest': 'codestral-2506',
  'codestral': 'codestral-2506',
  'mistral-small-24b': 'mistral-small'
};

// Map of raw creator strings to clean display names
const CREATOR_NAMES = {
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'google': 'Google',
  'deepseek': 'DeepSeek',
  'mistral ai': 'Mistral AI',
  'mistral': 'Mistral AI',
  'alibaba cloud': 'Alibaba Cloud',
  'z.ai': 'Zhipu AI',
  'moonshot ai': 'Moonshot AI',
  'nvidia': 'NVIDIA',
  'amazon': 'Amazon',
  'meta': 'Meta',
  'nousresearch': 'Nous Research',
  'xiaomimimo': 'Xiaomi',
  'tencent hy': 'Tencent',
  'swiss ai initiative': 'Swiss AI',
  'h company': 'H Company',
  'openbmb': 'OpenBMB'
};

// --- DATA FETCHING & INITIALIZATION ---

async function init() {
  loadExchangeRate();
  await fetchModels();

  processAndUnifyModels();
  setupUIEventListeners();
  renderCreatorsFilter();
  applyFiltersAndRender();
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
  console.log('Loading model data from local fallback cache...');
  mammouthModels = (typeof MAMMOUTH_FALLBACK !== 'undefined') ? MAMMOUTH_FALLBACK : [];
  cortecsModels = (typeof CORTECTS_FALLBACK !== 'undefined') ? CORTECTS_FALLBACK : [];
  mistralModels = (typeof MISTRAL_FALLBACK !== 'undefined') ? MISTRAL_FALLBACK : [];
  edenaiModels = (typeof EDENAI_FALLBACK !== 'undefined') ? EDENAI_FALLBACK : [];
  opperModels = (typeof OPPER_FALLBACK !== 'undefined') ? OPPER_FALLBACK : [];
  eurouterModels = (typeof EUROUTER_FALLBACK !== 'undefined') ? EUROUTER_FALLBACK : [];
  requestyModels = (typeof REQUESTY_FALLBACK !== 'undefined') ? REQUESTY_FALLBACK : [];
  
  console.log('Loaded models count:', 
    mammouthModels.length, cortecsModels.length, mistralModels.length,
    edenaiModels.length, opperModels.length, eurouterModels.length, requestyModels.length
  );
}

// --- NORMALIZATION & MATCHING ENGINE ---

function getCleanModelId(id) {
  if (!id) return '';
  let clean = id.toLowerCase();
  
  if (clean.includes('/')) {
    clean = clean.split('/').pop();
  }
  
  if (clean.includes(':')) {
    clean = clean.split(':').pop();
  }
  
  if (clean.includes('@')) {
    clean = clean.split('@')[0];
  }
  
  clean = clean.replace(/^(anthropic|openai|google|meta|cohere|mistral|amazon|ibm|alibaba|zhipu|moonshot|microsoft|snowflake|deepseek|ai21)\./i, '');
  clean = clean.replace(/-v\d+$/i, '');
  
  return clean;
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
  let name = getCleanModelId(id);
  
  const manualMappings = {
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',
    'gpt-4-turbo': 'GPT-4 Turbo',
    'gpt-3.5-turbo': 'GPT-3.5 Turbo',
    'gpt-4': 'GPT-4',
    'gpt-5.1-chat': 'GPT-5.1 Chat',
    'gpt-5.1-codex-max': 'GPT-5.1 Codex Max',
    'claude-3-5-sonnet': 'Claude 3.5 Sonnet',
    'claude-3-opus': 'Claude 3 Opus',
    'claude-3-sonnet': 'Claude 3 Sonnet',
    'claude-3-haiku': 'Claude 3 Haiku',
    'claude-3.5-haiku': 'Claude 3.5 Haiku',
    'claude-opus-4': 'Claude 4 Opus',
    'claude-sonnet-4': 'Claude 4 Sonnet',
    'claude-haiku-4': 'Claude 4 Haiku',
    'claude-opus-4-5': 'Claude 4.5 Opus',
    'claude-opus-4-6': 'Claude 4.6 Opus',
    'claude-opus-4-7': 'Claude 4.7 Opus',
    'claude-opus-4-8': 'Claude 4.8 Opus',
    'claude-sonnet-4-5': 'Claude 4.5 Sonnet',
    'claude-sonnet-4-6': 'Claude 4.6 Sonnet',
    'claude-4-6-sonnet': 'Claude 4.6 Sonnet',
    'claude-4-5-sonnet': 'Claude 4.5 Sonnet',
    'gemini-1.5-pro': 'Gemini 1.5 Pro',
    'gemini-1.5-flash': 'Gemini 1.5 Flash',
    'gemini-2.0-flash': 'Gemini 2.0 Flash',
    'gemini-2.0-pro-exp': 'Gemini 2.0 Pro (Experimental)',
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro (Preview)',
    'gemini-3.1-flash-lite-preview': 'Gemini 3.1 Flash-Lite (Preview)',
    'gemini-3.1-flash-image-preview': 'Gemini 3.1 Flash-Image (Preview)',
    'deepseek-chat': 'DeepSeek V3 (Chat)',
    'deepseek-coder': 'DeepSeek Coder',
    'deepseek-reasoner': 'DeepSeek R1 (Reasoner)',
    'deepseek-r1': 'DeepSeek R1',
    'deepseek-r1-0528': 'DeepSeek R1 (0528)',
    'llama-3-8b-instruct': 'Llama 3 8B (Instruct)',
    'llama-3-70b-instruct': 'Llama 3 70B (Instruct)',
    'llama-3.1-8b-instruct': 'Llama 3.1 8B (Instruct)',
    'llama-3.1-70b-instruct': 'Llama 3.1 70B (Instruct)',
    'llama-3.1-405b-instruct': 'Llama 3.1 405B (Instruct)',
    'llama-3.3-70b-instruct': 'Llama 3.3 70B (Instruct)',
    'mistral-large': 'Mistral Large',
    'mistral-medium': 'Mistral Medium',
    'mistral-small': 'Mistral Small',
    'mistral-nemo': 'Mistral Nemo',
    'codestral': 'Codestral',
    'qwen3-vl-flash': 'Qwen 3 VL Flash',
    'qwen3.6-27b': 'Qwen 3.6 27B',
    'qwen-2.5-72b-instruct': 'Qwen 2.5 72B (Instruct)',
    'glm-4-flash': 'GLM 4 Flash',
    'glm-5-turbo': 'GLM 5 Turbo',
    'grok-2-beta': 'Grok 2 Beta',
    'grok-2': 'Grok 2',
    'sonar-small-chat': 'Sonar Small Chat',
    'sonar-medium-chat': 'Sonar Medium Chat'
  };

  const lower = name.toLowerCase().trim();
  if (manualMappings[lower]) {
    return manualMappings[lower];
  }

  name = name.replace(/-(eu|us|global)$/i, '');
  name = name.replace(/(\d+)-(\d+)/g, '$1.$2');
  
  return name
    .split(/[-_]/)
    .map(word => {
      if (!word) return '';
      if (/^\d+[bB]$/.test(word)) {
        return word.toUpperCase();
      }
      if (['gpt', 'llm', 'moe', 'ecb', 'api', 'vl'].includes(word.toLowerCase())) {
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
  const id = modelId.toLowerCase();
  
  if (id.startsWith('gpt-') || id.startsWith('text-embedding-3') || id.startsWith('gpt')) return 'OpenAI';
  if (id.startsWith('claude-') || id.startsWith('voxtral')) return 'Anthropic';
  if (id.startsWith('gemini-') || id.startsWith('gemma-')) return 'Google';
  if (id.startsWith('deepseek-')) return 'DeepSeek';
  if (id.startsWith('mistral-') || id.startsWith('ministral-') || id.startsWith('pixtral-') || id.startsWith('codestral-') || id.startsWith('devstral-')) return 'Mistral AI';
  if (id.startsWith('qwen-') || id.startsWith('qwen')) return 'Alibaba Cloud';
  if (id.startsWith('glm-')) return 'Zhipu AI';
  if (id.startsWith('kimi-')) return 'Moonshot AI';
  if (id.startsWith('llama-')) return 'Meta';
  if (id.startsWith('minimax-')) return 'MiniMax AI';
  if (id.startsWith('grok-')) return 'xAI';
  if (id.startsWith('sonar-')) return 'Perplexity';
  if (id.startsWith('nova-') || id.startsWith('voxtral-')) return 'Amazon';
  if (id.startsWith('apertus-')) return 'Swiss AI';
  if (id.startsWith('hy3')) return 'Tencent';
  if (id.startsWith('mimo-')) return 'Xiaomi';
  if (id.startsWith('cosmos') || id.startsWith('nvidia-') || id.startsWith('nemotron-')) return 'NVIDIA';
  if (id.startsWith('hermes-')) return 'Nous Research';
  if (id.startsWith('holo')) return 'H Company';
  
  return getCleanCreatorName(rawOwnedBy);
}

function processAndUnifyModels() {
  if (!Array.isArray(cortecsModels)) cortecsModels = [];
  if (!Array.isArray(mammouthModels)) mammouthModels = [];
  if (!Array.isArray(mistralModels)) mistralModels = [];
  if (!Array.isArray(edenaiModels)) edenaiModels = [];
  if (!Array.isArray(opperModels)) opperModels = [];
  if (!Array.isArray(eurouterModels)) eurouterModels = [];
  if (!Array.isArray(requestyModels)) requestyModels = [];

  const groups = []; // Array of { canonicalId, creator, context_size, tags, offers: { mammouth, cortecs, mistral, edenai, opper, eurouter, requesty } }
  
  function findGroup(id) {
    const slug = normalizeSlug(id);
    const cleanBaseId = getCleanModelId(id);
    const digits = cleanBaseId.replace(/[^0-9]/g, '');
    const canonicalId = STRICT_ALIASES[cleanBaseId] || cleanBaseId;
    
    return groups.find(g => {
      if (g.canonicalId === canonicalId) return true;
      
      const gSlug = normalizeSlug(g.canonicalId);
      const gCleanBaseId = getCleanModelId(g.canonicalId);
      const gDigits = gCleanBaseId.replace(/[^0-9]/g, '');
      return gSlug === slug && gDigits === digits;
    });
  }
  
  function addOffer(provider, rawModel) {
    let group = findGroup(rawModel.id);
    const idLower = rawModel.id.toLowerCase();
    if (!group) {
      const cleanBaseId = getCleanModelId(rawModel.id);
      const canonicalId = STRICT_ALIASES[cleanBaseId] || cleanBaseId;
      
      let creator = 'Other';
      if (provider === 'cortecs') {
        creator = getCleanCreatorName(rawModel.owned_by);
      } else if (provider === 'mistral') {
        creator = 'Mistral AI';
      } else if (provider === 'edenai') {
        creator = getCleanCreatorName(rawModel.owned_by);
      } else if (provider === 'opper') {
        creator = rawModel.provider_display_name || 'Other';
      } else if (provider === 'eurouter') {
        creator = (rawModel.author_info && rawModel.author_info.display_name) || getCleanCreatorName(rawModel.author);
      } else {
        creator = getModelCreator(rawModel.id, rawModel.owned_by);
      }
      
      let context_size = null;
      if (provider === 'cortecs') context_size = rawModel.context_size;
      else if (provider === 'mammouth') context_size = rawModel.model_info.max_input_tokens || rawModel.model_info.max_output_tokens || null;
      else if (provider === 'mistral') context_size = rawModel.context_size;
      else if (provider === 'edenai') context_size = rawModel.context_length;
      else if (provider === 'opper') context_size = rawModel.context_window;
      else if (provider === 'eurouter') context_size = rawModel.context_length;
      else if (provider === 'requesty') context_size = rawModel.context_window;
      
      const tags = [];
      if (idLower.includes('vision') || idLower.includes('image')) tags.push('Image');
      if (idLower.includes('code') || idLower.includes('codex') || idLower.includes('coder') || idLower.includes('devstral')) tags.push('Code');
      if (idLower.includes('tool')) tags.push('Tools');
      if (idLower.includes('research') || idLower.includes('reason') || idLower.includes('r1')) tags.push('Reasoning');
      if (provider === 'cortecs' && rawModel.supported_features) {
        if (rawModel.supported_features.includes('reasoning') && !tags.includes('Reasoning')) tags.push('Reasoning');
        if (rawModel.supported_features.includes('tools') && !tags.includes('Tools')) tags.push('Tools');
      }
      
      group = {
        canonicalId,
        creator,
        context_size,
        tags,
        offers: {},
        supportsReasoning: {}
      };
      groups.push(group);
    }
    
    group.offers[provider] = rawModel;
    group.supportsReasoning[provider] = idLower.includes('research') || idLower.includes('reason') || idLower.includes('r1') ||
      (provider === 'cortecs' && Array.isArray(rawModel.supported_features) && rawModel.supported_features.includes('reasoning'));
    
    if (provider === 'cortecs') {
      group.creator = getCleanCreatorName(rawModel.owned_by);
    }
    
    if (!group.context_size) {
      if (provider === 'cortecs') group.context_size = rawModel.context_size;
      else if (provider === 'mammouth') group.context_size = rawModel.model_info.max_input_tokens || rawModel.model_info.max_output_tokens || null;
      else if (provider === 'mistral') group.context_size = rawModel.context_size;
      else if (provider === 'edenai') group.context_size = rawModel.context_length;
      else if (provider === 'opper') group.context_size = rawModel.context_window;
      else if (provider === 'eurouter') group.context_size = rawModel.context_length;
      else if (provider === 'requesty') group.context_size = rawModel.context_window;
    }
  }
  
  cortecsModels.forEach(m => addOffer('cortecs', m));
  mammouthModels.forEach(m => addOffer('mammouth', m));
  mistralModels.forEach(m => addOffer('mistral', m));
  edenaiModels.forEach(m => addOffer('edenai', m));
  opperModels.forEach(m => addOffer('opper', m));
  eurouterModels.forEach(m => addOffer('eurouter', m));
  requestyModels.forEach(m => addOffer('requesty', m));
  
  unifiedModels = groups.map(g => {
    return {
      id: g.canonicalId,
      name: g.canonicalId,
      creator: g.creator,
      context_size: g.context_size,
      tags: g.tags,
      offers: g.offers,
      supportsReasoning: g.supportsReasoning,
      matched: Object.keys(g.offers).length >= 2,
      cortecs: g.offers.cortecs || null,
      mammouth: g.offers.mammouth || null,
      mistral: g.offers.mistral || null,
      edenai: g.offers.edenai || null,
      opper: g.offers.opper || null,
      eurouter: g.offers.eurouter || null,
      requesty: g.offers.requesty || null
    };
  });
}

function getOfferInputCost(providerId, offer, currency = selectedCurrency) {
  if (!offer) return null;
  
  if (providerId === 'cortecs') {
    if (!offer.pricing || offer.pricing.input_token === undefined) return 0;
    const priceEur = offer.pricing.input_token;
    return currency === 'EUR' ? priceEur : priceEur * exchangeRate;
  }
  
  if (providerId === 'mammouth') {
    if (!offer.model_info || offer.model_info.input_cost_per_token === undefined) return 0;
    const priceUsd = offer.model_info.input_cost_per_token * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }
  
  if (providerId === 'mistral') {
    if (!offer.pricing || offer.pricing.input_token === undefined) return 0;
    const priceUsd = offer.pricing.input_token;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'edenai') {
    if (!offer.pricing || offer.pricing.input_cost_per_token === undefined) return 0;
    const priceUsd = offer.pricing.input_cost_per_token * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'opper') {
    if (!offer.pricing || !Array.isArray(offer.pricing.input) || offer.pricing.input.length === 0) return 0;
    const priceUsd = offer.pricing.input[0];
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'eurouter') {
    if (!offer.pricing || offer.pricing.prompt === undefined) return 0;
    const origCur = offer.pricing.currency || 'EUR';
    const priceVal = parseFloat(offer.pricing.prompt) * 1000000;
    if (origCur === 'EUR') {
      return currency === 'EUR' ? priceVal : priceVal * exchangeRate;
    } else {
      return currency === 'USD' ? priceVal : priceVal / exchangeRate;
    }
  }

  if (providerId === 'requesty') {
    if (offer.input_price === undefined) return 0;
    const priceUsd = offer.input_price * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }
  
  return null;
}

function getOfferOutputCost(providerId, offer, currency = selectedCurrency) {
  if (!offer) return null;
  
  if (providerId === 'cortecs') {
    if (!offer.pricing || offer.pricing.output_token === undefined) return 0;
    const priceEur = offer.pricing.output_token;
    return currency === 'EUR' ? priceEur : priceEur * exchangeRate;
  }
  
  if (providerId === 'mammouth') {
    if (!offer.model_info || offer.model_info.output_cost_per_token === undefined) return 0;
    const priceUsd = offer.model_info.output_cost_per_token * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }
  
  if (providerId === 'mistral') {
    if (!offer.pricing || offer.pricing.output_token === undefined) return 0;
    const priceUsd = offer.pricing.output_token;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'edenai') {
    if (!offer.pricing || offer.pricing.output_cost_per_token === undefined) return 0;
    const priceUsd = offer.pricing.output_cost_per_token * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'opper') {
    if (!offer.pricing || !Array.isArray(offer.pricing.output) || offer.pricing.output.length === 0) return 0;
    const priceUsd = offer.pricing.output[0];
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }

  if (providerId === 'eurouter') {
    if (!offer.pricing || offer.pricing.completion === undefined) return 0;
    const origCur = offer.pricing.currency || 'EUR';
    const priceVal = parseFloat(offer.pricing.completion) * 1000000;
    if (origCur === 'EUR') {
      return currency === 'EUR' ? priceVal : priceVal * exchangeRate;
    } else {
      return currency === 'USD' ? priceVal : priceVal / exchangeRate;
    }
  }

  if (providerId === 'requesty') {
    if (offer.output_price === undefined) return 0;
    const priceUsd = offer.output_price * 1000000;
    return currency === 'USD' ? priceUsd : priceUsd / exchangeRate;
  }
  
  return null;
}

function getInputCostPerMillion(modelObj, currency = selectedCurrency) {
  const activeOffers = [];
  for (const [providerId, offer] of Object.entries(modelObj.offers)) {
    const cost = getOfferInputCost(providerId, offer, currency);
    if (cost !== null) activeOffers.push(cost);
  }
  return activeOffers.length > 0 ? Math.min(...activeOffers) : 0;
}

function getOutputCostPerMillion(modelObj, currency = selectedCurrency) {
  const activeOffers = [];
  for (const [providerId, offer] of Object.entries(modelObj.offers)) {
    const cost = getOfferOutputCost(providerId, offer, currency);
    if (cost !== null) activeOffers.push(cost);
  }
  return activeOffers.length > 0 ? Math.min(...activeOffers) : 0;
}

function getInputCostPerMillionWithReasoning(modelObj, currency = selectedCurrency) {
  const activeOffers = [];
  for (const [providerId, offer] of Object.entries(modelObj.offers)) {
    if (!modelObj.supportsReasoning || !modelObj.supportsReasoning[providerId]) continue;
    const cost = getOfferInputCost(providerId, offer, currency);
    if (cost !== null) activeOffers.push(cost);
  }
  return activeOffers.length > 0 ? Math.min(...activeOffers) : null;
}

function getOutputCostPerMillionWithReasoning(modelObj, currency = selectedCurrency) {
  const activeOffers = [];
  for (const [providerId, offer] of Object.entries(modelObj.offers)) {
    if (!modelObj.supportsReasoning || !modelObj.supportsReasoning[providerId]) continue;
    const cost = getOfferOutputCost(providerId, offer, currency);
    if (cost !== null) activeOffers.push(cost);
  }
  return activeOffers.length > 0 ? Math.min(...activeOffers) : null;
}

// Total cost for a representative workload using the model's best offer.
// Uses workloadInputTokens / workloadOutputTokens (per 1M tokens → /1,000,000).
function getWorkloadCost(modelObj, currency = selectedCurrency) {
  const inCost = getInputCostPerMillion(modelObj, currency);
  const outCost = getOutputCostPerMillion(modelObj, currency);
  if (inCost === 0 || outCost === 0) return 0;
  return (inCost * workloadInputTokens + outCost * workloadOutputTokens) / 1000000;
}

function getBestProviderDetails(modelObj, currency = selectedCurrency) {
  const activeOffers = [];
  for (const [providerId, offer] of Object.entries(modelObj.offers)) {
    const inCost = getOfferInputCost(providerId, offer, currency);
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
  
  const best = activeOffers[0];
  
  let savingsTag = '';
  if (activeOffers.length > 1) {
    const nextCheapest = activeOffers[1];
    const savingsPercent = Math.round((1 - best.totalCost / nextCheapest.totalCost) * 100);
    if (savingsPercent > 0) {
      savingsTag = `Save ${savingsPercent}%`;
    }
  }
  
  const providerNames = {
    mammouth: 'Mammouth AI',
    cortecs: 'Cortecs',
    mistral: 'Mistral AI',
    edenai: 'Eden AI',
    opper: 'Opper AI',
    eurouter: 'EURouter',
    requesty: 'Requesty AI'
  };
  
  return {
    providerId: best.providerId,
    providerName: providerNames[best.providerId],
    savingsTag
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
    if (minContextSize > 0) {
      if (!m.context_size || m.context_size < minContextSize) return false;
    }

    return true;
  });

  // Apply Sorting
  filtered.sort((a, b) => {
    let valA, valB;
    
    switch (currentSortColumn) {
      case 'id':
        valA = a.id;
        valB = b.id;
        break;
      case 'creator':
        valA = a.creator;
        valB = b.creator;
        break;
      case 'context':
        valA = a.context_size || 0;
        valB = b.context_size || 0;
        break;
      case 'input':
        valA = getInputCostPerMillion(a);
        valB = getInputCostPerMillion(b);
        break;
      case 'output':
        valA = getOutputCostPerMillion(a);
        valB = getOutputCostPerMillion(b);
        break;
      case 'savings':
        const detailsA = getBestProviderDetails(a);
        const detailsB = getBestProviderDetails(b);
        const pctA = detailsA && detailsA.savingsTag ? parseInt(detailsA.savingsTag.replace(/[^0-9]/g, '')) : -1;
        const pctB = detailsB && detailsB.savingsTag ? parseInt(detailsB.savingsTag.replace(/[^0-9]/g, '')) : -1;
        valA = pctA;
        valB = pctB;
        break;
      case 'reasoning':
        // Sort by total reasoning-aware cost (input + output), lowest first.
        valA = (() => { const i = getInputCostPerMillionWithReasoning(a); const o = getOutputCostPerMillionWithReasoning(a); return (i === null || o === null) ? Infinity : i + o; })();
        valB = (() => { const i = getInputCostPerMillionWithReasoning(b); const o = getOutputCostPerMillionWithReasoning(b); return (i === null || o === null) ? Infinity : i + o; })();
        break;
      case 'workload':
        // Sort by workload cost (lowest first); push models with no pricing to the bottom.
        valA = getWorkloadCost(a) || Infinity;
        valB = getWorkloadCost(b) || Infinity;
        break;
      default:
        valA = a.id;
        valB = b.id;
    }

    if (typeof valA === 'string') {
      return currentSortDirection === 'asc' 
        ? valA.localeCompare(valB) 
        : valB.localeCompare(valA);
    } else {
      return currentSortDirection === 'asc' 
        ? valA - valB 
        : valB - valA;
    }
  });

  const countDisplay = document.getElementById('model-count-display');
  if (countDisplay) {
    if (filtered.length === unifiedModels.length) {
      countDisplay.textContent = unifiedModels.length;
    } else {
      countDisplay.textContent = `${filtered.length} of ${unifiedModels.length}`;
    }
  }

  renderTable(filtered);
}

// --- RENDER FUNCTIONS ---

function formatCurrency(val, currency = selectedCurrency) {
  const sym = currency === 'USD' ? '$' : '€';
  if (val === 0) return `${sym}0.00`;
  
  if (val < 0.01) {
    return `${sym}${val.toFixed(4)}`;
  }
  return `${sym}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderTable(models) {
  const tbody = document.getElementById('models-table-body');
  if (!tbody) return;

  // Distinguish "still loading / no data yet" from "filters returned nothing".
  // Before unifiedModels is populated, models.length === 0 because init() hasn't run.
  if (models.length === 0) {
    const isInitialLoad = (typeof unifiedModels === 'undefined' || unifiedModels.length === 0);
    if (isInitialLoad) {
      // Keep the static <tr id="loading-row"> that lives in index.html; nothing to do.
      return;
    }
    tbody.innerHTML = `
      <tr>
        <td colspan="9">
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

    // Context format
    const contextStr = m.context_size 
      ? m.context_size.toLocaleString() 
      : '<span style="color: var(--text-dark);">Unknown</span>';

    // Provider badges list
    const availableProvidersHtml = Object.keys(m.offers).map(providerId => {
      let badgeClass = 'badge-both';
      if (providerId === 'mammouth') badgeClass = 'badge-mammouth';
      else if (providerId === 'cortecs') badgeClass = 'badge-cortecs';
      
      const providerNames = {
        mammouth: 'Mammouth AI',
        cortecs: 'Cortecs',
        mistral: 'Mistral AI',
        edenai: 'Eden AI',
        opper: 'Opper AI',
        eurouter: 'EURouter',
        requesty: 'Requesty AI'
      };
      const providerName = providerNames[providerId] || providerId;
      return `<span class="badge ${badgeClass}" style="margin-right: 4px; font-size: 0.7rem;">${providerName}</span>`;
    }).join('');

    // Best Provider details column
    const bestDetails = getBestProviderDetails(m);
    let bestProviderHtml = '<span style="color: var(--text-dark);">N/A</span>';
    if (bestDetails) {
      // Build a tooltip with all providers and their markup vs. the cheapest.
      const allOfferCosts = Object.entries(m.offers)
        .map(([pid, offer]) => {
          const ic = getOfferInputCost(pid, offer);
          const oc = getOfferOutputCost(pid, offer);
          if (ic === null || oc === null) return null;
          return { pid, name: providerNames[pid] || pid, total: ic + oc };
        })
        .filter(Boolean)
        .sort((a, b) => a.total - b.total);
      const bestTotal = allOfferCosts.length ? allOfferCosts[0].total : null;
      const tooltipLines = allOfferCosts.map(o => {
        if (bestTotal && o.total > bestTotal) {
          const mult = (o.total / bestTotal).toFixed(1);
          return `${o.name} ${mult}×`;
        }
        return `${o.name} (best)`;
      });
      const tooltipAttr = tooltipLines.length > 1
        ? ` title="All providers (sorted by cost):\n${tooltipLines.join('\n')}"`
        : '';
      const savingsBadge = bestDetails.savingsTag
        ? `<span class="savings-tag" style="font-size:0.65rem; padding: 2px 6px; margin-left: 6px; box-shadow: none; vertical-align: middle;">${bestDetails.savingsTag}</span>`
        : '';
      bestProviderHtml = `<span style="font-weight:600; color:#fff; cursor: help; border-bottom: 1px dotted rgba(255,255,255,0.3);"${tooltipAttr}>${bestDetails.providerName}</span>${savingsBadge}`;
    }

    // Best w/ Reasoning column
    const reasonIn = getInputCostPerMillionWithReasoning(m);
    const reasonOut = getOutputCostPerMillionWithReasoning(m);
    const hasReasoning = reasonIn !== null && reasonOut !== null;
    const reasonTotal = hasReasoning ? reasonIn + reasonOut : null;
    const bestTotalAll = (() => {
      const ic = getInputCostPerMillion(m);
      const oc = getOutputCostPerMillion(m);
      return ic + oc;
    })();
    let reasoningHtml = '<span style="color: var(--text-dark);">—</span>';
    if (hasReasoning) {
      const reasonInFmt = formatCurrency(reasonIn);
      const reasonOutFmt = formatCurrency(reasonOut);
      const reasonTotalFmt = formatCurrency(reasonTotal);
      const premium = bestTotalAll > 0 ? ((reasonTotal - bestTotalAll) / bestTotalAll * 100).toFixed(0) : '0';
      const premiumSign = reasonTotal > bestTotalAll ? '+' : '';
      const reasonTooltip = `Reasoning: ${reasonInFmt} input + ${reasonOutFmt} output = ${reasonTotalFmt} / 1M\n${premiumSign}${premium}% vs. best non-reasoning`;
      reasoningHtml = `<span title="${reasonTooltip}" style="cursor: help; border-bottom: 1px dotted rgba(255,255,255,0.3);">${reasonTotalFmt}</span>`;
    }

    // Cost (your workload) column — uses the same "best offer" as the per-million columns.
    const workloadCost = getWorkloadCost(m);
    const workloadFmt = workloadCost > 0 ? formatCurrency(workloadCost) : '—';
    const workloadTooltip = workloadCost > 0
      ? `Cheapest offer: ${formatCurrency(inputCost)} input + ${formatCurrency(outputCost)} output per 1M\n(${workloadInputTokens.toLocaleString()} in + ${workloadOutputTokens.toLocaleString()} out) × rate ÷ 1,000,000`
      : 'No pricing data available';
    const workloadHtml = `<span title="${workloadTooltip}" style="cursor: help; border-bottom: 1px dotted rgba(255,255,255,0.3);">${workloadFmt}</span>`;

    return `
      <tr class="clickable-row" onclick="openComparison('${m.id}')" title="Click to view details and comparison">
        <td>
          <div style="font-weight: 600; color: #ffffff;">${getHumanFriendlyName(m.id)}</div>
          <div class="tag-list" style="margin-top: 4px;">
            ${m.tags.slice(0, 3).map(t => `<span class="tag-badge">${t}</span>`).join('')}
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
        <td style="font-family: var(--font-mono);">${reasoningHtml}</td>
        <td style="font-family: var(--font-mono);">${workloadHtml}</td>
        <td>${bestProviderHtml}</td>
      </tr>
    `;
  }).join('');
}

// Obsolete highlights and comparison tools removed

// --- MODAL POPUP SPLIT DETAILS ---

window.openComparison = function(modelId) {
  const model = unifiedModels.find(m => m.id === modelId);
  if (!model) return;

  openModalWithSelection(model);
};

function openModalWithSelection(modelObj) {
  const overlay = document.getElementById('detail-overlay');
  const modalContent = document.querySelector('.modal-content');
  const sTitle = document.getElementById('savings-title');
  const sDesc = document.getElementById('savings-desc');
  const sInputVal = document.getElementById('savings-input-val');
  const sOutputVal = document.getElementById('savings-output-val');

  if (!overlay || !modalContent) return;

  document.getElementById('modal-title-text').textContent = getHumanFriendlyName(modelObj.id);

  const offersList = [];
  for (const [providerId, offer] of Object.entries(modelObj.offers)) {
    const inCost = getOfferInputCost(providerId, offer, selectedCurrency);
    const outCost = getOfferOutputCost(providerId, offer, selectedCurrency);
    
    let origIn = '', origOut = '';
    if (providerId === 'mammouth') {
      origIn = `$${(offer.model_info.input_cost_per_token * 1000000).toFixed(2)} USD`;
      origOut = `$${(offer.model_info.output_cost_per_token * 1000000).toFixed(2)} USD`;
    } else if (providerId === 'cortecs') {
      origIn = `€${offer.pricing.input_token.toFixed(2)} EUR`;
      origOut = `€${offer.pricing.output_token.toFixed(2)} EUR`;
    } else if (providerId === 'mistral') {
      origIn = `$${offer.pricing.input_token.toFixed(2)} USD`;
      origOut = `$${offer.pricing.output_token.toFixed(2)} USD`;
    } else if (providerId === 'edenai') {
      origIn = `$${(offer.pricing.input_cost_per_token * 1000000).toFixed(2)} USD`;
      origOut = `$${(offer.pricing.output_cost_per_token * 1000000).toFixed(2)} USD`;
    } else if (providerId === 'opper') {
      origIn = `$${offer.pricing.input[0].toFixed(2)} USD`;
      origOut = `$${offer.pricing.output[0].toFixed(2)} USD`;
    } else if (providerId === 'eurouter') {
      const origCur = offer.pricing.currency || 'EUR';
      const promptCost = parseFloat(offer.pricing.prompt) * 1000000;
      const compCost = parseFloat(offer.pricing.completion) * 1000000;
      const sym = origCur === 'USD' ? '$' : '€';
      origIn = `${sym}${promptCost.toFixed(2)} ${origCur}`;
      origOut = `${sym}${compCost.toFixed(2)} ${origCur}`;
    } else if (providerId === 'requesty') {
      origIn = `$${(offer.input_price * 1000000).toFixed(2)} USD`;
      origOut = `$${(offer.output_price * 1000000).toFixed(2)} USD`;
    }

    offersList.push({
      providerId,
      providerName: providerId === 'mammouth' ? 'Mammouth AI' : (providerId === 'cortecs' ? 'Cortecs' : (providerId === 'mistral' ? 'Mistral AI' : (providerId === 'edenai' ? 'Eden AI' : (providerId === 'opper' ? 'Opper AI' : (providerId === 'eurouter' ? 'EURouter' : 'Requesty AI'))))),
      inCost,
      outCost,
      totalCost: inCost + outCost,
      origIn,
      origOut,
      offer
    });
  }

  offersList.sort((a, b) => a.totalCost - b.totalCost);

  const cardsHtml = offersList.map((off, idx) => {
    const isCheapest = idx === 0 && offersList.length > 1;
    
    const badgeClassMap = {
      mammouth: 'badge-mammouth',
      cortecs: 'badge-cortecs',
      mistral: 'badge-both',
      edenai: 'badge-both',
      opper: 'badge-both',
      eurouter: 'badge-cortecs',
      requesty: 'badge-mammouth'
    };
    const badgeClass = badgeClassMap[off.providerId] || 'badge-both';
    
    let markupBadge = '';
    if (idx > 0 && offersList.length > 1) {
      const cheapestCost = offersList[0].totalCost;
      const markupPercent = Math.round((off.totalCost - cheapestCost) / cheapestCost * 100);
      markupBadge = `<span style="font-size:0.75rem; font-weight:700; color:var(--cortecs-color); background: rgba(168, 85, 247, 0.1); padding: 2px 6px; border-radius: 4px;">+${markupPercent}% Cost</span>`;
    } else if (isCheapest) {
      markupBadge = `<span class="badge-both" style="font-size:0.7rem; padding: 2px 6px;">Best Value</span>`;
    }

    let creatorName = modelObj.creator;

    const cardStyle = isCheapest 
      ? 'background: rgba(16, 185, 129, 0.03); border: 2px solid var(--savings-color); box-shadow: 0 0 20px rgba(16, 185, 129, 0.15);' 
      : 'background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color);';

    return `
      <div class="modal-model-card" style="display:flex; flex-direction:column; padding: 1.25rem; border-radius: 12px; min-height: 200px; ${cardStyle}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.75rem;">
          <span class="badge ${badgeClass}">${off.providerName}</span>
          ${markupBadge}
        </div>
        <div style="font-family:var(--font-title); font-size:1.1rem; font-weight:800; color:#fff; margin-bottom: 0.15rem; word-break:break-all;">${getHumanFriendlyName(modelObj.id)}</div>
        <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700; margin-bottom: 1.15rem;">Creator: ${creatorName}</div>
        
        <div style="margin-bottom: 1.25rem;">
          <span style="font-size:0.65rem; color:var(--text-dark); text-transform:uppercase; font-weight:700; display:block; margin-bottom: 4px;">API Model Slug</span>
          <div class="slug-copy-container" style="display:flex; align-items:center; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 6px 10px; border-radius: 6px; justify-content:space-between; gap: 8px;">
            <code style="font-family:var(--font-mono); font-size:0.8rem; color:#e2e8f0; word-break:break-all;">${off.offer.id}</code>
            <button class="copy-slug-btn" onclick="navigator.clipboard.writeText('${off.offer.id}'); showCopyTooltip(this);" style="background:none; border:none; color:var(--text-muted); cursor:pointer; padding: 2px; display:flex; align-items:center; transition: color 0.15s;" title="Copy to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </button>
          </div>
        </div>
        
        <div class="modal-field" style="margin-bottom: 1rem;">
          <span class="lbl" style="font-size:0.7rem; color:var(--text-dark); text-transform:uppercase; font-weight:700;">Input Price (per 1M)</span>
          <span class="val" style="font-size:1.15rem; font-weight:700; font-family:var(--font-mono); color:${isCheapest ? 'var(--savings-color)' : '#fff'}">${formatCurrency(off.inCost)}</span>
          <span class="desc" style="font-size:0.75rem; color:var(--text-muted);">${off.origIn}</span>
        </div>
        
        <div class="modal-field">
          <span class="lbl" style="font-size:0.7rem; color:var(--text-dark); text-transform:uppercase; font-weight:700;">Output Price (per 1M)</span>
          <span class="val" style="font-size:1.15rem; font-weight:700; font-family:var(--font-mono); color:${isCheapest ? 'var(--savings-color)' : '#fff'}">${formatCurrency(off.outCost)}</span>
          <span class="desc" style="font-size:0.75rem; color:var(--text-muted);">${off.origOut}</span>
        </div>
      </div>
    `;
  }).join('');

  let savingsBannerHtml = '';
  if (offersList.length >= 2) {
    const best = offersList[0];
    const second = offersList[1];
    const savingsPercent = Math.round((1 - best.totalCost / second.totalCost) * 100);
    
    savingsBannerHtml = `
      <div class="price-highlight-row" style="margin-top: 1.5rem; width:100%; grid-column: 1 / -1; display:flex; justify-content:space-between; align-items:center; padding:1rem 1.5rem; border-radius:8px; background:var(--savings-bg); border:1px solid rgba(16, 185, 129, 0.2);">
        <div class="banner-text">
          <h4 id="savings-title" style="font-family:var(--font-title); font-weight:800; color:#fff; font-size:1.1rem; margin-bottom:2px;">${best.providerName} is the cheapest!</h4>
          <p id="savings-desc" style="font-size:0.85rem; color:var(--text-muted);">${savingsPercent > 0 ? `Save ${savingsPercent}% on total cost compared to the next provider.` : 'Both providers charge identical rates.'}</p>
        </div>
        <div class="savings-cost-summary" style="display:flex; gap:1.5rem;">
          <div class="summary-block">
            <span class="lbl" style="font-size:0.7rem; color:var(--text-dark); text-transform:uppercase; font-weight:700; display:block;">Total Saving</span>
            <span class="val" id="savings-input-val" style="font-size:1.5rem; font-family:var(--font-title); font-weight:800; color:var(--savings-color);">${savingsPercent}%</span>
          </div>
        </div>
      </div>
    `;
  }

  modalContent.innerHTML = `
    <div style="display:contents;">
      ${cardsHtml}
      ${savingsBannerHtml}
    </div>
  `;

  overlay.classList.add('active');
}

// --- SETUP EVENT LISTENERS ---

function setupUIEventListeners() {
  // 1. Currency Switcher Widget
  const switcher = document.getElementById('currency-switcher-widget');
  if (switcher) {
    switcher.addEventListener('click', (e) => {
      const option = e.target.closest('.currency-option');
      if (!option) return;
      
      document.querySelectorAll('.currency-option').forEach(o => o.classList.remove('active'));
      option.classList.add('active');
      
      selectedCurrency = option.dataset.currency;
      console.log('Switched currency to:', selectedCurrency);
      
      applyFiltersAndRender();
    });
  }

  // 2. Inline Header Filters
  const filterIdInput = document.getElementById('filter-id');
  if (filterIdInput) {
    filterIdInput.addEventListener('input', (e) => {
      searchQuery = e.target.value;
      applyFiltersAndRender();
    });
  }

  const filterSourceSelect = document.getElementById('filter-source');
  if (filterSourceSelect) {
    filterSourceSelect.addEventListener('change', (e) => {
      selectedProvider = Array.from(e.target.selectedOptions).map(o => o.value);
      applyFiltersAndRender();
    });
  }

  const filterCreatorSelect = document.getElementById('filter-creator');
  if (filterCreatorSelect) {
    filterCreatorSelect.addEventListener('change', (e) => {
      selectedCreator = e.target.value;
      applyFiltersAndRender();
    });
  }

  // 2b. Workload estimator inputs
  const minContextInput = document.getElementById('filter-min-context');
  if (minContextInput) {
    const handler = (e) => {
      const v = parseInt(e.target.value, 10);
      minContextSize = isNaN(v) || v < 0 ? 0 : v;
      applyFiltersAndRender();
    };
    minContextInput.addEventListener('input', handler);
    minContextInput.addEventListener('change', handler);
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

  // Prevent sorting when clicking inside header filter inputs/selects
  document.querySelectorAll('.header-filter-input, .header-filter-select').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  });

  // 3. Modal Close Button
  const modalClose = document.getElementById('modal-close-btn');
  const overlay = document.getElementById('detail-overlay');
  if (modalClose && overlay) {
    modalClose.addEventListener('click', () => {
      overlay.classList.remove('active');
    });
    
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.classList.remove('active');
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
