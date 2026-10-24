"""Design-time features only: nothing that is known only after the trial runs.
(Say the leakage sentence on the slide.)"""
import re
import numpy as np
import pandas as pd

CATEGORICAL = ["phases", "study_type", "enrollment_type", "masking", "allocation",
               "sponsor_class", "sex", "healthy_volunteers", "site_country"]
NUMERIC = ["enrollment", "n_sites", "start_year", "min_age_years", "max_age_years",
           "n_conditions", "n_intervention_types", "eligibility_len", "n_exclusion_lines",
           "planned_duration_months", "is_oncology", "is_rare"]

RARE_WORDS = re.compile(r"\b(rare|orphan|syndrome)\b", re.I)
ONC_WORDS = re.compile(r"\b(cancer|carcinoma|tumou?r|lymphoma|leukemia|melanoma|sarcoma|neoplasm)\b", re.I)


def _age_years(s):
    if not isinstance(s, str):
        return np.nan
    m = re.match(r"(\d+)\s*(Year|Month|Week|Day)", s, re.I)
    if not m:
        return np.nan
    n, unit = float(m.group(1)), m.group(2).lower()
    return n / {"year": 1, "month": 12, "week": 52, "day": 365}[unit]


def make_features(df: pd.DataFrame) -> pd.DataFrame:
    f = df.copy()
    f["start_year"] = pd.to_datetime(f["start_date"], errors="coerce").dt.year
    pcd = pd.to_datetime(f["primary_completion_date"], errors="coerce")
    sd = pd.to_datetime(f["start_date"], errors="coerce")
    f["planned_duration_months"] = (pcd - sd).dt.days / 30.4
    f["min_age_years"] = f["min_age"].map(_age_years)
    f["max_age_years"] = f["max_age"].map(_age_years)
    f["n_conditions"] = f["conditions"].fillna("").str.count(r"\|") + (f["conditions"].fillna("") != "")
    f["n_intervention_types"] = f["intervention_types"].fillna("").str.count(r"\|") + (f["intervention_types"].fillna("") != "")
    elig = f["eligibility_text"].fillna("")
    f["eligibility_len"] = elig.str.len()
    f["n_exclusion_lines"] = elig.str.split("Exclusion Criteria").str[-1].str.count(r"\n\s*[\*\-•]")
    f["is_oncology"] = (f["conditions"].fillna("").str.contains(ONC_WORDS) | f["title"].fillna("").str.contains(ONC_WORDS)).astype(int)
    f["is_rare"] = f["conditions"].fillna("").str.contains(RARE_WORDS).astype(int)
    for c in CATEGORICAL:
        f[c] = f[c].fillna("UNKNOWN").astype(str)
    return f
