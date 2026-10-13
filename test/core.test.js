'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const K = C.K;

const room = { w: 2400, d: 1800, h: 2300, wallColor: 'white' };
function unit(o) {
  return Object.assign({ id: C.uid('u'), name: 'u', kind: 'std', x: 400, z: 290, rot: 0, w: 800, h: 2100, d: 580, style: 'panel', finish: 'white', door: 'none', doorFinish: 'white', hinge: 'left', parts: [] }, o);
}
function corner(o) {
  return Object.assign({ id: C.uid('u'), name: 'c', kind: 'corner', x: 500, z: 500, rot: 0, w: 1000, h: 2100, w2: 1000, d: 580, style: 'panel', finish: 'white', door: 'none', doorFinish: 'white', hinge: 'left', parts: [] }, o);
}
function block(o) {
  return Object.assign({ id: C.uid('b'), kind: 'pillar', name: '기둥 1', x: 150, z: 150, rot: 0, w: 300, d: 300, h: 2300, full: true }, o);
}
function door(o) {
  return Object.assign({ id: C.uid('o'), type: 'door', wall: 'S', offset: 1500, width: 800, height: 2100, leaf: 'swing', swing: 'out', hinge: 'a' }, o);
}
function win(o) {
  return Object.assign({ id: C.uid('o'), type: 'window', wall: 'N', offset: 0, width: 1200, height: 1200, sill: 900 }, o);
}
function design(units, extra) {
  return Object.assign({ v: 2, room: Object.assign({}, room), openings: [], blocks: [], units }, extra);
}
const ctxOf = (d, o) => Object.assign({ design: d, snap: true, thresh: 80, autoRotate: true }, o);
const codes = (d) => C.checkDesign(d).map((i) => i.code);
const bad = (d) => C.checkDesign(d).filter((i) => i.level === 'bad');
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + '±' + tol + ' got ' + a);

/* ---------- 이전 기능 ---------- */

test('유닛 기하: 회전에 따른 바닥 영역과 방향', () => {
  const u = unit({ x: 1000, z: 500 });
  assert.deepEqual(C.box(u), { x0: 600, x1: 1400, z0: 210, z1: 790 });
  u.rot = 90;
  assert.deepEqual(C.box(u), { x0: 710, x1: 1290, z0: 100, z1: 900 });
  assert.deepEqual(C.dirs(0), { f: { x: 0, z: 1 }, r: { x: 1, z: 0 } });
  assert.deepEqual(C.dirs(90).f, { x: 1, z: 0 });
  assert.equal(C.dirs(90).r.z, -1);
  assert.deepEqual(C.dirs(270).f, { x: -1, z: 0 });
  assert.deepEqual(C.localToWorld(unit({ x: 290, z: 900, rot: 90 }), 400, 290), { x: 580, z: 500 });
  assert.deepEqual(C.solidRects(u), [C.box(u)]);
});

test('내부 범위와 타공 간격', () => {
  assert.deepEqual(C.interior(unit()), { y0: 88, y1: 2082, w: 764, d: 571 });
  assert.deepEqual(C.interior(unit({ style: 'pole' })), { y0: 0, y1: 2100, w: 740, d: 580 });
  assert.equal(C.pitchNear(88), 88);
  assert.equal(C.pitchNear(100), 88);
  assert.equal(C.pitchNear(105), 120);
});

test('예시 배치는 문제 없이 방에 들어간다', () => {
  const d = C.sampleDesign();
  assert.deepEqual(d.units.map((u) => [u.x, u.z, u.rot, u.w]), [[400, 290, 0, 800], [1200, 290, 0, 800], [2000, 290, 0, 800]]);
  assert.deepEqual(C.checkDesign(d), []);
  const s = C.summary(d);
  assert.equal(s.units, 3);
  assert.ok(s.rods >= 3 && s.shelves >= 4 && s.drawers === 3 && s.doors === 0);
  assert.equal(d.openings.length, 1);
  assert.deepEqual(d.blocks, []);
});

test('예시 배치는 방 크기에 맞춰 다시 만들어진다', () => {
  for (const w of [1000, 1300, 1800, 2400, 3000, 4100, 8000]) {
    for (const dd of [1000, 1300, 2600]) {
      for (const h of [1800, 2300, 3200]) {
        const d = C.sampleDesign({ w, d: dd, h });
        assert.ok(d.units.length >= 1 && d.units.length <= 6, w + 'x' + dd);
        assert.deepEqual(bad(d), [], w + 'x' + dd + 'x' + h);
        assert.ok(!codes(d).includes('door'), 'sample keeps the door clear ' + w + 'x' + dd);
        for (const u of d.units) assert.ok(u.h <= h && u.parts.length >= 1);
      }
    }
  }
});

test('자석 앵커: 벽에 붙는다', () => {
  const u = unit({ x: 1200, z: 900 });
  const d = design([u]);
  let r = C.resolveUnitMove(u, { x: 1203, z: 340 }, ctxOf(d));
  assert.equal(r.z, 290);
  assert.equal(r.rot, 0);
  assert.ok(r.guides.some((g) => g.axis === 'z' && g.kind === 'wall' && g.at === 0));
  r = C.resolveUnitMove(u, { x: 1203, z: 903 }, ctxOf(d));
  assert.deepEqual([r.x, r.z, r.guides.length], [1200, 900, 0]);
  r = C.resolveUnitMove(u, { x: 1203, z: 340 }, ctxOf(d, { snap: false }));
  assert.deepEqual([r.x, r.z], [1203, 340]);
});

test('자석 앵커: 벽 가까이에서 벽을 등지도록 돈다', () => {
  const u = unit({ x: 1200, z: 900 });
  const d = design([u]);
  let r = C.resolveUnitMove(u, { x: 320, z: 900 }, ctxOf(d));
  assert.deepEqual([r.rot, r.x], [90, 290]);
  r = C.resolveUnitMove(u, { x: 2100, z: 900 }, ctxOf(d));
  assert.deepEqual([r.rot, r.x], [270, 2110]);
  r = C.resolveUnitMove(u, { x: 1200, z: 1470 }, ctxOf(d));
  assert.deepEqual([r.rot, r.z], [180, 1510]);
  r = C.resolveUnitMove(u, { x: 320, z: 900 }, ctxOf(d, { autoRotate: false }));
  assert.equal(r.rot, 0);
  u.x = 400; u.z = 290; u.rot = 0;
  r = C.resolveUnitMove(u, { x: 250, z: 280 }, ctxOf(d));
  assert.deepEqual([r.rot, r.x, r.z], [0, 400, 290]);
});

test('자석 앵커: 옆 유닛에 맞닿고, 같은 선에 정렬된다', () => {
  const a = unit({ x: 400, z: 290 });
  const b = unit({ x: 1700, z: 290 });
  const d = design([a, b]);
  let r = C.resolveUnitMove(b, { x: 1240, z: 290 }, ctxOf(d));
  assert.equal(r.x, 1200);
  assert.ok(r.guides.some((g) => g.axis === 'x' && g.kind === 'unit' && g.at === 800));
  const c = unit({ x: 1200, z: 1300, d: 400 });
  const d2 = design([a, c]);
  r = C.resolveUnitMove(c, { x: 425, z: 1300 }, ctxOf(d2, { autoRotate: false }));
  assert.equal(r.x, 400);
  assert.ok(r.guides.length >= 1);
});

test('충돌: 겹치지 않고, 막히면 닿는 곳에서 멈추며, 건너편이 비어 있으면 넘어간다', () => {
  const a = unit({ x: 400, z: 290 });
  const b = unit({ x: 1200, z: 290 });
  const m = unit({ x: 2000, z: 290 });
  const d = design([a, b, m]);
  let r = C.resolveUnitMove(m, { x: 1500, z: 290 }, ctxOf(d, { snap: false }));
  assert.equal(r.x, 2000);
  assert.ok(r.blocked);
  r = C.resolveUnitMove(m, { x: 900, z: 290 }, ctxOf(d));
  const mb = C.box(m, r.x, r.z, r.rot);
  assert.ok(!C.overlap(mb, C.box(a)) && !C.overlap(mb, C.box(b)));
  const d2 = design([b, m]);
  r = C.resolveUnitMove(m, { x: 410, z: 295 }, ctxOf(d2));
  assert.deepEqual([r.x, r.z], [400, 290]);
  const f = unit({ x: 1200, z: 1400, d: 400 });
  const d3 = design([b, f]);
  r = C.resolveUnitMove(f, { x: 1200, z: 700 }, ctxOf(d3, { snap: false, autoRotate: false }));
  assert.equal(r.z, 780);
});

test('충돌: 목표가 막혀 있으면 겹침이 풀리는 가장 가까운 자리로 간다', () => {
  const a = unit({ x: 400, z: 290 });
  const b = unit({ x: 1200, z: 290 });
  const m = unit({ x: 2000, z: 290 });
  const d = design([a, b, m]);
  let r = C.resolveUnitMove(m, { x: 500, z: 710 }, ctxOf(d, { autoRotate: false }));
  assert.equal(r.z, 870);
  assert.ok(Math.abs(r.x - 500) <= 100, 'x ' + r.x);
  assert.ok(r.blocked);
  r = C.resolveUnitMove(m, { x: 330, z: 710 }, ctxOf(d));
  assert.deepEqual([r.rot, r.x, r.z], [90, 290, 980]);
  assert.ok(r.guides.some((g) => g.kind === 'wall'));
  assert.ok(r.guides.some((g) => g.kind === 'unit'));
  r = C.resolveUnitMove(m, { x: 520, z: 700 }, ctxOf(d, { snap: false }));
  assert.deepEqual([r.x, r.z], [520, 870]);
});

test('자동 회전: 모서리에서는 목표에 더 잘 맞는 벽을 고른다', () => {
  const a = unit({ x: 400, z: 290 });
  const b = unit({ x: 1200, z: 290 });
  const m = unit({ x: 2000, z: 710 });
  const d = design([a, b, m]);
  let r = C.resolveUnitMove(m, { x: 2030, z: 600 }, ctxOf(d));
  m.x = r.x; m.z = r.z; m.rot = r.rot;
  assert.equal(r.rot, 270);
  r = C.resolveUnitMove(m, { x: 2020, z: 310 }, ctxOf(d));
  assert.deepEqual([r.rot, r.x, r.z], [0, 2000, 290]);
  const s = unit({ x: 1200, z: 290 });
  const d2 = design([s]);
  r = C.resolveUnitMove(s, { x: 300, z: 280 }, ctxOf(d2));
  assert.deepEqual([r.rot, r.x, r.z], [0, 400, 290]);
  r = C.resolveUnitMove(s, { x: 80, z: 300 }, ctxOf(d2));
  assert.deepEqual([r.rot, r.x], [90, 290]);
});

test('부품 이동: 32mm 타공, 위아래 부품, 내부 끝에 붙는다', () => {
  const u = unit();
  const shelf = { id: 's1', type: 'shelf', y: 1000 };
  const rod = { id: 'r1', type: 'rod', y: 1500 };
  u.parts = [shelf, rod];
  const d = design([u]);
  const on = { snap: true, thresh: 80 };
  let r = C.resolvePartMove(d, u, shelf, 705, on);
  assert.deepEqual([r.snap, r.y], ['pitch', 696]);
  r = C.resolvePartMove(d, u, shelf, 705.4, { snap: false, thresh: 80 });
  assert.equal(r.y, 705);
  r = C.resolvePartMove(d, u, shelf, 1470, on);
  assert.deepEqual([r.y, r.snap], [1482, 'stack']);
  r = C.resolvePartMove(d, u, shelf, 60, on);
  assert.equal(r.y, 88);
  r = C.resolvePartMove(d, u, rod, 5000, on);
  assert.equal(r.y, 2082 - 32);
  r = C.resolvePartMove(d, u, shelf, 1510, { snap: false, thresh: 80 });
  assert.ok(r.y + 18 <= 1500 || r.y >= 1532);
  r = C.resolvePartMove(d, u, shelf, 1600, { snap: false, thresh: 80 });
  assert.equal(r.y, 1600);
});

test('부품 이동: 행거봉 위에는 옷걸이 고리 여유를 남기고 붙는다', () => {
  const u = unit();
  const shelf = { id: 's1', type: 'shelf', y: 1752 };
  const rod = { id: 'r1', type: 'rod', y: 1200 };
  u.parts = [shelf, rod];
  const d = design([u]);
  const on = { snap: true, thresh: 80 };
  let r = C.resolvePartMove(d, u, rod, 1752 - 32 - 30, on);
  assert.deepEqual([r.y, r.snap], [1752 - 44 - 32, 'stack']);
  rod.y = r.y;
  assert.ok(!codes(d).includes('hook'));
  shelf.y = 1900;
  r = C.resolvePartMove(d, u, shelf, rod.y + 32 + 20, on);
  assert.equal(r.y, rod.y + 32 + 44);
  shelf.y = rod.y + 32;
  assert.ok(C.checkDesign(d).some((i) => i.code === 'hook' && i.partId === 'r1'));
  for (const key of ['long', 'double', 'drawers']) {
    const k = unit();
    k.parts = C.presetParts(k, key);
    assert.ok(!codes(design([k])).includes('hook'), key);
  }
});

test('부품 이동: 옆 유닛의 같은 높이에 맞춰진다', () => {
  const a = unit({ x: 400 });
  const b = unit({ x: 1200 });
  a.parts = [{ id: 'as', type: 'shelf', y: 1011 }, { id: 'ar', type: 'rod', y: 1707 }, { id: 'ad', type: 'drawer', y: 88, n: 3, eh: 180 }];
  const bs = { id: 'bs', type: 'shelf', y: 500 };
  const br = { id: 'br', type: 'rod', y: 1300 };
  const bd = { id: 'bd', type: 'drawer', y: 88, n: 2, eh: 200 };
  b.parts = [bs, br, bd];
  const d = design([a, b]);
  const on = { snap: true, thresh: 80 };
  let r = C.resolvePartMove(d, b, bs, 1000, on);
  assert.deepEqual([r.y, r.snap], [1011, 'align']);
  assert.deepEqual(r.guides, [{ y: 1029, kind: 'align', unitIds: [a.id] }]);
  r = C.resolvePartMove(d, b, br, 1690, on);
  assert.deepEqual([r.y, r.guides[0].y], [1707, 1723]);
  r = C.resolvePartMove(d, b, bs, 600, on);
  assert.equal(r.y, 628 - 18);
  r = C.resolvePartMove(d, b, br, 1015, on);
  assert.notEqual(r.snap, 'align');
});

test('부품: 새로 넣기, 높이 직접 입력, 서랍 크기 변경', () => {
  const u = unit();
  for (const t of ['rod', 'shelf', 'drawer', 'shelf', 'rod']) {
    const p = C.makePart(u, t);
    assert.ok(p, t);
    u.parts.push(p);
  }
  assert.ok(!codes(design([u])).includes('parts'));
  const dr = u.parts.find((p) => p.type === 'drawer');
  assert.equal(dr.y, 88);
  assert.ok(C.setDrawerSize(u, dr, 4, 200));
  assert.equal(C.partH(dr), 800);
  assert.ok(!codes(design([u])).includes('parts'));
  const sh = u.parts.find((p) => p.type === 'shelf');
  assert.ok(C.setPartRef(u, sh, 300));
  assert.ok(sh.y >= 888 || sh.y + 18 <= 88);
  const small = unit({ h: 400 });
  small.parts.push(C.makePart(small, 'drawer'));
  assert.equal(C.partH(small.parts[0]), 180);
  assert.equal(C.makePart(small, 'drawer'), null);
  assert.ok(C.makePart(small, 'shelf'));
});

test('방향키 이동: 다음 타공 위치로, 막히면 건너뛴다', () => {
  const u = unit();
  const sh = { id: 's', type: 'shelf', y: 1658 };
  const rod = { id: 'r', type: 'rod', y: 1688 };
  u.parts = [sh, rod];
  assert.equal(C.stepPart(u, sh, -1, { pitch: true }), 1656);
  sh.y = 1656;
  assert.equal(C.stepPart(u, sh, -1, { pitch: true }), 1624);
  assert.equal(C.stepPart(u, sh, -1, { pitch: true, count: 3 }), 1560);
  assert.equal(C.stepPart(u, sh, 1, { pitch: true }), 1670);
  sh.y = 1670;
  assert.equal(C.stepPart(u, sh, 1, { pitch: true }), 1720);
  assert.equal(C.stepPart(u, sh, 1, { step: 1 }), 1720);
  sh.y = 500;
  assert.equal(C.stepPart(u, sh, -1, { step: 10 }), 490);
  sh.y = 88;
  assert.equal(C.stepPart(u, sh, -1, { pitch: true }), 88);
});

test('추천 구성: 어떤 크기에서도 겹치지 않는다', () => {
  for (const style of ['panel', 'pole']) {
    for (let h = 400; h <= 3000; h += 130) {
      for (const key of ['long', 'double', 'drawers', 'shelves', 'mixed']) {
        const u = unit({ h, style });
        u.parts = C.presetParts(u, key);
        assert.ok(!codes(design([u])).includes('parts'), style + ' ' + h + ' ' + key);
        if (h >= 1000) assert.ok(u.parts.length >= 1, style + ' ' + h + ' ' + key);
      }
    }
  }
  for (let h = 400; h <= 3000; h += 50) {
    for (const key of ['double', 'drawers']) {
      const k = unit({ h });
      k.parts = C.presetParts(k, key);
      const rods = k.parts.filter((p) => p.type === 'rod');
      if (key === 'drawers' || rods.length > 1) for (const p of rods) assert.ok(C.hangClear(k, p) >= K.HANG.short, key + ' ' + h);
    }
  }
  const u = unit();
  u.parts = C.presetParts(u, 'double');
  const rods = u.parts.filter((p) => p.type === 'rod').sort((a, b) => b.y - a.y);
  assert.equal(rods.length, 2);
  assert.ok(Math.abs(C.hangClear(u, rods[0]) - C.hangClear(u, rods[1])) < 40);
  u.parts = C.presetParts(u, 'drawers');
  assert.equal(C.hangLabel(C.hangClear(u, u.parts.find((p) => p.type === 'rod'))), '셔츠·재킷');
});

test('크기 변경: 깊이는 뒷면 고정, 폭은 막히지 않은 쪽으로', () => {
  const a = unit({ x: 400, z: 290 });
  const b = unit({ x: 1200, z: 290 });
  const d = design([a, b]);
  C.applyResize(b, { d: 400 }, d);
  assert.deepEqual([C.box(b).z0, b.z], [0, 200]);
  C.applyResize(b, { w: 1000 }, d);
  assert.deepEqual([C.box(b).x0, C.box(b).x1], [800, 1800]);
  const c = unit({ x: 2000, z: 290 });
  const d2 = design([c]);
  C.applyResize(c, { w: 600 }, d2);
  assert.deepEqual([C.box(c).x0, C.box(c).x1], [1800, 2400]);
  C.applyResize(c, { w: 900 }, d2);
  assert.deepEqual([C.box(c).x0, C.box(c).x1], [1500, 2400]);
  const l = unit({ x: 1200, z: 290 });
  const r2 = unit({ x: 2000, z: 290 });
  C.applyResize(r2, { w: 600 }, design([l, r2]));
  assert.deepEqual([C.box(r2).x0, C.box(r2).x1], [1800, 2400]);
  const w = unit({ x: 290, z: 900, rot: 90 });
  C.applyResize(w, { d: 400 }, design([w]));
  assert.deepEqual([C.box(w).x0, C.box(w).x1], [0, 400]);
  const t = unit();
  t.parts = C.presetParts(t, 'long');
  C.applyResize(t, { h: 1200 }, design([t]));
  for (const p of t.parts) assert.ok(p.y + C.partH(p) <= 1200 - 18);
});

test('빈 폭 채우기와 새 유닛 자리 찾기', () => {
  const a = unit({ x: 400, z: 290 });
  const m = unit({ x: 1500, z: 290, w: 500 });
  const d = design([a, m]);
  // 왼쪽 450 + 폭 500 + 오른쪽 650을 모두 채운다 (폭에 따로 정한 한도는 없다)
  const f = C.fitWidth(m, d);
  assert.deepEqual([f.w, f.x], [1600, 1600]);
  const g = C.unitGaps(m, d);
  assert.deepEqual([g.left.gap, g.right.gap, g.front.gap, g.back.gap, g.aisle], [450, 650, 1220, 0, 1220]);
  const d2 = design([a]);
  const n = C.makeUnit(d2, {});
  assert.equal(n.h, 2100);
  assert.deepEqual(C.findSpot(n, d2, a), { x: 1200, z: 290, rot: 0 });
  const full = C.sampleDesign();
  const n2 = C.makeUnit(full, { w: 600, d: 400 });
  const s2 = C.findSpot(n2, full, null);
  assert.ok(s2 && s2.rot !== 0);
  Object.assign(n2, s2); full.units.push(n2);
  assert.deepEqual(bad(full), []);
  assert.ok(!codes(full).includes('door'));
});

test('확인할 점: 겹침, 통로, 깊이, 문', () => {
  assert.ok(codes(design([unit({ x: 400 }), unit({ x: 900 })])).includes('overlap'));
  const n = unit({ x: 400, z: 290 });
  assert.ok(codes(design([n, unit({ x: 400, z: 1450, rot: 180, d: 700 })])).includes('aisle'));
  assert.ok(!codes(design([n, unit({ x: 400, z: 1510, rot: 180 })])).includes('aisle'));
  const sh = unit({ d: 350, z: 175 });
  sh.parts = [C.makePart(sh, 'rod')];
  assert.ok(codes(design([sh])).includes('depth'));
  const dd = design([unit({ x: 1900, z: 1510, rot: 180 })], { openings: [door()] });
  const hit = C.checkDesign(dd).find((i) => i.code === 'door');
  assert.ok(hit && hit.itemId === dd.openings[0].id && /문 1 앞 공간/.test(hit.text));
});

test('부품 목록: 같은 규격은 묶인다', () => {
  const rows = C.bom(C.sampleDesign());
  assert.deepEqual(rows.find((r) => r.kind === '측판'), { kind: '측판', spec: '580 × 2100 × 18', qty: 6 });
  assert.deepEqual(rows.find((r) => r.kind === '행거봉'), { kind: '행거봉', spec: 'Ø25 × 764', qty: 3 });
  assert.equal(rows.find((r) => r.kind === '서랍').qty, 3);
});

/* ---------- 불러오기와 이전 형식 ---------- */

test('불러오기 검증: 잘못된 값은 범위 안으로 정리된다', () => {
  assert.equal(C.normalizeDesign(null), null);
  assert.equal(C.normalizeDesign('x'), null);
  assert.equal(C.normalizeDesign({ units: [] }), null);
  const d = C.normalizeDesign({
    room: { w: 99999, d: 'abc', h: 10, wallColor: 'neon' },
    door: { wall: 'Q', offset: -5, width: 100000 },
    units: [
      { id: '<script>', name: '   ', x: -500, z: 99999, rot: 45, w: 5, h: 99999, d: 'x', style: 'weird', finish: 'neon', kind: 'boat', door: 'trap', doorFinish: 'gold', hinge: 'up',
        parts: [{ type: 'rod', y: 99999 }, { type: 'bomb', y: 3 }, { type: 'drawer', y: -5, n: 99, eh: 1 }, null] },
      null, 7,
    ],
  });
  // 숫자는 그림과 계산이 깨지지 않는 범위(방 300~50,000, 높이 300~20,000, 유닛 100~20,000)로 정리된다
  assert.deepEqual(d.room, { w: 50000, d: 1800, h: 300, wallColor: 'white' });
  assert.equal(d.v, 2);
  assert.deepEqual([d.openings.length, d.openings[0].wall, d.openings[0].type], [1, 'S', 'door']);
  // 문은 놓인 벽과 천장을 넘지 않는다
  assert.ok(d.openings[0].offset >= 0 && d.openings[0].offset + d.openings[0].width <= 50000 && d.openings[0].height <= 300);
  assert.equal(d.units.length, 1);
  const u = d.units[0];
  assert.match(u.id, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual([u.name, u.rot, u.w, u.h, u.style, u.finish, u.kind, u.door, u.doorFinish, u.hinge], ['유닛 1', 0, 100, 20000, 'panel', 'white', 'std', 'none', 'white', 'left']);
  assert.ok(C.inRoom(C.box(u), d.room));
  assert.equal(u.parts.length, 2);
  for (const p of u.parts) assert.ok(p.y >= 88 && p.y + C.partH(p) <= u.h - 18);
  const s = C.sampleDesign();
  assert.deepEqual(C.normalizeDesign(JSON.parse(JSON.stringify(s))), s);
});

test('이전 형식(문 하나)의 설계를 지금 형식으로 바꾼다', () => {
  const v1 = {
    v: 1, room: { w: 2400, d: 1800, h: 2300 }, door: { show: true, wall: 'S', offset: 1500, width: 830 },
    units: [{ d: 580, finish: 'white', h: 2100, id: 'uabfmd1p5p', name: '유닛 1', parts: [{ id: 'pabfmd27d8', type: 'rod', y: 1990 }, { id: 'pabfmd3ugu', type: 'rod', y: 1016 }], rot: 0, style: 'panel', w: 800, x: 400, z: 290 }],
  };
  const d = C.normalizeDesign(v1);
  assert.deepEqual(d.openings, [{ id: 'door1', type: 'door', wall: 'S', offset: 1500, width: 830, height: 2100, leaf: 'swing', swing: 'out', hinge: 'a' }]);
  assert.deepEqual(d.blocks, []);
  assert.deepEqual(d.units[0], { id: 'uabfmd1p5p', name: '유닛 1', kind: 'std', x: 400, z: 290, rot: 0, w: 800, h: 2100, d: 580, style: 'panel', finish: 'white', door: 'none', doorFinish: 'white', hinge: 'left', parts: v1.units[0].parts });
  // 같은 입력은 늘 같은 결과 (불필요한 다시 저장이 생기지 않는다)
  assert.equal(JSON.stringify(C.normalizeDesign(v1)), JSON.stringify(d));
  assert.equal(JSON.stringify(C.normalizeDesign(JSON.parse(JSON.stringify(d)))), JSON.stringify(d));
  // 문 앞 공간은 이전과 같다
  assert.deepEqual(C.doorZones(d)[0].rect, { x0: 1500, x1: 2330, z0: 1100, z1: 1800 });
  // 문 표시를 꺼 둔 설계에는 문이 없다
  assert.deepEqual(C.normalizeDesign({ room: v1.room, door: { show: false, wall: 'S', offset: 0, width: 800 }, units: [] }).openings, []);
  // 지금 형식에서 문을 모두 지운 설계는 그대로 문이 없다
  assert.deepEqual(C.normalizeDesign({ v: 2, room: v1.room, openings: [], blocks: [], units: [] }).openings, []);
});

test('불러오기: 종류별 조합 규칙', () => {
  const d = C.normalizeDesign({
    v: 2, room: { w: 3000, d: 2400, h: 2400, wallColor: 'sage' },
    openings: [{ type: 'window', wall: 'E', offset: 99999, width: 5, height: 9999, sill: 9999 }, { type: 'door', wall: 'N', leaf: 'slide', swing: 'in', hinge: 'b', offset: 100, width: 900, height: 2000 }],
    blocks: [{ kind: 'notch', x: 99999, z: -5, w: 900, d: 700, h: 2400 }, { kind: 'zzz', w: 1, d: 99999, h: 1200, full: false }],
    units: [
      { kind: 'corner', w: 600, w2: 1500, d: 700, door: 'slide', style: 'pole', parts: [{ type: 'drawer', n: 2, eh: 180 }, { type: 'rod', y: 1500 }] },
      { kind: 'mirror', w: 500, door: 'none', doorFinish: 'oak', style: 'pole' },
      { kind: 'std', style: 'pole', door: 'hinge' },
      { kind: 'std', door: 'slide', doorFinish: 'mirror', hinge: 'right', finish: 'oak' },
    ],
  });
  assert.equal(d.room.wallColor, 'sage');
  const w = d.openings[0];
  // 창문: 폭은 가장 작은 값(100), 벽 끝(2400 - 100)까지, 높이는 천장까지
  assert.deepEqual([w.type, w.wall, w.width, w.offset, w.height, w.sill], ['window', 'E', 100, 2300, 2400, 0]);
  assert.deepEqual(d.openings[1], { id: d.openings[1].id, type: 'door', wall: 'N', offset: 100, width: 900, height: 2000, leaf: 'slide', swing: 'in', hinge: 'b' });
  assert.deepEqual([d.blocks[0].kind, d.blocks[0].x, d.blocks[0].z, d.blocks[0].full, d.blocks[0].name], ['notch', 2550, 350, true, '꺾인 벽 1']);
  assert.deepEqual([d.blocks[1].kind, d.blocks[1].w, d.blocks[1].d, d.blocks[1].h, d.blocks[1].full, d.blocks[1].name], ['pillar', 10, 2400, 1200, false, '기둥 1']);
  const [c, m, p, s] = d.units;
  // 코너장의 두 깊이는 ㄱ자 모양이 유지되는 범위로 맞춰진다 (옆벽 쪽 깊이는 가로 600 - 100까지). 기둥형은 코너장에 없다.
  assert.deepEqual([c.kind, c.w, c.w2, c.d, c.d2, c.door, c.style, c.name, c.parts.map((k) => k.type)], ['corner', 600, 1500, 700, 500, 'none', 'panel', '코너장 1', ['rod']]);
  assert.deepEqual([m.kind, m.door, m.doorFinish, m.style, m.name], ['mirror', 'hinge', 'mirror', 'panel', '거울장 1']);
  assert.deepEqual([p.style, p.door, C.doorKind(p)], ['pole', 'none', 'none']);
  assert.deepEqual([s.door, s.doorFinish, s.hinge, s.name, p.name], ['slide', 'mirror', 'right', '유닛 2', '유닛 1']);
  assert.equal(JSON.stringify(C.normalizeDesign(JSON.parse(JSON.stringify(d)))), JSON.stringify(d));
});

/* ---------- 코너장 ---------- */

test('코너장: ㄱ자 바닥 영역과 방향별 모서리', () => {
  const c = corner();
  assert.deepEqual(C.box(c), { x0: 0, x1: 1000, z0: 0, z1: 1000 });
  assert.deepEqual(C.solidRects(c), [{ x0: 0, x1: 1000, z0: 0, z1: 580 }, { x0: 0, x1: 580, z0: 580, z1: 1000 }]);
  assert.equal(C.footprint(c).length, 6);
  // 방향 90: 왼쪽 아래 모서리. 날개 A는 왼쪽 벽을, 날개 B는 아래쪽 벽을 따라간다.
  const sw = corner({ rot: 90, x: 500, z: 1300 });
  assert.deepEqual(C.solidRects(sw), [{ x0: 0, x1: 580, z0: 800, z1: 1800 }, { x0: 580, x1: 1000, z0: 1220, z1: 1800 }]);
  const se = corner({ rot: 180, x: 1900, z: 1300 });
  assert.deepEqual(C.solidRects(se), [{ x0: 1400, x1: 2400, z0: 1220, z1: 1800 }, { x0: 1820, x1: 2400, z0: 800, z1: 1220 }]);
  const ne = corner({ rot: 270, x: 1900, z: 500 });
  assert.deepEqual(C.solidRects(ne), [{ x0: 1820, x1: 2400, z0: 0, z1: 1000 }, { x0: 1400, x1: 1820, z0: 0, z1: 580 }]);
  // 길이가 다른 날개
  const long = corner({ w: 1400, w2: 800, x: 700, z: 400 });
  assert.deepEqual(C.box(long), { x0: 0, x1: 1400, z0: 0, z1: 800 });
  assert.deepEqual(C.box(Object.assign({}, long, { rot: 90, x: 400, z: 1100 })), { x0: 0, x1: 800, z0: 400, z1: 1800 });
  assert.ok(C.facesWall(c, 0) && C.facesWall(c, 90) && !C.facesWall(c, 180) && !C.facesWall(c, 270));
  assert.ok(C.facesWall(unit(), 0) && !C.facesWall(unit(), 90));
});

test('코너장: 모서리 근처로 끌면 그 모서리에 맞게 돌아서 두 벽에 붙는다', () => {
  const want = [
    [{ x: 520, z: 530 }, [0, 500, 500]],
    [{ x: 1880, z: 530 }, [270, 1900, 500]],
    [{ x: 520, z: 1270 }, [90, 500, 1300]],
    [{ x: 1880, z: 1270 }, [180, 1900, 1300]],
  ];
  for (const start of [0, 90, 180, 270]) {
    for (const [desired, exp] of want) {
      const c = corner({ x: 1200, z: 900, rot: start });
      const d = design([c]);
      const r = C.resolveUnitMove(c, desired, ctxOf(d));
      assert.deepEqual([r.rot, r.x, r.z], exp, 'from ' + start + ' to ' + JSON.stringify(desired));
      Object.assign(c, { x: r.x, z: r.z, rot: r.rot });
      assert.ok(!codes(d).includes('corner'));
      assert.deepEqual(bad(d), []);
    }
  }
  // 벽 하나에만 가까우면 방향을 그대로 둔다
  const c = corner({ x: 1200, z: 900, rot: 0 });
  const r = C.resolveUnitMove(c, { x: 1200, z: 1270 }, ctxOf(design([c])));
  assert.deepEqual([r.rot, r.z], [0, 1300]);
  // 자동 회전을 끄면 돌지 않는다
  const r2 = C.resolveUnitMove(c, { x: 1880, z: 1270 }, ctxOf(design([c]), { autoRotate: false }));
  assert.equal(r2.rot, 0);
});

test('코너장: 빈 모서리를 찾아 놓이고, 옆에 유닛을 이어 붙인다', () => {
  const d = C.sampleDesign();
  const c = C.makeUnit(d, { kind: 'corner' });
  assert.deepEqual([c.kind, c.w, c.w2, c.d, c.name, c.style, c.door], ['corner', 1000, 1000, 580, '코너장 1', 'panel', 'none']);
  // 위쪽 벽이 찼고 오른쪽 아래에는 문이 있으니 왼쪽 아래 모서리
  assert.deepEqual(C.findSpot(c, d, null), { x: 500, z: 1300, rot: 90 });
  const e = design([]);
  const c2 = C.makeUnit(e, { kind: 'corner' });
  Object.assign(c2, C.findSpot(c2, e, null));
  assert.deepEqual([c2.x, c2.z, c2.rot], [500, 500, 0]);
  e.units.push(c2);
  const n = C.makeUnit(e, {});
  const s = C.findSpot(n, e, c2);
  assert.deepEqual(s, { x: 1400, z: 290, rot: 0 });
  Object.assign(n, s); e.units.push(n);
  const n2 = C.makeUnit(e, { w: 700 });
  const s2 = C.findSpot(n2, e, c2);
  assert.deepEqual(s2, { x: 290, z: 1350, rot: 90 });
  Object.assign(n2, s2); e.units.push(n2);
  assert.deepEqual(C.checkDesign(e), []);
});

test('코너장: 크기를 바꿔도 모서리는 제자리', () => {
  const c = corner();
  const d = design([c]);
  C.applyResize(c, { w: 1200 }, d);
  assert.deepEqual(C.box(c), { x0: 0, x1: 1200, z0: 0, z1: 1000 });
  C.applyResize(c, { w2: 1400 }, d);
  assert.deepEqual(C.box(c), { x0: 0, x1: 1200, z0: 0, z1: 1400 });
  // 깊이는 반대쪽 날개의 앞면이 100mm 남는 데까지 (옆 길이 1400 - 100)
  C.applyResize(c, { d: 900 }, d);
  assert.equal(c.d, 900);
  C.applyResize(c, { d: 5000 }, d);
  assert.equal(c.d, 1300);
  C.applyResize(c, { w: 600 }, d);
  assert.deepEqual([c.w, c.d, c.d2], [600, 1300, 500]);
  const se = corner({ rot: 180, x: 1900, z: 1300 });
  C.applyResize(se, { w: 1300, w2: 1100 }, design([se]));
  assert.deepEqual(C.box(se), { x0: 1100, x1: 2400, z0: 700, z1: 1800 });
  assert.equal(C.fitWidth(c, d), null);
});

test('코너장: 간격, 확인할 점, 부품', () => {
  const c = corner();
  const d = design([c]);
  const g = C.unitGaps(c, d);
  assert.deepEqual([g.back.gap, g.left.gap, g.right.gap, g.front.gap, g.aisleA.gap, g.aisleB.gap, g.aisle], [0, 0, 1400, 800, 1220, 1820, 1220]);
  assert.deepEqual(C.checkDesign(d), []);
  const mid = corner({ x: 1200, z: 900 });
  assert.ok(codes(design([mid])).includes('corner'));
  // 날개 앞을 다른 유닛이 막으면 통로 경고
  const blocker = unit({ x: 1400, z: 1000, rot: 180, w: 700 });
  assert.ok(C.checkDesign(design([c, blocker])).some((i) => i.code === 'aisle' && i.unitId === c.id));
  // 문 앞 공간은 실제 날개만 따진다: ㄱ자의 빈 안쪽은 막지 않는다
  const dz = design([corner({ rot: 180, x: 1900, z: 1300 })], { openings: [door({ wall: 'E', offset: 300, width: 500, leaf: 'none' })] });
  assert.deepEqual(C.doorZones(dz)[0].rect, { x0: 1700, x1: 2400, z0: 300, z1: 800 });
  assert.ok(!codes(dz).includes('door'));
  assert.deepEqual(C.partTypes(c), ['rod', 'shelf']);
  assert.equal(C.makePart(c, 'drawer'), null);
  for (const key of ['long', 'double', 'drawers', 'shelves', 'mixed']) {
    c.parts = C.presetParts(c, key);
    assert.ok(c.parts.length >= 1 && c.parts.every((p) => p.type !== 'drawer'), key);
    assert.ok(!codes(design([c])).includes('parts'), key);
  }
  c.parts = C.presetParts(c, 'long');
  const rows = C.bom(design([c]));
  assert.deepEqual(rows.filter((r) => r.kind === '행거봉').map((r) => r.spec), ['Ø25 × 684', 'Ø25 × 965']);
  assert.deepEqual(rows.filter((r) => r.kind === '선반').map((r) => r.spec), ['422 × 551 × 18', '973 × 551 × 18']);
  near(C.summary(design([c])).rodLen, 965 + 683.5, 0.6);
});

/* ---------- 벽체 ---------- */

test('벽체: 유닛은 벽체와 겹치지 않고, 벽처럼 붙는다', () => {
  const notch = block({ kind: 'notch', name: '꺾인 벽 1', x: 2000, z: 300, w: 800, d: 600 });
  const u = unit({ x: 1000, z: 1200 });
  const d = design([u], { blocks: [notch] });
  let r = C.resolveUnitMove(u, { x: 2000, z: 920 }, ctxOf(d));
  assert.deepEqual([r.rot, r.x, r.z], [0, 2000, 890]);
  assert.ok(r.guides.some((g) => g.kind === 'wall' && g.axis === 'z' && g.at === 600));
  // 벽체 안으로 끌면 가장 가까운 바깥 자리로
  r = C.resolveUnitMove(u, { x: 2000, z: 400 }, ctxOf(d));
  assert.ok(!C.overlap(C.box(u, r.x, r.z, r.rot), C.box(notch)));
  // 벽체의 옆면을 등지도록 돈다 (폭의 절반 이상이 걸칠 때)
  r = C.resolveUnitMove(u, { x: 1280, z: 450 }, ctxOf(d));
  assert.deepEqual([r.rot, r.x, r.z], [270, 1310, 400]);
  // 겹쳐 있으면 알려 준다
  u.x = 1900; u.z = 290; u.rot = 0;
  assert.ok(C.checkDesign(d).some((i) => i.code === 'overlap' && i.itemId === notch.id && i.level === 'bad'));
});

test('벽체: 작은 기둥은 등질 벽으로 치지 않는다', () => {
  const pillar = block({ x: 1200, z: 150 });
  const u = unit({ x: 1200, z: 1200, rot: 180 });
  const d = design([u], { blocks: [pillar] });
  const r = C.resolveUnitMove(u, { x: 1200, z: 610 }, ctxOf(d));
  assert.deepEqual([r.rot, r.z], [180, 590]);
  assert.equal(C.faceDist({ x: 1200, z: 610 }, C.half(u, 0), '-z', d.room, [C.box(pillar)]), 610);
  assert.equal(C.faceDist({ x: 1200, z: 610 }, { hx: 150, hz: 290 }, '-z', d.room, [C.box(pillar)]), 310);
});

test('벽체: 새 유닛은 벽체를 피하고 벽체의 면도 벽으로 쓴다', () => {
  const notch = block({ kind: 'notch', x: 2000, z: 300, w: 800, d: 600 });
  const d = design([], { blocks: [notch] });
  const spots = [];
  for (let i = 0; i < 3; i++) {
    const n = C.makeUnit(d, {});
    const s = C.findSpot(n, d, null);
    Object.assign(n, s); d.units.push(n);
    spots.push([s.x, s.z, s.rot]);
  }
  assert.deepEqual(spots, [[400, 290, 0], [1200, 290, 0], [2000, 890, 0]]);
  assert.deepEqual(bad(d), []);
  const g = C.unitGaps(d.units[1], d);
  assert.deepEqual([g.right.gap, g.right.wall, g.left.wall], [0, true, false]);
  // 벽체에 붙은 쪽을 고정하고 폭을 늘린다
  d.units.shift();
  C.applyResize(d.units[0], { w: 1000 }, d);
  assert.deepEqual([C.box(d.units[0]).x0, C.box(d.units[0]).x1], [600, 1600]);
});

test('벽체: 끌어 옮기기, 크기 바꾸기, 놓을 자리', () => {
  const u = unit({ x: 400, z: 290 });
  const p = block({ x: 1500, z: 900 });
  const d = design([u], { blocks: [p] });
  let r = C.resolveUnitMove(p, { x: 2270, z: 130 }, ctxOf(d, { autoRotate: false }));
  assert.deepEqual([r.x, r.z, r.rot], [2250, 150, 0]);
  // 유닛 위로는 올라가지 않는다
  r = C.resolveUnitMove(p, { x: 500, z: 300 }, ctxOf(d, { autoRotate: false }));
  assert.ok(!C.overlap({ x0: r.x - 150, x1: r.x + 150, z0: r.z - 150, z1: r.z + 150 }, C.box(u)));
  Object.assign(p, { x: 2250, z: 150 });
  C.applyResize(p, { w: 600 }, d, K.LIM.block);
  assert.deepEqual(C.box(p), { x0: 1800, x1: 2400, z0: 0, z1: 300 });
  C.applyResize(p, { d: 500 }, d, K.LIM.block);
  assert.deepEqual(C.box(p), { x0: 1800, x1: 2400, z0: 0, z1: 500 });
  const d2 = C.sampleDesign();
  const nb = C.makeBlock(d2, 'notch');
  assert.deepEqual([nb.name, nb.w, nb.d, nb.full, nb.h], ['꺾인 벽 1', 800, 600, true, 2300]);
  const s = C.findBlockSpot(nb, d2);
  // 위쪽 모서리는 유닛이, 오른쪽 아래는 문 앞이 차지하고 있어 왼쪽 아래 모서리
  assert.deepEqual(s, { x: 400, z: 1500 });
  const pil = C.makeBlock(d2, 'pillar');
  assert.deepEqual(C.findBlockSpot(pil, d2), { x: 150, z: 1650 });
  const wall = C.makeBlock(d2, 'partition');
  assert.deepEqual([wall.w, wall.d, wall.name], [100, 900, '가벽 1']);
  const ws = C.findBlockSpot(wall, d2);
  assert.ok(!ws.forced && ws.z === 1350, JSON.stringify(ws));
  const low = block({ h: 900, full: false });
  C.fixBlock(low, room);
  assert.deepEqual([low.h, low.full, C.blockH(low, room)], [900, false, 900]);
  low.h = 5000; C.fixBlock(low, room);
  assert.deepEqual([low.h, low.full], [2300, true]);
  assert.equal(C.blockH(low, { w: 1, d: 1, h: 2600 }), 2600);
});

/* ---------- 문과 창문 ---------- */

test('문: 벽마다 앞에 비워 둘 영역', () => {
  const d = design([], { openings: [
    door(),
    door({ wall: 'N', offset: 100, width: 900, swing: 'in' }),
    door({ wall: 'W', offset: 200, leaf: 'slide' }),
    door({ wall: 'E', offset: 200, leaf: 'none' }),
    win(),
  ] });
  assert.deepEqual(C.doorZones(d).map((z) => z.rect), [
    { x0: 1500, x1: 2300, z0: 1100, z1: 1800 },
    { x0: 100, x1: 1000, z0: 0, z1: 900 },
    { x0: 0, x1: 700, z0: 200, z1: 1000 },
    { x0: 1700, x1: 2400, z0: 200, z1: 1000 },
  ]);
  assert.deepEqual(d.openings.map((o) => C.openingName(d, o)), ['문 1', '문 2', '문 3', '문 4', '창문 1']);
  assert.equal(C.zoneDepth(door({ width: 600, swing: 'in' })), 700);
  assert.deepEqual(C.wallPoint(room, 'S', 300, 50), { x: 300, z: 1750 });
  assert.deepEqual(C.wallPoint(room, 'E', 300, 50), { x: 2350, z: 300 });
});

test('문·창문 옮기기: 끝, 가운데, 옆 문에 붙고 서로 겹치지 않는다', () => {
  const o = door({ offset: 400 });
  const d = design([], { openings: [o] });
  const on = { snap: true, thresh: 80 };
  assert.deepEqual(C.resolveOpeningMove(d, o, 'S', 30, on), { wall: 'S', offset: 0, width: 800, snap: 'end', blocked: false });
  assert.equal(C.resolveOpeningMove(d, o, 'S', 1570, on).offset, 1600);
  assert.deepEqual([C.resolveOpeningMove(d, o, 'S', 790, on).offset, C.resolveOpeningMove(d, o, 'S', 790, on).snap], [800, 'center']);
  assert.equal(C.resolveOpeningMove(d, o, 'S', 433, on).offset, 430);
  assert.equal(C.resolveOpeningMove(d, o, 'S', 433.4, { snap: false, thresh: 80 }).offset, 433);
  assert.equal(C.resolveOpeningMove(d, o, 'S', 99999, on).offset, 1600);
  // 다른 벽으로 옮기면 그 벽의 길이에 맞춘다
  assert.deepEqual([C.resolveOpeningMove(d, o, 'W', 1500, on).offset, C.resolveOpeningMove(d, o, 'W', 480, on).snap], [1000, 'center']);
  const w = win({ wall: 'S', offset: 0, width: 600 });
  d.openings.push(w);
  assert.equal(C.resolveOpeningMove(d, o, 'S', 550, on).offset, 600);
  assert.deepEqual([C.resolveOpeningMove(d, o, 'S', 630, on).offset, C.resolveOpeningMove(d, o, 'S', 630, on).snap], [600, 'next']);
  d.blocks.push(block({ x: 1150, z: 1650 }));
  assert.equal(C.resolveOpeningMove(d, o, 'S', 900, on).offset, 1300);
  assert.deepEqual(C.wallFree(d, 'S', o.id), [[600, 1000], [1300, 2400]]);
});

test('문·창문: 새로 넣을 자리와 확인할 점', () => {
  const d = C.sampleDesign();
  const nd = C.makeOpening(d, 'door');
  assert.deepEqual(C.findOpeningSpot(nd, d), { wall: 'S', offset: 350 });
  const nw = C.makeOpening(d, 'window');
  assert.deepEqual([nw.width, nw.height, nw.sill], [1200, 1200, 900]);
  assert.deepEqual(C.findOpeningSpot(nw, d), { wall: 'S', offset: 150 });
  // 높은 유닛은 창문을 가리고, 창대보다 낮은 유닛은 가리지 않는다
  const tall = unit();
  const d2 = design([tall], { openings: [win()] });
  const hit = C.checkDesign(d2).find((i) => i.code === 'window');
  assert.ok(hit && hit.unitId === tall.id && /창문 1 앞을 가립니다/.test(hit.text));
  tall.h = 900;
  assert.ok(!codes(d2).includes('window'));
  // 같은 벽에서 겹침, 벽체에 막힘
  const d3 = design([], { openings: [door({ offset: 500 }), win({ wall: 'S', offset: 1000 })], blocks: [block({ x: 700, z: 1650 })] });
  assert.deepEqual(codes(d3).sort(), ['open-block', 'open-overlap']);
  // 방이 낮아지면 높이를 맞춘다
  const o = door();
  C.fixOpening(o, { w: 2400, d: 1800, h: 1900 });
  assert.equal(o.height, 1900);
  const ww = win({ height: 1500 });
  C.fixOpening(ww, { w: 1000, d: 1000, h: 1800 });
  assert.deepEqual([ww.width, ww.offset, ww.height, ww.sill], [1000, 0, 1500, 300]);
});

test('벽 끌기: 방 크기가 바뀌고 안의 것들은 제자리에 있다', () => {
  const u = unit({ x: 400, z: 290 });
  const d = design([u], { openings: [door()] });
  let r = C.resizeRoomByWall(d, 'E', 3003, { snap: false });
  assert.deepEqual([d.room.w, r.dx, r.dz, u.x], [3003, 0, 0, 400]);
  // 문(1500~2300)에 닿으면 멈춘다
  r = C.resizeRoomByWall(d, 'E', 500, { snap: false });
  assert.equal(d.room.w, 2300);
  // 문을 지우면 유닛(0~800)에 닿을 때까지 줄어든다
  d.openings.length = 0;
  r = C.resizeRoomByWall(d, 'E', 500, { snap: false });
  assert.equal(d.room.w, 800);
  // 왼쪽 벽을 바깥으로: 방이 넓어지고 좌표가 그만큼 밀린다
  r = C.resizeRoomByWall(d, 'W', -600, { snap: false });
  assert.deepEqual([d.room.w, r.dx, u.x], [1400, 600, 1000]);
  // 왼쪽 벽을 안으로: 유닛에 닿으면 멈춘다
  r = C.resizeRoomByWall(d, 'W', 900, { snap: false });
  assert.deepEqual([d.room.w, r.dx, C.box(u).x0], [800, -600, 0]);
  // 안에 아무것도 없으면 가장 작은 방(300)까지 줄어든다
  const bare = design([]);
  C.resizeRoomByWall(bare, 'E', 5, { snap: false });
  assert.equal(bare.room.w, 300);
  C.resizeRoomByWall(bare, 'E', 99999, { snap: false });
  assert.equal(bare.room.w, 50000);
  // 자석: 가구에 딱 맞는 크기, 100 단위
  const v = unit({ x: 1200, z: 290 });
  const d2 = design([unit({ x: 400, z: 290 }), v]);
  r = C.resizeRoomByWall(d2, 'E', 1650, { snap: true, thresh: 80 });
  assert.deepEqual([d2.room.w, r.fit], [1600, true]);
  r = C.resizeRoomByWall(d2, 'E', 2012, { snap: true, thresh: 80 });
  assert.deepEqual([d2.room.w, r.fit], [2000, false]);
  r = C.resizeRoomByWall(d2, 'E', 2043, { snap: true, thresh: 80 });
  assert.equal(d2.room.w, 2040);
  // 위·아래 벽
  r = C.resizeRoomByWall(d2, 'S', 2500, { snap: true, thresh: 80 });
  assert.equal(d2.room.d, 2500);
  const d3 = design([unit({ x: 400, z: 290 })], { openings: [door({ wall: 'W', offset: 900, width: 800 })], blocks: [block({ x: 2250, z: 1650 })] });
  r = C.resizeRoomByWall(d3, 'N', -400, { snap: false });
  assert.deepEqual([d3.room.d, r.dz, d3.units[0].z, d3.blocks[0].z, d3.openings[0].offset], [2200, 400, 690, 2050, 1300]);
  r = C.resizeRoomByWall(d3, 'N', 9999, { snap: false });
  assert.deepEqual([d3.room.d, d3.units[0].z], [1800, 290]);
  r = C.resizeRoomByWall(d3, 'S', -50, { snap: false });
  assert.equal(d3.room.d, 1800);
});

/* ---------- 유닛 문짝 ---------- */

test('문짝: 달 수 있는 조합과 여닫이문 구성', () => {
  assert.equal(C.doorKind(unit({ door: 'hinge' })), 'hinge');
  assert.equal(C.doorKind(unit({ door: 'slide' })), 'slide');
  assert.equal(C.doorKind(unit({ door: 'hinge', style: 'pole' })), 'none');
  assert.equal(C.doorKind(corner({ door: 'slide' })), 'none');
  assert.equal(C.doorKind(corner({ door: 'hinge' })), 'hinge');
  assert.equal(C.doorKind(unit({ kind: 'mirror', door: 'none' })), 'hinge');
  assert.equal(C.doorFinishOf(unit({ kind: 'mirror', doorFinish: 'oak' })), 'mirror');
  assert.equal(C.doorFinishOf(unit({ doorFinish: 'oak' })), 'oak');
  // 문짝은 걸레받이 위(72)에서 시작해 전체 높이를 가린다
  assert.deepEqual(C.hingeInfo(unit({ w: 600 })), { leaves: 1, widths: [596], height: 2026, y0: 72, swing: 596 });
  assert.deepEqual(C.hingeInfo(unit({ w: 800 })), { leaves: 2, widths: [396.5, 396.5], height: 2026, y0: 72, swing: 396.5 });
  assert.deepEqual(C.hingeInfo(corner()), { leaves: 2, widths: [398, 418], height: 2026, y0: 72, swing: 420 });
  assert.deepEqual([C.frontExtra(unit()), C.frontExtra(unit({ door: 'hinge' })), C.frontExtra(unit({ door: 'slide' }))], [0, 20, 80]);
  const m = C.makeUnit(design([]), { kind: 'mirror' });
  assert.deepEqual([m.kind, m.w, m.door, m.doorFinish, m.style, m.name, C.doorKind(m)], ['mirror', 500, 'hinge', 'mirror', 'panel', '거울장 1', 'hinge']);
});

test('문짝: 여닫이문이 열리는 자리와 통로', () => {
  const u = unit({ w: 600, x: 300, door: 'hinge' });
  const tight = design([u]);
  tight.room.d = 1100;
  const list = C.checkDesign(tight);
  assert.ok(list.some((i) => i.code === 'swing' && /앞 공간이 520mm라 여닫이문\(596mm\)/.test(i.text)));
  assert.ok(list.some((i) => i.code === 'aisle' && /500mm/.test(i.text)));
  const edge = design([unit({ door: 'hinge' })]);
  edge.room.d = 1195;
  assert.ok(codes(edge).includes('aisle'));
  edge.units[0].door = 'none';
  assert.ok(!codes(edge).includes('aisle'));
  assert.ok(codes(design([unit({ w: 1400, x: 700, door: 'hinge' })])).includes('leaf'));
  assert.ok(!codes(design([unit({ w: 1200, x: 600, door: 'hinge' })])).includes('leaf'));
});

test('미닫이문: 맞닿은 유닛을 한 줄로 묶어 문짝을 나눈다', () => {
  const a = unit({ x: 400, door: 'slide' });
  const b = unit({ x: 1200, door: 'slide' });
  const c = unit({ x: 2000, door: 'slide' });
  const d = design([c, a, b]);
  let runs = C.slideRuns(d);
  assert.equal(runs.length, 1);
  assert.deepEqual([runs[0].w, runs[0].n, runs[0].bay, runs[0].pw, runs[0].a0, runs[0].a1, runs[0].front, runs[0].rot], [2400, 3, 800, 820, 0, 2400, 580, 0]);
  assert.deepEqual(runs[0].ids, [a.id, b.id, c.id]);
  assert.deepEqual(C.checkDesign(d), []);
  assert.equal(C.summary(d).doors, 3);
  // 앞선이 다르면 따로
  c.z = 700;
  runs = C.slideRuns(d);
  assert.deepEqual(runs.map((r) => [r.w, r.n]), [[1600, 2], [800, 2]]);
  assert.ok(C.checkDesign(d).some((i) => i.code === 'slide-narrow' && i.unitId === c.id) === false);
  // 높이가 다르면 따로
  c.z = 290; c.h = 1800;
  assert.equal(C.slideRuns(d).length, 2);
  // 가운데 유닛이 여닫이면 양쪽이 따로
  c.h = 2100; b.door = 'hinge';
  assert.deepEqual(C.slideRuns(d).map((r) => r.ids), [[a.id], [c.id]]);
  // 벽을 등진 방향이 달라도 같은 규칙
  const w1 = unit({ rot: 90, x: 290, z: 400, door: 'slide' });
  const w2 = unit({ rot: 90, x: 290, z: 1200, door: 'slide' });
  runs = C.slideRuns(design([w2, w1]));
  assert.deepEqual([runs.length, runs[0].w, runs[0].n, runs[0].front, runs[0].rot], [1, 1600, 2, 580, 90]);
  assert.deepEqual([2, 3, 4, 5].map((n) => C.slidePanelCount(n * 800, Array.from({ length: n - 1 }, (_, i) => (i + 1) * 800))), [2, 3, 4, 5]);
  assert.equal(C.slidePanelCount(2000, [500, 1000, 1500]), 2);
  assert.equal(C.slidePanelCount(800, []), 2);
});

test('미닫이문: 서랍이 문짝 두 칸에 걸치면 알려 준다', () => {
  const a = unit({ x: 400, door: 'slide' });
  const b = unit({ x: 1050, w: 500, door: 'slide' });
  a.parts = C.presetParts(a, 'drawers');
  const d = design([a, b]);
  const runs = C.slideRuns(d);
  assert.deepEqual([runs[0].w, runs[0].n, runs[0].bay], [1300, 2, 650]);
  const hit = C.checkDesign(d).find((i) => i.code === 'slide-drawer');
  assert.ok(hit && hit.unitId === a.id && hit.partId === a.parts.find((p) => p.type === 'drawer').id && /650mm/.test(hit.text));
  // 유닛 폭과 문짝 칸이 맞으면 괜찮다
  const m = [unit({ x: 400, door: 'slide' }), unit({ x: 1200, door: 'slide' }), unit({ x: 2000, door: 'slide' })];
  m[1].parts = C.presetParts(m[1], 'drawers');
  assert.ok(!codes(design(m)).includes('slide-drawer'));
  // 좁은 유닛 하나에 미닫이문
  const solo = design([unit({ w: 600, x: 300, door: 'slide' })]);
  assert.ok(codes(solo).includes('slide-narrow'));
  assert.ok(codes(design([unit({ w: 1500, x: 750, door: 'slide' })])).includes('slide-narrow') === false);
});

test('문짝: 부품 목록과 요약', () => {
  const d = design([
    unit({ x: 400, door: 'hinge' }),
    unit({ kind: 'mirror', w: 500, x: 1050, door: 'hinge', doorFinish: 'mirror' }),
    corner({ rot: 180, x: 1900, z: 1300, door: 'hinge' }),
  ]);
  const rows = C.bom(d);
  assert.deepEqual(rows.find((r) => r.kind === '여닫이문'), { kind: '여닫이문', spec: '397 × 2026 × 18', qty: 2 });
  assert.deepEqual(rows.find((r) => r.kind === '여닫이문 (거울)'), { kind: '여닫이문 (거울)', spec: '496 × 2026 × 18', qty: 1 });
  assert.deepEqual(rows.find((r) => r.kind === '코너 접이문'), { kind: '코너 접이문', spec: '398 + 418 × 2026 × 18', qty: 1 });
  assert.equal(C.summary(d).doors, 5);
  const s = design([unit({ x: 400, door: 'slide', doorFinish: 'mirror' }), unit({ x: 1200, door: 'slide' }), unit({ x: 2000, door: 'slide' })]);
  const rs = C.bom(s);
  assert.deepEqual(rs.find((r) => r.kind === '미닫이문 (거울)'), { kind: '미닫이문 (거울)', spec: '820 × 2076', qty: 3 });
  assert.deepEqual(rs.find((r) => r.kind === '미닫이 레일 (상·하)'), { kind: '미닫이 레일 (상·하)', spec: '2400', qty: 1 });
});

/* ---------- 예시 배치와 무작위 검증 ---------- */

test('예시 배치: 문·창문·벽체를 피해 가장 긴 벽에 선다', () => {
  const d = C.emptyDesign();
  d.openings.push(win({ offset: 600 }));
  d.units = C.sampleUnits(d);
  assert.deepEqual(d.units.map((u) => [u.x, u.z, u.rot, u.w]), [[290, 450, 90, 900], [290, 1350, 90, 900]]);
  assert.deepEqual(C.checkDesign(d), []);
  // 왼쪽 벽도 막히면 오른쪽 벽의 문 앞을 뺀 구간
  d.blocks.push(block({ kind: 'notch', x: 400, z: 1500, w: 800, d: 600 }));
  d.units = C.sampleUnits(d);
  assert.ok(d.units.length >= 1);
  assert.deepEqual(C.checkDesign(d), []);
  // 설 자리가 없으면 비워 둔다
  const tiny = C.emptyDesign({ w: 1000, d: 1000, h: 2300 });
  tiny.openings = [door({ wall: 'N', offset: 100 }), door({ wall: 'S', offset: 100 }), door({ wall: 'W', offset: 100 }), door({ wall: 'E', offset: 100 })];
  assert.deepEqual(C.sampleUnits(tiny), []);
});

test('무작위 끌기: 유닛·코너장·벽체가 섞여 있어도 방을 벗어나거나 겹치지 않는다', () => {
  let seed = 20261008;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let round = 0; round < 30; round++) {
    const d = C.sampleDesign({ w: 3000 + Math.floor(rnd() * 4) * 300, d: 2400 + Math.floor(rnd() * 3) * 300, h: 2300 });
    const pb = C.makeBlock(d, rnd() < 0.5 ? 'notch' : 'pillar');
    Object.assign(pb, C.findBlockSpot(pb, d));
    d.blocks.push(pb);
    const c = C.makeUnit(d, { kind: 'corner', w: 900 + Math.floor(rnd() * 3) * 100, w2: 900 + Math.floor(rnd() * 3) * 100 });
    const cs = C.findSpot(c, d, null);
    assert.ok(cs, 'corner spot');
    Object.assign(c, cs); d.units.push(c);
    const extra = C.makeUnit(d, { w: 500 + Math.floor(rnd() * 5) * 100, d: 400 });
    const es = C.findSpot(extra, d, null);
    assert.ok(es, 'spot');
    Object.assign(extra, es); d.units.push(extra);
    assert.deepEqual(bad(d), [], 'start ' + round);
    for (let step = 0; step < 250; step++) {
      const movers = d.units.concat(d.blocks);
      const u = movers[Math.floor(rnd() * movers.length)];
      const target = { x: u.x + (rnd() - 0.5) * 1100, z: u.z + (rnd() - 0.5) * 1100 };
      const r = C.resolveUnitMove(u, target, ctxOf(d, { snap: rnd() > 0.3, thresh: [40, 80, 150][Math.floor(rnd() * 3)], autoRotate: rnd() > 0.3 && !!u.parts }));
      assert.ok(!r.invalid, 'never invalid from a valid start');
      u.x = r.x; u.z = r.z; if (u.parts) u.rot = r.rot;
      const b = C.box(u);
      assert.ok(C.inRoom(b, d.room), 'in room ' + round + '/' + step);
      for (const o of movers) if (o !== u) assert.ok(!C.overlap(b, C.box(o)), 'overlap ' + round + '/' + step + ' ' + u.name + ' ' + o.name);
    }
    assert.deepEqual(bad(d), [], 'end ' + round);
  }
});

test('벽체: 새로 넣을 때 창문 앞과 문 앞을 피한다', () => {
  const d = design([], { openings: [door(), win({ offset: 600 })] });
  // 창문(위쪽 벽 600~1800)이 방 폭의 대부분을 차지해도 가벽은 창문 옆에 놓인다
  const part = C.makeBlock(d, 'partition');
  const ps = C.findBlockSpot(part, d);
  part.x = ps.x; part.z = ps.z;
  assert.ok(!ps.forced);
  for (const o of d.openings) assert.ok(!C.overlap(C.box(part), C.openingZone(o, d.room)), o.type + ' 앞을 막지 않는다');
  d.blocks.push(part);
  assert.deepEqual(codes(d), []);
  // 꺾인 벽은 창문과 문에 걸리지 않는 모서리로 간다
  const notch = C.makeBlock(d, 'notch');
  const ns = C.findBlockSpot(notch, d);
  notch.x = ns.x; notch.z = ns.z;
  for (const o of d.openings) assert.ok(!C.overlap(C.box(notch), C.openingZone(o, d.room)));
});

test('예시 배치: 벽체 앞에는 통로 폭을 남긴다', () => {
  // 아래쪽 벽 앞 900mm에 가벽이 서 있으면, 그 앞에는 유닛을 세우지 않는다
  const d = design([], { openings: [door()], blocks: [block({ kind: 'partition', name: '가벽 1', x: 1200, z: 450, w: 100, d: 900 })] });
  d.units = C.sampleUnits(d);
  assert.ok(d.units.length >= 1);
  assert.deepEqual(codes(d).filter((c) => c === 'aisle' || c === 'overlap' || c === 'out'), []);
});

/* ---------- 코너장: 두 부분의 깊이를 따로 ---------- */

test('코너장 깊이: 뒷벽 쪽과 옆벽 쪽을 따로 정한다', () => {
  const c = corner({ d: 600, d2: 400 });
  const g = C.cornerGeo(c);
  assert.deepEqual([g.DA, g.DB, g.frontA, g.frontB], [600, 400, 600, 400]);
  // 바닥 윤곽: 뒷벽 쪽은 깊이 600, 옆벽 쪽은 깊이 400
  assert.deepEqual(C.footprint(c), [[-500, -500], [500, -500], [500, 100], [-100, 100], [-100, 500], [-500, 500]]);
  assert.deepEqual(C.solidRects(c), [{ x0: 0, x1: 1000, z0: 0, z1: 600 }, { x0: 0, x1: 400, z0: 600, z1: 1000 }]);
  assert.deepEqual(C.frontEdges(c).map((e) => [e.x0, e.z0, e.x1, e.z1]), [[-100, 100, 500, 100], [-100, 100, -100, 500]]);
  assert.deepEqual(C.labelLocal(c), { x: -300, z: -200 });
  assert.deepEqual([C.interior(c).d, C.interior(c).d2], [591, 391]);
  // 선반과 봉은 깊이가 다른 두 부분을 따라 이어진다
  assert.deepEqual([g.sdA, g.sdB, g.lb, g.lbTop], [571, 371, 1000 - 18 - 9 - 571, 1000 - 600 - 18]);
  near(g.zMidA, -500 + 9 + 591 / 2, 0.01);
  near(g.xMidB, -500 + 9 + 391 / 2, 0.01);
  assert.equal(g.rodB[0], g.zMidA);
  // 통로: 뒷벽 쪽 앞은 깊이 600에서, 옆벽 쪽 앞은 깊이 400에서 잰다
  const gaps = C.unitGaps(c, design([c]));
  assert.deepEqual([gaps.aisleA.gap, gaps.aisleB.gap], [1800 - 600, 2400 - 400]);
});

test('코너장 깊이: 바꿀 때 모서리는 제자리, 서로의 앞면은 100 이상 남는다', () => {
  const c = corner();
  const d = design([c]);
  C.applyResize(c, { d2: 400 }, d);
  assert.deepEqual([c.d, c.d2], [580, 400]);
  assert.deepEqual(C.box(c), { x0: 0, x1: 1000, z0: 0, z1: 1000 });
  // 깊이는 반대쪽 날개의 길이 - 100까지, 작게는 100까지
  C.applyResize(c, { d: 950 }, d);
  assert.deepEqual([c.d, c.d2], [900, 400]);
  C.applyResize(c, { d2: 30 }, d);
  assert.equal(c.d2, 100);
  // 옆 길이를 줄이면 뒷벽 쪽 깊이가 따라 줄고, 가로를 줄이면 옆벽 쪽 깊이가 따라 준다
  C.applyResize(c, { w2: 800 }, d);
  assert.deepEqual([c.d, c.d2], [700, 100]);
  C.applyResize(c, { d2: 700 }, d);
  C.applyResize(c, { w: 700 }, d);
  assert.deepEqual([c.d, c.d2], [700, 600]);
  assert.deepEqual(bad(d), []);
  // 앞면이 250보다 좁으면 막지 않고 알려 준다 (두 부분 모두 100)
  const narrow = C.checkDesign(d).filter((i) => i.code === 'corner-front');
  assert.equal(narrow.length, 2);
  assert.ok(/뒷벽 쪽 부분의 앞면이 100mm/.test(narrow[0].text) && /옆벽 쪽 부분의 앞면이 100mm/.test(narrow[1].text), narrow.map((i) => i.text).join(' / '));
  assert.ok(!codes(design([corner({ d: 750, d2: 750 })])).includes('corner-front'));
  assert.ok(codes(design([corner({ d: 751, d2: 500 })])).includes('corner-front'));
});

test('코너장 깊이: 문짝, 부품 목록, 확인할 점', () => {
  const c = corner({ d: 600, d2: 400, door: 'hinge', parts: [{ id: 'r', type: 'rod', y: 1688 }, { id: 's', type: 'shelf', y: 1784 }] });
  const hi = C.hingeInfo(c);
  assert.deepEqual(hi.widths, [1000 - 400 - 18 - 4, 1000 - 600 - 2]);
  assert.equal(hi.swing, 600);
  const rows = C.bom(design([c]));
  const spec = (kind) => rows.filter((r) => r.kind === kind).map((r) => r.spec + ' ×' + r.qty);
  assert.deepEqual(spec('측판'), ['400 × 2100 × 18 ×1', '600 × 2100 × 18 ×1']);
  assert.deepEqual(spec('상판·하판'), ['382 × 391 × 18 ×2', '973 × 591 × 18 ×2']);
  assert.deepEqual(spec('선반'), ['402 × 371 × 18 ×1', '973 × 571 × 18 ×1']);
  assert.deepEqual(spec('코너 접이문'), ['578 + 398 × 2026 × 18 ×1']);
  // 얕은 쪽(400)에 옷걸이가 걸리므로 깊이를 알려 준다
  const depth = C.checkDesign(design([c])).find((i) => i.code === 'depth');
  assert.ok(depth && /깊이 400mm/.test(depth.text));
  assert.equal(C.checkDesign(design([corner({ d: 600, d2: 500, parts: [{ id: 'r', type: 'rod', y: 1688 }] })])).filter((i) => i.code === 'depth').length, 0);
});

test('코너장 깊이: 이전 설계는 두 깊이가 같은 값으로 열린다', () => {
  const d = C.normalizeDesign({ v: 2, room: { w: 3000, d: 2400, h: 2300 }, openings: [], blocks: [], units: [{ id: 'c', kind: 'corner', x: 500, z: 500, rot: 0, w: 1000, w2: 1000, h: 2100, d: 550, parts: [] }] });
  assert.deepEqual([d.units[0].d, d.units[0].d2], [550, 550]);
  assert.deepEqual(Object.keys(d.units[0]).slice(0, 11), ['id', 'name', 'kind', 'x', 'z', 'rot', 'w', 'h', 'w2', 'd', 'd2']);
  const again = C.normalizeDesign(JSON.parse(JSON.stringify(d)));
  assert.equal(JSON.stringify(again), JSON.stringify(d));
  // 깊이를 따로 저장한 설계
  const e = C.normalizeDesign({ v: 2, room: { w: 3000, d: 2400, h: 2300 }, openings: [], blocks: [], units: [{ kind: 'corner', w: 1200, w2: 900, h: 2100, d: 600, d2: 350, parts: [] }] });
  assert.deepEqual([e.units[0].d, e.units[0].d2], [600, 350]);
  // 일반 유닛에는 옆 깊이가 없다
  assert.equal('d2' in C.normalizeDesign({ room: { w: 3000, d: 2400, h: 2300 }, units: [{ w: 800, h: 2100, d: 580 }] }).units[0], false);
});

/* ---------- 스피드랙 ---------- */

const rack = (o) => unit(Object.assign({ style: 'rack', d: 600 }, o));

test('스피드랙: 내부 범위, 넣을 수 있는 부품, 문', () => {
  const u = rack();
  assert.equal(C.isRack(u), true);
  assert.deepEqual(C.interior(u), { y0: 70, y1: 2060, w: 792, d: 600 });
  // 선반, 행거봉, 서랍을 넣을 수 있다. 새 서랍은 맨 아래 단 위(70)에 3단으로 놓인다.
  assert.deepEqual(C.partTypes(u), ['rod', 'shelf', 'drawer']);
  const dr = C.makePart(u, 'drawer');
  assert.deepEqual([dr.type, dr.y, dr.n, dr.eh], ['drawer', 70, 3, 180]);
  assert.equal(C.doorKind(Object.assign(rack(), { door: 'hinge' })), 'none');
  assert.equal(C.frontExtra(Object.assign(rack(), { door: 'slide' })), 0);
  assert.equal(C.shelfDepth(u), 592);
  // 코너장도 스피드랙이 될 수 있고, 거울장은 될 수 없다
  assert.equal(C.isRack(corner({ style: 'rack' })), true);
  assert.equal(C.isRack(unit({ kind: 'mirror', style: 'rack' })), false);
});

test('스피드랙: 선반 한 단은 받침까지 40mm, 높이는 30mm 간격', () => {
  const u = rack();
  const shelf = { id: 's', type: 'shelf', y: 1000 };
  const rod = { id: 'r', type: 'rod', y: 1700 };
  u.parts = [shelf, rod];
  assert.equal(C.partH(shelf, u), 40);
  assert.equal(C.partH(shelf, unit()), 18);
  assert.equal(C.partH(shelf), 18);
  assert.equal(C.partRef(shelf, u), 1040);
  assert.equal(C.partH(rod, u), 32);
  assert.deepEqual(C.freeIntervals(u, null), [[70, 1000], [1040, 1700], [1732, 2060]]);
  assert.deepEqual(C.pitchOf(u), { step: 30, origin: 10 });
  assert.deepEqual(C.pitchOf(unit()), { step: 32, origin: 24 });
  assert.equal(C.pitchNear(1003, u), 1000);
  assert.equal(C.pitchNear(1003, unit()), 1016);
  // 끌어 옮기면 30mm 간격에 맞는다
  const r = C.resolvePartMove(design([u]), u, shelf, 1127, { snap: true, thresh: 80 });
  assert.deepEqual([r.y, r.snap], [1120, 'pitch']);
  // 방향키는 다음 구멍으로
  assert.equal(C.stepPart(u, shelf, 1, { pitch: true }), 1030);
  assert.equal(C.stepPart(u, shelf, -1, { pitch: true }), 970);
  // 새 선반과 높이 직접 입력
  const s2 = C.makePart(u, 'shelf');
  assert.ok(s2 && (s2.y - 10) % 30 === 0);
  assert.ok(C.setPartRef(u, shelf, 1500));
  assert.equal(shelf.y, 1460);
  // 봉 바로 위로는 옷걸이 여유를 남기고 붙는다 (두께 40 기준으로 겹치지 않는다)
  assert.ok(C.setPartRef(u, shelf, 1725));
  assert.equal(C.partGaps(u, rod).above >= 0, true);
});

test('스피드랙: 옆 유닛과 같은 높이로 맞출 때 두께 차이를 반영한다', () => {
  const a = unit({ id: 'a', x: 400, parts: [{ id: 'as', type: 'shelf', y: 1200 }] });           // 판넬형: 윗면 1218
  const b = rack({ id: 'b', x: 1200, parts: [{ id: 'bs', type: 'shelf', y: 900 }] });
  const d = design([a, b]);
  const r = C.resolvePartMove(d, b, b.parts[0], 1170, { snap: true, thresh: 80 });
  assert.deepEqual([r.y, r.snap], [1178, 'align']);            // 윗면 1218에 맞추려면 1218 - 40
  assert.equal(r.guides[0].y, 1218);
  const r2 = C.resolvePartMove(d, a, a.parts[0], 925, { snap: true, thresh: 80 });
  b.parts[0].y = 900;
  assert.deepEqual([C.resolvePartMove(d, a, a.parts[0], 925, { snap: true, thresh: 80 }).y], [922]);   // 윗면 940에 맞추려면 940 - 18
  assert.ok(r2);
});

test('스피드랙: 추천 구성은 맨 위 단 아래에 봉을 걸고, 서랍 구성은 맨 아래 단 위에 서랍을 놓는다', () => {
  const u = rack({ h: 2100 });
  const long = C.presetParts(u, 'long');
  assert.deepEqual(long.map((p) => p.type), ['rod']);
  assert.equal(long[0].y, 2060 - 60 - 32);
  // 서랍 + 행거: 서랍 3단과 봉 하나 (공식몰의 서랍 행거처럼 단을 따로 더 두지 않는다)
  const drw = C.presetParts(u, 'drawers');
  assert.deepEqual(drw.map((p) => [p.type, p.y]), [['drawer', 70], ['rod', 2060 - 60 - 32]]);
  assert.deepEqual([drw[0].n, drw[0].eh], [3, 180]);
  const dbl = C.presetParts(u, 'double');
  assert.deepEqual(dbl.map((p) => p.type), ['rod', 'rod']);
  const sh = C.presetParts(u, 'shelves');
  assert.ok(sh.length >= 3 && sh.every((p) => p.type === 'shelf' && (p.y - 10) % 30 === 0));
  // 서랍 + 선반: 서랍 2단 위로 선반을 고르게
  const mx = C.presetParts(u, 'mixed');
  assert.deepEqual([mx[0].type, mx[0].y, mx[0].n], ['drawer', 70, 2]);
  assert.ok(mx.length >= 4 && mx.slice(1).every((p) => p.type === 'shelf' && (p.y - 10) % 30 === 0 && p.y >= 70 + 400), JSON.stringify(mx));
  // 코너장은 스피드랙이어도 서랍 없이
  const cr = corner({ style: 'rack', d: 500 });
  assert.deepEqual(C.presetParts(cr, 'drawers').map((p) => p.type), ['rod']);
  for (const key of ['long', 'double', 'drawers', 'shelves', 'mixed']) {
    for (const h of [600, 900, 1200, 1500, 1800, 2100, 2400]) {
      const k = rack({ h });
      k.parts = C.presetParts(k, key);
      assert.deepEqual(C.checkDesign(design([k])).filter((i) => i.code === 'parts'), [], key + ' ' + h);
    }
  }
});

test('스피드랙: 형태를 바꾸면 서랍은 그대로 남고 겹친 부품은 떨어진다', () => {
  const u = unit({ parts: [{ id: 'd', type: 'drawer', y: 88, n: 3, eh: 180 }, { id: 's1', type: 'shelf', y: 628 }, { id: 's2', type: 'shelf', y: 650 }, { id: 'r', type: 'rod', y: 1676 }, { id: 's3', type: 'shelf', y: 2064 }] });
  u.style = 'rack';
  const removed = C.settleParts(u);
  assert.equal(removed, 0);
  assert.deepEqual(u.parts.map((p) => p.id), ['d', 's1', 's2', 'r', 's3']);
  assert.deepEqual(u.parts.map((p) => p.y), [88, 628, 668, 1676, 2020]);          // 두께 40: 위 선반은 밀려 올라가고, 맨 위 선반은 내부 끝(2060) 아래로
  assert.deepEqual(C.checkDesign(design([u])).filter((i) => i.code === 'parts'), []);
  // 도저히 들어가지 않으면 위쪽 부품부터 뺀다
  const low = rack({ h: 400, parts: [1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ id: 's' + i, type: 'shelf', y: 70 + i })) });
  const cut = C.settleParts(low);
  assert.equal(low.parts.length, 7);            // 내부 290mm에 40mm 선반 7장
  assert.equal(cut, 2);
  assert.deepEqual(C.checkDesign(design([low])).filter((i) => i.code === 'parts'), []);
  // 맨 위 봉은 틀의 맨 위 단에서 옷걸이 고리만큼(44mm) 떨어진다
  const dbl = unit({ parts: [{ id: 'r1', type: 'rod', y: 1016 }, { id: 'r2', type: 'rod', y: 1990 }] });
  dbl.style = 'rack';
  assert.equal(C.settleParts(dbl), 0);
  assert.deepEqual(dbl.parts.map((p) => p.y), [1016, 2060 - 32 - 44]);
  assert.deepEqual(codes(design([Object.assign(dbl, { d: 600, z: 300 })])), []);
  // 자리가 모자라면 여유 없이 붙여서라도 부품을 지킨다
  const tight = rack({ h: 400, parts: [{ id: 'r', type: 'rod', y: 300 }, { id: 's', type: 'shelf', y: 100 }, { id: 't', type: 'shelf', y: 200 }, { id: 'v', type: 'shelf', y: 250 }, { id: 'w', type: 'shelf', y: 280 }, { id: 'z', type: 'shelf', y: 290 }, { id: 'q', type: 'shelf', y: 295 }] });
  assert.equal(C.settleParts(tight), 0);
  assert.equal(tight.parts.length, 7);
  assert.deepEqual(C.checkDesign(design([tight])).filter((i) => i.code === 'parts'), []);
  // 판넬형으로 되돌려도 겹치지 않는다
  u.style = 'panel';
  assert.equal(C.settleParts(u), 0);
  assert.deepEqual(C.checkDesign(design([u])).filter((i) => i.code === 'parts'), []);
});

test('스피드랙: 공식몰 규격과 다른 크기를 알려 준다', () => {
  const ok = rack({ w: 800, d: 600, h: 2100, parts: [{ id: 'r', type: 'rod', y: 1900 }] });
  assert.equal(C.rackStd(ok, null), null);
  assert.deepEqual(codes(design([ok])).filter((c) => c.indexOf('rack') === 0), []);
  const off = rack({ x: 500, w: 850, d: 580, h: 2000 });
  assert.deepEqual(C.rackStd(off, null), { w: 800, d: 600, h: 1950 });
  assert.deepEqual(C.rackStd(off, { w: 2400, d: 1800, h: 1900 }), { w: 800, d: 600, h: 1800 });
  const item = C.checkDesign(design([off])).find((i) => i.code === 'rack-size');
  assert.ok(item && /가로 850 → 800/.test(item.text) && /깊이 580 → 600/.test(item.text) && /높이 2000 → 1950/.test(item.text), item && item.text);
  // 행거봉 세트는 가로 400~1,200, 깊이 400·500·600만 있다
  const deep = rack({ w: 800, d: 700, h: 2100, parts: [{ id: 'r', type: 'rod', y: 1900 }] });
  assert.deepEqual(codes(design([deep])).filter((c) => c.indexOf('rack') === 0), ['rack-rod']);
  const wide = rack({ x: 750, w: 1500, d: 600, h: 2100, parts: [{ id: 'r', type: 'rod', y: 1900 }] });
  assert.ok(codes(design([wide])).indexOf('rack-rod') >= 0);
  // 앞뒤가 트여 있어 깊이 400~499에도 "얕다"고 하지 않는다
  const shallow = rack({ w: 800, d: 400, h: 2100, parts: [{ id: 'r', type: 'rod', y: 1900 }] });
  assert.deepEqual(codes(design([shallow])).filter((c) => c === 'depth' || c.indexOf('rack') === 0), []);
  // 판넬형에는 해당 없음
  assert.equal(C.rackStd(unit({ w: 850 }), null), null);
});

test('스피드랙: 부품 목록은 판매 단위로, 불러오기 규칙', () => {
  const u = rack({ w: 800, d: 600, h: 2100, parts: [{ id: 'r', type: 'rod', y: 1900 }, { id: 's', type: 'shelf', y: 1000 }] });
  const rows = C.bom(design([u, rack({ id: 'k', x: 1200, w: 800, d: 600, h: 2100 })]));
  assert.deepEqual(rows.map((r) => [r.kind, r.spec, r.qty]), [['스피드랙 기둥', '2100', 8], ['스피드랙 선반 단', '800 × 600', 5], ['스피드랙 행거봉 세트', '800 × 600', 1]]);
  const s = C.summary(design([u]));
  assert.deepEqual([s.rods, s.rodLen, s.shelves, s.doors], [1, 792, 1, 0]);
  const d = C.normalizeDesign({ v: 2, room: { w: 3000, d: 2400, h: 2300 }, openings: [], blocks: [], units: [
    { style: 'rack', finish: 'gray', door: 'slide', w: 800, h: 2100, d: 600, parts: [{ type: 'drawer', y: 88, n: 3, eh: 180 }, { type: 'shelf', y: 5000 }, { type: 'rod', y: 0 }] },
    { kind: 'corner', style: 'rack', w: 1000, w2: 1000, h: 2100, d: 580 },
    { style: 'zzz' },
  ] });
  const [a, c, z] = d.units;
  // 스피드랙에는 문이 없고 색은 네 가지 조합 가운데로, 서랍은 그대로 둔다
  assert.deepEqual([a.style, a.finish, a.door, a.parts.map((p) => p.type + '@' + p.y)], ['rack', 'white', 'none', ['drawer@88', 'shelf@2020', 'rod@70']]);
  // 코너장도 스피드랙으로 열린다
  assert.deepEqual([c.style, c.door, z.style], ['rack', 'none', 'panel']);
  assert.equal(JSON.stringify(C.normalizeDesign(JSON.parse(JSON.stringify(d)))), JSON.stringify(d));
  // 새 유닛은 고른 유닛의 형태를 그대로 받을 수 있다
  assert.equal(C.makeUnit(d, { style: 'rack', door: 'hinge' }).door, 'none');
  // 거울장은 판넬형으로만
  assert.equal(C.makeUnit(d, { kind: 'mirror', style: 'rack' }).style, 'panel');
});

/* ---------- 스피드랙: 서랍과 코너장 ---------- */

test('스피드랙 서랍: 부품 목록에 서랍장으로 적고, 맞는 선반 크기를 알려 준다', () => {
  const u = rack({ w: 800, d: 500, h: 2100, z: 250 });
  u.parts = C.presetParts(u, 'drawers');
  const rows = C.bom(design([u]));
  assert.deepEqual(rows.map((r) => [r.kind, r.spec, r.qty]), [['스피드랙 기둥', '2100', 4], ['스피드랙 선반 단', '800 × 500', 2], ['스피드랙 행거봉 세트', '800 × 500', 1], ['스피드랙 서랍', '800 × 500 · 3단', 1]]);
  assert.equal(C.summary(design([u])).drawers, 3);
  // 800 × 500·600과 600·1200 × 400에는 맞는 서랍이 있다
  assert.deepEqual(codes(design([u])), []);
  for (const [w, d] of [[800, 600], [600, 400], [1200, 400]]) {
    const k = rack({ x: w / 2, z: d / 2, w, d, h: 2100, parts: [{ id: 'd', type: 'drawer', y: 70, n: 3, eh: 180 }] });
    assert.ok(!codes(design([k])).includes('rack-drawer'), w + ' × ' + d);
  }
  const off = rack({ x: 500, w: 1000, d: 500, z: 250, h: 2100, parts: [{ id: 'd', type: 'drawer', y: 70, n: 3, eh: 180 }] });
  const hit = C.checkDesign(design([off])).find((i) => i.code === 'rack-drawer');
  assert.ok(hit && hit.partId === 'd' && /3단서랍/.test(hit.text), hit && hit.text);
  // 판넬형의 서랍은 해당 없음
  assert.ok(!codes(design([unit({ parts: [{ id: 'd', type: 'drawer', y: 88, n: 3, eh: 180 }] })])).includes('rack-drawer'));
});

test('코너 스피드랙: 내부 범위, 치수, 부품', () => {
  const c = corner({ style: 'rack', d: 500, d2: 500 });
  assert.equal(C.isRack(c), true);
  assert.deepEqual(C.interior(c), { y0: 70, y1: 2060, w: 992, d: 500, d2: 500 });
  assert.deepEqual(C.partTypes(c), ['rod', 'shelf']);
  assert.equal(C.makePart(c, 'drawer'), null);
  assert.equal(C.doorKind(Object.assign(corner({ style: 'rack' }), { door: 'hinge' })), 'none');
  assert.deepEqual(C.pitchOf(c), { step: 30, origin: 10 });
  assert.equal(C.partH({ type: 'shelf' }, c), 40);
  // 바닥 윤곽과 간격은 판넬형 코너장과 같다
  assert.deepEqual(C.footprint(c), C.footprint(corner({ d: 500, d2: 500 })));
  assert.deepEqual(C.solidRects(c), [{ x0: 0, x1: 1000, z0: 0, z1: 500 }, { x0: 0, x1: 500, z0: 500, z1: 1000 }]);
  // 행거봉은 날개마다 따로: 받침(14)과 여유(4)를 뺀 길이
  const g = C.cornerGeo(c);
  assert.deepEqual([g.rodA, g.rodB], [[-482, 482], [10, 482]]);
  assert.deepEqual([g.zMidA, g.xMidB, g.frontA, g.frontB], [-250, -250, 500, 500]);
  c.parts = C.presetParts(c, 'long');
  assert.deepEqual(c.parts.map((p) => [p.type, p.y]), [['rod', 2060 - 60 - 32]]);
  near(C.summary(design([c])).rodLen, 964 + 472, 0.01);
  // 새 선반은 30mm 간격에
  const s = C.makePart(c, 'shelf');
  assert.ok(s && (s.y - 10) % 30 === 0);
  for (const key of ['long', 'double', 'drawers', 'shelves', 'mixed']) {
    const k = corner({ style: 'rack', d: 500 });
    k.parts = C.presetParts(k, key);
    assert.ok(k.parts.length >= 1 && k.parts.every((p) => p.type !== 'drawer'), key);
    assert.deepEqual(C.checkDesign(design([k])).filter((i) => i.code === 'parts'), [], key);
  }
});

test('코너 스피드랙: 부품 목록, 공식몰 규격, 확인할 점', () => {
  const c = corner({ style: 'rack', d: 500, d2: 500, parts: [{ id: 'r', type: 'rod', y: 1900 }, { id: 's', type: 'shelf', y: 1000 }] });
  const rows = C.bom(design([c]));
  // 기둥은 ㄱ자 윤곽의 꼭짓점 여섯 곳, 선반 단과 행거봉 세트는 날개마다 (뒷벽 쪽 1000 × 500, 옆벽 쪽 500 × 500)
  assert.deepEqual(rows.map((r) => [r.kind, r.spec, r.qty]), [
    ['스피드랙 기둥', '2100', 6], ['스피드랙 선반 단', '500 × 500', 3], ['스피드랙 선반 단', '1000 × 500', 3],
    ['스피드랙 행거봉 세트', '500 × 500', 1], ['스피드랙 행거봉 세트', '1000 × 500', 1],
  ]);
  // 1000 × 1000 × 2100은 공식몰의 코너 행거 크기
  assert.equal(C.rackStd(c, null), null);
  assert.deepEqual(C.checkDesign(design([c])), []);
  assert.equal(C.rackStd(corner({ style: 'rack', w: 1200, w2: 1200, d: 500 }), null), null);
  // 다른 크기는 가까운 규격을 알려 준다: 한 변의 길이와 높이
  const off = corner({ style: 'rack', x: 450, z: 550, w: 900, w2: 1100, h: 2000, d: 500, d2: 400 });
  assert.deepEqual(C.rackStd(off, null), { w: 1000, w2: 1000, h: 1950 });
  assert.deepEqual(C.rackStd(off, { w: 2400, d: 1800, h: 1900 }), { w: 1000, w2: 1000, h: 2000 });
  const hit = C.checkDesign(design([off])).find((i) => i.code === 'rack-size');
  assert.ok(hit && /코너 행거/.test(hit.text), hit && hit.text);
  // 맞추면 모서리는 제자리에 있고 깊이는 그대로
  const d = design([off]);
  C.applyResize(off, C.rackStd(off, d.room), d);
  assert.deepEqual([off.w, off.w2, off.h, off.d, off.d2], [1000, 1000, 1950, 500, 400]);
  assert.deepEqual(C.box(off), { x0: 0, x1: 1000, z0: 0, z1: 1000 });
  assert.equal(C.rackStd(off, d.room), null);
  // 스피드랙은 폭이 넓어도 처짐 경고를 내지 않는다 (규격으로 본다). 판넬형 코너장은 그대로 알린다.
  const wide = corner({ style: 'rack', x: 600, z: 600, w: 1200, w2: 1200, d: 500, parts: [{ id: 'r', type: 'rod', y: 1900 }] });
  assert.deepEqual(codes(design([wide])), []);
  assert.ok(codes(design([corner({ x: 600, z: 600, w: 1200, w2: 1200, d: 500, parts: [{ id: 'r', type: 'rod', y: 1900 }] })])).includes('span'));
  // 얕은 깊이에도 "얕다"고 하지 않는다 (앞뒤가 트여 있다)
  assert.ok(!codes(design([corner({ style: 'rack', d: 400, d2: 400, parts: [{ id: 'r', type: 'rod', y: 1900 }] })])).includes('depth'));
});

/* ---------- 문 높이 ---------- */

test('문 높이: 따로 정하지 않으면 전체, 정하면 위쪽 끝에 맞춘다', () => {
  const u = unit({ door: 'hinge' });
  // 전체: 걸레받이 위(72)부터 맨 위 2mm 아래(2098)까지
  assert.deepEqual(C.doorSpan(u), { y0: 72, y1: 2098, h: 2026, full: 2026, lo: 72, hi: 2098, partial: false });
  assert.equal(C.doorSpan(unit()), null);
  C.setDoor(u, 1400);
  assert.deepEqual([u.doorH, u.doorAt], [1400, 'top']);
  assert.deepEqual([C.doorSpan(u).y0, C.doorSpan(u).y1, C.doorSpan(u).partial], [698, 2098, true]);
  assert.deepEqual([C.hingeInfo(u).height, C.hingeInfo(u).y0], [1400, 698]);
  // 아래쪽 끝에 맞추기
  C.setDoor(u, 1400, 'bottom');
  assert.deepEqual([u.doorAt, C.doorSpan(u).y0, C.doorSpan(u).y1], ['bottom', 72, 1472]);
  // 높이만 바꾸면 맞춘 쪽은 그대로
  C.setDoor(u, 900);
  assert.deepEqual([u.doorH, u.doorAt, C.doorSpan(u).y1], [900, 'bottom', 972]);
  // 전체 높이 이상이면 전체로 되돌린다. 너무 낮은 값은 100으로.
  C.setDoor(u, 5000);
  assert.deepEqual(['doorH' in u, 'doorAt' in u, C.doorSpan(u).partial], [false, false, false]);
  C.setDoor(u, 5);
  assert.equal(u.doorH, 100);
  C.setDoor(u, null);
  assert.equal('doorH' in u, false);
  // 유닛 높이를 줄여 문 높이가 전체를 넘으면 전체를 가린다 (값은 남아 있어 높이를 되돌리면 다시 적용된다)
  C.setDoor(u, 1400);
  u.h = 1200;
  assert.deepEqual([C.doorSpan(u).h, C.doorSpan(u).partial], [1126, false]);
  u.h = 2100;
  assert.equal(C.doorSpan(u).h, 1400);
  // 거울장과 코너장도 같은 규칙
  const m = unit({ kind: 'mirror', w: 500 });
  C.setDoor(m, 1500);
  assert.deepEqual([C.hingeInfo(m).height, C.hingeInfo(m).y0], [1500, 598]);
  const c = corner({ door: 'hinge' });
  C.setDoor(c, 1200);
  assert.deepEqual([C.hingeInfo(c).height, C.hingeInfo(c).y0, C.hingeInfo(c).widths], [1200, 898, [398, 418]]);
  // 문이 없으면 값을 두지 않는다
  const n = unit({ door: 'none', doorH: 900, doorAt: 'top' });
  C.setDoor(n, 900);
  assert.equal('doorH' in n, false);
});

test('문 높이: 저장 순서, 불러오기, 부품 목록', () => {
  const u = unit({ door: 'hinge' });
  C.setDoor(u, 1400);
  // 값은 경첩 뒤, 부품 앞에 놓인다 (불러온 것과 순서가 같다)
  assert.deepEqual(Object.keys(u), ['id', 'name', 'kind', 'x', 'z', 'rot', 'w', 'h', 'd', 'style', 'finish', 'door', 'doorFinish', 'hinge', 'doorH', 'doorAt', 'parts']);
  const d = design([u]);
  const loaded = C.normalizeDesign(JSON.parse(JSON.stringify(d)));
  assert.equal(JSON.stringify(loaded.units[0]), JSON.stringify(u));
  assert.equal(JSON.stringify(C.normalizeDesign(JSON.parse(JSON.stringify(loaded)))), JSON.stringify(loaded));
  // 문 높이를 정하지 않은 설계에는 값이 생기지 않는다
  const plain = C.normalizeDesign(JSON.parse(JSON.stringify(design([unit({ door: 'hinge' })]))));
  assert.equal('doorH' in plain.units[0], false);
  // 잘못된 값과 문이 없는 유닛의 값은 버린다
  const odd = C.normalizeDesign({ room: { w: 3000, d: 2400, h: 2300 }, units: [
    { door: 'hinge', doorH: 'x', doorAt: 'side' }, { door: 'none', doorH: 900 }, { door: 'hinge', doorH: 800, doorAt: 'side' }, { door: 'hinge', doorH: 700, doorAt: 'bottom' }, { style: 'rack', door: 'hinge', doorH: 700 },
  ] });
  assert.deepEqual(odd.units.map((k) => [k.doorH, k.doorAt]), [[undefined, undefined], [undefined, undefined], [800, 'top'], [700, 'bottom'], [undefined, undefined]]);
  // 부품 목록은 정한 높이로
  assert.deepEqual(C.bom(d).find((r) => r.kind === '여닫이문'), { kind: '여닫이문', spec: '397 × 1400 × 18', qty: 2 });
  // 복제하거나 옆에 새로 넣을 때 문 높이도 따라간다
  const copy = C.makeUnit(d, Object.assign({}, u, { name: null }));
  assert.deepEqual([copy.doorH, copy.doorAt], [1400, 'top']);
});

test('문 높이: 서랍 위에 맞추기', () => {
  const u = unit({ door: 'hinge' });
  u.parts = C.presetParts(u, 'drawers');
  const dr = u.parts.find((p) => p.type === 'drawer');
  const top = dr.y + dr.n * dr.eh;                  // 88 + 540 = 628
  const h = C.doorAboveDrawers(u);
  assert.equal(h, 2098 - top - 2);
  C.setDoor(u, h, 'top');
  assert.deepEqual([C.doorSpan(u).y0, C.doorSpan(u).y1], [top + 2, 2098]);
  // 서랍이나 문이 없으면 맞출 수 없다
  assert.equal(C.doorAboveDrawers(unit({ door: 'hinge' })), null);
  assert.equal(C.doorAboveDrawers(Object.assign(unit(), { parts: u.parts })), null);
  // 미닫이문은 아래 레일 자리를 남긴다
  const s = unit({ door: 'slide', parts: u.parts });
  assert.equal(C.doorAboveDrawers(s), 2100 - 14 - top - 12);
  // 서랍이 유닛을 거의 채우면 문을 달 높이가 남지 않는다
  const full = unit({ door: 'hinge', parts: [{ id: 'd', type: 'drawer', y: 88, n: 10, eh: 195 }] });
  assert.equal(C.doorAboveDrawers(full), null);
});

test('문 높이: 미닫이문은 문 높이 범위가 같은 유닛끼리 한 줄로 묶인다', () => {
  const a = unit({ x: 400, door: 'slide' });
  const b = unit({ x: 1200, door: 'slide' });
  const c = unit({ x: 2000, door: 'slide' });
  const d = design([a, b, c]);
  assert.deepEqual(C.slideRuns(d).map((r) => [r.ids.length, r.y0, r.y1, r.ph]), [[3, 10, 2086, 2076]]);
  // 한 유닛만 문 높이를 줄이면 줄이 나뉜다
  C.setDoor(b, 1400);
  assert.deepEqual(C.slideRuns(d).map((r) => r.ids).sort((p, q) => p.length - q.length || (p[0] < q[0] ? -1 : 1)).map((ids) => ids.length), [1, 1, 1]);
  // 모두 같은 높이로 맞추면 다시 한 줄
  C.setDoor(a, 1400); C.setDoor(c, 1400);
  const runs = C.slideRuns(d);
  assert.deepEqual(runs.map((r) => [r.ids.length, r.y0, r.y1, r.ph]), [[3, 686, 2086, 1400]]);
  assert.deepEqual(C.bom(d).find((r) => r.kind === '미닫이문'), { kind: '미닫이문', spec: '820 × 1400', qty: 3 });
  // 문이 서랍 높이를 가리지 않으면 서랍이 문짝 두 칸에 걸쳐도 알리지 않는다
  const p = unit({ x: 400, door: 'slide' });
  const q = unit({ x: 1050, w: 500, door: 'slide' });
  p.parts = C.presetParts(p, 'drawers');
  const dd = design([p, q]);
  assert.ok(codes(dd).includes('slide-drawer'));
  const h = C.doorAboveDrawers(p);
  C.setDoor(p, h, 'top'); C.setDoor(q, h, 'top');
  assert.equal(C.slideRuns(dd).length, 1);
  assert.ok(!codes(dd).includes('slide-drawer'));
});

/* ---------- 크기 범위 ---------- */

test('크기 범위: 권장 범위를 벗어난 크기도 그대로 받는다', () => {
  const u = unit();
  const d = design([u]);
  d.room = { w: 6000, d: 4000, h: 2300, wallColor: 'white' };
  C.applyResize(u, { w: 2400 }, d);
  assert.equal(u.w, 2400);
  C.applyResize(u, { w: 150, d: 120, h: 180 }, d);
  assert.deepEqual([u.w, u.d, u.h], [150, 120, 180]);
  C.applyResize(u, { w: 3, d: 3, h: 3 }, d);
  assert.deepEqual([u.w, u.d, u.h], [100, 100, 100]);
  C.applyResize(u, { w: 999999, d: 999999, h: 999999 }, d);
  assert.deepEqual([u.w, u.d, u.h], [20000, 20000, 20000]);
  // 방보다 크거나 천장보다 높으면 막지 않고 알려 준다
  const list = codes(d);
  assert.ok(list.includes('out') && list.includes('tall'), list.join());
  // 서랍: 단 높이 40~, 단 수 30까지
  const k = unit({ parts: [{ id: 'd', type: 'drawer', y: 88, n: 3, eh: 180 }] });
  assert.ok(C.setDrawerSize(k, k.parts[0], 3, 450));
  assert.equal(k.parts[0].eh, 450);
  assert.ok(C.setDrawerSize(k, k.parts[0], 20, 60));
  assert.deepEqual([k.parts[0].n, k.parts[0].eh], [20, 60]);
  assert.ok(C.setDrawerSize(k, k.parts[0], 99, 1));
  assert.deepEqual([k.parts[0].n, k.parts[0].eh], [30, 40]);
  // 들어가지 않는 크기는 바꾸지 않는다
  assert.equal(C.setDrawerSize(k, k.parts[0], 30, 400), false);
  assert.deepEqual([k.parts[0].n, k.parts[0].eh], [30, 40]);
});

test('크기 범위: 문·창문·벽체, 그리고 좁은 문 알림', () => {
  const o = door({ offset: 100, width: 450, height: 1500 });
  const d = design([], { openings: [o] });
  C.fixOpening(o, d.room);
  assert.deepEqual([o.width, o.height], [450, 1500]);
  const hit = C.checkDesign(d).find((i) => i.code === 'door-narrow');
  assert.ok(hit && hit.itemId === o.id && /폭이 450mm/.test(hit.text), hit && hit.text);
  o.width = 600;
  assert.ok(!codes(d).includes('door-narrow'));
  // 벽과 천장을 넘지 않는다
  o.width = 99999; o.height = 99999;
  C.fixOpening(o, d.room);
  assert.deepEqual([o.width, o.offset, o.height], [2400, 0, 2300]);
  const w = win({ width: 3500, height: 2600, sill: 50 });
  const big = design([], { openings: [w] });
  big.room = { w: 5000, d: 3000, h: 3000, wallColor: 'white' };
  C.fixOpening(w, big.room);
  assert.deepEqual([w.width, w.height, w.sill], [3500, 2600, 50]);
  // 창문은 좁아도 알리지 않는다
  assert.ok(!codes(design([], { openings: [win({ width: 200 })] })).includes('door-narrow'));
  // 벽체
  const b = block({ w: 20, d: 20, h: 40, full: false });
  C.fixBlock(b, d.room);
  assert.deepEqual([b.w, b.d, b.h], [20, 20, 40]);
  // 방
  const r = C.normalizeDesign({ room: { w: 400, d: 12000, h: 5000 }, units: [] }).room;
  assert.deepEqual([r.w, r.d, r.h], [400, 12000, 5000]);
});

test('크기 범위: 예시 배치는 이전과 같다', () => {
  const s = C.sampleDesign();
  assert.deepEqual(s.units.map((u) => [u.w, u.h, u.d]), [[800, 2100, 580], [800, 2100, 580], [800, 2100, 580]]);
  // 가로나 세로가 1000보다 작은 방에는 예시 유닛을 놓지 않는다 (예시 유닛이 방 밖으로 나가지 않도록)
  for (const r of [{ w: 300, d: 1800, h: 2300 }, { w: 2400, d: 900, h: 2300 }, { w: 500, d: 500, h: 2300 }]) {
    const tiny = C.sampleDesign(r);
    assert.deepEqual(tiny.units, [], JSON.stringify(r));
    assert.equal(JSON.stringify(C.normalizeDesign(JSON.parse(JSON.stringify(tiny)))), JSON.stringify(tiny));
  }
  // 예시가 놓이는 방에서는 유닛이 모두 방 안에 있고, 불러올 때와 같은 값이다
  for (const r of [{ w: 1000, d: 1000, h: 2300 }, { w: 1000, d: 3000, h: 300 }, { w: 1300, d: 1000, h: 2300 }, { w: 12000, d: 9000, h: 4000 }, { w: 50000, d: 50000, h: 20000 }]) {
    const sd = C.sampleDesign(r);
    assert.ok(sd.units.every((u) => C.inRoom(C.box(u), sd.room) && u.h <= sd.room.h), JSON.stringify(r));
    assert.ok(!codes(sd).includes('out') && !codes(sd).includes('tall') && !codes(sd).includes('overlap'), JSON.stringify(r) + ' ' + codes(sd).join());
    assert.equal(JSON.stringify(C.normalizeDesign(JSON.parse(JSON.stringify(sd)))), JSON.stringify(sd), JSON.stringify(r));
  }
});

test('벽 끌기: 방보다 큰 유닛이 있어도 방이 튀지 않고, 유닛 위치는 불러올 때와 같은 값으로 남는다', () => {
  const stable = (d) => JSON.stringify(C.normalizeDesign(JSON.parse(JSON.stringify(d))).units) === JSON.stringify(d.units);
  const u = unit({ w: 19000, x: 1200, z: 290 });     // 방(2400)보다 넓어 가운데에 놓인 상태
  const d = design([u]);
  assert.ok(stable(d));
  // 오른쪽 벽을 조금 바깥으로: 끌어 놓은 자리까지만 넓어진다 (유닛 끝까지 튀지 않는다)
  C.resizeRoomByWall(d, 'E', 2500, { snap: false });
  assert.equal(d.room.w, 2500);
  assert.ok(stable(d), JSON.stringify(d.units[0]));
  // 안쪽으로는 유닛에 막혀 줄어들지 않는다
  C.resizeRoomByWall(d, 'E', 1000, { snap: false });
  assert.equal(d.room.w, 2500);
  // 왼쪽 벽을 바깥으로
  C.resizeRoomByWall(d, 'W', -600, { snap: false });
  assert.equal(d.room.w, 3100);
  assert.ok(stable(d), JSON.stringify(d.units[0]));
  // 유닛이 들어갈 만큼 넓히면 방 안에 놓인다
  C.resizeRoomByWall(d, 'E', 30000, { snap: false });
  assert.equal(d.room.w, 30000);
  assert.ok(C.inRoom(C.box(u), d.room) && stable(d), JSON.stringify(C.box(u)));
  // 위아래도 같다: 방보다 깊은 유닛
  const v = unit({ d: 5000, x: 400, z: 900 });
  const e = design([v]);
  assert.ok(stable(e));
  C.resizeRoomByWall(e, 'S', 2000, { snap: false });
  assert.equal(e.room.d, 2000);
  assert.ok(stable(e), JSON.stringify(e.units[0]));
  // 방 안에 있는 유닛은 벽을 끌어도 제자리에 있다 (이전과 같다)
  const k = unit({ x: 400, z: 290 });
  const f = design([k]);
  C.resizeRoomByWall(f, 'E', 3000, { snap: false });
  assert.deepEqual([f.room.w, k.x, k.z], [3000, 400, 290]);
});

test('유닛 높이를 줄여 부품이 들어가지 않아도, 다시 열었을 때 화면에서 보던 그대로다', () => {
  const stable = (d) => JSON.stringify(C.normalizeDesign(JSON.parse(JSON.stringify(d)))) === JSON.stringify(d);
  const d = C.sampleDesign();
  const counts = d.units.map((u) => u.parts.length);
  for (const u of d.units) C.applyResize(u, { h: 120 }, d);
  // 부품은 그대로 남고(맨 아래로 몰린다), 확인할 점으로 알린다
  assert.deepEqual(d.units.map((u) => u.parts.length), counts);
  assert.ok(codes(d).includes('parts'));
  assert.ok(stable(d));
  // 높이를 되돌리면 부품이 다시 내부에 들어온다 (서로 겹친 것은 남아 있을 수 있다)
  for (const u of d.units) C.applyResize(u, { h: 2100 }, d);
  assert.deepEqual(d.units.map((u) => u.parts.length), counts);
  assert.ok(stable(d));
  // 다른 형태와 크기에서도 같다
  for (const style of ['panel', 'pole', 'rack']) {
    for (const h of [100, 130, 260, 600]) {
      const u = unit({ style, d: 600, z: 300, parts: [{ id: 'd', type: 'drawer', y: 88, n: 3, eh: 180 }, { id: 's', type: 'shelf', y: 700 }, { id: 'r', type: 'rod', y: 1700 }] });
      const k = design([u]);
      C.applyResize(u, { h }, k);
      assert.ok(stable(k), style + ' ' + h + ' ' + JSON.stringify(u.parts));
    }
  }
  // 코너장 (불러온 설계의 코너장에는 옆 깊이 값이 늘 들어 있다)
  const kc = C.normalizeDesign(design([corner({ parts: [{ id: 's', type: 'shelf', y: 700 }, { id: 'r', type: 'rod', y: 1700 }] })]));
  const c = kc.units[0];
  assert.ok(stable(kc));
  C.applyResize(c, { h: 100 }, kc);
  assert.deepEqual(c.parts.map((p) => p.y), [88, 88]);
  assert.ok(stable(kc), JSON.stringify(c));
});
