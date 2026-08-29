# Project Credits and Attributions

EuroInference is built from public provider catalogs, public pricing information, open-source software, bundled fonts, and project artwork. The project does not claim ownership of third-party names, logos, model names, APIs, or pricing data.

## Services we use

We build on the following services — their data/code is reused in the build or runtime:

- **[models.dev](https://models.dev)** — Model facts (unified name, lab, modalities, reasoning, tool call, weights, description) — [MIT License, Copyright (c) 2025 models.dev](https://github.com/anomalyco/models.dev/blob/main/LICENSE) — Permission is hereby granted, free of charge, to any person obtaining a copy — to use, copy, modify, merge, publish, distribute … subject to including the copyright and permission notice — fetched live from `https://models.dev/models.json` and baked into `data.js`
- **[models.deggo.fyi](https://models.deggo.fyi/docs)** — Readable benchmarks — Quality Score v4 (synthesized) used with author permission for the Quality column and detail-modal overview. Fetched live from `https://models.deggo.fyi/api/models` and baked into `data.js` as `UNIFIED_MODELS[].deggo` + `DEGGO_META`. Raw third-party benchmark indexes (Artificial Analysis, CursorBench, DeepSWE, etc.) are not redistributed; only deggo's synthesized Quality is stored. **Value** is EuroInference's own **EUR Value = Quality × affordabilityEU** (`affordability = 1/(1+log10(1+blendedEU*8)*0.45)` where `blendedEU` is the cheapest EU offer `(in+out)/2`), so no model shows Quality without Value. See `https://models.deggo.fyi/docs` for Quality methodology.
- **[Frankfurter](https://www.frankfurter.app/)** — EUR/USD reference rate (ECB rates) — [MIT License](https://github.com/lineofflight/frankfurter/blob/main/LICENSE) — Permission is hereby granted, free of charge, to any person obtaining a copy — to use, copy, modify, merge, publish, distribute … subject to including the copyright and permission notice

## Fonts

The bundled font files are:

- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — [SIL Open Font License 1.1](https://scripts.sil.org/OFL)
- [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) — [SIL Open Font License 1.1](https://scripts.sil.org/OFL)
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) — [SIL Open Font License 1.1](https://scripts.sil.org/OFL)

The font files are included locally so the dashboard can render consistently without requesting font files from a third-party font CDN.

## Icons

- [Simple Icons](https://simpleicons.org/) — Ko-fi and Liberapay logos — [CC0 1.0 Universal](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md) — Public domain dedication, no attribution required (credited here voluntarily). SVG paths inlined locally in `index.html`; no hotlinking to third parties.

## Project artwork

The EuroInference name, logo, favicon, and visual styling in `assets/`, `favicon.*`, and `styles.css` are project artwork by the maintainer and contributors unless a file states otherwise. Please do not reuse the branding in a way that suggests official affiliation.
