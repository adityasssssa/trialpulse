"""Website data exports -> exports/ (committed). See HANDOFF.md for every field.

  ma_trials.json          one record per scored recruiting MA trial, sorted by risk
  ma_trials_index.json    same records without eligibility_criteria (for list pages)
  metrics.json            evaluation metrics + training setup
  feature_importance.json global top-15 SHAP features
  summary.json            homepage headline numbers + plain-English description
  figures/                key PNGs copied from figures/

Run after `make train`, `make report` and `make slides`. Validates every file before finishing.
Usage: python -m trialpulse.export
"""
import json
import math
import shutil

import joblib
import numpy as np
import pandas as pd
import shap

from .config import MODELS, PROCESSED, RAW, ROOT, TRAIN_START_YEAR, TRAIN_END_YEAR
from .features import CATEGORICAL, FEATURE_LABELS, NUMERIC, PLAIN_LABELS, YES_NO
from .train import DEFAULT_POPULATION, MESH_CATEGORIES, TEST_FROM_YEAR, _source, merge_yes_no, readable

OUT = ROOT / "exports"
SOURCE = "ClinicalTrials.gov API v2"
SOURCE_URL = "https://clinicaltrials.gov/data-api/api"
TIERS = [("high", 0.10), ("elevated", 0.20)]  # top 10%, next 20%, rest "typical"
# Kept in the model but never shown as a per-trial reason: it mostly reflects how consistently
# US-regulated trials report a stop reason, not anything about the trial's design.
NOT_A_REASON = {"site_country"}
FIGURES = {"roc.png": "figures/slides/roc.png", "pr.png": "figures/slides/pr.png",
           "calibration_ma.png": "figures/slides/calibration_ma.png",
           "shap_top10.png": "figures/slides/shap_top10.png",
           "shap_summary.png": "figures/shap_summary.png",
           "top20_ma_trials.png": "figures/slides/top20_ma_trials.png"}

# How a categorical value reads in a sentence
VALUE_TEXT = {
    "EARLY_PHASE1": "Early Phase 1", "PHASE1": "Phase 1", "PHASE2": "Phase 2", "PHASE3": "Phase 3",
    "PHASE4": "Phase 4", "PHASE1|PHASE2": "Phase 1/2", "PHASE2|PHASE3": "Phase 2/3", "NA": "not applicable",
    "": "not stated", "UNKNOWN": "not stated", "infrequent_sklearn": "a rare category",
    "OTHER": "academic / other", "INDUSTRY": "industry", "NIH": "NIH", "FED": "US federal",
    "OTHER_GOV": "other government", "NETWORK": "research network", "INDIV": "individual",
    "NONE": "none (open label)", "SINGLE": "single-blind", "DOUBLE": "double-blind", "TRIPLE": "triple-blind",
    "QUADRUPLE": "quadruple-blind", "RANDOMIZED": "randomized", "NON_RANDOMIZED": "non-randomized",
    "ALL": "all sexes", "FEMALE": "female only", "MALE": "male only",
}
CATEGORY_TEXT = {"phases": "Phase", "study_type": "Study type", "masking": "Masking",
                 "allocation": "Allocation", "sponsor_class": "Sponsor", "sex": "Sex eligible",
                 "site_country": "Main site country"}


def _clean(v):
    """JSON-safe scalar: NaN/NaT -> None, numpy -> python."""
    if v is None:
        return None
    if isinstance(v, (float, np.floating)):
        return None if math.isnan(v) else float(v)
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    if v is pd.NaT:
        return None
    return v


def _split(s) -> list:
    return [x for x in (s or "").split("|") if x]


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def reason_text(col: str, value, row: pd.Series) -> str:
    """One plain-English sentence describing this trial's value of a model feature."""
    if col in YES_NO:  # healthy volunteers
        hv = row["healthy_volunteers"]
        return {"True": "Accepts healthy volunteers", "False": "Patients only (no healthy volunteers)"}.get(
            hv, "Healthy-volunteer status not stated")
    if value is not None:  # one-hot categorical: say what the trial actually is
        actual, label = row[col], CATEGORY_TEXT.get(col, FEATURE_LABELS.get(col, col))
        if actual == value:
            return f"{label}: {VALUE_TEXT.get(value, value)}"
        return f"{label}: {VALUE_TEXT.get(actual, actual)} (not {VALUE_TEXT.get(value, value)})"
    x = row[col]
    if col == "n_sites":
        return f"{_plural(int(x), 'trial site')} listed"
    if col in ("min_age_years", "max_age_years", "age_range_years"):
        lo = row["min_age"] if pd.notna(row["min_age"]) else "any age"
        hi = row["max_age"] if pd.notna(row["max_age"]) else "no maximum age"
        return f"Eligible ages: {lo} to {hi}"
    if col == "n_conditions":
        return f"{_plural(int(x), 'condition')} listed"
    if col == "n_intervention_types":
        return f"{_plural(int(x), 'intervention type')} listed"
    if col == "eligibility_len":
        return f"Eligibility criteria are {int(x):,} characters long"
    if col == "n_exclusion_lines":
        return f"About {int(x)} exclusion criteri{'on' if int(x) == 1 else 'a'} listed"
    if col == "is_oncology":
        return "Cancer trial" if x else "Not a cancer trial"
    if col == "is_rare":
        # is_rare is a keyword match (rare / orphan), not a clinical rare-disease list
        return ("Condition matches rare-disease keywords (rare, orphan)" if x
                else "Condition does not match rare-disease keywords")
    return f"{FEATURE_LABELS.get(col, col)}: {x}"


def top_reasons(pipe, dep: pd.DataFrame, k: int = 3) -> list:
    X_cols = NUMERIC + CATEGORICAL
    Xt = pipe[:-1].transform(dep[X_cols])
    Xt = Xt.toarray() if hasattr(Xt, "toarray") else Xt
    raw = list(pipe[:-1].get_feature_names_out())
    sv = shap.TreeExplainer(pipe[-1]).shap_values(Xt)
    sv = sv[1] if isinstance(sv, list) else sv
    sv, _, names = merge_yes_no(sv, Xt, raw)
    source = {readable(n): _source(n) for n in raw}  # merged name -> (column, one-hot value)
    out = []
    for i, (_, row) in enumerate(dep.iterrows()):
        reasons = []
        for j in np.argsort(-np.abs(sv[i])):
            col, value = source[names[j]]
            if col in NOT_A_REASON:
                continue
            if len(reasons) == k:
                break
            reasons.append({"feature_label": PLAIN_LABELS.get(names[j], names[j]),
                            "direction": "raises risk" if sv[i, j] > 0 else "lowers risk",
                            "plain_english": reason_text(col, None if col in YES_NO else value, row)})
        out.append(reasons)
    return out


def pull_dates() -> dict:
    log_path = RAW / "pull_log.json"
    log = json.loads(log_path.read_text()) if log_path.exists() else {}
    for name in ("terminated", "completed", "recruiting_ma"):  # fall back to file time for old pulls
        if name not in log:
            ts = pd.Timestamp((RAW / f"{name}.parquet").stat().st_mtime, unit="s", tz="UTC")
            log[name] = {"pulled_at": ts.isoformat(timespec="seconds"), "rows": None}
    return log


def build_trials(pulls: dict) -> tuple[list, dict]:
    dep = pd.read_parquet(PROCESSED / "recruiting_ma_scored.parquet")
    dep = dep[(dep["study_type"] == "INTERVENTIONAL") & (dep["n_ma_sites"] >= 1)]
    dep = dep.sort_values(["risk", "nct_id"], ascending=[False, True]).reset_index(drop=True)
    raw = pd.read_parquet(RAW / "recruiting_ma.parquet").set_index("nct_id")
    pipe = joblib.load(MODELS / "lightgbm.joblib")
    assert np.allclose(pipe.predict_proba(dep[NUMERIC + CATEGORICAL])[:, 1], dep["risk"]), "model/scores mismatch"
    reasons = top_reasons(pipe, dep)

    n, median = len(dep), float(dep["risk"].median())
    bounds, start = {}, 0
    for tier, share in TIERS:
        end = start + math.ceil(share * n)
        bounds[tier] = (start + 1, end)
        start = end
    tier_of = lambda rank: next((t for t, (lo, hi) in bounds.items() if lo <= rank <= hi), "typical")
    risks = dep["risk"].to_numpy()

    records = []
    for i, row in dep.iterrows():
        r = raw.loc[row.nct_id]
        rank = i + 1
        mesh = set(_split(row.condition_mesh))
        records.append({
            "nct_id": row.nct_id,
            "title": row.title,
            "url": f"https://clinicaltrials.gov/study/{row.nct_id}",
            "risk": round(float(row.risk), 4),
            "risk_rank": rank,
            # floored, so only the top trial shows 100.0
            "risk_percentile": math.floor(1000 * float((risks <= row.risk).mean())) / 10,
            "risk_tier": tier_of(rank),
            "risk_vs_typical": round(float(row.risk) / median, 1),
            "phases": _split(r.phases),
            "sponsor_class": _clean(r.sponsor_class),
            "conditions": _split(r.conditions),
            "condition_categories": [c for c in MESH_CATEGORIES if c in mesh],
            "n_sites": int(r.n_sites),
            "n_ma_sites": int(r.n_ma_sites),
            "ma_sites": [{k: _clean(v) for k, v in s.items()} for s in json.loads(r.ma_sites)],
            "min_age": _clean(r.min_age),
            "max_age": _clean(r.max_age),
            "sex": _clean(r.sex),
            "healthy_volunteers": _clean(r.healthy_volunteers),
            "start_date": _clean(r.start_date),
            "top_reasons": reasons[i],
            "eligibility_criteria": _clean(r.eligibility_text),  # verbatim from the registry
        })
    tiers = {t: {"ranks": list(bounds[t]), "min_risk": round(float(risks[bounds[t][1] - 1]), 4)} for t in bounds}
    tiers["typical"] = {"ranks": [start + 1, n], "min_risk": round(float(risks[-1]), 4)}
    return records, {"n": n, "median": median, "tiers": tiers}


def build_metrics(pulls: dict) -> dict:
    m = pd.read_csv(PROCESSED / "metrics.csv")
    rows = [{k: _clean(v) for k, v in r.items()} for r in m.to_dict("records")]
    return {
        "target": "Enrollment-related early termination: a trial stopped (terminated or withdrawn) "
                  "with a stated reason about low accrual / enrollment / recruitment. Not trial 'success'.",
        "data_source": SOURCE, "data_source_url": SOURCE_URL, "data_pulled": pulls,
        "train_years": [TRAIN_START_YEAR, TEST_FROM_YEAR - 1], "test_years": [TEST_FROM_YEAR, TRAIN_END_YEAR],
        "split": "time split by trial start year; no random split",
        "population_filters": ["interventional trials only",
                               "trials registered > 30 days after their start date excluded"],
        "default_model": {"population": DEFAULT_POPULATION, "scheme": "strict", "model": "lightgbm"},
        "field_notes": {
            "population": "all = trained on all countries; us = trained only on trials with >= 1 US site",
            "scheme": "strict = negatives are completed trials only; loose = also trials stopped for "
                      "other clear reasons",
            "slice": "all = full test set; us = test trials with >= 1 US site; ma = >= 1 Massachusetts site",
            "precision_top10pct": "share of the 10% highest-risk test trials that did stop early for "
                                  "low enrollment",
        },
        "label_handcheck_agreement": None,
        "rows": rows,
    }


def build_importance() -> dict:
    imp = pd.read_csv(PROCESSED / "shap_importance.csv").head(15)
    return {
        "model": "strict LightGBM, all countries",
        "measure": "mean |SHAP value| on the 2019-2021 test set, in log-odds of the predicted risk",
        "data_source": SOURCE,
        "features": [{"rank": i + 1, "feature": r.feature, "label": PLAIN_LABELS.get(r.feature, r.feature),
                      "mean_abs_shap": round(float(r.mean_abs_shap), 4)} for i, r in enumerate(imp.itertuples())],
    }


def build_summary(trials: dict, metrics: dict, pulls: dict) -> dict:
    row = lambda sl: next(r for r in metrics["rows"] if (r["population"], r["scheme"], r["slice"], r["model"])
                          == (DEFAULT_POPULATION, "strict", sl, "lightgbm"))
    full, ma = row("all"), row("ma")
    pulled = pulls["recruiting_ma"]["pulled_at"][:10]
    description = (
        f"TrialPulse ranks the {trials['n']:,} currently recruiting interventional clinical trials with at "
        "least one Massachusetts site by how likely each is to stop early because it cannot enroll enough "
        f"participants. The model was trained on trials that started {TRAIN_START_YEAR}–{TEST_FROM_YEAR - 1} "
        f"and tested on trials that started {TEST_FROM_YEAR}–{TRAIN_END_YEAR}, using only facts known when a "
        "trial is designed (such as phase, sponsor type, number of sites and eligibility rules), never its "
        f"results. Among the 10% of test trials it rated riskiest, {full['precision_top10pct']:.0%} stopped "
        f"early for low enrollment, versus {full['base_rate']:.1%} overall. It does not predict whether a "
        "treatment works or whether a trial will succeed, it ranks trials and never people, and it does not "
        "decide who can join a trial: the study team decides eligibility. Scores are estimates, not "
        f"certainties, and this is not medical advice. Data: {SOURCE}, pulled {pulled}."
    )
    return {
        "n_trials_scored": trials["n"],
        "n_high_risk": trials["tiers"]["high"]["ranks"][1] - trials["tiers"]["high"]["ranks"][0] + 1,
        "median_risk": round(trials["median"], 4),
        "risk_tiers": trials["tiers"],
        "auc_roc": full["auc_roc"], "auc_roc_ma": ma["auc_roc"],
        "base_rate": full["base_rate"],
        "top_decile_precision": full["precision_top10pct"],
        "top_decile_precision_vs_base": full["precision_top10pct_vs_base"],
        "n_test": full["n_test"], "test_years": metrics["test_years"],
        "data_source": SOURCE, "data_pulled": pulled,
        "description": description,
    }


def write(name: str, obj):
    (OUT / name).write_text(json.dumps(obj, indent=2, ensure_ascii=False, allow_nan=False) + "\n")
    print(f"-> {OUT / name}")


# ---------- validation ----------
TRIAL_TYPES = {
    "nct_id": str, "title": str, "url": str, "risk": float, "risk_rank": int, "risk_percentile": float,
    "risk_tier": str, "risk_vs_typical": float, "phases": list, "sponsor_class": (str, type(None)),
    "conditions": list, "condition_categories": list, "n_sites": int, "n_ma_sites": int, "ma_sites": list,
    "min_age": (str, type(None)), "max_age": (str, type(None)), "sex": (str, type(None)),
    "healthy_volunteers": (bool, type(None)), "start_date": (str, type(None)), "top_reasons": list,
    "eligibility_criteria": (str, type(None)),
}


def _no_nan(obj, path="$"):
    if isinstance(obj, float):
        assert math.isfinite(obj), f"non-finite number at {path}"
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _no_nan(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            _no_nan(v, f"{path}[{i}]")


def validate():
    files = {f: json.loads((OUT / f).read_text())  # json.loads rejects nothing; _no_nan catches NaN
             for f in ("ma_trials.json", "ma_trials_index.json", "metrics.json", "feature_importance.json",
                       "summary.json")}
    for f, obj in files.items():
        _no_nan(obj, f)
    trials = files["ma_trials.json"]
    for t in trials:
        assert set(t) == set(TRIAL_TYPES), f"{t['nct_id']}: fields {set(t) ^ set(TRIAL_TYPES)}"
        for k, typ in TRIAL_TYPES.items():
            assert isinstance(t[k], typ) and not (typ is int and isinstance(t[k], bool)), \
                f"{t['nct_id']}.{k}: {type(t[k]).__name__}"
        assert t["risk_tier"] in ("high", "elevated", "typical") and 0 <= t["risk"] <= 1
        assert t["n_ma_sites"] >= 1 and len(t["ma_sites"]) == t["n_ma_sites"]
        assert len(t["top_reasons"]) == 3 and all(
            set(r) == {"feature_label", "direction", "plain_english"}
            and r["direction"] in ("raises risk", "lowers risk") for r in t["top_reasons"])
        assert all(isinstance(x, str) for x in t["phases"] + t["conditions"] + t["condition_categories"])
        assert not any(r["feature_label"].startswith(("Main site", "Site country")) for r in t["top_reasons"]), \
            f"{t['nct_id']}: site country used as a reason"
    index = files["ma_trials_index.json"]
    assert index == [{k: v for k, v in t.items() if k != "eligibility_criteria"} for t in trials], \
        "index differs from ma_trials.json"
    ids = [t["nct_id"] for t in trials]
    assert len(ids) == len(set(ids)), "duplicate nct_id"
    assert [t["risk_rank"] for t in trials] == list(range(1, len(trials) + 1)), "ranks not 1..n in order"
    assert all(a["risk"] >= b["risk"] for a, b in zip(trials, trials[1:])), "risk not monotonic with rank"
    s = files["summary.json"]
    assert s["n_trials_scored"] == len(trials)
    assert s["n_high_risk"] == sum(t["risk_tier"] == "high" for t in trials)
    for f in FIGURES:
        assert (OUT / "figures" / f).stat().st_size > 0, f"missing figure {f}"
    tiers = pd.Series([t["risk_tier"] for t in trials]).value_counts().to_dict()
    print(f"validated: {len(trials)} trials ({len(set(ids))} unique nct_id; tiers {tiers}), "
          f"{sum(len(t['ma_sites']) for t in trials)} MA sites, "
          f"{sum(t['eligibility_criteria'] is None for t in trials)} without eligibility text, "
          f"{len(files['metrics.json']['rows'])} metric rows, "
          f"{len(files['feature_importance.json']['features'])} features, {len(FIGURES)} figures")


def main():
    (OUT / "figures").mkdir(parents=True, exist_ok=True)
    pulls = pull_dates()
    records, trials = build_trials(pulls)
    metrics = build_metrics(pulls)
    write("ma_trials.json", records)
    write("ma_trials_index.json", [{k: v for k, v in r.items() if k != "eligibility_criteria"} for r in records])
    write("metrics.json", metrics)
    write("feature_importance.json", build_importance())
    write("summary.json", build_summary(trials, metrics, pulls))
    for dst, src in FIGURES.items():
        shutil.copyfile(ROOT / src, OUT / "figures" / dst)
    print(f"-> {OUT / 'figures'} ({len(FIGURES)} figures)")
    validate()


if __name__ == "__main__":
    main()
