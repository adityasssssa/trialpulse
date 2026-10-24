"""Pull trials from ClinicalTrials.gov API v2 and flatten them to parquet.

Three pulls, as in the brief:
  terminated.parquet  - TERMINATED + WITHDRAWN (positives + hard negatives)
  completed.parquet   - COMPLETED (resolved negatives)
  recruiting_ma.parquet - RECRUITING trials with a Massachusetts site (deployment set)

Usage: python -m trialpulse.fetch [--limit N]
"""
import argparse
import time
import requests
import pandas as pd
from .config import API, FIELDS, RAW


def _get(d, *keys, default=None):
    for k in keys:
        if not isinstance(d, dict):
            return default
        d = d.get(k)
    return d if d is not None else default


def flatten(study: dict) -> dict:
    p = study.get("protocolSection", {})
    design = p.get("designModule", {})
    elig = p.get("eligibilityModule", {})
    locs = _get(p, "contactsLocationsModule", "locations", default=[]) or []
    ma = [l for l in locs if l.get("state") == "Massachusetts"]
    first = (ma or locs or [{}])[0]
    return {
        "nct_id": _get(p, "identificationModule", "nctId"),
        "title": _get(p, "identificationModule", "briefTitle"),
        "status": _get(p, "statusModule", "overallStatus"),
        "why_stopped": _get(p, "statusModule", "whyStopped"),
        "start_date": _get(p, "statusModule", "startDateStruct", "date"),
        "primary_completion_date": _get(p, "statusModule", "primaryCompletionDateStruct", "date"),
        "primary_completion_type": _get(p, "statusModule", "primaryCompletionDateStruct", "type"),
        "phases": "|".join(design.get("phases", []) or []),
        "study_type": design.get("studyType"),
        "enrollment": _get(design, "enrollmentInfo", "count"),
        "enrollment_type": _get(design, "enrollmentInfo", "type"),
        "masking": _get(design, "designInfo", "maskingInfo", "masking"),
        "allocation": _get(design, "designInfo", "allocation"),
        "sponsor_class": _get(p, "sponsorCollaboratorsModule", "leadSponsor", "class"),
        "conditions": "|".join(_get(p, "conditionsModule", "conditions", default=[]) or []),
        # MeSH terms + ancestors (derived from conditions at registration); used for evaluation slices
        "condition_mesh": "|".join(
            m.get("term", "") for k in ("meshes", "ancestors")
            for m in _get(study, "derivedSection", "conditionBrowseModule", k, default=[]) or []
        ),
        "intervention_types": "|".join(
            i.get("type", "") for i in _get(p, "armsInterventionsModule", "interventions", default=[]) or []
        ),
        "eligibility_text": elig.get("eligibilityCriteria"),
        "min_age": elig.get("minimumAge"),
        "max_age": elig.get("maximumAge"),
        "sex": elig.get("sex"),
        "healthy_volunteers": elig.get("healthyVolunteers"),
        "n_sites": len(locs),
        "n_ma_sites": len(ma),
        "site_facility": first.get("facility"),
        "site_city": first.get("city"),
        "site_state": first.get("state"),
        "site_country": first.get("country"),
        "site_lat": _get(first, "geoPoint", "lat"),
        "site_lon": _get(first, "geoPoint", "lon"),
    }


def pull(params: dict, limit: int | None = None) -> pd.DataFrame:
    rows, token = [], None
    while True:
        q = {**params, "fields": ",".join(FIELDS), "pageSize": 1000}
        if token:
            q["pageToken"] = token
        r = requests.get(API, params=q, timeout=60)
        r.raise_for_status()
        js = r.json()
        rows.extend(flatten(s) for s in js.get("studies", []))
        print(f"  {len(rows)} rows", end="\r")
        token = js.get("nextPageToken")
        if not token or (limit and len(rows) >= limit):
            break
        time.sleep(0.2)
    print()
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None, help="cap rows per pull (for quick tests)")
    args = ap.parse_args()

    pulls = {
        "terminated": {"filter.overallStatus": "TERMINATED,WITHDRAWN"},
        "completed": {"filter.overallStatus": "COMPLETED"},
        "recruiting_ma": {"query.locn": "Massachusetts", "filter.overallStatus": "RECRUITING"},
    }
    for name, params in pulls.items():
        print(f"Pulling {name} ...")
        df = pull(params, args.limit)
        out = RAW / f"{name}.parquet"
        df.to_parquet(out, index=False)
        print(f"  saved {len(df)} rows -> {out}")


if __name__ == "__main__":
    main()
