# Model Configuration

These files contain editable dictionaries used by `scripts/update_data.js`. They are the preferred place for provider-specific aliases, model names, and matching rules.

## `models.json`

The model registry is model-centric. Each key under `models` is the canonical ID used to group offers across providers.

```json
{
  "models": {
    "glm-5.2": {
      "display_name": "GLM 5.2",
      "creator": "Zhipu AI",
      "providers": {
        "mistral": {
          "slugs": ["glm-5-2", "zai-glm-5-2"],
          "pricing_names": ["glm 5.2", "z.ai glm 5.2"]
        }
      }
    }
  }
}
```

Fields:

- `models`: object containing one entry per known model family.
- Model key: canonical ID used for cross-provider grouping. Use lowercase and stable names.
- `display_name`: name shown in the table and detail view.
- `creator`: normalized model creator shown in creator filters.
- `providers`: provider-specific matching data.
- `providers.<provider>.slugs`: API or catalog IDs used by that provider. Add every known version or alias.
- `providers.<provider>.pricing_names`: exact lower-case names used on a provider pricing page.

Unknown models can still be included through conservative generic normalization, but explicit entries are preferred because they prevent incorrect cross-provider matches.

## `mistral_models.json`

This file contains Mistral-specific pricing and exclusion rules.

- `aliases`: maps normalized pricing-page names to Mistral API slugs.
- `api_aliases`: maps alternate API IDs to the preferred API ID.
- `excluded_prefixes`: pricing-page product prefixes excluded from the token comparison, such as OCR, audio, embedding, moderation, and classifier products.

Known model entries in `models.json` take precedence. Keep this file for Mistral-specific exceptions and exclusions.

## `normalization.json`

This file contains shared normalization dictionaries — **change a name/slug here, not in `unify.js`** (engine only, see below).

- `creator_aliases`: maps raw provider owner strings to consistent creator names.
- `creator_names`: canonical `lab` → pretty name map used by `unify.js:CREATOR_NAMES` (fallback hardcoded, overridden live from this file in Node). Change a lab name here.
- `provider_display_names`: `providerId` → pretty name map used by `unify.js:PROVIDER_DISPLAY_NAMES` (fallback hardcoded, overridden live from this file in Node). Change a provider badge here.
- `display_names`: display-name overrides for canonical IDs.
- `strict_aliases`: cross-provider aliases that always resolve to the same canonical model ID.
- `provider_aliases`: provider-specific ID transformations, grouped by provider family.
- `display_aliases`: shared display-name overrides applied by the updater.

Rule: **change a name/slug/label → `config/`**, **change a rule/heuristic → `unify.js`** (e.g., `getCleanModelId`, `regionBucketFromCode`).

Prefer adding a model to `models.json` when the rule involves a specific model. Use `normalization.json` for reusable provider-wide rules.

## `benchmark.json`

This file defines non-EU reference providers. Reference offers appear greyed out in the detail modal purely for price comparison; they never enter the unified model table, rankings, filters, or cost estimates.

```json
{
  "providers": {
    "openrouter": {
      "display_name": "OpenRouter",
      "endpoint": "https://openrouter.ai/api/v1/models",
      "role": "non-eu-reference",
      "currency": "USD"
    }
  },
  "exclude_suffixes": [":free", ":batch"]
}
```

Fields:

- `providers`: one entry per reference provider.
- `providers.<id>.endpoint`: public models endpoint fetched by the updater.
- `providers.<id>.role`: must be `non-eu-reference`.
- `providers.<id>.currency`: native pricing currency of the endpoint.
- `exclude_suffixes`: product suffixes excluded as distinct, non-comparable products (free tiers with hard rate limits, batch discounts).

When several slugs resolve to the same canonical family (current slug, date snapshots, rolling aliases, legacy generations), the updater keeps one representative: prefer the most recently listed variant, then the shortest ID, then alphabetical order. OpenRouter keeps old-generation slugs alive whose names can exactly equal the family name (for example `mistralai/mistral-large` is the 2024 generation), so listing recency — not name equality — decides. Model-level matching uses the `openrouter` provider keys in [`models.json`](#modelsjson); add a slug there to pin an exact match.

## `sovereignty.json`

This file holds data-sovereignty facts per provider (jurisdiction, retention, training, hosting vs inference, routing) for providers whose APIs do not expose this information. Facts must come from public policy pages and carry their source URLs; details quote or paraphrase those pages.

- Provider keys match the internal provider IDs (`mammouth`, `cortecs`, `mistral`, `edenai`, `opper`, `eurouter`, `requesty`, `openrouter`).
- Each attribute block (`jurisdiction`, `retention`, `training`, `hosting`, `processing_region`, `routing`) is optional: **an omitted block means unknown** and is rendered as such — never silently filled in.
- `retention.zero_day_by_default` and `training.uses_customer_data` are booleans; `retention.default_days` is a number when a concrete default period is documented.
- `hosting.region` = gateway/control plane; `processing_region.region` = model inference — each one of `eu`, `us`, `global`. Split per your request: *hosting* and *inference* are shown separately in the detail modal (`Hosting ✓ EU-Sovereign` vs `Inference ✓ EU (US)`). `EU-Sovereign` = `jurisdiction EU` + `hosting EU` non-US (`Scaleway`/`OVHcloud`/`Hetzner`, not `AWS`/`Azure`/`GCP`) + `inference EU` non-US + `(European model e.g. Mistral Regional || open-weights e.g. Llama/Qwen/DeepSeek on non-US EU infra)`.
- `routing.model` is `direct` or `aggregator`. Aggregator entries describe the backend chain in `detail`.
- Slugs are kept `EU`-only when EU residency requires a special slug: `unify.js` keeps the `EU` pin survivor (`@eu`/`@regional`/region array) and `app.js` shows the full `rawModelId` with pin so the badge below is true.
- Per-offer API signals (Requesty's `data_retention_days`, `data_used_for_training`, region pins, host lists) always take precedence over these provider-level defaults.
- `openrouter.reference_only` marks the non-EU benchmark provider.
- Re-verify claims when editing and keep `verified_date` current.
- Model facts (`api` `lab`/`modalities`/`reasoning`…) are *not* sovereignty facts — they come live from `https://models.dev/models.json` (`MIT`) via `scripts/update_data.js` → `UNIFIED_MODELS[].modelsDev` and are shown `via models.dev` in the detail modal.

## Contribution Guidelines

- Keep all files valid JSON. JSON does not support comments.
- Use lowercase keys for model IDs, pricing labels, aliases, and owner strings.
- Use arrays when multiple slugs or pricing names refer to the same model.
- Do not add API keys, credentials, or private provider data.
- Avoid broad aliases that could merge unrelated model families.
- Add an explicit exclusion when a product is not priced per input/output token.
- Run `node scripts/update_data.js` and the project validation checks before submitting changes.
