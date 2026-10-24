from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RAW = ROOT / "data" / "raw"
PROCESSED = ROOT / "data" / "processed"
MODELS = ROOT / "models"
for p in (RAW, PROCESSED, MODELS):
    p.mkdir(parents=True, exist_ok=True)

API = "https://clinicaltrials.gov/api/v2/studies"

FIELDS = [
    "NCTId", "BriefTitle", "OverallStatus", "WhyStopped", "Phase", "StudyType",
    "EnrollmentCount", "EnrollmentType", "LeadSponsorClass", "StartDate",
    "PrimaryCompletionDate", "PrimaryCompletionDateType", "Condition", "InterventionType", "EligibilityCriteria",
    "MinimumAge", "MaximumAge", "Sex", "HealthyVolunteers", "DesignMasking",
    "DesignAllocation", "LocationFacility", "LocationCity", "LocationState",
    "LocationCountry", "LocationGeoPoint",
]

# Training window from the brief (time-split, design-time features only)
TRAIN_START_YEAR = 2008
TRAIN_END_YEAR = 2021
