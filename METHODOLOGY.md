# Cost & Caching Methodology

**Last reviewed:** 2026-08-29

EuroInference compares the same AI model across European providers. Prices are public listings, Quality is deggo Quality v4 (via [models.deggo.fyi](https://models.deggo.fyi/docs)), and EUR Value is EuroInference's heuristic (Quality × affordabilityEU) mixing that Quality with EU pricing.

## What you see

* **Input / Output** — cheapest list price per 1M tokens.
* **Workload Cost** — what you'd actually pay for your token counts, with your caching settings. Cheapest offer wins.
* **Quality** — deggo Quality v4 (0–100) via [models.deggo.fyi](https://models.deggo.fyi).
* **EUR Value** — quality per euro at list price: `Quality × affordability`, where `blended = (input + output)/2` *from the single cheapest EU offer* (the offer with minimal `(in+out)/2`; input and output are taken together, not mixed across providers) and `affordability = 1/(1+log10(1+blended·8)·0.45)` — `8` and `0.45` are heuristic scaling (log-dampened per Weber-Fechner) chosen to spread Value across our price range, not fitted to demand data. Higher = more quality for the money. Not affected by the workload sliders.

Switching EUR/USD only converts the displayed numbers — rankings stay on EUR prices.

## Workload Cost in one line

```
p_eff = base·(1−s) + (s/R)·[w + (R−1)·r]
total = (p_eff·input + out·output) / 1,000,000
```

* `base` / `out` — list prices.
* `s` — share of input from cache (Chat 0%, RAG 40%, Agentic 80%).
* `R` — how often a cached prompt is reused (2, 4, 8, or ∞).
* `r` / `w` — provider's cache read / write price. If a rate isn't published, we use `base` (no discount) — unknown never means free.

Turn off *prompt caching* and `p_eff = base`.

## Caching in practice

Defaults are **Agentic 80% / R=8, on**. That's intentionally below top agents (Claude Code 92% hits) and matches published measurements of 41–80% savings for agentic workloads.

Per offer we show: **Priced** (rate published), **Supported, no rate**, **Not supported**, **Unknown**. Only *Priced* gives a discount.

## Where the numbers come from

Prices are fetched directly from the providers' own APIs twice daily from their public listings (Cortecs, EURouter, Mammouth, Mistral, etc.). Mistral `@regional` is 1.1×. Invalid rates are dropped.

Quality is deggo's published Quality v4. We don't store the raw benchmark tables.

EUR Value is our heuristic calculation: we take the cheapest EU offer *as a whole* — the offer with minimal `(in+out)/2` in EUR, input and output taken together from that same offer — and apply the affordability curve above (heuristic, not an econometric model).

The **OpenRouter** card in the detail view is a non-EU reference for comparison only — never used for rankings or costs.

## Sovereignty badges

Each provider card shows six rows — **Jurisdiction · Retention · Training · Hosting · Inference · Routing** — with a short badge plus a hover tooltip that quotes the source sentence from `config/sovereignty.json` (or a per-listing API signal). `? Unknown` means the provider doesn't publish that fact — we never fabricate it.

**Jurisdiction** — legal home of the gateway operator. `🇫🇷🇪🇺 France` / `🇳🇱🇪🇺 Netherlands` = EU member (GDPR, EU enforcement), `🇬🇧 United Kingdom` / `🇺🇸 United States` = non-EU. Flag + `🇪🇺` when `inEu: true`.

**Retention** — what happens to prompts/completions after the call. `✓ Zero-day` = provider states payload is processed in-memory only and not retained (e.g. Cortecs, EURouter, GreenPT API). `✗ Retained ≤ 30d` = kept for abuse-monitoring/billing (Mistral `30d` unless ZDR is activated, Mammouth `30d`). Per-model overrides come from the catalog when present (e.g. Requesty `data_retention_days`).

**Training** — whether your prompts are used to train models. `✓ No` = provider states no training on customer data (Cortecs, EURouter, GreenPT, Mistral, etc.). `✗ Possible` = depends on the routed upstream model (OpenRouter `true` — some endpoints train). Again, Requesty exposes `data_used_for_training` per model when present.

**Hosting** — where the *gateway/control plane* runs (not the model). `✓ EU` = EU data centre (e.g. Scaleway FR-PAR / NL-AMS, OVH FR, GCP Belgium). `✓ EU (US)` = EU-located but operated by a US hyperscaler (AWS Stockholm, Azure, GCP) — **CLOUD Act** may apply despite EU location. `Global` = worldwide (Requesty, OpenRouter). `✓ EU-Sovereign` = EU jurisdiction + EU hosting on non-US operator (e.g. Scaleway, OVHcloud). Tooltip cites the exact sentence and source.

**Inference** — where the *model itself* runs. `✓ EU` = EU-only (Cortecs, EURouter, GreenPT on Scaleway FR). `Global` = no commitment — prompt may leave the EU (Mammouth lists Fireworks US / xAI US, Eden AI `api.edenai.run` global, Opper `global` unless EU route selected, **Mistral global `api.mistral.ai` — no commitment, subprocessors include Google Cloud/Azure EU+US**). `✓ EU (US)` = EU region of a US provider (EU Bedrock/Vertex/Azure) — still under US law. `✓ EU-Sovereign` = the strict badge: **jurisdiction EU + hosting EU non-US + inference EU non-US + (European model OR open-weights hosted on non-US EU infra)**. Example: Mistral models on EU fleet qualify; the same model via a US host does not. The model-creator flag (`Mistral AI` = European, `Meta`/`Alibaba`/`DeepSeek` = open-weights) and `usInferenceRe` host signals are documented in `app.js`.

*Concrete example:* **Mistral AI** vs **Mistral AI Regional**. The global endpoint shows `Inference: Global` (tooltip: *“Global endpoint api.mistral.ai makes no region commitment; inference may run outside the EU (sub-processors include Google Cloud and Azure). Only api.eu.mistral.ai pins inference to the EU.”*). `Mistral AI Regional` shows `Inference: ✓ EU-Sovereign` (tooltip: *“Inference pinned to EU via api.eu.mistral.ai (1.1× surcharge); guarantees EU data residency.”*). Same company, same 30-day retention and no-training, but only the `api.eu.mistral.ai` offer is EU-Sovereign. Price reflects it (1.1×).

**Routing** — architecture. `Direct` = first-party fleet (Mistral). `Aggregator` = gateway in front of many upstream model providers (Mammouth, Cortecs, Eden AI, EURouter, GreenPT, Requesty, OpenRouter).

All sovereignty facts are resolved once at generation time (`unify.js: resolveOfferSovereignty()` + `SOVEREIGNTY_META`); the browser only merges the per-offer scalars with the shared `SOVEREIGNTY_META` sentences. Missing blocks stay `? Unknown` and badges never fall back to `EU` by default. Sources are linked in `config/sovereignty.json`; verify the provider's DPA/terms for binding commitments.

## Limits

Prices exclude VAT and are converted with the periodic ECB reference rate shown in the header (timestamp, typically twice daily — may lag live catalogs). Caching estimates depend on your prompts, assumptions (share/reuses), and the provider's TTL — only published positive rates reduce the estimate, unknown never means free, and formulas are documented above. Quality (deggo Quality v4) is a synthesized third-party benchmark and EUR Value is EuroInference's heuristic (Quality × affordabilityEU, `affordability=1/(1+log10(1+blended·8)·0.45)` over the cheapest EU blended `(input+output)/2`); neither is an official rating. Sovereignty badges summarize self-published provider policies and API signals (sources in `config/sovereignty.json`); omitted = unknown, not a certification — verify the provider's DPA and binding terms. The OpenRouter card is a non-EU reference for price comparison only, excluded from all rankings and calculations. Generic model facts are enriched when matched from [models.dev](https://models.dev) (MIT). Always check the provider's own pricing page, limits, privacy, and terms before buying. Data is provided on an 'as is' basis without warranties beyond mandatory statutory limits.
