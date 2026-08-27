# Cost & Caching Methodology

This page documents every calculation behind the prices shown on EuroInference: how list prices are normalized, how the workload cost column is computed, and exactly how prompt-caching assumptions enter the math. It is generated from `METHODOLOGY.md` by `scripts/build_methodology.js`; the formulas themselves live as named constants in `app.js` so UI text and implementation cannot drift apart.

**Last reviewed:** 2026-08-24

## List price normalization

- All providers are fetched from their public model/pricing APIs (Mistral's authenticated API joined to its public pricing pages). Rates are stored in their **native currency**; conversion to the display currency uses the ECB reference rate shipped in `data.js` (Frankfurter/ECB, dated on the header banner).
- Per-token rates (Requesty, Eden AI, Mammouth, EURouter) are multiplied by 1,000,000 to get a per-1M-token figure. Cortecs and Mistral publish per-1M rates directly. Opper publishes tiered arrays; the first tier is used.
- Mistral regional offers (`@regional`) carry a documented 1.1x premium on every rate, including cached-input rates.
- Models without usable token pricing for input and output are excluded entirely.

## Workload cost ("Cost" column)

For each offer (a model at one provider):

- `base` — listed input price per 1M tokens
- `out` — listed output price per 1M tokens
- `p_eff` — effective blended input rate after caching assumptions (see below)

The workload total is computed **per offer** using that offer's own input, cache and output rates together, then the cheapest complete offer wins:

```text
total = (p_eff × inputTokens + out × outputTokens) / 1,000,000
```

Input and output token counts come from the workload panel (defaults: 10K in / 1K out). The "Lowest Input/Output Price" columns and the price-range sliders always show plain list prices; only the Cost column and the Lowest-Price Provider ranking apply caching assumptions.

## Prompt-caching model

Cache writes happen once per unique context; reads repeat on every subsequent request. Instead of simulating sessions, write premiums are amortized over the assumed number of times each cached context is re-read:

```text
p_eff = base·(1−s) + (s/R)·[w + (R−1)·r]
```

- `s` — assumed share of input tokens served from cache. Presets: Chat 0%, RAG 40%, Agentic 80%.
- `R` — average re-reads per cached context before expiry. Options: 2, 4, 8, or steady state (∞, write premium fully amortized).
- `r` — published cache-read rate per 1M tokens.
- `w` — published cache-write rate per 1M tokens.

Fallback rules (deliberately conservative):

- No published write rate → `w = base` (most providers do not surcharge writes).
- No published read rate, or read ≥ base price → cached tokens are billed at full input price.
- Unknown caching support never counts as a discount — only published rates reduce the estimate.

With `s = 0%` or the "prompt caching" toggle unchecked, `p_eff = base` and the column reduces to plain listed prices.

### Caching support states

Per offer, one of four states is derived and shown in the detail modal:

- **Priced** — the provider publishes a usable cache rate.
- **Supported, no rate** — the provider explicitly reports caching support (Requesty `supports_caching`, Eden AI `supports_prompt_caching`) but publishes no rate; estimates use full input price.
- **Not supported** — explicitly reported as unsupported.
- **Unknown** — no signal either way. Unknown never hides a model unless the "Only caching-capable providers" filter is enabled (which requires priced or flagged support).

## Provider data mapping

- **Cortecs**: `pricing.cache_read_cost`, `pricing.cache_write_cost` (EUR / 1M)
- **Requesty**: `cached_price` (read), `caching_price` (write) (USD / token) plus `supports_caching`
- **Eden AI**: `pricing.cache_read_input_token_cost`, `pricing.cache_creation_input_token_cost`, DeepSeek-style fallback `input_cost_per_token_cache_hit` (USD / token) plus `capabilities.supports_prompt_caching`
- **EURouter**: `pricing.input_cache_read`, `pricing.input_cache_write` (per token, offer-level EUR or USD); zero means "not offered", never free
- **Opper AI**: `pricing.cached_input[]`, `pricing.cache_creation[]` (USD / 1M, first tier)
- **Mistral AI**: "Cached input" column of the public pricing pages (USD and EUR / 1M); no write premium is published
- **Mammouth AI**: no cache signals published; treated as unknown

Invalid or non-positive cache values are dropped during data generation (`scripts/update_data.js`), so no fabricated rates can reach the site.

## Non-EU reference offers (OpenRouter)

The detail modal shows one additional greyed-out card for **OpenRouter**, a US-based aggregator, when it lists a matching model. This reference is scoped strictly:

- It is shown **purely for price comparison** next to the European offers, labeled "Non-EU Reference", and rendered as the last card in the provider grid, visually faded.
- It is **excluded from every calculation on this site**: unified model grouping, consensus capabilities, context floors, lowest-price columns, workload costs, cache math, savings figures, filters, and rankings all use European offers only.
- Free (`:free`) and batch (`:batch`) product variants are excluded as distinct non-comparable products; among remaining slugs for one family, a deterministic representative is kept — the most recently listed variant first (legacy generation-era slugs can share the exact family name), then the shortest ID.
- Cache-read rates follow the same honesty rules as EU providers: only published positive rates count, everything else is treated as unknown and estimated at full input price.

## Data sovereignty panel

Every detail-modal card carries a fixed five-row panel so the same questions are answered for every offer — with **unknown as a first-class answer** (rendered `? Unknown`, never silently dropped or filled in):

- **Jurisdiction** — legal entity location of the provider with country and EU flags.
- **Retention** — whether inputs/outputs are kept (zero-day, bounded periods such as abuse-monitoring windows, or unknown).
- **Training** — whether customer data is used for model training.
- **Region** — where inference processing happens (EU / US / Global).
- **Routing** — first-party ("Direct") vs. aggregator over backend providers; hosting partners are named when listed.

Precedence: concrete per-listing API signals (Requesty's declared retention/training tags, region pins such as `@us`/`@eu`, host lists) override the provider-level defaults in `config/sovereignty.json`. That config holds publicly documented, source-linked facts for providers whose APIs expose no sovereignty data; omitted blocks mean unknown. Provider statements are self-published claims, not certifications — verify binding terms with the provider before deployment.

When one provider serves the same model through several regions, the comparison keeps only what a European user should route through: if an EU-pinned routing exists, every non-EU listing of that provider (US pins included) is dropped from the offer, its alternate IDs and region labels alike. Otherwise a deterministic representative is kept (unpinned > global > explicit non-EU pin), with all routings visible under "Same Model Listed As" and in the Region row's tooltip.

## Default assumptions and calibration

Shipped defaults: **Agentic preset (s = 80%)**, **R = 4**, caching math enabled.

Calibration against published real-world measurements (2026):

- Requesty network data (April 2026): cache hit rates by coding agent — Claude Code 92%, OpenCode 89%, weaker agents around 46%. The 80% default is deliberately below top-agent rates.
- Anthropic documents a 5-minute sliding TTL refreshed on each read, with write premiums of 1.25x base and reads at 0.1x base.
- A peer-reviewed evaluation of prompt caching for long-horizon agentic workloads (arXiv:2601.06007) measured 41–80% cost reductions across providers.

Sanity check of the formula under these ratios (w = 1.25·base, r = 0.1·base):

- s = 80%, R = 4 → `p_eff = 0.51·base` → **49% savings** (lower half of the measured band; conservative)
- s = 80%, R = ∞ → `0.28·base` → 72% savings (optimistic upper bound)
- OpenAI-style (r = 0.25·base, no write surcharge), s = 80%, R = 4 → `0.55·base` → 45% savings
- Mistral-style (r = 0.1·base, no write surcharge), s = 80%, R = 4 → `0.46·base` → 54% savings

## Limitations

- All figures are net estimates excluding VAT and provider surcharges; converted figures reflect periodic ECB reference rates, not spot rates.
- The caching model is an estimation aid, not a billing simulation. Real-world cache hit rates depend on prompt structure, session length, idle gaps beyond provider TTLs and routing behavior.
- Offers without published rates are estimated at full input price, so their savings may be understated if caching exists but is unpriced publicly.
- Always verify binding prices, token accounting methods and caching behavior directly with the provider before deployment.
