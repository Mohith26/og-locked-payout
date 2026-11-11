// Seeded synthetic data: one evening of NBA markets on OG and a book of 400
// accounts (retail, hedgers, market makers). Run: node gen_data.js > data.js
'use strict';
let s = 20261112;
function rnd() { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
const pick = a => a[Math.floor(rnd() * a.length)];
const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
function phi(x) { // standard normal CDF
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

const TEAMS = {
  BOS: ['Celtics', '#007A33', '#ffffff'], NYK: ['Knicks', '#006BB6', '#F58426'], MIL: ['Bucks', '#00471B', '#EEE1C6'],
  MIA: ['Heat', '#98002E', '#F9A01B'], DEN: ['Nuggets', '#0E2240', '#FEC524'], PHX: ['Suns', '#1D1160', '#E56020'],
  LAL: ['Lakers', '#552583', '#FDB927'], GSW: ['Warriors', '#1D428A', '#FFC72C'], OKC: ['Thunder', '#007AC1', '#EF3B24'],
  DAL: ['Mavericks', '#00538C', '#B8C4CA'], CLE: ['Cavaliers', '#860038', '#FDBB30'], IND: ['Pacers', '#002D62', '#FDBB30'],
  MIN: ['Timberwolves', '#0C2340', '#78BE20'], SAC: ['Kings', '#5A2D81', '#63727A'], ORL: ['Magic', '#0077C0', '#C4CED4'],
  HOU: ['Rockets', '#CE1141', '#C4CED4'], MEM: ['Grizzlies', '#5D76A9', '#12173F'], ATL: ['Hawks', '#E03A3E', '#C1D32F'],
  POR: ['Trail Blazers', '#E03A3E', '#000000'], CHI: ['Bulls', '#CE1141', '#000000'],
};
const PAIRS = [['BOS', 'NYK'], ['MIL', 'MIA'], ['DEN', 'PHX'], ['LAL', 'GSW'], ['OKC', 'DAL'], ['CLE', 'IND'], ['MIN', 'SAC'], ['ORL', 'HOU'], ['MEM', 'ATL'], ['POR', 'CHI']];
const TIMES = ['7:30 pm EST', '7:30 pm EST', '8:00 pm EST', '10:00 pm EST', '8:30 pm EST', '7:00 pm EST', '10:00 pm EST', '8:00 pm EST', '7:30 pm EST', '8:00 pm EST'];

const games = PAIRS.map(([away, home], i) => {
  const mu = Math.round((rnd() * 14 - 5) * 2) / 2;      // home margin mean
  const muT = Math.round(212 + rnd() * 24);               // total mean
  const sdM = 12, sdT = 16;
  const id = away + '@' + home;
  const pYes = p => Math.min(97, Math.max(3, Math.round(p * 100)));
  const ml = { home: pYes(1 - phi((0.0 - mu) / sdM)) };
  ml.away = 100 - ml.home + 1;
  const center = Math.round(-mu) + 0.5;                 // home handicap near fair
  const spreads = [-6, -3, 0, 3, 6].map(k => center + k);
  const spread = spreads.map(L => {
    const pHome = 1 - phi((-L - mu) / sdM);              // P(m + L > 0)
    return { line: L, home: pYes(pHome), away: pYes(1 - pHome) + 1 };
  });
  const tc = Math.round(muT) + 0.5;
  const totals = [-10, -5, 0, 5, 10].map(k => tc + k).map(L => {
    const pO = 1 - phi((L - muT) / sdT);
    return { line: L, over: pYes(pO), under: pYes(1 - pO) + 1 };
  });
  const vol = Math.round(60000 + rnd() * 240000);
  return { id, away, home, time: TIMES[i], mu, muT, ml, spread, totals, vol };
});

// price history for the featured game's home winner row (random walk around fair)
const featured = games[0];
const hist = [];
let x = featured.ml.home / 100 - 0.06;
for (let i = 0; i < 96; i++) { if (rnd() < 0.18) x += (featured.ml.home / 100 - x) * 0.25 + (rnd() - 0.5) * 0.05; if (rnd() < 0.03) x += (rnd() - 0.5) * 0.12; hist.push(Math.round(Math.min(0.95, Math.max(0.05, x)) * 100)); }
hist[hist.length - 1] = featured.ml.home;

// contract helpers with prices
function rowsOf(g) {
  const r = [];
  r.push({ c: { type: 'ml', game: g.id, team: 'home' }, yes: g.ml.home, no: 101 - g.ml.home });
  r.push({ c: { type: 'ml', game: g.id, team: 'away' }, yes: g.ml.away, no: 101 - g.ml.away });
  for (const sp of g.spread) {
    r.push({ c: { type: 'spread', game: g.id, team: 'home', line: sp.line }, yes: sp.home, no: 101 - sp.home });
    r.push({ c: { type: 'spread', game: g.id, team: 'away', line: -sp.line }, yes: sp.away, no: 101 - sp.away });
  }
  for (const t of g.totals) {
    r.push({ c: { type: 'total', game: g.id, dir: 'over', line: t.line }, yes: t.over, no: 101 - t.over });
    r.push({ c: { type: 'total', game: g.id, dir: 'under', line: t.line }, yes: t.under, no: 101 - t.under });
  }
  return r;
}
const R = Object.fromEntries(games.map(g => [g.id, rowsOf(g)]));
const single = (row, side, qty) => ({ kind: 'single', contract: row.c, side, qty, price: (side === 'yes' ? row.yes : row.no) / 100 });
function comboOf(legRows, side, qty) {
  const pr = legRows.reduce((p, l) => p * l.yes / 100, 1);
  return { kind: 'combo', legs: legRows.map(l => ({ contract: l.c, side: 'yes' })), side, qty, price: Math.round((side === 'yes' ? pr : 1 - pr) * 100) / 100 };
}

const accounts = [];
for (let i = 0; i < 400; i++) {
  const u = rnd();
  const type = u < 0.7 ? 'retail' : u < 0.85 ? 'hedger' : 'market maker';
  const ps = [];
  if (type === 'retail') {
    const n = ri(1, 3);
    for (let k = 0; k < n; k++) { const g = pick(games); ps.push(single(pick(R[g.id]), 'yes', ri(5, 200))); }
    if (rnd() < 0.35) { const gs = [pick(games), pick(games)]; ps.push(comboOf(gs.map(g => pick(R[g.id].slice(0, 2))), 'yes', ri(5, 60))); }
  } else if (type === 'hedger') {
    const g = pick(games); const rows = R[g.id]; const q = ri(50, 500);
    const kind = rnd();
    if (kind < 0.35) { // middle on totals
      const a = ri(0, 2), b = ri(a + 1, 4);
      ps.push(single(rows[12 + 2 * a], 'yes', q), single(rows[13 + 2 * b], 'yes', q));
    } else if (kind < 0.7) { // spread middle: home -x yes, away +y yes
      const a = ri(2, 4), b = ri(0, 2);
      ps.push(single(rows[2 + 2 * a], 'yes', q), single(rows[3 + 2 * b], 'yes', Math.round(q * (0.6 + rnd() * 0.5))));
    } else { // winner one way, spread the other
      ps.push(single(rows[0], 'yes', q), single(rows[3 + 2 * ri(2, 4)], 'yes', Math.round(q * 0.8)));
    }
    if (rnd() < 0.3) ps.push(single(pick(rows), pick(['yes', 'no']), ri(20, 200)));
  } else { // market maker: two-sided fills across a few games + short combos
    const gs = [...new Set([pick(games), pick(games), pick(games), pick(games)])];
    for (const g of gs) {
      const rows = R[g.id];
      for (let k = 0; k < ri(4, 9); k++) { const row = pick(rows); ps.push(single(row, rnd() < 0.5 ? 'yes' : 'no', ri(200, 3000))); }
    }
    for (let k = 0; k < ri(1, 4); k++) { const lg = [pick(gs), pick(gs)]; ps.push(comboOf(lg.map(g => pick(R[g.id].slice(0, 2))), 'no', ri(100, 1500))); }
  }
  accounts.push({ id: 'acct-' + String(1000 + i), type, positions: ps });
}

// "your" account: a hedged trader on the featured game
const F = R[featured.id];
const you = [
  single(F[0], 'yes', 400),                 // home winner yes
  single(F[3 + 2 * 3], 'yes', 300),         // away +(center+3) yes  (rows: away spread at -(center+3))
  single(F[2 + 2 * 1], 'no', 250),          // home spread (center-3) no
  single(F[12 + 2 * 1], 'yes', 350),        // over (tc-5) yes
  single(F[13 + 2 * 3], 'yes', 350),        // under (tc+5) yes
  single(F[12 + 2 * 4], 'no', 200),         // over (tc+10) no
  comboOf([F[0], F[12 + 2 * 2]], 'yes', 120),
  comboOf([F[1], F[13 + 2 * 2]], 'no', 150),
];
const vwap = {};
for (const g of games) for (const row of R[g.id]) {
  const c = row.c; const k = c.type === 'ml' ? c.game + '|ml|' + c.team : c.type === 'spread' ? c.game + '|sp|' + c.team + '|' + c.line : c.game + '|tot|' + c.dir + '|' + c.line;
  vwap[k] = Math.round((row.yes + (100 - row.no)) / 2) / 100;
}
const out = JSON.stringify({ generated: 'seed 20261112', teams: TEAMS, games, featured: featured.id, history: hist, you, accounts, vwap });
process.stdout.write('/* generated by gen_data.js (seed 20261112); do not edit */\n(function(d){if(typeof module==="object"&&module.exports)module.exports=d;else window.OG_DATA=d;})(' + out + ');\n');
