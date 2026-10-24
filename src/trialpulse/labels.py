"""Label terminated trials: did they stop for low accrual / enrollment?

Strict:  positive = TERMINATED/WITHDRAWN with an accrual-type whyStopped.
         negative = COMPLETED only.
         Stops for safety/efficacy/funding/sponsor decision, and empty reasons, are EXCLUDED
         (not dumped into negatives), per the brief. "Mixed" reasons (accrual AND another
         clear reason, e.g. "slow accrual and loss of funding") are excluded too.
Loose:   same positives; negatives also include terminated-for-other-clear-reason trials.

Hand-check samples: python -m trialpulse.handcheck (brief: target 85-95% agreement).
"""
import re
import pandas as pd

ACCRUAL_RE = re.compile(
    r"\baccru|\benrol+|\brecruit|\bpatients? (?:not|were not|could not)\b|"
    r"\b(?:low|slow|poor|insufficient|inadequate|lack of|no|few|not enough) (?:accrual|enrol+ment|recruitment|participants|patients|subjects|eligible)\b|"
    r"\bunable to (?:recruit|enrol+|identify|find)\b|\bfailed to (?:recruit|enrol+)\b|"
    r"\b0 participants\b|\bno (?:potential|eligible|appropriate) participants\b|"
    r"\black of (?:sufficient |adequate |enough |appropriate )?(?:participants|patients|subjects)\b",
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
    """'accrual' | 'other' | 'mixed' | 'unknown'"""
    if not isinstance(reason, str) or not reason.strip():
        return "unknown"
    accrual, other = bool(ACCRUAL_RE.search(reason)), bool(OTHER_RE.search(reason))
    if accrual and other:
        return "mixed"
    if accrual:
        return "accrual"
    if other:
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
    df["start_year"] = pd.to_datetime(df["start_date"], errors="coerce", format="mixed").dt.year
    return df

