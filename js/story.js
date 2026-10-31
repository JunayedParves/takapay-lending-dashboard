// Story tab: headline figures, chapter links and the priority-action list.
(() => {
  const T = window.TP;
  T.f.x = (v) => (T.ok(v) ? d3.format('.0f')(v) + '×' : '—');

  dash.calc('story', {
    inputs: ['monthly', 'vintages', 'geography'],
    title: 'Story headline figures',
    description: 'Disbursement in the first and latest year, all-time totals, the 6-month vintage default of the last two mature years, and the area with the highest NPL ratio, per division filter.',
    fn: (monthly, vintages, geography) => [...d3.group(monthly, (r) => r.division)].map(([division, rs]) => {
      const yr = (y) => d3.sum(rs.filter((r) => r.month.startsWith(y)), (r) => r.disb_amt);
      const v6 = (y) => {
        const r = vintages.find((x) => x.type === 'Year' && x.division === division && x.cohort === y && x.mob === 6);
        return r && r.observed ? r.defaults / r.loans : null;
      };
      const areas = geography.filter((g) => (division === 'All' ? g.level === 'division' : g.level === 'district' && g.division === division) && g.glp >= 1e6);
      const worst = areas.sort((a, b) => b.npl / b.glp - a.npl / a.glp)[0];
      return {
        division,
        disb_first: yr('2021'), disb_last: yr('2026'), multiple: yr('2026') / yr('2021'),
        disb_total: d3.sum(rs, (r) => r.disb_amt), loans_total: d3.sum(rs, (r) => r.disb_cnt),
        mob6_prev: v6('2024'), mob6_last: v6('2025'),
        worst_geo: worst ? worst.name : null, worst_geo_npl: worst ? worst.npl / worst.glp : null,
      };
    }),
  });

  dash.draw('chip2', (el) => {
    el.textContent = T.div() === 'All' ? 'All divisions' : T.div() + ' division';
  });

  dash.draw('story_actions', (el) => {
    const rows = T.get(el, 'actions');
    if (!rows) return;
    const r = rows.filter((x) => x.division === T.div()).sort((a, b) => a.risk_rank - b.risk_rank).slice(0, 4);
    el.replaceChildren(...r.map((x) => {
      const li = T.el('li', 'st-act st-act-' + x.risk.toLowerCase());
      const head = T.el('div', 'st-act-h');
      const badge = T.el('span', 'tp-badge tp-b-' + x.risk.toLowerCase());
      badge.append(T.icon(x.risk === 'High' ? 'alert' : x.risk === 'Medium' ? 'flag' : 'check'), T.el('span', null, x.risk));
      head.append(badge, T.el('span', 'st-act-area', x.area));
      li.append(head, T.el('p', 'st-act-f', x.finding), T.el('p', 'st-act-a', x.action), T.el('p', 'st-act-e', x.evidence));
      return li;
    }));
  });

  // chapter buttons jump to the analysis tab; chapters fade in as they reach the viewport
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
    T.show(b.dataset.goto);
    document.getElementById('top').scrollIntoView({ behavior: 'smooth' });
  }));
  document.querySelectorAll('.st-toc a').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelector(a.getAttribute('href')).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));
  const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('is-in')), { rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.st-ch').forEach((c) => io.observe(c));

  // theme toggle
  const root = document.documentElement;
  document.querySelectorAll('.tp-theme').forEach((b) => b.addEventListener('click', () => {
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try {
      localStorage.setItem('tp-theme', root.dataset.theme);
    } catch (e) {}
  }));
})();
