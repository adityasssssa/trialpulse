# TrialPulse

Predict which currently recruiting Massachusetts clinical trials will fail to enroll, trained on 15 years of terminated trials, so recruitment offices know where to focus outreach before a trial quietly closes. DS+X Healthcare track hackathon project, October 2026.

## Getting started

```bash
git clone https://github.com/adityasssssa/trialpulse.git
cd trialpulse
brew install libomp        # macOS only: OpenMP runtime LightGBM needs
make setup                 # creates .venv and installs requirements
source .venv/bin/activate
make check                 # step 0: confirm the ClinicalTrials.gov API works
make data                  # pull terminated / completed / recruiting-MA trials -> data/raw/*.parquet
make train                 # time-split model, metrics -> data/processed/metrics.csv, scored MA trials
make report                # ranked MA trials CSV + top-20 table figure for slides
```

Quick smoke test before the full pull: `python -m trialpulse.fetch --limit 3000`.

## Spec and plan

The spec lives in [`docs/spec/`](docs/spec/) (`requirements.md`, `design.md`, `tasks.md`) and is the working task list.

**Evaluation:** time split, train on trials started 2008–2018, test on 2019–2021. Metrics table: `data/processed/metrics.csv`; figures in `figures/`.
**Label hand-check agreement:** _TODO: fill in after checking 50 samples_. `make handcheck` exports random whyStopped samples (random seed `20261024`, set in `src/trialpulse/handcheck.py`) from the modelling population (interventional, start 2008–2021, not retrospectively registered) to `data/processed/`: 50 accrual positives (`handcheck_50.csv`) and 25 each of other, unknown and mixed (`handcheck_other_25.csv`, `handcheck_unknown_25.csv`, `handcheck_mixed_25.csv`). Fill in `human_label` and compare with `auto_label`.

**Data source:** ClinicalTrials.gov API v2.

## Limits

- **Retrospective registrations are excluded.** Trials first submitted more than 30 days after their start date are dropped from training and test (68,763 of 180,663 interventional trials started 2008–2021, 38%). A trial registered after it has already run is usually finished by then, so it can only ever appear as COMPLETED; keeping these trials teaches the model "registered late → low risk", which is outcome information, not trial design. The removed trials have a 2.9% positive rate vs 6.1% for those kept. Source: ClinicalTrials.gov API v2.
- **The leak was real.** With the filter, strict LightGBM test AUC fell from 0.791 to 0.763 (MA slice: 0.745 to 0.736), and countries with many retrospective registrations (Turkey, Egypt) dropped out of the SHAP top 10. The test set changes too (43,603 → 30,087 trials), so the two numbers are not strictly like-for-like. Source: ClinicalTrials.gov API v2, test trials started 2019–2021.
- **Observational studies are out of scope.** The model is trained on interventional trials only, and only recruiting interventional MA trials are scored.

## Project structure

```
trialpulse/
├── scripts/check_api.py       # API sanity check from the brief
├── src/trialpulse/
│   ├── config.py              # paths, API fields, training window
│   ├── fetch.py               # ClinicalTrials.gov v2 pull + flatten
│   ├── labels.py              # whyStopped -> low-accrual label
│   ├── features.py            # design-time features only (no leakage)
│   ├── train.py               # logreg baseline + LightGBM, metrics, scoring
│   └── report.py              # ranked CSV + top-20 figure
├── docs/spec/                 # requirements, design, tasks
├── figures/                   # ROC / PR / calibration / SHAP PNGs
├── data/raw, data/processed   # gitignored
├── notebooks/                 # exploration
└── requirements.txt, Makefile, pyproject.toml
```

## Team

- [@adityasssssa](https://github.com/adityasssssa)
- [@aaRUSH1234-glitch](https://github.com/aaRUSH1234-glitch)

---

# Idea brief

DS+X Healthcare Track: Winning Idea Brief
Oct 24, 2026 · @vikram
The recommendation
Build "TrialPulse" (working name): a model that predicts which currently recruiting Massachusetts clinical trials will fail to enroll, plus a map of who those trials are failing to reach, plus a plain-language trial card for outreach. Challenge area H5 (Making Clinical Research More Accessible), with a direct hook into H3 (biomedical discovery) and the biotech sponsors in the room.
Why this one, in judge terms:
	•	Real labels, real evaluation. ClinicalTrials.gov has ~tens of thousands of trials that terminated, with a free-text whyStopped field. Published analyses put low accrual at roughly 40-57% of those reasons. You train on national history (2010-2021, time-split), report AUC, precision-recall and calibration, then score the ~1,500+ trials recruiting in Massachusetts today. That is a 5/5 on the 25%-weight Data Science row, where almost every other healthcare team will be an LLM wrapper with no evaluation.
	•	Unique angle on a crowded prompt. Every other H5 team will build "chatbot helps one patient find one trial" (demand side). You fix the supply side: the trial that quietly closes because nobody who qualified ever heard about it. Judges will see 5 trial-matcher chatbots and one of yours.
	•	It uses the organizers' own kit the way they asked. Their healthcare kit ships trials (recruiting in MA), ej (environmental-justice block groups), places (county disease prevalence) and pubmed. Their pitch notes literally say "Finding a trial should not be harder than joining one" and "Pair it with PLACES and the map stops being a statewide average." You are answering the brief in its own words.
	•	Ethics is nearly free. No patient data at all. The model ranks trials for outreach, never people for eligibility. Every card links to ClinicalTrials.gov and the site contact. You can name the real failure modes (rare-disease trials look "risky", label noise, survivorship) on a slide, which the rubric's 5-level Ethics row rewards.
	•	De-risked scope. The MVP (data pull, model, ranked table) is a 5-hour build. The map overlay and plain-language cards are layers you add if time allows and cut if it does not, without the demo breaking.
Predicted rubric score 4.4 / 5 (next section shows the math), against 4.2 for the runner-up (specialty-care access modeling, H2) and 3.2-3.9 for everything else on the shortlist.
First thing to do, before anything else: from a laptop (not a sandbox), hit https://clinicaltrials.gov/api/v2/studies?filter.overallStatus=TERMINATED&fields=NCTId,WhyStopped,Phase,EnrollmentCount,EnrollmentType,LeadSponsorClass,StartDate&pageSize=20&countTotal=true and confirm totalCount is in the tens of thousands and whyStopped is populated. If that works, the idea is safe. It is keyless and the organizers' portal queries the same API.
What the judges are holding
Two things decide the score: the DS+X rubric (weights below) and the Hackachusetts healthcare brief, which is five specific challenge areas, not an open track.
Rubric row
Weight
What a 5 requires (their words)
What most teams will deliver
Idea impact & relevance
25%
Highly creative, relevant, compelling value for intended users or community
A relevant but familiar idea (3-4)
Data science application
25%
Rigorous, creative, well-evaluated methods; insights improve the solution
LLM wrapper, no evaluation (2-3)
Technical implementation
20%
Complete, stable prototype, sophisticated architecture
Partial demo, some bugs (3)
Design
10%
Original, polished, accessible, intuitive
Streamlit default (3)
Responsibility & ethics
10%
Project-specific reflection, concrete safeguards, risks and limits communicated
One generic slide (2-3)
Presentation
10%
Exceptionally clear, engaging, memorable, in 4 minutes hard stop
Over time, demo-less (3)
The Hackachusetts healthcare brief (from the organizers' data portal repo, docs/healthcare.txt):
Area
Problem
Guardrail they state
Crowding forecast
H1 Keeping residents connected to health coverage
MassHealth renewals: multiple orgs, outdated records, notices that never arrive; renewal frequency changing
"The state remains responsible for eligibility decisions"
High: renewal explainer chatbots
H2 Closing rural specialty-care gaps
Travel distance, referral sent but no appointment, plan never reaches primary care; "access to a completed care journey"
"Clinical decisions remain with qualified professionals"
Medium: access maps
H3 Accelerating biomedical discovery
Evidence scattered across papers, datasets, institutions
none stated
High: PubMed RAG summarizers
H4 Reducing friction in healthcare operations
Disconnected systems, paperwork, referral admin, handoffs
"without replacing clinical judgment"
Medium: document OCR tools
H5 Making clinical research more accessible
Finding a study and understanding participation is hard; access differs by language, geography, transportation
"privacy and informed consent"
Very high for trial-matcher chatbots; near zero for the supply-side angle
The organizers' ethos, verbatim from the dataset cards they wrote (this is what the Hackachusetts judges have been primed with):
	•	"Finding a trial should not be harder than joining one."
	•	"Pair it with PLACES and the map stops being a statewide average."
	•	"A report is not proof... say that clearly on the screen."
	•	"Label every screen synthetic. That is what keeps the demo safe."
	•	"Cite the dataset you actually used."
	•	"The state still decides."
Translation: cite sources on screen, state limits on screen, never pretend to decide eligibility, never fake data without a label. Doing this costs 20 minutes and is worth a full point on two rubric rows.
Two hard requirements: Kiro must be used for Hackachusetts prize eligibility (keep the .kiro/specs folder in the repo and show one screenshot of it in the README), and Devpost submission by 11:00 AM Sunday. Sponsors in the room: AWS, Kiro, The Engine, WHOOP, PwC, Stifel Venture Banking. The Engine and Stifel are biotech investors; trial failure is a problem they pay for.
Sources: DS+X resource guide, Hackachusetts data portal repo, Hackachusetts site.
The idea space (90 ideas, grouped)
Generated against H1-H5 plus open biotech, then culled on four tests: is there real data a student can download today, is there a label or ground truth to evaluate against, will three other teams build it, and can it demo in 4 minutes. Crowded = expect several near-identical submissions. Dead = fails a test outright.
H1 Coverage (MassHealth renewals)
#
Idea
Data
Verdict
1
Plain-language renewal notice rewriter, multilingual, with readability score
MassHealth policy pages
Crowded, LLM wrapper, no DS
2
Renewal deadline SMS companion / chatbot
none
Crowded, no DS
3
Block-group "notice reachability risk" index (language isolation, mobility, SVI) to target community outreach
EJ block groups, ACS, SVI, Census insurance
Shortlist (D): real data, but no label, so it is an index not a model
4
Navigator / outreach-staff placement optimization (p-median over uninsured-weighted block groups)
EJ, Census, CHC locations
Fold into #3
5
Workload-surge simulation for health centers under the new 6-month renewal cadence
policy + Census
Policy sim, hard to validate
6
Photo-of-notice classifier: "what document is this and what do I do"
none public
Dead: no training data
7
Rules-as-code eligibility explainer
CMS rules
Low DS, risk of "deciding"
8
Synthea cohort: simulate medication interruptions from coverage gaps
Synthea
Synthetic labels, judges discount
9
Address-staleness predictor for member records
none
Dead: no data
10
Which towns lost coverage during unwinding vs EJ status
KFF / state unwinding reports
Descriptive only
H2 Rural specialty care
#
Idea
Data
Verdict
11
Specialty-care accessibility by town using two-step floating catchment (2SFCA) over real provider locations, validated against HRSA shortage designations
CMS Doctors & Clinicians file / NPI registry, MassGIS towns, PLACES, HRSA HPSA
Shortlist (B): runner-up
12
Optimal telehealth hub / mobile specialty clinic siting (p-median)
#11 + OR-Tools
Fold into #11
13
Transit-vs-car access gap for non-drivers using RTA GTFS
GTFS feeds, #11
Fold into #11 as a layer
14
Where telehealth cannot fix the desert: broadband gap overlay
FCC BDC, #11
Nice nuance layer for #11
15
Referral-completion (leakage) predictor
none real; Synthea has no referral outcomes
Dead: synthetic labels
16
FHIR closed-loop referral tracker (ServiceRequest/Task)
Synthea + FHIR
Technical, low DS
17
NEMT ride + appointment co-scheduling VRP
synthetic
Synthetic, low impact proof
18
Specialist supply forecast by county
HRSA workforce
Thin
19
Avoided miles / CO2 from telehealth-eligible visit types
#11 + visit mix assumptions
Metric for #11
20
Pharmacy deserts for specialty drugs
NPI pharmacies
Variant of #11
21
Rural ED transfer times
not public
Dead
H3 Biomedical discovery
#
Idea
Data
Verdict
22
PubMed RAG summarizer / research assistant
PubMed
Crowded, no evaluation
23
Literature-based discovery (Swanson ABC) with time-split validation against Open Targets: rediscover post-2020 gene-disease links from pre-2020 literature
OpenAlex, Open Targets
Shortlist (C): highest DS ceiling, highest build risk
24
Reproducibility / retraction-risk classifier on paper metadata
Retraction Watch (Crossref), OpenAlex
Shortlist (F): novel, ethically sharp edges
25
Trial phase-transition success predictor
ClinicalTrials.gov
Generic, not MA; superseded by the winner
26
MA institutional collaboration graph: who should co-author but doesn't
OpenAlex
Cute, low impact
27
Contradiction detector across abstracts
PubMed
Unevaluable in a day
28
GEO differential expression + Protein Atlas pipeline
GEO, HPA
Reads as a tutorial
29
Drug repurposing via ChEMBL similarity
ChEMBL, Open Targets
Crowded in bio hackathons
30
Pharmacovigilance disproportionality (PRR/ROR) on openFDA vs label warnings
openFDA
Shortlist (G): real method, weak MA tie
31
Dataset-to-paper linker to surface reusable data
GEO, PubMed
Thin
32
Which MA findings never got a follow-on trial
OpenAlex + ClinicalTrials.gov
Interesting, hard to define
H4 Operations
#
Idea
Data
Verdict
33
Prior-auth / referral form extraction (OCR + LLM)
none
Crowded, no DS
34
Fax triage classifier
none
Dead
35
Readmission risk model
Synthea
Synthetic labels
36
Explain MA hospitals' CMS excess-readmission ratios with community SVI/PLACES
CMS readmissions, SVI
Shortlist (K): real, but N about 60
37
No-show prediction / OR scheduling
synthetic
Synthetic
38
Care-handoff summary generator from the CMS care-update template
FHIR + LLM
Low DS
39
ED boarding / capacity forecasting
DPH capacity dashboards if scrapeable
Risky data
40
Auto-map arbitrary CSV columns to FHIR resources
FHIR
Technical, modest
41
Interpreter-need forecasting by clinic from ACS language data
ACS
Small but real
H5 Clinical research access
#
Idea
Data
Verdict
42
Trial-matcher chatbot
ClinicalTrials.gov
Most crowded idea in the building
43
Eligibility-criteria parser to plain language with measured readability and parse accuracy
ClinicalTrials.gov
Shortlist (I): crowded, but evaluation helps
44
Recruitment-failure risk model (historical terminated-for-accrual trials) applied to recruiting MA trials
ClinicalTrials.gov
Winner core (A)
45
Trial access-equity map: per recruiting trial, population-weighted travel time plus EJ/language overlap vs condition prevalence
trials, EJ, PLACES, MassGIS
Winner layer 2
46
Reported enrollment demographics (completed trials) vs disease burden by race in MA: the diversity gap
ClinicalTrials.gov results, PLACES
Shortlist (E): strong ethics story, weak "product"
47
Sponsor-facing site recommender: where to open an MA site for eligible, diverse enrollment
#45
Winner's investor pitch
48
Patient "am I plausibly eligible" pre-screener
ClinicalTrials.gov
Ethically fraught; avoid
49
Multilingual consent explainer
none
LLM wrapper
50
Trial-to-community-health-center matcher
#45
Variant
51
Eligibility-complexity vs recruitment-success correlation
#44
Winner sub-analysis
Biotech / wearables / other healthcare
#
Idea
Data
Verdict
52
WHOOP recovery/sleep personal model
WHOOP API (single member, consent)
Sponsor-pleasing, n=1, no DS
53
PhysioNet ECG arrhythmia classifier
PhysioNet open sets
Reads as Kaggle
54
Sleep-EDF staging model
PhysioNet
Reads as Kaggle
55
Opioid overdose hotspot + naloxone allocation
MA DPH town-level opioid deaths
Shortlist (H): real MA data, outside H1-H5
56
Heat-wave to ED-visit forecasting
NOAA + syndromic
Climate track, not healthcare
57
Agent-based simulation of a rural care journey under interventions
synthetic
Simulation, unvalidated
58
Digital twin of a county's specialty demand
synthetic
Same
59
Lyme / tick-borne risk map
DPH
Off-brief
60
Nurse shortage forecast
HRSA
Thin
Ideas 61-90 were variants of the above (different specialty, different county, different LLM framing) and were discarded for not changing the verdict. The shortlist letters (A-K) carry into the scoring.
Scoring system
Each shortlisted idea gets a predicted rubric score per row (1-5, scored as a skeptical judge would score a typical 20-hour execution, not a perfect one), then is risk-adjusted for whether the demo exists at 11 AM and how many clones it competes with.
EJS = 0.25\,I + 0.25\,D + 0.20\,T + 0.10\,G + 0.10\,E + 0.10\,P

WinScore = EJS \times P_{exec} - 0.15 \times Crowd
Term
Meaning
How it was set
I, D, T, G, E, P
Idea, Data science, Technical, Design, Ethics, Presentation, each 1-5
Read the rubric's 4 and 5 cells; ask "what would stop a judge giving the 5"
EJS
Expected judge score, 1-5
Weighted sum, the rubric's own weights
P_exec
Probability a working demo and a real evaluation number exist by 11 AM Sunday
Data already downloadable (1.0) vs needs credentialing/scraping (0.5) vs synthetic only (0.6); subtract 0.1 per unproven dependency (routing server, big file, rate-limited API)
Crowd
0 (nobody else), 1 (one or two clones), 2 (several), 3 (half the room)
From the challenge text, the kit contents, and what healthcare hackathon teams default to
The 0.15 crowding coefficient means a "half the room" idea loses 0.45 points, about one full rubric level on a 25% row. That matches how judges actually behave: the fourth trial-matcher chatbot of the day is scored against the other three, not against the rubric.
Top 10, scored
Sorted by WinScore. The trial-matcher chatbot is included at the bottom as the control: it is what you are being compared against.
Rank
Idea (area)
I
D
T
G
E
P
EJS
P_exec
Crowd
WinScore
1
A. TrialPulse: recruitment-failure risk + reach map (H5)
4.5
5
4
4
4.5
4
4.43
0.90
0.5
3.91
2
D. Renewal-notice reachability index + outreach siting (H1)
4
3
3.5
4
4.5
4
3.70
0.90
1
3.18
3
I. Eligibility-criteria plain-language parser with measured accuracy (H5)
3.5
3.5
4
4
4
4
3.75
0.95
3
3.11
4
G. openFDA pharmacovigilance signal detection, PRR/ROR (H3)
3
4
3.5
3.5
4
3.5
3.55
0.90
1
3.05
5
E. Trial enrollment diversity gap vs MA disease burden (H5)
4
3.5
3
3.5
5
4
3.73
0.80
0
2.98
6
K. Hospital excess readmissions explained by community vulnerability (H4)
3
3
3
3.5
4
3.5
3.20
0.95
0.5
2.97
7
B. Specialty-care 2SFCA accessibility + telehealth siting (H2)
4.5
4
4
4.5
4
4.5
4.23
0.75
1.5
2.94
8
J. Trial-matcher chatbot (control)
3
2.5
4
4
3.5
4
3.33
0.95
3
2.71
9
H. Opioid overdose hotspots + naloxone allocation (DS+X only, no H-area)
4
4
3.5
4
4
4
3.90
0.70
1
2.58
10
F. Retraction-risk classifier on paper metadata (H3)
3.5
4.5
3.5
3
2.5
3.5
3.60
0.70
0
2.52
11
C. Literature-based discovery with time-split validation (H3)
4
5
3
3
3.5
3.5
3.85
0.50
0
1.93
Three things the table says:
	•	A wins on both axes. It has the highest raw judge score (4.43) and the best execution odds, because the data is one keyless API and the overlay layers are optional.
	•	B is the real runner-up on judge score (4.23) and the better choice if your team has someone who has done geospatial work before. Its P_exec of 0.75 reflects a 500 MB provider file and a routing dependency; a geo-fluent teammate moves it to 0.9 and second place.
	•	C has the highest ceiling and would be the most impressive thing in the room if it worked. It will not work by 11 AM. Keep it for a research project.
Sensitivity check: A stays first unless you drop its Data Science score to 3 (a model with no reported evaluation) and raise B's P_exec to 1.0. In other words, A wins as long as you actually report AUC, calibration and a time-split on a slide.
Judge audit of the winner: TrialPulse
One-line pitch: "Roughly one in five registered trials ends early, and about half of those die for one reason: nobody enrolled. We trained on 15 years of those failures, scored every trial recruiting in Massachusetts today, and show research coordinators which ones are at risk and which communities they are not reaching."
Users: clinical research coordinators and recruitment offices at MA hospitals; community health center outreach staff; secondarily sponsors deciding where to open sites. Not patients directly, which is what keeps it safe.
Rubric, row by row
Row
Target
What earns it
What loses it
Idea (25%)
4.5
Flipping H5 from demand side to supply side; a dollar figure on trial failure; MA-specific output
Sounding like a sponsor tool with no patient benefit. Fix: lead with the patient who never heard about the trial
Data science (25%)
5
Real labels, time-split train/test, AUC-ROC and AUC-PR, calibration curve, SHAP top features, a baseline (logistic regression) the gradient-boosted model beats
Reporting only accuracy on an imbalanced set; training on post-hoc fields (see traps)
Technical (20%)
4
Reproducible pipeline (pull, clean, label, train, score) + web dashboard + nightly re-score possible; Kiro spec in repo
A notebook with no app. Fix: dashboard first, polish later
Design (10%)
4
One screen: ranked MA trials, risk score, map of reach gap, a trial card. Plain language, big type, source link on every number
Streamlit default theme with six tabs
Ethics (10%)
4.5
A dedicated slide: no patient data; model ranks trials not people; rare-disease bias named and mitigated; label noise quantified; every card says "eligibility is decided by the study team"
A generic "we care about privacy" line
Presentation (10%)
4
4 minutes, timed, live demo of one trial from the list, one chart, one map
Reading slides, running over
The hard questions a judge will ask, and the answers
Question
Answer
How did you get labels?
whyStopped on terminated/withdrawn trials. We classify the free text with a keyword rule (accrual, enrollment, recruit, slow, low, insufficient, no participants, unable to enroll) and hand-checked 50 random ones; report that agreement number. Trials stopped for safety, funding, sponsor decision are excluded from the positive class, not dumped into negatives.
Isn't this leakage? Terminated trials have actual enrollment counts.
Yes, and we drop them. We use only design-time features: anticipated enrollment, phase, sponsor class, number of sites, countries, eligibility text length and complexity, age range width, sex, healthy volunteers, intervention type, masking, arms, condition category, start year. EnrollmentType = ACTUAL rows have the count removed. Say this unprompted; it is the single most impressive sentence in the talk.
Time split?
Train on trials started 2008-2018, test on 2019-2021 (resolved by now). Recruiting trials today are the deployment set.
Class imbalance?
Positive rate roughly 8-12%. Report AUC-PR and precision at the top 10%, which is what a coordinator would actually read.
Does the model just flag rare diseases?
Partly, and that is a real finding, not a bug: rare-disease trials are the ones that most need outreach. Show SHAP; show that the model still ranks within condition category.
Is a prediction from a national model valid in MA?
We apply it to MA sites and show calibration on the MA slice of the test set. Say the slice is small.
Who decides eligibility?
The study team. The tool never scores a person. Every card links to the NCT page and the listed site contact.
Why would a coordinator trust it?
They already know their own trial is slow. What they do not have is a cross-institution view, the risk before the trial starts, or a map of which neighborhoods their notices miss.
What about the plain-language cards: hallucination?
Generated only from structured fields (condition, phase, age range, site, contact), with a readability grade (FKGL target under 8) and a "not medical advice" line. Any free-text criteria shown are quoted, not paraphrased.
Where does the map come from?
Trial site geoPoints from the API, MassGIS EJ block groups (income, minority, English-isolation flags), CDC PLACES county prevalence for the mapped conditions. The gap score is prevalence-weighted population beyond 30 minutes of a site. Straight-line distance times 1.3 if routing is not wired; say so.
What can't the data see?
Trials recruiting through networks not listed as sites; reasons never entered in whyStopped; the model cannot see protocol quality or PI reputation. Put this on the limits slide.
Weaknesses you cannot fully remove
	•	Label noise in whyStopped: it is optional free text. Mitigation: the 50-sample check and reporting both a strict and a loose labeling.
	•	Survivorship: trials never registered are invisible. State it.
	•	The reach map is an index, not a validated model. Keep it as context, not a claim.
	•	Impact is one step removed from patients. The pitch has to connect "trial closes early" to "the patient who would have qualified never got the option" in the first 20 seconds.
Traps that would sink it
	•	Using actual enrollment as a feature (leakage). Judges who know trials will catch it instantly.
	•	Claiming the model "predicts success". It predicts enrollment-related early termination, nothing else.
	•	Any screen that scores a named or hypothetical patient.
	•	Pulling the full ClinicalTrials.gov dump (gigabytes). Use the v2 API with filter.overallStatus and fields= and pageSize=1000, paging on nextPageToken; 40-60k terminated plus a sample of completed trials is enough and pulls in minutes.
	•	Spending the afternoon on the map before the model has a test-set number.
Runner-up: specialty-care access (H2), if you prefer it or the trial API fails
Pitch: "A referral to a cardiologist 90 minutes away is not access. We computed, for every Massachusetts town, how much specialist capacity is actually reachable by car and by transit, found where the map is dark, and show where one telehealth hub or mobile clinic closes the biggest gap."
Method: two-step floating catchment area (2SFCA), the standard health-geography accessibility measure. Step 1: for each provider location, sum the population within a 30-minute catchment to get a supply-to-demand ratio. Step 2: for each town, sum the ratios of all providers within 30 minutes. Weight demand by CDC PLACES prevalence of the relevant condition (diabetes for endocrinology, etc.). Then a p-median optimization (OR-Tools) picks the hub locations that most reduce population-weighted travel time.
Evaluation that makes it DS, not a map: HRSA Health Professional Shortage Area designations are an independent federal label. Report how well your access score separates HPSA from non-HPSA towns (AUC), and show the towns where you disagree with HRSA and why. That is the slide that gets a 4 on Data Science.
Row
Target
Risk
Idea
4.5
On-message ("the story is the distance"), but two or three other teams will show a rural access map
Data science
4
2SFCA plus HPSA validation; drops to 3 if you only draw distances
Technical
4
Provider file (CMS Doctors and Clinicians national download, about 2-3 million rows) must be filtered to MA by specialty; OSRM public routing is rate-limited, so fall back to straight-line times 1.3 and say so
Design
4.5
Maps demo beautifully; this is its strongest row
Ethics
4
Provider directories are famously stale ("ghost networks"); naming that is the ethics slide. No patient data
Presentation
4.5
One map, one before/after of the hub placement
Judge questions: Are those providers actually accepting patients? (No way to know; state it.) Why 30 minutes? (Literature convention; show sensitivity at 45 and 60.) Why would a town pick your hub site? (Show the people-minutes saved, not just the dot.) Did you account for MassHealth acceptance? (No; name it as the limit.)
Choose B over A only if: someone on the team has built with GeoPandas or Leaflet before, and you can get the provider file filtered to MA by early afternoon. Otherwise A.
Build plan, data calls, metrics, and the 4-minute script
Deadline check first. The Hackachusetts site says "start submitting around 6 PM and finish before 8 PM" today; DS+X Devpost closes 11:00 AM Sunday. Confirm with an organizer in the next 15 minutes whether the Hackachusetts submission is tonight. If it is, the plan below compresses: model number by 3 PM, dashboard by 5 PM, submit by 7 PM, polish for DS+X overnight.
Hour-by-hour (today, 4 people)
	•	11:15-11:45: Verify the API from a laptop. Write the Kiro spec (.kiro/specs/trialpulse/requirements.md, design.md, tasks.md) describing pipeline, model, dashboard. This both satisfies the Kiro requirement and is your task list.
	•	11:45-13:00: Pull data. Terminated + withdrawn trials (all), completed trials (sample 60k), recruiting trials with a Massachusetts site. Save raw JSON, then flatten to one CSV.
	•	13:00-14:30: Label and feature engineering. Keyword-rule on whyStopped for the positive class; drop safety/funding/sponsor-decision stops from positives; design-time features only; hand-check 50 labels and write the agreement number down.
	•	14:30-16:00: Model. Logistic regression baseline, then LightGBM or XGBoost; time split 2008-2018 train, 2019-2021 test; AUC-ROC, AUC-PR, calibration plot, precision at top decile, SHAP summary. Save the four figures as PNGs the moment they exist.
	•	14:30-17:00 (parallel, person 3 and 4): Dashboard skeleton. Ranked table of recruiting MA trials with risk score, filter by condition and phase, click-through trial card. Leaflet or Plotly map with site points and EJ block groups. Dark-on-light, big type, source link under every number.
	•	17:00-18:30: Score the recruiting MA trials; wire into dashboard; generate plain-language cards from structured fields only, with FKGL readability shown.
	•	18:30-19:30: Slides, limits slide, ethics slide, Devpost draft, README with Kiro screenshot. Record a 60-second backup demo video in case wifi dies.
	•	19:30-20:00: Rehearse twice with a timer. Cut until it is 3:40.
	•	Sunday morning: reach-gap overlay (PLACES prevalence weighting) only if everything above is stable. Submit Devpost by 10:30, not 11:00.
Exact data calls (all keyless; page with pageToken from nextPageToken in each response)
BASE=https://clinicaltrials.gov/api/v2/studies FIELDS=NCTId,BriefTitle,OverallStatus,WhyStopped,Phase,StudyType,EnrollmentCount,EnrollmentType,LeadSponsorClass,StartDate,PrimaryCompletionDate,Condition,InterventionType,EligibilityCriteria,MinimumAge,MaximumAge,Sex,HealthyVolunteers,DesignMasking,DesignAllocation,LocationFacility,LocationCity,LocationState,LocationCountry,LocationGeoPoint  # positives + hard negatives $BASE?filter.overallStatus=TERMINATED,WITHDRAWN&fields=$FIELDS&pageSize=1000&countTotal=true # resolved negatives $BASE?filter.overallStatus=COMPLETED&fields=$FIELDS&pageSize=1000 # deployment set $BASE?query.locn=Massachusetts&filter.overallStatus=RECRUITING&fields=$FIELDS&pageSize=1000
Layer
Source
Use
Trials
ClinicalTrials.gov API v2
Labels, features, deployment set, site coordinates
Equity overlay
MassGIS EJ 2020 block groups (in the organizers' kit as ej.zip)
Income, minority, English-isolation flags around each site
Disease burden
CDC PLACES, MA counties (kit places.zip)
Prevalence weighting for diabetes, obesity, smoking, mental distress, checkups
Literature hook (optional)
PubMed E-utilities (kit pubmed.zip)
Link a trial's condition to recent MA-affiliated papers on the card
Project success metrics (put these on one slide; they are what the DS row is scored on)
Metric
Minimum to claim
Good
Test-set AUC-ROC, time split
0.65
0.72 or above
AUC-PR vs positive base rate
1.5 times base rate
3 times base rate
Precision in the top 10% of predicted risk
2 times base rate
3 times base rate
Calibration
Reliability curve shown
Brier score reported, within 0.02 of a calibrated baseline
Label agreement on 50 hand-checked whyStopped entries
85%
95%
Baseline comparison
Logistic regression reported
Tree model beats it by 0.03 AUC or more, or you say it did not
Recruiting MA trials scored
500
All of them, with count on screen
Card readability (FKGL)
Shown
Median under grade 8
Demo stability
Runs on a fresh clone
Runs on a fresh clone with a one-line command
The 4-minute script (hard stop; rehearse at 3:40)
	•	0:00-0:30, the person: "Maria, 58, Springfield, qualifies for a diabetes trial at a site 20 minutes away. She never hears about it. Fourteen months later the trial closes: too few enrolled. One in five registered trials ends early; about half of those for this one reason." (Say "illustrative" on the slide.)
	•	0:30-1:00, the flip: "Every tool in this space helps one patient search. We asked the other question: which trials are about to fail, and who are they failing to reach?"
	•	1:00-2:00, the model: time-split, design-time features only (say the leakage sentence), AUC, precision at top decile, SHAP top 5. One chart.
	•	2:00-3:00, live demo: the ranked MA list, click one high-risk trial, the map of EJ block groups around its site, the plain-language card with the site contact.
	•	3:00-3:30, limits and ethics: no patient data; ranks trials not people; label noise number; rare-disease bias and what you did about it; eligibility stays with the study team.
	•	3:30-3:50, the ask: "Give this to one recruitment office at a Boston hospital for a month." Stop.
Devpost checklist
	•	☐ Repo public, README with architecture, metrics table, Kiro spec screenshot, data citations
	•	☐ 60-second backup video
	•	☐ Both tracks selected (DS+X healthcare + Hackachusetts healthcare) if the form allows
	•	☐ "Synthetic / illustrative" label on any invented example
	•	☐ Team members, track assignment confirmed in the Airtable
