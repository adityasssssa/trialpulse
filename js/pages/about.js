import { loadSummary, loadMetrics, loadFeatureImportance } from '../data.js';
import { esc, fmtInt, fmtPct, fmtTimes, fmtNum, sourceLine } from '../util.js';

const SLICE_LABELS = { all: 'Full test set', us: 'Trials with a US site', ma: 'Trials with a Massachusetts site' };
const MODEL_LABELS = { lightgbm: 'LightGBM (default)', logreg: 'Logistic regression (baseline)' };
const POP_LABELS = { all: 'All countries', us: 'US only' };

// Every item from the "Known limits" section of HANDOFF.md.
const LIMITS = [
  ['Labels come from free text.', '"Why stopped" is an optional, free-form registry field. A keyword rule classifies it, so some labels are wrong. A hand-check of 125 reasons (the rule was not tuned on them) found 90% of positives are true enrollment failures (45/50). "Other" was correct in 25/25 and "unknown" in 24/25. Reasons that mix low enrollment with another cause (for example funding) are excluded from training; about half of them (12/25) are true enrollment failures, so the model is conservative: it learns from clear-cut enrollment failures and leaves out some real ones.'],
  ['Retrospective registrations are excluded.', 'Trials first registered more than 30 days after they started are dropped from training and testing: 38% of trials. A trial registered after it has run is almost always already finished, so it leaks the outcome. Removing this leak lowered test AUC from 0.791 to 0.763.'],
  ['Observational studies are out of scope.', 'Only interventional trials are modelled and scored.'],
  ['The model is national and applied to Massachusetts.', 'It is trained on trials from all countries. On held-out trials with a Massachusetts site it does slightly worse (AUC about 0.75), and that slice is small (about 1,700 test trials, under 100 positives).'],
  ['Recruiting trials look different from the test set.', 'Recruiting Massachusetts trials differ from the test set: median 10 sites vs 1, about twice the eligibility text, 46% vs 28% industry sponsors, 10% vs 32% accepting healthy volunteers. Scores for these larger trials extrapolate beyond what most test trials look like, and site counts for recruiting trials can still grow, so treat scores as a ranking rather than exact probabilities.'],
  ['Some trial types are weaker.', 'Accuracy is lower for mental-health trials (AUC about 0.63 on test trials in the MeSH "Mental Disorders" category).'],
  ['Rare diseases cannot be evaluated.', 'The registry data has no reliable rare-disease marker. The keyword flag ("rare", "orphan") matches 17 of about 112,000 modelling trials, and the MeSH term "Rare Diseases" only 27. So we make no claim about rare-disease performance.'],
  ['Reporting differences.', '"Main site in the US" raises risk partly because US-regulated trials fill in the stop reason more consistently, so their low-enrollment stops are more often labeled. That is a reporting effect, not evidence that US sites recruit worse, and it is why site country is never shown as a per-trial reason.'],
  ['The rare-disease feature is a keyword match', 'on condition names ("rare", "orphan"). "Syndrome" was removed because it flagged common conditions such as carpal tunnel syndrome. It is not a clinical rare-disease designation, so no trial is labeled "rare disease" because of it.'],
  ['Survivorship.', 'Trials that were never registered are invisible to the data.'],
  ['What the data cannot see:', 'recruitment through networks not listed as sites, stop reasons never entered, protocol quality and investigator track record.'],
  ['Scores are probabilities, not verdicts.', 'Even among the riskiest 10%, most trials are expected to finish normally.'],
  ['About 15–20% of trials have no MeSH condition terms,', 'so the condition category can be empty and the category filter cannot find them.'],
];

const FIGURES = [
  ['roc.png', 'ROC curves', 'Both models on the 2019–2021 test set, AUC in the legend.'],
  ['pr.png', 'Precision–recall curves', 'Both models; the dashed line is the base rate.'],
  ['calibration_ma.png', 'Calibration on Massachusetts test trials', 'Predicted vs observed risk. Points near the diagonal mean the estimated percentages are about right.'],
  ['shap_top10.png', 'Top 10 global drivers', 'Plain-English bar chart of mean |SHAP| for the default model.'],
  ['shap_summary.png', 'SHAP summary (technical)', 'Beeswarm of per-trial SHAP values; numeric features standardized.'],
  ['top20_ma_trials.png', 'Top 20 recruiting Massachusetts trials', 'The 20 highest estimated risks at the time of the data pull, as a table.'],
];

function metricsRows(rows, filter) {
  return rows.filter(filter);
}

function metricsTable(rows, { lead } = {}) {
  return `<div class="table-wrap"><table class="data">
    <thead><tr>
      <th scope="col">Training population</th><th scope="col">Labels</th><th scope="col">Evaluated on</th><th scope="col">Model</th>
      <th scope="col" class="num">Test trials</th><th scope="col" class="num">Base rate</th><th scope="col" class="num">AUC-ROC</th><th scope="col" class="num">AUC-PR</th><th scope="col" class="num">Precision, top 10%</th><th scope="col" class="num">Brier</th>
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
      <td class="num">${fmtPct(r.precision_top10pct)} (${fmtTimes(r.precision_top10pct_vs_base)})</td>
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
            <li>We looked at about ${fmtInt(headline[0]?.n_train)} past trials and learned which design features went with stopping early for low enrollment.</li>
            <li>We checked the model on ${fmtInt(headline[0]?.n_test)} later trials it had never seen. Among the 10% it rated riskiest, ${fmtPct(headline[0]?.precision_top10pct, 0)} did stop early for that reason, against ${fmtPct(headline[0]?.base_rate, 1)} of all trials.</li>
            <li>Then we applied it to the ${fmtInt(summary.n_trials_scored)} trials recruiting in Massachusetts today, using only facts known when a trial is designed.</li>
            <li>It is a ranking tool, not a crystal ball. Most trials in every tier are expected to finish normally.</li>
          </ul>
          ${sourceLine(summary)}
        </div>
      </section>

      <section class="section" aria-labelledby="pred-h">
        <div class="grid-2">
          <div class="card">
            <h2 id="pred-h">What is predicted</h2>
            <p><strong>Enrollment-related early termination only:</strong> ${esc(metrics.target)}</p>
            <p>Each recruiting Massachusetts trial gets an estimated probability of this outcome, a rank among the ${fmtInt(summary.n_trials_scored)} scored trials, a tier (high = top 10%, elevated = next 20%, typical = the rest) and the three design features that moved its score most.</p>
          </div>
          <div class="card">
            <h2>What is not predicted</h2>
            <ul class="checks">
              <li class="no">Not whether a treatment works, is safe, or whether the trial will "succeed" or "fail" scientifically.</li>
              <li class="no">Not the quality of a trial or its investigators.</li>
              <li class="no">Nothing about any person. The model ranks trials, never people, and never decides who is eligible. Eligibility is decided by the study team. Not medical advice.</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="section prose" aria-labelledby="train-h">
        <h2 id="train-h">How it was trained and tested</h2>
        <p><strong>Data.</strong> Registered trials from the <a href="${esc(metrics.data_source_url)}" rel="noopener">ClinicalTrials.gov API v2</a>: ${fmtInt(pulls.terminated?.rows)} terminated or withdrawn trials, ${fmtInt(pulls.completed?.rows)} completed trials and ${fmtInt(pulls.recruiting_ma?.rows)} recruiting trials with a Massachusetts site, pulled on ${esc(summary.data_pulled)}. ${(metrics.population_filters || []).map((f) => esc(f.charAt(0).toUpperCase() + f.slice(1))).join('; ')}.</p>
        <p><strong>Labels.</strong> The registry's free-text "why stopped" field. A keyword rule marks accrual, enrollment and recruitment reasons as positive; completed trials are negative ("strict" labels; "loose" labels also count trials stopped for other clear reasons as negatives). Trials with mixed reasons are left out of training.</p>
        <p><strong>Features.</strong> Design-time only: phase, sponsor type, number of sites, eligibility rules, age range and similar. Nothing known only after a trial runs is used, so the model can be applied to trials that are recruiting today.</p>
        <p><strong>Split.</strong> ${esc(metrics.split)}: trained on trials that started ${metrics.train_years?.[0]}–${metrics.train_years?.[1]} (${fmtInt(headline[0]?.n_train)} trials) and tested on trials that started ${metrics.test_years?.[0]}–${metrics.test_years?.[1]} (${fmtInt(headline[0]?.n_test)} trials). There is no random split, so the test mimics predicting the future.</p>
        <p><strong>Models.</strong> A LightGBM gradient-boosted classifier is the default and produces every score on this site. A logistic regression is kept as a baseline. Per-trial explanations use SHAP values.</p>
        ${sourceLine(summary)}
      </section>

      <section class="section" aria-labelledby="metrics-h">
        <h2 id="metrics-h">How well it works</h2>
        <div class="kv" style="margin-bottom:16px">
          <div class="stat"><div class="value">${fmtNum(headline[0]?.auc_roc, 3)}</div><div class="label">AUC-ROC, full test set</div></div>
          <div class="stat"><div class="value">${fmtPct(headline[0]?.precision_top10pct)}</div><div class="label">of the riskiest 10% did stop early for low enrollment (base rate ${fmtPct(headline[0]?.base_rate)}, ${fmtTimes(headline[0]?.precision_top10pct_vs_base)})</div></div>
          <div class="stat"><div class="value">${fmtNum(headline[0]?.auc_pr, 3)}</div><div class="label">AUC-PR (${fmtTimes(headline[0]?.auc_pr_vs_base)} the base rate)</div></div>
          <div class="stat"><div class="value">${fmtNum(headline.find((r) => r.slice === 'ma')?.auc_roc, 3)}</div><div class="label">AUC-ROC on the Massachusetts slice (${fmtInt(headline.find((r) => r.slice === 'ma')?.n_test)} test trials)</div></div>
        </div>
        <p class="metrics-note">Default model: ${esc(POP_LABELS[d.population] || d.population)} training population, ${esc(d.scheme)} labels, ${esc(MODEL_LABELS[d.model] || d.model)}. The highlighted row is the headline result. "Precision, top 10%" is ${esc(metrics.field_notes?.precision_top10pct || 'the share of the 10% highest-risk test trials that did stop early for low enrollment')}. Multiples in brackets are relative to the base rate. The Massachusetts slice is small (about 1,700 test trials, under 100 positives), so its numbers are less precise.</p>
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

      <section class="section" aria-labelledby="hc-h">
        <h2 id="hc-h">Label hand-check</h2>
        ${hc ? `
        <div class="kv" style="margin-bottom:12px">
          <div class="stat"><div class="value">${fmtPct(hc.positives_precision, 0)}</div><div class="label">of rule positives are true enrollment failures (${esc(hc.counts?.positives_precision)})</div></div>
          <div class="stat"><div class="value">${fmtPct(hc.other_correct, 0)}</div><div class="label">of "other" reasons correctly not enrollment failures (${esc(hc.counts?.other_correct)})</div></div>
          <div class="stat"><div class="value">${fmtPct(hc.unknown_correct, 0)}</div><div class="label">of "unknown" reasons correctly not enrollment failures (${esc(hc.counts?.unknown_correct)})</div></div>
          <div class="stat"><div class="value">${fmtPct(hc.mixed_actually_accrual, 0)}</div><div class="label">of excluded "mixed" reasons are in fact enrollment failures (${esc(hc.counts?.mixed_actually_accrual)})</div></div>
        </div>
        <p class="prose">${fmtInt(hc.n_checked)} "why stopped" reasons were hand-labeled by a ${esc(hc.reviewer)} (${esc(hc.note)}) and compared with the keyword rule. The rule is precise on clear enrollment failures and leaves out mixed reasons, so the positive class is conservative. Labels: <code>${esc(hc.labels_file)}</code> in the repository.</p>
        ` : '<p class="muted">Hand-check results are not available in this export.</p>'}
        ${sourceLine(summary)}
      </section>

      <section class="section" aria-labelledby="fi-h">
        <h2 id="fi-h">What drives the scores</h2>
        <p class="prose">Global feature importance for the default model: ${esc(fi.measure)}. Higher means the feature moves scores more, in either direction.</p>
        <div class="card">
          ${importanceChart(fi)}
          <p class="small muted" style="margin:10px 0 0">* "Main site in the US" reflects how consistently US-regulated trials report why they stopped, not trial design. It is used by the model but never shown as a per-trial reason.</p>
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
          <dt>AUC-ROC</dt><dd>How well the model separates trials that stopped early from those that did not. 0.5 is a coin flip, 1.0 is perfect.</dd>
          <dt>Base rate</dt><dd>The share of all test trials that stopped early for low enrollment, before any model.</dd>
          <dt>Precision, top 10%</dt><dd>Of the trials the model rated riskiest, the share that really did stop early for low enrollment.</dd>
          <dt>AUC-PR</dt><dd>A score that rewards finding the rare early-stopping trials without many false alarms. Compare it with the base rate.</dd>
          <dt>Brier score</dt><dd>How far the estimated percentages are from what happened. Lower is better.</dd>
          <dt>LightGBM</dt><dd>The type of model used: many small decision trees combined. Logistic regression is the simpler model it was compared with.</dd>
          <dt>SHAP</dt><dd>A way to measure how much each feature pushed a score up or down.</dd>
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
