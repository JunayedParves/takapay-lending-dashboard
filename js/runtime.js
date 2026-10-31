// Minimal stand-alone runtime: loads data/<id>.json, runs derived calculations, keeps filter
// state and redraws every [data-draw] element that is visible when data, filters or width change.
(() => {
  const DEFAULTS = { division: 'All', district: null, geoMetric: 'glp', segDim: 'Gender', fy: 'All' };
  let params = { ...DEFAULTS };
  const files = {};
  const calcs = {};
  const draws = new Map();
  const listeners = [];
  let queued = false;

  const load = (id) => {
    if (files[id]) return;
    files[id] = { status: 'loading', data: [] };
    fetch('data/' + id + '.json')
      .then((r) => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((d) => (files[id] = { status: 'ok', data: d }))
      .catch((e) => (files[id] = { status: 'error', data: [], message: String(e) }))
      .finally(schedule);
  };

  const data = (id) => {
    const c = calcs[id];
    if (!c) {
      load(id);
      return files[id];
    }
    if (c.value) return { status: 'ok', data: c.value };
    const ins = c.inputs.map(data);
    const bad = ins.find((x) => x.status !== 'ok');
    if (bad) return { status: bad.status, data: [], message: bad.message };
    try {
      c.value = c.fn(...ins.map((x) => x.data));
      return { status: 'ok', data: c.value };
    } catch (e) {
      console.error('calc ' + id, e);
      return { status: 'error', data: [], message: String(e) };
    }
  };

  const visible = (el) => el.isConnected && !el.closest('[hidden]');
  const run = (name, el) => {
    const fn = draws.get(name);
    if (!fn || !visible(el)) return;
    try {
      el.__w = el.clientWidth;
      fn(el);
    } catch (e) {
      console.error('draw ' + name, e);
    }
  };
  const runAll = (name) => document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => run(name, el));
  const redraw = () => {
    queued = false;
    listeners.forEach((fn) => {
      try {
        fn();
      } catch (e) {
        console.error(e);
      }
    });
    draws.forEach((_, name) => runAll(name));
  };
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(redraw);
  }

  // redraw an element when its own width changes, and everything when a page is shown
  const ro = new ResizeObserver((entries) => entries.forEach((en) => {
    const el = en.target;
    if (Math.abs((el.__w || 0) - el.clientWidth) > 2) run(el.dataset.draw, el);
  }));
  new MutationObserver(schedule).observe(document.documentElement, { attributes: true, attributeFilter: ['hidden'], subtree: true });

  window.dash = {
    data,
    calc: (id, def) => (calcs[id] = { inputs: def.inputs, fn: def.fn, title: def.title, description: def.description }),
    draw: (name, fn) => {
      if (fn) {
        draws.set(name, fn);
        document.querySelectorAll(`[data-draw="${name}"]`).forEach((el) => ro.observe(el));
      }
      schedule();
      if (!fn) runAll(name);
    },
    onData: (fn) => {
      listeners.push(fn);
      fn();
    },
    params: () => params,
    setParams: (p) => {
      params = { ...params, ...p };
      schedule();
    },
    resetParams: () => {
      params = { ...DEFAULTS };
      schedule();
    },
    setLink: (name) => history.replaceState(null, '', '#' + name),
    colors: ['#137C8B', '#E3A008', '#5B6CC2', '#C2185B', '#15966B', '#8E5BC2', '#E9733B', '#4A90A4'],
  };
})();
