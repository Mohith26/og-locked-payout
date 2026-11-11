const test = require('node:test');
const assert = require('node:assert');
const LP = require('../lockedpayout.js');

const ml = (game, team) => ({ type: 'ml', game, team });
const sp = (game, team, line) => ({ type: 'spread', game, team, line });
const tot = (game, dir, line) => ({ type: 'total', game, dir, line });
const S = (contract, side, qty, price) => ({ kind: 'single', contract, side, qty, price });

// brute force over real final scores (and the cancelled settlement)
function brute(positions, games) {
  let best = Infinity;
  const per = games.map(g => {
    const rows = [];
    for (let h = 60; h <= 170; h++) for (let a = 60; a <= 170; a++) {
      if (h === a) continue;
      rows.push({ h, a });
    }
    return rows;
  });
  if (games.length !== 1) throw new Error('brute supports one game');
  const g = games[0];
  for (const r of per[0]) best = Math.min(best, LP.payoutAt(positions, g, r.h, r.a));
  // cancelled: min(yes, no) per contract row, combos 0
  const rows = new Map();
  for (const p of positions) if (p.kind !== 'combo') {
    const k = LP.contractKey(p.contract); const e = rows.get(k) || { yes: 0, no: 0 }; e[p.side] += p.qty; rows.set(k, e);
  }
  let c = 0; for (const e of rows.values()) c += Math.min(e.yes, e.no);
  return Math.min(best, c);
}

test('yes and no on the same row lock the smaller quantity', () => {
  const ps = [S(ml('G', 'home'), 'yes', 10, 0.6), S(ml('G', 'home'), 'no', 4, 0.41)];
  assert.strictEqual(LP.lockedPayout(ps).locked, 4);
});

test('home winner yes + away winner yes lock (no ties in basketball)', () => {
  const ps = [S(ml('G', 'home'), 'yes', 5, 0.6), S(ml('G', 'away'), 'yes', 5, 0.41)];
  // cancellation: two different rows, each could settle at VWAP 0 for yes
  assert.strictEqual(LP.lockedPayout(ps).locked, 0);
  assert.strictEqual(LP.lockedPayout(ps, { cancellation: false }).locked, 5);
});

test('cross-market lock: home -3.5 no + home ml yes is not locked, but home +3.5 yes + away ml yes is', () => {
  const a = [S(sp('G', 'home', 3.5), 'yes', 7, 0.7), S(ml('G', 'away'), 'yes', 7, 0.4)];
  // home +3.5 fails only when away wins by 4+, where away ml pays
  assert.strictEqual(LP.lockedPayout(a, { cancellation: false }).locked, 7);
  assert.strictEqual(LP.perGroupLocked(a), 0);
});

test('middle on totals: over 220.5 + under 225.5 always pays at least one leg', () => {
  const ps = [S(tot('G', 'over', 220.5), 'yes', 9, 0.55), S(tot('G', 'under', 225.5), 'yes', 9, 0.55)];
  assert.strictEqual(LP.lockedPayout(ps, { cancellation: false }).locked, 9);
});

test('parity matters: spread window of one point and total window of one point', () => {
  // home wins by exactly 3 (m=3) is the only way both "home -2.5 no" and "home +... " ... construct:
  // pays 0 only if m == 3 and t == 220 -> impossible because m and t must share parity.
  const ps = [
    S(sp('G', 'home', -2.5), 'no', 10, 0.5),   // pays if m <= 2
    S(sp('G', 'home', -3.5), 'yes', 10, 0.5),  // pays if m >= 4
    S(tot('G', 'over', 220.5), 'no', 10, 0.5), // pays if t <= 220
    S(tot('G', 'over', 219.5), 'yes', 10, 0.5),// pays if t >= 220
  ];
  // m must be 3 to zero the spread legs; then t odd; t=219 -> over219.5 no (0), over220.5 no pays 10.
  // t=221 -> over 219.5 yes pays 10. So minimum single-game payout is 10.
  assert.strictEqual(LP.lockedPayout(ps, { cancellation: false }).locked, 10);
  assert.strictEqual(LP.lockedPayout(ps).locked, brute(ps, ['G']));
});

test('combo no side combined with its legs', () => {
  const combo = { kind: 'combo', legs: [{ contract: ml('G', 'home'), side: 'yes' }, { contract: tot('G', 'over', 210.5), side: 'yes' }], side: 'no', qty: 6, price: 0.7 };
  const ps = [combo, S(ml('G', 'home'), 'yes', 6, 0.6), S(tot('G', 'over', 210.5), 'yes', 6, 0.5)];
  // if both legs true -> singles pay 12, combo no pays 0; otherwise combo pays 6 -> min 6 (ignoring cancellation)
  assert.strictEqual(LP.lockedPayout(ps, { cancellation: false }).locked, 6);
});

test('matches brute force on random single-game portfolios', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (let trial = 0; trial < 60; trial++) {
    const ps = [];
    const n = 2 + Math.floor(rnd() * 6);
    for (let i = 0; i < n; i++) {
      const r = rnd();
      let c;
      if (r < 0.25) c = ml('G', rnd() < 0.5 ? 'home' : 'away');
      else if (r < 0.6) c = sp('G', rnd() < 0.5 ? 'home' : 'away', (Math.floor(rnd() * 12) - 6) + 0.5);
      else c = tot('G', rnd() < 0.5 ? 'over' : 'under', 210 + Math.floor(rnd() * 20) + 0.5);
      ps.push(S(c, rnd() < 0.5 ? 'yes' : 'no', 1 + Math.floor(rnd() * 20), 0.5));
    }
    if (rnd() < 0.5) ps.push({ kind: 'combo', legs: [{ contract: ml('G', 'home'), side: 'yes' }, { contract: tot('G', 'over', 215.5), side: rnd() < 0.5 ? 'yes' : 'no' }], side: rnd() < 0.5 ? 'yes' : 'no', qty: 1 + Math.floor(rnd() * 10), price: 0.3 });
    // brute force with combos: combos pay 0 in cancellation, matches engine
    assert.strictEqual(LP.lockedPayout(ps).locked, brute(ps, ['G']), 'trial ' + trial);
  }
});

test('cross-game combo couples games exactly', () => {
  const combo = { kind: 'combo', legs: [{ contract: ml('A', 'home'), side: 'yes' }, { contract: ml('B', 'home'), side: 'yes' }], side: 'no', qty: 10, price: 0.75 };
  const ps = [combo, S(ml('A', 'home'), 'yes', 10, 0.5), S(ml('B', 'home'), 'yes', 10, 0.5)];
  // both home teams win: singles 20, combo 0 -> 20; else combo pays 10 + some singles >= 10. min = 10
  assert.strictEqual(LP.lockedPayout(ps, { cancellation: false }).locked, 10);
  // with cancellation: cancel A -> singles A pays min(10,0)=0, combo void 0, B away wins -> 0. min = 0
  assert.strictEqual(LP.lockedPayout(ps).locked, 0);
});

test('joint lock is never below the per-group baseline', () => {
  const ps = [S(ml('G', 'home'), 'yes', 5, 0.6), S(ml('G', 'home'), 'no', 3, 0.4), S(tot('G', 'over', 200.5), 'yes', 2, 0.5), S(tot('G', 'over', 200.5), 'no', 2, 0.5)];
  assert.ok(LP.lockedPayout(ps).locked >= LP.perGroupLocked(ps));
  assert.strictEqual(LP.perGroupLocked(ps), 5);
});

test('cancellation band around trailing VWAP', () => {
  const ps = [S(ml('G', 'home'), 'yes', 5, 0.6), S(ml('G', 'away'), 'yes', 5, 0.41)];
  const vwap = { 'G|ml|home': 0.6, 'G|ml|away': 0.41 };
  const r = LP.lockedPayout(ps, { vwap, cancelBand: 0.15 }).locked;
  assert.ok(Math.abs(r - (5 * 0.45 + 5 * 0.26)) < 1e-9);
  // a zero band means cancellation settles at today's VWAP: 5*0.6 + 5*0.41 = 5.05 > 5 played-outcome lock
  assert.strictEqual(LP.lockedPayout(ps, { vwap, cancelBand: 0 }).locked, 5);
});

test('rejects integer lines (push rules not modeled)', () => {
  assert.throws(() => LP.lockedPayout([S(sp('G', 'home', -3), 'yes', 1, 0.5)]));
});

test('incremental returns collateral for a hedging order', () => {
  const ps = [S(ml('G', 'home'), 'yes', 10, 0.6)];
  const r = LP.incremental(ps, S(ml('G', 'home'), 'no', 10, 0.42));
  assert.strictEqual(r.returned, 10);
});
