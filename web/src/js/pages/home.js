import { loadSummary, loadIndex } from '../data.js';
import { esc, fmtInt, fmtPct, fmtTimes, tierBadge, sourceLine, phaseLabel, siteSummary, TIER_LABELS } from '../util.js';

const arrow = '<svg class="ext" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export async function render(main) {
  document.title = 'TrialPulse · Which Massachusetts trials need recruitment help?';
  const [summary, index] = await Promise.all([loadSummary(), loadIndex()]);
  const tiers = summary.risk_tiers || {};
  const top = index.slice(0, 5);

  main.innerHTML = `
    <section class="hero">
      <p class="eyebrow">Recruiting trials in Massachusetts</p>
      <h1>Many clinical trials close early because they can't enroll enough patients.</h1>
      <p class="lede">TrialPulse ranks the ${fmtInt(summary.n_trials_scored)} clinical trials currently recruiting in Massachusetts by their estimated risk of stopping early for low enrollment, so hospital recruitment offices can see which trials may need outreach help first. It ranks trials, never people.</p>
      <div class="actions">
        <a class="btn" href="#/trials">See the ranked trials ${arrow}</a>
        <a class="btn btn-secondary" href="#/about">How the model works</a>
      </div>
    </section>

    <section class="section" aria-labelledby="numbers-h">
      <h2 id="numbers-h" class="visually-hidden">Headline numbers</h2>
      <div class="stats">
        <div class="stat">
          <div class="value">${fmtInt(summary.n_trials_scored)}</div>
          <div class="label">recruiting trials scored, each with at least one Massachusetts site</div>
        </div>
        <div class="stat">
          <div class="value">${fmtInt(summary.n_high_risk)}</div>
          <div class="label">in the high-risk tier (top 10% by estimated risk)</div>
        </div>
        <div class="stat">
          <div class="value">${Number(summary.auc_roc).toFixed(2)}</div>
          <div class="label">AUC-ROC on ${fmtInt(summary.n_test)} held-out trials that started ${summary.test_years?.[0]}–${summary.test_years?.[1]}</div>
          <div class="detail">${Number(summary.auc_roc_ma).toFixed(2)} on the Massachusetts slice</div>
        </div>
        <div class="stat">
          <div class="value">${fmtPct(summary.top_decile_precision, 0)}</div>
          <div class="label">of the riskiest 10% of test trials did stop early for low enrollment</div>
          <div class="detail">vs ${fmtPct(summary.base_rate, 1)} of all test trials (${fmtTimes(summary.top_decile_precision_vs_base)} the base rate)</div>
        </div>
      </div>
      ${sourceLine(summary, 'Test set: interventional trials that started 2019–2021, scored by a model trained on trials that started 2008–2018.')}
    </section>

    <section class="section" aria-labelledby="what-h">
      <div class="grid-2">
        <div class="card">
          <h2 id="what-h">What TrialPulse does</h2>
          <ul class="checks">
            <li>Estimates, for each recruiting trial, the risk that it stops early because it cannot enroll enough participants.</li>
            <li>Ranks the ${fmtInt(summary.n_trials_scored)} trials and sorts them into three tiers so a recruitment office can prioritize outreach.</li>
            <li>Shows the three design features that moved each trial's score most, so the ranking is explainable.</li>
            <li>Uses only facts known when a trial is designed: phase, sponsor type, number of sites, eligibility rules. Never results.</li>
          </ul>
        </div>
        <div class="card">
          <h2>What it does not do</h2>
          <ul class="checks">
            <li class="no">It does not predict whether a treatment works, or whether a trial will "succeed" or "fail" scientifically.</li>
            <li class="no">It does not score, match or screen people. Eligibility is decided by the study team.</li>
            <li class="no">It does not give certainties. Scores are estimates and a ranking; even in the high tier, most trials are expected to finish normally.</li>
            <li class="no">It is not medical advice and is not meant for patients.</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="tiers-h">
      <div class="section-head"><h2 id="tiers-h">How to read a score</h2></div>
      <div class="tier-legend">
        <div class="card">
          ${tierBadge('high')}
          <p>Ranks ${fmtInt(tiers.high?.ranks?.[0])}–${fmtInt(tiers.high?.ranks?.[1])}: the top 10% by estimated risk (${fmtPct(tiers.high?.min_risk)} or more).</p>
        </div>
        <div class="card">
          ${tierBadge('elevated')}
          <p>Ranks ${fmtInt(tiers.elevated?.ranks?.[0])}–${fmtInt(tiers.elevated?.ranks?.[1])}: the next 20% (${fmtPct(tiers.elevated?.min_risk)} or more).</p>
        </div>
        <div class="card">
          ${tierBadge('typical')}
          <p>Ranks ${fmtInt(tiers.typical?.ranks?.[0])}–${fmtInt(tiers.typical?.ranks?.[1])}: the remaining 70%. The median trial has an estimated risk of ${fmtPct(summary.median_risk)}.</p>
        </div>
      </div>
      <p class="small muted" style="margin-top:12px">Each trial also shows its risk as a multiple of the typical (median) trial, for example "2.8× typical".</p>
      ${sourceLine(summary)}
    </section>

    <section class="section" aria-labelledby="top-h">
      <div class="section-head">
        <h2 id="top-h">Highest estimated risk right now</h2>
        <a href="#/trials">See all ${fmtInt(index.length)} ranked trials</a>
      </div>
      <ol class="preview-list">
        ${top.map((t) => {
          const sites = siteSummary(t, 1);
          return `<li class="preview-item">
            <div class="rank" aria-label="Rank ${t.risk_rank}">${t.risk_rank}</div>
            <div class="preview-text">
              <div class="title"><a href="#/trial/${esc(t.nct_id)}">${esc((t.conditions && t.conditions[0]) || t.title)}</a></div>
              ${t.conditions && t.conditions[0] ? `<div class="reg-title"><a href="#/trial/${esc(t.nct_id)}" title="${esc(t.title)}">${esc(t.title)}</a></div>` : ''}
              <div class="meta">${esc(t.nct_id)} · ${esc(phaseLabel(t.phases))} · ${esc(sites.shown[0] || '')}${sites.more ? ` +${sites.more} more` : ''}</div>
            </div>
            <div class="risk">
              ${tierBadge(t.risk_tier)}
              <div><span class="pct">${fmtPct(t.risk)}</span> <span class="muted small">est. risk · ${fmtTimes(t.risk_vs_typical)} typical</span></div>
            </div>
          </li>`;
        }).join('')}
      </ol>
      ${sourceLine(summary)}
    </section>

    <section class="section">
      <div class="notice">
        <p><strong>For recruitment offices, not patients.</strong> ${esc(summary.description)}</p>
      </div>
    </section>
  `;
}
