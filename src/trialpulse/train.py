"""Train and evaluate the enrollment-failure model, then score recruiting MA trials.

Time split: train on start_year 2008-2018, test on 2019-2021 (adjust in config/here).
Reports AUC-ROC, AUC-PR vs base rate, precision in top decile, Brier score,
for a logistic-regression baseline and a LightGBM model, under both label schemes,
on the full test set and on the Massachusetts slice (>= 1 MA site) -> metrics.csv.
Subgroup AUCs (is_rare, top-5 MeSH disease categories; strict scheme) -> subgroup_metrics.csv.
Recruiting MA trials are scored with the strict LightGBM model.
Usage: python -m trialpulse.train
"""
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, average_precision_score, brier_score_loss
import lightgbm as lgb
import joblib
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from sklearn.calibration import calibration_curve
from sklearn.metrics import RocCurveDisplay, PrecisionRecallDisplay

from .config import RAW, PROCESSED, MODELS, TRAIN_START_YEAR, TRAIN_END_YEAR, ROOT
from .labels import build_labeled
from .features import make_features, CATEGORICAL, NUMERIC

TEST_FROM_YEAR = 2019
SCHEMES = ["strict", "loose"]
# Top-level MeSH disease categories (C tree + Mental Disorders), matched against condition_mesh.
# "Pathological Conditions, Signs and Symptoms" is left out: it is a catch-all, not a disease area.
MESH_CATEGORIES = [
    "Infections", "Neoplasms", "Musculoskeletal Diseases", "Digestive System Diseases",
    "Stomatognathic Diseases", "Respiratory Tract Diseases", "Otorhinolaryngologic Diseases",
    "Nervous System Diseases", "Eye Diseases", "Urogenital Diseases", "Male Urogenital Diseases",
    "Female Urogenital Diseases and Pregnancy Complications", "Cardiovascular Diseases",
    "Hemic and Lymphatic Diseases", "Congenital, Hereditary, and Neonatal Diseases and Abnormalities",
    "Skin and Connective Tissue Diseases", "Nutritional and Metabolic Diseases",
    "Endocrine System Diseases", "Immune System Diseases", "Disorders of Environmental Origin",
    "Occupational Diseases", "Chemically-Induced Disorders", "Wounds and Injuries", "Mental Disorders",
]
FIGURES = ROOT / "figures"
FIGURES.mkdir(exist_ok=True)


def preprocessor():
    return ColumnTransformer([
        ("num", Pipeline([("imp", SimpleImputer(strategy="median")), ("sc", StandardScaler())]), NUMERIC),
        ("cat", OneHotEncoder(handle_unknown="ignore", min_frequency=20), CATEGORICAL),
    ])


def evaluate(name, y, p):
    base = y.mean()
    top = p >= np.quantile(p, 0.9)
    m = {
        "model": name,
        "n_test": int(len(y)),
        "base_rate": round(float(base), 4),
        "auc_roc": round(roc_auc_score(y, p), 4),
        "auc_pr": round(average_precision_score(y, p), 4),
        "auc_pr_vs_base": round(average_precision_score(y, p) / base, 2),
        "precision_top10pct": round(float(y[top].mean()), 4),
        "precision_top10pct_vs_base": round(float(y[top].mean() / base), 2),
        "brier": round(brier_score_loss(y, p), 4),
    }
    return m


def save_figures(y, p, name):
    RocCurveDisplay.from_predictions(y, p); plt.title(f"ROC - {name}"); plt.savefig(FIGURES / f"roc_{name}.png", dpi=150); plt.close()
    PrecisionRecallDisplay.from_predictions(y, p); plt.title(f"PR - {name}"); plt.savefig(FIGURES / f"pr_{name}.png", dpi=150); plt.close()
    frac, mean = calibration_curve(y, p, n_bins=10)
    plt.plot(mean, frac, "o-"); plt.plot([0, 1], [0, 1], "--", c="gray")
    plt.xlabel("Predicted risk"); plt.ylabel("Observed rate"); plt.title(f"Reliability - {name}")
    plt.savefig(FIGURES / f"calibration_{name}.png", dpi=150); plt.close()


def subgroup_auc(test: pd.DataFrame, preds: dict) -> pd.DataFrame:
    """AUC within is_rare=0/1 and within the 5 most common MeSH categories in the test set."""
    groups = {f"is_rare={v}": test["is_rare"] == v for v in (0, 1)}
    mesh = test["condition_mesh"].fillna("").str.split("|").map(set)
    counts = {c: int(mesh.map(lambda s: c in s).sum()) for c in MESH_CATEGORIES}
    for c in sorted(counts, key=counts.get, reverse=True)[:5]:
        groups[f"mesh={c}"] = mesh.map(lambda s: c in s)
    rows = []
    for g, mask in groups.items():
        y = test.loc[mask, "label"]
        row = {"subgroup": g, "n": int(mask.sum()), "positives": int(y.sum()),
               "base_rate": round(float(y.mean()), 4)}
        for name, p in preds.items():
            row[f"auc_{name}"] = round(roc_auc_score(y, p[mask.to_numpy()]), 4) if 0 < y.sum() < len(y) else np.nan
        rows.append(row)
    return pd.DataFrame(rows)


def save_ma_calibration(y, preds: dict):
    top = 0
    for name, p in preds.items():
        # few positives in the MA slice: equal-count bins so each point has support
        frac, mean = calibration_curve(y, p, n_bins=5, strategy="quantile")
        plt.plot(mean, frac, "o-", label=name)
        top = max(top, mean.max(), frac.max()) * 1.1
    plt.plot([0, top], [0, top], "--", c="gray")
    plt.xlabel("Predicted risk"); plt.ylabel("Observed rate"); plt.legend()
    plt.title(f"Reliability - MA test trials (n={len(y):,})\nSource: ClinicalTrials.gov API v2")
    plt.savefig(FIGURES / "calibration_ma.png", dpi=150, bbox_inches="tight"); plt.close()


def make_models():
    return {
        # unweighted: class_weight="balanced" inflated probabilities (Brier 0.17 vs 0.04)
        "logreg": Pipeline([("prep", preprocessor()), ("clf", LogisticRegression(max_iter=2000))]),
        "lightgbm": Pipeline([("prep", preprocessor()),
                              ("clf", lgb.LGBMClassifier(n_estimators=400, learning_rate=0.03,
                                                         num_leaves=31, subsample=0.8,
                                                         colsample_bytree=0.8, verbose=-1))]),
    }


def main():
    term = pd.read_parquet(RAW / "terminated.parquet")
    comp = pd.read_parquet(RAW / "completed.parquet")
    X_cols = NUMERIC + CATEGORICAL
    results, fitted = [], {}
    for scheme in SCHEMES:
        df = make_features(build_labeled(term, comp, scheme=scheme))
        df = df[df["start_year"].between(TRAIN_START_YEAR, TRAIN_END_YEAR)]
        df = df[df["study_type"] == "INTERVENTIONAL"]  # keep the problem well-defined; revisit

        train = df[df["start_year"] < TEST_FROM_YEAR]
        test = df[df["start_year"] >= TEST_FROM_YEAR]
        y = test["label"].to_numpy()
        ma = (test["n_ma_sites"] >= 1).to_numpy()
        print(f"[{scheme}] train={len(train)} test={len(test)} test_ma={ma.sum()} "
              f"positives(train)={train.label.mean():.3f}")

        suffix = "" if scheme == "strict" else f"_{scheme}"
        models, preds = make_models(), {}
        for name, pipe in models.items():
            pipe.fit(train[X_cols], train["label"])
            p = preds[name] = pipe.predict_proba(test[X_cols])[:, 1]
            results.append({"scheme": scheme, "slice": "all", **evaluate(name, y, p)})
            results.append({"scheme": scheme, "slice": "ma", **evaluate(name, y[ma], p[ma])})
            save_figures(y, p, name + suffix)
            joblib.dump(pipe, MODELS / f"{name}{suffix}.joblib")
        fitted[scheme] = models
        if scheme == "strict":
            save_ma_calibration(y[ma], {n: p[ma] for n, p in preds.items()})
            sub = subgroup_auc(test, preds)
            sub.to_csv(PROCESSED / "subgroup_metrics.csv", index=False)
            print(sub.to_string(index=False))

    metrics = pd.DataFrame(results)
    metrics.to_csv(PROCESSED / "metrics.csv", index=False)
    print(metrics.to_string(index=False))

    # Score the deployment set
    best = fitted["strict"]["lightgbm"]
    ma = make_features(pd.read_parquet(RAW / "recruiting_ma.parquet"))
    ma["risk"] = best.predict_proba(ma[X_cols])[:, 1]
    ma = ma.sort_values("risk", ascending=False)
    ma.to_parquet(PROCESSED / "recruiting_ma_scored.parquet", index=False)
    print(f"\nScored {len(ma)} recruiting MA trials -> {PROCESSED / 'recruiting_ma_scored.parquet'}")
    print(ma[["nct_id", "title", "risk", "site_city"]].head(10).to_string(index=False))


if __name__ == "__main__":
    main()
