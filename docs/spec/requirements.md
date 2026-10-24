# TrialPulse — Requirements

**Track:** DS+X Healthcare. Judged on the DS+X rubric: Idea 25%, Data science 25%, Technical 20%, Design 10%, Ethics 10%, Presentation 10%. Deadline: Devpost, 11:00 AM Sunday.
**One-line:** Predict which currently recruiting Massachusetts clinical trials will fail to enroll, map who those trials are failing to reach, and produce a plain-language trial card for outreach.
**Users:** clinical research coordinators and recruitment offices at MA hospitals; community health center outreach staff; secondarily sponsors deciding where to open sites. Not patients directly.

## Functional requirements

R1. Pull trials from ClinicalTrials.gov API v2 (keyless) using `filter.overallStatus`, `fields=`, `pageSize=1000`, paging on `nextPageToken`. Never download the full registry dump.
  - R1.1 TERMINATED + WITHDRAWN trials (all) — positives and hard negatives
  - R1.2 COMPLETED trials (sample ~60k) — resolved negatives
  - R1.3 RECRUITING trials with a Massachusetts site — deployment set
R2. Label terminated trials as enrollment failure from the `whyStopped` free text with a keyword rule (accrual, enrollment, recruit, slow, low, insufficient, no participants, unable to enroll).
  - R2.1 Report a strict and a loose labeling.
  - R2.2 Trials stopped for safety, funding, or sponsor decision are excluded from the positive class and not dumped into negatives.
  - R2.3 Hand-check 50 random labels; record the agreement number (target ≥85%, good ≥95%).
R3. Design-time features only. Never use actual enrollment counts, completion status fields, or anything known only after the trial runs. Rows with `EnrollmentType = ACTUAL` have the count removed.
R4. Time-split evaluation: train on trials started 2008–2018, test on 2019–2021. Report AUC-ROC, AUC-PR vs base rate, precision in the top 10% of predicted risk, calibration (reliability curve, Brier), SHAP top features, and a logistic-regression baseline the tree model is compared against.
R5. Score every recruiting MA trial (≥500 minimum; all of them with the count on screen).
R6. Output: ranked table of recruiting MA trials with risk score (CSV + top-N table rendered as a figure for slides), with the data source cited.
R7. Plain-language trial card generated from structured fields only (condition, phase, age range, site, contact), FKGL readability shown (target median < grade 8), "not medical advice" line, "eligibility is decided by the study team" line, link to the NCT page. Free-text criteria shown verbatim, never paraphrased.
R8. Out of scope: web dashboard, maps, EJ/PLACES overlay. Demo is slides + the ranked table + figures.

## Non-functional / ethics requirements

N1. No patient data anywhere. The model ranks trials for outreach, never people for eligibility. No screen scores a named or hypothetical patient.
N2. Every synthetic or illustrative example is labeled "synthetic / illustrative" on screen.
N3. Cite the dataset actually used on screen (ClinicalTrials.gov, MassGIS, CDC PLACES).
N4. State limits on screen: label noise, survivorship (unregistered trials invisible), reach map is an index not a validated model, national model applied to MA.
N5. Runs on a fresh clone with a one-line command.
N6. Devpost submitted by 10:30 AM Sunday (hard close 11:00). README has architecture, metrics table, data citations.
