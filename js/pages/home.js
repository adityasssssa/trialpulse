import { loadSummary, loadIndex } from '../data.js?v=20261025142715';
import { esc, fmtInt, fmtPct, fmtTimes, tierBadge, sourceLine, siteSummary } from '../util.js?v=20261025142715';
import { phaseWithInfo } from '../info.js?v=20261025142715';

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
      <p class="lede">TrialPulse ranks every trial now recruiting in Massachusetts by its estimated risk of stopping early for low enrollment. A hospital recruitment coordinator with limited outreach capacity can see which trials to review first.</p>
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
          <div class="label">of the highest-risk tenth did stop early for low enrollment</div>
          <div class="detail">On ${fmtInt(summary.n_test)} past trials the model had never seen. Across all of them, ${fmtPct(summary.base_rate)} stopped for that reason, so the top tenth was ${fmtTimes(summary.top_decile_precision_vs_base)} as likely.</div>
        </div>
        <div class="stat">
          <div class="value">${Number(summary.auc_roc).toFixed(2)}</div>
          <div class="label">ranking score (ROC-AUC)</div>
          <div class="detail">The chance the model ranks a trial that stopped for low enrollment above one that did not. 0.5 is random; 1.0 is perfect ranking.</div>
        </div>
      </div>
      ${sourceLine(summary, 'Test set: trials that started 2019–2021, scored by a model trained on 2008–2018 trials.')}
    </section>

    <section class="section" aria-labelledby="journey-h">
      <div class="section-head"><h2 id="journey-h">How a recruitment coordinator uses it</h2></div>
      <ol class="journey">
        <li><a href="#/trials?facility=Massachusetts%20General%20Hospital"><strong>Pick your facility or city</strong></a><span>Filter the ranked list to the trials your office supports.</span></li>
        <li><a href="#/trials?tier=high"><strong>Start at the top of the ranking</strong></a><span>High-risk trials are the ones to review first; the tier is a priority order, not a verdict.</span></li>
        <li><a href="#/trial/${esc(top[0]?.nct_id || '')}"><strong>Read why each trial scored as it did</strong></a><span>Three model inputs per trial, in plain words, plus the registered eligibility text.</span></li>
        <li><a href="#/trial/${esc(top[0]?.nct_id || '')}"><strong>Check the registry today</strong></a><span>Each trial page shows the live ClinicalTrials.gov status beside the scored snapshot.</span></li>
        <li><a href="#/trials?tier=high"><strong>Download the review list</strong></a><span>Export the filtered trials as a CSV for your team meeting.</span></li>
      </ol>
      <p class="small muted">The score flags a trial for human review. It does not predict which trials outreach would help most; that is a decision for the people who know the trial and the community.</p>
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
            <li class="no">It is not a certainty. On past trials, most of those in the high-risk tier were not stopped for low enrollment.</li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="tiers-h">
      <div class="section-head"><h2 id="tiers-h">How to read a score</h2></div>
      <p class="lede-small">Each trial gets an estimated risk and a place in the ranking. The ranking is what to act on. "× typical" is the trial's estimate divided by the median estimate across all ${fmtInt(summary.n_trials_scored)} scored trials (${fmtPct(summary.median_risk)}), so "2× typical" means about twice the median.</p>
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

    <section class="section" aria-labelledby="beyond-h">
      <div class="card">
        <h2 id="beyond-h">What this adds to a ClinicalTrials.gov search</h2>
        <ul class="checks">
          <li>A ranking of every recruiting Massachusetts trial by modeled enrollment risk, with the three inputs behind each score. The registry has no such ranking.</li>
          <li>Filters by Massachusetts city and facility, condition category, phase, sponsor type and start year, with shareable links.</li>
          <li>A review list you can download as a CSV, and a map of where the high-risk trials have sites.</li>
          <li>The registry's own status, checked live, beside each score.</li>
        </ul>
        <p class="small muted">The registry remains the source of truth for every trial; TrialPulse links to it from every trial page.</p>
      </div>
    </section>

    <section class="section">
      <div class="notice">
        <p><strong>Made for recruitment teams, not patients.</strong> Scores are estimates from a model trained on past trials. They rank trials, never people, and they are not medical advice. <a href="#/about">Read how the model works and where it falls short.</a></p>
      </div>
    </section>
  `;
}
