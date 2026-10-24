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
# start_year is used for the time split only: as a feature it cost <0.02 AUC to drop, and every
# recruiting trial lies outside the training years, so the model can only extrapolate on it.
NUMERIC = ["n_sites", "min_age_years", "max_age_years",
           "age_range_years", "n_conditions", "n_intervention_types", "eligibility_len",
           "n_exclusion_lines", "is_oncology", "is_rare"]

# Readable names for figures (SHAP etc.)
FEATURE_LABELS = {
    "n_sites": "Number of sites", "min_age_years": "Minimum age (years)",
    "max_age_years": "Maximum age (years)", "age_range_years": "Age range width (years)",
    "n_conditions": "Number of conditions", "n_intervention_types": "Number of intervention types",
    "eligibility_len": "Eligibility text length", "n_exclusion_lines": "Number of exclusion criteria",
    "is_oncology": "Oncology trial", "is_rare": "Rare-disease trial",
    "phases": "Phase", "study_type": "Study type", "masking": "Masking", "allocation": "Allocation",
    "sponsor_class": "Sponsor type", "sex": "Sex eligible", "healthy_volunteers": "Healthy volunteers",
    "site_country": "Site country",
}
# Plain-English names for slides and exports, keyed by the readable name above (or a
# "Label: VALUE" one-hot name); anything missing falls back to the readable name.
PLAIN_LABELS = {
    "Number of sites": "Number of trial sites",
    "Site country: United States": "Main site in the US",
    "Phase: PHASE1": "Phase 1 trial",
    "Phase: PHASE4": "Phase 4 trial",
    "Phase: NA": "No phase (e.g. device or behavioral trial)",
    "Age range width (years)": "Width of eligible age range",
    "Minimum age (years)": "Minimum eligible age",
    "Maximum age (years)": "Maximum eligible age",
    "Oncology trial": "Cancer trial",
    "Rare-disease trial": "Rare-disease keywords in condition",
    "Sponsor type: OTHER": "Academic / other sponsor",
    "Sponsor type: INDUSTRY": "Industry sponsor",
    "Masking: NONE": "Open-label (no masking)",
    "Eligibility text length": "Length of eligibility criteria",
    "Number of exclusion criteria": "Number of exclusion criteria",
    "Number of intervention types": "Number of intervention types",
    "Number of conditions": "Number of conditions studied",
}

# Yes/no categoricals: in SHAP outputs both sides of the one-hot (and UNKNOWN) merge into one feature.
YES_NO = {"healthy_volunteers": "Healthy volunteers accepted"}

RARE_WORDS = re.compile(r"\b(?:rare|orphan)\b", re.I)
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
