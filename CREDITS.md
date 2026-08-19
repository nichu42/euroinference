# Project Credits and Attributions

EuroInference is built from public provider catalogs, public pricing information, open-source software, bundled fonts, and project artwork. The project does not claim ownership of third-party names, logos, model names, APIs, or pricing data.

## Provider and data sources

The updater currently uses the following sources:

| Source | Use in EuroInference |
| --- | --- |
| [Mammouth AI](https://mammouth.ai/) | Public model catalog and provider pricing |
| [Cortecs](https://cortecs.ai/) | Model catalog and pricing API |
| [Eden AI](https://www.edenai.co/) | Model catalog, capabilities, regions, and pricing API |
| [Opper AI](https://opper.ai/) | Model catalog, capabilities, regions, and pricing API |
| [EURouter](https://eurouter.ai/) | Model catalog, tags, provider offers, and pricing API |
| [Requesty AI](https://www.requesty.ai/) | Model catalog, capabilities, retention, and pricing API |
| [Mistral AI](https://mistral.ai/) | Authenticated model catalog and public inference pricing pages |
| [Frankfurter](https://www.frankfurter.app/) | EUR/USD reference exchange rate |

These services have their own terms, licenses, trademarks, privacy policies, availability, and data-retention practices. A source appearing here does not imply sponsorship, endorsement, or affiliation.

EuroInference normalizes source records for comparison. The normalized output is not an official copy of any provider catalog and should not be treated as a provider commitment.

## Fonts

The bundled font files in [`fonts/`](fonts/) are:

- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) - SIL Open Font License 1.1.
- [Plus Jakarta Sans](https://fonts.google.com/specimen/Plus+Jakarta+Sans) - SIL Open Font License 1.1.
- [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk) - SIL Open Font License 1.1.

The font files are included locally so the dashboard can render consistently without requesting font files from a third-party font CDN.

## Project artwork

The EuroInference name, logo, favicon, and visual styling in `assets/`, `favicon.*`, and `styles.css` are project artwork by the maintainer and contributors unless a file states otherwise. Please do not reuse the branding in a way that suggests official affiliation.

## Runtime and tooling

The project uses standard platform tooling including Node.js, the browser Fetch API, GitHub Actions, and PowerShell. These are not bundled as project code and remain subject to their own licenses and terms.

## License

EuroInference source code and project-authored documentation are licensed under the [GNU Affero General Public License v3.0](LICENSE), unless a file states otherwise. Third-party providers, model creators, service names, logos, fonts, and other referenced materials retain their respective rights and licenses.
