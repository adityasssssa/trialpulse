# TrialPulse — Design

## Architecture

```
ClinicalTrials.gov API v2 ──> fetch.py ──> data/raw/*.parquet
                                              │
                               labels.py ─────┤  (whyStopped -> strict/loose label)
                               features.py ───┤  (design-time features only)
                                              ▼
                                 train.py: logreg baseline + LightGBM
                                   time split 2008-18 / 2019-21
                                   metrics.csv, figures/*.png, models/*.joblib
                                              │
                        recruiting_ma_scored.parquet ◄─┘
                                              │
      MassGIS EJ 2020 + CDC PLACES (stretch) ──┤
                                              ▼
                               app/app.py (Streamlit): ranked table · map · trial card
```

## Data

| Layer | Source | Use |
|---|---|---|
| Trials | ClinicalTrials.gov API v2 | labels, features, deployment set, site geoPoints |
| Equity overlay | MassGIS EJ 2020 block groups (kit `ej.zip`) | income / minority / English-isolation flags around each site |
| Disease burden | CDC PLACES, MA counties (kit `places.zip`) | prevalence weighting |
| Literature (optional) | PubMed E-utilities (kit `pubmed.zip`) | link condition to recent MA-affiliated papers on the card |

## Label

Positive: TERMINATED/WITHDRAWN and `whyStopped` matches the accrual rule.
Excluded from training: TERMINATED/WITHDRAWN where `whyStopped` is about safety, efficacy/futility, funding, sponsor/business decision, or is empty (ambiguous).
Negative: COMPLETED, and terminated-for-other-clear-reason only in the "loose" variant.

## Features (design-time only)

anticipated enrollment (null when EnrollmentType=ACTUAL), phase, study type, sponsor class, number of sites, number of countries, eligibility text length and exclusion-line count, min/max age and age-range width, sex, healthy volunteers, intervention type(s), masking, allocation, condition count, oncology flag, rare-disease flag, planned duration (primary completion − start), start year.

## Model and evaluation

Logistic regression (balanced) baseline → LightGBM. Time split by start year. Metrics: AUC-ROC, AUC-PR and ratio to base rate, precision@top-10% and ratio to base rate, Brier + reliability curve, SHAP summary. Report calibration on the MA slice of the test set and say the slice is small.

## Dashboard

Single screen, dark-on-light, big type. Left: ranked table with filters (condition, phase, min risk). Right: map of site points sized by risk, EJ block groups behind it when available. Below: trial card for the selected trial with NCT link, site contact, FKGL score, "eligibility is decided by the study team", "not medical advice".

## Known failure modes (go on the limits slide)

- `whyStopped` is optional free text → label noise; mitigated by 50-sample check and strict/loose variants.
- Survivorship: never-registered trials are invisible.
- Rare-disease trials look "risky" — partly a real finding (they need outreach most); show SHAP and rank within condition category.
- Reach map is an index, not a validated model.
- Model cannot see protocol quality or PI reputation.
