# DefiLlama Report

Daily DefiLlama research pack generator for NotebookLM and Lark Docs.

## What This Repo Contains

- public-data scraping scripts
- NotebookLM markdown bundle generator
- GitHub Actions workflows for scheduled runs
- Lark Docs upload workflow
- one dated example output bundle under `2026-07-11/notebooklm/`

## Main Commands

```bash
npm install
npm run scrape
npm run notebooklm -- 2026-07-11
npm run research-pack
npm run lark:upload-docs -- 2026-07-11
```

## Notes

- Local-only directories like `node_modules/` and browser profile data are ignored.
- Very large raw JSON datasets are not included in the initial repo upload. They can be regenerated with `npm run research-pack`.
