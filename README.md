# TrialPulse

Predict which currently recruiting Massachusetts clinical trials will fail to enroll, trained on 15 years of terminated trials, so recruitment offices know where to focus outreach before a trial quietly closes. DS+X Healthcare track hackathon project, October 2026.

## Getting started

```bash
git clone https://github.com/adityasssssa/trialpulse.git
cd trialpulse
brew install libomp        # macOS only: OpenMP runtime LightGBM needs
make setup                 # creates .venv and installs requirements
source .venv/bin/activate  # optional: make targets use .venv/bin/python directly
make check                 # step 0: confirm the ClinicalTrials.gov API works
make data                  # pull terminated / completed / recruiting-MA trials -> data/raw/*.parquet
make train                 # time-split model, metrics -> data/processed/metrics.csv, scored MA trials
make report                # ranked MA trials CSV
make slides                # slide figures -> figures/slides/
make handcheck             # whyStopped samples for the label hand-check
make export                # website data -> exports/ (see HANDOFF.md)
make all                   # data -> train -> report -> slides -> export
```

**Building a website or app on this data?** Start with [`HANDOFF.md`](HANDOFF.md): every file in [`exports/`](exports/), every field, and the display rules.

Quick smoke test before the full pull: `.venv/bin/python -m trialpulse.fetch --limit 3000`.

## Spec and plan

The spec lives in [`docs/spec/`](docs/spec/) (`requirements.md`, `design.md`, `tasks.md`) and is the working task list.

**Evaluation:** time split, train on trials started 2008–2018, test on 2019–2021. Metrics table: `data/processed/metrics.csv`; figures in `figures/`.
**Label hand-check agreement:** a team member hand-labeled 125 whyStopped reasons (the rule was not tuned on this sample). 90% of rule positives are true enrollment failures (45/50). 100% of "other" (25/25) and 96% of "unknown" (24/25) are correctly not enrollment failures. 48% of "mixed" (12/25) are enrollment failures. Labels: [`docs/handcheck_labels.csv`](docs/handcheck_labels.csv). `make handcheck` exported random whyStopped samples (random seed `20261024`, set in `src/trialpulse/handcheck.py`) from the modelling population (interventional, start 2008–2021, not retrospectively registered) to `data/processed/`: 50 accrual positives (`handcheck_50.csv`) and 25 each of other, unknown and mixed (`handcheck_other_25.csv`, `handcheck_unknown_25.csv`, `handcheck_mixed_25.csv`). Fill in `human_label` and compare with `auto_label`.

**Data source:** ClinicalTrials.gov API v2.

## Results

Strict labels unless noted. Test set: interventional trials started 2019–2021, after excluding retrospective registrations; trained on 2008–2018. "US" and "MA" slices are test trials with at least one US / Massachusetts site. Multiples in brackets are relative to the base rate. Source: ClinicalTrials.gov API v2; full table in `data/processed/metrics.csv`.

| Training population | Labels | Evaluated on | Model | Test trials | Base rate | AUC-ROC | AUC-PR | Precision, top 10% | Brier |
|---|---|---|---|---|---|---|---|---|---|
| All countries | strict | full test | **LightGBM** | 30,087 | 5.6% | **0.763** | 0.211 (3.7×) | 0.197 (3.5×) | 0.049 |
| All countries | strict | full test | Logistic regression | 30,087 | 5.6% | 0.752 | 0.209 (3.7×) | 0.202 (3.6×) | 0.050 |
| All countries | strict | US slice | **LightGBM** | 13,517 | 7.1% | **0.731** | 0.173 (2.5×) | 0.209 (3.0×) | 0.062 |
| All countries | strict | US slice | Logistic regression | 13,517 | 7.1% | 0.721 | 0.184 (2.6×) | 0.218 (3.1×) | 0.062 |
| All countries | strict | MA slice | **LightGBM** | 1,679 | 5.1% | **0.746** | 0.168 (3.3×) | 0.184 (3.6×) | 0.046 |
| All countries | strict | MA slice | Logistic regression | 1,679 | 5.1% | 0.719 | 0.182 (3.6×) | 0.179 (3.5×) | 0.046 |
| All countries | loose | full test | LightGBM | 32,901 | 5.1% | 0.750 | 0.154 (3.0×) | 0.167 (3.2×) | 0.046 |
| All countries | loose | full test | Logistic regression | 32,901 | 5.1% | 0.739 | 0.153 (3.0×) | 0.172 (3.3×) | 0.046 |
| US only | strict | full test (US) | LightGBM | 13,517 | 7.1% | 0.727 | 0.173 (2.5×) | 0.200 (2.8×) | 0.062 |
| US only | strict | full test (US) | Logistic regression | 13,517 | 7.1% | 0.711 | 0.172 (2.4×) | 0.211 (3.0×) | 0.063 |
| US only | loose | full test (US) | LightGBM | 15,062 | 6.3% | 0.721 | 0.153 (2.4×) | 0.176 (2.8×) | 0.057 |
| US only | loose | full test (US) | Logistic regression | 15,062 | 6.3% | 0.705 | 0.149 (2.4×) | 0.183 (2.9×) | 0.057 |

**Label quality** (125 hand-checked whyStopped reasons, rule not tuned on this sample): 90% of positives are true enrollment failures (45/50); "other" 100% (25/25) and "unknown" 96% (24/25) are correctly not enrollment failures. Mixed reasons (enrollment plus another cause) are excluded from training, and about half of them (12/25) are true enrollment failures. So the positive class is conservative: it leaves out some genuine enrollment failures rather than including doubtful ones.

LightGBM beat logistic regression by about 0.01 AUC on the full test set (0.763 vs 0.752), under the 0.03 bar. The default model is all countries, strict labels, LightGBM; the US-only variant is kept for the record (it scored 0.727 on its own test set, below our 0.75 bar).

Slide figures (`make slides`, `figures/slides/`): ROC and precision–recall for both models, calibration on the MA slice, top-10 SHAP drivers, and the top 20 recruiting MA trials by predicted risk.

## Limits

- **Retrospective registrations are excluded.** Trials first submitted more than 30 days after their start date are dropped from training and test (68,763 of 180,663 interventional trials started 2008–2021, 38%). A trial registered after it has already run is usually finished by then, so it can only ever appear as COMPLETED; keeping these trials teaches the model "registered late → low risk", which is outcome information, not trial design. The removed trials have a 2.9% positive rate vs 6.1% for those kept. Source: ClinicalTrials.gov API v2.
- **The leak was real.** With the filter, strict LightGBM test AUC fell from 0.791 to 0.763 (MA slice: 0.745 to 0.736, and 0.746 after the later rare-disease keyword change), and countries with many retrospective registrations (Turkey, Egypt) dropped out of the SHAP top 10. The test set changes too (43,603 → 30,087 trials), so the two numbers are not strictly like-for-like. Source: ClinicalTrials.gov API v2, test trials started 2019–2021.
- **Deployment trials look different.** Recruiting MA trials differ from the test set: median 10 sites vs 1, about twice the eligibility text, 46% vs 28% industry sponsors, 10% vs 32% accepting healthy volunteers. Scores for these larger trials extrapolate beyond what most test trials look like, and site counts for recruiting trials can still grow, so treat scores as a ranking rather than exact probabilities. Source: ClinicalTrials.gov API v2.
- **Observational studies are out of scope.** The model is trained on interventional trials only, and only recruiting interventional MA trials are scored.

## Project structure

```
trialpulse/
├── scripts/check_api.py       # API sanity check from the brief
├── src/trialpulse/
│   ├── config.py              # paths, API fields, training window
│   ├── fetch.py               # ClinicalTrials.gov v2 pull + flatten
│   ├── labels.py              # whyStopped -> low-accrual label
│   ├── features.py            # design-time features only (no leakage)
│   ├── train.py               # logreg baseline + LightGBM, metrics, SHAP, scoring
│   ├── report.py              # ranked CSV of recruiting MA trials
│   ├── slides.py              # slide figures, one style
│   ├── export.py              # website exports + validation
│   └── handcheck.py           # label hand-check samples
├── exports/                   # website data: JSON + key figures (committed)
├── HANDOFF.md                 # guide to exports/ and display rules
├── docs/spec/                 # requirements, design, tasks
├── figures/                   # ROC / PR / calibration / SHAP PNGs (gitignored)
│   └── slides/                # slide figures (committed)
├── data/raw, data/processed   # gitignored
├── notebooks/                 # exploration
└── requirements.txt, Makefile, pyproject.toml
```

## Team

- [@adityasssssa](https://github.com/adityasssssa)
- [@aaRUSH1234-glitch](https://github.com/aaRUSH1234-glitch)

Original planning brief: [docs/idea_brief.md](docs/idea_brief.md).
