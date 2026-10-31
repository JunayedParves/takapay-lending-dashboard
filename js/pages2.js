// Drawings for Collections, Predictive, Vintages, Profitability, Action centre and Methodology.
(() => {
  const T = window.TP;
  const f = T.f;
  const enc = T.enc;
  const P = () => dash.params();
  const md = T.md;
  const BUCKETS = ['Current', '1–7 DPD', '8–30 DPD', '31–60 DPD', '61–90 DPD', '90+ DPD'];
  const bucketColor = (b) => ({ Current: T.c.teal, '1–7 DPD': '#E9C46A', '8–30 DPD': T.c.warn, '31–60 DPD': '#E07A3B', '61–90 DPD': '#D9603F', '90+ DPD': T.c.bad }[b] || T.c.grey);
  const SEGS = ['Low risk', 'Moderate risk', 'High risk', 'Very high risk'];
  const segColor = (s) => ({ 'Low risk': T.c.good, 'Moderate risk': T.c.gold, 'High risk': T.c.warn, 'Very high risk': T.c.bad }[s] || T.c.grey);

  // ---- collections ----
  dash.draw('c_coll', (el) => {
    const rows = T.get(el, 'mon_m');
    if (!rows) return;
    const m = T.months(rows, '2022-01', '2026-07');
    T.line(el, [
      { name: 'Scheduled', color: T.c.grey, values: m.map((r) => ({ x: md(r.month), y: r.sched })) },
      { name: 'Collected', color: T.c.teal, values: m.map((r) => ({ x: md(r.month), y: r.paid })) },
    ], { yfmt: f.bdt });
  });
  dash.draw('c_ce', (el) => {
    const rows = T.get(el, 'mon_m');
    if (!rows) return;
    const m = T.months(rows, '2022-01', '2026-07');
    const lo = Math.floor((d3.min(m, (r) => Math.min(r.ce, r.ontime_r)) - 0.03) * 20) / 20;
    T.line(el, [
      { name: 'Coll. eff.', color: T.c.teal, values: m.map((r) => ({ x: md(r.month), y: r.ce })) },
      { name: 'On-time', color: T.c.gold, values: m.map((r) => ({ x: md(r.month), y: r.ontime_r })) },
    ], { yfmt: f.pct, y0: Math.max(0, lo) });
  });
  dash.draw('c_status', (el) => {
    const rows = T.get(el, 'mon_m');
    if (!rows) return;
    const q = d3.rollups(T.months(rows, '2022-01', '2026-07'), (v) => {
      const n = d3.sum(v, (r) => r.inst);
      return { on: d3.sum(v, (r) => r.ontime) / n, late: d3.sum(v, (r) => r.late) / n, miss: d3.sum(v, (r) => r.missed) / n };
    }, (r) => r.month.slice(0, 4) + ' Q' + Math.ceil(+r.month.slice(5, 7) / 3));
    T.cols(el, q.map(([k, s]) => ({
      label: k.slice(2), title: k, parts: [{ y: s.on, color: T.c.good }, { y: s.late, color: T.c.warn }, { y: s.miss, color: T.c.bad }],
      tip: [{ color: T.c.good, name: 'On time', value: f.pct(s.on) }, { color: T.c.warn, name: 'Late or partial', value: f.pct(s.late) }, { color: T.c.bad, name: 'Missed', value: f.pct(s.miss) }],
    })), { yfmt: f.pct0, ymax: 1, height: 230 });
  });
  dash.draw('c_ageing', (el) => {
    const rows = T.get(el, 'ageing');
    if (!rows) return;
    const r = rows.filter((x) => x.division === T.div()).sort((a, b) => BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket));
    T.btable(el, r.map((x) => ({ ...x, label: x.bucket })), [
      { label: 'Outstanding', f: 'outstanding', fmt: f.bdt, color: (v, x) => bucketColor(x.bucket) }, { label: 'Loans', f: 'loans', fmt: f.num, color: (v, x) => bucketColor(x.bucket) },
    ]);
  });
  dash.draw('c_agemx', (el) => {
    const rows = T.get(el, 'ageing');
    if (!rows) return;
    const divs = [...new Set(rows.map((r) => r.division))].filter((d) => d !== 'All').sort();
    const tot = d3.rollup(rows, (v) => d3.sum(v, (r) => r.outstanding), (r) => r.division);
    const cell = (d, b) => {
      const r = rows.find((x) => x.division === d && x.bucket === b);
      const v = r ? r.outstanding / tot.get(d) : null;
      return { v, text: f.pct(v) };
    };
    T.grid(el, ['All', ...divs], BUCKETS.slice(1), cell, { rowW: '6.5rem', colW: '3.6rem', sel: (d) => d === T.div(), rowLabel: (d) => (d === 'All' ? 'All divisions' : d) });
  });
  dash.draw('c_roll', (el) => {
    const rows = T.get(el, 'roll_m');
    if (!rows) return;
    const r = rows.filter((x) => x.division === T.div());
    const to = [...BUCKETS, 'Repaid / closed', 'Written off'];
    T.grid(el, BUCKETS, to, (a, b) => {
      const x = r.find((y) => y.from === a && y.to === b);
      return x ? { v: x.share, text: f.pct(x.share), title: f.bdt(x.outstanding) + ' over 12 months' } : null;
    }, { color: T.c.teal, max: 1, corner: 'From ↓ / to →', rowW: '6.5rem', colW: '4rem' });
  });
  dash.draw('c_paramt', (el) => {
    const rows = T.get(el, 'mon_m');
    if (!rows) return;
    const m = T.months(rows, '2021-07');
    const s = (name, k, color) => ({ name, color, values: m.map((r) => ({ x: md(r.month), y: r[k] })) });
    T.line(el, [s('PAR 1', 'par1', T.c.sky), s('PAR 30', 'par30', T.c.gold), s('PAR 90', 'par90', T.c.bad)], { yfmt: f.bdt });
  });
  dash.draw('c_missed', (el) => {
    const rows = T.get(el, 'mon_m');
    if (!rows) return;
    const fm = d3.utcFormat('%b %Y');
    T.cols(el, T.months(rows, '2022-01', '2026-07').map((r) => ({ label: fm(md(r.month)), y: r.missed, color: T.c.bad, tip: [{ name: 'Missed', value: f.num(r.missed) }, { name: 'Missed rate', value: f.pct2(r.missed_r) }] })), { yfmt: f.num, height: 220, pad: 0.15 });
  });
  dash.draw('c_rec', (el) => {
    const rows = T.get(el, 'rec_m');
    if (!rows) return;
    const r = rows.filter((x) => x.dim === el.dataset.dim && x.division === T.div()).sort((a, b) => b.collected - a.collected);
    T.btable(el, r.map((x) => ({ ...x, label: x.segment })), [
      { label: 'Actions', f: 'action_share', fmt: f.pct, color: T.c.grey }, { label: 'Collected', f: 'collected', fmt: f.bdt }, { label: 'Recovery rate', f: 'recovery_r', fmt: f.pct, color: T.c.gold },
    ]);
  });
  dash.draw('c_recdiv', (el) => {
    const rows = T.get(el, 'rec_m');
    if (!rows) return;
    const r = rows.filter((x) => x.dim === 'Division' && x.division === 'All').sort((a, b) => b.recovery_r - a.recovery_r);
    T.btable(el, r.map((x) => ({ ...x, label: x.segment, sel: x.segment === T.div() })), [
      { label: 'Collected', f: 'collected', fmt: f.bdt }, { label: 'Recovery rate', f: 'recovery_r', fmt: f.pct, color: T.c.gold }, { label: 'Promises kept', f: 'ptp_kept_r', fmt: f.pct, color: T.c.good },
    ], { onClick: (x) => T.setDiv(x.segment) });
  });

  // ---- predictive ----
  const rk = () => (T.div() === 'All' ? 'All|All' : 'Division|' + T.div());
  dash.draw('c_segs', (el) => {
    const rows = T.get(el, 'risk_m');
    if (!rows) return;
    const r = SEGS.map((s) => rows.find((x) => x.id === rk() + '|' + s)).filter(Boolean);
    T.btable(el, r.map((x) => ({ ...x, label: x.segment })), [
      { label: 'Loans', f: 'loans', fmt: f.num, color: (v, x) => segColor(x.segment) }, { label: 'Exposure', f: 'exposure', fmt: f.bdt, color: (v, x) => segColor(x.segment) },
      { label: 'Avg PD', f: 'avg_pd', fmt: f.pct2, color: T.c.grey }, { label: 'EWS flagged', f: 'ews_loans', fmt: f.num, color: T.c.warn },
    ]);
  });
  dash.draw('c_backtest', (el) => {
    const rows = T.get(el, 'segment_backtest');
    if (!rows) return;
    const r = SEGS.map((s) => rows.find((x) => x.segment === s)).filter(Boolean);
    T.btable(el, r.map((x) => ({ ...x, label: x.segment })), [
      { label: 'Loans', f: 'loans', fmt: f.num, color: T.c.grey }, { label: 'Predicted', f: 'predicted', fmt: f.pct2, color: T.c.teal, max: d3.max(r, (x) => Math.max(x.predicted, x.actual)) },
      { label: 'Actual', f: 'actual', fmt: f.pct2, color: T.c.bad, max: d3.max(r, (x) => Math.max(x.predicted, x.actual)) },
    ]);
  });
  dash.draw('c_segmx', (el) => {
    const rows = T.get(el, 'risk_m');
    if (!rows) return;
    const dim = el.dataset.dim;
    const r = rows.filter((x) => x.dim === dim && x.segment !== 'All');
    const groups = [...new Set(r.map((x) => x.group))].sort();
    T.grid(el, groups, SEGS, (g, s) => {
      const x = r.find((y) => y.group === g && y.segment === s);
      return x ? { v: x.exposure_share, text: f.pct(x.exposure_share), title: f.bdt(x.exposure) } : null;
    }, { color: T.c.bad, max: 1, rowW: dim === 'Occupation' ? '11rem' : '6.5rem', colW: '4.4rem', sel: (g) => g === T.div(), rowLabel: (g) => T.short(g, 30) });
  });
  dash.draw('t_watch', (el) => {
    const rows = T.get(el, 'watchlist');
    if (!rows) return;
    const div = T.div();
    T.table(el, rows.filter((r) => div === 'All' || r.division === div), [
      { f: 'loan_id', label: 'Loan' }, { f: 'division', label: 'Division' }, { f: 'occupation', label: 'Occupation' }, { f: 'product', label: 'Product' },
      { f: 'outstanding', label: 'Outstanding', fmt: f.num, num: 1 }, { f: 'mob', label: 'Months on book', fmt: f.dec1, num: 1 },
      { f: 'late_on_loan', label: 'Late on loan', fmt: f.num, num: 1, heat: 'bad' }, { f: 'late_before', label: 'Late before', fmt: f.num, num: 1, heat: 'bad' },
      { f: 'p30', label: '30-day risk', fmt: f.pct, num: 1, heat: 'bad' }, { f: 'pd', label: '12m PD', fmt: f.pct, num: 1 }, { f: 'segment', label: 'PD segment' },
    ], { key: 'loan_id', sort: 'p30' });
  });
  const MET = [['roc_auc', 'ROC-AUC', f.dec], ['pr_auc', 'PR-AUC', f.dec], ['train_auc', 'Training ROC-AUC', f.dec], ['precision', 'Precision', f.pct], ['recall', 'Recall', f.pct], ['f1', 'F1 score', f.dec], ['threshold', 'Alert threshold', f.pct2], ['test_rate', 'Actual rate (test)', f.pct2], ['test_pred_rate', 'Predicted rate (test)', f.pct2], ['train_n', 'Training records', f.num], ['test_n', 'Test records', f.num]];
  const MODELS = ['PD', 'Early warning'];
  dash.draw('c_metrics', (el) => {
    const rows = T.get(el, 'model_metrics');
    if (!rows) return;
    T.grid(el, MET.map((m) => m[0]), MODELS, (m, mod) => {
      const r = rows.find((x) => x.model === mod && x.metric === m);
      return r ? { v: 0, text: MET.find((x) => x[0] === m)[2](r.value) } : null;
    }, { color: 'transparent', rowW: '10rem', colW: '6rem', rowLabel: (m) => MET.find((x) => x[0] === m)[1], colLabel: (c) => (c === 'PD' ? 'Probability of default' : c) });
  });
  dash.draw('c_conf', (el) => {
    const rows = T.get(el, 'model_metrics');
    if (!rows) return;
    el.replaceChildren();
    MODELS.forEach((mod) => {
      const v = (k) => rows.find((x) => x.model === mod && x.metric === k)?.value;
      const box = T.el('div', 'tp-conf-box');
      box.append(T.el('p', 'tp-mini-h', mod === 'PD' ? 'Probability of default' : mod));
      const g = T.el('div');
      box.append(g);
      el.append(box);
      const cells = { 'Actual yes|Flagged': v('tp'), 'Actual yes|Not flagged': v('fn'), 'Actual no|Flagged': v('fp'), 'Actual no|Not flagged': v('tn') };
      T.grid(g, ['Actual yes', 'Actual no'], ['Flagged', 'Not flagged'], (a, b) => {
        const n = cells[a + '|' + b];
        return { v: (a === 'Actual yes') === (b === 'Flagged') ? 0.6 : 0.15, text: f.num(n) };
      }, { color: T.c.teal, max: 1, rowW: '6rem', colW: '5.5rem' });
    });
  });
  dash.draw('c_curve', (el) => {
    const rows = T.get(el, 'model_curves');
    if (!rows) return;
    const c = el.dataset.curve;
    const s = (mod, color) => ({ name: mod === 'PD' ? 'PD' : 'EWS', color, values: rows.filter((r) => r.model === mod && r.curve === c).map((r) => ({ x: r.x, y: r.y })) });
    const series = [s('PD', T.c.teal), s('Early warning', T.c.gold)];
    if (c === 'roc') series.push({ name: 'Random', color: T.c.grey, dash: '4 4', width: 1, values: [{ x: 0, y: 0 }, { x: 1, y: 1 }] });
    T.line(el, series, { xscale: d3.scaleLinear, xdomain: [0, 1], xfmt: f.pct0, yfmt: f.pct0, y0: 0, endLabels: false, xticks: 5, tipx: (v) => (c === 'roc' ? 'False positive rate ' : 'Recall ') + f.pct(v) });
  });
  dash.draw('c_cal', (el) => {
    const rows = T.get(el, 'model_curves');
    if (!rows) return;
    const cal = rows.filter((r) => r.curve === 'calibration');
    const mx = d3.max(cal, (r) => Math.max(r.x, r.y));
    const s = (mod, color) => ({ name: mod === 'PD' ? 'PD' : 'EWS', color, values: cal.filter((r) => r.model === mod).map((r) => ({ x: r.x, y: r.y })) });
    T.line(el, [s('PD', T.c.teal), s('Early warning', T.c.gold), { name: 'Perfect', color: T.c.grey, dash: '4 4', width: 1, values: [{ x: 0, y: 0 }, { x: mx, y: mx }] }],
      { xscale: d3.scaleLinear, xdomain: [0, mx], xfmt: f.pct0, yfmt: f.pct0, y0: 0, endLabels: false, dots: true, xticks: 5, tipx: (v) => 'Predicted ' + f.pct(v) });
  });
  const qd = (p) => (p.includes('Q') ? new Date(Date.UTC(+p.slice(0, 4), (+p.slice(-1) - 1) * 3, 1)) : md(p));
  dash.draw('c_avp', (el) => {
    const rows = T.get(el, 'model_performance_time');
    if (!rows) return;
    const r = rows.filter((x) => x.model === 'PD');
    T.line(el, [
      { name: 'Actual', color: T.c.bad, values: r.map((x) => ({ x: qd(x.period), y: x.actual })) },
      { name: 'Predicted', color: T.c.teal, values: r.map((x) => ({ x: qd(x.period), y: x.predicted })) },
    ], { yfmt: f.pct, y0: 0, dots: true, xfmt: (d) => d.getUTCFullYear() + ' Q' + (Math.floor(d.getUTCMonth() / 3) + 1), tipx: (d) => d.getUTCFullYear() + ' Q' + (Math.floor(d.getUTCMonth() / 3) + 1), xticks: 4 });
  });
  dash.draw('c_psi', (el) => {
    const rows = T.get(el, 'model_monitoring');
    if (!rows) return;
    const col = (v) => (v > 0.25 ? T.c.bad : v > 0.1 ? T.c.warn : T.c.good);
    T.btable(el, rows.map((r) => ({ ...r, label: (r.model === 'PD' ? 'PD · ' : 'EWS · ') + r.population })), [
      { label: 'PSI', f: 'psi', fmt: f.dec, color: col, max: 0.3 }, { label: 'Mean score', f: 'mean_score', fmt: f.pct2, color: T.c.grey },
    ], { labelW: '2fr' });
  });
  dash.draw('c_auct', (el) => {
    const rows = T.get(el, 'model_performance_time');
    if (!rows) return;
    T.btable(el, rows.map((r) => ({ ...r, label: (r.model === 'PD' ? 'PD · ' : 'EWS · ') + r.period })), [{ label: 'Test ROC-AUC', f: 'auc', fmt: f.dec, color: T.c.teal, max: 1 }], { labelW: '2fr' });
  });
  dash.draw('c_feat', (el) => {
    const rows = T.get(el, 'model_features');
    if (!rows) return;
    const r = rows.filter((x) => x.model === el.dataset.model).sort((a, b) => b.importance - a.importance);
    T.btable(el, r.map((x) => ({ ...x, label: x.label })), [{
      label: 'Mean |SHAP|', f: 'importance', fmt: f.dec, color: (v, x) => (x.direction == null ? T.c.grey : x.direction > 0 ? T.c.gold : T.c.teal),
    }], { labelW: '1.6fr' });
  });

  // ---- vintages ----
  const MOBS = [1, 2, 3, 4, 5, 6, 9, 12, 15, 18, 24];
  dash.draw('c_vmx', (el) => {
    const rows = T.get(el, 'vin_m');
    if (!rows) return;
    const r = rows.filter((x) => x.type === 'Quarter' && x.division === T.div());
    const cohorts = [...new Set(r.map((x) => x.cohort))].sort();
    const idx = new Map(r.map((x) => [x.cohort + '|' + x.mob, x]));
    T.grid(el, cohorts, MOBS, (c, m) => {
      const x = idx.get(c + '|' + m);
      return x && x.rate != null ? { v: x.rate, text: f.pct(x.rate), title: f.num(x.defaults) + ' of ' + f.num(x.loans) + ' loans' } : null;
    }, { color: T.c.bad, colLabel: (m) => 'MOB ' + m, corner: 'Vintage', rowW: '5rem', colW: '3.3rem' });
  });
  dash.draw('c_vcurve', (el) => {
    const rows = T.get(el, 'vin_m');
    if (!rows) return;
    const r = rows.filter((x) => x.type === 'Year' && x.division === T.div());
    const years = [...new Set(r.map((x) => x.cohort))].sort();
    const pal = [T.c.sky, '#5B6CC2', T.c.gold, T.c.bad, T.c.teal, T.c.good];
    T.line(el, years.map((y, i) => ({ name: y, color: pal[i % pal.length], values: r.filter((x) => x.cohort === y).sort((a, b) => a.mob - b.mob).map((x) => ({ x: x.mob, y: x.rate })) })),
      { xscale: d3.scaleLinear, xdomain: [1, 24], xfmt: (v) => 'MOB ' + v, yfmt: f.pct, y0: 0, xticks: 6, tipx: (v) => 'Month on book ' + v });
  });
  dash.draw('c_vyoy', (el) => {
    const rows = T.get(el, 'vin_m');
    if (!rows) return;
    const r = rows.filter((x) => x.type === 'Year' && x.division === T.div());
    const years = [...new Set(r.map((x) => x.cohort))].sort();
    const at = (y, m) => r.find((x) => x.cohort === y && x.mob === m)?.rate ?? null;
    const data = years.map((y) => ({ label: y, m3: at(y, 3), m6: at(y, 6), m12: at(y, 12) }));
    const max = d3.max(data, (d) => Math.max(d.m3 || 0, d.m6 || 0, d.m12 || 0));
    T.btable(el, data, [{ label: 'By MOB 3', f: 'm3', fmt: f.pct, color: T.c.gold, max }, { label: 'By MOB 6', f: 'm6', fmt: f.pct, color: T.c.warn, max }, { label: 'By MOB 12', f: 'm12', fmt: f.pct, color: T.c.bad, max }], { labelW: '0.6fr' });
  });
  dash.draw('c_vgrp', (el) => {
    const rows = T.get(el, 'vin_m');
    if (!rows) return;
    const r = rows.filter((x) => x.type === el.dataset.type && x.mob === 12);
    const groups = [...new Set(r.map((x) => x.group))].sort();
    const years = [...new Set(r.map((x) => x.cohort))].sort();
    T.grid(el, groups, years, (g, y) => {
      const x = r.find((z) => z.group === g && z.cohort === y);
      return x && x.rate != null ? { v: x.rate, text: f.pct(x.rate), title: f.num(x.loans) + ' loans' } : null;
    }, { color: T.c.bad, rowW: '10rem', colW: '3.4rem' });
  });
  dash.draw('c_vnow', (el) => {
    const rows = T.get(el, 'vintage_now');
    if (!rows) return;
    T.btable(el, rows.map((r) => ({ label: String(r.year), p30: r.glp ? r.par30 / r.glp : null, p90: r.glp ? r.npl / r.glp : null, glp: r.glp })), [
      { label: 'PAR 30', f: 'p30', fmt: f.pct, color: T.c.gold }, { label: 'PAR 90', f: 'p90', fmt: f.pct, color: T.c.bad }, { label: 'Outstanding', f: 'glp', fmt: f.bdt },
    ], { labelW: '0.6fr' });
  });

  // ---- profitability ----
  const FIN = {
    Product: [['Income', 'revenue', f.bdt], ['ECL + recovery', 'cc', f.bdt, T.c.bad], ['Contribution', 'contribution', f.bdt, T.signColor], ['Risk-adj. return', 'rar', f.pct2, T.signColor]],
    Occupation: [['Contribution', 'contribution', f.bdt, T.signColor], ['Risk-adj. return', 'rar', f.pct2, T.signColor], ['NPL', 'npl_r', f.pct2, T.c.bad]],
    'Customer segment': [['Income', 'revenue', f.bdt], ['Yield', 'yield_r', f.pct2, T.c.gold], ['Contribution', 'contribution', f.bdt, T.signColor]],
  };
  dash.draw('c_fin', (el) => {
    const rows = T.get(el, 'seg_m');
    if (!rows) return;
    const dim = el.dataset.dim;
    const r = T.seg(rows, dim).sort((a, b) => b.contribution - a.contribution);
    T.btable(el, r.map((x) => ({ ...x, label: x.segment, cc: x.ecl + x.rec_cost })), FIN[dim].map(([label, k, fmt, color]) => ({ label, f: k, fmt, color })), { labelW: dim === 'Product' ? '1.2fr' : '1.6fr' });
  });
  dash.draw('c_findiv', (el) => {
    const rows = T.get(el, 'geo_m');
    if (!rows) return;
    const d = rows.filter((r) => r.level === 'division').sort((a, b) => b.rar - a.rar);
    T.btable(el, d.map((r) => ({ ...r, label: r.name, sel: r.name === T.div() })), [
      { label: 'Contribution', f: 'contribution', fmt: f.bdt, color: T.signColor }, { label: 'Risk-adj. return', f: 'rar', fmt: f.pct2, color: T.signColor }, { label: 'NPL', f: 'npl_r', fmt: f.pct2, color: T.c.bad },
    ], { onClick: (r) => T.setDiv(r.name) });
  });
  dash.draw('c_incnpl', (el) => {
    const rows = T.get(el, 'seg_m');
    if (!rows) return;
    const o = T.seg(rows, 'Occupation');
    T.scatter(el, o.map((r) => ({
      x: r.yield_r, y: r.npl_r, r: r.glp, label: T.short(r.segment, 22), color: T.c.gold,
      tip: [{ name: 'Income yield', value: f.pct2(r.yield_r) }, { name: 'NPL ratio', value: f.pct2(r.npl_r) }, { name: 'Contribution', value: f.bdt(r.contribution) }],
    })), { xfmt: f.pct, yfmt: f.pct, xlab: 'Income ÷ disbursed', ylab: 'NPL ratio', label: 10, height: 340 });
  });
  const COF = 0.045;
  dash.draw('c_yield', (el) => {
    const rows = T.get(el, 'mon_m');
    if (!rows) return;
    const m = T.months(rows, '2022-01', '2026-07');
    T.line(el, [{ name: 'Yield', color: T.c.teal, values: m.map((r) => ({ x: md(r.month), y: r.yield_r })) }], { yfmt: f.pct, y0: 0, refs: [{ y: COF, label: 'Cost of funds ' + f.pct(COF) }] });
  });

  // ---- action centre ----
  const RISK_ICON = (v) => (v === 'High' ? 'alert' : v === 'Medium' ? 'flag' : 'check');
  const unitFmt = (v, r) => (r.unit === 'bdt' ? f.bdt(v) : f.pct2(v));
  dash.draw('t_actions', (el) => {
    const rows = T.get(el, 'actions');
    if (!rows) return;
    T.table(el, rows.filter((r) => r.division === T.div()), [
      { f: 'area', label: 'Area' }, { f: 'finding', label: 'Finding' }, { f: 'evidence', label: 'Evidence' }, { f: 'kpi', label: 'KPI' },
      { f: 'actual', label: 'Actual', fmt: unitFmt, num: 1 }, { f: 'benchmark', label: 'Benchmark', fmt: unitFmt, num: 1 },
      { f: 'risk', label: 'Risk', badge: RISK_ICON }, { f: 'action', label: 'Recommended action' }, { f: 'impact', label: 'Expected impact' }, { f: 'limitation', label: 'Evidence limitation' },
    ], { sort: 'risk_rank', dir: 1 });
  });
  dash.draw('q_geo', (el) => {
    const rows = T.get(el, 'geo_m');
    if (!rows) return;
    const div = T.div();
    const r = rows.filter((x) => x.level === 'district' && (div === 'All' || x.division === div) && x.quadrant === el.dataset.q).sort((a, b) => b.glp - a.glp).slice(0, 6);
    el.replaceChildren(...r.map((x) => {
      const li = T.el('li');
      const w = 'id=' + enc(x.id);
      li.append(T.mk('span', 'geo_m', 'name', w, x.name), T.el('span', 'tp-q-sep', ' · growth '), T.mk('span', 'geo_m', 'growth', w, f.chg(x.growth), 'tp-q-v'), T.el('span', 'tp-q-sep', ' · NPL '), T.mk('span', 'geo_m', 'npl_r', w, f.pct2(x.npl_r), 'tp-q-v'));
      return li;
    }));
  });
  dash.draw('c_cechg', (el) => {
    const rows = T.get(el, 'kpi');
    if (!rows) return;
    const r = rows.filter((x) => x.division !== 'All').sort((a, b) => a.ce_chg - b.ce_chg);
    T.btable(el, r.map((x) => ({ ...x, label: x.division, sel: x.division === T.div() })), [
      { label: 'Change', f: 'ce_chg', fmt: f.pp, color: T.signColor }, { label: 'Coll. eff.', f: 'ce', fmt: f.pct, color: T.c.grey },
    ], { onClick: (x) => T.setDiv(x.division) });
  });
  dash.draw('c_npldist', (el) => {
    const rows = T.get(el, 'geo_m');
    if (!rows) return;
    const div = T.div();
    const r = rows.filter((x) => x.level === 'district' && (div === 'All' || x.division === div) && x.glp >= 1e6).sort((a, b) => b.npl_r - a.npl_r).slice(0, 10);
    T.btable(el, r.map((x) => ({ ...x, label: x.name + ' (' + x.division + ')' })), [
      { label: 'NPL', f: 'npl_r', fmt: f.pct2, color: T.c.bad }, { label: 'PAR 30', f: 'par30_r', fmt: f.pct2, color: T.c.gold }, { label: 'Outstanding', f: 'glp', fmt: f.bdt },
    ], { labelW: '1.5fr' });
  });
  dash.draw('q_val', (el) => {
    const rows = T.get(el, 'seg_m');
    if (!rows) return;
    const o = T.seg(rows, 'Occupation');
    const { def, rep } = T.portDef(rows);
    const mg = d3.median(o, (r) => r.glp_share);
    const test = {
      hl: (r) => r.glp_share >= mg && r.def12_r <= def,
      hh: (r) => r.glp_share >= mg && r.def12_r > def,
      rep: (r) => r.repeat_r > rep && r.def12_r < def,
      assess: (r) => r.def12_r > 1.25 * def,
    }[el.dataset.q];
    el.replaceChildren(...o.filter(test).sort((a, b) => b.glp - a.glp).map((r) => T.liSeg(r, 'def12_r', f.pct)));
  });
  dash.draw('c_prio', (el) => {
    const rows = T.get(el, 'ageing');
    if (!rows) return;
    const r = ['1–7 DPD', '8–30 DPD', '31–60 DPD'].map((b) => rows.find((x) => x.division === T.div() && x.bucket === b)).filter(Boolean);
    T.btable(el, r.map((x) => ({ ...x, label: x.bucket })), [
      { label: 'Loans', f: 'loans', fmt: f.num, color: (v, x) => bucketColor(x.bucket) }, { label: 'Outstanding', f: 'outstanding', fmt: f.bdt, color: (v, x) => bucketColor(x.bucket) },
    ]);
  });
  dash.draw('t_prio', (el) => {
    const rows = T.get(el, 'watchlist');
    if (!rows) return;
    const div = T.div();
    const r = rows.filter((x) => div === 'All' || x.division === div).sort((a, b) => b.outstanding - a.outstanding).slice(0, 15);
    T.table(el, r, [
      { f: 'loan_id', label: 'Loan' }, { f: 'division', label: 'Division' }, { f: 'product', label: 'Product' },
      { f: 'outstanding', label: 'Outstanding', fmt: f.num, num: 1 }, { f: 'late_on_loan', label: 'Late on loan', fmt: f.num, num: 1 }, { f: 'p30', label: '30-day risk', fmt: f.pct, num: 1, heat: 'bad' },
    ], { key: 'loan_id', sort: 'outstanding' });
  });

  // ---- methodology ----
  const valFmt = (v, r) => (r.unit === 'BDT' ? '৳' + d3.format(',.0f')(v) : r.unit === 'ratio' ? f.pct2(v) : r.unit === 'year' ? String(v) : f.num(v));
  dash.draw('t_val', (el) => {
    const rows = T.get(el, 'validation');
    if (!rows) return;
    T.table(el, rows.map((r, i) => ({ ...r, i })), [
      { f: 'check', label: 'Check' }, { f: 'rule', label: 'Rule' }, { f: 'expected', label: 'Source value', fmt: valFmt, num: 1 }, { f: 'actual', label: 'Dashboard value', fmt: valFmt, num: 1 },
      { f: 'status', label: 'Status', badge: (v) => (v === 'Pass' ? 'check' : v === 'Explained' ? 'book' : 'alert') },
    ], { key: 'check', sort: 'i', dir: 1 });
  });
})();
