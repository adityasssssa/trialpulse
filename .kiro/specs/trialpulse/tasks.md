# TrialPulse — Tasks

## Saturday

- [ ] 0. Verify API from a laptop: `make check` (totalCount in tens of thousands, whyStopped populated)
- [x] 1. Repo scaffold: requirements, Makefile, src package, Streamlit stub, Kiro spec
- [ ] 2. Pull data: `make data` (terminated+withdrawn all, completed sample, recruiting MA)
- [ ] 3. Labels: strict + loose rule; exclude safety/funding/sponsor stops; hand-check 50, write agreement number in README
- [x] 4. Features: design-time only; null enrollment when ACTUAL; age-range width (n_countries still TODO)
- [ ] 5. Model: logreg baseline, LightGBM; time split 2008-18 / 2019-21; AUC-ROC, AUC-PR, precision@10%, Brier
- [ ] 6. Save four figures the moment they exist: ROC, PR, reliability curve, SHAP summary → `figures/`
- [ ] 7. Dashboard skeleton (parallel): ranked table, filters by condition/phase, trial card, site map
- [ ] 8. Score recruiting MA trials; wire into dashboard; show count on screen
- [ ] 9. Plain-language cards from structured fields; FKGL shown; "study team decides eligibility"; "not medical advice"
- [ ] 10. Slides: one model chart, limits slide, ethics slide; Devpost draft; README with Kiro screenshot and data citations
- [ ] 11. Record 60-second backup demo video
- [ ] 12. Rehearse twice with a timer; cut to 3:40

## Sunday morning (only if everything above is stable)

- [ ] 13. Reach-gap overlay: MassGIS EJ block groups + PLACES prevalence weighting
- [ ] 14. Calibration on the MA slice of the test set
- [ ] 15. Submit Devpost by 10:30 AM (hard close 11:00)
