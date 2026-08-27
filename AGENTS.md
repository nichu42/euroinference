# Local Agent Notes

This file is intentionally gitignored. It contains local workflow notes for coding agents and should not be treated as project policy.

## Working Rules

- Inspect the existing code before editing.
- Preserve unrelated user changes in the worktree.
- Use `apply_patch` for manual edits.
- Keep generated `data.js` changes separate from source/config changes when reviewing diffs.
- Before pushing, compare the generated timestamp in local `data.js` with `origin/main:data.js`; keep the newer version and discard the older one. Resolve this before staging other changes.
- CI auto-update commits land on `main` frequently (data.js-only). Fetch and rebase onto `origin/main` before pushing; expect the push to trigger a fresh data regeneration.
- Do not commit `.env` or expose API keys in logs, generated files, or comments.
- Treat `config/` as the contributor-maintained source of model aliases, slugs, display names, creators, and exclusions — **change a name/slug/label → `config/`**, **change a rule/heuristic → `unify.js`** (`getCleanModelId`, `regionBucketFromCode`, grouping). `config/sovereignty.json` additionally holds source-linked jurisdiction/retention/training/**hosting vs inference**/routing facts (`hosting` = gateway/control plane, `processing_region` = model inference; `EU-Sovereign` = `jurisdiction EU` + `hosting EU` non-US + `inference EU` non-US + European/open-weights on non-US EU infra); omitted blocks mean unknown — never fabricate or silently fill in. `config/normalization.json:creator_names`/`provider_display_names` are source of truth for `unify.js:CREATOR_NAMES`/`PROVIDER_DISPLAY_NAMES` (fallback hardcoded, overridden live from config in Node).
- Generic model facts (lab, modalities, reasoning, tool_call, weights, release, limits, description) are source of truth from `https://models.dev/models.json` (`MIT`) via `scripts/update_data.js` → `UNIFIED_MODELS[].modelsDev` (`218/475` enriched); provider-specific pricing/limits/sovereignty stay per-provider — do not overwrite provider cost fields with `models.dev` values.

## Common Commands

```powershell
node scripts/update_data.js
node scripts/build_credits.js
node scripts/build_methodology.js
node scripts/build_privacy.js
node --check app.js
node --check unify.js
node --check scripts/update_data.js
node --check data.js
git diff --check
```

For local Mistral API inspection, place `MISTRAL_API_KEY` in the gitignored root `.env`. Never print the key or commit `.env`.

## Data Configuration

Contributor-editable dictionaries are in `config/`:

- `models.json` is the model-centric registry of canonical IDs, display names, creators, provider slugs, and pricing labels.
- `mistral_models.json` contains Mistral-specific aliases and excluded product categories.
- `normalization.json` contains shared creator, display, strict-alias, and provider-alias rules.
- `README.md` documents the JSON schema and contribution conventions.

Update these files instead of hardcoding provider-specific aliases in executable code.

## Provider Policy

- Validate response shapes before serialization.
- Retry timeouts and HTTP failures with bounded backoff.
- Do not preserve stale provider data after a failed refresh.
- Keep native provider currencies when available.
- Exclude models without usable token pricing from the overview.
- Use the authenticated Mistral API for model IDs and metadata, and the public Mistral pricing pages for native USD/EUR prices.
- Keep regional Mistral entries as distinct offers with the documented regional premium; the 1.1x premium applies to cached-input rates too.
- Keep unknown context sizes visible when applying the minimum-context filter.

## Caching Policy

- Cache rates follow the same honesty rules as context sizes: unknown ≠ unsupported ≠ free. Only published rates reduce estimates; unknown support stays visible.
- Never fabricate cache rates. `scripts/update_data.js` drops invalid/non-positive cache values during generation; zero means "not offered" (EURouter sentinel), never free.
- The blended formula `p_eff = base·(1−s) + (s/R)·[w + (R−1)·r]` lives as constants in `app.js` (`CACHE_FORMULA_TEXT`, `CACHE_FORMULA_RULES`) and must stay mirrored in `METHODOLOGY.md`; regenerate `methodology.html` via `node scripts/build_methodology.js` after any change.
- Workload cost is computed per offer (input, output and cache rates of one provider together), never mixed across offers.
- Defaults: caching math on, Agentic preset s=80%, reuse R=4. Calibration evidence is documented in METHODOLOGY.md.

## Theme & Styling Policy

- Dynamic markup rendered by `app.js` must not hardcode hex colors. Use theme variables: `--text-main` / `--text-muted` / `--text-dark` for text, `--savings-color` / `--eu-yellow` for accents, `--border-color` for borders. Hardcoded inline colors break one of the two themes.
- The legacy `[style*="color:#fff"]` attribute-selector overrides in `styles.css` are fragile — do not add to them; use classes plus explicit `:root[data-theme="light"]` rules instead.
- Accent palette per theme: dark = EU yellow (`#FFCC00` family), light = sky-blue family (`#0284c7` / `#0369a1` / `#075985`). Never introduce brown/gold text accents in light mode (explicit user decision, 2026-08-24).
- Every new animation needs a `prefers-reduced-motion` guard: CSS `@media (prefers-reduced-motion: no-preference)` block or a JS `matchMedia` check before animating.
- Modal provider cards must keep row alignment across cards: fixed section order (badge → slug → prices → cache → limits → features → sovereignty), min-height classes (`.modal-card-slug`, `.modal-card-cache`, `.modal-card-limits`, `.modal-card-sovereignty`), variable extras (aliases, alt IDs, infra) rendered last.
- Theme switching animates via the View Transitions API (circular wipe from the toggle) with a staggered `[data-theme-step]` fade fallback; new top-level sections should carry `data-theme-step` to join the fallback.
- Table rows use `content-visibility:auto` + `contain-intrinsic-size:auto 52px` (`styles.css:1798`) to skip offscreen layout.

## Performance & Rendering Policy

- Table is paginated for 475-row dataset: `PAGE 80` initial `tbody.innerHTML` + sentinel `<tr id="table-sentinel">` + `IntersectionObserver` `rootMargin 800px` loading `60` more on scroll (`app.js:1141` `renderTableChunked`). `window._tableObserver`/`window._loadAllTableRows` exposed for `END`/`#data-notice` anchor flush (loads all remaining synchronously before jump) — keeps native `END` and disclaimer button working.
- `scheduleRender()` and `applyFiltersAndRender()` defer when `document.hidden` (`_deferredRender`) and cancel `_renderRaf`/`_renderTimeout`/`scheduleRender._raf` + observer on `visibilitychange` (`app.js:2106`) to avoid hidden-tab queue burst that froze system 10-15s on tab return.
- `appendChunk` yields via `performance.now()>8ms` → `setTimeout+rAF` to keep main thread responsive.
- Slugs are single-line `white-space:nowrap` + `text-overflow:ellipsis` (`app.js:1584`, `app.js:1648`) — copy via button (`navigator.clipboard.writeText`) shows full `rawModelId`.
- EU pin: when `inference==eu` requires special slug (`@eu`, `@regional`), `unify.js:778` keeps EU survivor only and `app.js:1584` shows full `rawModelId` with `(EU pin required)` hint so sovereignty badge below is truthful.

## Verification Notes

- Pricing/caching logic can be verified headlessly: in Node, stub `document` (`readyState: 'loading'`, `getElementById` → null, `querySelectorAll` → []) and `window`/`localStorage`, then `require` unify.js as global `EuroUnify`, eval `data.js` + `app.js` together, call `loadExchangeRate()` / `fetchModels()` and assert getter outputs against the worked examples in `METHODOLOGY.md`. Grouping/unification runs at generation time (updater + unify.js) — there is no browser-side `processAndUnifyModels` anymore.
- Stress-test getter changes across all unified models × {cache math on/off} × {caching filter on/off} × {EUR/USD} — this combination matrix caught nothing less, and everything since.
- After updater changes, check generated coverage counts (models with read/write rates per provider) before and after regeneration.
