"""Label terminated trials: did they stop for low accrual / enrollment?

Positive = TERMINATED/WITHDRAWN with a whyStopped reason about enrollment.
Negative = COMPLETED, or terminated for an unrelated reason (safety, funding, sponsor decision...).
Hand-check ~50 of these (brief: target 85-95% agreement) and refine the patterns.
"""
import re
import pandas as pd

ACCRUAL_PATTERNS = [
    r"\baccrual\b", r"\benrol+ment\b", r"\benrol+ing\b", r"\brecruit", r"\bparticipants?\b.*\b(few|low|lack|insufficient|slow|poor)",
    r"\b(few|low|lack|insufficient|slow|poor|no)\b.*\b(participants?|patients?|subjects?)\b",
    r"\bfailed to (recruit|enrol)", r"\bunable to (recruit|enrol)",
]
ACCRUAL_RE = re.compile("|".join(ACCRUAL_PATTERNS), re.IGNORECASE)


def is_accrual_failure(reason: str | None) -> bool:
    return bool(reason) and bool(ACCRUAL_RE.search(reason))


def build_labeled(terminated: pd.DataFrame, completed: pd.DataFrame) -> pd.DataFrame:
    t = terminated.copy()
    t["label"] = t["why_stopped"].map(is_accrual_failure).astype(int)
    c = completed.copy()
    c["label"] = 0
    df = pd.concat([t, c], ignore_index=True)
    df["start_year"] = pd.to_datetime(df["start_date"], errors="coerce").dt.year
    return df
