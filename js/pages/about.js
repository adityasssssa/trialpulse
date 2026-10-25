import { loadSummary, loadMetrics, loadFeatureImportance } from '../data.js?v=20261025010135';
import { esc, fmtInt, fmtPct, fmtTimes, fmtNum, sourceLine, wilson } from '../util.js?v=20261025010135';

const SLICE_LABELS = { all: 'Full test set', us: 'Trials with a US site', ma: 'Trials with a Massachusetts site' };
const MODEL_LABELS = { lightgbm: 'LightGBM (default)', logreg: 'Logistic regression (baseline)' };
const POP_LABELS = { all: 'All countries', us: 'US only' };

// Every item from the "Known limits" section of HANDOFF.md.
const LIMITS = [
  ['Labels come from free text.', '"Why stopped" is an optional, free-form registry field. A keyword rule classifies it, so some labels are wrong. A hand-check of 125 reasons (the rule was not tuned on them) found that 90% of positives (45 of 50) are true enrollment failures. "Other" was correct in 25 of 25 cases and "unknown" in 24 of 25. Reasons that mix low enrollment with another cause (for example, funding) are excluded from training; about half of them (12 of 25) are true enrollment failures, so the model is conservative: it learns from clear-cut enrollment failures and leaves out some real ones.'],
  ['Retrospective registrations are excluded.', 'Trials first registered more than 30 days after they started are dropped from training and testing; they make up 38% of trials. A trial registered after it has run is almost always already finished, so it leaks the outcome. Removing this leak lowered the test AUC from 0.791 to 0.763.'],
  ['Observational studies are out of scope.', 'Only interventional trials are modeled and scored.'],
  ['The model is national and applied to Massachusetts.', 'It is trained on trials from all countries. On held-out trials with a Massachusetts site it does slightly worse (an AUC of about 0.75), and that slice is small (about 1,700 test trials and under 100 positives).'],
  ['Recruiting trials look different from the test set.', 'Recruiting Massachusetts trials differ from the test set: a median of 10 sites versus 1, about twice as much eligibility text, 46% versus 28% industry sponsors, and 10% versus 32% accepting healthy volunteers. Scores for these larger trials extrapolate beyond what most test trials look like, and site counts for recruiting trials can still grow, so treat scores as a ranking rather than as exact probabilities.'],
  ['Some trial types are weaker.', 'Accuracy is lower for mental-health trials (an AUC of about 0.63 on test trials in the MeSH "Mental Disorders" category).'],
  ['Rare diseases cannot be evaluated.', 'The registry data has no reliable rare-disease marker. The keyword flag ("rare", "orphan") matches 17 of about 112,000 modeling trials, and the MeSH term "Rare Diseases" matches only 27. So we make no claim about rare-disease performance.'],
  ['Reporting differences.', '"Main site in the US" raises risk partly because US-regulated trials fill in the stop reason more consistently, so their low-enrollment stops are more often labeled. That is a reporting effect, not evidence that US sites recruit worse, and it is why site country is never shown as a per-trial reason.'],
  ['The rare-disease feature is a keyword match.', 'It matches condition names containing "rare" or "orphan". "Syndrome" was removed because it flagged common conditions such as carpal tunnel syndrome. It is not a clinical rare-disease designation, so no trial is labeled "rare disease" because of it.'],
  ['Survivorship.', 'Trials that were never registered are invisible to the data.'],
  ['What the data cannot see.', 'Recruitment through networks not listed as sites, stop reasons that were never entered, protocol quality and investigators\' track records.'],
  ['Scores are probabilities, not verdicts.', 'Even among the riskiest 10% of past trials, most were not stopped for low enrollment.'],
  ['Some trials have no condition category.', 'About 15–20% of trials have no MeSH condition terms, so the condition category can be empty and the category filter cannot find them.'],
];

const FIGURES = [
  ['roc.png', 'ROC curves', 'Both models on the 2019–2021 test set, with the AUC in the legend.'],
  ['pr.png', 'Precision–recall curves', 'Both models; the dashed line is the base rate.'],
  ['calibration_ma.png', 'Calibration on Massachusetts test trials', 'Predicted versus observed risk. Points near the diagonal mean the estimated percentages are about right.'],
  ['shap_top10.png', 'Top 10 global drivers', 'A plain-English bar chart of the mean absolute SHAP value for the default model.'],
  ['shap_summary.png', 'SHAP summary (technical)', 'A beeswarm plot of per-trial SHAP values, with numeric features standardized.'],
  ['top20_ma_trials.png', 'Top 20 recruiting Massachusetts trials', 'The 20 trials with the highest estimated risk at the time of the data pull, shown as a table.'],
];

function metricsRows(rows, filter) {
  return rows.filter(filter);
}

function metricsTable(rows, { lead } = {}) {
  return `<div class="table-wrap"><table class="data">
    <thead><tr>
      <th scope="col">Training population</th><th scope="col">Labels</th><th scope="col">Evaluated on</th><th scope="col">Model</th>
      <th scope="col" class="num">Test trials</th><th scope="col" class="num">Base rate</th><th scope="col" class="num">ROC-AUC</th><th scope="col" class="num">PR-AUC</th><th scope="col" class="num">Precision, top 10% (95% CI)</th><th scope="col" class="num">Brier</th>
    </tr></thead>
    <tbody>${rows.map((r) => `<tr class="${lead && lead(r) ? 'lead' : ''}">
      <td>${esc(POP_LABELS[r.population] || r.population)}</td>
      <td>${esc(r.scheme)}</td>
      <td>${esc(SLICE_LABELS[r.slice] || r.slice)}</td>
      <td>${esc(MODEL_LABELS[r.model] || r.model)}</td>
      <td class="num">${fmtInt(r.n_test)}</td>
      <td class="num">${fmtPct(r.base_rate)}</td>
      <td class="num">${fmtNum(r.auc_roc)}</td>
      <td class="num">${fmtNum(r.auc_pr)} (${fmtTimes(r.auc_pr_vs_base)})</td>
      <td class="num">${fmtPct(r.precision_top10pct)} (${fmtTimes(r.precision_top10pct_vs_base)})${(() => { const ci = wilson(r.precision_top10pct, Math.round(r.n_test * 0.1)); return ci ? `<br><span class="ci">${fmtPct(ci[0])}–${fmtPct(ci[1])}, n=${fmtInt(Math.round(r.n_test * 0.1))}</span>` : ''; })()}</td>
      <td class="num">${fmtNum(r.brier)}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;
}

function importanceChart(fi) {
  const feats = fi.features || [];
  const max = Math.max(...feats.map((f) => f.mean_abs_shap), 0.0001);
  const rowH = 30; const left = 310; const width = 820; const barW = width - left - 70; const top = 10;
  const h = top + feats.length * rowH + 10;
  const bars = feats.map((f, i) => {
    const y = top + i * rowH;
    const w = Math.max(2, (f.mean_abs_shap / max) * barW);
    const flagged = /Site country/i.test(f.feature);
    return `<g>
      <text x="${left - 10}" y="${y + rowH / 2 + 5}" text-anchor="end">${esc(f.label)}${flagged ? ' *' : ''}</text>
      <rect class="bar ${flagged ? 'flagged' : ''}" x="${left}" y="${y + 6}" width="${w.toFixed(1)}" height="${rowH - 12}" rx="3"><title>${esc(f.label)}: mean |SHAP| ${f.mean_abs_shap}</title></rect>
      <text class="val" x="${left + w + 8}" y="${y + rowH / 2 + 5}">${Number(f.mean_abs_shap).toFixed(2)}</text>
    </g>`;
  }).join('');
  return `<svg class="bar-chart" viewBox="0 0 ${width} ${h}" role="img" aria-label="Bar chart of global feature importance, mean absolute SHAP value per feature">
    <line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${h - 10}" />
    ${bars}
  </svg>`;
}

export async function render(main) {
  document.title = 'About the model · TrialPulse';
  const [summary, metrics, fi] = await Promise.all([loadSummary(), loadMetrics(), loadFeatureImportance()]);
  const d = metrics.default_model || { population: 'all', scheme: 'strict', model: 'lightgbm' };
  const isDefaultPop = (r) => r.population === d.population && r.scheme === d.scheme;
  const headline = metricsRows(metrics.rows, (r) => isDefaultPop(r) && r.model === d.model)
    .sort((a, b) => ['all', 'us', 'ma'].indexOf(a.slice) - ['all', 'us', 'ma'].indexOf(b.slice));
  const baseline = metricsRows(metrics.rows, (r) => isDefaultPop(r) && r.model !== d.model)
    .sort((a, b) => ['all', 'us', 'ma'].indexOf(a.slice) - ['all', 'us', 'ma'].indexOf(b.slice));
  const others = metricsRows(metrics.rows, (r) => !isDefaultPop(r));
  const hc = metrics.label_handcheck_agreement;
  const pulls = metrics.data_pulled || {};

  main.innerHTML = `
    <div class="about">
      <div class="page-head">
        <h1>About the model</h1>
        <p>How TrialPulse estimates risk, how well it was tested, and where it falls short.</p>
      </div>

      <section class="section" aria-labelledby="short-h">
        <div class="card">
          <h2 id="short-h">In short</h2>
          <ul class="checks">
            <li>We studied ${fmtInt(headline[0]?.n_train)} past trials and learned which design features went together with stopping early for low enrollment.</li>
            <li>We checked the model on ${fmtInt(headline[0]?.n_test)} later trials it had never seen. Among the 10% it rated riskiest, ${fmtPct(headline[0]?.precision_top10pct, 0)} did stop early for that reason, compared with ${fmtPct(headline[0]?.base_rate, 1)} of all trials.</li>
            <li>Then we applied it to the ${fmtInt(summary.n_trials_scored)} trials recruiting in Massachusetts today, using only facts known when a trial is designed.</li>
            <li>It is a ranking tool, not a crystal ball. Even in the high-risk tier, most past trials were not stopped for low enrollment.</li>
            <li>One unresolved caveat: inputs such as site counts and eligibility text come from each trial's current registry record, not from a snapshot taken before the outcome was known. See “Feature timing” below.</li>
          </ul>
          ${sourceLine(summary)}
        </div>
      </section>

      <section class="section" aria-labelledby="pred-h">
        <div class="grid-2">
          <div class="card">
            <h2 id="pred-h">What is predicted</h2>
            <p><strong>One outcome only:</strong> a trial being stopped (terminated or withdrawn) with a stated reason involving low accrual, enrollment or recruitment. It does not predict trial "success".</p>
            <p>Each recruiting Massachusetts trial gets an estimated probability of this outcome, a rank among the ${fmtInt(summary.n_trials_scored)} scored trials, a tier (high = top 10%, elevated = next 20%, typical = the rest) and the three design features that moved its score most.</p>
          </div>
          <div class="card">
            <h2>What is not predicted</h2>
            <ul class="checks">
              <li class="no">Whether a treatment works or is safe, or whether the trial will "succeed" or "fail" scientifically.</li>
              <li class="no">The quality of a trial or its investigators.</li>
              <li class="no">Anything about any person. The model ranks trials, never people, and never decides who is eligible. Eligibility is decided by the study team. Not medical advice.</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="section prose" aria-labelledby="train-h">
        <h2 id="train-h">How it was trained and tested</h2>
        <p><strong>Data.</strong> Registered trials from the <a href="${esc(metrics.data_source_url)}" rel="noopener">ClinicalTrials.gov API v2</a>: ${fmtInt(pulls.terminated?.rows)} terminated or withdrawn trials, ${fmtInt(pulls.completed?.rows)} completed trials and ${fmtInt(pulls.recruiting_ma?.rows)} recruiting trials with a Massachusetts site, pulled on ${esc(summary.data_pulled)}. Only interventional trials are included, and trials registered more than 30 days after their start date are left out because their outcome is usually already known.</p>
        <p><strong>Labels.</strong> Labels come from the registry's free-text "why stopped" field. A keyword rule marks reasons involving accrual, enrollment or recruitment as positive, and completed trials as negative ("strict" labels). "Loose" labels also count trials stopped for other clear reasons as negative. Trials with mixed reasons are left out of training.</p>
        <p><strong>Features.</strong> Only design-time features are used: phase, sponsor type, number of sites, eligibility rules, age range and similar facts. Nothing that becomes known only after a trial runs is used, so the model can be applied to trials that are recruiting today.</p>
        <p><strong>Training and testing.</strong> The trials were split by start year, never at random. The model learned from ${fmtInt(headline[0]?.n_train)} trials that started ${metrics.train_years?.[0]}–${metrics.train_years?.[1]} and was tested on ${fmtInt(headline[0]?.n_test)} trials that started ${metrics.test_years?.[0]}–${metrics.test_years?.[1]}, so the test imitates predicting the future.</p>
        <p><strong>Models.</strong> A LightGBM gradient-boosted classifier is the default and produces every score on this site. A logistic regression model is kept as a baseline. Per-trial explanations use SHAP values, which describe associations the model learned, not causes.</p>
        <div class="callout-warn">
          <p><strong>Feature timing is not fully resolved.</strong> The pipeline reads each trial's current registry record through the ClinicalTrials.gov API. Fields such as the number of sites and the eligibility text can be edited during a trial, so for past trials some inputs may reflect a later version than the one that existed before the outcome was known. The time split (train on 2008–2018 starts, test on 2019–2021) does not remove this. Registry version history was not used, so this leakage question is open, and claims of prospective prediction should be read with that in mind.</p>
        </div>
        <h3>Cohort, labels and splits</h3>
        <ul class="checks">
          <li><strong>Included.</strong> Interventional trials that started 2008–2021 and were first registered within 30 days of their start date. Observational studies and trials registered later are excluded (38% of interventional trials in that window).</li>
          <li><strong>Positive label (strict).</strong> A trial with status terminated or withdrawn whose free-text “why stopped” matches accrual, enrollment or recruitment keywords.</li>
          <li><strong>Negative label (strict).</strong> A completed trial. Trials stopped for other reasons (safety, funding, sponsor decision), with mixed reasons, or with no reason given are left out of the strict training set. The “loose” scheme adds trials stopped for other clear reasons as negatives.</li>
          <li><strong>Consequence.</strong> A score is the estimated probability of “stopped for low enrollment” rather than “completed”, among trials that end one of those two ways. Trials that stop for other reasons are not in that denominator, so the percentages are not the share of all trials that will stop.</li>
          <li><strong>Split.</strong> By start year: 2008–2018 for training, 2019–2021 for testing. No separate validation set is documented in the exports; the comparison of the two models was made on the test set, so the reported choice carries some optimism.</li>
          <li><strong>Missing data and preprocessing.</strong> Not described in the exports. The pipeline code in <code>src/trialpulse/features.py</code> is the reference.</li>
        </ul>
        <h3>Why LightGBM is the default</h3>
        <p>On the full test set LightGBM reaches a ROC-AUC of ${fmtNum(headline[0]?.auc_roc, 3)} against ${fmtNum(baseline[0]?.auc_roc, 3)} for logistic regression, a difference of ${fmtNum((headline[0]?.auc_roc || 0) - (baseline[0]?.auc_roc || 0), 3)}, below the team's own 0.03 bar for a meaningful gain. At the top 10% review capacity the two are close (${fmtPct(headline[0]?.precision_top10pct)} versus ${fmtPct(baseline[0]?.precision_top10pct)} precision). LightGBM was kept for its small lead in ranking; either model would give a similar priority order, and the simpler model is reported alongside it everywhere.</p>
        <h3>Calibration</h3>
        <p>No calibration step was fitted. The calibration figure below compares predicted and observed rates on the Massachusetts test slice, which is also the slice used to report results, so it is a check rather than an independent validation. Calibration on today's recruiting trials cannot be measured until they finish, which is why the site presents tiers and ranks first and percentages second.</p>
        <h3>Still to do</h3>
        <ul class="checks">
          <li>Compare against simple operational rules such as “review small academic studies first”. The exports do not include per-trial test predictions, so this comparison is pending in the pipeline.</li>
          <li>Report precision and recall at several review capacities (for example the top 5%, 10% and 20%). Only the top 10% is exported today.</li>
          <li>Evaluate more trial groups. Only one has been checked so far: mental-health trials (ROC-AUC about 0.63). Rare-disease trials cannot be evaluated with this data.</li>
        </ul>
        ${sourceLine(summary)}
      </section>

      <section class="section" aria-labelledby="metrics-h">
        <h2 id="metrics-h">How well it works</h2>
        <div class="kv" style="margin-bottom:16px">
          <div class="stat"><div class="value">${fmtNum(headline[0]?.auc_roc, 3)}</div><div class="label">ROC-AUC (ranking), full test set</div></div>
          <div class="stat"><div class="value">${fmtPct(headline[0]?.precision_top10pct)}</div><div class="label">of the riskiest 10% did stop early for low enrollment (${fmtTimes(headline[0]?.precision_top10pct_vs_base)} the base rate of ${fmtPct(headline[0]?.base_rate)})</div></div>
          <div class="stat"><div class="value">${fmtNum(headline[0]?.auc_pr, 3)}</div><div class="label">AUC-PR (${fmtTimes(headline[0]?.auc_pr_vs_base)} the base rate)</div></div>
          <div class="stat"><div class="value">${fmtNum(headline.find((r) => r.slice === 'ma')?.auc_roc, 3)}</div><div class="label">ROC-AUC on the Massachusetts slice (${fmtInt(headline.find((r) => r.slice === 'ma')?.n_test)} test trials, under 100 positives)</div></div>
        </div>
        <p class="metrics-note">The default model is trained on all countries with strict labels and uses LightGBM. The highlighted row is the headline result. "Precision, top 10%" is the share of the 10% highest-risk test trials that did stop early for low enrollment. Multiples in brackets are relative to the base rate. The Massachusetts slice is small (about 1,700 test trials and under 100 positives), so its numbers are less precise. The 95% intervals are Wilson intervals computed from the reported rate and the number of trials in the top 10%; ROC-AUC intervals would need per-trial predictions, which the exports do not include.</p>
        <div class="card" style="padding:0;overflow:hidden">
          ${metricsTable([...headline, ...baseline], { lead: (r) => r.model === d.model && r.slice === 'all' })}
        </div>
        <details class="more">
          <summary>All ${fmtInt(metrics.rows.length)} evaluated configurations (populations, label schemes, slices and models)</summary>
          <div class="card" style="padding:0;overflow:hidden;margin-top:10px">${metricsTable(metrics.rows, { lead: (r) => isDefaultPop(r) && r.model === d.model && r.slice === 'all' })}</div>
          <p class="metrics-note" style="margin-top:8px">${esc(metrics.field_notes?.population || '')} ${esc(metrics.field_notes?.scheme || '')} ${esc(metrics.field_notes?.slice || '')}</p>
        </details>
        ${sourceLine(summary, `Test trials started ${metrics.test_years?.[0]}–${metrics.test_years?.[1]}.`)}
      </section>

      <section class="section" aria-labelledby="shift-h">
        <h2 id="shift-h">How today's trials differ from the test set</h2>
        <p class="prose">The model is applied to recruiting Massachusetts trials that look different from the trials it was tested on. The ranking still applies, but exact percentages extrapolate.</p>
        <div class="card" style="padding:0;overflow:hidden"><div class="table-wrap"><table class="data shift-table">
          <caption class="visually-hidden">Recruiting Massachusetts trials compared with the 2019–2021 test set</caption>
          <thead><tr><th scope="col">Feature</th><th scope="col" class="num">Recruiting MA trials (scored)</th><th scope="col" class="num">Test set (2019–2021)</th></tr></thead>
          <tbody>
            <tr><th scope="row">Median number of sites</th><td class="num">10</td><td class="num">1</td></tr>
            <tr><th scope="row">Eligibility text length</th><td class="num">about 2×</td><td class="num">1×</td></tr>
            <tr><th scope="row">Industry sponsor</th><td class="num">46%</td><td class="num">28%</td></tr>
            <tr><th scope="row">Accepts healthy volunteers</th><td class="num">10%</td><td class="num">32%</td></tr>
          </tbody></table></div></div>
        <p class="source">Source: ClinicalTrials.gov API v2, data pulled ${esc(summary.data_pulled)}. Figures from the project README; site counts for recruiting trials can still grow.</p>
      </section>

      <section class="section" aria-labelledby="hc-h">
        <h2 id="hc-h">Label hand-check</h2>
        ${hc ? `
        <div class="kv" style="margin-bottom:12px">
          <div class="stat"><div class="value">${fmtPct(hc.positives_precision, 0)}</div><div class="label">of rule positives are true enrollment failures (${esc(hc.counts?.positives_precision)})</div></div>
          <div class="stat"><div class="value">${fmtPct(hc.other_correct, 0)}</div><div class="label">of "other" reasons were correctly judged not to be enrollment failures (${esc(hc.counts?.other_correct)})</div></div>
          <div class="stat"><div class="value">${fmtPct(hc.unknown_correct, 0)}</div><div class="label">of "unknown" reasons were correctly judged not to be enrollment failures (${esc(hc.counts?.unknown_correct)})</div></div>
          <div class="stat"><div class="value">${fmtPct(hc.mixed_actually_accrual, 0)}</div><div class="label">of excluded "mixed" reasons were in fact enrollment failures (${esc(hc.counts?.mixed_actually_accrual)})</div></div>
        </div>
        <p class="prose">A ${esc(hc.reviewer)} hand-labeled ${fmtInt(hc.n_checked)} "why stopped" reasons (the rule was not tuned on this sample) and compared them with the keyword rule. The rule is precise on clear enrollment failures and leaves out mixed reasons, so the positive class is conservative. The labels are in <code>${esc(hc.labels_file)}</code> in the repository.</p>
        ` : '<p class="muted">Hand-check results are not available in this export.</p>'}
        ${sourceLine(summary)}
      </section>

      <section class="section" aria-labelledby="fi-h">
        <h2 id="fi-h">What drives the scores</h2>
        <p class="prose">Global feature importance for the default model, measured as the mean absolute SHAP value on the 2019–2021 test set, in log-odds of the predicted risk. A higher value means the feature moves scores more, in either direction.</p>
        <div class="card">
          ${importanceChart(fi)}
          <p class="small muted" style="margin:10px 0 0">* Site-country features, such as "Main site in the US" and "Site country: Egypt", mostly reflect how consistently trials in that country report why they stopped, not trial design. They are never shown as a per-trial reason, but hiding them does not remove their effect: every score still includes their contribution. A model trained without country inputs has not been evaluated; that is pending.</p>
          ${sourceLine(summary, `Model: ${esc(fi.model)}.`)}
        </div>
      </section>

      <section class="section" aria-labelledby="fig-h">
        <h2 id="fig-h">Evaluation figures</h2>
        <div class="figures">
          ${FIGURES.map(([file, title, cap]) => `<figure class="figure">
            <a href="data/figures/${file}" target="_blank" rel="noopener"><img src="data/figures/${file}" alt="${esc(title)}: ${esc(cap)}" loading="lazy" width="2400" height="1350"></a>
            <figcaption><strong>${esc(title)}.</strong> ${esc(cap)} Source: ClinicalTrials.gov API v2.</figcaption>
          </figure>`).join('')}
        </div>
      </section>

      <section class="section" aria-labelledby="terms-h">
        <h2 id="terms-h">Words used on this page</h2>
        <dl class="facts terms">
          <dt>ROC-AUC</dt><dd>The chance that the model ranks a randomly chosen trial that stopped for low enrollment above a randomly chosen one that did not. 0.5 is random; 1.0 is perfect ranking. It measures ordering, not whether the percentages are right.</dd>
          <dt>Base rate</dt><dd>The share of all test trials that stopped early for low enrollment, before any model.</dd>
          <dt>Precision, top 10%</dt><dd>Of the trials the model rated riskiest, the share that really did stop early for low enrollment.</dd>
          <dt>PR-AUC</dt><dd>A score that rewards finding the rare early-stopping trials without many false alarms. Compare it with the base rate.</dd>
          <dt>Brier score</dt><dd>How far the estimated percentages are from what happened. Lower is better.</dd>
          <dt>LightGBM</dt><dd>The type of model used: many small decision trees combined. Logistic regression is the simpler model it was compared with.</dd>
          <dt>SHAP</dt><dd>A way to measure how much each input pushed a score up or down. It describes what the model learned, not a cause.</dd>
          <dt>Time split</dt><dd>Training on older trials and testing on newer ones, so the test imitates predicting the future.</dd>
        </dl>
      </section>

      <section class="section" aria-labelledby="limits-h">
        <h2 id="limits-h">Known limits</h2>
        <p class="prose">Worth knowing before acting on any score. Scores are estimates and a ranking, not certainties.</p>
        <ul class="limits">
          ${LIMITS.map(([head, body]) => `<li><strong>${esc(head)}</strong> ${esc(body)}</li>`).join('')}
        </ul>
        ${sourceLine(summary)}
      </section>

      <section class="section">
        <div class="notice"><p>${esc(summary.description)}</p></div>
      </section>
    </div>`;
}
