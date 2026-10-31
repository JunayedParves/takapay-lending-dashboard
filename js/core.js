// Shared helpers: formats, filters, marks, tooltips and chart primitives.
(() => {
  const T = (window.TP = {});
  const ok = (v) => v != null && isFinite(v);
  const cmp = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });
  T.ok = ok;
  T.c = { teal: '#137C8B', tealD: '#0B4F5C', gold: '#E3A008', good: '#15966B', warn: '#E9A23B', bad: '#D64545', grey: '#778399', sky: '#7FB7BF' };
  T.f = {
    bdt: (v) => (ok(v) ? '৳' + cmp.format(v) : '—'),
    num: (v) => (ok(v) ? d3.format(',.0f')(v) : '—'),
    cnum: (v) => (ok(v) ? cmp.format(v) : '—'),
    pct: (v) => (ok(v) ? d3.format('.1%')(v) : '—'),
    pct2: (v) => (ok(v) ? d3.format('.2%')(v) : '—'),
    pct0: (v) => (ok(v) ? d3.format('.0%')(v) : '—'),
    chg: (v) => (ok(v) ? (v >= 0 ? '+' : '') + d3.format('.1%')(v) : '—'),
    pp: (v) => (ok(v) ? (v >= 0 ? '+' : '−') + Math.abs(v * 100).toFixed(2) + ' pp' : '—'),
    dec: (v) => (ok(v) ? d3.format('.3f')(v) : '—'),
    dec1: (v) => (ok(v) ? d3.format('.1f')(v) : '—'),
    days: (v) => (ok(v) ? d3.format('.0f')(v) + ' days' : '—'),
    mo: (v) => (ok(v) ? d3.format('.1f')(v) + ' months' : '—'),
    text: (v) => (v == null || v === '' ? '—' : String(v)),
  };

  // ---- filters ----
  T.div = () => dash.params().division || 'All';
  T.gid = () => (T.div() === 'All' ? 'all' : 'division:' + T.div());
  T.enc = (s) => String(s).replace(/%/g, '%25').replace(/&/g, '%26').replace(/=/g, '%3D');
  T.fill = (tpl) => (tpl || '').replace(/\{(\w+)\}/g, (_, k) => T.enc({ div: T.div(), gid: T.gid(), fy: dash.params().fy || 'All', dist: dash.params().district || '', rk: T.div() === 'All' ? 'All|All' : 'Division|' + T.div() }[k] ?? ''));
  T.find = (rows, w) => {
    const c = (w ? w.split('&') : []).map((p) => p.split('=').map(decodeURIComponent));
    return rows.find((r) => c.every(([k, v]) => String(r[k]) === v));
  };
  T.where = (o) => Object.entries(o).map(([k, v]) => T.enc(k) + '=' + T.enc(v)).join('&');

  // ---- elements ----
  T.el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  T.mk = (tag, src, field, where, text, cls) => {
    const e = T.el(tag, cls, text);
    e.dataset.source = src;
    if (field) e.dataset.field = field;
    if (where) e.dataset.where = where;
    return e;
  };
  T.icon = (name, cls) => {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', cls || 'tp-i');
    s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    u.setAttribute('href', '#i-' + name);
    s.append(u);
    return s;
  };

  // rows of a source, or null after drawing its loading / failed state into el
  T.get = (el, id, blank) => {
    const d = dash.data(id);
    if (d.status === 'ok') {
      el.classList.remove('dash-skeleton');
      return d.data;
    }
    el.replaceChildren();
    if (blank) el.textContent = '—';
    if (d.status === 'loading') el.classList.add('dash-skeleton');
    else {
      el.classList.remove('dash-skeleton');
      if (d.status === 'error' && !blank) {
        const f = T.el('div', 'tp-failed');
        f.append(T.el('i'), 'Failed to load');
        el.append(f);
      }
    }
    return null;
  };
  T.all = (el, ids) => {
    const out = ids.map((id) => dash.data(id));
    const bad = out.find((d) => d.status !== 'ok');
    if (bad) return T.get(el, ids[out.indexOf(bad)]) && null;
    el.classList.remove('dash-skeleton');
    return out.map((d) => d.data);
  };

  // ---- tooltip ----
  T.tip = (el) => {
    el.style.position = 'relative';
    let t = el.querySelector(':scope > .tp-tip');
    if (!t) {
      t = T.el('div', 'tp-tip');
      el.append(t);
    }
    return {
      show(px, py, title, lines) {
        t.replaceChildren(T.el('div', 'tp-tip-h', title));
        lines.forEach((l) => {
          const r = T.el('div', 'tp-tip-r');
          if (l.color) {
            const s = T.el('i');
            s.style.background = l.color;
            r.append(s);
          }
          r.append(T.el('span', null, l.name), T.el('b', null, l.value));
          t.append(r);
        });
        t.style.display = 'block';
        const W = el.clientWidth;
        const tw = t.offsetWidth;
        let left = px + 14;
        if (left + tw > W) left = px - tw - 14;
        t.style.left = Math.max(0, left) + 'px';
        t.style.top = Math.max(0, py - t.offsetHeight - 10) + 'px';
      },
      hide() {
        t.style.display = 'none';
      },
    };
  };

  T.measure = (svg, texts, cls = 'tp-tick') => {
    const g = svg.append('g');
    let w = 0;
    texts.forEach((s) => (w = Math.max(w, g.append('text').attr('class', cls).text(s).node().getComputedTextLength())));
    g.remove();
    return w;
  };
  const svgIn = (el, W, H) => {
    el.replaceChildren();
    return d3.select(el).append('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'tp-svg');
  };
  const yAxis = (svg, y, ticks, fmt, x0, x1) => {
    svg.append('g').selectAll('line').data(ticks).join('line').attr('class', 'tp-grid').attr('x1', x0).attr('x2', x1).attr('y1', y).attr('y2', y);
    svg.append('g').selectAll('text').data(ticks).join('text').attr('class', 'tp-tick').attr('x', x0 - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt);
  };

  // ---- line chart: series [{name, color, values:[{x:Date, y}], dash, width}] ----
  T.line = (el, series, o = {}) => {
    const W = Math.max(280, el.clientWidth || 600);
    const H = o.height || 240;
    const yf = o.yfmt || T.f.num;
    const pts = series.flatMap((s) => s.values.filter((v) => ok(v.y)));
    el.replaceChildren();
    if (!pts.length) return;
    const svg = svgIn(el, W, H);
    const lo = o.y0 != null ? o.y0 : Math.min(0, d3.min(pts, (d) => d.y));
    const hi = Math.max(d3.max(pts, (d) => d.y), ...(o.refs || []).map((r) => r.y));
    const y = d3.scaleLinear([lo, hi || 1], [H - 26, 12]).nice();
    const ticks = y.ticks(Math.max(3, Math.floor(H / 55)));
    const ml = T.measure(svg, ticks.map(yf)) + 12;
    const ends = o.endLabels === false ? [] : series.map((s) => {
      const l = [...s.values].reverse().find((v) => ok(v.y));
      return l && { s, l, text: s.name + ' ' + yf(l.y) };
    }).filter(Boolean);
    const mr = ends.length ? Math.min(T.measure(svg, ends.map((e) => e.text), 'tp-end') + 14, W * 0.4) : 12;
    const x = (o.xscale || d3.scaleUtc)(o.xdomain || d3.extent(pts, (d) => d.x), [ml, W - mr]);
    yAxis(svg, y, ticks, yf, ml, W - mr);
    const ax = d3.axisBottom(x).ticks(o.xticks || Math.max(2, Math.floor((W - ml - mr) / 90))).tickSizeOuter(0);
    if (o.xfmt) ax.tickFormat(o.xfmt);
    svg.append('g').attr('class', 'tp-axis').attr('transform', `translate(0,${H - 26})`).call(ax).attr('font-size', null).attr('font-family', null);
    (o.refs || []).forEach((r) => {
      svg.append('line').attr('class', 'tp-ref').attr('x1', ml).attr('x2', W - mr).attr('y1', y(r.y)).attr('y2', y(r.y));
      svg.append('text').attr('class', 'tp-tick').attr('x', ml + 4).attr('y', y(r.y) - 4).text(r.label);
    });
    const line = d3.line().defined((d) => ok(d.y)).x((d) => x(d.x)).y((d) => y(d.y));
    svg.append('g').selectAll('path').data(series).join('path').attr('fill', 'none').attr('stroke', (s) => s.color)
      .attr('stroke-width', (s) => s.width || 2).attr('stroke-dasharray', (s) => s.dash || null)
      .attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round').attr('d', (s) => line(s.values));
    if (o.dots) svg.append('g').selectAll('circle').data(series.flatMap((s) => s.values.filter((v) => ok(v.y)).map((v) => ({ ...v, c: s.color }))))
      .join('circle').attr('cx', (d) => x(d.x)).attr('cy', (d) => y(d.y)).attr('r', 3).attr('fill', (d) => d.c);
    // end labels, nudged apart
    const pos = ends.map((e) => ({ ...e, y: y(e.l.y) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < pos.length; i++) if (pos[i].y - pos[i - 1].y < 14) pos[i].y = pos[i - 1].y + 14;
    pos.forEach((e) => svg.append('text').attr('class', 'tp-end').attr('x', x(e.l.x) + 6).attr('y', e.y).attr('dy', '0.32em').attr('fill', e.s.color).text(e.text));
    // hover
    const tip = T.tip(el);
    const X = (v) => (o.xscale ? v : new Date(v));
    const xs = [...new Set(pts.map((d) => +d.x))].sort((a, b) => a - b);
    const rule = svg.append('line').attr('class', 'tp-rule').attr('y1', 12).attr('y2', H - 26).style('display', 'none');
    const dots = svg.append('g');
    const tf = o.tipx || d3.utcFormat('%b %Y');
    svg.append('rect').attr('x', ml).attr('y', 0).attr('width', Math.max(0, W - mr - ml)).attr('height', H).attr('fill', 'transparent')
      .on('pointermove', (ev) => {
        const [mx] = d3.pointer(ev);
        const t = x.invert(mx);
        const xv = xs[Math.min(xs.length - 1, d3.bisectCenter(xs, +t))];
        const px = x(X(xv));
        rule.style('display', null).attr('x1', px).attr('x2', px);
        const hit = series.map((s) => ({ s, v: s.values.find((v) => +v.x === xv) })).filter((h) => h.v && ok(h.v.y));
        dots.selectAll('circle').data(hit).join('circle').attr('r', 4).attr('cx', px).attr('cy', (h) => y(h.v.y)).attr('fill', (h) => h.s.color);
        const scale = el.clientWidth / W;
        tip.show(px * scale, d3.min(hit, (h) => y(h.v.y)) * scale, tf(X(xv)), hit.map((h) => ({ color: series.length > 1 ? h.s.color : null, name: h.s.name, value: (h.s.fmt || yf)(h.v.y) })));
      })
      .on('pointerleave', () => {
        rule.style('display', 'none');
        dots.selectAll('*').remove();
        tip.hide();
      });
  };

  // ---- columns: data [{label, y, color, tip:[{name,value}], parts?:[{name, y, color}]}] ----
  T.cols = (el, data, o = {}) => {
    const W = Math.max(280, el.clientWidth || 600);
    const H = o.height || 220;
    const yf = o.yfmt || T.f.num;
    el.replaceChildren();
    if (!data.length) return;
    const svg = svgIn(el, W, H);
    const tot = (d) => (d.parts ? d3.sum(d.parts, (p) => p.y) : d.y);
    const y = d3.scaleLinear([0, o.ymax || d3.max(data, tot) || 1], [H - 26, 14]).nice();
    const ticks = y.ticks(Math.max(3, Math.floor(H / 55)));
    const ml = T.measure(svg, ticks.map(yf)) + 12;
    const x = d3.scaleBand(data.map((d) => d.label), [ml, W - 8]).padding(o.pad ?? 0.2);
    yAxis(svg, y, ticks, yf, ml, W - 8);
    const lw = T.measure(svg, data.map((d) => d.label)) + 10;
    const every = Math.max(1, Math.ceil(lw / x.step()));
    svg.append('g').selectAll('text').data(data.filter((_, i) => i % every === 0)).join('text').attr('class', 'tp-tick')
      .attr('x', (d) => x(d.label) + x.bandwidth() / 2).attr('y', H - 8).attr('text-anchor', 'middle').text((d) => d.label);
    const bw = Math.min(32, x.bandwidth());
    const off = (x.bandwidth() - bw) / 2;
    const g = svg.append('g');
    data.forEach((d) => {
      let base = 0;
      (d.parts || [{ y: d.y, color: d.color }]).forEach((p) => {
        if (!ok(p.y)) return;
        g.append('rect').attr('x', x(d.label) + off).attr('width', bw).attr('y', y(base + p.y)).attr('height', Math.max(0, y(base) - y(base + p.y)))
          .attr('rx', Math.min(3, bw / 4)).attr('fill', p.color || d.color || T.c.teal).attr('opacity', d.dim ? 0.35 : 1);
        base += p.y;
      });
      if (o.labels) g.append('text').attr('class', 'tp-end').attr('x', x(d.label) + x.bandwidth() / 2).attr('y', y(tot(d)) - 5).attr('text-anchor', 'middle').text(o.labels(d));
    });
    const tip = T.tip(el);
    svg.append('g').selectAll('rect').data(data).join('rect').attr('x', (d) => x(d.label)).attr('width', x.step()).attr('y', 0).attr('height', H - 26).attr('fill', 'transparent')
      .on('pointermove', (ev, d) => {
        const s = el.clientWidth / W;
        tip.show((x(d.label) + x.bandwidth() / 2) * s, y(tot(d)) * s, d.title || d.label, d.tip || [{ name: o.name || 'Value', value: yf(d.y) }]);
      })
      .on('pointerleave', () => tip.hide());
  };

  // ---- scatter: pts [{x, y, r, label, color, dim, tip, key}] ----
  T.scatter = (el, pts, o = {}) => {
    const W = Math.max(280, el.clientWidth || 600);
    const H = o.height || 340;
    el.replaceChildren();
    pts = pts.filter((p) => ok(p.x) && ok(p.y));
    if (!pts.length) return;
    const svg = svgIn(el, W, H);
    const pad = (a, b) => [a - (b - a) * 0.06, b + (b - a) * 0.06];
    const y = d3.scaleLinear(pad(Math.min(0, d3.min(pts, (p) => p.y)), d3.max(pts, (p) => p.y)), [H - 40, 14]).nice();
    const yt = y.ticks(5);
    const ml = T.measure(svg, yt.map(o.yfmt)) + 30;
    const x = d3.scaleLinear(pad(...d3.extent(pts, (p) => p.x)), [ml, W - 14]).nice();
    yAxis(svg, y, yt, o.yfmt, ml, W - 14);
    const xt = x.ticks(Math.max(2, Math.floor((W - ml) / 80)));
    svg.append('g').selectAll('text').data(xt).join('text').attr('class', 'tp-tick').attr('x', x).attr('y', H - 24).attr('text-anchor', 'middle').text(o.xfmt);
    svg.append('text').attr('class', 'tp-tick').attr('x', (ml + W - 14) / 2).attr('y', H - 6).attr('text-anchor', 'middle').text(o.xlab);
    svg.append('text').attr('class', 'tp-tick').attr('transform', `translate(12,${(H - 40) / 2 + 7}) rotate(-90)`).attr('text-anchor', 'middle').text(o.ylab);
    if (ok(o.xref)) svg.append('line').attr('class', 'tp-ref').attr('x1', x(o.xref)).attr('x2', x(o.xref)).attr('y1', 14).attr('y2', H - 40);
    if (ok(o.yref)) svg.append('line').attr('class', 'tp-ref').attr('x1', ml).attr('x2', W - 14).attr('y1', y(o.yref)).attr('y2', y(o.yref));
    if (o.quads) {
      const q = [[ml + 6, 26, 'start', o.quads[0]], [W - 20, 26, 'end', o.quads[1]], [ml + 6, H - 48, 'start', o.quads[2]], [W - 20, H - 48, 'end', o.quads[3]]];
      q.forEach(([qx, qy, a, t]) => svg.append('text').attr('class', 'tp-quad').attr('x', qx).attr('y', qy).attr('text-anchor', a).text(t));
    }
    const r = d3.scaleSqrt([0, d3.max(pts, (p) => p.r) || 1], [3, o.rmax || 22]);
    const sorted = [...pts].sort((a, b) => b.r - a.r);
    const g = svg.append('g');
    g.selectAll('circle').data(sorted).join('circle').attr('cx', (p) => x(p.x)).attr('cy', (p) => y(p.y)).attr('r', (p) => r(p.r))
      .attr('fill', (p) => p.color || T.c.teal).attr('fill-opacity', (p) => (p.dim ? 0.12 : 0.55)).attr('stroke', (p) => p.color || T.c.teal).attr('stroke-opacity', (p) => (p.dim ? 0.3 : 1))
      .style('cursor', o.onClick ? 'pointer' : null).on('click', (_, p) => o.onClick && o.onClick(p));
    if (o.label) {
      // point labels, skipped where one would touch a label already placed (quadrant names included)
      const boxes = svg.selectAll('.tp-quad').nodes().map((n) => n.getBBox());
      const hit = (a) => boxes.some((b) => a.x < b.x + b.width + 2 && b.x < a.x + a.width + 2 && a.y < b.y + b.height && b.y < a.y + a.height);
      pts.filter((p) => !p.dim).sort((a, b) => b.r - a.r).slice(0, o.label).forEach((p) => {
        const right = x(p.x) + r(p.r) + 3 < W - 110;
        const tx = svg.append('text').attr('class', 'tp-plab').attr('x', right ? x(p.x) + r(p.r) + 3 : x(p.x) - r(p.r) - 3)
          .attr('text-anchor', right ? 'start' : 'end').attr('y', y(p.y)).attr('dy', '0.32em').text(p.label);
        const bb = tx.node().getBBox();
        if (hit(bb)) tx.remove();
        else boxes.push(bb);
      });
    }
    const tip = T.tip(el);
    const dl = d3.Delaunay.from(pts, (p) => x(p.x), (p) => y(p.y));
    svg.append('rect').attr('x', ml).attr('y', 0).attr('width', W - ml).attr('height', H - 40).attr('fill', 'transparent').style('pointer-events', 'none');
    svg.on('pointermove', (ev) => {
      const [mx, my] = d3.pointer(ev);
      const p = pts[dl.find(mx, my)];
      if (!p || Math.hypot(x(p.x) - mx, y(p.y) - my) > r(p.r) + 12) return tip.hide();
      const s = el.clientWidth / W;
      tip.show(x(p.x) * s, (y(p.y) - r(p.r)) * s, p.label, p.tip);
    }).on('pointerleave', () => tip.hide());
  };

  // ---- HTML bar table: rows [{label, key, sel}], cols [{f, fmt, color, max, good}] ----
  T.btable = (el, rows, cols, o = {}) => {
    el.replaceChildren();
    const grid = T.el('div', 'tp-bt');
    grid.style.gridTemplateColumns = `minmax(6rem, ${o.labelW || '1.1fr'}) repeat(${cols.length}, minmax(5rem, 1fr))`;
    grid.append(T.el('div', 'tp-bt-h', o.head || ''));
    cols.forEach((c) => grid.append(T.el('div', 'tp-bt-h', c.label)));
    const max = cols.map((c) => c.max || d3.max(rows, (r) => Math.abs(r[c.f]) || 0) || 1);
    rows.forEach((r) => {
      const lab = T.el('div', 'tp-bt-l' + (r.sel ? ' is-sel' : ''), r.label);
      if (o.onClick) {
        lab.classList.add('is-click');
        lab.onclick = () => o.onClick(r);
      }
      grid.append(lab);
      cols.forEach((c, i) => {
        const cell = T.el('div', 'tp-bt-c');
        const bar = T.el('span', 'tp-bt-b');
        const v = r[c.f];
        bar.style.width = ok(v) ? Math.max(1, (Math.abs(v) / max[i]) * 100) + '%' : '0';
        bar.style.background = typeof c.color === 'function' ? c.color(v, r) : c.color || T.c.teal;
        cell.append(bar, T.el('span', 'tp-bt-v', (c.fmt || T.f.num)(v)));
        grid.append(cell);
      });
    });
    el.append(grid);
  };

  // ---- pivot grid: rows x cols heat ----
  T.grid = (el, rk, ck, cell, o = {}) => {
    el.replaceChildren();
    const g = T.el('div', 'tp-grid2');
    g.style.gridTemplateColumns = `minmax(${o.rowW || '6rem'}, auto) repeat(${ck.length}, minmax(${o.colW || '2.6rem'}, 1fr))`;
    g.append(T.el('div', 'tp-g-h', o.corner || ''));
    ck.forEach((c) => g.append(T.el('div', 'tp-g-h', o.colLabel ? o.colLabel(c) : c)));
    const vals = rk.flatMap((r) => ck.map((c) => cell(r, c)?.v)).filter(ok);
    const vmax = o.max || d3.max(vals) || 1;
    const vmin = o.min ?? 0;
    rk.forEach((r) => {
      g.append(T.el('div', 'tp-g-l' + (o.sel && o.sel(r) ? ' is-sel' : ''), o.rowLabel ? o.rowLabel(r) : r));
      ck.forEach((c) => {
        const d = cell(r, c);
        const e = T.el('div', 'tp-g-c', d && ok(d.v) ? d.text : '');
        if (d && ok(d.v)) {
          const t = Math.max(0, Math.min(1, (d.v - vmin) / (vmax - vmin || 1)));
          e.style.background = `color-mix(in srgb, ${o.color || T.c.bad} ${Math.round(8 + t * 62)}%, transparent)`;
          if (d.title) e.title = d.title;
        } else e.classList.add('is-empty');
        g.append(e);
      });
    });
    el.append(g);
  };

  // ---- sortable data table: cols [{f, label, fmt, heat:'bad'|'good', src}] ----
  T.table = (el, rows, cols, o = {}) => {
    const st = (el.__sort = el.__sort || { f: o.sort || cols[1].f, dir: o.dir || -1 });
    const data = [...rows].sort((a, b) => {
      const x = a[st.f];
      const y = b[st.f];
      if (typeof x === 'string' || typeof y === 'string') return st.dir * String(x).localeCompare(String(y));
      return st.dir * ((ok(x) ? x : -Infinity) - (ok(y) ? y : -Infinity));
    });
    const thead = T.el('thead');
    const hr = T.el('tr');
    cols.forEach((c) => {
      const th = T.el('th');
      th.dataset.field = c.f;
      if (c.src) th.dataset.source = c.src;
      if (c.num) th.className = 'num';
      const b = T.el('button', 'tp-sort', c.label);
      th.setAttribute('aria-sort', st.f === c.f ? (st.dir > 0 ? 'ascending' : 'descending') : 'none');
      b.onclick = () => {
        el.__sort = { f: c.f, dir: st.f === c.f ? -st.dir : typeof rows[0]?.[c.f] === 'string' ? 1 : -1 };
        dash.draw(el.dataset.draw);
      };
      th.append(b);
      hr.append(th);
    });
    thead.append(hr);
    const ext = cols.map((c) => (c.heat ? d3.extent(rows, (r) => r[c.f]) : null));
    const tb = T.el('tbody');
    data.forEach((r) => {
      const tr = T.el('tr');
      tr.dataset.key = r[o.key || 'id'];
      if (o.sel && o.sel(r)) tr.className = 'is-sel';
      if (o.onRow) {
        tr.classList.add('is-click');
        tr.onclick = () => o.onRow(r);
      }
      cols.forEach((c, i) => {
        const td = T.el('td', c.num ? 'num' : null);
        const v = r[c.f];
        if (c.badge) {
          const b = T.el('span', 'tp-badge tp-b-' + String(v).toLowerCase().replace(/[^a-z]+/g, '-'));
          b.append(T.icon(c.badge(v)), T.el('span', null, v));
          td.append(b);
        } else td.textContent = (c.fmt || T.f.text)(v, r);
        if (c.heat && ok(v) && ext[i]) {
          const [a, b] = ext[i];
          const t = b > a ? (v - a) / (b - a) : 0;
          const w = c.heat === 'good' ? 1 - t : t;
          td.style.background = `color-mix(in srgb, ${T.c.bad} ${Math.round(w * 38)}%, transparent)`;
        }
        tr.append(td);
      });
      tb.append(tr);
    });
    el.replaceChildren(thead, tb);
  };

  // value spots: data-src, data-f, data-w (template), data-fmt
  dash.draw('v', (el) => {
    const { src, f, w, fmt } = el.dataset;
    const rows = T.get(el, src, true);
    if (!rows) return;
    const where = T.fill(w);
    const row = T.find(rows, where);
    if (!row || !ok(row[f]) && typeof row[f] !== 'string') return (el.textContent = '—');
    el.replaceChildren(T.mk('span', src, f, where, (T.f[fmt] || T.f.num)(row[f])));
  });
  // change spots coloured by whether the move is good
  dash.draw('d', (el) => {
    const { src, f, w, fmt, good } = el.dataset;
    const rows = T.get(el, src, true);
    if (!rows) return;
    const where = T.fill(w);
    const row = T.find(rows, where);
    el.classList.remove('is-good', 'is-bad');
    if (!row || !ok(row[f])) return (el.textContent = '—');
    const v = row[f];
    el.classList.add((v >= 0) === (good === 'up') ? 'is-good' : 'is-bad');
    const fm = T.f[fmt] || T.f.chg;
    el.replaceChildren(T.icon(v >= 0 ? 'up' : 'down', 'tp-i tp-i-s'), fmt === 'pp' ? T.el('span', null, fm(v)) : T.mk('span', src, f, where, fm(v)));
  });
  // picks the sibling word/sentence that matches the sign of a value
  dash.draw('pick', (el) => {
    const { src, f, w } = el.dataset;
    const d = dash.data(src);
    const sibs = [...el.parentElement.querySelectorAll(':scope > [data-pick]')];
    if (d.status !== 'ok') return sibs.forEach((s, i) => (s.hidden = i > 0));
    const row = T.find(d.data, T.fill(w));
    const pos = row && row[f] >= 0;
    sibs.forEach((s) => (s.hidden = (s.dataset.pick === 'pos') !== pos));
  });
})();
