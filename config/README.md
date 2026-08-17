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

This file contains shared normalization dictionaries.

- `creator_aliases`: maps raw provider owner strings to consistent creator names.
- `display_names`: display-name overrides for canonical IDs.
- `strict_aliases`: cross-provider aliases that always resolve to the same canonical model ID.
- `provider_aliases`: provider-specific ID transformations, grouped by provider family.
- `display_aliases`: shared display-name overrides applied by the updater.

Prefer adding a model to `models.json` when the rule involves a specific model. Use `normalization.json` for reusable provider-wide rules.

## Contribution Guidelines

- Keep all files valid JSON. JSON does not support comments.
- Use lowercase keys for model IDs, pricing labels, aliases, and owner strings.
- Use arrays when multiple slugs or pricing names refer to the same model.
- Do not add API keys, credentials, or private provider data.
- Avoid broad aliases that could merge unrelated model families.
- Add an explicit exclusion when a product is not priced per input/output token.
- Run `node scripts/update_data.js` and the project validation checks before submitting changes.
