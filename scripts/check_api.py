"""Step 0 from the brief: confirm the ClinicalTrials.gov v2 API is reachable,
that terminated trials number in the tens of thousands, and that whyStopped is populated.
Run from your laptop (not a sandbox): python scripts/check_api.py
"""
import sys
import requests

URL = "https://clinicaltrials.gov/api/v2/studies"
params = {
    "filter.overallStatus": "TERMINATED",
    "fields": "NCTId,WhyStopped,Phase,EnrollmentCount,EnrollmentType,LeadSponsorClass,StartDate",
    "pageSize": 20,
    "countTotal": "true",
}

r = requests.get(URL, params=params, timeout=30)
r.raise_for_status()
data = r.json()
total = data.get("totalCount")
studies = data.get("studies", [])
with_reason = [
    s for s in studies
    if s.get("protocolSection", {}).get("statusModule", {}).get("whyStopped")
]

print(f"HTTP {r.status_code}")
print(f"totalCount (TERMINATED): {total}")
print(f"whyStopped populated in sample: {len(with_reason)}/{len(studies)}")
for s in with_reason[:5]:
    sm = s["protocolSection"]["statusModule"]
    print(f"  {s['protocolSection']['identificationModule']['nctId']}: {sm['whyStopped'][:90]}")

ok = (total or 0) > 10_000 and len(with_reason) > 0
print("\nOK - idea is safe, proceed." if ok else "\nWARNING - check the API before building.")
sys.exit(0 if ok else 1)
