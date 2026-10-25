import { loadSummary, loadIndex } from '../data.js';
import { esc, fmtInt, fmtPct, fmtTimes, tierBadge, sourceLine, siteSummary } from '../util.js';
import { phaseWithInfo } from '../info.js';

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
      <p class="lede">TrialPulse ranks every trial now recruiting in Massachusetts by how likely it is to run into that problem. Recruitment teams can see at a glance which trials may need outreach help first.</p>
      <div class="actions">
        <a class="btn" href="#/trials">See the ranked trials ${arrow}</a>
        <a class="btn btn-secondary" href="#/about">How it works</a>
      </div>
    </section>

    <section class="section" aria-labelledby="numbers-h">
      <h2 id="numbers-h" class="visually-hidden">Key numbers</h2>
      <div class="stats">
        <div class="stat">
          <div class="value">${fmtInt(summary.n_trials_scored)}</div>
          <div class="label">trials ranked</div>
          <div class="detail">Every trial now recruiting with a site in Massachusetts.</div>
        </div>
        <div class="stat">
          <div class="value">${fmtInt(summary.n_high_risk)}</div>
          <div class="label">high-risk trials</div>
          <div class="detail">The top 10% of the ranking.</div>
        </div>
        <div class="stat">
          <div class="value">${fmtPct(summary.top_decile_precision, 0)}</div>
          <div class="label">of the highest-risk trials did stop early</div>
          <div class="detail">Among the 10% of past trials the model rated riskiest, ${fmtPct(summary.top_decile_precision, 0)} later stopped for low enrollment. Across all ${fmtInt(summary.n_test)} test trials, only ${fmtPct(summary.base_rate)} did.</div>
        </div>
        <div class="stat">
          <div class="value">${Number(summary.auc_roc).toFixed(2)}</div>
          <div class="label">accuracy score (AUC)</div>
          <div class="detail">On a scale where 0.5 is a coin flip and 1.0 is perfect.</div>
        </div>
      </div>
      ${sourceLine(summary)}
    </section>

    <section class="section" aria-labelledby="what-h">
      <div class="grid-2">
        <div class="card">
          <h2 id="what-h">What it does</h2>
          <ul class="checks">
            <li>Estimates each trial's risk of stopping early because too few people join.</li>
            <li>Sorts the trials into high, elevated and typical risk tiers, so outreach can start where it matters most.</li>
            <li>Shows the three reasons behind each score, in plain words.</li>
          </ul>
        </div>
        <div class="card">
          <h2>What it does not do</h2>
          <ul class="checks">
            <li class="no">It does not say whether a treatment works or whether a trial is good science.</li>
            <li class="no">It does not look at any person. Only the study team decides who is eligible.</li>
            <li class="no">It is not a certainty. Even among high-risk trials, most are expected to finish normally.</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="tiers-h">
      <div class="section-head"><h2 id="tiers-h">How to read a score</h2></div>
      <p class="lede-small">Each trial gets an estimated risk, shown as a percentage and as a multiple of the typical trial. The typical trial's risk is ${fmtPct(summary.median_risk)}, so "2× typical" means about twice that.</p>
      <div class="tier-legend">
        <div class="card">
          ${tierBadge('high')}
          <p>The top 10% of trials, with an estimated risk of ${fmtPct(tiers.high?.min_risk, 0)} or more. Worth a look first.</p>
        </div>
        <div class="card">
          ${tierBadge('elevated')}
          <p>The next 20%, with an estimated risk of ${fmtPct(tiers.elevated?.min_risk, 0)} or more. Keep an eye on these.</p>
        </div>
        <div class="card">
          ${tierBadge('typical')}
          <p>The remaining 70%. The model suggests no special action.</p>
        </div>
      </div>
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
              <div class="meta">${phaseWithInfo(t.phases)} · ${esc(sites.shown[0] || '')}${sites.more ? ` +${sites.more} more` : ''}</div>
            </div>
            <div class="risk">
              ${tierBadge(t.risk_tier)}
              <div><span class="pct">${fmtPct(t.risk)}</span> <span class="muted small">risk · ${fmtTimes(t.risk_vs_typical)} typical</span></div>
            </div>
          </li>`;
        }).join('')}
      </ol>
      ${sourceLine(summary)}
    </section>

    <section class="section">
      <div class="notice">
        <p><strong>Made for recruitment teams, not patients.</strong> Scores are estimates from a model trained on past trials. They rank trials, never people, and they are not medical advice. <a href="#/about">Read how the model works and where it falls short.</a></p>
      </div>
    </section>
  `;
}
