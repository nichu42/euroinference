// EuroInference - shared model unification engine.
// Runs in Node (scripts/update_data.js at generation time) and in the browser
// (fallback/dev path via window.EuroUnify). Pure logic only: no DOM, no
// currency conversion, no exchange rate — everything here works on native
// per-provider units so output is identical in both environments.
// Licensed under the GNU Affero General Public License v3.0 (AGPL-3.0)

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EuroUnify = factory();
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this, function () {

// Source of truth lives in config/models.json (models) + config/creators.json + config/providers.json.
// Single format for models: models.<id> {display_name, creator, aliases, providers}.
// Creators/providers are global maps in separate files.
// Hardcoded fallbacks below are used in the browser when fs is unavailable; Node (update_data.js) will
// override them live from config. Change a name/slug in config, not here. See config/README.md.
function _stripDocKeys(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
  const out = {};
  let has = false;
  for (const [k, v] of Object.entries(obj)) {
    if (k.startsWith('_')) continue;
    out[k] = v;
    has = true;
  }
  return has ? out : null;
}
let CREATOR_NAMES = {
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

let PROVIDER_DISPLAY_NAMES = {
  mammouth: 'Mammouth AI',
  cortecs: 'Cortecs',
  mistral: 'Mistral AI',
  'mistral-regional': 'Mistral AI Regional',
  edenai: 'Eden AI',
  opper: 'Opper AI',
  eurouter: 'EURouter',
  greenpt: 'GreenPT',
  requesty: 'Requesty AI',
  openrouter: 'OpenRouter'
};

try {
  if (typeof require !== 'undefined' && typeof module !== 'undefined' && module.exports) {
    const _creatorsRaw = require('./config/creators.json');
    const _providersRaw = require('./config/providers.json');
    const _creatorMap = _stripDocKeys(_creatorsRaw);
    if (_creatorMap) CREATOR_NAMES = _creatorMap;
    const _providerMap = _stripDocKeys(_providersRaw);
    if (_providerMap) PROVIDER_DISPLAY_NAMES = _providerMap;
  }
} catch (_) {}

const STANDARD_CAPABILITIES = ['Reasoning', 'Tools', 'Vision', 'Code', 'Audio', 'Structured Output', 'Prompt Caching'];

function getCleanCreatorName(ownedBy) {
  if (!ownedBy) return 'Other';
  const raw = ownedBy.toLowerCase().trim();
  // Most-specific (longest) key first so 'mistral ai regional' wins over 'mistral'
  // regardless of file order (which is now alphabetical, human-friendly).
  const entries = Object.entries(CREATOR_NAMES).sort((a, b) => b[0].length - a[0].length);
  for (const [key, value] of entries) {
    if (raw === key || raw.includes(key)) {
      return value;
    }
  }
  return ownedBy.charAt(0).toUpperCase() + ownedBy.slice(1);
}

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
  clean = clean.replace(/^(anthropic|openai|google|meta|cohere|mistral|amazon|ibm|alibaba|zhipu|moonshot|moonshotai|microsoft|snowflake|deepseek|ai21|writer|qwen|zai|nvidia|minimax|xai)\./i, '');
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

function normalizeSlug(slug) {
  if (!slug) return '';
  const clean = getCleanModelId(slug);
  return clean
    .replace(/[-_.]/g, '')
    .replace(/(chat|preview|instruct|it|image|latest|highspeed|customtools|coder|scout|maverick|v\d+)/g, '')
    .trim();
}

function getGeneratedCanonicalId(rawModel) {
  const canonical = rawModel && typeof rawModel.canonical_id === 'string' && rawModel.canonical_id
    ? rawModel.canonical_id
    : rawModel && rawModel.id;
  return getCleanModelId(canonical);
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
  if (id.startsWith('jamba-') || id.startsWith('ai21')) return 'AI21 Labs';
  if (id.startsWith('palmyra-') || rawId.includes('writer')) return 'Writer';
  if (id.startsWith('minicpm-') || rawId.includes('openbmb')) return 'OpenBMB';

  return getCleanCreatorName(rawOwnedBy);
}

// --- Region pins / data-sovereignty resolution ---

function regionBucketFromCode(code) {
  const c = String(code || '').toLowerCase();
  if (!c) return null;
  if (/^(eu|europe)/.test(c)) return 'eu';
  if (/^us/.test(c)) return 'us';
  return 'global';
}

const REGION_PIN_LABELS = { eu: 'EU', us: 'US', global: 'Global' };

// Explicit region signal carried by one raw listing: id pin (@eu, @us-east-1),
// provider-specific region fields, or null when unpinned.
function offerRegionPin(providerId, rawModel) {
  if (!rawModel) return null;
  // Mistral's @regional listings are the EU regional endpoint product.
  if (/@regional$/i.test(String(rawModel.id || ''))) return 'eu';
  const idMatch = /@([a-z][a-z0-9-]*)$/i.exec(String(rawModel.id || ''));
  if (idMatch) return regionBucketFromCode(idMatch[1]);
  if (providerId === 'edenai') {
    const codes = (Array.isArray(rawModel.regions) ? rawModel.regions : [])
      .map(r => typeof r === 'string' ? r : (r && r.code) || '')
      .map(regionBucketFromCode)
      .filter(Boolean);
    const unique = [...new Set(codes)];
    return unique.length === 1 ? unique[0] : null;
  }
  if (providerId === 'opper') return regionBucketFromCode(rawModel.region);
  if (providerId === 'requesty') return regionBucketFromCode(rawModel.geolocation);
  return null;
}

// Representative preference when a provider lists several region pins for the
// same canonical model at the same provider slot: EU pin first, then
// unpinned, then global, then explicit non-EU pins.
function listingSovereigntyRank(pin) {
  if (pin === 'eu') return 0;
  if (pin === null) return 1;
  if (pin === 'global') return 2;
  return 3;
}

// Per-offer data-sovereignty facts. Provider-level defaults from the
// sovereignty config are overridden by concrete API signals of the listing.
function resolveOfferSovereignty(providerId, rawOffer, sovereigntyConfig) {
  const cfg = sovereigntyConfig && sovereigntyConfig.providers
    ? sovereigntyConfig.providers[providerId]
    : null;
  const sov = {
    jurisdiction: null,
    zeroRetention: null,
    retentionDays: null,
    training: null,
    hosting: null,
    region: null,
    routing: null,
    details: {}
  };
  if (cfg) {
    if (cfg.jurisdiction) {
      sov.jurisdiction = { country: cfg.jurisdiction.country || '', code: cfg.jurisdiction.code || '', inEu: !!cfg.jurisdiction.in_eu };
      sov.details.jurisdiction = { detail: cfg.jurisdiction.detail || '', source: (cfg.jurisdiction.sources || [])[0] || '' };
    }
    if (cfg.retention) {
      if (typeof cfg.retention.zero_day_by_default === 'boolean') sov.zeroRetention = cfg.retention.zero_day_by_default;
      if (Number.isFinite(cfg.retention.default_days)) sov.retentionDays = cfg.retention.default_days;
      sov.details.retention = { detail: cfg.retention.detail || '', source: (cfg.retention.sources || [])[0] || '' };
    }
    if (cfg.training && typeof cfg.training.uses_customer_data === 'boolean') {
      sov.training = cfg.training.uses_customer_data;
      sov.details.training = { detail: cfg.training.detail || '', source: (cfg.training.sources || [])[0] || '' };
    }
    if (cfg.hosting && cfg.hosting.region) {
      sov.hosting = regionBucketFromCode(cfg.hosting.region);
      sov.details.hosting = { detail: cfg.hosting.detail || '', source: (cfg.hosting.sources || [])[0] || '' };
    }
    if (cfg.processing_region && cfg.processing_region.region) {
      sov.region = regionBucketFromCode(cfg.processing_region.region);
      sov.details.region = { detail: cfg.processing_region.detail || '', source: (cfg.processing_region.sources || [])[0] || '' };
    }
    if (cfg.routing && cfg.routing.model) {
      sov.routing = cfg.routing.model;
      sov.details.routing = { detail: cfg.routing.detail || '', source: (cfg.routing.sources || [])[0] || '' };
    }
  }

  // Concrete per-listing signals take precedence over provider defaults.
  if (providerId === 'requesty' && rawOffer) {
    if (typeof rawOffer.data_retention_days === 'number' && Number.isFinite(rawOffer.data_retention_days)) {
      sov.zeroRetention = rawOffer.data_retention_days === 0;
      sov.retentionDays = rawOffer.data_retention_days;
      sov.details.retention = { detail: `This model's provider declares a ${rawOffer.data_retention_days}-day retention period via the Requesty catalog.`, source: '' };
    }
    if (typeof rawOffer.data_used_for_training === 'boolean') {
      sov.training = rawOffer.data_used_for_training;
      sov.details.training = { detail: 'Training usage for this model\'s provider is declared via the Requesty catalog.', source: '' };
    }
  }
  const pin = offerRegionPin(providerId, rawOffer);
  if (pin) {
    sov.region = pin;
    sov.details.region = { detail: `Region pinned by this listing (${REGION_PIN_LABELS[pin] || pin}).`, source: '' };
  }
  return sov;
}

// --- Native pricing accessors (no currency conversion; comparisons only) ---

function positiveRate(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

// Native input/output rates for one offer, in the offer's own currency scale.
// Returns null when the provider does not expose a usable rate.
function getNativeInputCost(providerId, offer) {
  if (!offer) return null;
  switch (providerId) {
    case 'cortecs':
      return offer.pricing && offer.pricing.input_token !== undefined ? offer.pricing.input_token : null;
    case 'mammouth':
      return offer.model_info && offer.model_info.input_cost_per_token !== undefined
        ? offer.model_info.input_cost_per_token * 1000000 : null;
    case 'mistral':
    case 'mistral-regional':
      return offer.pricing ? (offer.pricing.input_token_eur ?? offer.pricing.input_token ?? null) : null;
    case 'edenai':
      return offer.pricing && offer.pricing.input_cost_per_token !== undefined
        ? offer.pricing.input_cost_per_token * 1000000 : null;
    case 'opper':
      return offer.pricing && Array.isArray(offer.pricing.input) && offer.pricing.input.length > 0
        ? offer.pricing.input[0] : null;
    case 'eurouter':
      return offer.pricing && offer.pricing.prompt !== undefined
        ? parseFloat(offer.pricing.prompt) * 1000000 : null;
    case 'greenpt':
      return offer.pricing && offer.pricing.promptToken !== undefined ? offer.pricing.promptToken : null;
    case 'requesty':
      return offer.input_price !== undefined ? offer.input_price * 1000000 : null;
    case 'openrouter':
      return offer.pricing && offer.pricing.prompt !== undefined ? offer.pricing.prompt * 1000000 : null;
    default:
      return null;
  }
}

function getNativeOutputCost(providerId, offer) {
  if (!offer) return null;
  switch (providerId) {
    case 'cortecs':
      return offer.pricing && offer.pricing.output_token !== undefined ? offer.pricing.output_token : null;
    case 'mammouth':
      return offer.model_info && offer.model_info.output_cost_per_token !== undefined
        ? offer.model_info.output_cost_per_token * 1000000 : null;
    case 'mistral':
    case 'mistral-regional':
      return offer.pricing ? (offer.pricing.output_token_eur ?? offer.pricing.output_token ?? null) : null;
    case 'edenai':
      return offer.pricing && offer.pricing.output_cost_per_token !== undefined
        ? offer.pricing.output_cost_per_token * 1000000 : null;
    case 'opper':
      return offer.pricing && Array.isArray(offer.pricing.output) && offer.pricing.output.length > 0
        ? offer.pricing.output[0] : null;
    case 'eurouter':
      return offer.pricing && offer.pricing.completion !== undefined
        ? parseFloat(offer.pricing.completion) * 1000000 : null;
    case 'greenpt':
      return offer.pricing && offer.pricing.completionToken !== undefined ? offer.pricing.completionToken : null;
    case 'requesty':
      return offer.output_price !== undefined ? offer.output_price * 1000000 : null;
    case 'openrouter':
      return offer.pricing && offer.pricing.completion !== undefined ? offer.pricing.completion * 1000000 : null;
    default:
      return null;
  }
}

// Native cache rates for one offer (offer's own currency scale), used ONLY for
// support classification. Display-time conversion lives in app.js.
function getNativeCacheRates(providerId, offer) {
  const empty = { read: null, write: null };
  if (!offer) return empty;
  let read = null;
  let write = null;
  switch (providerId) {
    case 'cortecs':
      read = positiveRate(offer.pricing?.cache_read_cost);
      write = positiveRate(offer.pricing?.cache_write_cost);
      break;
    case 'mistral':
    case 'mistral-regional':
      read = positiveRate(offer.pricing?.cached_input_token_eur ?? offer.pricing?.cached_input_token);
      break;
    case 'edenai':
      read = positiveRate(offer.pricing?.cache_read_input_token_cost)
        ?? positiveRate(offer.pricing?.input_cost_per_token_cache_hit);
      write = positiveRate(offer.pricing?.cache_creation_input_token_cost);
      break;
    case 'opper': {
      read = positiveRate(Array.isArray(offer.pricing?.cached_input) ? offer.pricing.cached_input[0] : undefined);
      write = positiveRate(Array.isArray(offer.pricing?.cache_creation) ? offer.pricing.cache_creation[0] : undefined);
      break;
    }
    case 'eurouter': {
      const rr = parseFloat(offer.pricing?.input_cache_read);
      const rw = parseFloat(offer.pricing?.input_cache_write);
      read = Number.isFinite(rr) && rr > 0 ? rr * 1000000 : null;
      write = Number.isFinite(rw) && rw > 0 ? rw * 1000000 : null;
      break;
    }
    case 'requesty':
      read = positiveRate(offer.cached_price);
      write = positiveRate(offer.caching_price);
      break;
    case 'greenpt':
      read = positiveRate(offer.pricing?.cachedPromptToken);
      break;
    case 'openrouter':
      read = positiveRate(offer.pricing?.input_cache_read);
      break;
    default:
      break;
  }
  const baseIn = getNativeInputCost(providerId, offer);
  if (read !== null && baseIn !== null && read >= baseIn) read = null;
  return { read, write };
}

// Tri-state caching support for one offer:
//   'priced'      — a published cache rate exists
//   'flagged'     — provider explicitly reports caching support without a published rate
//   'unsupported' — provider explicitly reports no caching support
//   'unknown'     — no signal in either direction
function cacheSupportState(providerId, offer) {
  if (!offer) return 'unknown';
  const { read, write } = getNativeCacheRates(providerId, offer);
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

// --- Offer normalization ---

function normalizeOffer(providerId, rawModel, sovereigntyConfig) {
  if (!rawModel) return null;
  const effectiveProviderId = providerId === 'mistral-regional' ? 'mistral' : providerId;
  const idLower = (rawModel.id || '').toLowerCase();

  // 1. Creator extraction
  const rawOwner = rawModel.owned_by || rawModel.ownedBy || rawModel.author || (rawModel.author_info && rawModel.author_info.display_name) || rawModel.provider_display_name;
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
  } else if (providerId === 'greenpt') {
    contextSize = typeof rawModel.contextWindowTokens === 'number' ? rawModel.contextWindowTokens : (typeof rawModel.context_length === 'number' ? rawModel.context_length : null);
    maxOutputTokens = typeof rawModel.maxOutputTokens === 'number' ? rawModel.maxOutputTokens : null;
  } else if (providerId === 'requesty') {
    contextSize = typeof rawModel.context_window === 'number' ? rawModel.context_window : null;
    maxOutputTokens = typeof rawModel.max_output_tokens === 'number' ? rawModel.max_output_tokens : null;
  } else if (providerId === 'openrouter') {
    contextSize = typeof rawModel.context_length === 'number' ? rawModel.context_length : null;
    maxOutputTokens = typeof rawModel.max_completion_tokens === 'number' ? rawModel.max_completion_tokens : null;
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
    (providerId === 'openrouter' && Array.isArray(rawModel.supported_parameters) && (rawModel.supported_parameters.includes('reasoning') || rawModel.supported_parameters.includes('include_reasoning'))) ||
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
    (providerId === 'openrouter' && Array.isArray(rawModel.supported_parameters) && rawModel.supported_parameters.includes('tools')) ||
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
    (providerId === 'openrouter' && Array.isArray(rawModel.input_modalities) && rawModel.input_modalities.includes('image')) ||
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
    (providerId === 'openrouter' && Array.isArray(rawModel.supported_parameters) && rawModel.supported_parameters.includes('structured_outputs')) ||
    (providerId === 'mammouth' && /^(gpt-|claude-|gemini-|mistral)/i.test(idLower));
  recordCapability('Structured Output', hasStructuredOutput, explicitlyFalse(
    rawModel.supports_output_json_schema,
    rawModel.supports_output_json_object,
    capabilityObject.structured_output
  ));

  // Prompt Caching — tri-state via published rates or explicit provider flags
  const cachingState = cacheSupportState(effectiveProviderId, rawModel);
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
  let hosts = (Array.isArray(rawModel.providers) ? rawModel.providers : [])
    .map(h => typeof h === 'string' ? h : (h?.name || h?.id || h?.provider || ''))
    .filter(Boolean);
  if (providerId === 'greenpt' && typeof rawModel.provider === 'string' && rawModel.provider.trim()) {
    hosts = [rawModel.provider.trim()];
  }
  const regions = (Array.isArray(rawModel.regions) ? rawModel.regions : (rawModel.region ? [rawModel.region] : []))
    .map(r => typeof r === 'string' ? r : (r?.name || r?.code || r?.region || ''))
    .filter(Boolean);

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
      geolocation: rawModel.geolocation || null
    }
  };
}

function extractVersionNumber(id) {
  if (!id) return 0;
  const m = id.match(/(?:^|[^\d])(\d+(?:\.\d+)?)(?![bBtT\d])/);
  return m ? parseFloat(m[1]) : 0;
}

// Deterministic representative pick when several OpenRouter slugs resolve to
// the same canonical model. Prefer the most recently listed variant: OpenRouter
// keeps legacy generation-era slugs whose names can exactly equal the canonical
// family name, so name equality is not a reliable currency signal. Ties fall
// back to the shorter cleaned id, then alphabetical order.
function betterBenchmarkRepresentative(candidate, incumbent) {
  const cc = typeof candidate.created === 'number' && Number.isFinite(candidate.created) ? candidate.created : 0;
  const ic = typeof incumbent.created === 'number' && Number.isFinite(incumbent.created) ? incumbent.created : 0;
  if (cc !== ic) return cc > ic;
  const cs = getCleanModelId(candidate.id).length;
  const is = getCleanModelId(incumbent.id).length;
  if (cs !== is) return cs < is;
  return String(candidate.id) < String(incumbent.id);
}

function attachBenchmarkOffers(groups, openrouterModels) {
  if (!Array.isArray(openrouterModels)) return;
  for (const raw of openrouterModels) {
    if (!raw || typeof raw !== 'object' || !raw.id) continue;
    let target = null;
    const primary = getGeneratedCanonicalId(raw);
    if (primary) target = groups.find(g => g.canonicalId === primary);
    if (!target) {
      // Mirror findGroup's slug+digits heuristic so snapshot-suffixed slugs
      // still match, but only when the match is unambiguous across all groups.
      const slug = normalizeSlug(raw.id);
      const digits = getCleanModelId(raw.id).replace(/[^0-9]/g, '');
      if (!slug || !digits) continue;
      const candidates = groups.filter(g =>
        normalizeSlug(g.canonicalId) === slug &&
        getCleanModelId(g.canonicalId).replace(/[^0-9]/g, '') === digits
      );
      if (candidates.length === 1) target = candidates[0];
    }
    if (!target) continue;
    if (!target.benchmarkOffer || betterBenchmarkRepresentative(raw, target.benchmarkOffer)) {
      target.benchmarkOffer = raw;
    }
  }
}

// Lean per-offer sovereignty state for serialization: scalar answers plus
// optional per-listing override texts ('od'). Shared provider-level narrative
// (jurisdiction, detail sentences, sources) lives in SOVEREIGNTY_META, emitted
// once by the updater — the browser merges both for display.
function leanSovereignty(sov) {
  const lean = {
    zeroRetention: sov.zeroRetention,
    retentionDays: sov.retentionDays,
    training: sov.training,
    hosting: sov.hosting,
    region: sov.region,
    routing: sov.routing
  };
  const od = {};
  for (const key of ['retention', 'training']) {
    const d = sov.details && sov.details[key];
    if (d && d.detail && d.source === '') od[key] = d.detail; // dynamic per-listing sentence
  }
  if (Object.keys(od).length > 0) lean.od = od;
  return lean;
}

// Full unification pipeline. Input: raw trimmed records per provider plus the
// optional OpenRouter reference list and sovereignty config. Output: the
// unified model list consumed by the UI.
function buildUnifiedModels(options) {
  const providers = options.providers || {};
  const sovereigntyConfig = options.sovereignty || null;
  const modelsDevCatalog = options.modelsDev || null;
  // Build models.dev lookup by clean ids for enrichment – see https://models.dev/models.json (provider-agnostic)
  const devByClean = new Map();
  if (modelsDevCatalog && typeof modelsDevCatalog === 'object' && !Array.isArray(modelsDevCatalog)) {
    for (const [devId, entry] of Object.entries(modelsDevCatalog)) {
      if (!entry || typeof entry !== 'object') continue;
      const keys = [devId, entry.id].filter(Boolean);
      for (const k of keys) {
        const clean = getCleanModelId(String(k));
        if (clean && !devByClean.has(clean)) devByClean.set(clean, entry);
        const slug = normalizeSlug(String(k));
        if (slug && !devByClean.has(slug)) devByClean.set(slug, entry);
      }
    }
  }
  function findModelsDevEntry(canonicalId) {
    if (!canonicalId || devByClean.size === 0) return null;
    const clean = getCleanModelId(canonicalId);
    if (devByClean.has(clean)) return devByClean.get(clean);
    const slug = normalizeSlug(canonicalId);
    if (devByClean.has(slug)) return devByClean.get(slug);
    // fallback: suffix match (e.g., canonical "gpt-5" vs dev "openai/gpt-5")
    for (const [k, v] of devByClean.entries()) {
      if (k.endsWith(clean) || clean.endsWith(k)) return v;
    }
    return null;
  }
  // Official slug from models.dev when available — single source for canonical id
  function getOfficialCanonicalId(rawModel) {
    const base = getGeneratedCanonicalId(rawModel);
    const dev = findModelsDevEntry(base);
    if (dev && dev.id) {
      const devClean = getCleanModelId(String(dev.id));
      if (devClean) return devClean;
    }
    return base;
  }
  // Provider-level narrative facts for the sovereignty footer tooltips,
  // emitted once as SOVEREIGNTY_META alongside the unified models.
  const sovereigntyMeta = {};
  if (sovereigntyConfig && sovereigntyConfig.providers) {
    for (const [pid, cfg] of Object.entries(sovereigntyConfig.providers)) {
      const meta = {};
      if (cfg.display_name) meta.display_name = cfg.display_name;
      if (cfg.jurisdiction) {
        meta.jurisdiction = {
          country: cfg.jurisdiction.country || '',
          code: cfg.jurisdiction.code || '',
          inEu: !!cfg.jurisdiction.in_eu,
          detail: cfg.jurisdiction.detail || '',
          source: (cfg.jurisdiction.sources || [])[0] || ''
        };
      }
      for (const [block, key] of [['retention', 'retention'], ['training', 'training'], ['hosting', 'hosting'], ['processing_region', 'region'], ['routing', 'routing']]) {
        if (cfg[block]) {
          meta[key] = { detail: cfg[block].detail || '', source: (cfg[block].sources || [])[0] || '' };
        }
      }
      sovereigntyMeta[pid] = meta;
    }
  }
  const groups = [];
  const canonicalRawIds = new Map(); // canonicalId -> Map(offerKey -> Set(raw ID))

  function recordRawId(canonicalId, offerKey, rawId) {
    if (!rawId) return;
    if (!canonicalRawIds.has(canonicalId)) canonicalRawIds.set(canonicalId, new Map());
    const byProvider = canonicalRawIds.get(canonicalId);
    if (!byProvider.has(offerKey)) byProvider.set(offerKey, new Set());
    byProvider.get(offerKey).add(rawId);
  }

  function findGroup(rawModel) {
    const cleanBaseId = getOfficialCanonicalId(rawModel);
    const slug = normalizeSlug(rawModel.id);
    const digits = cleanBaseId.replace(/[^0-9]/g, '');

    return groups.find(g => {
      if (g.canonicalId === cleanBaseId) return true;
      const gSlug = normalizeSlug(g.canonicalId);
      const gCleanBaseId = getCleanModelId(g.canonicalId);
      const gDigits = gCleanBaseId.replace(/[^0-9]/g, '');
      return gSlug === slug && gDigits === digits;
    });
  }

  function addOffer(providerId, rawModel) {
    const normalized = normalizeOffer(providerId, rawModel, sovereigntyConfig);
    if (!normalized) return;

    let group = findGroup(rawModel);
    if (!group) {
      group = {
        canonicalId: getOfficialCanonicalId(rawModel),
        creator: normalized.creator,
        offers: {},
        normalizedOffers: {}
      };
      groups.push(group);
    }

    const offerKey = providerId === 'mistral' && /@regional$/i.test(rawModel.id)
      ? 'mistral-regional'
      : providerId;
    // Track every listing per provider slot so regional duplicates can be
    // pruned once all records are in (an EU routing may arrive after non-EU
    // ones), then keep the best-sovereignty listing as the representative
    // (EU pin > unpinned > global > explicit non-EU pin).
    if (!group.allListings) group.allListings = {};
    if (!group.allListings[offerKey]) group.allListings[offerKey] = [];
    group.allListings[offerKey].push({ rawModel, normalized });
    const pin = offerRegionPin(providerId, rawModel);
    if (!group.regionPins) group.regionPins = {};
    if (!group.regionPins[offerKey]) group.regionPins[offerKey] = new Set();
    group.regionPins[offerKey].add(pin === null ? 'none' : pin);
    const prevRaw = group.offers[offerKey];
    if (!prevRaw || listingSovereigntyRank(pin) < listingSovereigntyRank(offerRegionPin(providerId, prevRaw))) {
      group.offers[offerKey] = rawModel;
      group.normalizedOffers[offerKey] = normalized;
    }
    recordRawId(group.canonicalId, offerKey, rawModel.id);

    if (providerId === 'cortecs' || group.creator === 'Other' || (normalized.creator && normalized.creator !== 'Other')) {
      group.creator = getModelCreator(group.canonicalId, normalized.creator);
    }
  }

  for (const [providerId, records] of Object.entries(providers)) {
    if (providerId === 'openrouter') continue; // reference offers never become regular offers
    (records || []).forEach(m => addOffer(providerId, m));
  }

  // When a provider serves the same model through several regions and an EU
  // routing is among them, drop every non-EU listing of that provider for this
  // model — offers, alternate IDs and region pins alike. EU availability makes
  // the other routings irrelevant for a European comparison.
  for (const group of groups) {
    if (!group.allListings) continue;
    for (const [offerKey, listings] of Object.entries(group.allListings)) {
      if (!Array.isArray(listings) || listings.length <= 1) continue;
      const cfgProviderId = offerKey === 'mistral-regional' ? 'mistral' : offerKey;
      const euListings = listings.filter(l => offerRegionPin(cfgProviderId, l.rawModel) === 'eu');
      if (euListings.length === 0 || euListings.length === listings.length) continue;
      const survivors = [...euListings].sort((a, b) => {
        const la = getCleanModelId(a.rawModel.id).length;
        const lb = getCleanModelId(b.rawModel.id).length;
        if (la !== lb) return la - lb;
        return String(a.rawModel.id) < String(b.rawModel.id) ? -1 : 1;
      });
      group.offers[offerKey] = survivors[0].rawModel;
      group.normalizedOffers[offerKey] = survivors[0].normalized;
      group.regionPins[offerKey] = new Set(['eu']);
      const byProvider = canonicalRawIds.get(group.canonicalId);
      if (byProvider && byProvider.has(offerKey)) {
        const keepIds = new Set(survivors.map(l => l.rawModel.id));
        const recorded = byProvider.get(offerKey);
        for (const rawId of [...recorded]) {
          if (!keepIds.has(rawId)) recorded.delete(rawId);
        }
        if (recorded.size === 0) byProvider.delete(offerKey);
      }
    }
    delete group.allListings;
  }

  // Smart resolution of generic floating latest models into the provider's matching concrete version
  const latestGroups = groups.filter(g => g.canonicalId.endsWith('-latest'));
  for (const latestGroup of latestGroups) {
    for (const providerId of Object.keys(latestGroup.normalizedOffers)) {
      const latestNorm = latestGroup.normalizedOffers[providerId];
      const latestRaw = latestGroup.offers[providerId];
      const inCost = getNativeInputCost(providerId, latestRaw);
      const outCost = getNativeOutputCost(providerId, latestRaw);
      const context = latestNorm.contextSize;
      const creator = latestGroup.creator;

      // Resolve -latest via models.dev when available (official slug)
      let bestTarget = null;
      const baseFamily = latestGroup.canonicalId.replace(/-latest$/i, '');
      const devForLatest = findModelsDevEntry(latestGroup.canonicalId) || findModelsDevEntry(baseFamily);
      if (devForLatest && devForLatest.family && devByClean.size > 0) {
        const family = devForLatest.family;
        let latestDev = null;
        let latestTime = -1;
        const seenIds = new Set();
        for (const entry of devByClean.values()) {
          if (!entry || !entry.id || seenIds.has(entry.id)) continue;
          seenIds.add(entry.id);
          if (entry.family !== family) continue;
          if (String(entry.id).endsWith('-latest')) continue;
          const t = entry.release_date ? new Date(entry.release_date).getTime() : (entry.last_updated ? new Date(entry.last_updated).getTime() : 0);
          if (t > latestTime) {
            latestTime = t;
            latestDev = entry;
          }
        }
        if (latestDev) {
          const targetCanonical = getCleanModelId(String(latestDev.id));
          bestTarget = groups.find(g => g.canonicalId === targetCanonical && g.normalizedOffers[providerId]);
          if (!bestTarget) {
            // fallback to family canonical (e.g. mistral-large) if versioned group not present
            bestTarget = groups.find(g => g.canonicalId === getCleanModelId(family) && g.normalizedOffers[providerId]);
          }
        }
      }
      // Fallback to previous pricing/context heuristic when models.dev has no family or no match
      if (!bestTarget) {
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

        const candidates = groups.filter(g => {
          if (g === latestGroup) return false;
          if (g.canonicalId.endsWith('-latest')) return false;
          if (g.creator !== creator) return false;
          if (!g.normalizedOffers[providerId]) return false;
          if (famKeyword && !g.canonicalId.includes(famKeyword)) return false;

          const targetRaw = g.offers[providerId];
          const targetNorm = g.normalizedOffers[providerId];
          const targetIn = getNativeInputCost(providerId, targetRaw);
          const targetOut = getNativeOutputCost(providerId, targetRaw);

          const diffIn = Math.abs(targetIn - inCost) / (Math.max(targetIn, inCost) || 1);
          const diffOut = Math.abs(targetOut - outCost) / (Math.max(targetOut, outCost) || 1);
          if (diffIn > 0.15 || diffOut > 0.15) return false;
          if (context > 0 && targetNorm.contextSize > 0 && targetNorm.contextSize !== context) return false;

          return true;
        });

        if (candidates.length > 0) {
          candidates.sort((a, b) => extractVersionNumber(b.canonicalId) - extractVersionNumber(a.canonicalId));
          bestTarget = candidates[0];
        }
      }
      if (bestTarget) {

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
  for (let i = groups.length - 1; i >= 0; i--) {
    if (Object.keys(groups[i].normalizedOffers).length === 0) {
      groups.splice(i, 1);
    }
  }

  // GreenPT compression variants: glm-5.2-caveman/honey/ponytail families are same price, only output style compressed.
  // Collapse the 9 duplicate €/1M rows into base glm-5.2 as variant list (alternateSlugs) to keep the table priced, not styled.
  const compressionRe = /^glm-5\.2-(caveman|honey|ponytail)(?:-lite|-ultra)?$/;
  const compressionGroups = groups.filter(g => compressionRe.test(g.canonicalId));
  const baseGlm = groups.find(g => g.canonicalId === 'glm-5.2');
  if (baseGlm && compressionGroups.length > 0) {
    for (const compGroup of compressionGroups) {
      for (const providerId of Object.keys(compGroup.normalizedOffers)) {
        const compNorm = compGroup.normalizedOffers[providerId];
        const compRaw = compGroup.offers[providerId];
        if (!compNorm || !compRaw) continue;
        if (!baseGlm.normalizedOffers[providerId]) {
          baseGlm.offers[providerId] = compRaw;
          baseGlm.normalizedOffers[providerId] = compNorm;
          if (compGroup.regionPins && compGroup.regionPins[providerId]) {
            if (!baseGlm.regionPins) baseGlm.regionPins = {};
            baseGlm.regionPins[providerId] = compGroup.regionPins[providerId];
          }
          const byProvider = canonicalRawIds.get(baseGlm.canonicalId);
          if (byProvider) {
            if (!byProvider.has(providerId)) byProvider.set(providerId, new Set());
            byProvider.get(providerId).add(compNorm.rawModelId);
          }
        } else {
          const baseNorm = baseGlm.normalizedOffers[providerId];
          baseNorm.alternateSlugs = baseNorm.alternateSlugs || [];
          const label = compNorm.rawModelId.replace(/^glm-5\.2-/, '');
          baseNorm.alternateSlugs.push({ rawModelId: compNorm.rawModelId, label });
          const byProvider = canonicalRawIds.get(baseGlm.canonicalId);
          if (byProvider) {
            if (!byProvider.has(providerId)) byProvider.set(providerId, new Set());
            byProvider.get(providerId).add(compNorm.rawModelId);
          }
        }
        delete compGroup.offers[providerId];
        delete compGroup.normalizedOffers[providerId];
        if (compGroup.regionPins) delete compGroup.regionPins[providerId];
        if (compGroup.allListings) delete compGroup.allListings[providerId];
      }
    }
    // Prune the now-empty compression groups
    for (let i = groups.length - 1; i >= 0; i--) {
      if (compressionRe.test(groups[i].canonicalId) && Object.keys(groups[i].normalizedOffers).length === 0) {
        groups.splice(i, 1);
      }
    }
  }

  attachBenchmarkOffers(groups, providers.openrouter);

  const unified = groups.map(g => {    const offerList = Object.values(g.normalizedOffers);
    const totalOffers = offerList.length;

    const universalCapabilities = STANDARD_CAPABILITIES.filter(cap =>
      offerList.every(off => off.capabilities.includes(cap))
    );

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

    const validContexts = offerList.map(off => off.contextSize).filter(v => typeof v === 'number' && v > 0);
    const contextMin = validContexts.length > 0 ? Math.min(...validContexts) : null;
    const contextMax = validContexts.length > 0 ? Math.max(...validContexts) : null;

    const validOutputs = offerList.map(off => off.maxOutputTokens).filter(v => typeof v === 'number' && v > 0);
    const maxOutputMin = validOutputs.length > 0 ? Math.min(...validOutputs) : null;
    const maxOutputMax = validOutputs.length > 0 ? Math.max(...validOutputs) : null;

    const descriptions = offerList.map(off => off.description).filter(Boolean);
    descriptions.sort((a, b) => b.length - a.length);
    const description = descriptions.length > 0 ? descriptions[0] : null;

    const supportsCaching = {};
    for (const off of offerList) {
      supportsCaching[off.providerId] = off.capabilities.includes('Prompt Caching');
    }

    // Per-offer data-sovereignty facts, resolved once at generation time.
    const sovereigntyByProvider = {};
    for (const [offerKey, raw] of Object.entries(g.offers)) {
      const cfgProviderId = offerKey === 'mistral-regional' ? 'mistral' : offerKey;
      sovereigntyByProvider[offerKey] = leanSovereignty(
        resolveOfferSovereignty(cfgProviderId, raw, sovereigntyConfig)
      );
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
      regionPinsByProvider: Object.fromEntries(
        Object.entries(g.regionPins || {}).map(([key, set]) => [key, [...set]])
      ),
      sovereigntyByProvider,
      benchmarkSovereignty: g.benchmarkOffer
        ? leanSovereignty(resolveOfferSovereignty('openrouter', g.benchmarkOffer, sovereigntyConfig))
        : null,
      benchmarkOffer: g.benchmarkOffer || null
    };
  }).filter(model => {
    // Keep models where at least one offer exposes usable input AND output pricing.
    for (const [offerKey, raw] of Object.entries(model.offers)) {
      const pid = offerKey === 'mistral-regional' ? 'mistral' : offerKey;
      if (getNativeInputCost(pid, raw) !== null && getNativeOutputCost(pid, raw) !== null) return true;
    }
    return false;
  });

  // Enrich with models.dev (unified name, lab, input types, reasoning, tool_call, structured, weights, release_date, context, output, short info)
  for (const m of unified) {
    const dev = findModelsDevEntry(m.id);
    if (!dev) continue;
    const lab = String(dev.id || '').split('/')[0] || String(m.creator || '').toLowerCase();
    m.modelsDev = {
      name: dev.name || m.name,
      lab,
      family: dev.family || null,
      modalities: dev.modalities || null,
      reasoning: typeof dev.reasoning === 'boolean' ? dev.reasoning : null,
      tool_call: typeof dev.tool_call === 'boolean' ? dev.tool_call : null,
      structured_output: typeof dev.structured_output === 'boolean' ? dev.structured_output : null,
      open_weights: typeof dev.open_weights === 'boolean' ? dev.open_weights : null,
      weights: Array.isArray(dev.weights) ? dev.weights.slice(0, 3) : null,
      release_date: dev.release_date || null,
      last_updated: dev.last_updated || null,
      knowledge: dev.knowledge || null,
      context: dev.limit && typeof dev.limit.context === 'number' ? dev.limit.context : null,
      output: dev.limit && typeof dev.limit.output === 'number' ? dev.limit.output : null,
      description: dev.description || m.description || null
    };
    if (dev.name) m.name = dev.name;
    if (dev.description) m.description = dev.description;
  }

  return { models: unified, sovereigntyMeta };
}

const EuroUnify = {
  CREATOR_NAMES,
  PROVIDER_DISPLAY_NAMES,
  STANDARD_CAPABILITIES,
  getCleanCreatorName,
  getCleanModelId,
  normalizeSlug,
  getGeneratedCanonicalId,
  getModelCreator,
  regionBucketFromCode,
  REGION_PIN_LABELS,
  offerRegionPin,
  listingSovereigntyRank,
  resolveOfferSovereignty,
  positiveRate,
  getNativeInputCost,
  getNativeOutputCost,
  cacheSupportState,
  normalizeOffer,
  resolveOfferSovereignty,
  buildUnifiedModels
};

return EuroUnify;
});
