// Navigation, filters, and drawings for Overview, Geography, Customers and Products.
(() => {
  const T = window.TP;
  const f = T.f;
  const enc = T.enc;
  const P = () => dash.params();

  // ---- navigation and controls (only listen and set state attributes) ----
  const show = (id) => {
    document.querySelectorAll('.tp-page').forEach((s) => (s.hidden = s.id !== id));
    document.querySelectorAll('.tp-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === id)));
    dash.setLink(id);
  };
  T.show = show;
  document.querySelectorAll('.tp-tab').forEach((b) => b.addEventListener('click', () => show(b.dataset.tab)));
  const named = document.getElementById(location.hash.slice(1));
  show(named && named.classList.contains('tp-page') ? named.id : 'story');
  document.querySelectorAll('.tp-reset').forEach((b) => b.addEventListener('click', () => dash.resetParams()));
  document.querySelectorAll('.tp-clear-dist').forEach((b) => b.addEventListener('click', () => dash.setParams({ district: null })));
  document.querySelectorAll('[data-metric]').forEach((b) => b.addEventListener('click', () => dash.setParams({ geoMetric: b.dataset.metric })));
  document.querySelectorAll('#seg-dims [data-dim]').forEach((b) => b.addEventListener('click', () => dash.setParams({ segDim: b.dataset.dim })));
  document.querySelectorAll('[data-fy]').forEach((b) => b.addEventListener('click', () => dash.setParams({ fy: b.dataset.fy })));
  dash.onData(() => {
    const p = P();
    document.querySelectorAll('[data-metric]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.metric === (p.geoMetric || 'glp'))));
    document.querySelectorAll('#seg-dims [data-dim]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dim === (p.segDim || 'Gender'))));
    document.querySelectorAll('[data-fy]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.fy === (p.fy || 'All'))));
    document.querySelectorAll('#t-upz').forEach((s) => (s.hidden = !p.district));
  });
  const setDiv = (d) => dash.setParams({ division: d === T.div() ? 'All' : d, district: null });
  T.setDiv = setDiv;

  // ---- orders ----
  T.ORDER = {
    'Age group': ['18–24', '25–34', '35–44', '45–54', '55+'],
    'Income bracket': ['Below ৳15k', '৳15k–30k', '৳30k–50k', '৳50k–100k', '৳100k+'],
    'Account tenure': ['Under 1 yr', '1–2 yrs', '2–4 yrs', '4–6 yrs', '6+ yrs'],
    'Loan amount band': ['Below ৳1,000', '৳1,000–5,000', '৳5,001–10,000', '৳10,001–20,000', '৳20,001–30,000', '৳30,001–50,000', '৳50,001–100,000'],
    'Loan tenure': ['1 month', '2 months', '3 months', '6 months', '9 months', '12 months'],
    'Risk grade at origination': ['A', 'B', 'C', 'D', 'E', 'F'],
    'Credit score': ['Below 550', '550–599', '600–649', '650–699', '700–749', '750–799', '800+'],
    'Debt-to-income': ['≤0.20', '0.21–0.30', '0.31–0.40', '0.41–0.50', '>0.50'],
    'Loan-to-income': ['≤0.25×', '0.25–0.5×', '0.5–1×', '1–2×', '>2×'],
    Education: ['Primary/Secondary', 'SSC', 'HSC', 'Graduate', 'Post-Graduate'],
  };
  T.sortBy = (rows, dim, key = 'segment', fallback = 'loans') => {
    const o = T.ORDER[dim];
    return [...rows].sort((a, b) => (o ? (o.indexOf(a[key]) + 99 * (o.indexOf(a[key]) < 0)) - (o.indexOf(b[key]) + 99 * (o.indexOf(b[key]) < 0)) : b[fallback] - a[fallback]));
  };
  T.seg = (rows, dim, div = T.div()) => rows.filter((r) => r.dim === dim && r.division === div);
  const badColor = () => T.c.bad;
  const signColor = (v) => (v >= 0 ? T.c.teal : T.c.bad);
  T.signColor = signColor;
  const months = (rows, from, to, div = T.div()) => rows.filter((r) => r.division === div && r.month >= from && (!to || r.month <= to)).sort((a, b) => (a.month < b.month ? -1 : 1));
  T.months = months;
  const md = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1));
  T.md = md;
  const short = (s, n = 24) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
  T.short = short;

  // ---- header ----
  dash.draw('divsel', (sel) => {
    const g = dash.data('geo_m');
    const divs = g.status === 'ok' ? g.data.filter((r) => r.level === 'division').map((r) => r.name).sort() : [];
    sel.replaceChildren(new Option('All divisions', 'All'), ...divs.map((d) => new Option(d, d)));
    sel.value = T.div();
    sel.onchange = () => dash.setParams({ division: sel.value, district: null });
  });
  dash.draw('chip', (el) => {
    const rows = T.get(el, 'geo_m', true);
    if (!rows) return;
    const r = rows.find((x) => x.id === T.gid());
    el.replaceChildren(T.icon('briefcase'), T.mk('span', 'geo_m', 'name', 'id=' + enc(T.gid()), r ? r.name : '—'));
    if (P().district) el.append(T.el('span', 'tp-chip-x', ' › ' + P().district));
  });

  // ---- overview ----
  dash.draw('c_disb', (el) => {
    const rows = T.get(el, 'mon_m');
    if (!rows) return;
    const fm = d3.utcFormat('%b %Y');
    T.cols(el, months(rows, '2021-01').map((r) => ({
      label: fm(md(r.month)), y: r.disb_amt, color: r.month >= '2026-01' ? T.c.teal : T.c.sky,
      tip: [{ name: 'Disbursed', value: f.bdt(r.disb_amt) }, { name: 'Loans', value: f.num(r.disb_cnt) }],
    })), { yfmt: f.bdt, height: 230, pad: 0.15 });
  });
  dash.draw('c_glp', (el) => {
    const rows = T.get(el, 'mon_m');
    if (!rows) return;
    const m = months(rows, '2021-01');
    T.line(el, [
      { name: 'GLP', color: T.c.teal, values: m.map((r) => ({ x: md(r.month), y: r.glp })) },
      { name: 'ECL', color: T.c.gold, values: m.map((r) => ({ x: md(r.month), y: r.ecl })) },
    ], { yfmt: f.bdt });
  });
  dash.draw('c_annual', (el) => {
    const rows = T.get(el, 'mon_m');
    if (!rows) return;
    const yr = d3.rollups(months(rows, '2021-01'), (v) => d3.sum(v, (r) => r.disb_amt), (r) => r.month.slice(0, 4));
    T.cols(el, yr.map(([y, v], i) => {
      const g = i ? v / yr[i - 1][1] - 1 : null;
      return { label: y === '2026' ? '2026 YTD' : y, y: v, g, color: y === '2026' ? T.c.teal : T.c.sky, tip: [{ name: 'Disbursed', value: f.bdt(v) }, { name: 'Growth', value: g == null ? '—' : f.chg(g) }] };
    }), { yfmt: f.bdt, height: 230, labels: (d) => (d.g == null ? '' : f.chg(d.g)) });
  });
  dash.draw('c_quality', (el) => {
    const rows = T.get(el, 'mon_m');
    if (!rows) return;
    const m = months(rows, '2021-07');
    const s = (name, k, color) => ({ name, color, values: m.map((r) => ({ x: md(r.month), y: r[k] })) });
    T.line(el, [s('PAR 1', 'par1_r', T.c.sky), s('PAR 7', 'par7_r', T.c.teal), s('PAR 30', 'par30_r', T.c.gold), s('NPL', 'npl_r', T.c.bad)], { yfmt: f.pct, height: 260 });
  });
  const MIX = {
    Product: [['Disbursed', 'disb', f.bdt], ['Share of book', 'glp_share', f.pct], ['12-month default', 'def12_r', f.pct, badColor]],
    'Risk grade at origination': [['Outstanding', 'glp', f.bdt], ['Share of book', 'glp_share', f.pct], ['12-month default', 'def12_r', f.pct, badColor]],
    'Borrower type': [['Disbursed', 'disb', f.bdt], ['Average loan', 'avg_loan', f.bdt], ['12-month default', 'def12_r', f.pct, badColor]],
    'Loan purpose': [['Disbursed', 'disb', f.bdt], ['Share', 'disb_share', f.pct], ['12-month default', 'def12_r', f.pct, badColor]],
    'Urban / rural': [['NPL ratio', 'npl_r', f.pct2, badColor], ['PAR 30', 'par30_r', f.pct2, badColor], ['Collection eff.', 'ce', f.pct]],
  };
  dash.draw('c_mix', (el) => {
    const rows = T.get(el, 'seg_m');
    if (!rows) return;
    const dim = el.dataset.dim;
    const r = T.sortBy(T.seg(rows, dim), dim, 'segment', 'disb');
    T.btable(el, r.map((x) => ({ ...x, label: x.segment })), MIX[dim].map(([label, k, fmt, color]) => ({ label, f: k, fmt, color })));
  });

  // ---- geography ----
  const METRIC = { disb_ttm: [f.bdt, 'up'], glp: [f.bdt, 'up'], npl_r: [f.pct2, 'risk'], par30_r: [f.pct2, 'risk'], ce: [f.pct, 'low'] };
  dash.draw('c_map', (el) => {
    const geo = T.all(el, ['geo_m', 'bd_map']);
    if (!geo) return;
    const [rows, shapes] = geo;
    const k = P().geoMetric || 'glp';
    const [fmt, kind] = METRIC[k];
    const divs = new Map(rows.filter((r) => r.level === 'division').map((r) => [r.name, r]));
    const vw = shapes[0].w;
    const vh = shapes[0].h;
    const W = Math.max(280, el.clientWidth);
    const sc = Math.min(W / vw, 480 / vh);
    const H = vh * sc;
    const ox = (W - vw * sc) / 2;
    el.replaceChildren();
    const svg = d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'tp-svg');
    const vals = [...divs.values()].map((r) => r[k]);
    const [lo, hi] = d3.extent(vals);
    const t = (v) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);
    const color = kind === 'up' ? T.c.teal : T.c.bad;
    const tip = T.tip(el);
    const g = svg.append('g').attr('transform', `translate(${ox},0) scale(${sc})`);
    shapes.forEach((sh) => {
      const r = divs.get(sh.division);
      if (!r) return;
      const s = kind === 'low' ? 1 - t(r[k]) : t(r[k]);
      g.append('path').attr('d', sh.path).attr('fill', color).attr('fill-opacity', 0.12 + s * 0.78)
        .attr('class', r.division === T.div() ? 'tp-region is-sel' : 'tp-region').attr('vector-effect', 'non-scaling-stroke')
        .style('cursor', 'pointer').on('click', () => setDiv(r.name))
        .on('pointermove', (ev) => {
          const [mx, my] = d3.pointer(ev, el);
          tip.show(mx, my, r.name, [{ name: 'Disbursed (12m)', value: f.bdt(r.disb_ttm) }, { name: 'Growth', value: f.chg(r.growth) }, { name: 'Outstanding', value: f.bdt(r.glp) }, { name: 'NPL ratio', value: f.pct2(r.npl_r) }, { name: 'PAR 30', value: f.pct2(r.par30_r) }, { name: 'Collection eff.', value: f.pct(r.ce) }]);
        })
        .on('pointerleave', () => tip.hide());
    });
    // labels: name over value at each centroid, pushed apart where they would collide
    const labs = shapes.filter((sh) => divs.has(sh.division)).map((sh) => {
      const r = divs.get(sh.division);
      const lg = svg.append('g');
      lg.append('text').attr('class', 'tp-map-n').attr('y', -2).attr('text-anchor', 'middle').text(r.name);
      lg.append('text').attr('class', 'tp-map-v').attr('y', 12).attr('text-anchor', 'middle').text(fmt(r[k]));
      const b = lg.node().getBBox();
      return { lg, x: ox + sh.cx * sc, y: sh.cy * sc, w: b.width + 6, h: b.height + 2 };
    }).sort((a, b) => a.y - b.y);
    for (let pass = 0; pass < 30; pass++) {
      for (let i = 0; i < labs.length; i++) {
        for (let j = i + 1; j < labs.length; j++) {
          const a = labs[i];
          const c = labs[j];
          const ox2 = (a.w + c.w) / 2 - Math.abs(a.x - c.x);
          const oy = (a.h + c.h) / 2 - Math.abs(a.y - c.y);
          if (ox2 > 0 && oy > 0) {
            const d = oy / 2 + 1;
            if (a.y <= c.y) { a.y -= d; c.y += d; } else { a.y += d; c.y -= d; }
          }
        }
      }
    }
    labs.forEach((l) => l.lg.attr('transform', `translate(${l.x},${Math.max(14, Math.min(H - 16, l.y))})`));
  });
  const DIVS = ['Barishal', 'Chattogram', 'Dhaka', 'Khulna', 'Mymensingh', 'Rajshahi', 'Rangpur', 'Sylhet'];
  T.divColor = (d) => {
    const pal = [T.c.teal, T.c.gold, '#5B6CC2', '#C2185B', '#15966B', '#8E5BC2', '#E9733B', '#4A90A4'];
    return pal[Math.max(0, DIVS.indexOf(d))];
  };
  dash.draw('c_quad', (el) => {
    const rows = T.get(el, 'geo_m');
    if (!rows) return;
    const d = rows.filter((r) => r.level === 'district' && r.growth != null);
    const all = rows.find((r) => r.id === 'all');
    const div = T.div();
    T.scatter(el, d.map((r) => ({
      x: r.growth, y: r.npl_r, r: r.glp, label: r.name, color: T.divColor(r.division), dim: div !== 'All' && r.division !== div, division: r.division, district: r.name,
      tip: [{ name: 'Division', value: r.division }, { name: 'Growth', value: f.chg(r.growth) }, { name: 'NPL ratio', value: f.pct2(r.npl_r) }, { name: 'Outstanding', value: f.bdt(r.glp) }, { name: 'Quadrant', value: r.quadrant }],
    })), {
      xfmt: f.pct0, yfmt: f.pct, xlab: 'Disbursement growth, last 12 months', ylab: 'NPL ratio', xref: d3.median(d, (r) => r.growth), yref: all.npl_r,
      quads: ['Low growth · high risk', 'High growth · high risk', 'Low growth · low risk', 'High growth · low risk'], label: 8, height: 360,
      onClick: (p) => dash.setParams({ division: p.division, district: p.district }),
    });
  });
  const GEO_COLS = [
    { f: 'name', label: 'District' }, { f: 'division', label: 'Division' },
    { f: 'disb_ttm', label: 'Disbursed 12m', fmt: f.bdt, num: 1 }, { f: 'growth', label: 'Growth', fmt: f.chg, num: 1 },
    { f: 'glp', label: 'Outstanding', fmt: f.bdt, num: 1 }, { f: 'npl_r', label: 'NPL', fmt: f.pct2, num: 1, heat: 'bad' },
    { f: 'par30_r', label: 'PAR 30', fmt: f.pct2, num: 1, heat: 'bad' }, { f: 'ce', label: 'Coll. eff.', fmt: f.pct, num: 1, heat: 'good' },
    { f: 'borrowers', label: 'Borrowers', fmt: f.num, num: 1 }, { f: 'penetration', label: 'Penetration', fmt: f.pct, num: 1 },
    { f: 'urban_share', label: 'Urban share', fmt: f.pct0, num: 1 }, { f: 'quadrant', label: 'Quadrant' },
  ];
  dash.draw('t_dist', (el) => {
    const rows = T.get(el, 'geo_m');
    if (!rows) return;
    const div = T.div();
    T.table(el, rows.filter((r) => r.level === 'district' && (div === 'All' || r.division === div)), GEO_COLS, {
      sort: 'glp', sel: (r) => r.name === P().district, onRow: (r) => dash.setParams({ division: r.division, district: r.name }),
    });
  });
  dash.draw('t_upz', (el) => {
    const rows = T.get(el, 'geo_m');
    if (!rows) return;
    const cols = GEO_COLS.map((c) => (c.f === 'name' ? { ...c, label: 'Upazila' } : c.f === 'division' ? { f: 'district', label: 'District' } : c));
    T.table(el, rows.filter((r) => r.level === 'upazila' && r.division === T.div() && r.district === P().district), cols, { sort: 'glp' });
  });
  dash.draw('c_div', (el) => {
    const rows = T.get(el, 'geo_m');
    if (!rows) return;
    const d = rows.filter((r) => r.level === 'division').sort((a, b) => b.npl_r - a.npl_r);
    T.btable(el, d.map((r) => ({ ...r, label: r.name, sel: r.name === T.div() })), [
      { label: 'NPL ratio', f: 'npl_r', fmt: f.pct2, color: badColor }, { label: 'PAR 30', f: 'par30_r', fmt: f.pct2, color: T.c.gold }, { label: 'Collection eff.', f: 'ce', fmt: f.pct },
    ], { onClick: (r) => setDiv(r.name) });
  });
  dash.draw('c_div_growth', (el) => {
    const rows = T.get(el, 'mon_m');
    if (!rows) return;
    const per = d3.rollups(rows.filter((r) => r.division !== 'All'), (v) => d3.sum(v, (r) => r.disb_amt), (r) => r.division, (r) => r.month.slice(0, 4));
    const max = d3.max(per, ([, ys]) => d3.max(ys, ([, v]) => v));
    el.replaceChildren();
    per.sort((a, b) => (a[0] < b[0] ? -1 : 1)).forEach(([div, ys]) => {
      const box = T.el('div', 'tp-mini' + (div === T.div() ? ' is-sel' : ''));
      const h = T.el('p', 'tp-mini-h', div);
      const c = T.el('div', 'tp-mini-c');
      box.append(h, c);
      el.append(box);
      T.cols(c, ys.map(([y, v]) => ({ label: y.slice(2), title: div + ' ' + y, y: v, color: T.divColor(div), tip: [{ name: 'Disbursed', value: f.bdt(v) }] })), { yfmt: f.bdt, height: 130, ymax: max, pad: 0.25 });
    });
  });

  // ---- customers ----
  const SEG_COLS = (label) => [
    { f: 'segment', label }, { f: 'borrowers', label: 'Borrowers', fmt: f.num, num: 1 }, { f: 'disb', label: 'Disbursed', fmt: f.bdt, num: 1 },
    { f: 'avg_loan', label: 'Avg loan', fmt: f.bdt, num: 1 }, { f: 'glp', label: 'Outstanding', fmt: f.bdt, num: 1 },
    { f: 'npl_r', label: 'NPL', fmt: f.pct2, num: 1, heat: 'bad' }, { f: 'par30_r', label: 'PAR 30', fmt: f.pct2, num: 1, heat: 'bad' },
    { f: 'ontime_r', label: 'On-time', fmt: f.pct, num: 1, heat: 'good' }, { f: 'def12_r', label: '12m default', fmt: f.pct, num: 1, heat: 'bad' },
  ];
  dash.draw('t_seg', (el) => {
    const rows = T.get(el, 'seg_m');
    if (!rows) return;
    let dim = el.dataset.dim;
    if (dim[0] === '@') dim = P()[dim.slice(1)] || 'Gender';
    if (el.__dim !== dim) el.__sort = { f: 'segment', dir: 1 };
    el.__dim = dim;
    T.table(el, T.seg(rows, dim), SEG_COLS(dim));
  });
  dash.draw('t_occ', (el) => {
    const rows = T.get(el, 'seg_m');
    if (!rows) return;
    T.table(el, T.seg(rows, 'Occupation'), [
      { f: 'segment', label: 'Occupation' }, { f: 'loans', label: 'Loans', fmt: f.num, num: 1 }, { f: 'disb', label: 'Disbursed', fmt: f.bdt, num: 1 },
      { f: 'avg_loan', label: 'Avg loan', fmt: f.bdt, num: 1 }, { f: 'glp', label: 'Outstanding', fmt: f.bdt, num: 1 },
      { f: 'repeat_r', label: 'Repeat', fmt: f.pct, num: 1 }, { f: 'ontime_r', label: 'On-time', fmt: f.pct, num: 1, heat: 'good' },
      { f: 'par30_r', label: 'PAR 30', fmt: f.pct2, num: 1, heat: 'bad' }, { f: 'npl_r', label: 'NPL', fmt: f.pct2, num: 1, heat: 'bad' },
      { f: 'def12_r', label: '12m default', fmt: f.pct, num: 1, heat: 'bad' }, { f: 'ecl', label: 'ECL', fmt: f.bdt, num: 1, heat: 'bad' },
    ], { sort: 'glp' });
  });
  dash.draw('c_occ', (el) => {
    const rows = T.get(el, 'seg_m');
    if (!rows) return;
    const o = T.seg(rows, 'Occupation');
    T.scatter(el, o.map((r) => ({
      x: r.avg_loan, y: r.npl_r, r: r.glp, label: short(r.segment, 22), color: T.c.teal,
      tip: [{ name: 'Average loan', value: f.bdt(r.avg_loan) }, { name: 'NPL ratio', value: f.pct2(r.npl_r) }, { name: 'Outstanding', value: f.bdt(r.glp) }, { name: '12m default', value: f.pct(r.def12_r) }],
    })), { xfmt: f.bdt, yfmt: f.pct, xlab: 'Average loan size', ylab: 'NPL ratio', xref: d3.sum(o, (r) => r.disb) / d3.sum(o, (r) => r.loans), yref: d3.sum(o, (r) => r.npl) / d3.sum(o, (r) => r.glp), label: 15, height: 360 });
  });
  const portDef = (rows) => {
    const p = T.seg(rows, 'Product');
    return { def: d3.sum(p, (r) => r.def12) / d3.sum(p, (r) => r.mature_loans), rep: d3.sum(p, (r) => r.repeat_loans) / d3.sum(p, (r) => r.loans) };
  };
  T.portDef = portDef;
  const liSeg = (r, field, fmt) => {
    const li = T.el('li');
    const w = 'id=' + enc(r.id);
    li.append(T.mk('span', 'seg_m', 'segment', w, r.segment), T.el('span', 'tp-q-sep', ' · '), T.mk('span', 'seg_m', field, w, fmt(r[field]), 'tp-q-v'));
    return li;
  };
  T.liSeg = liSeg;
  dash.draw('q_occ', (el) => {
    const rows = T.get(el, 'seg_m');
    if (!rows) return;
    const o = T.seg(rows, 'Occupation');
    const ms = d3.median(o, (r) => r.loan_share);
    const { def } = portDef(rows);
    const q = (r) => (r.loan_share >= ms ? 'h' : 'l') + (r.def12_r <= def ? 'g' : 'b');
    const pick = o.filter((r) => q(r) === el.dataset.q).sort((a, b) => b.loans - a.loans);
    el.replaceChildren(...pick.map((r) => liSeg(r, 'def12_r', f.pct)));
  });

  // ---- products ----
  dash.draw('c_funnel', (el) => {
    const rows = T.get(el, 'fun_m');
    if (!rows) return;
    const id = T.div() + '|' + (P().fy || 'All');
    const r = rows.find((x) => x.id === id);
    el.replaceChildren();
    if (!r) return;
    const steps = [['Applications', 'applications'], ['Approved', 'approved'], ['Disbursed', 'disbursed']];
    const losses = steps.map(([, k], i) => (i ? 1 - r[k] / r[steps[i - 1][1]] : 0));
    const worst = losses.indexOf(Math.max(...losses));
    const w = 'id=' + enc(id);
    steps.forEach(([lab, k], i) => {
      const row = T.el('div', 'tp-fun');
      const bar = T.el('div', 'tp-fun-b');
      bar.style.width = (r[k] / r.applications) * 100 + '%';
      row.append(T.el('span', 'tp-fun-l', lab), bar, T.mk('span', 'fun_m', k, w, f.num(r[k]), 'tp-fun-v'));
      if (i) {
        const lost = T.el('span', 'tp-fun-x' + (i === worst ? ' is-worst' : ''), '−' + f.pct(losses[i]) + ' from previous step');
        row.append(lost);
      }
      el.append(row);
    });
    const side = T.el('p', 'tp-fun-side');
    side.append('Rejected ', T.mk('b', 'fun_m', 'rejected', w, f.num(r.rejected)), ' · Withdrawn ', T.mk('b', 'fun_m', 'withdrawn', w, f.num(r.withdrawn)), ' · Pending ', T.mk('b', 'fun_m', 'pending', w, f.num(r.pending)));
    el.append(side);
  });
  dash.draw('c_rej', (el) => {
    const rows = T.get(el, 'rejections');
    if (!rows) return;
    const r = rows.filter((x) => x.division === T.div()).sort((a, b) => b.rejections - a.rejections);
    const t = d3.sum(r, (x) => x.rejections);
    T.btable(el, r.map((x) => ({ label: x.reason, n: x.rejections, s: x.rejections / t })), [{ label: 'Rejections', f: 'n', fmt: f.num, color: T.c.bad }, { label: 'Share', f: 's', fmt: f.pct, color: T.c.grey }]);
  });
  dash.draw('t_prod', (el) => {
    const rows = T.get(el, 'seg_m');
    if (!rows) return;
    T.table(el, T.seg(rows, 'Product'), [
      { f: 'segment', label: 'Product' }, { f: 'loans', label: 'Loans', fmt: f.num, num: 1 }, { f: 'disb', label: 'Disbursed', fmt: f.bdt, num: 1 },
      { f: 'avg_loan', label: 'Avg loan', fmt: f.bdt, num: 1 }, { f: 'rate', label: 'Rate', fmt: f.pct2, num: 1 }, { f: 'tenure', label: 'Tenure (mo)', fmt: f.dec1, num: 1 },
      { f: 'npl_r', label: 'NPL', fmt: f.pct2, num: 1, heat: 'bad' }, { f: 'par30_r', label: 'PAR 30', fmt: f.pct2, num: 1, heat: 'bad' },
      { f: 'def12_r', label: '12m default', fmt: f.pct, num: 1, heat: 'bad' }, { f: 'interest', label: 'Interest', fmt: f.bdt, num: 1 },
      { f: 'ecl', label: 'ECL', fmt: f.bdt, num: 1 }, { f: 'rar', label: 'Risk-adj. return', fmt: f.pct2, num: 1, heat: 'good' },
    ], { sort: 'disb' });
  });
  dash.draw('c_band', (el) => {
    const rows = T.get(el, 'seg_m');
    if (!rows) return;
    const dim = el.dataset.dim;
    T.btable(el, T.sortBy(T.seg(rows, dim), dim).map((r) => ({ ...r, label: r.segment })), [
      { label: 'Loans', f: 'loans', fmt: f.num, color: T.c.sky }, { label: '12m default', f: 'def12_r', fmt: f.pct, color: badColor }, { label: 'Risk-adj. return', f: 'rar', fmt: f.pct2, color: signColor },
    ]);
  });
  dash.draw('c_bands', (el) => {
    const rows = T.get(el, 'bands');
    if (!rows) return;
    const dim = el.dataset.dim;
    const r = T.sortBy(rows.filter((x) => x.dim === dim && x.division === T.div()), dim, 'band');
    T.btable(el, r.map((x) => ({ label: x.band, loans: x.loans, rate: x.mature_loans ? x.def12 / x.mature_loans : null })), [
      { label: 'Loans', f: 'loans', fmt: f.num, color: T.c.sky }, { label: '12m default', f: 'rate', fmt: f.pct, color: badColor },
    ], { head: dim });
  });
})();
