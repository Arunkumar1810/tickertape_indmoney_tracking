'use strict';
/**
 * Rule-based rationale engine. Pure functions: record in -> scored record out.
 *
 * Input record (see fetch.js normalise()):
 *  { ticker, name, sector, quantity, averagePrice, investedValue, currentValue, returnPct,
 *    weight, price, high52, low52, metrics:{ttmPe,indpe,erqr,upside,breco,...},
 *    scorecard:[{name,tag,value,colour}], checklists:[{icid,title,state}], buyDate? }
 */

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
const round = (n, d = 1) => (isNum(n) ? Math.round(n * 10 ** d) / 10 ** d : null);

const COLOUR_SCORE = { green: 85, yellow: 55, orange: 40, red: 15 };

function card(rec, name) {
  return (rec.scorecard || []).find((s) => s.name && s.name.toLowerCase() === name.toLowerCase()) || null;
}
function cardScore(rec, name) {
  const c = card(rec, name);
  return c && isNum(c.value) ? c.value * 10 : null;
}
function cardColour(rec, name) {
  const c = card(rec, name);
  return c && c.colour && COLOUR_SCORE[c.colour] !== undefined ? COLOUR_SCORE[c.colour] : null;
}

function rangePosition(rec) {
  if (isNum(rec.price) && isNum(rec.high52) && isNum(rec.low52) && rec.high52 > rec.low52) {
    return clamp(((rec.price - rec.low52) / (rec.high52 - rec.low52)) * 100);
  }
  return null;
}

function intrinsicState(rec) {
  const c = (rec.checklists || []).find((x) => x.icid === 'IC001' || /intrinsic/i.test(x.title || ''));
  if (!c) return null;
  return c.state === 'checked';
}

function dimensionScores(rec) {
  const m = rec.metrics || {};

  const quality = avg(
    [cardScore(rec, 'Profitability'), cardScore(rec, 'Growth'), isNum(m.erqr) ? clamp(m.erqr) : null].filter(isNum)
  );

  let peScore = null;
  if (isNum(m.ttmPe) && isNum(m.indpe) && m.ttmPe > 0 && m.indpe > 0) {
    const r = m.ttmPe / m.indpe;
    peScore = clamp(90 - ((r - 0.7) / 0.8) * 75, 15, 90);
  }
  const iv = intrinsicState(rec);
  const valuation = avg([cardScore(rec, 'Valuation'), peScore, iv === null ? null : iv ? 80 : 25].filter(isNum));

  const momentum = avg([cardScore(rec, 'Performance'), cardScore(rec, 'Entry point'), rangePosition(rec)].filter(isNum));

  const analyst = avg(
    [isNum(m.upside) ? clamp(50 + m.upside * 2) : null, isNum(m.breco) ? clamp(m.breco) : null].filter(isNum)
  );

  const cl = rec.checklists || [];
  const passRatio = cl.length ? (cl.filter((c) => c.state === 'checked').length / cl.length) * 100 : null;
  const risk = avg([cardColour(rec, 'Red flags'), passRatio].filter(isNum));

  return { quality, valuation, momentum, analyst, risk };
}

function overallScore(scores, weights) {
  let sum = 0;
  let w = 0;
  for (const k of Object.keys(weights)) {
    if (isNum(scores[k])) {
      sum += scores[k] * weights[k];
      w += weights[k];
    }
  }
  return w > 0 ? sum / w : null;
}

/** Fraction of expected metrics that were present (0..1). */
function confidence(rec) {
  const m = rec.metrics || {};
  const checks = [
    isNum(m.ttmPe),
    isNum(m.indpe),
    isNum(m.erqr),
    isNum(m.upside),
    isNum(m.breco),
    isNum(rec.price),
    isNum(rec.high52),
    isNum(rec.low52),
    intrinsicState(rec) !== null,
    ...['Profitability', 'Growth', 'Valuation', 'Performance', 'Entry point', 'Red flags'].map((n) => card(rec, n) !== null)
  ];
  return checks.filter(Boolean).length / checks.length;
}

/**
 * Best-effort red/green signals from Tickertape's basic checklist titles plus optional `rec.signals`.
 * A failed ("unchecked") checklist item on promoters/debt/margins counts as falling/rising/declining.
 */
function signalsFrom(rec) {
  const s = { promoterFalling: false, debtRising: false, marginsDeclining: false, roceRising: false, fcfPositive: false, lowDebt: false, ...(rec.signals || {}) };
  for (const c of rec.checklists || []) {
    const t = `${c.title || ''} ${c.description || ''}`;
    const ok = c.state === 'checked';
    if (/promoter/i.test(t) && !ok) s.promoterFalling = true;
    if (/debt/i.test(t)) {
      if (ok) s.lowDebt = true;
      else s.debtRising = true;
    }
    if (/margin|profit/i.test(t) && !ok) s.marginsDeclining = true;
    if (/roce|return on capital/i.test(t) && ok) s.roceRising = true;
    if (/cash ?flow|fcf/i.test(t) && ok) s.fcfPositive = true;
  }
  return s;
}

function flagsFor(rec) {
  const s = signalsFrom(rec);
  const flags = [];
  if (s.promoterFalling && s.debtRising && s.marginsDeclining) {
    flags.push({ type: 'red', label: 'Falling promoter holding, rising debt, declining margins' });
  }
  if (s.roceRising && s.fcfPositive && s.lowDebt) {
    flags.push({ type: 'green', label: 'Rising ROCE, positive free cash flow, low debt' });
  }
  return flags;
}

function taxNote(rec, cfg, now) {
  const buyDate = rec.buyDate || (cfg.buyDates || {})[rec.ticker];
  if (!buyDate) return null;
  const t = Date.parse(buyDate);
  if (!Number.isFinite(t)) return null;
  const held = Math.floor((now - t) / 86400000);
  const left = cfg.tax.ltcgDays - held;
  if (left > 0 && left <= cfg.tax.nearWindowDays) {
    return `Held ${held} days; crosses the 1-year long-term gains mark in ${left} days. Consider waiting before trimming.`;
  }
  return null;
}

function verdictFor(rec, scores, overall, flags, conc, cfg) {
  const t = cfg.thresholds;
  const hasRed = flags.some((f) => f.type === 'red');
  const triggers = [];
  const T = (label, value) => triggers.push({ label, value });
  const ret = isNum(rec.returnPct) ? rec.returnPct : 0;
  let verdict;
  let reason;

  if (!isNum(overall)) {
    return { verdict: 'Review', reason: 'Not enough data to score; review manually.', triggers: [{ label: 'Data available', value: 'insufficient' }] };
  }

  if (overall < t.exitBelow && (hasRed || (isNum(scores.risk) && scores.risk < t.exitMaxRisk))) {
    verdict = 'Exit';
    reason = `Weak business and high risk (overall ${round(overall, 0)}/100).`;
    T('Overall score', round(overall));
    T('Risk score', round(scores.risk));
    if (hasRed) T('Red flag', 'present');
  } else if ((conc.stock || conc.sector) && overall < t.concentrationTrimMaxOverall) {
    verdict = 'Trim';
    reason = `${conc.stock ? 'Position' : 'Sector'} is over its weight cap and quality is not strong enough to justify it.`;
    T('Weight %', round(rec.weight));
    if (conc.sector) T('Sector weight %', round(conc.sectorWeight));
    T('Overall score', round(overall));
  } else if (isNum(scores.valuation) && scores.valuation <= t.trimValuationMax && ret > 0 && overall < t.trimMaxOverall) {
    verdict = 'Trim';
    reason = `Looks expensive (valuation ${round(scores.valuation, 0)}/100) and you are up ${round(ret)}%.`;
    T('Valuation score', round(scores.valuation));
    T('Return %', round(ret));
    T('Overall score', round(overall));
  } else if (overall < t.reviewBelow || hasRed) {
    verdict = 'Review';
    reason = hasRed ? 'Red flag detected; revisit the thesis.' : `Overall score is low (${round(overall, 0)}/100); revisit the thesis.`;
    T('Overall score', round(overall));
    if (hasRed) T('Red flag', 'present');
    else T('Weakest dimension', weakest(scores));
  } else if (overall >= t.accumulateOverall && isNum(scores.valuation) && scores.valuation >= t.accumulateMinValuation) {
    verdict = 'Accumulate';
    reason = `Strong business (quality ${round(scores.quality, 0)}) at a reasonable price (valuation ${round(scores.valuation, 0)}).`;
    T('Overall score', round(overall));
    T('Valuation score', round(scores.valuation));
    T('Quality score', round(scores.quality));
  } else {
    verdict = 'Hold';
    reason = `Balanced profile (overall ${round(overall, 0)}/100); no action needed.`;
    T('Overall score', round(overall));
    T('Weakest dimension', weakest(scores));
  }
  return { verdict, reason, triggers: triggers.filter((x) => x.value !== null && x.value !== undefined).slice(0, 3) };
}

function weakest(scores) {
  let k = null;
  for (const key of Object.keys(scores)) {
    if (isNum(scores[key]) && (k === null || scores[key] < scores[k])) k = key;
  }
  return k ? `${k} (${round(scores[k], 0)})` : 'n/a';
}

const ORDER = { Exit: 0, Trim: 1, Review: 2, Accumulate: 3, Hold: 4 };

/**
 * Score every holding. `previous` is an optional map ticker -> { verdict, overall } from the last run
 * and is used for hysteresis so verdicts do not flip on small score moves.
 * `opts.universe` (optional) is the full holdings list when scoring only a subset (e.g. --only).
 */
function scorePortfolio(records, cfg, opts = {}) {
  const now = opts.now || Date.now();
  const previous = opts.previous || {};
  const totalValue = records.reduce((a, r) => a + (isNum(r.currentValue) ? r.currentValue : 0), 0);
  const withWeight = records.map((r) => ({
    ...r,
    weight: isNum(r.weight) ? r.weight : totalValue > 0 && isNum(r.currentValue) ? (r.currentValue / totalValue) * 100 : null
  }));
  const sectorWeights = {};
  const universe = (opts.universe || records).map((r) => ({
    ...r,
    weight: isNum(r.weight) ? r.weight : totalValue > 0 && isNum(r.currentValue) ? (r.currentValue / totalValue) * 100 : null
  }));
  for (const r of universe) {
    if (isNum(r.weight)) sectorWeights[r.sector || 'Unknown'] = (sectorWeights[r.sector || 'Unknown'] || 0) + r.weight;
  }

  const holdings = withWeight.map((rec) => {
    const scores = dimensionScores(rec);
    const overall = overallScore(scores, cfg.weights);
    const flags = flagsFor(rec);
    const sectorWeight = sectorWeights[rec.sector || 'Unknown'];
    const conc = {
      stock: isNum(rec.weight) && rec.weight > cfg.caps.stockWeightPct,
      sector: isNum(sectorWeight) && sectorWeight > cfg.caps.sectorWeightPct,
      sectorWeight
    };
    const warnings = [];
    if (conc.stock) warnings.push(`Position is ${round(rec.weight)}% of portfolio (cap ${cfg.caps.stockWeightPct}%).`);
    if (conc.sector) warnings.push(`${rec.sector} sector is ${round(sectorWeight)}% of portfolio (cap ${cfg.caps.sectorWeightPct}%).`);

    let v = verdictFor(rec, scores, overall, flags, conc, cfg);
    const prev = previous[rec.ticker];
    if (prev && prev.verdict && prev.verdict !== v.verdict && isNum(prev.overall) && isNum(overall) && Math.abs(overall - prev.overall) < cfg.thresholds.hysteresis) {
      v = { ...v, reason: `${v.reason} (Kept previous verdict "${prev.verdict}": score moved less than ${cfg.thresholds.hysteresis} points.)`, verdict: prev.verdict, held: true };
    }
    let tax = null;
    if (v.verdict === 'Trim') {
      tax = taxNote(rec, cfg, now);
      if (tax) v = { ...v, reason: `${v.reason} ${tax}` };
    }
    const conf = confidence(rec);
    return {
      ...rec,
      scores: Object.fromEntries(Object.entries(scores).map(([k, x]) => [k, round(x)])),
      overall: round(overall),
      verdict: v.verdict,
      reason: v.reason,
      triggers: v.triggers,
      confidence: Math.round(conf * 100),
      flags,
      concentration: warnings,
      taxNote: tax,
      grade: grade(overall),
      wouldBuyToday: wouldBuy(scores)
    };
  });

  holdings.sort((a, b) => ORDER[a.verdict] - ORDER[b.verdict] || (a.overall ?? 0) - (b.overall ?? 0));
  return holdings;
}

function grade(overall) {
  if (!isNum(overall)) return '?';
  if (overall >= 80) return 'A';
  if (overall >= 65) return 'B';
  if (overall >= 50) return 'C';
  if (overall >= 35) return 'D';
  return 'F';
}

function wouldBuy(scores) {
  if (!isNum(scores.valuation) || !isNum(scores.quality)) return 'maybe';
  if (scores.quality >= 60 && scores.valuation >= 50) return 'yes';
  if (scores.quality < 40 || scores.valuation < 25) return 'no';
  return 'maybe';
}

module.exports = { scorePortfolio, dimensionScores, overallScore, confidence, flagsFor, signalsFrom, verdictFor, taxNote, grade, round };
