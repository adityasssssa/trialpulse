# TrialPulse — Tasks

## Saturday

- [ ] 0. Verify API from a laptop: `make check` (totalCount in tens of thousands, whyStopped populated)
- [x] 1. Repo scaffold: requirements, Makefile, src package, Streamlit stub, spec
- [ ] 2. Pull data: `make data` (terminated+withdrawn all, completed sample, recruiting MA)
- [ ] 3. Labels: strict + loose rule; exclude safety/funding/sponsor stops; hand-check 50, write agreement number in README
- [x] 4. Features: design-time only; null enrollment when ACTUAL; age-range width (n_countries still TODO)
- [ ] 5. Model: logreg baseline, LightGBM; time split 2008-18 / 2019-21; AUC-ROC, AUC-PR, precision@10%, Brier
- [ ] 6. Save four figures the moment they exist: ROC, PR, reliability curve, SHAP summary → `figures/`
- [ ] 7. SHAP summary plot + calibration on the MA slice of the test set
- [ ] 8. Score recruiting MA trials; `make report` -> ranked CSV + top-20 table figure with count
- [ ] 9. (Optional) plain-language card for 2-3 example trials from structured fields; FKGL shown; "study team decides eligibility"
- [ ] 10. Slides: one model chart, limits slide, ethics slide; Devpost draft; README with architecture, metrics table and data citations
- [ ] 11. Record 60-second backup demo video
- [ ] 12. Rehearse twice with a timer; cut to 3:40

## Sunday morning

- [ ] 13. Final rehearsal; submit Devpost by 10:30 AM (hard close 11:00)
