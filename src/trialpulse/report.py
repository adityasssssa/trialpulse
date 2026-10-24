"""Ranked list of recruiting MA trials + a top-20 table figure for slides.
Usage: python -m trialpulse.report
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from .config import PROCESSED, ROOT

FIGURES = ROOT / "figures"
FIGURES.mkdir(exist_ok=True)


def main():
    df = pd.read_parquet(PROCESSED / "recruiting_ma_scored.parquet")
    cols = ["nct_id", "title", "risk", "phases", "sponsor_class", "site_facility", "site_city", "conditions"]
    out = df[cols].sort_values("risk", ascending=False)
    out.to_csv(PROCESSED / "recruiting_ma_ranked.csv", index=False)
    print(f"{len(out)} recruiting MA trials ranked -> {PROCESSED / 'recruiting_ma_ranked.csv'}")

    top = out.head(20).copy()
    top["title"] = top["title"].str.slice(0, 60)
    top["risk"] = top["risk"].map(lambda r: f"{r:.0%}")
    fig, ax = plt.subplots(figsize=(14, 7))
    ax.axis("off")
    tbl = ax.table(cellText=top[["nct_id", "title", "risk", "phases", "site_city"]].values,
                   colLabels=["NCT", "Title", "Risk", "Phase", "Site city"], loc="center", cellLoc="left")
    tbl.auto_set_font_size(False); tbl.set_fontsize(9); tbl.scale(1, 1.4)
    ax.set_title(f"Highest predicted enrollment-failure risk among {len(out):,} recruiting MA trials\n"
                 "Source: ClinicalTrials.gov API v2. Model predicts enrollment-related early termination only.",
                 fontsize=11, loc="left")
    fig.savefig(FIGURES / "top20_ma_trials.png", dpi=150, bbox_inches="tight")
    print(f"figure -> {FIGURES / 'top20_ma_trials.png'}")


if __name__ == "__main__":
    main()
