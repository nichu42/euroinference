const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
}
const configDir = path.join(__dirname, '../config');
const mistralModelMap = JSON.parse(fs.readFileSync(path.join(configDir, 'mistral_models.json'), 'utf8'));
const normalizationMap = JSON.parse(fs.readFileSync(path.join(configDir, 'normalization.json'), 'utf8'));
const modelRegistry = JSON.parse(fs.readFileSync(path.join(configDir, 'models.json'), 'utf8'));

const RETRY_LIMIT = 3;
const RETRY_DELAY_MS = 1000;

async function fetchWithRetry(url, options = {}, label = url) {
  let lastError;
  for (let attempt = 1; attempt <= RETRY_LIMIT; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeout);
      if (response.ok) return response;
      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (err) {
      lastError = err.name === 'AbortError' ? new Error(`${label} timed out`) : err;
    }
    if (attempt < RETRY_LIMIT) await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
  }
  throw lastError;
}

function requireArray(value, provider, field = 'data') {
  if (!Array.isArray(value)) throw new Error(`${provider} response field ${field} is not an array`);
  return value;
}

function validateModelRecords(models, provider) {
  requireArray(models, provider);
  if (models.some(model => !model || typeof model !== 'object' || typeof model.id !== 'string' || !model.id.trim())) {
    throw new Error(`${provider} response contains a model without a valid id`);
  }
  return models;
}

function validateGeneratedModels(models, provider) {
  validateModelRecords(models, provider);
  if (models.some(model => !model.pricing || !Number.isFinite(model.pricing.input_token) || !Number.isFinite(model.pricing.output_token))) {
    throw new Error(`${provider} generated data contains a model without valid token pricing`);
  }
  return models;
}

function normalizeGeneratedModel(provider, model) {
  const id = resolveRegistryModelId(provider, model.id);
  const rawOwner = model.owned_by || model.author || model.provider_display_name;
  const ownerKey = String(rawOwner || '').toLowerCase().trim();
  const creator = provider === 'mistral'
    ? (/@regional$/i.test(model.id) ? 'Mistral AI Regional' : 'Mistral AI')
    : (normalizationMap.creator_aliases[ownerKey] || rawOwner || 'Other');
  return {
    ...model,
    canonical_id: id,
    creator,
    display_name: modelRegistry.models[id]?.display_name || normalizationMap.display_aliases?.[id] || normalizationMap.display_names?.[id] || model.name || id
  };
}

function resolveRegistryModelId(provider, rawId) {
  const id = applyStrictAlias(rawId);
  for (const [canonicalId, entry] of Object.entries(modelRegistry.models || {})) {
    const slugs = entry.providers?.[provider]?.slugs || [];
    if (slugs.includes(rawId) || slugs.includes(id)) return canonicalId;
  }
  return id;
}

function normalizeModelId(id) {
  let clean = String(id || '').toLowerCase();
  clean = clean.replace(/@[a-z0-9_-]+$/i, '').split('/').pop().split(':')[0];
  // Amazon Bedrock keeps the family as a vendor prefix: deepseek.v3.2 -> deepseek-v3.2 (not v3.2)
  clean = clean.replace(/^deepseek\./i, 'deepseek-');
  // Strip vendor dot prefixes (Amazon Bedrock <vendor>.<model> convention)
  clean = clean.replace(/^(anthropic|openai|google|meta|cohere|mistral|amazon|ibm|alibaba|zhipu|moonshot|moonshotai|microsoft|snowflake|deepseek|ai21|writer|qwen|zai|nvidia|minimax)\./i, '');
  // Strip leading Zai/Zhipu vendor hyphen/underscore prefixes (e.g. zai-glm-4.7 -> glm-4.7)
  clean = clean.replace(/^(zai|zhipu)[-_]/i, '');
  // Strip host hyphen prefixes (mirror of the runtime normalizer)
  clean = clean.replace(/^(databricks|vertex|bedrock|azure|deepinfra|novita|together|cloudflare|anyscale|replicate|amazon|aws|nvidia)-/i, '');
  clean = clean.replace(/-(eu|us|global)$/i, '');
  clean = clean.replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/-\d{8}$/, '');
  clean = clean.replace(/-v\d+$/, '');
  // Normalize Llama family boundary (llama3.1-70b-instruct -> llama-3.1-70b-instruct) before version normalization
  clean = clean.replace(/^llama(\d)/, 'llama-$1');
  // Normalize underscore version separators (nemotron-3_5-lightning -> nemotron-3.5-lightning, llama-3_1-* -> llama-3.1-*)
  clean = clean.replace(/(\d+)_(\d+)/g, '$1.$2');
  return clean;
}

function applyStrictAlias(id) {
  let clean = normalizeModelId(id);
  for (const aliases of Object.values(normalizationMap.provider_aliases || {})) {
    clean = aliases[clean] || clean;
  }
  return normalizationMap.strict_aliases[clean] || clean;
}

async function run() {
  console.log('Fetching live exchange rates and model data...');
  
  let mammouthData = null;
  let cortecsData = null;
  let exchangeRateData = null;
  let edenaiData = null;
  let opperData = null;
  let eurouterData = null;
  let requestyData = null;
  let mistralData = null;
  let mistralApiModels = null;
  const updateStatus = {};
  
  // 1. Fetch exchange rate
  try {
    const res = await fetchWithRetry('https://api.frankfurter.dev/v2/rates?base=EUR&quotes=USD', {}, 'Frankfurter');
    exchangeRateData = await res.json();
    requireArray(exchangeRateData, 'Frankfurter');
    updateStatus.exchangeRate = true;
    console.log('Fetched Frankfurter rates:', exchangeRateData);
  } catch (err) {
    updateStatus.exchangeRate = false;
    console.error('Failed to fetch exchange rates:', err.message);
  }
  
  // 2. Fetch Mammouth models
  try {
    const res = await fetchWithRetry('https://api.mammouth.ai/public/models', {}, 'Mammouth AI');
    const json = await res.json();
    mammouthData = validateModelRecords(json.data, 'Mammouth AI');
    updateStatus.mammouth = Array.isArray(mammouthData);
    console.log(`Fetched ${mammouthData.length} Mammouth AI models.`);
  } catch (err) {
    updateStatus.mammouth = false;
    console.error('Failed to fetch Mammouth models:', err.message);
  }
  
  // 3. Fetch Cortecs models
  try {
    const res = await fetchWithRetry('https://api.cortecs.ai/v1/models', {}, 'Cortecs');
    const json = await res.json();
    cortecsData = validateModelRecords(json.data, 'Cortecs');
    updateStatus.cortecs = Array.isArray(cortecsData);
    console.log(`Fetched ${cortecsData.length} Cortecs models.`);
  } catch (err) {
    updateStatus.cortecs = false;
    console.error('Failed to fetch Cortecs models:', err.message);
  }

  // 4. Fetch Eden AI models
  try {
    const res = await fetchWithRetry('https://api.edenai.run/v3/models', {}, 'Eden AI');
    if (res.ok) {
      const json = await res.json();
    edenaiData = validateModelRecords(json.data, 'Eden AI');
      updateStatus.edenai = Array.isArray(edenaiData);
      console.log(`Fetched ${edenaiData.length} Eden AI models.`);
    } else {
      console.warn('Eden AI response not ok:', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch Eden AI models:', err.message);
  }

  // 5. Fetch Opper AI models
  try {
    const res = await fetchWithRetry('https://api.opper.ai/v3/models', {}, 'Opper AI');
    if (res.ok) {
      const json = await res.json();
    opperData = validateModelRecords(json.models, 'Opper AI');
      updateStatus.opper = Array.isArray(opperData);
      console.log(`Fetched ${opperData.length} Opper AI models.`);
    } else {
      console.warn('Opper AI response not ok:', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch Opper AI models:', err.message);
  }

  // 6. Fetch EURouter models
  try {
    const res = await fetchWithRetry('https://api.eurouter.ai/api/v1/models', {}, 'EURouter');
    if (res.ok) {
      const json = await res.json();
    eurouterData = validateModelRecords(json.data, 'EURouter');
      updateStatus.eurouter = Array.isArray(eurouterData);
      console.log(`Fetched ${eurouterData.length} EURouter models.`);
    } else {
      console.warn('EURouter response not ok:', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch EURouter models:', err.message);
  }

  // 7. Fetch Requesty AI models
  try {
    const res = await fetchWithRetry('https://router.requesty.ai/v1/models', {}, 'Requesty AI');
    if (res.ok) {
      const json = await res.json();
    requestyData = validateModelRecords(json.data, 'Requesty AI');
      updateStatus.requesty = Array.isArray(requestyData);
      console.log(`Fetched ${requestyData.length} Requesty AI models.`);
    } else {
      console.warn('Requesty AI response not ok:', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch Requesty AI models:', err.message);
  }

  // 8. Fetch Mistral's API catalog first, then join it to public pricing.
  try {
    if (!process.env.MISTRAL_API_KEY) throw new Error('MISTRAL_API_KEY is not configured');
    const modelsRes = await fetchWithRetry('https://api.mistral.ai/v1/models', {
      headers: { Authorization: `Bearer ${process.env.MISTRAL_API_KEY}` }
    }, 'Mistral models');
    const modelsJson = await modelsRes.json();
    mistralApiModels = validateModelRecords(modelsJson.data, 'Mistral AI API');
    console.log(`Fetched ${mistralApiModels.length} Mistral API models.`);
    const pricingRes = await fetchWithRetry('https://docs.mistral.ai/inference/pricing', {}, 'Mistral USD pricing');
    const pricingHtml = await pricingRes.text();
    const pricingEurRes = await fetchWithRetry('https://docs.mistral.ai/inference/pricing?currency=EUR', {}, 'Mistral EUR pricing');
    const pricingEurHtml = await pricingEurRes.text();
    mistralData = validateGeneratedModels(parseMistralCatalog(pricingHtml, pricingEurHtml, mistralModelMap, mistralApiModels), 'Mistral AI');
    const pricedIds = new Set(mistralData.map(model => model.id.replace(/@regional$/, '')));
    const apiOnly = mistralApiModels.filter(model => !pricedIds.has(model.id));
    console.log(`Mistral API catalog: ${mistralApiModels.length} models, ${mistralData.length / 2} priced model families, ${apiOnly.length} API-only/unpriced models.`);
    console.log('Mistral API IDs:', mistralApiModels.map(model => model.id).join(', '));
    updateStatus.mistral = true;
    console.log(`Fetched ${mistralData.length} Mistral AI models.`);
  } catch (err) {
    console.warn('Failed to fetch Mistral AI models:', err.message);
  }
  
  // Resolve data path
  const dataFilePath = path.join(__dirname, '../data.js');
  // Trim each provider's data down to only the fields app.js actually reads.
  // This is the only place to update this allowlist when app.js's data access changes.
  if (mammouthData) mammouthData = mammouthData.map(m => pickFields('mammouth', m));
  if (cortecsData) cortecsData = cortecsData.map(m => pickFields('cortecs', m));
  if (edenaiData) edenaiData = edenaiData.map(m => pickFields('edenai', m));
  if (opperData) opperData = opperData.map(m => pickFields('opper', m));
  if (eurouterData) eurouterData = eurouterData.map(m => pickFields('eurouter', m));
  if (requestyData) requestyData = requestyData.map(m => pickFields('requesty', m));
  if (mistralData) mistralData = mistralData.map(m => pickFields('mistral', m));

  const normalizeProviderData = (provider, data) => data ? data.map(model => normalizeGeneratedModel(provider, model)) : [];
  mammouthData = normalizeProviderData('mammouth', mammouthData);
  cortecsData = normalizeProviderData('cortecs', cortecsData);
  mistralData = normalizeProviderData('mistral', mistralData);
  edenaiData = normalizeProviderData('edenai', edenaiData);
  opperData = normalizeProviderData('opper', opperData);
  eurouterData = normalizeProviderData('eurouter', eurouterData);
  requestyData = normalizeProviderData('requesty', requestyData);

  // Construct the new data.js file content
  const outMammouth = JSON.stringify(mammouthData || []);
  const outCortecs = JSON.stringify(cortecsData || []);
  const outEden = JSON.stringify(edenaiData || []);
  const outOpper = JSON.stringify(opperData || []);
  const outEurouter = JSON.stringify(eurouterData || []);
  const outRequesty = JSON.stringify(requestyData || []);
  const outRate = JSON.stringify(exchangeRateData ? (exchangeRateData[0] || exchangeRateData) : null);

  const timestamp = new Date().toISOString();
  const outMistral = JSON.stringify(mistralData || []);
  const content = `// Auto-generated data file - Do not edit manually. Generated at ${timestamp}

const LAST_UPDATED = ${JSON.stringify(timestamp)};
const UPDATE_STATUS = ${JSON.stringify(updateStatus)};

const MAMMOUTH_DATA = ${outMammouth};

const CORTECS_DATA = ${outCortecs};

const EXCHANGE_RATE = ${outRate};

const MISTRAL_DATA = ${outMistral};

const EDENAI_DATA = ${outEden};

const OPPER_DATA = ${outOpper};

const EUROUTER_DATA = ${outEurouter};

const REQUESTY_DATA = ${outRequesty};
`;

  fs.writeFileSync(dataFilePath, content, 'utf8');
  console.log('Successfully wrote data.js!');
}

function parseMistralCatalog(pricingHtml, pricingEurHtml, modelMap, apiModels = null) {
  const prices = new Map();
  const euroPrices = new Map();
  parsePricingTable(pricingHtml, prices);
  parsePricingTable(pricingEurHtml, euroPrices);

  function parsePricingTable(html, target) {
    const rowPattern = /<tr[^>]*>(.*?)<\/tr>/gis;
    for (const rowMatch of html.matchAll(rowPattern)) {
      const cells = [...rowMatch[1].matchAll(/<td[^>]*>(.*?)<\/td>/gis)]
        .map(match => match[1].replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, '').trim());
      if (cells.length < 4) continue;
      const name = cells[0].replace(/↗/g, '').trim().toLowerCase();
      const input = Number(cells[1].replace(/[^\d.]/g, ''));
      const output = Number(cells[3].replace(/[^\d.]/g, ''));
      if (Number.isFinite(input) && Number.isFinite(output)) {
        target.set(name, { input, output });
      }
    }
  }

  for (const [name, price] of prices) {
    const euroPrice = euroPrices.get(name);
    if (euroPrice) price.eur = euroPrice;
  }

  const slugAliases = modelMap.aliases || {};
  const excludedLabels = new RegExp(`^(?:${(modelMap.excluded_prefixes || []).map(prefix => prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i');

  return [...prices.entries()].flatMap(([label, price]) => {
      if (excludedLabels.test(label.trim())) return [];
      const registryEntry = findRegistryPricingEntry('mistral', label);
      const slug = registryEntry?.providers?.mistral?.slugs?.find(candidate => apiModels.some(model => model.id === candidate))
        || findApiSlug(label, apiModels, slugAliases);
      if (!slug) return [];
      const base = {
        id: slug,
        name: registryEntry?.display_name || label,
        owned_by: registryEntry?.creator || 'Mistral AI',
        pricing: {
          input_token: price.input,
          output_token: price.output,
          input_token_eur: price.eur && price.eur.input,
          output_token_eur: price.eur && price.eur.output,
          currency: 'USD'
        }
      };
      return [base, {
        ...base,
        id: `${slug}@regional`,
        name: `${label} (Regional)`,
        owned_by: 'Mistral AI Regional',
        pricing: {
          input_token: price.input * 1.1,
          output_token: price.output * 1.1,
          input_token_eur: price.eur && price.eur.input * 1.1,
          output_token_eur: price.eur && price.eur.output * 1.1,
          currency: 'USD'
        }
      }];
    });
}

function findRegistryPricingEntry(provider, label) {
  const normalized = label.toLowerCase().trim();
  return Object.values(modelRegistry.models || {}).find(entry =>
    (entry.providers?.[provider]?.pricing_names || []).some(name => name.toLowerCase() === normalized)
  );
}

function findApiSlug(label, apiModels, aliases) {
  if (!Array.isArray(apiModels)) return null;
  if (aliases[label]) {
    const alias = aliases[label];
    return apiModels.some(model => model.id === alias) ? alias : null;
  }
  const labelWords = label.replace(/[^a-z0-9]+/gi, '').toLowerCase();
  const familyAliases = {
    mistralmedium: 'mistral-medium-latest',
    mistralsmall: 'mistral-small-latest',
    mistrallarge: 'mistral-large-latest',
    ministral14b: 'ministral-14b-latest',
    ministral8b: 'ministral-8b-latest',
    ministral3b: 'ministral-3b-latest'
  };
  const familyAlias = Object.entries(familyAliases).find(([name]) => labelWords.includes(name));
  if (familyAlias && apiModels.some(model => model.id === familyAlias[1])) return familyAlias[1];
  const normalizedLabel = label.replace(/[^a-z0-9]+/gi, '').toLowerCase();
  const match = apiModels.find(model => {
    const normalizedId = model.id.replace(/[^a-z0-9]+/gi, '').toLowerCase();
    return normalizedId.includes(normalizedLabel) || normalizedLabel.includes(normalizedId);
  });
  return match ? match.id : null;
}

// Whitelist of fields each provider's model objects must keep.
// These are the only fields app.js reads. Anything else is dead weight in the shipped bundle.
// Mirror of the field accesses in app.js (addOffer, getOfferInputCost, getOfferOutputCost, getModelCreator).
const FIELD_ALLOWLIST = {
  // id is always read; pricing/model_info are read for cost; context* for the size column; etc.
  all: ['id'],
  cortecs: [
    'id', 'owned_by', 'context_size', 'max_output_tokens', 'description',
    'supported_features', 'tags', 'input_modalities', 'output_modalities',
    'providers', 'pricing'
  ],
  mammouth: ['id', 'owned_by', 'model_info'],
  mistral: ['id', 'name', 'owned_by', 'pricing', 'context_size', 'description', 'canonical_id', 'creator', 'display_name'],
  edenai: ['id', 'owned_by', 'model_name', 'context_length', 'description', 'capabilities', 'pricing', 'regions'],
  opper: ['id', 'name', 'provider_display_name', 'context_window', 'max_output_tokens', 'description', 'capabilities', 'pricing', 'region'],
  eurouter: ['id', 'name', 'author_info', 'author', 'context_length', 'description', 'reasoning', 'tags', 'providers', 'pricing'],
  requesty: [
    'id', 'description', 'owned_by', 'input_price', 'output_price', 'cached_price', 'caching_price',
    'context_window', 'max_output_tokens', 'supports_caching', 'supports_vision', 'supports_reasoning',
    'supports_tool_calling', 'supports_output_json_schema', 'supports_image_generation',
    'data_retention_days', 'data_used_for_training', 'geolocation'
  ],
  // Pricing subfields app.js reads
    pricing: {
      cortecs: ['input_token', 'output_token', 'cache_read_cost', 'cache_write_cost', 'audio_cost', 'currency'],
      mistral: ['input_token', 'output_token', 'input_token_eur', 'output_token_eur', 'currency'],
    edenai: ['input_cost_per_token', 'output_cost_per_token'],
    opper: ['input', 'output'],
    eurouter: ['prompt', 'completion', 'currency'],
    requesty: null,
  },
  // Nested model_info fields Mammouth needs
  model_info: {
    mammouth: ['max_input_tokens', 'max_output_tokens', 'input_cost_per_token', 'output_cost_per_token'],
  },
  // Cortecs / EURouter / Eden / Opper nested capability structures
  supported_features: {
    cortecs: true,
  },
  tags: {
    cortecs: true,
    eurouter: true,
  },
  input_modalities: {
    cortecs: true,
  },
  output_modalities: {
    cortecs: true,
  },
  providers: {
    cortecs: true,
    eurouter: true,
  },
  capabilities: {
    edenai: true,
    opper: true,
  },
  regions: {
    edenai: true,
  },
  author_info: {
    eurouter: ['display_name'],
  },
};

function pickFields(provider, model) {
  if (!model || typeof model !== 'object') return model;
  const allowed = new Set([...FIELD_ALLOWLIST.all, ...(FIELD_ALLOWLIST[provider] || [])]);
  const trimmed = {};
  for (const key of allowed) {
    if (!(key in model)) continue;
    trimmed[key] = pruneNested(provider, key, model[key]);
  }
  return trimmed;
}

function pruneNested(provider, key, value) {
  if (Array.isArray(value)) {
    return value.map(item => {
      if (item && typeof item === 'object') {
        const sub = FIELD_ALLOWLIST[key] && FIELD_ALLOWLIST[key][provider];
        if (sub && sub !== true && Array.isArray(sub)) {
          const out = {};
          for (const k of sub) if (k in item) out[k] = item[k];
          return out;
        }
      }
      return item;
    });
  }
  if (value && typeof value === 'object') {
    const sub = FIELD_ALLOWLIST[key] && FIELD_ALLOWLIST[key][provider];
    if (sub === true) return value; // keep whole object
    if (sub && Array.isArray(sub)) {
      const out = {};
      for (const k of sub) if (k in value) out[k] = value[k];
      return out;
    }
  }
  return value;
}

run();
