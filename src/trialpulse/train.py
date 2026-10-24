"""Train and evaluate the enrollment-failure model, then score recruiting MA trials.

Time split: train on start_year 2010-2018, test on 2019-2021 (adjust in config/here).
Reports AUC-ROC, AUC-PR vs base rate, precision in top decile, Brier score,
for a logistic-regression baseline and a LightGBM model.
Usage: python -m trialpulse.train
"""
import json
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

from .config import RAW, PROCESSED, MODELS, TRAIN_START_YEAR, TRAIN_END_YEAR
from .labels import build_labeled
from .features import make_features, CATEGORICAL, NUMERIC

TEST_FROM_YEAR = 2019


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
    print(json.dumps(m, indent=2))
    return m


def main():
    term = pd.read_parquet(RAW / "terminated.parquet")
    comp = pd.read_parquet(RAW / "completed.parquet")
    df = make_features(build_labeled(term, comp))
    df = df[df["start_year"].between(TRAIN_START_YEAR, TRAIN_END_YEAR)]
    df = df[df["study_type"] == "INTERVENTIONAL"]  # keep the problem well-defined; revisit

    train = df[df["start_year"] < TEST_FROM_YEAR]
    test = df[df["start_year"] >= TEST_FROM_YEAR]
    X_cols = NUMERIC + CATEGORICAL
    print(f"train={len(train)} test={len(test)} positives(train)={train.label.mean():.3f}")

    models = {
        "logreg": Pipeline([("prep", preprocessor()),
                            ("clf", LogisticRegression(max_iter=2000, class_weight="balanced"))]),
        "lightgbm": Pipeline([("prep", preprocessor()),
                              ("clf", lgb.LGBMClassifier(n_estimators=400, learning_rate=0.03,
                                                         num_leaves=31, subsample=0.8,
                                                         colsample_bytree=0.8, verbose=-1))]),
    }
    results = []
    for name, pipe in models.items():
        pipe.fit(train[X_cols], train["label"])
        p = pipe.predict_proba(test[X_cols])[:, 1]
        results.append(evaluate(name, test["label"].to_numpy(), p))
        joblib.dump(pipe, MODELS / f"{name}.joblib")
    pd.DataFrame(results).to_csv(PROCESSED / "metrics.csv", index=False)

    # Score the deployment set
    best = models["lightgbm"]
    ma = make_features(pd.read_parquet(RAW / "recruiting_ma.parquet"))
    ma["risk"] = best.predict_proba(ma[X_cols])[:, 1]
    ma = ma.sort_values("risk", ascending=False)
    ma.to_parquet(PROCESSED / "recruiting_ma_scored.parquet", index=False)
    print(f"\nScored {len(ma)} recruiting MA trials -> {PROCESSED / 'recruiting_ma_scored.parquet'}")
    print(ma[["nct_id", "title", "risk", "site_city"]].head(10).to_string(index=False))


if __name__ == "__main__":
    main()
