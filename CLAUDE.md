# TrialPulse — rules for working in this repo

Read `docs/spec/*.md` first; it is the spec and the task list. Keep `tasks.md` checkboxes current.

Hard rules (from the idea brief, `docs/idea_brief.md`; judges will catch violations):
- Design-time features only. Never use actual enrollment counts, completion dates as outcomes, or any field known only after a trial runs. When `enrollment_type == "ACTUAL"`, the enrollment count must be nulled.
- Time split only: train start_year 2008-2018, test 2019-2021. No random splits.
- The model predicts enrollment-related early termination. Never describe it as predicting trial "success".
- Never build any screen that scores a named or hypothetical patient. The tool ranks trials, not people.
- Never download the full ClinicalTrials.gov dump; use API v2 with `fields=`, `pageSize=1000`, `nextPageToken`.
- Any illustrative example must be labeled "synthetic / illustrative" on screen. Cite the dataset under every number.
- Plain-language cards come from structured fields only; free-text eligibility is quoted verbatim, never paraphrased.

Workflow: `make setup`, `make check`, `make data`, `make train`, `make report`. No web app or map: out of scope. Data in `data/` is gitignored and regenerable.
