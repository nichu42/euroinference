const fs = require('fs');
const path = require('path');

// Keep MISTRAL_FALLBACK static
const MISTRAL_FALLBACK = [
  {
    id: "mistral-large-latest",
    name: "Mistral Large (latest)",
    owned_by: "Mistral AI",
    pricing: { input_token: 0.50, output_token: 1.50 },
    context_size: 128000
  },
  {
    id: "mistral-small-latest",
    name: "Mistral Small (latest)",
    owned_by: "Mistral AI",
    pricing: { input_token: 0.15, output_token: 0.60 },
    context_size: 32000
  },
  {
    id: "codestral-latest",
    name: "Codestral (latest)",
    owned_by: "Mistral AI",
    pricing: { input_token: 0.30, output_token: 0.90 },
    context_size: 32000
  },
  {
    id: "open-mistral-nemo",
    name: "Mistral Nemo",
    owned_by: "Mistral AI",
    pricing: { input_token: 0.15, output_token: 0.15 },
    context_size: 128000
  },
  {
    id: "ministral-3b",
    name: "Ministral 3B",
    owned_by: "Mistral AI",
    pricing: { input_token: 0.10, output_token: 0.10 },
    context_size: 128000
  },
  {
    id: "ministral-8b",
    name: "Ministral 8B",
    owned_by: "Mistral AI",
    pricing: { input_token: 0.22, output_token: 0.22 },
    context_size: 128000
  }
];

async function run() {
  console.log('Fetching live exchange rates and model data...');
  
  let mammouthData = null;
  let cortecsData = null;
  let exchangeRateData = null;
  let edenaiData = null;
  let opperData = null;
  let eurouterData = null;
  let requestyData = null;
  
  // 1. Fetch exchange rate
  try {
    const res = await fetch('https://api.frankfurter.dev/v2/rates?base=EUR&quotes=USD');
    if (res.ok) {
      exchangeRateData = await res.json();
      console.log('Fetched Frankfurter rates:', exchangeRateData);
    } else {
      console.warn('Frankfurter response not ok:', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch exchange rates:', err.message);
  }
  
  // 2. Fetch Mammouth models
  try {
    const res = await fetch('https://api.mammouth.ai/public/models');
    if (res.ok) {
      const json = await res.json();
      mammouthData = json.data;
      console.log(`Fetched ${mammouthData.length} Mammouth AI models.`);
    } else {
      console.warn('Mammouth response not ok:', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch Mammouth models:', err.message);
  }
  
  // 3. Fetch Cortecs models
  try {
    const res = await fetch('https://api.cortecs.ai/v1/models');
    if (res.ok) {
      const json = await res.json();
      cortecsData = json.data;
      console.log(`Fetched ${cortecsData.length} Cortecs models.`);
    } else {
      console.warn('Cortecs response not ok:', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch Cortecs models:', err.message);
  }

  // 4. Fetch Eden AI models
  try {
    const res = await fetch('https://api.edenai.run/v3/models');
    if (res.ok) {
      const json = await res.json();
      edenaiData = json.data;
      console.log(`Fetched ${edenaiData.length} Eden AI models.`);
    } else {
      console.warn('Eden AI response not ok:', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch Eden AI models:', err.message);
  }

  // 5. Fetch Opper AI models
  try {
    const res = await fetch('https://api.opper.ai/v3/models');
    if (res.ok) {
      const json = await res.json();
      opperData = json.models;
      console.log(`Fetched ${opperData.length} Opper AI models.`);
    } else {
      console.warn('Opper AI response not ok:', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch Opper AI models:', err.message);
  }

  // 6. Fetch EURouter models
  try {
    const res = await fetch('https://api.eurouter.ai/api/v1/models');
    if (res.ok) {
      const json = await res.json();
      eurouterData = json.data;
      console.log(`Fetched ${eurouterData.length} EURouter models.`);
    } else {
      console.warn('EURouter response not ok:', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch EURouter models:', err.message);
  }

  // 7. Fetch Requesty AI models
  try {
    const res = await fetch('https://router.requesty.ai/v1/models');
    if (res.ok) {
      const json = await res.json();
      requestyData = json.data;
      console.log(`Fetched ${requestyData.length} Requesty AI models.`);
    } else {
      console.warn('Requesty AI response not ok:', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch Requesty AI models:', err.message);
  }
  
  // Resolve data path
  const dataFilePath = path.join(__dirname, '../data.js');
  let currentContent = '';
  if (fs.existsSync(dataFilePath)) {
    currentContent = fs.readFileSync(dataFilePath, 'utf8');
  }

  // Trim each provider's data down to only the fields app.js actually reads.
  // This is the only place to update this allowlist when app.js's data access changes.
  if (mammouthData) mammouthData = mammouthData.map(m => pickFields('mammouth', m));
  if (cortecsData) cortecsData = cortecsData.map(m => pickFields('cortecs', m));
  if (edenaiData) edenaiData = edenaiData.map(m => pickFields('edenai', m));
  if (opperData) opperData = opperData.map(m => pickFields('opper', m));
  if (eurouterData) eurouterData = eurouterData.map(m => pickFields('eurouter', m));
  if (requestyData) requestyData = requestyData.map(m => pickFields('requesty', m));

  // Construct the new data.js file content
  const outMammouth = mammouthData
    ? JSON.stringify(mammouthData)
    : extractFallbackVariable(currentContent, 'MAMMOUTH_FALLBACK');

  const outCortecs = cortecsData
    ? JSON.stringify(cortecsData)
    : extractFallbackVariable(currentContent, 'CORTECS_FALLBACK');

  const outEden = edenaiData
    ? JSON.stringify(edenaiData)
    : extractFallbackVariable(currentContent, 'EDENAI_FALLBACK');

  const outOpper = opperData
    ? JSON.stringify(opperData)
    : extractFallbackVariable(currentContent, 'OPPER_FALLBACK');

  const outEurouter = eurouterData
    ? JSON.stringify(eurouterData)
    : extractFallbackVariable(currentContent, 'EUROUTER_FALLBACK');

  const outRequesty = requestyData
    ? JSON.stringify(requestyData)
    : extractFallbackVariable(currentContent, 'REQUESTY_FALLBACK');

  const outRate = exchangeRateData
    ? JSON.stringify(exchangeRateData[0] || exchangeRateData)
    : extractFallbackVariable(currentContent, 'EXCHANGE_RATE');

  const content = `// Auto-generated data file - Do not edit manually. Generated at ${new Date().toISOString()}

const MAMMOUTH_FALLBACK = ${outMammouth};

const CORTECTS_FALLBACK = ${outCortecs};

const EXCHANGE_RATE = ${outRate};

const MISTRAL_FALLBACK = ${JSON.stringify(MISTRAL_FALLBACK)};

const EDENAI_FALLBACK = ${outEden};

const OPPER_FALLBACK = ${outOpper};

const EUROUTER_FALLBACK = ${outEurouter};

const REQUESTY_FALLBACK = ${outRequesty};
`;

  fs.writeFileSync(dataFilePath, content, 'utf8');
  console.log('Successfully wrote data.js!');
}

// Whitelist of fields each provider's model objects must keep.
// These are the only fields app.js reads. Anything else is dead weight in the shipped bundle.
// Mirror of the field accesses in app.js (addOffer, getOfferInputCost, getOfferOutputCost, getModelCreator).
const FIELD_ALLOWLIST = {
  // id is always read; pricing/model_info are read for cost; context* for the size column; etc.
  all: ['id'],
  cortecs: ['id', 'owned_by', 'context_size', 'supported_features', 'pricing'],
  mammouth: ['id', 'model_info'],
  mistral: ['id', 'pricing'],
  edenai: ['id', 'owned_by', 'context_length', 'pricing'],
  opper: ['id', 'provider_display_name', 'context_window', 'pricing'],
  eurouter: ['id', 'author_info', 'context_length', 'pricing'],
  requesty: ['id', 'input_price', 'output_price', 'context_window'],
  // Pricing subfields app.js reads; strip cache/audio/image/search/DBu variants and the duplicated list_pricing.
  pricing: {
    cortecs: ['input_token', 'output_token'],
    mistral: ['input_token', 'output_token'],
    edenai: ['input_cost_per_token', 'output_cost_per_token'],
    opper: ['input', 'output'],
    eurouter: ['prompt', 'completion', 'currency'],
    requesty: null, // requesty pricing sits at the top level (input_price/output_price), not in .pricing
  },
  // Nested model_info fields Mammouth needs (token caps + per-token costs).
  model_info: {
    mammouth: ['max_input_tokens', 'max_output_tokens', 'input_cost_per_token', 'output_cost_per_token'],
  },
  // Cortecs feature flags used for tag inference.
  supported_features: {
    cortecs: true, // keep the whole array
  },
  // EURouter's display_name under author_info is the only nested thing we read.
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

function extractFallbackVariable(content, varName) {
  if (!content) return '[]';
  const startIdx = content.indexOf(`const ${varName} =`);
  if (startIdx === -1) return '[]';

  let bracketCount = 0;
  let inString = false;
  let stringChar = '';
  let i = content.indexOf('=', startIdx) + 1;
  while (i < content.length && content[i] !== '[' && content[i] !== '{') {
    i++;
  }

  if (i >= content.length) return '[]';

  const startChar = content[i];
  const endChar = startChar === '[' ? ']' : '}';
  let result = '';

  while (i < content.length) {
    const char = content[i];
    result += char;

    if ((char === '"' || char === "'") && content[i - 1] !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (stringChar === char) {
        inString = false;
      }
    }

    if (!inString) {
      if (char === startChar) bracketCount++;
      if (char === endChar) bracketCount--;
      if (bracketCount === 0) break;
    }
    i++;
  }

  return result;
}

run();
