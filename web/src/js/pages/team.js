import { loadSummary } from '../data.js';
import { esc, fmtInt, fmtPct, sourceLine } from '../util.js';

const TEAM = ['Partaj Singh', 'Aditya Sharma', 'Aarush Lolla', 'Shivansh Badola'];
const REPO = 'https://github.com/adityasssssa/trialpulse';

export async function render(main) {
  document.title = 'About us · TrialPulse';
  const s = await loadSummary();

  main.innerHTML = `
    <div class="team-page">
      <div class="page-head">
        <h1>About us</h1>
        <p>Four students who built TrialPulse for the DS+X Healthcare hackathon in October 2026.</p>
      </div>

      <section class="section" aria-labelledby="who-h">
        <h2 id="who-h">Who we are</h2>
        <ul class="team-list">
          ${TEAM.map((n) => `<li class="team-card"><span class="avatar" aria-hidden="true">${esc(n.split(' ').map((w) => w[0]).join(''))}</span><span class="name">${esc(n)}</span></li>`).join('')}
        </ul>
      </section>

      <section class="section prose" aria-labelledby="mission-h">
        <h2 id="mission-h">Our mission</h2>
        <p>Many clinical trials close early because they cannot enroll enough patients, not because the science was wrong. When that happens, years of work and the hope of a better treatment are lost, and the people who might have joined never heard about the trial.</p>
        <p>Most tools try to fix this from the patient's side, by matching one person to one trial. We work on the other side: helping hospital recruitment offices see, early, which trials are most at risk of running out of participants, so they can send outreach help before a trial quietly closes.</p>
        <p>We built TrialPulse to be honest about what it knows. Every number names its source, every limit is written down, and the tool ranks trials, never people.</p>
      </section>

      <section class="section prose" aria-labelledby="data-h">
        <h2 id="data-h">What our data means</h2>
        <ul class="checks">
          <li><strong>Where it comes from.</strong> Public trial registrations on ClinicalTrials.gov, pulled on ${esc(s.data_pulled)}. No patient records are used anywhere.</li>
          <li><strong>What a score is.</strong> For each of the ${fmtInt(s.n_trials_scored)} trials now recruiting in Massachusetts, an estimate of the chance it stops early because too few people enroll. The typical trial sits at ${fmtPct(s.median_risk)}; the ${fmtInt(s.n_high_risk)} trials in the top 10% are flagged high risk.</li>
          <li><strong>How we know it is useful.</strong> We trained the model on trials that started 2008–2018 and tested it on ${fmtInt(s.n_test)} trials that started ${s.test_years?.[0]}–${s.test_years?.[1]}. Among the 10% it rated riskiest, ${fmtPct(s.top_decile_precision, 0)} really did stop early for low enrollment, compared with ${fmtPct(s.base_rate)} of all trials.</li>
          <li><strong>What a score is not.</strong> It is not a verdict on the treatment, the science or the research team, and it says nothing about whether any person can join. Most trials in every tier are expected to finish normally.</li>
          <li><strong>How to use it.</strong> Start outreach where the risk is highest. A high score is a reason to send more help, never a reason to cut a trial.</li>
        </ul>
        ${sourceLine(s)}
      </section>

      <section class="section prose" aria-labelledby="more-h">
        <h2 id="more-h">Learn more</h2>
        <ul class="checks">
          <li><a href="#/about">How the model works and its limits</a></li>
          <li><a href="#/ethics">Our ethics promise</a></li>
          <li><a href="#/faq">Frequently asked questions</a></li>
          <li><a href="${REPO}" rel="noopener">Code and data on GitHub</a></li>
        </ul>
      </section>

      <section class="section">
        <div class="notice"><p>Eligibility is decided by the study team. Not medical advice.</p></div>
      </section>
    </div>`;
}
