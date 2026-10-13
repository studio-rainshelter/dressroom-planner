/* 드레스룸 3D 플래너: 3D 화면, 조작, 설정 패널 */
(function () {
  'use strict';

  const C = window.PlannerCore;
  const K = C.K;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

  if (!window.THREE) {
    const m = $('#stage-msg');
    m.textContent = '3D 화면을 그리는 데 필요한 파일을 불러오지 못했습니다. 네트워크 연결을 확인한 뒤 새로 고치세요.';
    m.hidden = false;
    return;
  }
  const THREE = window.THREE;

  const FINISH = {
    white: { name: '화이트', body: '#f3f1ec', back: '#e2dfd8', edge: '#8d8a83', post: '#f0f0ee' },
    oak: { name: '오크', body: '#d8bc92', back: '#c7aa7f', edge: '#86704c', post: '#cdd0d2' },
    walnut: { name: '월넛', body: '#8d6a4f', back: '#795a41', edge: '#4b3729', post: '#35373a' },
    gray: { name: '그레이', body: '#b3b7b9', back: '#a0a4a7', edge: '#666a6c', post: '#cdd0d2' },
    black: { name: '블랙', body: '#3a3c3f', back: '#2d2f32', edge: '#0f1011', post: '#2a2c2f' },
  };
  // 스피드랙: 프레임은 백색·검정, 합판은 백색·우드. 색상 칸의 네 가지가 이 조합을 가리킨다.
  const RACK_FINISH = {
    white: { name: '백색 프레임 · 백색 합판', frame: '#f1f1ee', board: '#f3f1ec', edge: '#8d8a83', boardEdge: '#a8a49b' },
    oak: { name: '백색 프레임 · 우드 합판', frame: '#f1f1ee', board: '#d8bc92', edge: '#8d8a83', boardEdge: '#86704c' },
    walnut: { name: '검정 프레임 · 우드 합판', frame: '#2c2e31', board: '#d8bc92', edge: '#0f1011', boardEdge: '#86704c' },
    black: { name: '검정 프레임 · 백색 합판', frame: '#2c2e31', board: '#f3f1ec', edge: '#0f1011', boardEdge: '#a8a49b' },
  };
  const rackSwatch = (f) => { const k = RACK_FINISH[f] || RACK_FINISH.white; return 'linear-gradient(135deg, ' + k.frame + ' 0 50%, ' + k.board + ' 50% 100%)'; };
  const DOOR_FINISH_NAME = { white: '화이트', oak: '오크', walnut: '월넛', gray: '그레이', black: '블랙', mirror: '거울' };
  const WALL_COLOR = {
    white: { name: '화이트', hex: '#f2f0ea' },
    ivory: { name: '아이보리', hex: '#efe5d0' },
    gray: { name: '그레이', hex: '#d5d7d6' },
    sage: { name: '세이지', hex: '#cdd6c6' },
    blue: { name: '블루그레이', hex: '#c9d3dc' },
  };
  const STRENGTH = { low: 40, mid: 80, high: 150 };
  const WALL_NAME = { N: '위쪽 벽', E: '오른쪽 벽', S: '아래쪽 벽', W: '왼쪽 벽' };
  const ROT_WALL = { 0: 'N', 90: 'W', 180: 'S', 270: 'E' };
  const WALL_ROT = { N: 0, W: 90, S: 180, E: 270 };
  const WALL_SHORT = { N: '위쪽', E: '오른쪽', S: '아래쪽', W: '왼쪽' };
  const PART_FIELD = { shelf: '윗면 높이', rod: '봉 높이', drawer: '아랫면 높이' };
  const svg16 = (d) => '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const PART_ICON = {
    rod: svg16('<path d="M1.5 4.5h13"/><path d="M8 4.5v2l4.5 3.5h-9L8 6.5"/>'),
    shelf: svg16('<rect x="1.5" y="6.5" width="13" height="3" rx=".6"/>'),
    drawer: svg16('<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 8h12M7 5.5h2M7 10.5h2"/>'),
  };
  const ITEM_ICON = {
    door: svg16('<path d="M3 14V2.5h7V14"/><path d="M1.5 14h13"/><path d="M8 8.2v.6"/>'),
    window: svg16('<rect x="2.5" y="3" width="11" height="10" rx=".8"/><path d="M8 3v10M2.5 8h11"/>'),
    pillar: svg16('<rect x="5" y="2" width="6" height="12" rx=".6"/>'),
    partition: svg16('<rect x="6.6" y="1.5" width="2.8" height="13" rx=".5"/>'),
    notch: svg16('<path d="M2 2.5h7v5h5v6H2z"/>'),
  };
  const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>';

  /* ---------- 상태 ---------- */

  let design = C.sampleDesign();
  const ui = {
    tab: 'room', view: '3d', frontRot: 0,
    selUnit: null, selPart: null, selItem: null,
    hoverUnit: null, hoverPart: null, hoverItem: null, hoverWall: null,
    magnet: true, strength: 'mid', autoRotate: true,
    dims: true, clothes: true, doors: true,
    sample: true, readonly: false,
    guides: null, dragging: null,
  };
  const glCanvas = $('#gl');
  const stageEl = $('#stage');
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

  const getUnit = (id) => (id ? design.units.find((u) => u.id === id) || null : null);
  const getPart = (u, id) => (u && id ? u.parts.find((p) => p.id === id) || null : null);
  const getOpening = (id) => (id ? design.openings.find((o) => o.id === id) || null : null);
  const getBlock = (id) => (id ? design.blocks.find((b) => b.id === id) || null : null);
  // 문짝을 닫힌 모습으로 그릴지. 내부 단계에서는 안이 보이도록 늘 반투명으로 그린다.
  const doorsSolid = () => ui.doors && ui.tab !== 'interior';
  // 목록과 색상 칸에 보여 줄 색
  const swatchOf = (u) => (C.isRack(u) ? rackSwatch(u.finish) : FINISH[u.finish].body);
  const unitSize = (u) => (u.kind === 'corner' ? u.w + ' × ' + u.w2 + ' × ' + u.h : u.w + ' × ' + u.h + ' × ' + u.d);

  let issuesCache = null;
  function issues() {
    if (!issuesCache) issuesCache = C.checkDesign(design);
    return issuesCache;
  }
  function levelOf(id) {
    let lv = null;
    for (const i of issues()) {
      if (i.unitId !== id && i.otherId !== id && i.itemId !== id) continue;
      if (i.level === 'bad') return 'bad';
      lv = 'warn';
    }
    return lv;
  }

  let renderQueued = false;
  function requestRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(frame);
  }
  function frame() {
    renderQueued = false;
    Rig.step(performance.now());
    Scene.render();
    Overlay.draw();
  }
  // 설계 값이 바뀐 뒤 호출
  function touched() {
    issuesCache = null;
    requestRender();
  }

  let toastTimer = 0;
  function toast(msg, action) {
    const el = $('#toast');
    el.hidden = true;
    el.textContent = '';
    const s = document.createElement('span');
    s.textContent = msg;
    el.appendChild(s);
    if (action) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = action.label;
      b.addEventListener('click', () => { el.hidden = true; action.fn(); });
      el.appendChild(b);
    }
    void el.offsetWidth;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, action ? 6500 : 3400);
  }

