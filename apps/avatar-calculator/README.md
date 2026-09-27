# Калькулятор ширины аватара

Standalone tool from the lesson «Широта аватара»: **avatars × annual check = revenue**.
Vite + React 19 + TypeScript, styled with a copy of the blog's Poster tokens
(`src/styles/tokens.css`). It is deliberately separate from the Astro site: no
database, no auth, its own `package.json` and lockfile.

## Commands

```sh
pnpm install
pnpm dev        # http://localhost:5173
pnpm test       # vitest: calculation, economics, state sanitising
pnpm build      # tsc + vite build into dist/
pnpm start      # node server.mjs, serves dist/ on $PORT (default 8080)
```

## Deploy

Railway service `avatar-calculator` (project of the same name), deployed from this
branch with root directory `/apps/avatar-calculator`. Settings live on the service:
Railpack builder, build `pnpm build`, start `node server.mjs`, healthcheck `/health`,
watch pattern `/apps/avatar-calculator/**`.
The build uses a relative base, and `server.mjs` answers on both `/` and
`/avatar-calculator/`, so the same image can later sit behind
`artka.dev/avatar-calculator` without a rebuild.

## Data

`src/data/countries.json` is generated. To refresh it:

```sh
cd data-sources
python3 fetch_wb.py     # World Bank WDI + Global Findex API into wb_raw.json
python3 build_data.py   # merges firms.json and ru_and_gaps.json into ../src/data/countries.json
```

| Field                                                   | Source                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Population, age groups, internet, GDP                   | World Bank WDI (ITU for internet)                                                  |
| Bought online (`fin26b`), paid online (`fin27a`), cards | Global Findex 2021 / 2025                                                          |
| Russia online buyers                                    | VTsIOM 2024 (71% of 18+), set to 65% for 15+                                       |
| Paid online for Findex 2021 rich countries              | estimate: bought online × high-income median ratio                                 |
| Gaps (Belarus, Gulf, some Africa)                       | researched estimates in `ru_and_gaps.json`                                         |
| Businesses                                              | Eurostat, ФНС, stat.gov.kz, national offices; regional median per capita otherwise |
| Russian speakers                                        | censuses and surveys; estimates flagged `rusE`                                     |

`src/data/niches.json` holds 60 niches across the five lesson levels and the
unit-economics benchmarks (CPL, CAC, conversion, churn, CPI) with sources.
Prices and segment shares in the niche library are estimates.
