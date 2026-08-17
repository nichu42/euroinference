# EuroInference

EuroInference is a static, browser-based dashboard for comparing LLM models, pricing, context windows, capabilities, and provider availability across European AI providers.


## Live Version

https://euroinference.sites.deploybase.eu


## Run Locally

Requirements:

- Node.js 18 or newer

Start the local server and refresh generated provider data:

```powershell
.\start.ps1
```

Start without network updates:

```powershell
.\start.ps1 -SkipUpdate
```

The default URL is `http://localhost:8080/`. Use `-Port` to choose another port.


## Data Updates

The updater fetches provider catalogs and writes the generated static dataset to `data.js`:

```powershell
node scripts/update_data.js
```

Provider failures are retried and recorded in `UPDATE_STATUS`. Failed providers produce empty data rather than silently preserving stale records. The site displays a warning above the table when the last update failed.

Mistral uses an authenticated API catalog for model IDs and metadata, joined with the public pricing pages for USD/EUR token prices. Set `MISTRAL_API_KEY` in a local gitignored `.env` file or in GitHub Actions secrets.


## Configuration

Contributor-maintained dictionaries live in [`config/`](config/):
See [`config/README.md`](config/README.md) for editing guidelines.


## Validation

Run syntax and whitespace checks after changes:

```powershell
node --check app.js
node --check scripts/update_data.js
node --check data.js
git diff --check
```

## License

Licensed under AGPL-3.0. See [`LICENSE`](LICENSE).
