# Model Configuration

These files contain editable dictionaries used by `scripts/update_data.js`. They are the preferred place for provider-specific aliases, model names, and matching rules.

**Where do I add …?** — most edits are now in one file.

| Want to … | Edit … | Example |
|---|---|---|
| Add / fix a model family (canonical id, display name, per-provider slugs / pricing names) | `config/models.json` → `models` | `mistral-large` with `slugs: ["mistral-large-latest"]` |
| Fix Mistral pricing-page name → API slug, or exclude OCR/embed product | `config/mistral_pricing.json` | `aliases: {"mistral large 3": "mistral-large-latest"}`, `excluded_prefixes: ["ocr"]` |
| Rename a creator / add alias `owned_by` variant | `config/creators.json` | `"z.ai": "Zhipu AI"` |
| Rename a provider badge | `config/providers.json` | `"mammouth": "Mammouth AI"` |
| Pretty name for a model | `config/models.json` → `models.<id>.display_name` | `"deepseek-r1": {display_name:"DeepSeek R1"}` |
| Generic or provider alias → canonical | `config/models.json` → `models.<id>.aliases` or `.providers.<pid>.slugs` | `"deepseek-r1": {aliases:["r1"]}` or `slugs:["deepseek-r1-distill"]` |

## `models.json` — model registry (single format, single file for models)

Human-friendly — **change a name/slug/label here, not in `unify.js`** (engine only). Keys starting with `_` are inline docs and ignored. `creators`/`providers` are now in `config/creators.json` / `config/providers.json`.

```json
{
  "_help": "Model registry: canonicalId → display_name/creator/aliases/providers. Use models.dev id when available.",
  "_where_to_edit": {
    "add_new_model": "models — add canonicalId with display_name/creator",
    "add_alias": "models.<id>.aliases — generic alias → canonical (all providers)",
    "add_provider_slug": "models.<id>.providers.<pid>.slugs — per-provider id"
  },
  "models": {
    "deepseek-r1": {
      "display_name": "DeepSeek R1",
      "creator": "DeepSeek",
      "aliases": ["r1"],
      "providers": {}
    },
    "glm-5.2": {
      "display_name": "GLM 5.2",
      "creator": "Zhipu AI",
      "providers": { "mistral": { "slugs": ["glm-5-2"], "pricing_names": ["glm 5.2"] } }
    }
  }
}
```

Fields:

- `models`: object containing one entry per model family. Sorted A–Z.
  - Model key: canonical ID used for cross-provider grouping. Use lowercase and stable names. **Use `models.dev` id when available as canonical (official slug)** — e.g. `openai/gpt-4o` → `gpt-4o`.
  - `display_name`: name shown in the table and detail view. Overwritten by `models.dev` `name` when enriched (`218/475`).
  - `creator`: normalized model creator shown in creator filters. Overwritten by `models.dev` lab when enriched.
  - `aliases`: generic `alias → canonical` for all providers (e.g. `["r1"]` for `deepseek-r1`). Use sparingly; prefer `providers.<pid>.slugs` for per-provider ids. Sorted A–Z.
  - `providers`: provider-specific matching data.
  - `providers.<provider>.slugs`: API or catalog IDs used by that provider. Add every known version or alias.
  - `providers.<provider>.pricing_names`: exact lower-case names used on a provider pricing page.

Unknown models can still be included through conservative generic normalization, but explicit entries are preferred.

Pipeline: `scripts/update_data.js:11` reads `config/models.json` (`models` with per-model `aliases`/`slugs`) + `config/creators.json`/`config/providers.json`, `unify.js:13` reads `creators.json`/`providers.json` for browser fallback. Rule: **change a model/slug/alias → `config/models.json`**, **change a creator/provider → `config/creators.json`/`providers.json`**, **change a rule/heuristic → `unify.js`**.

## `creators.json`

Global `alias → pretty` for `owned_by`/`lab` strings (lowercase, substring `raw includes key`). Sorted A–Z. Source of truth for `unify.js:CREATOR_NAMES` (fallback hardcoded, `scripts/update_data.js:33` reads this file). Example: `"z.ai": "Zhipu AI"`.

## `providers.json`

Global `providerId → pretty` badge name (e.g. `"mammouth": "Mammouth AI"`). Sorted A–Z. Source of truth for `unify.js:PROVIDER_DISPLAY_NAMES`.

## `mistral_pricing.json` (formerly `mistral_models.json`)

This file contains **only Mistral pricing-page quirks** — not the model registry. Used only by `scripts/update_data.js:parseMistralCatalog()` to join `https://docs.mistral.ai/inference/pricing` to `https://api.mistral.ai/v1/models`.

- `aliases`: normalized pricing-page name (lowercase, e.g. `"mistral large 3"`) → API slug (`"mistral-large-latest"`). Needed when the pricing page label doesn't match an API `id`.
- `api_aliases`: alternate API `id` → preferred `id` (e.g. `"mistral-medium-3-5": "mistral-medium-latest"`).
- `excluded_prefixes`: pricing-page product prefixes **excluded** from the token comparison — OCR, `voxtral`, `mistral embed`/`codestral embed`, `moderation`, `classifier` etc.

`config/models.json` always wins for `display_name`/`creator`/`slugs`/`pricing_names`. Keep this file for Mistral-specific exceptions and exclusions only.

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

- Keep all files valid JSON. JSON does not support comments. `pre-commit` (`scripts/hooks/pre-commit`) and CI (`.github/workflows/update_data.yml:43` `Validate JSON` on every PR) check every `*.json` via `JSON.parse`; `node --check` is JS-only.
- Use lowercase keys for model IDs, pricing labels, aliases, and owner strings.
- Use arrays when multiple slugs or pricing names refer to the same model.
- Do not add API keys, credentials, or private provider data.
- Avoid broad aliases that could merge unrelated model families.
- Add an explicit exclusion when a product is not priced per input/output token.
- Run `node scripts/update_data.js` and the project validation checks (`node --check` + `JSON.parse` + `git diff --check`) before submitting changes.
