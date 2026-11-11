/* UI for the Locked Payout concept. Every number is computed from data.js by lockedpayout.js. */
(function () {
  'use strict';
  const D = window.OG_DATA, LP = window.LockedPayout;
  const G = D.games.find(g => g.id === D.featured);
  const T = D.teams;
  const state = { band: 0.10, amount: 150, sel: { kind: 'ml', team: 'home', side: 'no' }, tab: 'exp', spIdx: 2, totIdx: 2 };
  const $ = id => document.getElementById(id);
  const usd = (v, d = 2) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const usd0 = v => '$' + Math.round(v).toLocaleString('en-US');
  const opts = () => ({ vwap: D.vwap, cancelBand: state.band });
  const CITY = { NYK: 'NY', PHX: 'PHO', GSW: 'GS', LAL: 'LA' };
  const short = ab => CITY[ab] || ab;
  const name = ab => short(ab) + ' ' + T[ab][0];

  function jersey(ab, size) {
    const [, c1, c2] = T[ab];
    return `<svg width="${size}" height="${size * 1.12}" viewBox="0 0 50 56"><path d="M14 2h6c1 5 9 5 10 0h6l1 9c3 2 6 3 9 3v36c0 3-2 5-5 5H9c-3 0-5-2-5-5V14c3 0 6-1 9-3z" fill="${c1}"/><path d="M14 2h6c1 5 9 5 10 0h6l1 9c3 2 6 3 9 3" fill="none" stroke="${c2}" stroke-width="2.5"/><path d="M4 14c3 0 6-1 9-3" fill="none" stroke="${c2}" stroke-width="2.5"/><path d="M8 52h34" stroke="#00000022" stroke-width="2"/></svg>`;
  }
  function legLabel(c) {
    if (c.type === 'ml') return name(c.team === 'home' ? G.home : G.away) + ' · Winner';
    if (c.type === 'spread') { const ab = short(c.team === 'home' ? G.home : G.away); return ab + ' ' + (c.line > 0 ? '+' : '') + c.line + ' · Spread'; }
    return (c.dir === 'over' ? 'Over ' : 'Under ') + c.line + ' · Total';
  }
  function posLabel(p) {
    if (p.kind === 'combo') return p.legs.length + '-leg combo<span class="pill">' + p.legs.map(l => legLabel(l.contract).split(' · ')[0]).join(' + ') + '</span>';
    return legLabel(p.contract);
  }

  // ---------- header / title ----------
  $('gameTitle').textContent = name(G.away) + ' @ ' + name(G.home);
  $('teamAway').innerHTML = jersey(G.away, 34) + '<span>' + name(G.away) + '</span>';
  $('teamHome').innerHTML = jersey(G.home, 34) + '<span>' + name(G.home) + '</span>';
  $('gameTime').textContent = G.time;
  $('vol').textContent = usd0(G.vol) + ' vol.';

  // ---------- price chart ----------
  function drawChart() {
    const svg = $('chart'); const W = svg.clientWidth || 866, H = 300, padR = 66, top = 12, bot = 24;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const h = D.history, n = h.length;
    const X = i => i / (n - 1) * (W - padR - 6);
    const Y = v => top + (1 - v / 100) * (H - top - bot);
    let s = '';
    for (const g of [0, 25, 50, 75, 100]) s += `<line x1="0" x2="${W - padR + 18}" y1="${Y(g)}" y2="${Y(g)}" stroke="#d9dce4" stroke-dasharray="3 4"/><text x="${W - 30}" y="${Y(g) + 3}" font-size="9" fill="#8790a5">${g}%</text>`;
    s += `<g opacity=".08" transform="translate(14,22) scale(.85)"><path fill="#292d3d" d="M19.875 24H0L4.265 0h19.888zM44.696 8.035h-6.754l.601-3.384h-6.24l-2.597 14.51h6.24l.755-4.05h-3.23l.847-4.793h10.178L42.066 24h-4.33l-.147-1.602L35.032 24h-13.04l4.29-24h19.843zM49.034 24H44.21l.848-4.832h4.832zM73.87 8.315h-6.8l.626-3.483h-6.334l-2.576 14.336h6.341l.62-3.483h6.821l-1.188 6.713L68.803 24h-17.58l4.239-24h19.875zM93.144 24H73.269l4.237-24h19.876zm13.535-24 2.916 9.791L115.548 0h7.489l-4.311 24h-6.695l2.183-12.454-4.285 7.636h-3.871l-1.809-7.676L102.007 24h-6.695l4.239-24zM7.622 19.168h6.187l2.59-14.51H10.21zm73.208 0h6.333l2.57-14.336H83.4z"/></g>`;
    const series = [[G.home, h], [G.away, h.map(v => 101 - v)]];
    for (const [ab, arr] of series) {
      const col = T[ab][1];
      let d = '';
      arr.forEach((v, i) => { d += (i ? 'L' : 'M') + X(i).toFixed(1) + ',' + Y(v).toFixed(1); if (i < n - 1) d += 'L' + X(i + 1).toFixed(1) + ',' + Y(v).toFixed(1); });
      const lx = X(n - 1), ly = Y(arr[n - 1]);
      s += `<path d="${d}" fill="none" stroke="${col}" stroke-width="1.6"/>`;
      s += `<circle cx="${lx}" cy="${ly}" r="6" fill="${col}" opacity=".25"/><circle cx="${lx}" cy="${ly}" r="3" fill="${col}"/>`;
      s += `<text x="${lx + 12}" y="${ly - 3}" font-size="10" font-weight="600" fill="${col}">${ab}</text><text x="${lx + 12}" y="${ly + 12}" font-size="14" font-weight="700" fill="${col}">${arr[n - 1]}%</text>`;
    }
    svg.innerHTML = s;
  }

  // ---------- exposure ----------
  function render() {
    const you = D.you;
    const r = LP.lockedPayout(you, opts());
    const played = LP.lockedPayout(you, { cancellation: false });
    const group = LP.perGroupLocked(you, opts());
    const posted = r.posted, locked = r.locked;
    const wc = played.worstCase[G.id];
    const cancelBinds = r.worstCase[G.id] === 'cancelled';
    const marginTxt = o => (o.m > 0 ? short(G.home) + ' by ' + o.m : short(G.away) + ' by ' + (-o.m)) + ', total ' + o.t;

    $('stats').innerHTML = [
      ['Collateral posted', usd(posted), 'Fully collateralized cost of ' + you.length + ' positions', ''],
      ['Locked payout', usd(locked), 'Returned to Cash now', 'g'],
      ['Worst-case loss', usd(posted - locked), cancelBinds ? 'Binding case: game cancelled' : 'Binding case: ' + marginTxt(wc), ''],
      ['Per-market netting', usd(group), 'Same-market hedges only', ''],
    ].map(([k, v, s, c]) => `<div class="stat"><div class="k">${k}</div><div class="v ${c}">${v}</div><div class="s">${s}</div></div>`).join('');

    // heatmap
    const cv = $('heat'), ctx = cv.getContext('2d');
    const dpr = window.devicePixelRatio || 1, CW = 820, CH = 300;
    cv.width = CW * dpr; cv.height = CH * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, CW, CH);
    const mLo = -30, mHi = 30, tLo = 186, tHi = 262; const left = 46, topP = 6, w = CW - left - 4, h = CH - topP - 16;
    const cols = mHi - mLo + 1, rows = (tHi - tLo) / 2;
    const cw = w / cols, ch = h / rows;
    let maxPay = 0; const grid = [];
    for (let i = 0; i < cols; i++) {
      const m = mLo + i; grid.push([]);
      for (let j = 0; j < rows; j++) {
        let t = tLo + 2 * j; if (((m - t) % 2 + 2) % 2) t += 1;
        const pay = m === 0 ? null : LP.payoutAt(you, G.id, (t + m) / 2, (t - m) / 2);
        grid[i].push({ m, t, pay }); if (pay != null) maxPay = Math.max(maxPay, pay);
      }
    }
    const minPlayed = played.locked;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      const c = grid[i][j]; const x = left + i * cw, y = topP + (rows - 1 - j) * ch;
      if (c.pay == null) { ctx.fillStyle = '#f7f8fc'; ctx.fillRect(x, y, cw, ch); continue; }
      const f = maxPay > minPlayed ? (c.pay - minPlayed) / (maxPay - minPlayed) : 0;
      const a = [230, 250, 234], b = [93, 209, 114];
      ctx.fillStyle = `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(',')})`;
      ctx.fillRect(x, y, cw + .5, ch + .5);
    }
    // worst cells: brand-tinted fill, with an outline only on the region's outer edges
    const isMin = (i, j) => i >= 0 && j >= 0 && i < cols && j < rows && grid[i][j].pay === minPlayed;
    ctx.fillStyle = '#fee7d9';
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) if (isMin(i, j)) ctx.fillRect(left + i * cw, topP + (rows - 1 - j) * ch, cw + .5, ch + .5);
    ctx.strokeStyle = '#ff5300'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (!isMin(i, j)) continue;
      const x = left + i * cw, y = topP + (rows - 1 - j) * ch;
      if (!isMin(i - 1, j)) { ctx.moveTo(x, y); ctx.lineTo(x, y + ch); }
      if (!isMin(i + 1, j)) { ctx.moveTo(x + cw, y); ctx.lineTo(x + cw, y + ch); }
      if (!isMin(i, j + 1)) { ctx.moveTo(x, y); ctx.lineTo(x + cw, y); }
      if (!isMin(i, j - 1)) { ctx.moveTo(x, y + ch); ctx.lineTo(x + cw, y + ch); }
    }
    ctx.stroke();
    // the user's lines
    ctx.setLineDash([3, 3]); ctx.strokeStyle = '#3a4157'; ctx.lineWidth = 1;
    const seenM = new Set(), seenT = new Set();
    const allLegs = you.flatMap(p => p.kind === 'combo' ? p.legs.map(l => l.contract) : [p.contract]);
    for (const c of allLegs) {
      if (c.type === 'spread') { const th = c.team === 'home' ? -c.line : c.line; if (!seenM.has(th) && th > mLo && th < mHi) { seenM.add(th); const x = left + (th - mLo + .5) * cw; ctx.beginPath(); ctx.moveTo(x, topP); ctx.lineTo(x, topP + h); ctx.stroke(); } }
      if (c.type === 'total') { if (!seenT.has(c.line) && c.line > tLo && c.line < tHi) { seenT.add(c.line); const y = topP + h - (c.line - tLo + 0.5) / 2 * ch; ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(left + w, y); ctx.stroke(); } }
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#8790a5'; ctx.font = '11px Funnel Sans, sans-serif'; ctx.textAlign = 'right';
    for (let t = 190; t <= 260; t += 10) ctx.fillText(String(t), left - 8, topP + h - (t - tLo) / 2 * ch + 4);
    ctx.save(); ctx.translate(10, topP + h / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('Total points', 0, 0); ctx.restore();
    ctx.textAlign = 'center';
    for (let m = -30; m <= 30; m += 10) ctx.textAlign = m === 30 ? 'right' : m === -30 ? 'left' : 'center', ctx.fillText(m === 0 ? '0' : (m > 0 ? short(G.home) + ' by ' + m : short(G.away) + ' by ' + (-m)), m === 30 ? left + w : m === -30 ? left : left + (m - mLo + .5) * cw, CH - 2);
    $('axL').textContent = ''; $('axR').textContent = '';
    $('posSub').textContent = 'At the worst played score: ' + marginTxt(wc);
    $('heatSub').textContent = `Worst played score pays ${usd(minPlayed)} (${marginTxt(wc)}). Dashed lines are the lines you hold.`;

    // positions table at the worst played score
    const home = (wc.t + wc.m) / 2, away = (wc.t - wc.m) / 2;
    $('posBody').innerHTML = you.map(p => {
      const pay = LP.payoutAt([p], G.id, home, away);
      return `<tr><td>${posLabel(p)}</td><td class="${p.side}">${p.side === 'yes' ? 'Yes' : 'No'}</td><td class="r">${p.qty.toLocaleString()}</td><td class="r">${Math.round(p.price * 100)}¢</td><td class="r">${usd(p.qty * p.price)}</td><td class="r ${pay ? '' : 'pays0'}">${usd(pay)}</td></tr>`;
    }).join('');

    // lock card
    const lockPct = locked / posted;
    $('lockcard').innerHTML = `<div class="h"><span>Locked payout</span><span class="new">New</span></div>
      <div class="big">${usd(locked)}</div>
      <div class="of">of ${usd(posted)} posted on this game is certain to come back</div>
      <div class="bar"><i style="width:${(lockPct * 100).toFixed(1)}%;background:#00a61e"></i><i style="width:${((1 - lockPct) * 100).toFixed(1)}%;background:#ffb088"></i></div>
      <div class="wc">Worst case: <b>${cancelBinds ? 'game cancelled, VWAP moves ' + Math.round(state.band * 100) + '¢' : marginTxt(wc)}</b>. Netting each market on its own would return ${usd(group)}.</div>`;
    $('hdrCash').textContent = usd(512.4 + locked);
    renderSlip();
  }

  // ---------- book (clearing view) ----------
  function renderBook() {
    const types = {}; let P = 0, J = 0, Gp = 0;
    for (const a of D.accounts) {
      const r = LP.lockedPayout(a.positions, opts()); const g = LP.perGroupLocked(a.positions, opts());
      const t = types[a.type] || (types[a.type] = { n: 0, p: 0, j: 0, g: 0 });
      t.n++; t.p += r.posted; t.j += r.locked; t.g += g; P += r.posted; J += r.locked; Gp += g;
    }
    $('bookSub').textContent = D.accounts.length + ' accounts · ' + D.games.length + ' games tonight';
    $('book').innerHTML = `<div><div class="k">Collateral posted</div><div class="v">${usd0(P)}</div></div>
      <div><div class="k">Per-market netting</div><div class="v">${usd0(Gp)}</div></div>
      <div><div class="k">Locked payout (all markets jointly)</div><div class="v g">${usd0(J)}</div></div>`;
    $('bookBody').innerHTML = ['market maker', 'hedger', 'retail'].map(k => { const t = types[k]; const lbl = { 'market maker': 'Market makers', hedger: 'Hedgers', retail: 'Retail' }[k];
      return `<tr><td>${lbl}</td><td class="r">${t.n}</td><td class="r">${usd0(t.p)}</td><td class="r">${usd0(t.g)}</td><td class="r yes">${usd0(t.j)}</td><td class="r">${(t.j / t.p * 100).toFixed(1)}%</td></tr>`; }).join('') +
      `<tr><td><b>Total</b></td><td class="r">${D.accounts.length}</td><td class="r">${usd0(P)}</td><td class="r">${usd0(Gp)}</td><td class="r yes">${usd0(J)}</td><td class="r"><b>${(J / P * 100).toFixed(1)}%</b></td></tr>`;
  }

  // ---------- trade slip ----------
  function selContract() {
    const s = state.sel;
    if (s.kind === 'ml') return { type: 'ml', game: G.id, team: s.team };
    if (s.kind === 'spread') { const L = G.spread[s.idx].line; return { type: 'spread', game: G.id, team: s.team, line: s.team === 'home' ? L : -L }; }
    return { type: 'total', game: G.id, dir: s.dir, line: G.totals[s.idx].line };
  }
  function priceOf(c, side) {
    let yes;
    if (c.type === 'ml') yes = c.team === 'home' ? G.ml.home : G.ml.away;
    else if (c.type === 'spread') { const sp = G.spread.find(x => x.line === (c.team === 'home' ? c.line : -c.line)); yes = c.team === 'home' ? sp.home : sp.away; }
    else { const t = G.totals.find(x => x.line === c.line); yes = c.dir === 'over' ? t.over : t.under; }
    return side === 'yes' ? yes : 101 - yes;
  }
  function renderSlip() {
    const c = selContract(), side = state.sel.side, cents = priceOf(c, side);
    const qty = Math.floor(state.amount / (cents / 100));
    const order = { kind: 'single', contract: c, side, qty, price: cents / 100 };
    const inc = LP.incremental(D.you, order, opts());
    const ab = c.type === 'ml' ? (c.team === 'home' ? G.home : G.away) : c.type === 'spread' ? (c.team === 'home' ? G.home : G.away) : G.home;
    const head = c.type === 'ml' ? name(ab) + ' ' + (side === 'yes' ? 'Yes' : 'No') : legLabel(c).split(' · ')[0] + ' ' + (side === 'yes' ? 'Yes' : 'No');
    const sub = c.type === 'ml' ? 'Winner' : c.type === 'spread' ? 'Spread' : 'Total';
    $('slip').innerHTML = `<div class="slip-h">${jersey(ab, 26)}<div><div class="t">${head}</div><div class="st">${sub}</div></div></div>
      <div class="amt"><span>$</span>${state.amount}</div>
      <div class="mult"><b>${(100 / cents).toFixed(2)}x</b> • ${cents}% chance</div>
      <div class="quick"><button data-a="10">+$10</button><button data-a="50">+$50</button><button data-a="100">+$100</button></div>
      <div class="lines">
        <div><span class="muted">Contracts</span><span>${qty.toLocaleString()} @ ${cents}¢</span></div>
        <div><span class="muted">Cost</span><span>${usd(inc.cost)}</span></div>
        <div><span class="muted">Comes back now</span><span class="g">${usd(inc.returned)}</span></div>
        <div><span class="muted">Net collateral</span><span>${usd(inc.cost - inc.returned)}</span></div>
        <span class="hint">${inc.returned > 0.005 ? 'Your other positions on this game already cover part of this order\'s worst case, so locked payout rises from ' + usd(inc.before) + ' to ' + usd(inc.after) + '.' : 'This order adds exposure; none of its cost is locked by your current positions.'}</span>
      </div>
      <button class="place">Place order</button>`;
    $('slip').querySelectorAll('.quick button').forEach(b => b.onclick = () => { state.amount += +b.dataset.a; renderSlip(); });
  }

  // ---------- game lines tab ----------
  function renderLines() {
    const s = state.sel;
    const btns = (sel, kind, extra) => {
      const yesC = kind(extra, 'yes'), noC = kind(extra, 'no');
      const on = side => sel(side) ? ' sel' : '';
      return `<div class="yn"><button class="y${on('yes')}" data-k='${JSON.stringify({ ...extra, side: 'yes' })}'>Yes ${yesC}¢</button><button class="n${on('no')}" data-k='${JSON.stringify({ ...extra, side: 'no' })}'>No ${noC}¢</button></div>`;
    };
    const chips = `<div class="chips"><button class="chip on">Full game</button><button class="chip">1st Half</button><button class="chip">2nd Half</button><button class="chip">1st Quarter</button><button class="chip">2nd Quarter</button><button class="chip">3rd Quarter</button><button class="chip">4th Quarter</button></div>`;
    let h = `<div class="sec-h">Winner</div>` + chips;
    for (const team of ['away', 'home']) {
      const ab = team === 'home' ? G.home : G.away; const yes = G.ml[team];
      h += `<div class="row"><div class="nm">${jersey(ab, 28)}${name(ab)}</div><div class="pct">${yes}%</div>${btns(side => s.kind === 'ml' && s.team === team && s.side === side, (e, side) => side === 'yes' ? yes : 101 - yes, { kind: 'ml', team })}</div>`;
    }
    h += `<div class="sec-h">Spread</div>` + chips;
    const sp = G.spread[state.spIdx];
    for (const team of ['away', 'home']) {
      const ab = team === 'home' ? G.home : G.away; const L = team === 'home' ? sp.line : -sp.line; const yes = team === 'home' ? sp.home : sp.away;
      h += `<div class="row"><div class="nm">${short(ab)}<span class="ln">${L > 0 ? '+' : ''}${L}</span></div><div class="pct">${yes}%</div>${btns(side => s.kind === 'spread' && s.team === team && s.idx === state.spIdx && s.side === side, (e, side) => side === 'yes' ? yes : 101 - yes, { kind: 'spread', team, idx: state.spIdx })}</div>`;
    }
    h += `<div class="sec-h">Total</div>` + chips;
    const tt = G.totals[state.totIdx];
    for (const dir of ['over', 'under']) {
      const yes = tt[dir];
      h += `<div class="row"><div class="nm">${dir === 'over' ? 'Over' : 'Under'}<span class="ln">${tt.line}</span></div><div class="pct">${yes}%</div>${btns(side => s.kind === 'total' && s.dir === dir && s.idx === state.totIdx && s.side === side, (e, side) => side === 'yes' ? yes : 101 - yes, { kind: 'total', dir, idx: state.totIdx })}</div>`;
    }
    $('tab-lines').innerHTML = h;
    $('tab-lines').querySelectorAll('.yn button').forEach(b => b.onclick = () => { state.sel = JSON.parse(b.dataset.k); renderLines(); renderSlip(); });
  }

  $('tabs').querySelectorAll('button').forEach(b => b.onclick = () => {
    state.tab = b.dataset.t;
    $('tabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    for (const t of ['exp', 'lines', 'props']) $('tab-' + t).hidden = t !== state.tab;
  });
  $('bandIn').oninput = e => { state.band = +e.target.value / 100; $('bandVal').textContent = e.target.value + '¢'; render(); renderBook(); };

  drawChart(); renderLines(); render(); renderBook();
  window.addEventListener('resize', drawChart);
})();
