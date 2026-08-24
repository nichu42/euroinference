# EuroInference

<p align="center">
  <img src="assets/logo_250px.webp" alt="EuroInference logo" width="150">
</p>

<p align="center">
  <strong>Compare open LLM models, prices, context windows, and provider availability across European AI infrastructure.</strong>
</p>

<p align="center">
  <a href="https://euroinference.sites.deploybase.eu">Live dashboard</a>
  &nbsp; | &nbsp;
  <a href="https://github.com/nichu42/euroinference/issues">Issues</a>
  &nbsp; | &nbsp;
  <a href="LICENSE">AGPL-3.0</a>
</p>

<p align="center">
  <a href="https://github.com/nichu42/euroinference/actions/workflows/update_data.yml"><img src="https://github.com/nichu42/euroinference/actions/workflows/update_data.yml/badge.svg" alt="Update model data workflow"></a>
  <a href="https://github.com/nichu42/euroinference/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-blue.svg" alt="AGPL-3.0 license"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-18%2B-339933.svg?logo=node.js&logoColor=white" alt="Node.js 18 or newer"></a>
</p>

EuroInference is a static, browser-based comparison dashboard for people evaluating model access through European AI providers. It combines provider catalogs, pricing, context limits, capabilities, and availability into one searchable view without sending dashboard input to an application backend.

> [!WARNING]
> **Prices and model information are informational estimates, not quotations.** Values are collected from public third-party catalogs and pricing pages, normalized across providers, and converted using periodic EUR/USD reference rates. They may exclude VAT, credits, minimum commitments, regional terms, billing surcharges, or other provider-specific conditions. Always verify current prices, limits, privacy terms, service quality, and contractual conditions with the provider before making a deployment or purchasing decision. EuroInference is not affiliated with or endorsed by any listed provider.

## Contents

- [Highlights](#highlights)
- [Live dashboard](#live-dashboard)
- [How the comparison works](#how-the-comparison-works)
- [Run locally](#run-locally)
- [Refresh provider data](#refresh-provider-data)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [Privacy and security](#privacy-and-security)
- [Credits and license](#credits-and-license)

## Highlights

- Compare model families across Mammouth AI, Cortecs, Eden AI, Opper AI, EURouter, Requesty AI, and Mistral AI.
- Group provider-specific IDs into normalized model families and creator names.
- Switch between EUR and USD views using the generated Frankfurter/ECB reference rate.
- Search and filter by model, creator, provider, minimum context window, input price, and output price.
- Estimate the cost of a representative workload with configurable input and output token counts.
- Model prompt-caching economics in the workload estimate with configurable cached-input share and reuse assumptions; filter for caching-capable providers ([methodology](METHODOLOGY.md)).
- Inspect provider offers, context limits, capabilities, modalities, regions, and additional model metadata.
- Keep the page fast and predictable by shipping a generated `data.js` cache instead of querying provider APIs at page load.
- Show an update warning when a provider refresh failed instead of silently presenting stale records as current.

## Live dashboard

Open the hosted version at **[euroinference.sites.deploybase.eu](https://euroinference.sites.deploybase.eu)**.

The dashboard is a static site. Search terms, filters, currency selection, workload assumptions, sorting, and the light/dark theme are handled in your browser. The selected theme is the only preference persisted by the page, under the `euroinference-theme` local storage key.

## How the comparison works

The repository contains two separate parts:

1. `index.html`, `styles.css`, `app.js`, and the generated `data.js` render the browser dashboard.
2. `scripts/update_data.js` fetches provider catalogs and pricing, validates response shapes, normalizes model records, and writes a new `data.js`.

The updater currently collects:

| Source | Purpose |
| --- | --- |
| Mammouth AI | Public model catalog and token pricing |
| Cortecs | OpenAI-compatible model catalog and pricing |
| Eden AI | Model catalog, capabilities, regions, and pricing |
| Opper AI | Model catalog, capabilities, regions, and pricing |
| EURouter | Model catalog, tags, provider offers, and pricing |
| Requesty AI | Model catalog, capabilities, retention, and pricing |
| Mistral AI | Authenticated model catalog plus public USD/EUR pricing pages |
| Frankfurter | EUR/USD reference exchange rate |

Provider data is intentionally normalized for comparison. Model names, creator labels, token prices, currencies, context sizes, and capabilities do not necessarily use identical source fields or definitions. Missing or unknown values should be treated as unknown, not as a guarantee that a provider does not support a feature.

## Run locally

Requirements:

- Node.js 18 or newer
- PowerShell on Windows when using `start.ps1`

Start the local server and refresh provider data:

```powershell
.\start.ps1
```

Start with the checked-in cache and skip network updates:

```powershell
.\start.ps1 -SkipUpdate
```

Choose another port:

```powershell
.\start.ps1 -SkipUpdate -Port 9090
```

The default URL is `http://localhost:8080/`. The launcher opens the URL and starts the small Node.js static server in `scripts/serve.js`.

## Refresh provider data

Run the updater directly when changing provider mappings or refreshing the generated cache:

```powershell
node scripts/update_data.js
```

The updater retries temporary failures, validates provider response shapes, records per-source status in `UPDATE_STATUS`, and writes the generated output to `data.js`. Do not edit `data.js` by hand; update the source logic or dictionaries instead.

Mistral's authenticated catalog requires `MISTRAL_API_KEY`. For local work, place it in a gitignored root `.env` file:

```text
MISTRAL_API_KEY=your-key-here
```

The GitHub Actions workflow runs on relevant changes, twice daily, and on manual dispatch. It reads `MISTRAL_API_KEY` from the repository secret and commits generated data changes when the output changes. Never commit `.env`, API keys, or provider credentials.

## Configuration

Contributor-maintained model dictionaries live in [`config/`](config/):

- [`models.json`](config/models.json) contains canonical model families, display names, creators, provider slugs, and pricing labels.
- [`mistral_models.json`](config/mistral_models.json) contains Mistral aliases and excluded product categories.
- [`normalization.json`](config/normalization.json) contains shared creator, display, strict-alias, and provider-alias rules.
- [`config/README.md`](config/README.md) documents the schema and contribution conventions.

Prefer a narrow, explicit alias over a broad rule that could merge unrelated model families.

## Validation

Run the existing syntax and whitespace checks after changes:

```powershell
node --check app.js
node --check scripts/update_data.js
node --check data.js
git diff --check
```

If you change provider data or normalization rules, also run `node scripts/update_data.js` with the appropriate local credentials and inspect the generated diff.

If you change pricing or caching logic, regenerate the methodology page and verify the worked examples against the app:

```powershell
node scripts/build_methodology.js
```

## Contributing

Bug reports, documentation improvements, configuration fixes, and focused code changes are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) first.

- [Report a bug](https://github.com/nichu42/euroinference/issues/new?template=bug_report.md)
- [Request a feature](https://github.com/nichu42/euroinference/issues/new?template=feature_request.md)
- [Open a pull request](https://github.com/nichu42/euroinference/compare)

Please do not use public issues for security vulnerabilities. See [`SECURITY.md`](SECURITY.md).

## Privacy and security

The dashboard has no account system, analytics, advertising, telemetry, or application backend. The page reads the generated cache and keeps comparison inputs in the browser. Loading the hosted site still creates ordinary connection logs at the static host or CDN, and external provider links are governed by their own operators.

- [`PRIVACY.md`](PRIVACY.md) contains the legal notice and privacy policy; the same policy is available in the hosted [`privacy.html`](privacy.html) page.
- [`SECURITY.md`](SECURITY.md) explains coordinated vulnerability reporting.

`privacy.html` is generated from `PRIVACY.md`:

```powershell
node scripts/build_privacy.js
```

The [Cost & Caching Methodology](METHODOLOGY.md) documents every price and cache calculation, the per-provider data mapping, fallback rules for missing cache rates, and the calibration of the default caching assumptions. The hosted page is [`methodology.html`](methodology.html), generated from `METHODOLOGY.md` via `scripts/build_methodology.js`.

## Credits and license

See [`CREDITS.md`](CREDITS.md) for provider, exchange-rate, font, and project-artwork attributions.

EuroInference is free and open-source software licensed under the [GNU Affero General Public License v3.0](LICENSE). Provider names, logos, model names, prices, and other third-party marks remain the property of their respective owners.
