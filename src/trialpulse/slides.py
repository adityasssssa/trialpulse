"""Slide figures with one consistent style -> figures/slides/ (200 dpi, 16:9).

roc.png, pr.png, calibration_ma.png, shap_top10.png, top20_ma_trials.png.
Reads outputs of `make train` and `make report`; run those first.
Usage: python -m trialpulse.slides
"""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import pandas as pd
from sklearn.calibration import calibration_curve
from sklearn.metrics import average_precision_score, precision_recall_curve, roc_auc_score, roc_curve

from .config import PROCESSED, ROOT

OUT = ROOT / "figures" / "slides"
OUT.mkdir(parents=True, exist_ok=True)

SOURCE = "Source: ClinicalTrials.gov API v2"
SIZE = (12, 6.75)  # 16:9
# One color per model, on every chart (reference palette slots 1-2).
COLOR = {"logreg": "#2a78d6", "lightgbm": "#eb6834"}
NAME = {"logreg": "Logistic regression", "lightgbm": "LightGBM"}
INK, INK_2, MUTED, GRID = "#0b0b0b", "#52514e", "#8a8984", "#e4e3df"

# Plain-English names for the SHAP bar chart; falls back to the training label.
PLAIN = {
    "Number of sites": "Number of trial sites",
    "Healthy volunteers: True": "Accepts healthy volunteers",
    "Healthy volunteers: False": "Patients only (no healthy volunteers)",
    "Site country: United States": "Main site in the US",
    "Phase: PHASE1": "Phase 1 trial",
    "Age range width (years)": "Width of eligible age range",
    "Oncology trial": "Cancer trial",
    "Sponsor type: OTHER": "Academic / other sponsor",
    "Sponsor type: INDUSTRY": "Industry sponsor",
    "Eligibility text length": "Length of eligibility criteria",
    "Number of exclusion criteria": "Number of exclusion criteria",
    "Number of intervention types": "Number of intervention types",
}

plt.rcParams.update({
    "font.family": ["Arial", "DejaVu Sans"],
    "font.size": 16, "axes.titlesize": 22, "axes.labelsize": 18,
    "xtick.labelsize": 15, "ytick.labelsize": 15, "legend.fontsize": 16,
    "text.color": INK, "axes.labelcolor": INK_2, "xtick.color": INK_2, "ytick.color": INK_2,
    "axes.edgecolor": MUTED, "axes.spines.top": False, "axes.spines.right": False,
    "axes.grid": True, "grid.color": GRID, "grid.linewidth": 1,
    "legend.frameon": False, "figure.facecolor": "white", "axes.facecolor": "white",
})


def finish(fig, ax, title: str, name: str, note: str = ""):
    # title and source anchored to the figure edge, so every slide lines up the same way
    fig.text(0.01, 0.98, title, fontsize=22, fontweight="bold", ha="left", va="top")
    fig.text(0.01, 0.01, SOURCE + (f". {note}" if note else ""), fontsize=13, color=INK_2, ha="left", va="bottom")
    fig.tight_layout(rect=(0, 0.05, 1, 0.92))
    fig.savefig(OUT / name, dpi=200)
    plt.close(fig)
    print(f"-> {OUT / name}")


def roc(pred: pd.DataFrame, note: str):
    fig, ax = plt.subplots(figsize=SIZE)
    for m in COLOR:
        fpr, tpr, _ = roc_curve(pred.label, pred[f"p_{m}"])
        ax.plot(fpr, tpr, lw=2.5, color=COLOR[m], label=f"{NAME[m]} (AUC {roc_auc_score(pred.label, pred[f'p_{m}']):.2f})")
    ax.plot([0, 1], [0, 1], ls="--", lw=1.5, color=MUTED, label="Chance (AUC 0.50)")
    ax.set(xlabel="False positive rate", ylabel="True positive rate", xlim=(0, 1), ylim=(0, 1))
    ax.set_aspect("equal")
    ax.legend(loc="center left", bbox_to_anchor=(1.05, 0.5))
    finish(fig, ax, "ROC: both models", "roc.png", note)


def pr(pred: pd.DataFrame, note: str):
    fig, ax = plt.subplots(figsize=SIZE)
    base = pred.label.mean()
    for m in COLOR:
        prec, rec, _ = precision_recall_curve(pred.label, pred[f"p_{m}"])
        ap = average_precision_score(pred.label, pred[f"p_{m}"])
        ax.plot(rec, prec, lw=2.5, color=COLOR[m], label=f"{NAME[m]} (AUC-PR {ap:.2f}, {ap / base:.1f}× base)")
    ax.axhline(base, ls="--", lw=1.5, color=MUTED, label=f"Base rate ({base:.1%})")
    ax.set(xlabel="Recall", ylabel="Precision", xlim=(0, 1), ylim=(0, 1))
    ax.legend(loc="upper right")
    finish(fig, ax, "Precision–recall: both models", "pr.png", note)


def calibration_ma(pred: pd.DataFrame):
    ma = pred[pred.n_ma_sites >= 1]
    fig, ax = plt.subplots(figsize=SIZE)
    top = 0
    for m in COLOR:
        # few positives in the MA slice: 5 equal-count bins so each point has support
        frac, mean = calibration_curve(ma.label, ma[f"p_{m}"], n_bins=5, strategy="quantile")
        ax.plot(mean, frac, "o-", lw=2.5, ms=9, color=COLOR[m], label=NAME[m],
                markeredgecolor="white", markeredgewidth=2)
        top = max(top, mean.max(), frac.max())
    top *= 1.1
    ax.plot([0, top], [0, top], ls="--", lw=1.5, color=MUTED, label="Perfect calibration")
    ax.set(xlabel="Predicted risk", ylabel="Observed rate", xlim=(0, top), ylim=(0, top))
    for axis in (ax.xaxis, ax.yaxis):
        axis.set_major_locator(matplotlib.ticker.MultipleLocator(0.02))
        axis.set_major_formatter(matplotlib.ticker.PercentFormatter(1, decimals=0))
    ax.set_aspect("equal")
    ax.legend(loc="center left", bbox_to_anchor=(1.05, 0.5))
    finish(fig, ax, "Calibration on Massachusetts trials", "calibration_ma.png",
           f"{len(ma):,} test trials (start 2019–2021) with a MA site, {int(ma.label.sum())} stopped for low enrollment")


def shap_top10():
    imp = pd.read_csv(PROCESSED / "shap_importance.csv").head(10)
    imp["plain"] = imp.feature.map(lambda f: PLAIN.get(f, f))
    imp = imp.iloc[::-1]
    fig, ax = plt.subplots(figsize=SIZE)
    ax.barh(imp.plain, imp.mean_abs_shap, color=COLOR["lightgbm"], height=0.7)
    for y, v in enumerate(imp.mean_abs_shap):
        ax.text(v + imp.mean_abs_shap.max() * 0.01, y, f"{v:.2f}", va="center", fontsize=14, color=INK_2)
    ax.set_xlabel("Mean |SHAP| (impact on predicted log-odds)")
    ax.grid(axis="y", visible=False)
    ax.tick_params(axis="y", length=0, labelsize=16, labelcolor=INK)
    ax.set_xlim(0, imp.mean_abs_shap.max() * 1.12)
    finish(fig, ax, "What drives the LightGBM risk score", "shap_top10.png",
           "Strict labels, test trials started 2019–2021")


def top20_table():
    df = pd.read_csv(PROCESSED / "recruiting_ma_ranked.csv")
    top = df.head(20)
    rows = [[f"{i + 1}", r.nct_id, (r.title[:84] + "…") if len(r.title) > 85 else r.title,
             f"{r.risk:.0%}", r.site_city or ""] for i, r in enumerate(top.itertuples())]
    fig, ax = plt.subplots(figsize=(16, 9))
    ax.axis("off")
    tbl = ax.table(cellText=rows, colLabels=["#", "NCT ID", "Title", "Risk", "Site city"],
                   colWidths=[0.03, 0.11, 0.69, 0.06, 0.11], loc="upper left",
                   cellLoc="left", colLoc="left")
    tbl.auto_set_font_size(False)
    tbl.set_fontsize(15)
    tbl.scale(1, 2.2)
    for (r, c), cell in tbl.get_celld().items():
        cell.set_edgecolor(GRID)
        cell.visible_edges = "B"
        cell.get_text().set_color(INK if r else INK_2)
        if r == 0:
            cell.get_text().set_fontweight("bold")
    finish(fig, ax, f"Highest predicted risk among {len(df):,} recruiting MA trials", "top20_ma_trials.png",
           "Risk = predicted probability of enrollment-related early termination; ranks trials, not patients")


def main():
    pred = pd.read_parquet(PROCESSED / "test_predictions.parquet")
    note = f"Strict labels, {len(pred):,} test trials started 2019–2021"
    roc(pred, note)
    pr(pred, note)
    calibration_ma(pred)
    shap_top10()
    top20_table()


if __name__ == "__main__":
    main()
