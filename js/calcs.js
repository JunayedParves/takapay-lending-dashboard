// Derived measures. Each calc only reshapes or divides the attached datasets.

dash.calc('mon_m', {
  inputs: ['monthly'],
  title: 'Monthly portfolio ratios',
  description: 'PAR, NPL, ECL, collection, on-time and yield ratios per month and division; collection ratios only for months whose instalments are settled (due through Jul 2026).',
  fn: (monthly) => monthly.map((r) => ({
    ...r,
    id: r.month + '|' + r.division,
    par1_r: r.glp ? r.par1 / r.glp : null,
    par7_r: r.glp ? r.par7 / r.glp : null,
    par30_r: r.glp ? r.par30 / r.glp : null,
    npl_r: r.glp ? r.par90 / r.glp : null,
    ecl_r: r.glp ? r.ecl / r.glp : null,
    ce: r.settled && r.sched ? r.paid / r.sched : null,
    ontime_r: r.settled && r.inst ? r.ontime / r.inst : null,
    late_r: r.settled && r.inst ? r.late / r.inst : null,
    missed_r: r.settled && r.inst ? r.missed / r.inst : null,
    yield_r: r.settled && r.glp ? (r.interest * 12) / r.glp : null,
  })),
});

dash.calc('kpi', {
  inputs: ['monthly'],
  title: 'Headline KPIs by division',
  description: 'Book figures at 31 Oct 2026 vs 31 Oct 2025; disbursement Jan–Oct 2026 vs Jan–Oct 2025; collections over the 12 settled months Aug 2025–Jul 2026 vs the 12 months before.',
  fn: (monthly) => [...d3.group(monthly, (r) => r.division)].map(([division, rs]) => {
    const at = (m) => rs.find((r) => r.month === m) || {};
    const sum = (a, b, f) => d3.sum(rs.filter((r) => r.month >= a && r.month <= b), (r) => r[f]);
    const c = at('2026-10');
    const p = at('2025-10');
    const ratio = (x, y) => (y ? x / y : null);
    const k = {
      division,
      disb_ytd: sum('2026-01', '2026-10', 'disb_amt'),
      disb_ytd_prev: sum('2025-01', '2025-10', 'disb_amt'),
      loans_ytd: sum('2026-01', '2026-10', 'disb_cnt'),
      loans_ytd_prev: sum('2025-01', '2025-10', 'disb_cnt'),
      glp: c.glp, glp_prev: p.glp,
      borrowers: c.borrowers, borrowers_prev: p.borrowers,
      active_loans: c.active_loans, active_loans_prev: p.active_loans,
      ecl: c.ecl, ecl_prev: p.ecl,
      net_glp: c.glp - c.ecl,
      npl_amt: c.par90, par30_amt: c.par30,
      npl_r: ratio(c.par90, c.glp), npl_r_prev: ratio(p.par90, p.glp),
      par1_r: ratio(c.par1, c.glp), par7_r: ratio(c.par7, c.glp),
      par30_r: ratio(c.par30, c.glp), par30_r_prev: ratio(p.par30, p.glp),
      ecl_r: ratio(c.ecl, c.glp),
      sched12: sum('2025-08', '2026-07', 'sched'), sched12_prev: sum('2024-08', '2025-07', 'sched'),
      paid12: sum('2025-08', '2026-07', 'paid'), paid12_prev: sum('2024-08', '2025-07', 'paid'),
      inst12: sum('2025-08', '2026-07', 'inst'),
      missed12: sum('2025-08', '2026-07', 'missed'), missed12_prev: sum('2024-08', '2025-07', 'missed'),
      ce: ratio(sum('2025-08', '2026-07', 'paid'), sum('2025-08', '2026-07', 'sched')),
      ce_prev: ratio(sum('2024-08', '2025-07', 'paid'), sum('2024-08', '2025-07', 'sched')),
      ontime_r: ratio(sum('2025-08', '2026-07', 'ontime'), sum('2025-08', '2026-07', 'inst')),
      ontime_r_prev: ratio(sum('2024-08', '2025-07', 'ontime'), sum('2024-08', '2025-07', 'inst')),
      late_r: ratio(sum('2025-08', '2026-07', 'late'), sum('2025-08', '2026-07', 'inst')),
      late_r_prev: ratio(sum('2024-08', '2025-07', 'late'), sum('2024-08', '2025-07', 'inst')),
    };
    const g = (a, b) => (k[b] ? k[a] / k[b] - 1 : null);
    return {
      ...k,
      disb_yoy: g('disb_ytd', 'disb_ytd_prev'), loans_yoy: g('loans_ytd', 'loans_ytd_prev'),
      glp_yoy: g('glp', 'glp_prev'), borrowers_yoy: g('borrowers', 'borrowers_prev'),
      ecl_yoy: g('ecl', 'ecl_prev'), sched12_yoy: g('sched12', 'sched12_prev'), paid12_yoy: g('paid12', 'paid12_prev'),
      missed12_yoy: g('missed12', 'missed12_prev'),
      npl_chg: k.npl_r - k.npl_r_prev, par30_chg: k.par30_r - k.par30_r_prev,
      ce_chg: k.ce - k.ce_prev, ontime_chg: k.ontime_r - k.ontime_r_prev, late_chg: k.late_r - k.late_r_prev,
    };
  }),
});

dash.calc('seg_m', {
  inputs: ['segments'],
  title: 'Segment ratios',
  description: 'Shares, NPL, PAR 30, on-time, 12-month default, repeat and profitability ratios for each breakdown and division.',
  fn: (segments) => {
    const tot = d3.rollup(segments, (v) => ({ disb: d3.sum(v, (r) => r.disb), glp: d3.sum(v, (r) => r.glp), loans: d3.sum(v, (r) => r.loans) }), (r) => r.dim + '|' + r.division);
    return segments.map((r) => {
      const t = tot.get(r.dim + '|' + r.division);
      const contribution = r.interest + r.fee - r.cof - r.ecl - r.rec_cost;
      return {
        ...r,
        id: r.dim + '|' + r.division + '|' + r.segment,
        avg_loan: r.disb / r.loans,
        disb_share: r.disb / t.disb, loan_share: r.loans / t.loans, glp_share: t.glp ? r.glp / t.glp : null,
        npl_r: r.glp ? r.npl / r.glp : null, par30_r: r.glp ? r.par30 / r.glp : null,
        ontime_r: r.inst_due ? r.inst_ontime / r.inst_due : null, ce: r.sched ? r.paid / r.sched : null,
        def12_r: r.mature_loans ? r.def12 / r.mature_loans : null,
        repeat_r: r.repeat_loans / r.loans, loans_per_borrower: r.loans / r.borrowers,
        revenue: r.interest + r.fee, yield_r: (r.interest + r.fee) / r.disb,
        nii: r.interest + r.fee - r.cof, contribution, rar: contribution / r.disb,
        credit_cost_r: (r.ecl + r.rec_cost) / r.disb,
      };
    });
  },
});

dash.calc('geo_m', {
  inputs: ['geography'],
  title: 'Geographic ratios and growth quadrants',
  description: 'Growth (Nov 2025–Oct 2026 vs Nov 2024–Oct 2025 disbursement), NPL, PAR 30, collection efficiency, penetration and contribution per division, district and upazila; quadrant compares growth with the median of its level and NPL with the portfolio NPL ratio.',
  fn: (geography) => {
    const SUM = ['loans', 'disb', 'disb_ttm', 'disb_pttm', 'glp', 'par30', 'npl', 'ecl', 'borrowers', 'sched_ttm', 'paid_ttm', 'interest', 'fee', 'cof', 'rec_cost', 'mature_loans', 'def12', 'customers'];
    const divs = geography.filter((r) => r.level === 'division');
    const all = { level: 'all', key: 'all', name: 'All divisions', division: 'All', district: '', upazila: '' };
    SUM.forEach((k) => (all[k] = d3.sum(divs, (r) => r[k])));
    const m = (r) => {
      const contribution = r.interest + r.fee - r.cof - r.ecl - r.rec_cost;
      return {
        ...r, id: r.key,
        growth: r.disb_pttm ? r.disb_ttm / r.disb_pttm - 1 : null,
        npl_r: r.glp ? r.npl / r.glp : null, par30_r: r.glp ? r.par30 / r.glp : null,
        ce: r.sched_ttm ? r.paid_ttm / r.sched_ttm : null,
        def12_r: r.mature_loans ? r.def12 / r.mature_loans : null,
        penetration: r.customers ? r.borrowers / r.customers : null,
        avg_loan: r.disb / r.loans, contribution, rar: contribution / r.disb,
      };
    };
    const a = m(all);
    const rows = geography.map(m);
    ['division', 'district', 'upazila'].forEach((lv) => {
      const g = rows.filter((r) => r.level === lv);
      const mg = d3.median(g, (r) => r.growth);
      g.forEach((r) => (r.quadrant = (r.growth >= mg ? 'High growth' : 'Low growth') + ' / ' + (r.npl_r > a.npl_r ? 'High risk' : 'Low risk')));
    });
    return [a, ...rows];
  },
});

dash.calc('fun_m', {
  inputs: ['funnel'],
  title: 'Origination funnel ratios',
  description: 'Approval, rejection and disbursement conversion rates and average loan per division and application year.',
  fn: (funnel) => funnel.map((r) => ({
    ...r, id: r.division + '|' + r.year,
    approval_r: r.approved / r.applications, rejection_r: r.rejected / r.applications,
    withdrawn_r: r.withdrawn / r.applications, disb_r: r.disbursed / r.applications,
    avg_loan: r.disbursed ? r.disb_amt / r.disbursed : null,
  })),
});

dash.calc('orig', {
  inputs: ['segments'],
  title: 'Origination averages',
  description: 'Loan-weighted average interest rate and tenure, and the repeat borrower rate, per division across all loans 2021–2026.',
  fn: (segments) => [...d3.group(segments.filter((r) => r.dim === 'Borrower type'), (r) => r.division)].map(([division, v]) => {
    const loans = d3.sum(v, (r) => r.loans);
    return {
      division, loans,
      avg_rate: d3.sum(v, (r) => r.rate * r.loans) / loans,
      avg_tenure: d3.sum(v, (r) => r.tenure * r.loans) / loans,
      repeat_r: d3.sum(v, (r) => r.repeat_loans) / loans,
      avg_loan: d3.sum(v, (r) => r.disb) / loans,
    };
  }),
});

dash.calc('rec_m', {
  inputs: ['recovery'],
  title: 'Recovery ratios',
  description: 'Recovery rate (collected ÷ balance before the action), cost per action and promise-to-pay kept rate per collection channel, stage, outcome and division, with a total row per division.',
  fn: (recovery) => {
    const tot = [...d3.group(recovery.filter((r) => r.dim === 'Channel'), (r) => r.division)].map(([division, v]) => {
      const t = { dim: 'Total', division, segment: 'All' };
      ['actions', 'collected', 'balance_before', 'cost', 'ptp', 'ptp_kept'].forEach((k) => (t[k] = d3.sum(v, (r) => r[k])));
      return t;
    });
    const n = d3.rollup(recovery, (v) => d3.sum(v, (r) => r.actions), (r) => r.dim + '|' + r.division);
    return [...tot, ...recovery].map((r) => ({
      ...r, id: r.dim + '|' + r.division + '|' + r.segment,
      recovery_r: r.balance_before ? r.collected / r.balance_before : null,
      cost_per_action: r.cost / r.actions, ptp_kept_r: r.ptp ? r.ptp_kept / r.ptp : null,
      action_share: r.dim === 'Total' ? 1 : r.actions / n.get(r.dim + '|' + r.division),
    }));
  },
});

dash.calc('roll_m', {
  inputs: ['roll_rates'],
  title: 'Roll-rate matrix',
  description: 'Share of each starting bucket’s outstanding principal that sits in each bucket one month later, over the 12 month-on-month moves Oct 2025 → Oct 2026.',
  fn: (roll_rates) => {
    const t = d3.rollup(roll_rates, (v) => d3.sum(v, (r) => r.outstanding), (r) => r.division + '|' + r.from);
    return roll_rates.map((r) => ({ ...r, id: r.division + '|' + r.from + '|' + r.to, share: r.outstanding / t.get(r.division + '|' + r.from) }));
  },
});

dash.calc('roll_sum', {
  inputs: ['roll_rates'],
  title: 'Forward roll and cure rates',
  description: 'Of delinquent principal (1–90+ DPD), the share that moved to a worse bucket or was written off (forward roll) and the share that returned to current or repaid (cure); plus current principal rolling into 1+ DPD.',
  fn: (roll_rates) => {
    const B = ['Current', '1–7 DPD', '8–30 DPD', '31–60 DPD', '61–90 DPD', '90+ DPD'];
    return [...d3.group(roll_rates, (r) => r.division)].map(([division, v]) => {
      const delq = v.filter((r) => r.from !== 'Current');
      const base = d3.sum(delq, (r) => r.outstanding);
      const worse = d3.sum(delq.filter((r) => r.to === 'Written off' || (B.indexOf(r.to) > B.indexOf(r.from))), (r) => r.outstanding);
      const cured = d3.sum(delq.filter((r) => r.to === 'Current' || r.to === 'Repaid / closed'), (r) => r.outstanding);
      const cur = v.filter((r) => r.from === 'Current');
      const curDelq = d3.sum(cur.filter((r) => B.indexOf(r.to) > 0), (r) => r.outstanding);
      return { division, forward_r: worse / base, cure_r: cured / base, current_to_delq_r: curDelq / d3.sum(cur, (r) => r.outstanding) };
    });
  },
});

dash.calc('risk_m', {
  inputs: ['risk_segments'],
  title: 'Model risk segment totals',
  description: 'Loans, exposure and early-warning flags per predicted-PD segment, with a total and a High + Very high total for each group.',
  fn: (risk_segments) => {
    const out = [];
    for (const [key, v] of d3.group(risk_segments, (r) => r.dim + '|' + r.group)) {
      const [dim, group] = key.split('|');
      const exp = d3.sum(v, (r) => r.exposure);
      const loans = d3.sum(v, (r) => r.loans);
      const hi = v.filter((r) => r.segment === 'High risk' || r.segment === 'Very high risk');
      v.forEach((r) => out.push({ ...r, id: dim + '|' + group + '|' + r.segment, exposure_share: r.exposure / exp, loan_share: r.loans / loans }));
      out.push({
        dim, group, segment: 'All', id: dim + '|' + group + '|All', loans, exposure: exp,
        avg_pd: d3.sum(v, (r) => r.avg_pd * r.loans) / loans,
        ews_loans: d3.sum(v, (r) => r.ews_loans), ews_exposure: d3.sum(v, (r) => r.ews_exposure),
        high_loans: d3.sum(hi, (r) => r.loans), high_exposure: d3.sum(hi, (r) => r.exposure),
        high_share: d3.sum(hi, (r) => r.exposure) / exp,
      });
    }
    return out;
  },
});

dash.calc('vin_m', {
  inputs: ['vintages'],
  title: 'Vintage default rates',
  description: 'Cumulative share of loans (and of principal) that reached 90+ DPD by each month on book; blank where the youngest loan in the cohort has not yet reached that month on book.',
  fn: (vintages) => vintages.map((r) => ({
    ...r, id: [r.type, r.division, r.cohort, r.group, r.mob].join('|'),
    rate: r.observed ? r.defaults / r.loans : null,
    amt_rate: r.observed ? r.def_amt / r.disb : null,
  })),
});

dash.calc('insights', {
  inputs: ['seg_m', 'geo_m', 'bands'],
  title: 'Leaders and laggards',
  description: 'For each division filter: the largest exposure, and the occupation, product, tenure and loan-size segments that lead or lag on each measure (occupations with under 2% of the book are excluded from risk-ratio rankings).',
  fn: (seg_m, geo_m, bands) => {
    const out = [];
    const divs = ['All', ...new Set(geo_m.filter((r) => r.level === 'division').map((r) => r.division))];
    const top = (rows, f, min) => rows.filter((r) => r[f] != null && (!min || min(r))).sort((a, b) => b[f] - a[f])[0];
    const low = (rows, f) => rows.filter((r) => r[f] != null).sort((a, b) => a[f] - b[f])[0];
    divs.forEach((division) => {
      const add = (item, r, f, name = r && r.segment) => r && out.push({ division, item, id: division + '|' + item, name, value: r[f] });
      const geo = division === 'All' ? geo_m.filter((r) => r.level === 'division') : geo_m.filter((r) => r.level === 'district' && r.division === division);
      const gt = d3.sum(geo, (r) => r.glp);
      const g = top(geo, 'glp');
      if (g) out.push({ division, item: 'top_geo', id: division + '|top_geo', name: g.name, value: g.glp / gt });
      const s = (dim) => seg_m.filter((r) => r.dim === dim && r.division === division);
      const occ = s('Occupation');
      const big = (r) => r.glp_share >= 0.02;
      add('worst_occ', top(occ, 'par30_r', big), 'par30_r');
      add('occ_loans', top(occ, 'loans'), 'loans');
      add('occ_avg', top(occ, 'avg_loan'), 'avg_loan');
      add('occ_glp', top(occ, 'glp'), 'glp');
      add('occ_repeat', top(occ, 'repeat_r'), 'repeat_r');
      add('occ_ontime', top(occ, 'ontime_r'), 'ontime_r');
      add('occ_par30', top(occ, 'par30_r', big), 'par30_r');
      add('occ_npl', top(occ, 'npl_r', big), 'npl_r');
      add('occ_ecl', top(occ, 'ecl'), 'ecl');
      add('occ_def', top(occ, 'def12_r'), 'def12_r');
      add('occ_best', low(occ, 'def12_r'), 'def12_r');
      add('prod_ecl', top(s('Product'), 'ecl'), 'ecl');
      add('prod_def', top(s('Product'), 'def12_r'), 'def12_r');
      add('prod_rar', top(s('Product'), 'rar'), 'rar');
      add('tenure_def', top(s('Loan tenure'), 'def12_r'), 'def12_r');
      add('band_rar_best', top(s('Loan amount band'), 'rar'), 'rar');
      add('band_rar_worst', low(s('Loan amount band'), 'rar'), 'rar');
      const bt = s('Borrower type');
      ['New', 'Repeat'].forEach((t) => {
        const r = bt.find((x) => x.segment === t);
        add(t.toLowerCase() + '_avg', r, 'avg_loan');
        add(t.toLowerCase() + '_def', r, 'def12_r');
      });
      const b = (dim, band) => bands.find((r) => r.dim === dim && r.division === division && r.band === band);
      [['lti_hi', 'Loan-to-income', '>2×'], ['lti_lo', 'Loan-to-income', '≤0.25×'], ['dti_hi', 'Debt-to-income', '0.41–0.50'], ['dti_lo', 'Debt-to-income', '0.21–0.30']].forEach(([item, dim, band]) => {
        const r = b(dim, band);
        if (r && r.mature_loans) out.push({ division, item, id: division + '|' + item, name: band, value: r.def12 / r.mature_loans });
      });
    });
    return out;
  },
});

dash.calc('actions', {
  inputs: ['geo_m', 'seg_m', 'kpi', 'bands', 'roll_sum', 'risk_m', 'ageing'],
  title: 'Recommendation engine',
  description: 'Rules with fixed thresholds that test the selected data and, where a rule fires, state the finding, its evidence against a benchmark, a risk level and a proposed action.',
  fn: (geo_m, seg_m, kpi, bands, roll_sum, risk_m, ageing) => {
    const P = d3.format('.1%');
    const B = (v) => '৳' + new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    const out = [];
    const divs = ['All', ...new Set(geo_m.filter((r) => r.level === 'division').map((r) => r.division))];
    divs.forEach((division) => {
      const add = (rule, o) => out.push({ division, id: division + '|' + rule, rule, ...o, risk_rank: { High: 1, Medium: 2, Low: 3 }[o.risk] });
      const all = geo_m.find((r) => r.id === 'all');
      const scope = division === 'All' ? all : geo_m.find((r) => r.id === 'division:' + division);
      const k = kpi.find((r) => r.division === division);
      const dists = geo_m.filter((r) => r.level === 'district' && (division === 'All' || r.division === division)).sort((a, b) => b.glp - a.glp);
      const names = (rs) => rs.slice(0, 3).map((r) => r.name).join(', ');
      const hh = dists.filter((r) => r.quadrant === 'High growth / High risk');
      if (hh.length) add('geo_hh', { area: 'Geography', finding: hh.length + ' districts combine above-median growth with NPL above the portfolio ratio', evidence: 'Largest: ' + names(hh) + '; ' + hh[0].name + ' NPL ' + P(hh[0].npl_r) + ', growth ' + P(hh[0].growth), kpi: 'Gross NPL ratio', actual: hh[0].npl_r, benchmark: all.npl_r, unit: 'pct', risk: 'High', action: 'Cap first-loan limits and add pre-due reminders in ' + names(hh) + ' before further acquisition campaigns', impact: 'Slows NPL formation where new lending is fastest', limitation: 'A young, fast-growing book shows NPL with a lag; recheck after 6 months on book' });
      const ex = dists.filter((r) => r.quadrant === 'High growth / Low risk' && r.rar >= all.rar && r.ce >= all.ce);
      if (ex.length) add('geo_expand', { area: 'Geography', finding: ex.length + ' districts grow fast with below-portfolio NPL, above-average contribution and collection', evidence: 'Largest: ' + names(ex) + '; ' + ex[0].name + ' risk-adjusted return ' + P(ex[0].rar), kpi: 'Risk-adjusted return', actual: ex[0].rar, benchmark: all.rar, unit: 'pct', risk: 'Low', action: 'Pilot graduated limits for repeat borrowers in ' + names(ex) + ' after checking agent coverage and collection capacity', impact: 'Grows contribution where losses and collection are favourable', limitation: 'Return is an analytical estimate (4.5% cost of funds, no operating cost)' });
      if (k && k.ce_chg < -0.002) add('ce_down', { area: 'Collections', finding: 'Collection efficiency fell year on year', evidence: P(k.ce) + ' over Aug 2025–Jul 2026 vs ' + P(k.ce_prev) + ' a year earlier', kpi: 'Collection efficiency', actual: k.ce, benchmark: k.ce_prev, unit: 'pct', risk: 'Medium', action: 'Review auto-debit sweep timing and tele-collection coverage for early buckets', impact: 'Recovers scheduled cash before accounts age', limitation: 'Months after Jul 2026 are excluded until repayments settle' });
      const occ = seg_m.filter((r) => r.dim === 'Occupation' && r.division === division);
      const port = seg_m.filter((r) => r.dim === 'Product' && r.division === division);
      const pdef = d3.sum(port, (r) => r.def12) / d3.sum(port, (r) => r.mature_loans);
      const prar = d3.sum(port, (r) => r.contribution) / d3.sum(port, (r) => r.disb);
      const prep = d3.sum(port, (r) => r.repeat_loans) / d3.sum(port, (r) => r.loans);
      const bad = occ.filter((r) => r.def12_r > 1.5 * pdef && r.loan_share >= 0.02).sort((a, b) => b.def12_r - a.def12_r);
      if (bad.length) add('occ_bad', { area: 'Customers', finding: bad.map((r) => r.segment).slice(0, 3).join(', ') + ' default at over 1.5× the portfolio rate', evidence: bad[0].segment + ' 12-month default ' + P(bad[0].def12_r) + ' vs ' + P(pdef), kpi: '12-month default rate', actual: bad[0].def12_r, benchmark: pdef, unit: 'pct', risk: 'High', action: 'Lower starting limits and require two on-time cycles before limit increases for these occupations', impact: 'Reduces first-cycle losses without excluding the segment', limitation: 'Occupation is self-declared; differences may reflect income stability rather than occupation' });
      const good = occ.filter((r) => r.def12_r < 0.75 * pdef && r.repeat_r >= prep).sort((a, b) => b.glp - a.glp);
      if (good.length) add('occ_good', { area: 'Customers', finding: good.map((r) => r.segment).slice(0, 3).join(', ') + ' repay reliably and return as repeat borrowers', evidence: good[0].segment + ' 12-month default ' + P(good[0].def12_r) + ', repeat rate ' + P(good[0].repeat_r), kpi: '12-month default rate', actual: good[0].def12_r, benchmark: pdef, unit: 'pct', risk: 'Low', action: 'Offer pre-approved graduated limit increases to performing repeat borrowers in these occupations', impact: 'Grows low-risk volume and retention', limitation: 'Past performance in a growing market may not hold in a downturn' });
      const pw = port.filter((r) => r.def12_r != null).sort((a, b) => b.def12_r - a.def12_r)[0];
      if (pw && pw.def12_r > pdef) add('prod', { area: 'Products', finding: pw.segment + ' has the highest 12-month default rate of any product', evidence: P(pw.def12_r) + ' default vs ' + P(pdef) + ' portfolio; risk-adjusted return ' + P(pw.rar) + ' vs ' + P(prar), kpi: '12-month default rate', actual: pw.def12_r, benchmark: pdef, unit: 'pct', risk: pw.rar < prar ? 'High' : 'Medium', action: pw.rar < prar ? 'Reprice or cap ' + pw.segment + ' and route first-time borrowers to smaller products' : 'Keep pricing under review; the return still covers the extra loss', impact: 'Aligns price with realised loss', limitation: 'Product mix differs across borrower types; compare within borrower type before repricing' });
      const bd = (band) => bands.find((r) => r.dim === 'Debt-to-income' && r.division === division && r.band === band);
      const hiB = [bd('0.41–0.50'), bd('>0.50')].filter(Boolean);
      const loB = [bd('≤0.20'), bd('0.21–0.30')].filter(Boolean);
      const hr = d3.sum(hiB, (r) => r.def12) / d3.sum(hiB, (r) => r.mature_loans);
      const lr = d3.sum(loB, (r) => r.def12) / d3.sum(loB, (r) => r.mature_loans);
      if (hr > 1.3 * lr) add('dti', { area: 'Credit policy', finding: 'Borrowers with debt-to-income above 0.40 default far more often', evidence: P(hr) + ' 12-month default above 0.40 vs ' + P(lr) + ' at 0.30 or below', kpi: '12-month default rate', actual: hr, benchmark: lr, unit: 'pct', risk: 'High', action: 'Enforce a 0.40 debt-to-income cap for first-time borrowers; scale down amounts in the 0.30–0.40 band', impact: 'Removes the steepest part of the default curve', limitation: 'Debt-to-income is estimated from wallet income, not verified payslips' });
      const bt = seg_m.filter((r) => r.dim === 'Borrower type' && r.division === division);
      const nw = bt.find((r) => r.segment === 'New');
      const rp = bt.find((r) => r.segment === 'Repeat');
      if (nw && rp && nw.def12_r > 1.5 * rp.def12_r) add('repeat', { area: 'Credit policy', finding: 'First-time borrowers default at ' + d3.format('.1f')(nw.def12_r / rp.def12_r) + '× the repeat-borrower rate', evidence: P(nw.def12_r) + ' new vs ' + P(rp.def12_r) + ' repeat; repeat average loan ' + B(rp.avg_loan) + ' vs ' + B(nw.avg_loan), kpi: '12-month default rate', actual: nw.def12_r, benchmark: rp.def12_r, unit: 'pct', risk: 'Medium', action: 'Keep first loans small and graduate limits only after on-time cycles', impact: 'Converts first-cycle losses into a qualified repeat base', limitation: 'Repeat borrowers are pre-selected by earlier repayment (survivorship)' });
      const ag = ageing.filter((r) => r.division === division);
      const early = ag.filter((r) => r.bucket === '1–7 DPD' || r.bucket === '8–30 DPD');
      const eo = d3.sum(early, (r) => r.outstanding);
      if (eo > 0) add('early', { area: 'Collections', finding: d3.format(',')(d3.sum(early, (r) => r.loans)) + ' loans sit 1–30 days past due, approaching the 30 DPD threshold', evidence: B(eo) + ' outstanding in 1–30 DPD (' + P(eo / k.glp) + ' of the book)', kpi: 'Outstanding 1–30 DPD', actual: eo, benchmark: k.glp, unit: 'bdt', risk: eo / k.glp > 0.01 ? 'High' : 'Medium', action: 'Daily call queue for 1–7 DPD and assisted collection for 8–30 DPD, ordered by outstanding', impact: 'Early buckets cure most cheaply', limitation: 'Ageing uses recorded DPD at 31 Oct 2026' });
      const rs = roll_sum.find((r) => r.division === division);
      if (rs && rs.forward_r > 0.2) add('roll', { area: 'Collections', finding: 'Delinquent principal rolls forward more often than it cures', evidence: 'Forward roll ' + P(rs.forward_r) + ' vs cure ' + P(rs.cure_r) + ' per month (Oct 2025–Oct 2026)', kpi: 'Forward roll rate', actual: rs.forward_r, benchmark: rs.cure_r, unit: 'pct', risk: rs.forward_r > rs.cure_r ? 'High' : 'Medium', action: 'Escalate 31–60 DPD accounts to assisted collection and offer restructuring before 60 DPD', impact: 'Cuts migration into 90+ DPD and write-off', limitation: 'Roll rates are by principal; small samples in some divisions' });
      const rk = risk_m.find((r) => r.id === (division === 'All' ? 'All|All|All' : 'Division|' + division + '|All'));
      if (rk && rk.ews_loans) add('ews', { area: 'Collections', finding: d3.format(',')(rk.ews_loans) + ' performing loans are flagged by the early-warning model', evidence: B(rk.ews_exposure) + ' outstanding flagged for a likely late or missed instalment within 30 days', kpi: 'Flagged exposure', actual: rk.ews_exposure, benchmark: rk.exposure, unit: 'bdt', risk: 'Medium', action: 'Pre-due wallet balance check, reminder and auto-debit retry 48 hours before the due date for flagged loans', impact: 'Prevents first delinquency on the riskiest performing loans', limitation: 'Model precision is about 1 in 4 at this threshold (see Predictive analytics)' });
      if (scope && scope.npl_r > all.npl_r * 1.2) add('div_npl', { area: 'Geography', finding: 'This division’s NPL ratio is over 1.2× the portfolio ratio', evidence: P(scope.npl_r) + ' vs ' + P(all.npl_r), kpi: 'Gross NPL ratio', actual: scope.npl_r, benchmark: all.npl_r, unit: 'pct', risk: 'High', action: 'Add field recovery capacity and tighten approval cut-offs locally', impact: 'Brings the division back toward portfolio quality', limitation: 'Small books move more from a few large defaults' });
    });
    return out;
  },
});

dash.calc('fin', {
  inputs: ['segments'],
  title: 'Profitability estimate by division',
  description: 'Interest received, fees, cost of funds (4.5% a year on principal over the tenure), current ECL and recovery cost summed over all products; net contribution and ratios to disbursed principal. An analytical estimate without operating cost.',
  fn: (segments) => [...d3.group(segments.filter((r) => r.dim === 'Product'), (r) => r.division)].map(([division, v]) => {
    const s = (k) => d3.sum(v, (r) => r[k]);
    const nii = s('interest') + s('fee') - s('cof');
    const contribution = nii - s('ecl') - s('rec_cost');
    return {
      division, interest: s('interest'), fee: s('fee'), cof: s('cof'), ecl: s('ecl'), rec_cost: s('rec_cost'), disb: s('disb'),
      nii, contribution, credit_cost_r: (s('ecl') + s('rec_cost')) / s('disb'), rar: contribution / s('disb'),
    };
  }),
});
