// 무작위 조작: 버튼, 숫자 칸, 끌기를 섞어 가며 저장 형식이 흔들리지 않는지, 오류가 나지 않는지 본다
const { open, settle, screenOf, drag, design } = require('./harness');

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

(async () => {
  const seed = +(process.argv[2] || 7);
  const steps = +(process.argv[3] || 70);
  // wild: 크기 칸에 아주 작은 값과 아주 큰 값도 넣는다. 이때는 방 밖으로 나가거나 부품이 겹치는 것이 정상이므로 그 둘은 문제로 세지 않는다.
  const wild = process.argv[4] === 'wild';
  const rnd = rng(seed);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const t = await open({ width: 1280, height: 800 });
  const page = t.page;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const problems = [];
  const state = () => ev(() => {
    const P = __planner;
    const d = P.design;
    const norm = P.C.normalizeDesign(JSON.parse(JSON.stringify(d)));
    const issues = P.C.checkDesign(d);
    return { json: JSON.stringify(d), stable: JSON.stringify(norm) === JSON.stringify(d), out: issues.filter((i) => i.code === 'out' || i.code === 'parts').map((i) => i.text), units: d.units.length, openings: d.openings.length, blocks: d.blocks.length, tab: P.ui.tab, view: P.ui.view, sample: P.ui.sample };
  });
  const clickIf = async (sel) => { const el = page.locator(sel); if (await el.count() && await el.first().isVisible() && await el.first().isEnabled()) { await el.first().click(); return true; } return false; };
  const fillIf = async (sel, v) => { const el = page.locator(sel); if (await el.count() && await el.first().isVisible()) { await el.first().fill(String(v)); await el.first().press('Enter'); return true; } return false; };
  const randPoint = async () => { const d = await design(page); return screenOf(page, rnd() * d.room.w, rnd() < 0.5 ? 0 : 800, rnd() * d.room.d); };

  const actions = {
    tab: () => clickIf('#tab-' + pick(['room', 'layout', 'interior', 'list'])),
    view: () => clickIf('#view-seg [data-view="' + pick(['3d', 'top', 'front']) + '"]'),
    addUnit: async () => { await clickIf('#tab-layout'); return clickIf(pick(['#btn-add-unit', '#btn-add-unit', '#btn-add-corner', '#btn-add-mirror'])); },
    selectUnit: () => ev((r) => { const P = __planner; const us = P.design.units; if (us.length) P.select(us[Math.floor(r * us.length)].id, null); }, rnd()),
    selectItem: () => ev((r) => { const P = __planner; const it = P.design.openings.concat(P.design.blocks); if (it.length) { P.setTab('room'); P.selectItem(it[Math.floor(r * it.length)].id); } }, rnd()),
    door: async () => { await clickIf('#tab-layout'); return clickIf('#unit-door [data-door="' + pick(['none', 'hinge', 'slide']) + '"]'); },
    doorFinish: async () => { await clickIf('#tab-layout'); return clickIf('#unit-door-finish [data-finish="' + pick(['white', 'oak', 'black', 'mirror']) + '"]'); },
    style: async () => { await clickIf('#tab-layout'); return clickIf('#unit-style [data-style="' + pick(['panel', 'pole', 'rack', 'rack']) + '"]'); },
    fitRack: () => clickIf('#btn-fit-rack'),
    finish: async () => { await clickIf('#tab-layout'); return clickIf('#unit-finish [data-finish="' + pick(['white', 'oak', 'walnut', 'gray', 'black']) + '"]'); },
    hinge: () => clickIf('#unit-hinge [data-hinge="' + pick(['left', 'right']) + '"]'),
    size: async () => {
      await clickIf('#tab-layout');
      const d = await design(page);
      // 보통 쓰는 범위: 방 안에 들어가고 부품이 눌리지 않는 크기
      const f = pick([['#unit-w', 300, Math.min(1500, d.room.w)], ['#unit-w2', 600, Math.min(1500, d.room.d)], ['#unit-h', 1500, d.room.h], ['#unit-d', 250, 900], ['#unit-d2', 300, 700], ['#unit-left', 0, 2400], ['#unit-top', 0, 2400]]);
      const v = wild ? pick([1, 37, 120, 260, 990, 2750, 6100, 19000, 99999, Math.round(rnd() * 4000)]) : Math.round(f[1] + rnd() * Math.max(0, f[2] - f[1]));
      return fillIf(f[0], v);
    },
    doorH: async () => { await clickIf('#tab-layout'); return fillIf('#unit-door-h', wild ? pick([1, 80, 450, 1234, 5000]) : Math.round(300 + rnd() * 1800)); },
    doorAt: () => clickIf('#unit-door-at [data-at="' + pick(['top', 'bottom']) + '"]'),
    doorFit: () => clickIf('#btn-door-fit'),
    drawerSize: async () => {
      await clickIf('#tab-interior');
      const el = page.locator('#part-list [data-field="' + pick(['n', 'eh']) + '"]');
      if (!(await el.count()) || !(await el.first().isVisible())) return false;
      await el.first().fill(String(wild ? pick([1, 3, 12, 45, 77, 260, 900]) : pick([1, 2, 3, 4, 120, 160, 200, 240])));
      await el.first().press('Enter');
      return true;
    },
    rotate: () => clickIf('#btn-rotate'),
    dup: () => clickIf('#btn-dup'),
    delUnit: async () => (rnd() < 0.4 ? clickIf('#btn-del-unit') : false),
    fitWidth: () => clickIf('#btn-fit-width'),
    preset: async () => { await clickIf('#tab-interior'); return clickIf('#int-add [data-preset="' + pick(['long', 'double', 'drawers', 'shelves', 'mixed']) + '"]'); },
    addPart: async () => { await clickIf('#tab-interior'); return clickIf('#int-add [data-add="' + pick(['rod', 'shelf', 'drawer']) + '"]'); },
    addItem: async () => { await clickIf('#tab-room'); return clickIf('#wall-add [data-add="' + pick(['door', 'window', 'pillar', 'partition', 'notch']) + '"]'); },
    itemField: async () => { await clickIf('#tab-room'); return fillIf(pick(['#wi-offset', '#wi-width', '#wi-height', '#wi-sill', '#wb-w', '#wb-d', '#wb-h', '#wb-left', '#wb-top']), wild ? pick([0, 3, 45, 180, 760, 3100, 12000, 99999]) : Math.round(rnd() * 2600)); },
    itemSeg: () => clickIf(pick(['#wi-wall [data-wall="' + pick(['N', 'E', 'S', 'W']) + '"]', '#wi-leaf [data-leaf="' + pick(['none', 'swing', 'slide']) + '"]', '#wi-swing [data-swing="' + pick(['in', 'out']) + '"]', '#wi-hinge [data-hinge="' + pick(['a', 'b']) + '"]', '#wb-full'])),
    delItem: async () => (rnd() < 0.35 ? clickIf('#btn-del-item') : false),
    room: async () => { await clickIf('#tab-room'); return fillIf(pick(['#room-w', '#room-d', '#room-h']), wild ? pick([1, 250, 640, 1900, 3300, 9000, 26000, 99999]) : Math.round(1900 + rnd() * 2600)); },
    wallColor: async () => { await clickIf('#tab-room'); return clickIf('#wall-color [data-color="' + pick(['white', 'ivory', 'gray', 'sage', 'blue']) + '"]'); },
    drag: async () => { const a = await randPoint(); const b = await randPoint(); await drag(page, a, b, { steps: 6, alt: rnd() < 0.2 }); return true; },
    dragWall: async () => {
      await clickIf('#tab-room'); await clickIf('#view-seg [data-view="top"]');
      const d = await design(page); const w = pick(['N', 'E', 'S', 'W']);
      const p = w === 'N' ? [d.room.w * rnd(), -40] : w === 'S' ? [d.room.w * rnd(), d.room.d + 40] : w === 'W' ? [-40, d.room.d * rnd()] : [d.room.w + 40, d.room.d * rnd()];
      const a = await screenOf(page, p[0], 0, p[1]);
      const off = (rnd() - 0.5) * 240;
      await drag(page, a, { x: a.x + (w === 'E' || w === 'W' ? off : 0), y: a.y + (w === 'N' || w === 'S' ? off : 0) }, { steps: 5 });
      return true;
    },
    key: async () => { await page.focus('#gl'); await page.keyboard.press(pick(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Shift+ArrowLeft', 'KeyR', 'Escape'])); return true; },
    undo: () => clickIf('#btn-undo'),
    redo: () => clickIf('#btn-redo'),
    doorsChip: () => clickIf('#btn-doors'),
    clothes: async () => (rnd() < 0.3 ? clickIf('#btn-clothes') : false),
    startEmpty: async () => (rnd() < 0.3 ? clickIf('#btn-start-empty') : false),
  };
  // wild에서는 크기를 바꾸는 동작과, 그 상태에서 탈이 나기 쉬운 동작(끌기, 벽 끌기, 회전, 복제)을 더 자주 고른다
  const names = Object.keys(actions).concat(wild ? ['size', 'size', 'size', 'size', 'room', 'room', 'room', 'itemField', 'itemField', 'doorH', 'drawerSize', 'drawerSize', 'dragWall', 'dragWall', 'dragWall', 'drag', 'drag', 'rotate', 'dup', 'fitWidth', 'preset', 'addUnit', 'style', 'door'] : []);
  const log = [];
  for (let i = 0; i < steps; i++) {
    const name = pick(names);
    let done = false;
    try { done = await actions[name](); } catch (e) { problems.push('step ' + i + ' ' + name + ': ' + e.message.split('\n')[0]); }
    await ev(() => { document.querySelector('#toast').hidden = true; });
    const s = await state();
    log.push(name + (done === false ? '(-)' : ''));
    if (!s.stable) {
      const diff = await ev(() => { const P = __planner; const a = JSON.parse(JSON.stringify(P.design)); const b = P.C.normalizeDesign(JSON.parse(JSON.stringify(P.design))); const out = []; const walk = (x, y, path) => { if (JSON.stringify(x) === JSON.stringify(y)) return; if (x && y && typeof x === 'object' && typeof y === 'object') { const ks = Array.from(new Set(Object.keys(x).concat(Object.keys(y)))); let found = false; for (const k of ks) { if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) { found = true; walk(x[k], y[k], path + '.' + k); } } if (!found) out.push(path + ': key order ' + Object.keys(x).join(',') + ' vs ' + Object.keys(y).join(',')); } else out.push(path + ': ' + JSON.stringify(x) + ' -> ' + JSON.stringify(y)); }; walk(a, b, 'design'); return out.slice(0, 6); });
      problems.push('step ' + i + ' ' + name + ': 저장 형식이 정리본과 다르다 ' + JSON.stringify(diff));
    }
    if (s.out.length && !wild) problems.push('step ' + i + ' ' + name + ': ' + s.out.join(' / '));
    if (process.env.MONKEY_TRACE) { const dd = await design(page); console.log('#' + i, name, done === false ? '(-)' : '', JSON.stringify(dd.room), dd.units.map((u) => [u.name, u.kind, u.x, u.z, u.rot, u.w, u.w2 || '', u.d, u.h].join(' ')).join(' | '), 'sample=' + s.sample, 'stable=' + s.stable); }
    if (t.errors.length) { problems.push('step ' + i + ' ' + name + ': ' + t.errors.join(' | ')); t.errors.length = 0; }
  }
  // 되돌리기와 다시 실행이 서로 맞는지
  const before = (await state()).json;
  let n = 0;
  while (await clickIf('#btn-undo')) { n += 1; if (n > 200) break; }
  let m = 0;
  while (await clickIf('#btn-redo')) { m += 1; if (m > 200) break; }
  const after = (await state()).json;
  if (before !== after) problems.push('되돌리기 ' + n + '번 뒤 다시 실행 ' + m + '번: 처음과 다르다');
  const fin = await state();
  console.log('seed ' + seed + (wild ? ' (wild)' : '') + ': ' + steps + ' steps, units ' + fin.units + ', openings ' + fin.openings + ', blocks ' + fin.blocks + ', undo depth ' + n + ', problems ' + problems.length);
  if (problems.length) { console.log(problems.join('\n')); console.log(log.join(' ')); }
  await page.screenshot({ path: 'shots/monkey-' + seed + (wild ? 'w' : '') + '.png' });
  await t.close();
  process.exit(problems.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
