import { loadSummary } from '../data.js?v=20261024222049';
import { esc, fmtInt, fmtPct, fmtTimes } from '../util.js?v=20261024222049';

const REPO = 'https://github.com/adityasssssa/trialpulse';

function qa(q, a) {
  return `<details class="faq"><summary>${esc(q)}</summary><div class="faq-a">${a}</div></details>`;
}

export async function render(main) {
  document.title = 'FAQ · TrialPulse';
  const s = await loadSummary();
  const tiers = s.risk_tiers || {};
  const src = `<p class="source">Source: ClinicalTrials.gov API v2, data pulled ${esc(s.data_pulled)}.</p>`;

  main.innerHTML = `
    <div class="faq-page">
      <div class="page-head">
        <h1>Frequently asked questions</h1>
        <p>Short answers for recruitment teams, judges and anyone seeing TrialPulse for the first time. Click a question to open it.</p>
      </div>

      <section class="section" aria-labelledby="basics-h">
        <h2 id="basics-h">The basics</h2>
        ${qa('What is TrialPulse?', `<p>A ranked list of the ${fmtInt(s.n_trials_scored)} clinical trials currently recruiting in Massachusetts, ordered by how likely each one is to stop early because it cannot enroll enough participants. It helps hospital recruitment offices decide where outreach help is needed first.</p>${src}`)}
        ${qa('Who is it for?', `<p>Clinical research coordinators and recruitment offices at Massachusetts hospitals. It is not for patients and does not help anyone find a trial for themselves.</p>`)}
        ${qa('What does "risk" mean here?', `<p>The estimated chance that a trial is stopped early (terminated or withdrawn) with low enrollment given as the reason. That is the only thing the model predicts.</p>`)}
        ${qa('What do the three tiers mean?', `<p><strong>High risk</strong> is the top 10% of the ranking (ranks ${fmtInt(tiers.high?.ranks?.[0])}–${fmtInt(tiers.high?.ranks?.[1])}, estimated risk ${fmtPct(tiers.high?.min_risk)} or more). <strong>Elevated risk</strong> is the next 20% (ranks ${fmtInt(tiers.elevated?.ranks?.[0])}–${fmtInt(tiers.elevated?.ranks?.[1])}, ${fmtPct(tiers.elevated?.min_risk)} or more). <strong>Typical risk</strong> is the remaining 70%.</p>${src}`)}
        ${qa('What does "2× typical" mean?', `<p>The trial's estimated risk compared with the typical (median) trial, whose risk is ${fmtPct(s.median_risk)}. So "2× typical" means about ${fmtPct(s.median_risk * 2)}.</p>${src}`)}
      </section>

      <section class="section" aria-labelledby="scores-h">
        <h2 id="scores-h">Using the scores</h2>
        ${qa('Does a high score mean the trial is bad or will fail?', `<p>No. The score says nothing about whether the treatment works or whether the science is good. It only estimates the chance of an enrollment problem. Even in the high tier, most trials are expected to finish normally.</p>`)}
        ${qa('What should a recruitment office do with a high score?', `<p>Treat it as a prompt to look at that trial first and consider extra outreach: community partners, referring clinicians, patient advocacy groups, plain-language materials. A score is for sending more help, never a reason to cut or close a trial.</p>`)}
        ${qa('Why does each trial show three reasons?', `<p>They are the three design features that moved that trial's score most, for example the number of sites or whether healthy volunteers are accepted. They explain the model, not the trial, and are not advice to the study team. Site country is never shown as a reason, because it mostly reflects how consistently trials in different countries report why they stopped.</p>`)}
        ${qa('Can I use TrialPulse to find a trial for myself or a patient?', `<p>No. TrialPulse ranks trials, never people, and has no way to tell whether anyone can join a trial. Eligibility is decided by the study team. Not medical advice. To look for a trial, use <a href="https://clinicaltrials.gov/" rel="noopener">ClinicalTrials.gov</a> and talk to a clinician.</p>`)}
        ${qa('Can I share a filtered view?', `<p>Yes. Filters and search terms are part of the page address on the ranked list, so copying the address shares exactly what you see.</p>`)}
      </section>

      <section class="section" aria-labelledby="data-h">
        <h2 id="data-h">Data and accuracy</h2>
        ${qa('Where does the data come from?', `<p>Public trial registrations from the ClinicalTrials.gov API v2, pulled on ${esc(s.data_pulled)}. No patient records are used, and the site collects no information about its visitors.</p>${src}`)}
        ${qa('How was the model built?', `<p>It learned from past trials that started 2008–2018, using only facts known when a trial is designed: phase, sponsor type, number of sites, eligibility rules and similar. It was then tested on trials that started 2019–2021, which it had never seen. Details and figures are on the <a href="#/about">About page</a>.</p>`)}
        ${qa('How accurate is it?', `<p>On ${fmtInt(s.n_test)} test trials, its accuracy score (AUC) was ${Number(s.auc_roc).toFixed(2)}, where 0.5 is a coin flip and 1.0 is perfect. Among the 10% of trials it rated riskiest, ${fmtPct(s.top_decile_precision, 0)} did stop early for low enrollment, compared with ${fmtPct(s.base_rate)} of all trials (${fmtTimes(s.top_decile_precision_vs_base)} the base rate). Useful for ranking, far from a certainty.</p>${src}`)}
        ${qa('What are its main limits?', `<p>Labels come from free-text "why stopped" reasons, so some are wrong. Accuracy is lower for mental-health trials, rare-disease performance cannot be measured, and trials that were never registered are invisible. The full list is on the <a href="#/about">About page</a> and the <a href="#/ethics">Ethics page</a>.</p>`)}
        ${qa('How often is the data updated?', `<p>The scores on this site come from a data pull on ${esc(s.data_pulled)}. Refreshing them means re-running the open-source pipeline in the <a href="${REPO}" rel="noopener">GitHub repository</a>, which pulls the registry again and re-scores every recruiting trial.</p>${src}`)}
        ${qa('Does the site track me?', `<p>No accounts, no analytics, no cookies set by us. The page loads map tiles from OpenStreetMap, the map library from unpkg and fonts from Google Fonts, which see ordinary web requests like any website image would.</p>`)}
        ${qa('Where is the code?', `<p>Everything, including the data exports and the model pipeline, is public at <a href="${REPO}" rel="noopener">github.com/adityasssssa/trialpulse</a>.</p>`)}
      </section>
    </div>`;
}
