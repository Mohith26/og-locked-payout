/*
 * Locked Payout: exact cross-market collateral return for fully collateralized
 * event contracts.
 *
 * Every single-game contract on a basketball game (winner, spread, total, and
 * same-game combos built from them) is a function of the final score. Writing
 * m = home - away and t = home + away, each leg is a half-plane test on m or t.
 * The smallest amount a portfolio can pay out, over every feasible final score
 * AND the cancelled-event settlement, is cash the clearinghouse is guaranteed
 * to pay. That amount can be returned to the account the moment the positions
 * exist, instead of sitting as collateral until settlement.
 *
 * Exactness:
 *  - indicators only change at line breakpoints, so a few integers on each side
 *    of every breakpoint cover every region of the (m, t) plane;
 *  - feasibility: m != 0 (no ties in basketball), t >= |m| (no negative scores)
 *    and m, t have the same parity (home = (t + m) / 2 must be an integer);
 *  - cancellation: per OG's settlement rules a cancelled event settles Yes at
 *    the market's trailing one-week VWAP v and No at 1 - v. The final v is not
 *    known yet, so the guarantee uses the worst v inside a band around today's
 *    VWAP (opts.vwap[key] +/- opts.cancelBand), independently for every market
 *    row. With no VWAP, or a band of 0.5+, this is the fully adversarial
 *    min(yesQty, noQty).
 *    Combos touching a cancelled game are valued at 0 (conservative).
 *  - games are coupled only through cross-game combos; a branch-and-bound over
 *    per-game outcome classes finds the exact joint minimum.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LockedPayout = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const M_RANGE = 70;      // |margin| considered
  const T_MIN = 120, T_MAX = 330;

  function checkHalf(line) {
    if (Math.abs(line * 2 - Math.round(line * 2)) > 1e-9 || Number.isInteger(line)) {
      throw new Error('Only half-point lines are supported (got ' + line + ')');
    }
  }

  // Leg truth on an outcome {m, t}; outcome 'X' (cancelled) handled elsewhere.
  function legTrue(c, o) {
    switch (c.type) {
      case 'ml': return c.team === 'home' ? o.m > 0 : o.m < 0;
      case 'spread': return c.team === 'home' ? o.m + c.line > 0 : -o.m + c.line > 0;
      case 'total': return c.dir === 'over' ? o.t > c.line : o.t < c.line;
      default: throw new Error('unknown contract type ' + c.type);
    }
  }

  function contractKey(c) {
    if (c.type === 'ml') return c.game + '|ml|' + c.team;
    if (c.type === 'spread') return c.game + '|sp|' + c.team + '|' + c.line;
    return c.game + '|tot|' + c.dir + '|' + c.line;
  }

  // Threshold on m or t where a contract's truth can flip.
  function thresholds(c) {
    if (c.type === 'ml') return { m: [0], t: [] };
    if (c.type === 'spread') { checkHalf(c.line); return { m: [c.team === 'home' ? -c.line : c.line], t: [] }; }
    checkHalf(c.line); return { m: [], t: [c.line] };
  }

  function candidateInts(ths, lo, hi, excludeZero) {
    const s = new Set([lo, lo + 1, hi - 1, hi]);
    for (const c of ths) {
      for (let k = Math.floor(c) - 2; k <= Math.ceil(c) + 2; k++) if (k >= lo && k <= hi) s.add(k);
    }
    if (excludeZero) s.delete(0);
    return [...s].sort((a, b) => a - b);
  }

  // All feasible representative outcomes for one game given its contracts.
  function gameOutcomes(contracts) {
    const mt = [], tt = [];
    for (const c of contracts) { const th = thresholds(c); mt.push(...th.m); tt.push(...th.t); }
    const ms = candidateInts(mt, -M_RANGE, M_RANGE, true);
    const ts = candidateInts(tt, T_MIN, T_MAX, false);
    const out = [];
    for (const m of ms) for (const t of ts) {
      if (t < Math.abs(m)) continue;
      if (((m - t) % 2 + 2) % 2 !== 0) continue;
      out.push({ m, t });
    }
    return out;
  }

  function positionCost(p) { return p.qty * p.price; }

  /*
   * positions: [{kind:'single', contract, side:'yes'|'no', qty, price}
   *             {kind:'combo', legs:[{contract, side}], side:'yes'|'no', qty, price}]
   * returns { locked, posted, worstCase, classesSearched, perGame }
   */
  function lockedPayout(positions, opts) {
    opts = opts || {};
    const allowCancel = opts.cancellation !== false;
    const games = new Map(); // game -> {contracts: Map key->contract, singles: []}
    const ensure = g => { if (!games.has(g)) games.set(g, { contracts: new Map(), singles: [] }); return games.get(g); };
    const combos = [];
    for (const p of positions) {
      if (p.kind === 'combo') {
        for (const l of p.legs) ensure(l.contract.game).contracts.set(contractKey(l.contract), l.contract);
        combos.push(p);
      } else {
        const g = ensure(p.contract.game);
        g.contracts.set(contractKey(p.contract), p.contract);
        g.singles.push(p);
      }
    }
    const gameIds = [...games.keys()];
    // Per game: compress outcomes into classes with identical leg truth vectors.
    const perGame = gameIds.map(gid => {
      const g = games.get(gid);
      const keys = [...g.contracts.keys()];
      const cs = keys.map(k => g.contracts.get(k));
      const classes = new Map();
      for (const o of gameOutcomes(cs)) {
        const truth = {};
        let sig = '';
        cs.forEach((c, i) => { const v = legTrue(c, o); truth[keys[i]] = v; sig += v ? '1' : '0'; });
        if (!classes.has(sig)) {
          let pay = 0;
          for (const p of g.singles) {
            const v = truth[contractKey(p.contract)];
            if ((p.side === 'yes') === v) pay += p.qty;
          }
          classes.set(sig, { cancelled: false, truth, singlesPay: pay, example: o, count: 0 });
        }
        classes.get(sig).count++;
      }
      const list = [...classes.values()];
      if (allowCancel) {
        // worst VWAP per market: min(yes, no) per contract row
        const byKey = new Map();
        for (const p of g.singles) {
          const k = contractKey(p.contract);
          const e = byKey.get(k) || { yes: 0, no: 0 };
          e[p.side] += p.qty; byKey.set(k, e);
        }
        let pay = 0;
        const vw = opts.vwap || {};
        const band = opts.cancelBand == null ? 0.5 : opts.cancelBand;
        for (const [k, e] of byKey) {
          const v0 = vw[k];
          const lo = v0 == null ? 0 : Math.max(0, v0 - band);
          const hi = v0 == null ? 1 : Math.min(1, v0 + band);
          // linear in v: worst case at an end of the band
          pay += Math.min(e.yes * lo + e.no * (1 - lo), e.yes * hi + e.no * (1 - hi));
        }
        list.push({ cancelled: true, truth: null, singlesPay: pay, example: 'cancelled', count: 1 });
      }
      list.sort((a, b) => a.singlesPay - b.singlesPay);
      return { game: gid, classes: list, minSingles: list[0].singlesPay };
    });

    // combos indexed for evaluation
    function comboPay(choice) {
      let pay = 0;
      for (const c of combos) {
        let all = true;
        let cancelled = false;
        for (const l of c.legs) {
          const cls = choice.get(l.contract.game);
          if (cls.cancelled) { cancelled = true; break; }
          const v = cls.truth[contractKey(l.contract)];
          if ((l.side === 'yes') !== v) { all = false; break; }
        }
        if (cancelled) continue; // conservative: void combo pays nothing
        if ((c.side === 'yes') === all) pay += c.qty;
      }
      return pay;
    }

    // Branch and bound over games (games with combos first).
    const order = perGame.slice().sort((a, b) => b.classes.length - a.classes.length);
    const suffixMin = new Array(order.length + 1).fill(0);
    for (let i = order.length - 1; i >= 0; i--) suffixMin[i] = suffixMin[i + 1] + order[i].minSingles;
    let best = Infinity, bestChoice = null, searched = 0;
    const choice = new Map();
    (function dfs(i, acc) {
      if (acc + suffixMin[i] >= best) return;
      if (i === order.length) {
        searched++;
        const total = acc + comboPay(choice);
        if (total < best) { best = total; bestChoice = new Map(choice); }
        return;
      }
      for (const cls of order[i].classes) {
        if (acc + cls.singlesPay + suffixMin[i + 1] >= best) break; // classes sorted ascending
        choice.set(order[i].game, cls);
        dfs(i + 1, acc + cls.singlesPay);
      }
      choice.delete(order[i].game);
    })(0, 0);
    if (!isFinite(best)) best = 0;
    const posted = positions.reduce((s, p) => s + positionCost(p), 0);
    const worstCase = {};
    if (bestChoice) for (const [g, cls] of bestChoice) worstCase[g] = cls.cancelled ? 'cancelled' : cls.example;
    return { locked: best, posted, worstCase, leavesSearched: searched, perGame: perGame.map(p => ({ game: p.game, classes: p.classes.length })) };
  }

  // Baseline: netting only inside one market group (winner / spread / total),
  // the way single-event collateral return works today. Combos get nothing.
  function groupKey(p) { return p.contract.game + '|' + p.contract.type; }
  function perGroupLocked(positions, opts) {
    const groups = new Map();
    for (const p of positions) {
      if (p.kind === 'combo') continue;
      const k = groupKey(p);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(p);
    }
    let s = 0;
    for (const ps of groups.values()) s += lockedPayout(ps, opts).locked;
    return s;
  }

  // Payout of the positions on one game for a concrete final score (for heatmaps).
  function payoutAt(positions, game, home, away) {
    const o = { m: home - away, t: home + away };
    let pay = 0;
    for (const p of positions) {
      if (p.kind === 'combo') {
        if (!p.legs.every(l => l.contract.game === game)) continue;
        const all = p.legs.every(l => (l.side === 'yes') === legTrue(l.contract, o));
        if ((p.side === 'yes') === all) pay += p.qty;
      } else if (p.contract.game === game) {
        if ((p.side === 'yes') === legTrue(p.contract, o)) pay += p.qty;
      }
    }
    return pay;
  }

  // Collateral that a new order would get back immediately.
  function incremental(positions, order, opts) {
    const before = lockedPayout(positions, opts).locked;
    const after = lockedPayout(positions.concat([order]), opts).locked;
    return { before, after, returned: after - before, cost: positionCost(order) };
  }

  return { lockedPayout, perGroupLocked, payoutAt, incremental, legTrue, contractKey, gameOutcomes };
});
