import { api } from '../api.js';
import { addDays, esc, fmtDateShort, fmtMinutes, render, state } from '../core.js';

const RANGE_LABEL = { day: 'Day', week: 'Week', month: 'Month' };

export async function loadStats() {
  const ins = state.insights;
  if (!ins.date) ins.date = state.boot.today;
  ins.loading = true;
  ins.error = null;
  render();
  try {
    ins.stats = await api(`/api/stats?range=${ins.range}&date=${ins.date}`);
  } catch (err) {
    ins.error = err.message;
  }
  ins.loading = false;
  render();
}

function periodLabel(s) {
  if (!s) return '';
  if (s.range === 'day') return new Date(`${s.start}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  if (s.range === 'month') return new Date(`${s.start}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  return `${fmtDateShort(s.start)} to ${fmtDateShort(s.end)}`;
}

function step(dir) {
  const { range, date } = state.insights;
  if (range === 'day') return addDays(date, dir);
  if (range === 'week') return addDays(date, 7 * dir);
  const d = new Date(`${date.slice(0, 7)}-15T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + dir);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- tiles ---

function tiles(s) {
  const c = s.completion;
  const e = s.estimate;
  const ratio = e.actualToEstimateRatio;
  return `<div class="tiles">
    <div class="tile">
      <div class="tile-label">Focused time</div>
      <div class="tile-value">${fmtMinutes(s.focusedMinutes)}</div>
      <div class="tile-sub">${s.sessionsCount} ${s.sessionsCount === 1 ? 'session' : 'sessions'}</div>
      <details class="how"><summary>How this is counted</summary><p>The sum of every saved focus session that ended in this period, including time you logged by hand.</p></details>
    </div>
    <div class="tile">
      <div class="tile-label">Tasks completed</div>
      <div class="tile-value">${c.rate === null ? '—' : `${Math.round(c.rate * 100)}%`}</div>
      <div class="tile-sub">${c.planned ? `${c.completed} of ${c.planned} tasks` : 'No tasks due in this period'}</div>
      <details class="how"><summary>How this is counted</summary><p>${esc(c.definition)}</p></details>
    </div>
    <div class="tile">
      <div class="tile-label">Estimate accuracy</div>
      <div class="tile-value">${e.accuracy === null ? '—' : `${Math.round(e.accuracy * 100)}%`}</div>
      <div class="tile-sub">${ratio === null ? 'Finish a task with an estimate and tracked time to see this' : ratio > 1.05 ? `Tasks took ${ratio}× your estimates` : ratio < 0.95 ? `Tasks took ${ratio}× your estimates (faster than planned)` : 'Your estimates matched closely'}</div>
      <details class="how"><summary>How this is counted</summary><p>${esc(e.definition)} ${e.tasksCompared ? `Based on ${e.tasksCompared} ${e.tasksCompared === 1 ? 'task' : 'tasks'}: ${fmtMinutes(e.totalEstimated)} estimated, ${fmtMinutes(e.totalActual)} tracked.` : ''}</p></details>
    </div>
  </div>`;
}

// ---------------------------------------------------- focus-by-day bars ---

function niceMax(v) {
  if (v <= 60) return 60;
  const step = v <= 240 ? 60 : v <= 600 ? 120 : 240;
  return Math.ceil(v / step) * step;
}

function dayChart(s) {
  const data = s.byDay;
  const W = 640;
  const H = 200;
  const padL = 44;
  const padB = 26;
  const padT = 18;
  const innerW = W - padL - 8;
  const innerH = H - padB - padT;
  const max = niceMax(Math.max(...data.map((d) => d.minutes), 1));
  const slot = innerW / data.length;
  const gap = Math.max(2, slot * (data.length > 10 ? 0.2 : 0.35));
  const bw = slot - gap;
  const peak = data.reduce((a, d) => (d.minutes > a.minutes ? d : a), data[0]);
  const tickStep = max <= 240 ? 60 : max <= 600 ? 120 : 240;
  const ticks = [];
  for (let t = 0; t <= max; t += tickStep) ticks.push(t);
  const fmtTick = (m) => (m === 0 ? '0' : m % 60 === 0 ? `${m / 60} h` : `${m} m`);
  const r = Math.min(4, bw / 2);

  const bars = data.map((d, i) => {
    const x = padL + i * slot + gap / 2;
    const h = (d.minutes / max) * innerH;
    const y = padT + innerH - h;
    const base = padT + innerH;
    const path = h > 0
      ? (h > r
        ? `M${x},${base} V${y + r} Q${x},${y} ${x + r},${y} H${x + bw - r} Q${x + bw},${y} ${x + bw},${y + r} V${base} Z`
        : `M${x},${base} V${y} H${x + bw} V${base} Z`)
      : '';
    const label = data.length > 10 ? (i % 5 === 0 || i === data.length - 1 ? String(Number(d.date.slice(8))) : '') : d.label;
    const tip = `${new Date(`${d.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}: ${fmtMinutes(d.minutes)}`;
    return `<g class="bar-g" tabindex="0" data-tip="${esc(tip)}" role="img" aria-label="${esc(tip)}">
      <rect class="hit" x="${padL + i * slot}" y="${padT}" width="${slot}" height="${innerH + padB}" />
      ${path ? `<path class="bar" d="${path}"/>` : ''}
      ${d === peak && d.minutes > 0 ? `<text class="bar-val" x="${x + bw / 2}" y="${y - 6}" text-anchor="middle">${esc(fmtMinutes(d.minutes))}</text>` : ''}
      <text class="axis-label" x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(label)}</text>
    </g>`;
  }).join('');

  const grid = ticks.map((t) => {
    const y = padT + innerH - (t / max) * innerH;
    return `<line class="grid${t === 0 ? ' grid-base' : ''}" x1="${padL}" x2="${W - 8}" y1="${y}" y2="${y}"/>
      <text class="axis-label" x="${padL - 8}" y="${y + 4}" text-anchor="end">${fmtTick(t)}</text>`;
  }).join('');

  return `<figure class="chart">
    <svg viewBox="0 0 ${W} ${H}" class="bar-chart" role="group" aria-label="Focused minutes per day">${grid}${bars}</svg>
    <details class="table-view"><summary>Show as table</summary>
      <table><thead><tr><th scope="col">Day</th><th scope="col">Focused</th></tr></thead>
      <tbody>${data.map((d) => `<tr><td>${esc(fmtDateShort(d.date))}</td><td>${fmtMinutes(d.minutes)}</td></tr>`).join('')}</tbody></table>
    </details>
  </figure>`;
}

// ------------------------------------------------------------ categories ---

function categoryBars(s) {
  if (!s.byCategory.length) return '<p class="muted">No tracked time in this period.</p>';
  const max = s.byCategory[0].minutes || 1;
  return `<ul class="hbars">${s.byCategory.map((c) => `
    <li data-tip="${esc(`${c.category}: ${fmtMinutes(c.minutes)}, ${c.share}% of focused time`)}" tabindex="0">
      <span class="hbar-label">${esc(c.category)}</span>
      <span class="hbar-track"><span class="hbar-fill" style="width:${(c.minutes / max) * 100}%"></span></span>
      <span class="hbar-val">${fmtMinutes(c.minutes)} <span class="muted">${Math.round(c.share)}%</span></span>
    </li>`).join('')}</ul>`;
}

// ------------------------------------------------- estimate vs actual ---

function ledger(s) {
  const rows = [...s.estimate.perTask].sort((a, b) => Math.abs(b.actualMinutes - b.estimateMinutes) - Math.abs(a.actualMinutes - a.estimateMinutes));
  if (!rows.length) {
    return '<p class="muted">When you finish a task that has an estimate and tracked time, it shows up here so you can see how your guesses compare with reality.</p>';
  }
  const scale = Math.max(...rows.map((r) => Math.max(r.estimateMinutes, r.actualMinutes)));
  return `<ul class="ledger">${rows.map((r) => {
    const est = (r.estimateMinutes / scale) * 100;
    const act = (Math.min(r.actualMinutes, r.estimateMinutes) / scale) * 100;
    const over = r.actualMinutes > r.estimateMinutes ? ((r.actualMinutes - r.estimateMinutes) / scale) * 100 : 0;
    const diff = Math.round(r.actualMinutes - r.estimateMinutes);
    const verdict = Math.abs(diff) <= Math.max(5, r.estimateMinutes * 0.1)
      ? 'on target'
      : diff > 0 ? `${fmtMinutes(diff)} over` : `${fmtMinutes(-diff)} under`;
    return `<li tabindex="0" data-tip="${esc(`${r.title}: estimated ${fmtMinutes(r.estimateMinutes)}, tracked ${fmtMinutes(r.actualMinutes)}`)}">
      <div class="ledger-row-head"><span class="ledger-title">${esc(r.title)}</span><span class="ledger-verdict ${diff > 0 && verdict !== 'on target' ? 'is-over' : ''}">${verdict}</span></div>
      <div class="ledger-track" aria-hidden="true">
        <span class="ledger-est" style="width:${est}%"></span>
        <span class="ledger-act" style="width:${act}%"></span>
        ${over ? `<span class="ledger-over" style="left:${est}%;width:${over}%"></span>` : ''}
      </div>
      <div class="ledger-nums"><span>estimated ${fmtMinutes(r.estimateMinutes)}</span><span>tracked ${fmtMinutes(r.actualMinutes)}</span></div>
    </li>`;
  }).join('')}</ul>
  <p class="legend"><span class="ledger-key ledger-key-est"></span>estimate <span class="ledger-key ledger-key-act"></span>tracked <span class="ledger-key ledger-key-over"></span>time beyond the estimate</p>`;
}

// ----------------------------------------------------------------- view ---

export function renderInsights() {
  const ins = state.insights;
  const s = ins.stats;
  const isCurrent = ins.date && step(1) > state.boot.today;

  const head = `<div class="view-head view-head-row">
      <div><h1>Insights</h1><p class="lede">Every number here is calculated from your saved sessions and tasks. Open “How this is counted” on any figure to see the formula.</p></div>
    </div>
    <div class="toolbar">
      <div class="seg" role="group" aria-label="Period">
        ${['day', 'week', 'month'].map((r) => `<button type="button" data-action="range" data-range="${r}" aria-pressed="${ins.range === r}">${RANGE_LABEL[r]}</button>`).join('')}
      </div>
      <div class="stepper">
        <button class="icon-btn" data-action="prev-period" aria-label="Previous ${ins.range}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg></button>
        <span class="period" aria-live="polite">${esc(periodLabel(s))}</span>
        <button class="icon-btn" data-action="next-period" aria-label="Next ${ins.range}" ${isCurrent ? 'disabled' : ''}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
      </div>
      <button class="btn btn-primary btn-sm toolbar-end" data-action="go-review" ${s && s.sessionsCount ? '' : 'disabled'}>Review this ${ins.range} with Coach</button>
    </div>`;

  if (ins.error) {
    return `<div class="view view-insights">${head}<div class="error-box"><p>${esc(ins.error)}</p><button class="btn btn-ghost btn-sm" data-action="retry-stats">Try again</button></div></div>`;
  }
  if (!s) return `<div class="view view-insights">${head}<p class="muted loading-line">Loading your numbers…</p></div>`;

  const empty = !s.sessionsCount && !s.completion.planned;
  return `<div class="view view-insights${ins.loading ? ' is-loading' : ''}">
    ${head}
    ${empty ? `<div class="empty"><p><strong>Nothing tracked in this ${ins.range}.</strong> Start a focus session or log time by hand, and your totals appear here.</p><a class="btn btn-ghost btn-sm" href="#focus">Go to Focus</a></div>` : `
    ${tiles(s)}
    <div class="insights-grid">
      ${s.range !== 'day' ? `<section class="panel" aria-labelledby="byday-h"><div class="panel-head"><h2 id="byday-h">Focused time by day</h2></div>${dayChart(s)}</section>` : ''}
      <section class="panel" aria-labelledby="cat-h"><div class="panel-head"><h2 id="cat-h">Where the time went</h2></div>${categoryBars(s)}</section>
      <section class="panel panel-wide" aria-labelledby="ledger-h">
        <div class="panel-head"><h2 id="ledger-h">Estimates compared with reality</h2></div>
        ${ledger(s)}
      </section>
    </div>`}
  </div>`;
}

export const insightsHandlers = {
  async click(action, el) {
    const ins = state.insights;
    switch (action) {
      case 'range':
        ins.range = el.dataset.range;
        await loadStats();
        return true;
      case 'prev-period':
        ins.date = step(-1);
        await loadStats();
        return true;
      case 'next-period':
        ins.date = step(1) > state.boot.today ? state.boot.today : step(1);
        await loadStats();
        return true;
      case 'retry-stats':
        await loadStats();
        return true;
      case 'go-review':
        state.coach.mode = 'review';
        state.coach.result = null;
        state.coach.reviewRange = ins.range;
        state.coach.reviewChoice = null;
        state.coach.reviewDate = ins.date;
        location.hash = '#coach';
        return true;
      default:
        return false;
    }
  },
};
