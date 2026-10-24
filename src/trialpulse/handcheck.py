"""Export random whyStopped samples per reason class for a human label check.

Sampled from the modelling population (interventional, start 2008-2021, not retrospectively
registered), so the agreement number describes the labels the model actually trains on.
Fill in human_label, then report agreement with auto_label in the README.
Usage: python -m trialpulse.handcheck
"""
import pandas as pd
from .config import RAW, PROCESSED, TRAIN_START_YEAR, TRAIN_END_YEAR
from .labels import classify_reason
from .train import is_retrospective

SEED = 20261024
SAMPLES = {"accrual": ("handcheck_50.csv", 50), "other": ("handcheck_other_25.csv", 25),
           "unknown": ("handcheck_unknown_25.csv", 25), "mixed": ("handcheck_mixed_25.csv", 25)}


def main():
    t = pd.read_parquet(RAW / "terminated.parquet")
    start_year = pd.to_datetime(t["start_date"], errors="coerce", format="mixed").dt.year
    t = t[start_year.between(TRAIN_START_YEAR, TRAIN_END_YEAR) & (t["study_type"] == "INTERVENTIONAL")]
    t = t[~is_retrospective(t)]
    t = t.assign(auto_label=t["why_stopped"].map(classify_reason), human_label="")
    for label, (fname, n) in SAMPLES.items():
        out = t[t["auto_label"] == label].sample(n, random_state=SEED)
        path = PROCESSED / fname
        out[["nct_id", "why_stopped", "auto_label", "human_label"]].to_csv(path, index=False)
        print(f"{n} {label} (of {(t['auto_label'] == label).sum():,}) -> {path}")


if __name__ == "__main__":
    main()
