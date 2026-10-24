"""Design-time features only: nothing that is known only after the trial runs.
(Say the leakage sentence on the slide.)"""
import re
import numpy as np
import pandas as pd

CATEGORICAL = ["phases", "study_type", "masking", "allocation",
               "sponsor_class", "sex", "healthy_volunteers", "site_country"]
# enrollment_type (ACTUAL only once a trial has run), anticipated_enrollment and
# planned_duration_months are computed (for trial cards) but not modelled:
# after the leakage guards they are ~all null on historical trials and always present on recruiting
# ones, so the model would learn from stale ESTIMATED records and score deployment off-distribution.
NUMERIC = ["n_sites", "start_year", "min_age_years", "max_age_years",
           "age_range_years", "n_conditions", "n_intervention_types", "eligibility_len",
           "n_exclusion_lines", "is_oncology", "is_rare"]

RARE_WORDS = re.compile(r"\b(?:rare|orphan|syndrome)\b", re.I)
ONC_WORDS = re.compile(r"\b(?:cancer|carcinoma|tumou?r|lymphoma|leukemia|melanoma|sarcoma|neoplasm)\b", re.I)


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
    # LEAKAGE GUARD: actual enrollment is known only after the trial runs. Keep anticipated only.
    f["anticipated_enrollment"] = f["enrollment"].where(f["enrollment_type"] != "ACTUAL")
    f["start_year"] = pd.to_datetime(f["start_date"], errors="coerce", format="mixed").dt.year
    # LEAKAGE GUARD: an ACTUAL primary completion date is an outcome (terminated trials end early).
    # Keep the planned duration only when the completion date is still anticipated.
    pc_type = f["primary_completion_type"] if "primary_completion_type" in f else pd.Series(None, index=f.index)
    pcd = pd.to_datetime(f["primary_completion_date"], errors="coerce", format="mixed").where(pc_type == "ESTIMATED")
    sd = pd.to_datetime(f["start_date"], errors="coerce", format="mixed")
    f["planned_duration_months"] = (pcd - sd).dt.days / 30.4
    f["min_age_years"] = f["min_age"].map(_age_years)
    f["max_age_years"] = f["max_age"].map(_age_years)
    f["age_range_years"] = f["max_age_years"].fillna(100) - f["min_age_years"].fillna(0)
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
