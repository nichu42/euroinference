# Contributing to EuroInference

Thank you for helping improve EuroInference. Contributions of all sizes are welcome, including bug reports, documentation fixes, model aliases, provider corrections, accessibility improvements, and focused code changes.

Please read [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) before participating. For security vulnerabilities, do not open a public issue; follow [`SECURITY.md`](SECURITY.md) instead.

## Before you start

Search existing issues and pull requests before opening a new one. Use the issue templates for reproducible bugs and feature requests.

Open an issue first for changes that affect the comparison model, provider behavior, generated-data schema, privacy posture, or the user-facing disclaimer. Small documentation fixes, typo fixes, and narrowly scoped configuration corrections can usually go directly into a pull request.

## Development setup

Requirements:

- Node.js 18 or newer
- PowerShell on Windows when using the project launcher

Clone the repository and run the dashboard with the checked-in cache:

```powershell
git clone https://github.com/nichu42/euroinference.git
Set-Location euroinference
.\start.ps1 -SkipUpdate
```

The default local URL is `http://localhost:8080/`. Use `-Port` to select another port.

To refresh provider data, set `MISTRAL_API_KEY` in a local gitignored `.env` file and run:

```powershell
node scripts/update_data.js
```

Never commit `.env`, credentials, provider tokens, or private API responses.

## Project layout

| Path | Purpose |
| --- | --- |
| `index.html` | Dashboard markup and static metadata |
| `styles.css` | Dashboard styling and responsive layout |
| `app.js` | Browser-side filtering, limits, cost/caching math, and rendering |
| `unify.js` | Shared model unification engine (grouping, creator/region/sovereignty, capability consensus) |
| `data.js` | Generated pre-unified cache (`UNIFIED_MODELS`, exchange rate, sovereignty meta); do not edit manually |
| `scripts/update_data.js` | Provider fetch, validation, normalization, and generation of `data.js` |
| `scripts/serve.js` | Small local static HTTP server |
| `scripts/build_credits.js` / `build_methodology.js` / `build_privacy.js` | Generators for `credits.html` / `methodology.html` / `privacy.html` from MD |
| `config/` | Contributor-maintained dictionaries: `models.json` (model registry), `creators.json`, `providers.json`, `sovereignty.json`, `mistral_pricing.json`, `benchmark.json` |
| `METHODOLOGY.md` / `methodology.html` | Cost & caching methodology (source + generated HTML) |
| `PRIVACY.md` / `privacy.html` | Legal disclosures and privacy policy (source + generated HTML) |
| `CREDITS.md` / `credits.html` | Attribution for data sources, fonts, and artwork |
| `.github/workflows/update_data.yml` | Scheduled and event-driven data refresh + HTML regeneration |

## Configuration and provider data

Edit [`config/`](config/) when adding model aliases, display names, creators, provider slugs, pricing labels, or exclusions. Read [`config/README.md`](config/README.md) before changing JSON.

Keep matching rules conservative. A broad alias can incorrectly merge unrelated model families across providers. Preserve native provider currencies when available, exclude products without usable token pricing from the overview, keep regional Mistral offers distinct, and keep unknown context sizes visible.

When changing the updater:

- Validate provider response shapes before serialization.
- Keep retries bounded and surface failures through `UPDATE_STATUS`.
- Do not preserve stale provider records after a failed refresh.
- Keep the generated field allowlist aligned with the fields read by `app.js`, including the optional cache-rate fields.
- Do not log API keys or private response data.

Cache-rate conventions (mirroring the unknown-context rule):

- Never fabricate cache rates. Invalid, zero, or non-positive values are dropped during generation; zero means "not offered", never "free".
- Unknown caching support stays visible and is treated as unknown, not as unsupported.
- Capture Mistral's "Cached input" pricing column in both currencies; regional duplicates keep the documented 1.1x premium on cached rates.
- Keep the caching formula single-sourced in `app.js` constants and mirrored in [`METHODOLOGY.md`](METHODOLOGY.md).

## Pull requests

Use the pull request template and describe both what changed and why. Keep each pull request focused and explain any changes to normalization, pricing interpretation, privacy behavior, or generated data.

Before submitting:

- Run `node --check app.js`.
- Run `node --check unify.js`.
- Run `node --check scripts/update_data.js`.
- Run `node --check scripts/build_credits.js`.
- Run `node --check scripts/build_methodology.js`.
- Run `node --check scripts/build_privacy.js`.
- Run `node --check data.js` when the generated cache changes.
- Run `node scripts/build_credits.js` when `CREDITS.md` changes.
- Run `node scripts/build_privacy.js` when `PRIVACY.md` changes.
- Run `node scripts/build_methodology.js` and re-verify the worked examples against app output when pricing or caching logic changes.
- Run `git diff --check`.
- Inspect generated `data.js` changes separately from source and configuration changes.
- Update relevant documentation when behavior, provider coverage, data sources, or privacy/security claims change.

Do not include unrelated formatting churn, credentials, or generated files that were not produced by the change.

## License

By contributing, you agree that your contribution is provided under the same [GNU Affero General Public License v3.0](LICENSE) as the project. If you add third-party material, confirm that its license is compatible and document the source in [`CREDITS.md`](CREDITS.md) or the pull request.
