  /* ---------- 시작 ---------- */

  function start(hot) {
    const local = Store.readLocal();
    const hotDesign = hot && hot.design ? C.normalizeDesign(hot.design) : null;
    if (hotDesign) {
      design = hotDesign; ui.sample = !!hot.sample;
    } else if (local) {
      design = local.design; ui.sample = local.sample;
      Store.setSavedAt(local.savedAt);
    }
    const prefs = (hot && hot.prefs) || (local && local.prefs) || {};
    if (typeof prefs.magnet === 'boolean') ui.magnet = prefs.magnet;
    if (STRENGTH[prefs.strength]) ui.strength = prefs.strength;
    if (typeof prefs.autoRotate === 'boolean') ui.autoRotate = prefs.autoRotate;
    if (typeof prefs.dims === 'boolean') ui.dims = prefs.dims;
    if (typeof prefs.clothes === 'boolean') ui.clothes = prefs.clothes;
    if (typeof prefs.doors === 'boolean') ui.doors = prefs.doors;
    if (hot && hot.tab && $('#panel-' + hot.tab)) ui.tab = hot.tab;

    try {
      Scene.init();
    } catch (err) {
      const m = $('#stage-msg');
      m.textContent = '이 브라우저에서는 3D 화면(WebGL)을 쓸 수 없습니다. 다른 브라우저나 기기에서 열어 보세요.';
      m.hidden = false;
      return;
    }
    Overlay.readTheme();
    History.replace(design, false);
    Panel.init();
    Ctl.init();
    window.addEventListener('keydown', onKey);

    let lastW = 0;
    let lastH = 0;
    const onSize = () => {
      const r = stageEl.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width));
      const h = Math.max(1, Math.round(r.height));
      if (w === lastW && h === lastH) return;
      lastW = w; lastH = h;
      Scene.resize(w, h);
      Overlay.resize(w, h, Scene.pixelRatio());
      Rig.setSize(w, h);
      if (w > 40 && h > 40) Rig.refit();
      requestRender();
    };
    if (window.ResizeObserver) new ResizeObserver(onSize).observe(stageEl);
    window.addEventListener('resize', onSize);
    onSize();

    const retheme = () => { Scene.applyTheme(); Overlay.readTheme(); requestRender(); };
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      if (mq.addEventListener) mq.addEventListener('change', retheme); else if (mq.addListener) mq.addListener(retheme);
    }
    if (window.MutationObserver) new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { Overlay.readTheme(); requestRender(); });

    Panel.refresh();
    requestRender();
    setTimeout(maybeHint, 700);
    Store.connect(hotDesign ? null : local);
  }

  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    hot.snapshot(() => ({ design, sample: ui.sample, tab: ui.tab, prefs: Store.prefsNow() }));
  }
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});

  // 점검용
  window.__planner = {
    get design() { return design; }, ui, C, Rig, Scene, pick, wallAt, Act, History, setTab, setView, select, selectItem,
    ghostOf: (id) => { const e = Scene.entries.get(id) || Scene.blockEntries.get(id); return !!(e && e.ghost); },
  };
})();
