"""Label terminated trials: did they stop for low accrual / enrollment?

Strict:  positive = TERMINATED/WITHDRAWN with an accrual-type whyStopped.
         negative = COMPLETED only.
         Stops for safety/efficacy/funding/sponsor decision, and empty reasons, are EXCLUDED
         (not dumped into negatives), per the brief.
Loose:   same positives; negatives also include terminated-for-other-clear-reason trials.

Hand-check ~50 positives (brief: target 85-95% agreement) and refine the patterns.
"""
import re
import pandas as pd

ACCRUAL_RE = re.compile(
    r"\baccru|\benrol+|\brecruit|\bparticipant|\bpatients? (?:not|were not|could not)\b|"
    r"\b(?:low|slow|poor|insufficient|inadequate|lack of|no|few|not enough) (?:accrual|enrol+ment|recruitment|participants|patients|subjects|eligible)\b|"
    r"\bunable to (?:recruit|enrol+|identify|find)\b|\bfailed to (?:recruit|enrol+)\b",
    re.IGNORECASE,
)
# Reasons that are clearly NOT about accrual; these rows are excluded from strict training.
OTHER_RE = re.compile(
    r"\bsafety\b|\badverse\b|\btoxic|\bfutil|\befficacy\b|\binterim analysis\b|"
    r"\bfund|\bbudget|\bfinanc|\bsponsor(?:'s)? decision\b|\bbusiness (?:decision|reasons?)\b|"
    r"\bcompany decision\b|\bstrateg|\bdrug supply\b|\bmanufactur|\bcovid|\bpandemic\b|"
    r"\bpi (?:left|moved|relocat)|\binvestigator (?:left|moved|relocat)|\bfda\b|\bregulat",
    re.IGNORECASE,
)


def classify_reason(reason) -> str:
    """'accrual' | 'other' | 'unknown'"""
    if not isinstance(reason, str) or not reason.strip():
        return "unknown"
    if ACCRUAL_RE.search(reason):
        return "accrual"
    if OTHER_RE.search(reason):
        return "other"
    return "unknown"


def build_labeled(terminated: pd.DataFrame, completed: pd.DataFrame, scheme: str = "strict") -> pd.DataFrame:
    t = terminated.copy()
    t["reason_class"] = t["why_stopped"].map(classify_reason)
    t["label"] = (t["reason_class"] == "accrual").astype(int)
    if scheme == "strict":
        t = t[t["reason_class"] == "accrual"]
    elif scheme == "loose":
        t = t[t["reason_class"].isin(["accrual", "other"])]
    else:
        raise ValueError(scheme)
    c = completed.copy()
    c["reason_class"] = "completed"
    c["label"] = 0
    df = pd.concat([t, c], ignore_index=True)
    df["start_year"] = pd.to_datetime(df["start_date"], errors="coerce").dt.year
    return df


def sample_for_handcheck(terminated: pd.DataFrame, n: int = 50, seed: int = 0) -> pd.DataFrame:
    """Random positives to hand-check; write the agreement % in README."""
    t = terminated.copy()
    t["reason_class"] = t["why_stopped"].map(classify_reason)
    return t[t["reason_class"] == "accrual"].sample(n, random_state=seed)[["nct_id", "why_stopped"]]
