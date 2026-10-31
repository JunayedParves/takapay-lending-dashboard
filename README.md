<p align="center"><img src="assets/logo.png" alt="TakaPay" width="150"></p>

# TakaPay · Digital Lending & Credit Risk Intelligence

An interactive web dashboard for the digital lending book of **TakaPay**, a mobile financial services (MFS) provider in Bangladesh. It moves through four questions: **what happened, why, what is likely next, and what management should do.**

It opens with a **Story** tab: seven short chapters, each built around one finding with its chart, a "so what" line and a link to the analysis behind it. Ten analysis tabs follow for executives, credit risk, collections and regional teams.

> All customer, loan and agent records are **synthetic**. No real person or real MFS company is represented.

## The story in seven chapters

| # | Chapter | The finding (all divisions, as of 31 Oct 2026) |
|---|---|---|
| 1 | **Growth** | Disbursement grew from ৳78M (2021) to ৳2.0B (Jan–Oct 2026), 26×; ৳4.88B across 221,928 loans in total. |
| 2 | **Quality** | PAR 30 is 3.26% (11.26% a year ago) and the NPL ratio is 1.24%, but much of the fall comes from a very young book. At the same age (6 months on book), 2024 loans defaulted at 4.7% vs 2.8% for 2025. |
| 3 | **Where** | Exposure concentrates in a few divisions; NPL varies widely by district. |
| 4 | **Who** | Occupation separates repayment behaviour; repeat borrowers default far less than first-time borrowers. |
| 5 | **Repayment** | Collection efficiency is about 98%; losses are decided in the first 30 days past due. |
| 6 | **What's next** | Two machine-learning models rank the open book by risk of default and of near-term delinquency. |
| 7 | **What to do** | A rule-based recommendation engine turns the evidence into prioritised actions. |

Every sentence on the page is recomputed from the data, and all of it follows the **division filter**.

## Pages

| Tab | What it answers |
|---|---|
| Story | The narrative above |
| Overview | 9 headline KPIs with year-on-year change, growth and credit-quality trends, portfolio mix, generated insights |
| Geography | Choropleth map of the 8 divisions, growth-versus-risk quadrants, division → district → upazila drill-down |
| Customers | Age, occupation risk matrix, demand-versus-repayment quadrants, gender, income, education, tenure, location |
| Products & origination | Application funnel, rejection reasons, product scorecard, loan size, tenure, score, DTI and LTI bands |
| Repayment & collections | Scheduled vs collected, ageing, roll-rate matrix with cure and forward roll, recovery by channel and stage |
| Predictive risk | PD and early-warning model outputs, ROC, PR, calibration, confusion matrices, PSI, SHAP importance, watch list |
| Vintages | Vintage default matrix, cumulative default curves, product and new-vs-repeat cohorts |
| Profitability | Interest, fees, cost of funds, ECL, contribution and risk-adjusted return (analytical estimates) |
| Action centre | Evidence-based recommendations, plus geographic, customer, credit-policy and collection strategy panels |
| Methodology | KPI definitions, data notes and a reconciliation of the dashboard against the source tables |

## Predictive models

Both are L2-regularised logistic regressions fitted in Python (numpy) and validated **out of time**: every test record is later than every training record.

| Model | Predicts | Test ROC-AUC | PR-AUC | Precision / recall at alert threshold |
|---|---|---|---|---|
| Probability of default | 90+ DPD or write-off within 12 months of disbursement | 0.693 | 0.078 | 8.8% / 32.5% |
| Early warning | Next instalment late or missed within 30 days (performing loans) | 0.854 | 0.580 | 27.1% / 62.3% |

Feature importance is the mean absolute SHAP value. For a linear model this is exact, but it describes the model, not cause and effect.

## Key definitions

- **Gross loan portfolio (GLP):** outstanding principal on open loans at month-end, rebuilt from the instalment history; written-off loans excluded.
- **PAR X:** whole outstanding principal of loans X+ days past due ÷ GLP. **Gross NPL ratio** = PAR 90.
- **Expected credit loss:** PD × LGD × exposure, IFRS 9-style staging (LGD 65% for stages 1–2, 80% for stage 3).
- **Collection efficiency:** amount paid ÷ amount scheduled on instalments due in the period.
- **12-month default rate:** share of loans reaching 90+ DPD within a year, for loans made by Oct 2025.

The full list, the assumptions and the validation results are on the Methodology tab.

**Data note:** the source records instalments due after 31 Jul 2026 with a placeholder 15% partial payment, so collection metrics stop at July 2026.

## Run it locally

It is a static site with no build step. Serve the folder:

```bash
python -m http.server 8000
```

Then open <http://localhost:8000>. Opening `index.html` directly from disk won't work, because browsers block loading the `data/*.json` files from `file://`.

## Deploy on GitHub Pages

1. Push this folder to a GitHub repository.
2. In **Settings → Pages**, choose **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The site appears at `https://<user>.github.io/<repo>/`.

`.nojekyll` makes Pages serve the files as they are.

## Project structure

```
index.html           page markup (story + 10 tabs)
css/                 base.css (theme tokens, light/dark), dashboard.css, story.css
js/runtime.js        loads data/*.json, runs derived calculations, filter state, redraws
js/core.js           formatters and chart primitives (d3 v7)
js/calcs.js          derived measures (ratios, KPIs, insights, recommendation rules)
js/pages.js          Overview, Geography, Customers, Products
js/pages2.js         Collections, Predictive, Vintages, Profitability, Actions, Methodology
js/story.js          Story tab
data/                aggregated datasets produced by the pipeline (~2.3 MB)
assets/              TakaPay logo
pipeline/            Python that builds data/ from the raw Parquet tables
```

## Rebuilding the data

The raw Parquet tables (customers, geography, products, dates, applications, disbursements, repayment schedule, collections, monthly snapshots; ~59 MB) are not stored in this repository. Put them in `raw/`, or point the `MFS_DATA` environment variable at their folder, then run:

```bash
pip install pandas numpy pyarrow
cd pipeline
python build.py
python models.py
python extras.py
```

`build.py` rebuilds the month-end portfolio point in time from the instalments and aggregates every breakdown. `models.py` trains and scores both models. `extras.py` writes the delinquency summary and the validation checks. `geo_paths.py` turns the division boundaries into SVG paths.

## Credits

- Charts: [d3.js](https://d3js.org) v7. Fonts: Inter, Source Serif 4, Noto Sans Bengali (Google Fonts).
- Division boundaries: [geoBoundaries](https://www.geoboundaries.org) gbOpen BGD ADM1, CC BY 4.0, simplified for display.
