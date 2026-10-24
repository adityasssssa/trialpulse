"""Ranked list of recruiting MA trials -> data/processed/recruiting_ma_ranked.csv.
The slide table of the top 20 is drawn by `make slides`.
Usage: python -m trialpulse.report
"""
import pandas as pd
from .config import PROCESSED


def main():
    df = pd.read_parquet(PROCESSED / "recruiting_ma_scored.parquet")
    cols = ["nct_id", "title", "risk", "phases", "sponsor_class", "site_facility", "site_city", "conditions"]
    out = df[cols].sort_values("risk", ascending=False)
    out.to_csv(PROCESSED / "recruiting_ma_ranked.csv", index=False)
    print(f"{len(out)} recruiting MA trials ranked -> {PROCESSED / 'recruiting_ma_ranked.csv'}")


if __name__ == "__main__":
    main()
