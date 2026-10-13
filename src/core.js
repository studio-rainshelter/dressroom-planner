/* 드레스룸 3D 플래너: 배치와 자석 앵커 계산 (화면 없이 동작하는 순수 함수) */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PlannerCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 단위는 모두 mm. 좌표: x = 왼쪽 벽에서, z = 위쪽 벽에서(평면 보기 기준), y = 바닥에서.
  const K = Object.freeze({
    T: 18,            // 판재 두께
    BACK_T: 9,        // 뒷판 두께
    POST: 30,         // 기둥 굵기
    PITCH: 32,        // 타공 간격
    PITCH_ORIGIN: 24, // 타공 기준 (판넬형 내부 바닥 88 = 24 + 32 × 2)
    ROD_D: 25,        // 행거봉 지름
    ROD_SLAB: 32,     // 행거봉과 소켓이 차지하는 높이
    HOOK: 44,         // 행거봉 위에 옷걸이 고리가 걸릴 여유
    SHELF_T: 18,
    BASE: 70,         // 걸레받이 높이
    WALL_T: 80,
    GRID: 10,
    DOOR_H: 2100,
    DOOR_CLEAR: 700,  // 문 앞에 비워 둘 깊이
    WINDOW_CLEAR: 250, // 창문 앞으로 가구가 가리는지 볼 깊이
    AISLE_MIN: 600,   // 권장 최소 통로 폭
    DEPTH_FOR_HANGER: 500,
    SPAN_WARN: 1000,
    HANG: Object.freeze({ long: 1400, mid: 1000, short: 700 }),
    DOOR_T: 18,       // 문짝 두께
    HINGE_OUT: 20,    // 여닫이문이 몸통 앞으로 나오는 깊이
    SLIDE_RAIL: 80,   // 미닫이문 레일이 몸통 앞으로 나오는 깊이
    SLIDE_OV: 30,     // 미닫이문 짝끼리 겹치는 폭
    LEAF_MAX: 650,    // 여닫이문 한 짝의 권장 최대 폭
    PANEL_MIN: 400,   // 미닫이문 한 짝의 권장 최소 폭
    PANEL_MAX: 1250,  // 미닫이문 한 짝의 권장 최대 폭
    CORNER_FRONT: 250, // 코너장 날개 앞면의 권장 최소 길이 (이보다 좁으면 확인할 점으로 알린다)
    CORNER_MIN: 100,   // 코너장 날개 앞면이 남아야 하는 길이 (ㄱ자 모양이 유지되는 한계)
    DOOR_MIN: 100,     // 문짝의 최소 높이
    RACK_PITCH: 30,   // 스피드랙: 선반 높이를 맞추는 간격
    RACK_T: 40,       // 스피드랙: 선반 한 단이 차지하는 높이 (받침 높이)
    RACK_BOARD: 9,    // 스피드랙: 합판 두께
    RACK_POST: 35,    // 스피드랙: 기둥(ㄱ자 앵글) 한 변
    RACK_BASE: 30,    // 스피드랙: 맨 아래 단의 아랫면 높이
    RACK_GAP: 4,      // 스피드랙: 기둥과 선반 사이 여유
    RACK_BEAM: 14,    // 스피드랙: 받침의 폭
    MAX_UNITS: 40,
    MAX_PARTS: 24,
    MAX_OPENINGS: 12,
    MAX_BLOCKS: 12,
    // 크기 범위: 그림과 계산이 깨지지 않는 한계만 둔다. 쓰기 불편한 크기는 막지 않고 확인할 점으로 알린다.
    LIM: Object.freeze({
      room: Object.freeze({ w: [300, 50000], d: [300, 50000], h: [300, 20000] }),
      unit: Object.freeze({ w: [100, 20000], h: [100, 20000], d: [100, 20000] }),
      corner: Object.freeze({ w: [200, 20000], w2: [200, 20000], d: [100, 20000] }),
      drawer: Object.freeze({ eh: [40, 5000], n: [1, 30] }),
      door: Object.freeze({ width: [100, 50000], height: [100, 20000] }),
      window: Object.freeze({ width: [100, 50000], height: [100, 20000], sill: [0, 20000] }),
      block: Object.freeze({ w: [10, 50000], d: [10, 50000], h: [10, 20000] }),
    }),
    // 숫자를 치는 동안 바로 반영하기 시작하는 값: 이보다 작은 값은 입력을 마쳤을 때 반영한다 (1200을 치는 도중의 120이 적용되지 않도록)
    LIVE: Object.freeze({
      room: Object.freeze({ w: 1000, d: 1000, h: 1800 }),
      unit: Object.freeze({ w: 300, h: 400, d: 250 }),
      corner: Object.freeze({ w: 600, w2: 600, d: 300 }),
      drawer: Object.freeze({ eh: 100 }),
      door: Object.freeze({ width: 600, height: 1800 }),
      window: Object.freeze({ width: 300, height: 300 }),
      block: Object.freeze({ w: 50, d: 50, h: 100 }),
      doorH: 300,
    }),
  });

  const FINISHES = ['white', 'oak', 'walnut', 'gray', 'black'];
  const STYLES = ['panel', 'pole', 'rack'];
  // 스피드랙은 프레임이 백색·검정, 합판이 백색·우드뿐이라 네 가지 조합만 쓴다
  const RACK_FINISHES = ['white', 'oak', 'walnut', 'black'];
  const step100 = (a, b) => { const out = []; for (let v = a; v <= b; v += 100) out.push(v); return out; };
  // 스피드랙 규격 (공식몰의 선택지 기준)
  const RACK_STD = Object.freeze({
    w: step100(200, 1200).concat([1500]),
    d: step100(200, 900),
    h: [330, 420, 600, 750, 900, 1200, 1350, 1500, 1650, 1800, 1950, 2100, 2400],
    rodW: step100(400, 1200),
    rodD: [400, 500, 600],
    // 서랍이 맞는 선반 크기 [가로, 깊이]: 3단서랍(800 × 500·600), 패브릭 서랍장(600·1200 × 400)
    drawer: [[800, 500], [800, 600], [600, 400], [1200, 400]],
    // 코너 행거: 한 변의 길이(1200은 세트 구성)와 높이
    cornerSide: [1000, 1200],
    cornerH: [1950, 2100],
  });
  const DOOR_FINISHES = FINISHES.concat(['mirror']);
  const WALL_COLORS = ['white', 'ivory', 'gray', 'sage', 'blue'];
  const KINDS = ['std', 'corner', 'mirror'];
  const KIND_NAME = { std: '유닛', corner: '코너장', mirror: '거울장' };
  const BLOCK_KINDS = ['pillar', 'partition', 'notch'];
  const BLOCK_NAME = { pillar: '기둥', partition: '가벽', notch: '꺾인 벽' };
  const LEAVES = ['swing', 'slide', 'none'];
  const WALLS = ['N', 'E', 'S', 'W'];
  const WALL_AXIS = { N: 'x', S: 'x', W: 'z', E: 'z' };
  const ROTS = [0, 90, 180, 270];
  const COS = { 0: 1, 90: 0, 180: -1, 270: 0 };
  const SIN = { 0: 0, 90: 1, 180: 0, 270: -1 };
  const RIGHT = { 0: '+x', 90: '-z', 180: '-x', 270: '+z' };
  const FRONT = { 0: '+z', 90: '+x', 180: '-z', 270: '-x' };
  const OPP = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' };
  const PART_LABEL = { rod: '행거봉', shelf: '선반', drawer: '서랍' };

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const half2 = (v) => Math.round(v * 2) / 2;
  const round10 = (v) => Math.round(v / 10) * 10;

  let seq = 0;
  function uid(prefix) {
    seq += 1;
    return prefix + Date.now().toString(36).slice(-5) + seq.toString(36) + Math.floor(Math.random() * 46656).toString(36);
  }

  /* ---------- 유닛 기하 ---------- */

  // 바닥 영역의 앞뒤 길이: 코너장은 옆벽 쪽 길이, 그 밖에는 깊이
  const fd = (u) => (u.kind === 'corner' ? u.w2 : u.d);
  // 코너장의 옆벽 쪽 부분(날개 B) 깊이. 따로 정하지 않았으면 뒷벽 쪽 부분과 같다.
  const d2of = (u) => (u.d2 != null ? u.d2 : u.d);
  // 스피드랙 형태인지 (일반 유닛과 코너장)
  const isRack = (u) => !!u && u.style === 'rack' && u.kind !== 'mirror';

  function half(u, rot) {
    if (rot === undefined) rot = u.rot || 0;
    const a = u.w / 2;
    const b = fd(u) / 2;
    return rot % 180 === 0 ? { hx: a, hz: b } : { hx: b, hz: a };
  }

  // 바닥에서 차지하는 바깥 사각형 (코너장은 ㄱ자를 감싸는 사각형)
  function box(u, x, z, rot) {
    if (x === undefined) x = u.x;
    if (z === undefined) z = u.z;
    const h = half(u, rot);
    return { x0: x - h.hx, x1: x + h.hx, z0: z - h.hz, z1: z + h.hz };
  }

  // f: 앞면이 향하는 방향, r: 유닛을 정면에서 볼 때 오른쪽
  function dirs(rot) {
    return { f: { x: SIN[rot], z: COS[rot] }, r: { x: COS[rot], z: -SIN[rot] || 0 } };
  }

  function localToWorld(u, lx, lz) {
    const rot = u.rot || 0;
    return { x: u.x + lx * COS[rot] + lz * SIN[rot], z: u.z - lx * SIN[rot] + lz * COS[rot] };
  }

  // 유닛 기준 좌표의 사각형을 방 좌표의 사각형으로
  function localRect(u, lx0, lz0, lx1, lz1) {
    const a = localToWorld(u, lx0, lz0);
    const b = localToWorld(u, lx1, lz1);
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
  }

  // 코너장(ㄱ자)의 유닛 기준 치수. 모서리는 (X0, Z0), 날개 A는 뒷벽을 따라 +x로, 날개 B는 옆벽을 따라 +z로 뻗는다.
  // DA는 날개 A의 깊이(뒷벽에서 앞으로), DB는 날개 B의 깊이(옆벽에서 앞으로)로, 서로 다를 수 있다.
  function cornerGeo(u) {
    const X0 = -u.w / 2;
    const X1 = u.w / 2;
    const Z0 = -u.w2 / 2;
    const Z1 = u.w2 / 2;
    const DA = u.d;
    const DB = d2of(u);
    if (isRack(u)) {
      // 스피드랙: 뒷판과 끝판이 없고, 받침이 윤곽 안쪽에 걸린다. 행거봉은 날개마다 따로 건다.
      const G = K.RACK_GAP;
      const B = K.RACK_BEAM;
      return {
        X0, X1, Z0, Z1, DA, DB,
        sdA: DA - 2 * G, sdB: DB - 2 * G,
        zMidA: Z0 + DA / 2, xMidB: X0 + DB / 2,
        la: u.w - 2 * G, lb: u.w2 - DA, lbTop: u.w2 - DA,
        frontA: u.w - DB, frontB: u.w2 - DA,
        rodA: [X0 + G + B, X1 - G - B],
        rodB: [Z0 + DA - G + B, Z1 - G - B],
      };
    }
    const sdA = DA - K.BACK_T - 20;               // 날개 A 선반 깊이
    const sdB = DB - K.BACK_T - 20;               // 날개 B 선반 깊이
    const zMidA = Z0 + K.BACK_T + (DA - K.BACK_T) / 2;
    const xMidB = X0 + K.BACK_T + (DB - K.BACK_T) / 2;
    return {
      X0, X1, Z0, Z1, DA, DB, sdA, sdB, zMidA, xMidB,
      la: u.w - K.T - K.BACK_T,                   // 날개 A 안쪽 길이
      lb: u.w2 - K.T - K.BACK_T - sdA,            // 날개 B 선반 길이 (날개 A 선반 앞에서 끝판까지)
      lbTop: u.w2 - DA - K.T,                     // 날개 B 상판·하판 길이
      frontA: u.w - DB,                           // 날개 A 앞면 길이
      frontB: u.w2 - DA,                          // 날개 B 앞면 길이
      rodA: [X0 + K.BACK_T + 4, X1 - K.T - 4],    // 행거봉 A의 x 범위
      rodB: [zMidA, Z1 - K.T - 4],                // 행거봉 B의 z 범위 (봉 A에서 갈라져 나온다)
    };
  }

  // 실제로 차지하는 바닥 사각형들. 코너장은 날개 두 개, 그 밖에는 하나.
  function solidRects(u) {
    if (u.kind !== 'corner') return [box(u)];
    const c = cornerGeo(u);
    return [localRect(u, c.X0, c.Z0, c.X1, c.Z0 + c.DA), localRect(u, c.X0, c.Z0 + c.DA, c.X0 + c.DB, c.Z1)];
  }

  // 바닥 윤곽 (유닛 기준 좌표의 꼭짓점)
  function footprint(u) {
    if (u.kind !== 'corner') {
      const a = u.w / 2;
      const b = u.d / 2;
      return [[-a, -b], [a, -b], [a, b], [-a, b]];
    }
    const c = cornerGeo(u);
    return [[c.X0, c.Z0], [c.X1, c.Z0], [c.X1, c.Z0 + c.DA], [c.X0 + c.DB, c.Z0 + c.DA], [c.X0 + c.DB, c.Z1], [c.X0, c.Z1]];
  }

  // 앞면의 선분들 (유닛 기준 좌표). n은 그 앞면이 향하는 방향.
  function frontEdges(u) {
    if (u.kind !== 'corner') return [{ x0: -u.w / 2, z0: u.d / 2, x1: u.w / 2, z1: u.d / 2, nx: 0, nz: 1 }];
    const c = cornerGeo(u);
    return [
      { x0: c.X0 + c.DB, z0: c.Z0 + c.DA, x1: c.X1, z1: c.Z0 + c.DA, nx: 0, nz: 1 },
      { x0: c.X0 + c.DB, z0: c.Z0 + c.DA, x1: c.X0 + c.DB, z1: c.Z1, nx: 1, nz: 0 },
    ];
  }

  // 이름표를 놓을 자리 (유닛 기준 좌표)
  function labelLocal(u) {
    if (u.kind !== 'corner') return { x: 0, z: 0 };
    const c = cornerGeo(u);
    return { x: c.X0 + c.DB / 2, z: c.Z0 + c.DA / 2 };
  }

  // 정면 보기에서 rot 쪽 벽을 볼 때 이 유닛이 보이는지. 코너장은 두 벽에 걸쳐 있다.
  function facesWall(u, rot) {
    return u.rot === rot || (u.kind === 'corner' && (u.rot + 90) % 360 === rot);
  }

  function overlap(a, b, eps) {
    if (eps === undefined) eps = 0.5;
    return a.x0 < b.x1 - eps && a.x1 > b.x0 + eps && a.z0 < b.z1 - eps && a.z1 > b.z0 + eps;
  }

  function inRoom(b, room, eps) {
    if (eps === undefined) eps = 0.5;
    return b.x0 >= -eps && b.z0 >= -eps && b.x1 <= room.w + eps && b.z1 <= room.d + eps;
  }

  function clampToRoom(u, x, z, rot, room) {
    const h = half(u, rot);
    return {
      x: room.w >= 2 * h.hx ? clamp(x, h.hx, room.w - h.hx) : room.w / 2,
      z: room.d >= 2 * h.hz ? clamp(z, h.hz, room.d - h.hz) : room.d / 2,
    };
  }

  // 유닛 내부에서 부품이 놓일 수 있는 범위. 코너장의 d2는 옆벽 쪽 부분의 안쪽 깊이.
  function interior(u) {
    // 스피드랙: 맨 아래 단과 맨 위 단은 틀에 속하고, 그 사이에 선반·행거봉·서랍을 넣는다
    if (isRack(u)) {
      const it = { y0: K.RACK_BASE + K.RACK_T, y1: u.h - K.RACK_T, w: u.w - 2 * K.RACK_GAP, d: u.d };
      if (u.kind === 'corner') it.d2 = d2of(u);
      return it;
    }
    if (u.kind === 'corner') return { y0: K.BASE + K.T, y1: u.h - K.T, w: u.w - K.T - K.BACK_T, d: u.d - K.BACK_T, d2: d2of(u) - K.BACK_T };
    if (u.style === 'pole') return { y0: 0, y1: u.h, w: u.w - 2 * K.POST, d: u.d };
    return { y0: K.BASE + K.T, y1: u.h - K.T, w: u.w - 2 * K.T, d: u.d - K.BACK_T };
  }

  /* ---------- 부품 ---------- */

  // 선반 한 장이 차지하는 높이: 스피드랙은 받침까지 포함한다
  const shelfT = (u) => (isRack(u) ? K.RACK_T : K.SHELF_T);

  function partH(p, u) {
    if (p.type === 'shelf') return shelfT(u);
    if (p.type === 'rod') return K.ROD_SLAB;
    return p.n * p.eh;
  }

  // 화면에 보여 주는 높이 기준: 선반은 윗면, 행거봉은 봉 중심, 서랍은 아랫면
  function refOffset(p, u) {
    if (p.type === 'shelf') return shelfT(u);
    if (p.type === 'rod') return K.ROD_SLAB / 2;
    return 0;
  }
  const partRef = (p, u) => p.y + refOffset(p, u);

  // 부품 높이를 맞추는 간격: 판넬형·기둥형은 32mm 타공, 스피드랙은 기둥 구멍 30mm
  function pitchOf(u) {
    if (isRack(u)) return { step: K.RACK_PITCH, origin: (K.RACK_BASE + K.RACK_T) % K.RACK_PITCH };
    return { step: K.PITCH, origin: K.PITCH_ORIGIN };
  }
  function pitchNear(y, u) { const g = pitchOf(u); return g.origin + Math.round((y - g.origin) / g.step) * g.step; }
  function pitchDown(y, u) { const g = pitchOf(u); return g.origin + Math.floor((y - g.origin) / g.step) * g.step; }

  // 이 유닛에 넣을 수 있는 부품 종류. 코너장에는 서랍을 넣지 않는다.
  function partTypes(u) { return u.kind === 'corner' ? ['rod', 'shelf'] : ['rod', 'shelf', 'drawer']; }

  function freeIntervals(u, exceptId) {
    const it = interior(u);
    const slabs = [];
    for (const p of u.parts) if (p.id !== exceptId) slabs.push([p.y, p.y + partH(p, u)]);
    slabs.sort((a, b) => a[0] - b[0]);
    const out = [];
    let cur = it.y0;
    for (const s of slabs) {
      const a = Math.min(s[0], it.y1);
      if (a > cur) out.push([cur, a]);
      cur = Math.max(cur, s[1]);
    }
    if (cur < it.y1) out.push([cur, it.y1]);
    return out;
  }

  function nearestFit(intervals, ph, desired) {
    let best = null;
    for (const iv of intervals) {
      if (iv[1] - iv[0] < ph - 0.01) continue;
      const y = clamp(desired, iv[0], iv[1] - ph);
      const dist = Math.abs(y - desired);
      if (!best || dist < best.dist) best = { y, dist };
    }
    return best;
  }

  // 다른 유닛(ou)의 부품 o에 높이를 맞출 때 유닛 u의 부품 p가 놓일 위치와 안내선 높이
  function alignTargets(p, o, u, ou) {
    const out = [];
    if (p.type === 'rod') {
      if (o.type === 'rod') out.push({ y: o.y, line: o.y + K.ROD_SLAB / 2 });
      return out;
    }
    if (o.type === 'rod') return out;
    const oTop = o.y + partH(o, ou);
    out.push({ y: oTop - partH(p, u), line: oTop });
    if (p.type === 'drawer' && o.type === 'drawer') out.push({ y: o.y, line: o.y });
    return out;
  }

  /**
   * 부품을 위아래로 옮길 때의 최종 높이.
   * opt.snap이 켜져 있으면 옆 유닛의 같은 높이, 위아래 부품, 내부 끝, 32mm 타공 순으로 붙는다.
   */
  function resolvePartMove(design, u, p, desiredY, opt) {
    const ph = partH(p, u);
    const it = interior(u);
    const ivs = freeIntervals(u, p.id);
    const fits = (y) => ivs.some((iv) => y >= iv[0] - 0.01 && y + ph <= iv[1] + 0.01);
    const want = Math.round(desiredY);

    if (opt && opt.snap) {
      const lim = Math.max(8, opt.thresh * 0.4);
      const cands = [
        { y: it.y0, kind: 'limit', line: it.y0 },
        { y: it.y1 - ph, kind: 'limit', line: it.y1 },
      ];
      for (const o of u.parts) {
        if (o.id === p.id) continue;
        const ot = o.y + partH(o, u);
        // 행거봉 위에는 옷걸이 고리가 걸릴 여유를 남기고 붙는다
        const upGap = o.type === 'rod' ? K.HOOK : 0;
        const downGap = p.type === 'rod' ? K.HOOK : 0;
        cands.push({ y: ot + upGap, kind: 'stack', line: ot + upGap }, { y: o.y - ph - downGap, kind: 'stack', line: o.y - downGap });
      }
      for (const ou of design.units) {
        if (ou.id === u.id) continue;
        for (const o of ou.parts) {
          for (const t of alignTargets(p, o, u, ou)) cands.push({ y: t.y, kind: 'align', line: t.line, unitId: ou.id });
        }
      }
      let best = null;
      for (const c of cands) {
        const dist = Math.abs(c.y - want);
        if (dist > lim || !fits(c.y)) continue;
        const score = dist + (c.kind === 'align' ? 0 : 0.25);
        if (!best || score < best.score) best = { y: c.y, score, kind: c.kind };
      }
      if (best) {
        const guides = [];
        for (const c of cands) {
          if (Math.abs(c.y - best.y) > 0.5) continue;
          let g = guides.find((k) => k.kind === c.kind && Math.abs(k.y - c.line) < 0.5);
          if (!g) { g = { y: c.line, kind: c.kind, unitIds: [] }; guides.push(g); }
          if (c.unitId && g.unitIds.indexOf(c.unitId) < 0) g.unitIds.push(c.unitId);
        }
        return { y: best.y, snap: best.kind, guides };
      }
      const yp = pitchNear(want, u);
      if (fits(yp)) return { y: yp, snap: 'pitch', guides: [] };
    }

    const nf = nearestFit(ivs, ph, want);
    if (!nf) return { y: p.y, snap: null, guides: [], blocked: true };
    return { y: Math.round(nf.y), snap: null, guides: [], bumped: nf.dist > 0.5 };
  }

  /**
   * 방향키로 한 칸 옮길 때의 높이. opt.pitch면 다음 타공 위치로, 아니면 opt.step만큼.
   * 다른 부품에 막히면 그 부품에 닿는 곳, 이미 닿아 있으면 건너편 빈자리로 넘어간다.
   */
  function stepPart(u, p, dir, opt) {
    const ph = partH(p, u);
    const ivs = freeIntervals(u, p.id);
    const n = Math.max(1, opt.count || 1);
    const step = pitchOf(u).step;
    let target;
    if (opt.pitch) target = dir > 0 ? pitchDown(p.y, u) + step * n : pitchDown(p.y - 0.5, u) - step * (n - 1);
    else target = p.y + dir * (opt.step || 1) * n;
    if (ivs.some((iv) => target >= iv[0] - 0.01 && target + ph <= iv[1] + 0.01)) return Math.round(target);
    let best = null;
    for (const iv of ivs) {
      if (iv[1] - iv[0] < ph - 0.01) continue;
      const y = clamp(target, iv[0], iv[1] - ph);
      if (dir > 0 ? y <= p.y + 0.01 : y >= p.y - 0.01) continue;
      const dist = Math.abs(y - target);
      if (!best || dist < best.dist) best = { y, dist };
    }
    return best ? Math.round(best.y) : p.y;
  }

  function partGaps(u, p) {
    const it = interior(u);
    const ph = partH(p, u);
    let below = it.y0;
    let above = it.y1;
    for (const o of u.parts) {
      if (o.id === p.id) continue;
      const ot = o.y + partH(o, u);
      if (ot <= p.y + 0.01 && ot > below) below = ot;
      if (o.y >= p.y + ph - 0.01 && o.y < above) above = o.y;
    }
    return { below: p.y - below, above: above - (p.y + ph), belowAt: below, aboveAt: above };
  }

  // 행거봉 중심에서 아래 부품(또는 내부 바닥)까지의 거리
  function hangClear(u, p) { return partGaps(u, p).below + K.ROD_SLAB / 2; }

  function hangLabel(mm) {
    if (mm >= K.HANG.long) return '긴 코트·원피스';
    if (mm >= K.HANG.mid) return '셔츠·재킷';
    if (mm >= K.HANG.short) return '짧은 상의·접은 바지';
    return '여유 부족';
  }

  function fitParts(u) {
    const it = interior(u);
    for (const p of u.parts) p.y = Math.round(clamp(p.y, it.y0, Math.max(it.y0, it.y1 - partH(p, u))));
  }

  // 형태가 바뀌어 부품 두께나 내부 높이가 달라졌을 때: 넣을 수 없는 종류는 빼고, 겹친 부품은 밀어서 떼어 놓는다.
  // 행거봉 위에는 옷걸이 고리가 걸릴 여유를 남긴다 (자리가 모자라면 여유 없이 붙인다).
  // 그래도 들어가지 않으면 위쪽 부품부터 뺀다. 뺀 부품 수를 돌려준다.
  function settleParts(u) {
    const it = interior(u);
    const types = partTypes(u);
    const before = u.parts.length;
    const parts = u.parts.filter((p) => types.indexOf(p.type) >= 0).sort((a, b) => a.y - b.y);
    const lay = (hook) => {
      const ys = [];
      let cur = it.y0;
      for (const p of parts) { const y = Math.max(p.y, cur); ys.push(y); cur = y + partH(p, u); }
      let lim = it.y1;
      for (let i = parts.length - 1; i >= 0; i--) {
        const above = hook && parts[i].type === 'rod' ? K.HOOK : 0;
        ys[i] = Math.round(Math.min(ys[i], lim - partH(parts[i], u) - above));
        lim = ys[i];
      }
      return ys;
    };
    for (;;) {
      let ys = lay(true);
      if (parts.length && ys[0] < it.y0 - 0.01) ys = lay(false);
      if (!parts.length || ys[0] >= it.y0 - 0.01) {
        parts.forEach((p, i) => { p.y = ys[i]; });
        break;
      }
      parts.pop();
    }
    u.parts = parts;
    return before - parts.length;
  }

  // 새 부품을 넣을 자리. 공간이 없거나 넣을 수 없는 종류면 null.
  function makePart(u, type) {
    if (partTypes(u).indexOf(type) < 0) return null;
    const it = interior(u);
    const ivs = freeIntervals(u, null);
    const place = (p, want) => {
      const ph = partH(p, u);
      const nf = nearestFit(ivs, ph, want);
      if (!nf) return null;
      const yp = pitchNear(nf.y, u);
      const ok = ivs.some((iv) => yp >= iv[0] - 0.01 && yp + ph <= iv[1] + 0.01);
      p.y = Math.round(ok ? yp : nf.y);
      return p;
    };
    if (type === 'rod') {
      return place({ id: uid('p'), type: 'rod', y: 0 }, Math.min(it.y1 - 60 - K.ROD_SLAB, 1700 - K.ROD_SLAB / 2));
    }
    if (type === 'shelf') {
      let big = null;
      for (const iv of ivs) if (!big || iv[1] - iv[0] > big[1] - big[0]) big = iv;
      if (!big) return null;
      return place({ id: uid('p'), type: 'shelf', y: 0 }, (big[0] + big[1]) / 2 - shelfT(u) / 2);
    }
    for (let n = 3; n >= 1; n--) {
      const p = place({ id: uid('p'), type: 'drawer', y: 0, n, eh: 180 }, it.y0);
      if (p) return p;
    }
    return null;
  }

  // 부품 높이를 숫자로 직접 넣을 때: 겹치지 않는 가장 가까운 높이로 옮긴다.
  function setPartRef(u, p, ref) {
    const nf = nearestFit(freeIntervals(u, p.id), partH(p, u), Math.round(ref - refOffset(p, u)));
    if (!nf) return false;
    p.y = Math.round(nf.y);
    return true;
  }

  // 서랍 단 수나 단 높이를 바꿀 때. 공간이 없으면 바꾸지 않는다.
  function setDrawerSize(u, p, n, eh) {
    const L = K.LIM.drawer;
    const next = { id: p.id, type: 'drawer', y: p.y, n: clamp(Math.round(n), L.n[0], L.n[1]), eh: clamp(Math.round(eh), L.eh[0], L.eh[1]) };
    const nf = nearestFit(freeIntervals(u, p.id), partH(next, u), p.y);
    if (!nf) return false;
    p.n = next.n; p.eh = next.eh; p.y = Math.round(nf.y);
    return true;
  }

  /* ---------- 추천 구성 ---------- */

  function presetParts(u, key) {
    const it = interior(u);
    const H = it.y1 - it.y0;
    const parts = [];
    const rack = isRack(u);
    const st = shelfT(u);
    if (partTypes(u).indexOf('drawer') < 0) key = key === 'drawers' ? 'long' : key === 'mixed' ? 'shelves' : key;
    const add = (type, y, extra) => {
      const p = Object.assign({ id: uid('p'), type, y: Math.round(y) }, extra || {});
      const ph = partH(p, u);
      if (p.y < it.y0 - 0.01 || p.y + ph > it.y1 + 0.01) return null;
      for (const o of parts) if (p.y < o.y + partH(o, u) - 0.01 && p.y + ph > o.y + 0.01) return null;
      parts.push(p);
      return p;
    };
    const topShelfY = () => pitchDown(it.y1 - 300 - st, u);          // 맨 위 칸 높이 약 300
    const rodUnder = (shelfY) => shelfY - K.HOOK - K.ROD_SLAB;       // 옷걸이 고리가 걸릴 여유
    const rodAtTop = () => it.y1 - 60 - K.ROD_SLAB;
    const evenShelves = (from, to) => {
      const span = to - from;
      const cells = Math.max(2, Math.round(span / 340));
      const clear = (span - (cells - 1) * st) / cells;
      for (let i = 1; i < cells; i++) add('shelf', pitchNear(from + i * (clear + st) - st, u));
    };

    // 스피드랙은 맨 위 단이 이미 선반이라, 그 바로 아래에 봉을 건다
    if (key === 'long') {
      const s = H >= 1500 && !rack ? add('shelf', topShelfY()) : null;
      add('rod', s ? rodUnder(s.y) : rodAtTop());
    } else if (key === 'double') {
      const s = H >= 2350 && !rack ? add('shelf', topShelfY()) : null;
      const top = add('rod', s ? rodUnder(s.y) : rodAtTop());
      // 위아래 모두 짧은 옷 길이 이상이 남을 때만 아래 봉을 넣는다
      if (top && (top.y - K.ROD_SLAB - it.y0) / 2 >= K.HANG.short) add('rod', pitchNear((top.y - K.ROD_SLAB + it.y0) / 2, u));
    } else if (key === 'drawers') {
      const n = H >= 1700 ? 3 : 2;
      const dr = add('drawer', it.y0, { n, eh: 180 });
      // 스피드랙은 서랍 위와 맨 위 칸에 단을 따로 두지 않는다 (공식몰의 서랍 행거: 2단 + 행거봉 1 + 서랍장)
      const top = dr && !rack ? add('shelf', dr.y + partH(dr, u)) : null;
      const s = H >= 1700 && !rack ? add('shelf', topShelfY()) : null;
      const ry = s ? rodUnder(s.y) : rodAtTop();
      const floor = top ? top.y + st : dr ? dr.y + partH(dr, u) : it.y0;
      if (ry + K.ROD_SLAB / 2 - floor >= K.HANG.short) add('rod', ry);
      else if (!s && H >= 700) add('shelf', pitchNear((floor + it.y1) / 2, u));
    } else if (key === 'shelves') {
      evenShelves(it.y0, it.y1);
    } else if (key === 'mixed') {
      const dr = add('drawer', it.y0, { n: 2, eh: 200 });
      const from = dr ? dr.y + partH(dr, u) : it.y0;
      if (dr && !rack) add('shelf', from);
      evenShelves(dr && !rack ? from + st : from, it.y1);
    }
    return parts;
  }

  /* ---------- 문짝 ---------- */

  // 실제로 달리는 문: 거울장은 늘 여닫이, 기둥형과 스피드랙에는 문이 없고, 코너장에는 미닫이문을 달 수 없다.
  function doorKind(u) {
    if (u.kind === 'mirror') return 'hinge';
    if (u.style === 'pole' || u.style === 'rack') return 'none';
    if (u.door === 'hinge') return 'hinge';
    if (u.door === 'slide' && u.kind !== 'corner') return 'slide';
    return 'none';
  }

  function doorFinishOf(u) {
    if (u.kind === 'mirror') return 'mirror';
    return DOOR_FINISHES.indexOf(u.doorFinish) >= 0 ? u.doorFinish : u.finish;
  }

  /**
   * 문짝이 가리는 높이 범위 (바닥 기준). 문 높이(doorH)를 따로 정하지 않았으면 달 수 있는 범위 전체를 가린다.
   * lo~hi는 문을 달 수 있는 범위, full은 그 높이, partial은 전체보다 낮게 정했는지.
   * 낮게 정한 문은 위쪽 끝에 맞추고(doorAt 'top'), 'bottom'이면 아래쪽 끝에 맞춘다.
   */
  function doorSpanOf(u, kind) {
    const lo = kind === 'slide' ? 10 : K.BASE + 2;
    const hi = kind === 'slide' ? u.h - 14 : u.h - 2;
    const full = Math.max(1, hi - lo);
    const partial = u.doorH != null && u.doorH < full - 0.5;
    const h = partial ? Math.max(Math.min(K.DOOR_MIN, full), u.doorH) : full;
    const y0 = partial && u.doorAt !== 'bottom' ? hi - h : lo;
    return { y0, y1: y0 + h, h, full, lo, hi, partial };
  }
  function doorSpan(u) {
    const k = doorKind(u);
    return k === 'none' ? null : doorSpanOf(u, k);
  }

  // 유닛의 값들을 정해진 순서로 다시 담는다 (나중에 생긴 값이 뒤에 붙어 저장 내용의 순서가 달라지지 않도록).
  const UNIT_KEYS = ['id', 'name', 'kind', 'x', 'z', 'rot', 'w', 'h', 'w2', 'd', 'd2', 'style', 'finish', 'door', 'doorFinish', 'hinge', 'doorH', 'doorAt', 'parts'];
  function tidyUnit(u) {
    const copy = Object.assign({}, u);
    for (const k of Object.keys(u)) delete u[k];
    for (const k of UNIT_KEYS) if (copy[k] !== undefined) u[k] = copy[k];
    return u;
  }

  // 문 높이를 정한다. h가 없거나 전체 높이 이상이면 전체를 가리는 문으로 되돌린다. at을 주면 맞출 쪽도 바꾼다.
  function setDoor(u, h, at) {
    const k = doorKind(u);
    const sp = k === 'none' ? null : doorSpanOf(u, k);
    if (!sp || h == null || h >= sp.full - 0.5) {
      delete u.doorH; delete u.doorAt;
    } else {
      u.doorH = Math.round(clamp(h, Math.min(K.DOOR_MIN, sp.full), sp.full));
      u.doorAt = (at || u.doorAt) === 'bottom' ? 'bottom' : 'top';
    }
    return tidyUnit(u);
  }

  // 문 아래 끝을 맨 위 서랍의 윗면에 맞출 때의 문 높이. 문이나 서랍이 없거나 남는 높이가 너무 낮으면 null.
  function doorAboveDrawers(u) {
    const k = doorKind(u);
    if (k === 'none') return null;
    let top = null;
    for (const p of u.parts) if (p.type === 'drawer') top = Math.max(top == null ? 0 : top, p.y + partH(p, u));
    if (top == null) return null;
    const sp = doorSpanOf(u, k);
    const h = Math.round(sp.hi - top - (k === 'slide' ? 12 : 2));
    return h >= K.DOOR_MIN && h < sp.full - 0.5 ? h : null;
  }

  // 여닫이문 짝 구성. swing은 문이 열릴 때 앞으로 필요한 깊이, y0는 문짝 아래 끝의 높이.
  function hingeInfo(u) {
    const sp = doorSpanOf(u, 'hinge');
    const height = sp.h;
    if (u.kind === 'corner') {
      const a = u.w - d2of(u) - K.DOOR_T - 4; // 날개 A 쪽 짝
      const b = u.w2 - u.d - 2;               // 날개 B 쪽 짝 (모서리를 덮는다)
      return { leaves: 2, widths: [a, b], height, y0: sp.y0, swing: Math.max(u.w - d2of(u), u.w2 - u.d) };
    }
    const leaves = u.w <= 600 ? 1 : 2;
    const lw = (u.w - 4 - (leaves - 1) * 3) / leaves;
    return { leaves, widths: leaves === 1 ? [lw] : [lw, lw], height, y0: sp.y0, swing: lw };
  }

  // 문이 몸통 앞으로 차지하는 깊이
  function frontExtra(u) {
    const k = doorKind(u);
    return k === 'hinge' ? K.HINGE_OUT : k === 'slide' ? K.SLIDE_RAIL : 0;
  }

  // 미닫이문 짝 수: 유닛 경계에 문짝 경계가 맞고, 한 짝 폭이 900에 가까운 쪽을 고른다.
  function slidePanelCount(W, cuts) {
    let best = null;
    for (let n = 2; n <= 6; n++) {
      const bay = W / n;
      let aligned = true;
      for (let i = 1; i < n; i++) if (!cuts.some((c) => Math.abs(c - i * bay) <= 20)) { aligned = false; break; }
      let score = Math.abs(bay - 900) / 100;
      if (!aligned) score += 20;
      if (bay < K.PANEL_MIN) score += 40 + (K.PANEL_MIN - bay) / 10;
      if (bay > K.PANEL_MAX) score += 40 + (bay - K.PANEL_MAX) / 10;
      if (!best || score < best.score) best = { n, score };
    }
    return best.n;
  }

  /**
   * 미닫이문 줄: 방향·앞선·높이·문 높이 범위가 같고 옆으로 맞닿은 미닫이문 유닛을 한 줄로 묶는다.
   * 줄마다 { rot, front, h, y0, y1, ph(문짝 높이), a0, a1, w, n(짝 수), bay(한 칸 폭), pw(문짝 폭), finish, units, spans }.
   */
  function slideRuns(design) {
    const items = [];
    for (const u of design.units) {
      if (doorKind(u) !== 'slide') continue;
      const b = box(u);
      const ax = u.rot % 180 === 0;
      const front = u.rot === 0 ? b.z1 : u.rot === 180 ? b.z0 : u.rot === 90 ? b.x1 : b.x0;
      const sp = doorSpanOf(u, 'slide');
      items.push({ u, a0: ax ? b.x0 : b.z0, a1: ax ? b.x1 : b.z1, front, key: Math.round(front), y0: Math.round(sp.y0), y1: Math.round(sp.y1) });
    }
    items.sort((p, q) => p.u.rot - q.u.rot || p.key - q.key || p.u.h - q.u.h || p.y0 - q.y0 || p.y1 - q.y1 || p.a0 - q.a0);
    const runs = [];
    let cur = null;
    for (const it of items) {
      if (cur && cur.rot === it.u.rot && cur.key === it.key && cur.h === it.u.h && cur.y0 === it.y0 && cur.y1 === it.y1 && Math.abs(it.a0 - cur.a1) <= 1) {
        cur.units.push(it.u); cur.spans.push({ u: it.u, a0: it.a0, a1: it.a1 }); cur.cuts.push(it.a0 - cur.a0); cur.a1 = it.a1;
      } else {
        cur = { rot: it.u.rot, key: it.key, front: it.front, h: it.u.h, y0: it.y0, y1: it.y1, a0: it.a0, a1: it.a1, units: [it.u], spans: [{ u: it.u, a0: it.a0, a1: it.a1 }], cuts: [] };
        runs.push(cur);
      }
    }
    for (const r of runs) {
      r.w = r.a1 - r.a0;
      r.ph = r.y1 - r.y0;
      r.n = slidePanelCount(r.w, r.cuts);
      r.bay = r.w / r.n;
      r.pw = (r.w + (r.n - 1) * K.SLIDE_OV) / r.n;
      r.finish = doorFinishOf(r.units[0]);
      r.ids = r.units.map((u) => u.id);
    }
    return runs;
  }

  /* ---------- 간격과 장애물 ---------- */

  const blocksOf = (design) => design.blocks || [];
  const openingsOf = (design) => design.openings || [];

  // 다른 유닛과 벽체가 실제로 차지하는 바닥 사각형 (간격 계산용)
  function obstacleRects(design, exceptId) {
    const out = [];
    for (const o of design.units) if (o.id !== exceptId) for (const r of solidRects(o)) out.push(r);
    for (const k of blocksOf(design)) if (k.id !== exceptId) { const b = box(k); b.wall = true; out.push(b); }
    return out;
  }

  // 움직일 때 부딪히는 상자 (유닛은 바깥 사각형 기준). wall이 참이면 벽처럼 다룬다.
  function colliders(design, exceptId) {
    const out = [];
    for (const o of design.units) if (o.id !== exceptId) { const b = box(o); b.id = o.id; b.wall = false; out.push(b); }
    for (const k of blocksOf(design)) if (k.id !== exceptId) { const b = box(k); b.id = k.id; b.wall = true; out.push(b); }
    return out;
  }

  function gapInDir(b, dir, boxes, room) {
    const eps = 0.5;
    let lim;
    let by = null;
    if (dir === '+x') {
      lim = room.w;
      for (const o of boxes) if (o.z0 < b.z1 - eps && o.z1 > b.z0 + eps && o.x0 >= b.x1 - eps && o.x0 < lim) { lim = o.x0; by = o; }
      return { gap: lim - b.x1, at: lim, dir, wall: !by || !!by.wall };
    }
    if (dir === '-x') {
      lim = 0;
      for (const o of boxes) if (o.z0 < b.z1 - eps && o.z1 > b.z0 + eps && o.x1 <= b.x0 + eps && o.x1 > lim) { lim = o.x1; by = o; }
      return { gap: b.x0 - lim, at: lim, dir, wall: !by || !!by.wall };
    }
    if (dir === '+z') {
      lim = room.d;
      for (const o of boxes) if (o.x0 < b.x1 - eps && o.x1 > b.x0 + eps && o.z0 >= b.z1 - eps && o.z0 < lim) { lim = o.z0; by = o; }
      return { gap: lim - b.z1, at: lim, dir, wall: !by || !!by.wall };
    }
    lim = 0;
    for (const o of boxes) if (o.x0 < b.x1 - eps && o.x1 > b.x0 + eps && o.z1 <= b.z0 + eps && o.z1 > lim) { lim = o.z1; by = o; }
    return { gap: b.z0 - lim, at: lim, dir, wall: !by || !!by.wall };
  }

  /**
   * 유닛 둘레의 빈 거리. left·right·front·back은 가장 가까운 벽이나 가구까지, aisle은 앞에 서서 쓸 수 있는 깊이.
   * 코너장의 right는 뒷벽을 따라, front는 옆벽을 따라 남은 거리이고 aisle은 두 날개 앞 가운데 좁은 쪽이다.
   */
  function unitGaps(u, design) {
    const obs = obstacleRects(design, u.id);
    const room = design.room;
    const b = box(u);
    const rot = u.rot || 0;
    const g = {
      left: gapInDir(b, OPP[RIGHT[rot]], obs, room),
      right: gapInDir(b, RIGHT[rot], obs, room),
      front: gapInDir(b, FRONT[rot], obs, room),
      back: gapInDir(b, OPP[FRONT[rot]], obs, room),
    };
    if (u.kind === 'corner') {
      const c = cornerGeo(u);
      const r = solidRects(u);
      g.right = gapInDir(r[0], RIGHT[rot], obs, room);
      g.front = gapInDir(r[1], FRONT[rot], obs, room);
      g.aisleA = gapInDir(localRect(u, c.X0 + c.DB, c.Z0, c.X1, c.Z0 + c.DA), FRONT[rot], obs, room);
      g.aisleB = gapInDir(localRect(u, c.X0, c.Z0 + c.DA, c.X0 + c.DB, c.Z1), RIGHT[rot], obs, room);
      g.aisle = Math.min(g.aisleA.gap, g.aisleB.gap);
    } else {
      g.aisle = g.front.gap;
    }
    return g;
  }

  /* ---------- 유닛 이동과 자석 앵커 ---------- */

  function pickSnap(cands, thresh) {
    let best = null;
    for (const c of cands) {
      const a = Math.abs(c.d);
      if (a > (c.kind === 'align' ? thresh * 0.5 : thresh)) continue;
      const score = a * (c.kind === 'wall' ? 0.6 : c.kind === 'unit' ? 0.75 : 1) + (c.kind === 'align' ? 0.5 : 0);
      if (!best || score < best.score) best = { d: c.d, kind: c.kind, at: c.at, ref: c.ref || null, score };
    }
    return best;
  }

  // 자석 앵커: 벽과 벽체(wall), 다른 유닛의 옆면(unit), 같은 선(align) 순으로 붙고, 없으면 10mm 격자에 맞춘다.
  // ctx: { room, obst(부딪히는 상자들), thresh }
  function snapUnit(u, x, z, rot, ctx) {
    const h = half(u, rot);
    const t = ctx.thresh;
    const room = ctx.room;
    const cx = [{ d: -(x - h.hx), kind: 'wall', at: 0 }, { d: room.w - (x + h.hx), kind: 'wall', at: room.w }];
    const cz = [{ d: -(z - h.hz), kind: 'wall', at: 0 }, { d: room.d - (z + h.hz), kind: 'wall', at: room.d }];
    for (const b of ctx.obst) {
      // 마주 보는 면이 실제로 겹칠 때만 '맞닿음', 아니면 같은 선에 맞추는 '정렬'
      const touch = b.wall ? 'wall' : 'unit';
      const faceX = z + h.hz > b.z0 + 1 && z - h.hz < b.z1 - 1 ? touch : 'align';
      const faceZ = x + h.hx > b.x0 + 1 && x - h.hx < b.x1 - 1 ? touch : 'align';
      cx.push({ d: b.x0 - (x + h.hx), kind: faceX, at: b.x0, ref: b }, { d: b.x1 - (x - h.hx), kind: faceX, at: b.x1, ref: b });
      cz.push({ d: b.z0 - (z + h.hz), kind: faceZ, at: b.z0, ref: b }, { d: b.z1 - (z - h.hz), kind: faceZ, at: b.z1, ref: b });
      cx.push({ d: b.x0 - (x - h.hx), kind: 'align', at: b.x0, ref: b }, { d: b.x1 - (x + h.hx), kind: 'align', at: b.x1, ref: b });
      cz.push({ d: b.z0 - (z - h.hz), kind: 'align', at: b.z0, ref: b }, { d: b.z1 - (z + h.hz), kind: 'align', at: b.z1, ref: b });
    }
    const sx = pickSnap(cx, t);
    const sz = pickSnap(cz, t);
    const nx = sx ? x + sx.d : Math.round((x - h.hx) / K.GRID) * K.GRID + h.hx;
    const nz = sz ? z + sz.d : Math.round((z - h.hz) / K.GRID) * K.GRID + h.hz;
    const c = clampToRoom(u, nx, nz, rot, room);
    const out = { x: c.x, z: c.z, rot, guides: [] };
    const mine = box(u, c.x, c.z, rot);
    if (sx && Math.abs(c.x - nx) < 0.01) {
      const e = sx.ref ? [Math.min(mine.z0, sx.ref.z0), Math.max(mine.z1, sx.ref.z1)] : [Math.max(0, mine.z0 - 200), Math.min(room.d, mine.z1 + 200)];
      out.guides.push({ axis: 'x', at: sx.at, kind: sx.kind, a: e[0], b: e[1] });
    }
    if (sz && Math.abs(c.z - nz) < 0.01) {
      const e = sz.ref ? [Math.min(mine.x0, sz.ref.x0), Math.max(mine.x1, sz.ref.x1)] : [Math.max(0, mine.x0 - 200), Math.min(room.w, mine.x1 + 200)];
      out.guides.push({ axis: 'z', at: sz.at, kind: sz.kind, a: e[0], b: e[1] });
    }
    return out;
  }

  // 한 축씩 목표 쪽으로 움직이다가 처음 닿는 곳에서 멈춘다.
  function sweep(u, rot, from, to, boxes, room, zFirst) {
    const h = half(u, rot);
    const eps = 0.5;
    let x = from.x;
    let z = from.z;
    const moveX = () => {
      let lim = to.x;
      for (const b of boxes) {
        if (!(z - h.hz < b.z1 - eps && z + h.hz > b.z0 + eps)) continue;
        if (to.x > x && b.x0 >= x + h.hx - eps) lim = Math.min(lim, b.x0 - h.hx);
        if (to.x < x && b.x1 <= x - h.hx + eps) lim = Math.max(lim, b.x1 + h.hx);
      }
      x = lim;
    };
    const moveZ = () => {
      let lim = to.z;
      for (const b of boxes) {
        if (!(x - h.hx < b.x1 - eps && x + h.hx > b.x0 + eps)) continue;
        if (to.z > z && b.z0 >= z + h.hz - eps) lim = Math.min(lim, b.z0 - h.hz);
        if (to.z < z && b.z1 <= z - h.hz + eps) lim = Math.max(lim, b.z1 + h.hz);
      }
      z = lim;
    };
    if (zFirst) { moveZ(); moveX(); } else { moveX(); moveZ(); }
    return clampToRoom(u, x, z, rot, room);
  }

  // 목표 위치가 다른 것과 겹칠 때, 겹침이 풀리는 가장 가까운 자리를 찾는다 (겹친 상자의 네 면 바깥으로 밀어 본다).
  function pushOut(u, rot, target, boxes, room) {
    const h = half(u, rot);
    const at = (x, z) => ({ x0: x - h.hx, x1: x + h.hx, z0: z - h.hz, z1: z + h.hz });
    const seen = {};
    const queue = [{ x: target.x, z: target.z, depth: 0 }];
    let best = null;
    while (queue.length) {
      const c = queue.shift();
      const key = Math.round(c.x * 2) + ',' + Math.round(c.z * 2);
      if (seen[key]) continue;
      seen[key] = true;
      const b = at(c.x, c.z);
      const hit = boxes.filter((ob) => overlap(b, ob));
      if (!hit.length) {
        if (!inRoom(b, room)) continue;
        const dist = Math.hypot(c.x - target.x, c.z - target.z);
        if (!best || dist < best.dist) best = { x: c.x, z: c.z, dist };
        continue;
      }
      if (c.depth >= 3) continue;
      for (const ob of hit) {
        for (const m of [[ob.x0 - h.hx, c.z], [ob.x1 + h.hx, c.z], [c.x, ob.z0 - h.hz], [c.x, ob.z1 + h.hz]]) {
          const cl = clampToRoom(u, m[0], m[1], rot, room);
          queue.push({ x: cl.x, z: cl.z, depth: c.depth + 1 });
        }
      }
    }
    return best;
  }

  // 중심 c에서 dir 쪽으로 가장 가까운 벽면까지의 거리. 벽체의 면은 유닛 폭의 절반 이상이 걸칠 때만 벽으로 본다.
  function faceDist(c, h, dir, room, walls) {
    const eps = 0.5;
    const alongX = dir === '-z' || dir === '+z';
    const lo = alongX ? c.x - h.hx : c.z - h.hz;
    const hi = alongX ? c.x + h.hx : c.z + h.hz;
    const need = (hi - lo) / 2;
    let lim = dir === '-z' || dir === '-x' ? 0 : (alongX ? room.d : room.w);
    for (const b of walls) {
      const b0 = alongX ? b.x0 : b.z0;
      const b1 = alongX ? b.x1 : b.z1;
      if (Math.min(hi, b1) - Math.max(lo, b0) < need - eps) continue;
      if (dir === '-z' && b.z1 <= c.z + eps) lim = Math.max(lim, b.z1);
      else if (dir === '+z' && b.z0 >= c.z - eps) lim = Math.min(lim, b.z0);
      else if (dir === '-x' && b.x1 <= c.x + eps) lim = Math.max(lim, b.x1);
      else if (dir === '+x' && b.x0 >= c.x - eps) lim = Math.min(lim, b.x0);
    }
    if (dir === '-z') return c.z - lim;
    if (dir === '+z') return lim - c.z;
    if (dir === '-x') return c.x - lim;
    return lim - c.x;
  }

  /**
   * 유닛(또는 벽체)을 끌 때의 최종 위치와 방향.
   * ctx: { design, snap, thresh, autoRotate }
   * 서로 겹치지 않는다. 목표가 막혀 있으면 겹침이 풀리는 가장 가까운 자리, 그것도 없으면 닿는 곳까지만 움직인다.
   * 자동 회전: 벽에 닿을 거리 안에 들어오면 그 벽을 등진다. 모서리처럼 두 벽이 모두 가까우면
   * 목표 위치에서 덜 벗어나는 방향을 고르되, 지금 방향을 조금 더 우선한다.
   * 코너장은 뒤와 왼쪽이 모두 벽에 가까운 방향, 곧 모서리에 맞는 방향으로 돈다.
   */
  function resolveUnitMove(u, desired, ctx) {
    const room = ctx.design.room;
    const obst = colliders(ctx.design, u.id);
    const walls = obst.filter((b) => b.wall);
    const cur0 = u.rot || 0;
    const valid = (x, z, rot) => {
      const b = box(u, x, z, rot);
      return inRoom(b, room) && !obst.some((ob) => overlap(b, ob));
    };
    const done = (r, extra) => Object.assign({ x: half2(r.x), z: half2(r.z), rot: r.rot, guides: r.guides || [] }, extra || {});
    const raw = (rot) => {
      const c = clampToRoom(u, desired.x, desired.z, rot, room);
      return { x: c.x, z: c.z, rot, guides: [] };
    };
    const sctx = { room, obst, thresh: ctx.thresh };
    const target = (rot) => (ctx.snap ? snapUnit(u, desired.x, desired.z, rot, sctx) : raw(rot));
    const reachMax = Math.max(u.w, fd(u)) * 0.75;

    // 한 방향에 대해 놓을 수 있는 자리를 구한다.
    const evaluate = (rot) => {
      const t = target(rot);
      const off = (r) => Math.hypot(r.x - desired.x, r.z - desired.z);
      if (valid(t.x, t.z, rot)) return { x: t.x, z: t.z, rot, guides: t.guides, ok: true, off: off(t) };
      if (ctx.snap) {
        const r = raw(rot);
        if (valid(r.x, r.z, rot)) return { x: r.x, z: r.z, rot, guides: [], ok: true, off: off(r) };
      }
      const p = pushOut(u, rot, t, obst, room);
      if (p && p.dist <= reachMax) {
        // 밀려난 자리에서 맞닿은 면을 안내선으로 보여 준다
        const g = ctx.snap ? snapUnit(u, p.x, p.z, rot, { room, obst, thresh: 1 }).guides : [];
        return { x: p.x, z: p.z, rot, guides: g, ok: true, off: off(p), pushed: true };
      }
      return { x: t.x, z: t.z, rot, guides: t.guides, ok: false, off: Infinity };
    };

    let chosen = null;
    const cur = evaluate(cur0);
    if (ctx.snap && ctx.autoRotate) {
      const corner = u.kind === 'corner';
      const nearWall = (r) => {
        const h = half(u, r);
        if (faceDist(desired, h, OPP[FRONT[r]], room, walls) > fd(u) / 2 + ctx.thresh) return false;
        return !corner || faceDist(desired, h, OPP[RIGHT[r]], room, walls) <= u.w / 2 + ctx.thresh;
      };
      const near = ROTS.filter(nearWall);
      if (near.length && near.indexOf(cur0) < 0) {
        // 지금 방향의 벽에서는 떨어져 있다: 가까운 벽 가운데 가장 잘 맞는 쪽으로 돌린다
        let best = null;
        for (const r of near) {
          const e = evaluate(r);
          if (e.ok && (!best || e.off < best.off)) best = e;
        }
        if (best) chosen = best;
      } else if (near.length > 1) {
        // 모서리: 다른 벽 쪽이 뚜렷하게 더 잘 맞을 때만 돌린다
        let best = cur;
        for (const r of near) {
          if (r === cur0) continue;
          const e = evaluate(r);
          if (e.ok && (!best.ok || e.off + 80 < best.off)) best = e;
        }
        chosen = best;
      }
    }
    if (!chosen) chosen = cur;
    if (chosen.ok) return done(chosen, chosen.pushed ? { blocked: true } : null);

    // 이미 겹친 상태에서 시작했다면 빠져나올 수 있게 자유롭게 움직인다.
    if (!valid(u.x, u.z, cur0)) return done(cur, { invalid: true });

    const same = target(cur0);
    const from = { x: u.x, z: u.z };
    const a = sweep(u, cur0, from, same, obst, room, false);
    const b = sweep(u, cur0, from, same, obst, room, true);
    const s = Math.hypot(b.x - same.x, b.z - same.z) < Math.hypot(a.x - same.x, a.z - same.z) ? b : a;
    if (!valid(s.x, s.z, cur0)) return done({ x: u.x, z: u.z, rot: cur0 }, { blocked: true });
    const guides = (same.guides || []).filter((g) => (g.axis === 'x' ? Math.abs(s.x - same.x) < 0.01 : Math.abs(s.z - same.z) < 0.01));
    return done({ x: s.x, z: s.z, rot: cur0, guides }, { blocked: true });
  }

  /* ---------- 크기 변경 ---------- */

  /**
   * 유닛이나 벽체의 크기를 바꾼다. patch: { w, w2, d, d2, h }. d2는 코너장의 옆벽 쪽 부분 깊이.
   * 깊이는 뒷면을 고정한다. 폭은 붙어 있는 쪽을 고정하고 막히지 않은 쪽으로 늘린다.
   * 코너장은 모서리를 고정하고 날개 끝 쪽으로 늘린다.
   */
  function applyResize(u, patch, design, lim) {
    const room = design.room;
    const d = dirs(u.rot || 0);
    if (u.kind === 'corner') {
      const L = K.LIM.corner;
      if (patch.w != null) {
        const nw = clamp(Math.round(patch.w), L.w[0], L.w[1]);
        const dw = nw - u.w;
        u.x += d.r.x * dw / 2; u.z += d.r.z * dw / 2; u.w = nw;
      }
      if (patch.w2 != null) {
        const n2 = clamp(Math.round(patch.w2), L.w2[0], L.w2[1]);
        const dw = n2 - u.w2;
        u.x += d.f.x * dw / 2; u.z += d.f.z * dw / 2; u.w2 = n2;
      }
      // 두 부분의 깊이는 따로 정한다. ㄱ자 모양이 유지되도록 서로의 앞면을 조금 남긴다.
      if (patch.d != null) u.d = Math.round(patch.d);
      u.d2 = Math.round(patch.d2 != null ? patch.d2 : d2of(u));
      u.d = clamp(u.d, L.d[0], Math.max(L.d[0], Math.min(L.d[1], u.w2 - K.CORNER_MIN)));
      u.d2 = clamp(u.d2, L.d[0], Math.max(L.d[0], Math.min(L.d[1], u.w - K.CORNER_MIN)));
      if (patch.h != null) u.h = clamp(Math.round(patch.h), K.LIM.unit.h[0], K.LIM.unit.h[1]);
    } else {
      const L = lim || K.LIM.unit;
      const boxes = colliders(design, u.id);
      const b0 = box(u);
      const rot = u.rot || 0;
      if (patch.d != null) {
        const nd = clamp(Math.round(patch.d), L.d[0], L.d[1]);
        const dd = nd - u.d;
        u.x += d.f.x * dd / 2; u.z += d.f.z * dd / 2; u.d = nd;
      }
      if (patch.w != null) {
        const nw = clamp(Math.round(patch.w), L.w[0], L.w[1]);
        const dw = nw - u.w;
        if (dw !== 0) {
          const GL = gapInDir(b0, OPP[RIGHT[rot]], boxes, room);
          const GR = gapInDir(b0, RIGHT[rot], boxes, room);
          const gl = Math.max(0, GL.gap);
          const gr = Math.max(0, GR.gap);
          // 벽에 붙은 쪽을 먼저 고정하고, 그다음 유닛에 붙은 쪽을 고정한다
          let rightFixed;
          if (gl < 1 && GL.wall) rightFixed = false;
          else if (gr < 1 && GR.wall) rightFixed = true;
          else rightFixed = gr < 1 && gl >= 1;
          let growR;
          let growL;
          if (dw < 0) { growR = rightFixed ? 0 : dw; growL = rightFixed ? dw : 0; }
          else if (rightFixed) { growL = Math.min(dw, gl); growR = dw - growL; }
          else { growR = Math.min(dw, gr); growL = Math.min(dw - growR, gl); growR += dw - growR - growL; }
          const shift = (growR - growL) / 2;
          u.x += d.r.x * shift; u.z += d.r.z * shift; u.w = nw;
        }
      }
      if (patch.h != null) u.h = clamp(Math.round(patch.h), L.h[0], L.h[1]);
    }
    const c = clampToRoom(u, u.x, u.z, u.rot || 0, room);
    u.x = half2(c.x); u.z = half2(c.z);
    if (u.parts) fitParts(u);
  }

  // 양옆의 빈 공간을 채우도록 폭을 맞춘다. 바뀌는 것이 없거나 코너장이면 null.
  function fitWidth(u, design) {
    if (u.kind === 'corner') return null;
    const g = unitGaps(u, design);
    const gl = Math.max(0, g.left.gap);
    const gr = Math.max(0, g.right.gap);
    const L = K.LIM.unit.w;
    const w = clamp(Math.floor(u.w + gl + gr), L[0], L[1]);
    if (w === u.w && gl < 0.5) return null;
    const d = dirs(u.rot);
    const along = -u.w / 2 - gl + w / 2;   // 왼쪽 한계선에서 시작
    return { w, x: half2(u.x + d.r.x * along), z: half2(u.z + d.r.z * along) };
  }

  function rotateUnit(u, design) {
    u.rot = (u.rot + 90) % 360;
    const c = clampToRoom(u, u.x, u.z, u.rot, design.room);
    u.x = half2(c.x); u.z = half2(c.z);
  }

  // 벽 모서리 기준 거리로 위치를 정한다 (왼쪽 벽에서 left, 위쪽 벽에서 top).
  function setUnitEdge(u, design, left, top) {
    const h = half(u);
    const c = clampToRoom(u, left == null ? u.x : left + h.hx, top == null ? u.z : top + h.hz, u.rot || 0, design.room);
    u.x = half2(c.x); u.z = half2(c.z);
  }

  /* ---------- 방의 벽: 문, 창문, 벽체 ---------- */

  function wallLen(room, wall) { return WALL_AXIS[wall] === 'x' ? room.w : room.d; }

  // 벽 기준 좌표를 방 좌표로. s는 벽을 따라간 거리(왼쪽 또는 위쪽 끝에서), inward는 벽 안쪽 면에서 방 안으로 들어온 거리.
  function wallPoint(room, wall, s, inward) {
    if (wall === 'N') return { x: s, z: inward };
    if (wall === 'S') return { x: s, z: room.d - inward };
    if (wall === 'W') return { x: inward, z: s };
    return { x: room.w - inward, z: s };
  }

  function wallRect(room, wall, s0, s1, in0, in1) {
    const a = wallPoint(room, wall, s0, in0);
    const b = wallPoint(room, wall, s1, in1);
    return { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), z0: Math.min(a.z, b.z), z1: Math.max(a.z, b.z) };
  }

  function openingName(design, o) {
    const same = openingsOf(design).filter((k) => k.type === o.type);
    return (o.type === 'door' ? '문 ' : '창문 ') + (same.findIndex((k) => k.id === o.id) + 1);
  }

  function fixOpening(o, room) {
    const len = wallLen(room, o.wall);
    const L = o.type === 'door' ? K.LIM.door : K.LIM.window;
    o.width = clamp(Math.round(o.width), Math.min(L.width[0], len), Math.min(L.width[1], len));
    o.offset = clamp(Math.round(o.offset), 0, Math.max(0, len - o.width));
    o.height = clamp(Math.round(o.height), Math.min(L.height[0], room.h), Math.min(L.height[1], room.h));
    if (o.type === 'window') o.sill = clamp(Math.round(o.sill), 0, Math.max(0, room.h - o.height));
  }

  // 문 앞에 비워 둘 깊이: 방 안쪽으로 여는 여닫이문은 문짝이 지나가는 만큼 필요하다.
  function zoneDepth(o) {
    if (o.type !== 'door') return K.WINDOW_CLEAR;
    return o.leaf === 'swing' && o.swing === 'in' ? Math.max(K.DOOR_CLEAR, o.width) : K.DOOR_CLEAR;
  }

  function openingZone(o, room) { return wallRect(room, o.wall, o.offset, o.offset + o.width, 0, zoneDepth(o)); }

  // 문마다 앞에 비워 둘 바닥 영역
  function doorZones(design) {
    return openingsOf(design).filter((o) => o.type === 'door').map((o) => ({ id: o.id, o, rect: openingZone(o, design.room) }));
  }

  // 벽 앞 depth 깊이의 띠와 사각형 r이 겹치면, 벽을 따라간 범위를 돌려준다.
  function bandSpan(room, wall, depth, r) {
    const band = wallRect(room, wall, 0, wallLen(room, wall), 0, depth);
    if (!overlap(band, r, 0.25)) return null;
    return WALL_AXIS[wall] === 'x' ? [r.x0, r.x1] : [r.z0, r.z1];
  }

  // [lo, hi]에서 taken을 뺀 나머지 구간들
  function complement(taken, lo, hi) {
    const list = taken.map((t) => [Math.max(lo, t[0]), Math.min(hi, t[1])]).filter((t) => t[1] > t[0]).sort((a, b) => a[0] - b[0]);
    const out = [];
    let cur = lo;
    for (const t of list) {
      if (t[0] > cur) out.push([cur, t[0]]);
      cur = Math.max(cur, t[1]);
    }
    if (cur < hi) out.push([cur, hi]);
    return out;
  }

  // 벽에서 문·창문을 놓을 수 있는 구간: 다른 문·창문과 벽에 닿은 벽체를 뺀다. withUnits면 벽 앞에 선 유닛도 뺀다.
  function wallFree(design, wall, exceptId, withUnits) {
    const room = design.room;
    const taken = [];
    for (const o of openingsOf(design)) if (o.wall === wall && o.id !== exceptId) taken.push([o.offset, o.offset + o.width]);
    for (const k of blocksOf(design)) {
      const s = bandSpan(room, wall, 1, box(k));
      if (s) taken.push(s);
    }
    if (withUnits) {
      for (const u of design.units) for (const r of solidRects(u)) {
        const s = bandSpan(room, wall, K.WINDOW_CLEAR, r);
        if (s) taken.push(s);
      }
    }
    return complement(taken, 0, wallLen(room, wall));
  }

  /**
   * 문이나 창문을 벽을 따라 옮길 때의 위치. desired는 원하는 offset.
   * opt.snap이면 벽 끝, 벽 가운데, 옆 문·창문에 붙고, 없으면 10mm 단위로 맞춘다. 다른 문·창문·벽체와는 겹치지 않는다.
   */
  function resolveOpeningMove(design, o, wall, desired, opt) {
    const room = design.room;
    const len = wallLen(room, wall);
    const L = o.type === 'door' ? K.LIM.door : K.LIM.window;
    const width = clamp(o.width, Math.min(L.width[0], len), Math.min(L.width[1], len));
    let want = clamp(Math.round(desired), 0, Math.max(0, len - width));
    let snap = null;
    if (opt && opt.snap) {
      const lim = Math.max(10, opt.thresh * 0.6);
      const cands = [{ v: 0, kind: 'end' }, { v: len - width, kind: 'end' }, { v: Math.round((len - width) / 2), kind: 'center' }];
      for (const k of openingsOf(design)) {
        if (k.wall !== wall || k.id === o.id) continue;
        cands.push({ v: k.offset + k.width, kind: 'next' }, { v: k.offset - width, kind: 'next' });
      }
      let best = null;
      for (const c of cands) {
        const dd = Math.abs(c.v - want);
        if (c.v < 0 || c.v > len - width || dd > lim) continue;
        if (!best || dd < best.dd) best = { v: c.v, dd, kind: c.kind };
      }
      if (best) { want = best.v; snap = best.kind; } else want = clamp(round10(want), 0, Math.max(0, len - width));
    }
    const nf = nearestFit(wallFree(design, wall, o.id, false), width, want);
    const offset = nf ? Math.round(nf.y) : want;
    return { wall, offset, width, snap: nf && Math.abs(nf.y - want) < 0.5 ? snap : null, blocked: !nf };
  }

  function makeOpening(design, type) {
    const room = design.room;
    if (type === 'window') return { id: uid('o'), type: 'window', wall: 'N', offset: 0, width: Math.min(1200, round10(room.w / 2)), height: Math.min(1200, room.h - 1000), sill: 900 };
    return { id: uid('o'), type: 'door', wall: 'S', offset: 0, width: 800, height: clamp(Math.min(K.DOOR_H, room.h - 100), 1800, room.h), leaf: 'swing', swing: 'out', hinge: 'a' };
  }

  // 새 문·창문을 놓을 자리: 비어 있는 벽의 가장 넓은 구간 가운데. 창문은 유닛이 서 있지 않은 벽을 먼저 찾는다.
  function findOpeningSpot(o, design) {
    const order = o.type === 'door' ? ['S', 'E', 'W', 'N'] : ['N', 'E', 'W', 'S'];
    for (const withUnits of [true, false]) {
      let best = null;
      for (const wall of order) {
        for (const iv of wallFree(design, wall, o.id, withUnits)) {
          const len = iv[1] - iv[0];
          if (len < o.width - 0.01) continue;
          if (!best || len > best.len + 200) best = { wall, len, offset: round10(iv[0] + (len - o.width) / 2) };
        }
      }
      if (best) return { wall: best.wall, offset: best.offset };
    }
    return { wall: order[0], offset: 0 };
  }

  function blockName(design, kind) {
    const base = BLOCK_NAME[kind] || BLOCK_NAME.pillar;
    for (let i = 1; ; i++) {
      const n = base + ' ' + i;
      if (!blocksOf(design).some((b) => b.name === n)) return n;
    }
  }

  const blockH = (b, room) => (b.full ? room.h : Math.min(b.h, room.h));

  function fixBlock(b, room) {
    const L = K.LIM.block;
    b.w = clamp(Math.round(b.w), L.w[0], Math.min(L.w[1], room.w));
    b.d = clamp(Math.round(b.d), L.d[0], Math.min(L.d[1], room.d));
    b.h = clamp(Math.round(b.h), L.h[0], room.h);
    if (b.h >= room.h) b.full = true;
    if (b.full) b.h = room.h;
    const c = clampToRoom(b, b.x, b.z, 0, room);
    b.x = half2(c.x); b.z = half2(c.z);
  }

  // 벽체: 기둥(300 × 300), 가벽(두께 100), 꺾인 벽(방의 한 모서리를 막아 ㄱ자 방을 만든다)
  function makeBlock(design, kind) {
    const room = design.room;
    if (BLOCK_KINDS.indexOf(kind) < 0) kind = 'pillar';
    const b = { id: uid('b'), kind, name: blockName(design, kind), x: 0, z: 0, rot: 0, w: 300, d: 300, h: room.h, full: true };
    if (kind === 'partition') { b.w = 100; b.d = clamp(round10(room.d / 2), 300, 900); }
    if (kind === 'notch') { b.w = clamp(round10(room.w / 3), 300, 1500); b.d = clamp(round10(room.d / 3), 300, 1500); }
    return b;
  }

  // 새 벽체를 놓을 자리. 유닛, 문 앞, 창문 앞을 피한 모서리·벽 쪽을 먼저 찾고, 없으면 방 가운데.
  function findBlockSpot(b, design) {
    const room = design.room;
    const boxes = colliders(design, b.id);
    const zones = openingsOf(design).map((o) => openingZone(o, room));
    const hx = b.w / 2;
    const hz = b.d / 2;
    const ok = (x, z, door) => {
      const r = { x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz };
      if (!inRoom(r, room) || boxes.some((ob) => overlap(r, ob))) return false;
      return !(door && zones.some((zr) => overlap(r, zr)));
    };
    const corners = [[room.w - hx, hz], [hx, hz], [room.w - hx, room.d - hz], [hx, room.d - hz]];
    for (const door of [true, false]) {
      if (b.kind !== 'partition') for (const c of corners) if (ok(c[0], c[1], door)) return { x: half2(c[0]), z: half2(c[1]) };
      for (const z of [hz, room.d - hz]) {
        // 벽 가운데에서 시작해 양옆으로 넓혀 가며 찾는다
        const mid = round10(room.w / 2);
        for (let k = 0; k <= room.w; k += 50) {
          for (const x of k ? [mid + k, mid - k] : [mid]) if (ok(x, z, door)) return { x: half2(x), z: half2(z) };
        }
      }
    }
    return { x: half2(room.w / 2), z: half2(room.d / 2), forced: true };
  }

  function shiftAll(design, axis, delta) {
    for (const u of design.units) { if (axis === 'x') u.x += delta; else u.z += delta; }
    for (const b of blocksOf(design)) { if (axis === 'x') b.x += delta; else b.z += delta; }
    for (const o of openingsOf(design)) if (WALL_AXIS[o.wall] === axis) o.offset += delta;
  }

  /**
   * 평면에서 벽을 끌어 방 크기를 바꾼다. coord는 그 벽이 놓일 새 위치(끌기 전 좌표).
   * 벽은 안에 있는 가구·벽체·문에 닿으면 멈춘다. 왼쪽·위쪽 벽을 옮기면 안의 것들이 제자리에 있도록 좌표를 함께 옮긴다.
   * 반환: { dx, dz } 좌표가 옮겨진 양, fit은 가구에 맞닿아 멈췄는지.
   */
  function resizeRoomByWall(design, wall, coord, opt) {
    const room = design.room;
    const axis = wall === 'E' || wall === 'W' ? 'x' : 'z';
    const size = axis === 'x' ? room.w : room.d;
    const lim = axis === 'x' ? K.LIM.room.w : K.LIM.room.d;
    let lo = size;
    let hi = 0;
    // 방 밖으로 나가 있는 부분(방보다 큰 유닛)은 지금의 방 안쪽까지만 따진다: 벽이 그 끝까지 튀어 나가지 않도록
    const eat = (a, b) => { lo = Math.min(lo, Math.max(0, a)); hi = Math.max(hi, Math.min(size, b)); };
    for (const u of design.units) { const b = box(u); if (axis === 'x') eat(b.x0, b.x1); else eat(b.z0, b.z1); }
    for (const k of blocksOf(design)) { const b = box(k); if (axis === 'x') eat(b.x0, b.x1); else eat(b.z0, b.z1); }
    for (const o of openingsOf(design)) if (WALL_AXIS[o.wall] === axis) eat(o.offset, o.offset + o.width);
    const far = wall === 'E' || wall === 'S';
    const fit = hi > 0 ? Math.ceil(far ? hi : size - lo) : 0;      // 안의 것들에 딱 맞는 크기
    const min = Math.max(lim[0], fit);
    let target = far ? coord : size - coord;
    let snapped = null;
    if (opt && opt.snap) {
      if (fit >= lim[0] && Math.abs(target - fit) <= opt.thresh) { target = fit; snapped = 'fit'; }
      else if (Math.abs(target - Math.round(target / 100) * 100) <= opt.thresh * 0.25) { target = Math.round(target / 100) * 100; snapped = 'grid'; }
      else target = round10(target);
    } else {
      target = Math.round(target);
    }
    target = clamp(target, min, lim[1]);
    if (snapped === 'fit' && target !== fit) snapped = null;
    const delta = far ? 0 : target - size;         // 왼쪽·위쪽 벽이 바깥으로 나간 만큼 안의 것들을 민다
    if (axis === 'x') room.w = target; else room.d = target;
    if (delta) shiftAll(design, axis, delta);
    for (const o of openingsOf(design)) fixOpening(o, room);
    // 방 안에 있는 유닛은 그대로이고, 방보다 커서 밖으로 나가 있던 유닛만 바뀐 방에 맞춰 다시 놓인다
    for (const u of design.units) {
      const c = clampToRoom(u, u.x, u.z, u.rot || 0, room);
      u.x = half2(c.x); u.z = half2(c.z);
    }
    return { dx: axis === 'x' ? delta : 0, dz: axis === 'z' ? delta : 0, size: target, fit: snapped === 'fit' };
  }

  /* ---------- 유닛 만들기 ---------- */

  function unitName(design, kind) {
    const base = KIND_NAME[kind] || KIND_NAME.std;
    for (let i = 1; ; i++) {
      const n = base + ' ' + i;
      if (!design.units.some((u) => u.name === n)) return n;
    }
  }

  function num(v, lo, hi, def) {
    v = Number(v);
    if (!isFinite(v)) v = def;
    return clamp(Math.round(v), lo, Math.max(lo, hi));
  }

  // 유닛 값을 종류에 맞는 범위와 조합으로 정리한다 (새로 만들 때와 불러올 때 같은 규칙).
  function coerceUnit(raw) {
    const L = K.LIM;
    const kind = KINDS.indexOf(raw.kind) >= 0 ? raw.kind : 'std';
    const u = { id: raw.id, name: raw.name, kind, x: 0, z: 0, rot: ROTS.indexOf(raw.rot) >= 0 ? raw.rot : 0 };
    if (kind === 'corner') {
      u.w = num(raw.w, L.corner.w[0], L.corner.w[1], 1000);
      u.h = num(raw.h, L.unit.h[0], L.unit.h[1], 2100);
      u.w2 = num(raw.w2, L.corner.w2[0], L.corner.w2[1], 1000);
      u.d = num(raw.d, L.corner.d[0], Math.min(L.corner.d[1], u.w2 - K.CORNER_MIN), 580);
      u.d2 = num(raw.d2 != null ? raw.d2 : u.d, L.corner.d[0], Math.min(L.corner.d[1], u.w - K.CORNER_MIN), u.d);
    } else {
      u.w = num(raw.w, L.unit.w[0], L.unit.w[1], kind === 'mirror' ? 500 : 800);
      u.h = num(raw.h, L.unit.h[0], L.unit.h[1], 2100);
      u.d = num(raw.d, L.unit.d[0], L.unit.d[1], 580);
    }
    // 형태: 일반 유닛은 세 가지, 코너장은 판넬형과 스피드랙, 거울장은 판넬형
    u.style = kind === 'std' && STYLES.indexOf(raw.style) >= 0 ? raw.style : kind === 'corner' && raw.style === 'rack' ? 'rack' : 'panel';
    u.finish = FINISHES.indexOf(raw.finish) >= 0 ? raw.finish : 'white';
    if (u.style === 'rack' && RACK_FINISHES.indexOf(u.finish) < 0) u.finish = 'white';
    if (kind === 'mirror') u.door = 'hinge';
    else if (u.style !== 'panel') u.door = 'none';
    else if (raw.door === 'hinge') u.door = 'hinge';
    else u.door = raw.door === 'slide' && kind === 'std' ? 'slide' : 'none';
    u.doorFinish = kind === 'mirror' ? 'mirror' : DOOR_FINISHES.indexOf(raw.doorFinish) >= 0 ? raw.doorFinish : u.finish;
    u.hinge = raw.hinge === 'right' ? 'right' : 'left';
    // 문 높이를 따로 정한 경우에만 값이 있다
    const dh = Number(raw.doorH);
    if (u.door !== 'none' && isFinite(dh) && dh > 0) {
      u.doorH = clamp(Math.round(dh), 1, L.unit.h[1]);
      u.doorAt = raw.doorAt === 'bottom' ? 'bottom' : 'top';
    }
    u.parts = [];
    return u;
  }

  function makeUnit(design, o) {
    o = o || {};
    const kind = KINDS.indexOf(o.kind) >= 0 ? o.kind : 'std';
    const u = coerceUnit(Object.assign({}, o, {
      id: uid('u'),
      name: o.name || unitName(design, kind),
      kind,
      rot: 0,
      h: o.h || Math.min(2100, design.room.h - 100),
    }));
    return u;
  }

  // 벽면들: 방의 네 벽과 벽체의 면. rot은 그 면을 등질 때의 유닛 방향, at은 면의 위치, a~b는 면이 뻗은 범위.
  function wallRuns(design) {
    const room = design.room;
    const runs = [
      { rot: 0, at: 0, a: 0, b: room.w }, { rot: 90, at: 0, a: 0, b: room.d },
      { rot: 270, at: room.w, a: 0, b: room.d }, { rot: 180, at: room.d, a: 0, b: room.w },
    ];
    for (const k of blocksOf(design)) {
      const b = box(k);
      if (b.z1 < room.d - 1) runs.push({ rot: 0, at: b.z1, a: b.x0, b: b.x1 });
      if (b.x1 < room.w - 1) runs.push({ rot: 90, at: b.x1, a: b.z0, b: b.z1 });
      if (b.x0 > 1) runs.push({ rot: 270, at: b.x0, a: b.z0, b: b.z1 });
      if (b.z0 > 1) runs.push({ rot: 180, at: b.z0, a: b.x0, b: b.x1 });
    }
    return runs;
  }

  // 새 유닛을 놓을 빈자리: 기준 유닛의 옆, 그다음 벽을 따라 처음 나오는 빈 곳. 코너장은 방의 모서리부터 찾는다.
  function findSpot(nu, design, sel) {
    const room = design.room;
    const boxes = colliders(design, nu.id);
    const zones = doorZones(design).map((z) => z.rect);
    const ok = (x, z, rot, door) => {
      const b = box(nu, x, z, rot);
      if (!inRoom(b, room) || boxes.some((ob) => overlap(b, ob))) return false;
      return !(door && zones.some((zr) => overlap(b, zr)));
    };
    const at = (x, z, rot) => ({ x: half2(x), z: half2(z), rot });
    if (nu.kind === 'corner') {
      for (const door of [true, false]) {
        for (const rot of [0, 270, 90, 180]) {
          const h = half(nu, rot);
          const x = rot === 0 || rot === 90 ? h.hx : room.w - h.hx;
          const z = rot === 0 || rot === 270 ? h.hz : room.d - h.hz;
          if (ok(x, z, rot, door)) return at(x, z, rot);
        }
      }
    } else if (sel && sel.kind === 'corner') {
      // 코너장 옆: 뒷벽 쪽 날개 끝, 그다음 옆벽 쪽 날개 끝
      const c = cornerGeo(sel);
      const a = localToWorld(sel, c.X1 + nu.w / 2, c.Z0 + nu.d / 2);
      if (ok(a.x, a.z, sel.rot, true)) return at(a.x, a.z, sel.rot);
      const rot2 = (sel.rot + 90) % 360;
      const b = localToWorld(sel, c.X0 + nu.d / 2, c.Z1 + nu.w / 2);
      if (ok(b.x, b.z, rot2, true)) return at(b.x, b.z, rot2);
    } else if (sel) {
      const d = dirs(sel.rot);
      const back = (nu.d - sel.d) / 2;
      for (const s of [1, -1]) {
        const along = s * (sel.w / 2 + nu.w / 2);
        const x = sel.x + d.r.x * along + d.f.x * back;
        const z = sel.z + d.r.z * along + d.f.z * back;
        if (ok(x, z, sel.rot, true)) return at(x, z, sel.rot);
      }
    }
    const order = sel ? [sel.rot].concat(ROTS.filter((r) => r !== sel.rot)) : [0, 90, 270, 180];
    const runs = wallRuns(design);
    for (const door of [true, false]) {
      for (const rot of order) {
        const h = half(nu, rot);
        for (const run of runs) {
          if (run.rot !== rot) continue;
          if (rot % 180 === 0) {
            const z = rot === 0 ? run.at + h.hz : run.at - h.hz;
            for (let x = run.a + h.hx; x <= run.b - h.hx + 0.01; x += K.GRID) if (ok(x, z, rot, door)) return at(x, z, rot);
          } else {
            const x = rot === 90 ? run.at + h.hx : run.at - h.hx;
            for (let z = run.a + h.hz; z <= run.b - h.hz + 0.01; z += K.GRID) if (ok(x, z, rot, door)) return at(x, z, rot);
          }
        }
      }
    }
    return null;
  }

  /* ---------- 확인할 점, 요약, 부품 목록 ---------- */

  function checkDesign(design) {
    const out = [];
    const room = design.room;
    const units = design.units;
    const blocks = blocksOf(design);
    const openings = openingsOf(design);
    const boxes = units.map((u) => box(u));
    const blockBoxes = blocks.map((b) => box(b));
    const zones = doorZones(design);
    const push = (level, code, text, extra) => out.push(Object.assign({ level, code, text }, extra));

    units.forEach((u, i) => {
      const b = boxes[i];
      const tag = { unitId: u.id };
      const inside = inRoom(b, room);
      if (!inside) push('bad', 'out', u.name + ': 방 밖으로 나갔습니다. 크기를 줄이거나 위치를 옮기세요.', tag);
      if (u.h > room.h) push('bad', 'tall', u.name + ': 높이 ' + u.h + 'mm가 천장 높이 ' + room.h + 'mm보다 큽니다.', tag);
      for (let j = i + 1; j < units.length; j++) {
        if (overlap(b, boxes[j])) push('bad', 'overlap', u.name + ' · ' + units[j].name + ': 서로 겹칩니다.', { unitId: u.id, otherId: units[j].id });
      }
      blocks.forEach((k, j) => {
        if (overlap(b, blockBoxes[j])) push('bad', 'overlap', u.name + ' · ' + k.name + ': 서로 겹칩니다.', { unitId: u.id, itemId: k.id });
      });
      const solid = solidRects(u);
      for (const z of zones) {
        if (solid.some((r) => overlap(r, z.rect))) push('warn', 'door', u.name + ': ' + openingName(design, z.o) + ' 앞 공간을 막습니다.', { unitId: u.id, itemId: z.id });
      }
      for (const o of openings) {
        if (o.type !== 'window' || u.h <= o.sill + 50) continue;
        const zr = openingZone(o, room);
        if (solid.some((r) => overlap(r, zr))) push('warn', 'window', u.name + ': ' + openingName(design, o) + ' 앞을 가립니다.', { unitId: u.id, itemId: o.id });
      }
      if (inside) {
        const g = unitGaps(u, design);
        const front = g.aisle - frontExtra(u);
        if (front < K.AISLE_MIN) push('warn', 'aisle', u.name + ': 앞 공간이 ' + Math.max(0, Math.round(front)) + 'mm입니다. 드나들 통로는 ' + K.AISLE_MIN + 'mm 이상을 권장합니다.', tag);
        if (u.kind === 'corner' && (g.back.gap > 1 || g.left.gap > 1)) push('warn', 'corner', u.name + ': 두 벽이 만나는 모서리에 붙여야 뒤와 옆이 막힙니다.', tag);
        if (doorKind(u) === 'hinge') {
          const hi = hingeInfo(u);
          if (g.aisle < hi.swing) push('warn', 'swing', u.name + ': 앞 공간이 ' + Math.max(0, Math.round(g.aisle)) + 'mm라 여닫이문(' + Math.round(hi.swing) + 'mm)이 다 열리지 않습니다.', tag);
          if (u.kind !== 'corner' && hi.widths[0] > K.LEAF_MAX) push('warn', 'leaf', u.name + ': 문짝 한 짝이 ' + Math.round(hi.widths[0]) + 'mm입니다. 여닫이문은 한 짝 ' + K.LEAF_MAX + 'mm 이하를 권장합니다.', tag);
        }
      }
      const rods = u.parts.filter((p) => p.type === 'rod');
      // 코너장은 두 부분 가운데 얕은 쪽을 본다. 스피드랙은 앞뒤가 트여 있어 규격(아래)으로 따로 본다.
      const hangD = u.kind === 'corner' ? Math.min(u.d, d2of(u)) : u.d;
      if (rods.length && !isRack(u) && hangD < K.DEPTH_FOR_HANGER) push('warn', 'depth', u.name + ': 깊이 ' + hangD + 'mm는 행거봉을 쓰기에 얕습니다. 옷걸이 폭이 약 450mm라 ' + K.DEPTH_FOR_HANGER + 'mm 이상을 권장합니다.', tag);
      if (isRack(u) && u.kind === 'corner') {
        if (rackStd(u, room)) push('warn', 'rack-size', u.name + ': 스피드랙 공식몰의 코너 행거(1000 × 1000mm, 높이 1950·2100mm. 세트에는 1200 코너도 있음)와 다른 크기입니다. 주문 전에 판매처 규격을 확인하세요.', tag);
      } else if (isRack(u)) {
        const t = rackStd(u, room) || u;
        const off = [];
        if (t.w !== u.w) off.push('가로 ' + u.w + ' → ' + t.w);
        if (t.d !== u.d) off.push('깊이 ' + u.d + ' → ' + t.d);
        if (t.h !== u.h) off.push('높이 ' + u.h + ' → ' + t.h);
        if (off.length) push('warn', 'rack-size', u.name + ': 스피드랙 공식몰 규격에 없는 크기입니다 (' + off.join(', ') + 'mm). 주문 전에 판매처 규격을 확인하세요.', tag);
        if (rods.length && (RACK_STD.rodW.indexOf(t.w) < 0 || RACK_STD.rodD.indexOf(t.d) < 0)) push('warn', 'rack-rod', u.name + ': 스피드랙 공식몰의 행거봉 세트는 가로 400~1,200mm, 깊이 400·500·600mm 규격입니다. 주문 전에 판매처 규격을 확인하세요.', { unitId: u.id, partId: rods[0].id });
        const drawer = u.parts.find((p) => p.type === 'drawer');
        if (drawer && !RACK_STD.drawer.some((k) => k[0] === t.w && k[1] === t.d)) push('warn', 'rack-drawer', u.name + ': 스피드랙 공식몰의 서랍은 가로 800 × 깊이 500·600mm용 3단서랍과 가로 600·1,200 × 깊이 400mm용 패브릭 서랍장입니다. 주문 전에 판매처 규격을 확인하세요.', { unitId: u.id, partId: drawer.id });
      }
      // 판넬형·기둥형은 폭이 넓으면 처짐을 알린다 (스피드랙은 위의 규격으로 본다)
      const span = u.kind === 'corner' ? Math.max(u.w, u.w2 - u.d) : u.w;
      if (!isRack(u) && span > K.SPAN_WARN && u.parts.some((p) => p.type !== 'drawer')) push('warn', 'span', u.name + ': 폭이 1,000mm를 넘습니다. 선반과 행거봉이 처지지 않도록 중간 지지대를 권장합니다.', tag);
      if (u.kind === 'corner') {
        const c = cornerGeo(u);
        const narrow = (len, name) => push('warn', 'corner-front', u.name + ': ' + name + '의 앞면이 ' + Math.round(len) + 'mm로 좁습니다. ' + K.CORNER_FRONT + 'mm 이상이면 옷을 넣고 꺼내기 쉽습니다.', tag);
        if (c.frontA < K.CORNER_FRONT) narrow(c.frontA, '뒷벽 쪽 부분');
        if (c.frontB < K.CORNER_FRONT) narrow(c.frontB, '옆벽 쪽 부분');
      }
      const it = interior(u);
      const sorted = u.parts.slice().sort((p, q) => p.y - q.y);
      let clash = false;
      sorted.forEach((p, k) => {
        if (p.y < it.y0 - 0.5 || p.y + partH(p, u) > it.y1 + 0.5) clash = true;
        if (k > 0 && p.y < sorted[k - 1].y + partH(sorted[k - 1], u) - 0.5) clash = true;
      });
      if (clash) push('bad', 'parts', u.name + ': 내부 부품이 겹치거나 유닛 높이를 벗어났습니다.', tag);
      for (const p of rods) {
        const c = hangClear(u, p);
        if (c < K.HANG.short) push('warn', 'hang', u.name + ': 행거봉 아래 여유가 ' + Math.round(c) + 'mm입니다. 옷이 아래 부품에 닿을 수 있습니다.', { unitId: u.id, partId: p.id });
        const up = partGaps(u, p).above;
        if (up < K.HOOK - 4) push('warn', 'hook', u.name + ': 행거봉 위 여유가 ' + Math.max(0, Math.round(up)) + 'mm입니다. 옷걸이 고리를 걸 수 있게 40mm 이상 띄우세요.', { unitId: u.id, partId: p.id });
      }
    });

    for (const r of slideRuns(design)) {
      const first = r.units[0];
      if (r.pw < K.PANEL_MIN) push('warn', 'slide-narrow', first.name + ': 미닫이문 한 짝이 ' + Math.round(r.pw) + 'mm로 좁습니다. 한 짝 ' + K.PANEL_MIN + 'mm 이상이 되도록 유닛을 넓히거나 옆 유닛과 붙이세요.', { unitId: first.id });
      else if (r.pw > K.PANEL_MAX) push('warn', 'slide-wide', first.name + ': 미닫이문 한 짝이 ' + Math.round(r.pw) + 'mm로 넓습니다. 한 짝 ' + K.PANEL_MAX + 'mm 이하를 권장합니다.', { unitId: first.id });
      for (const s of r.spans) {
        // 문이 서랍 높이를 가릴 때만 본다 (문 높이를 줄여 서랍을 드러낸 경우는 뺀다)
        const dr = s.u.parts.find((p) => p.type === 'drawer' && p.y < r.y1 - 0.5 && p.y + partH(p, s.u) > r.y0 + 0.5);
        if (!dr) continue;
        const lo = s.a0 - r.a0 + K.T;
        const hi = s.a1 - r.a0 - K.T;
        if (Math.floor((lo + 22) / r.bay) !== Math.floor((hi - 22) / r.bay)) {
          push('warn', 'slide-drawer', s.u.name + ': 서랍이 미닫이문 두 짝에 걸쳐 있어 꺼내기 어렵습니다. 유닛 폭을 문짝 한 칸(' + Math.round(r.bay) + 'mm)에 맞추세요.', { unitId: s.u.id, partId: dr.id });
        }
      }
    }

    openings.forEach((o, i) => {
      const nm = openingName(design, o);
      if (o.type === 'door' && o.width < K.AISLE_MIN) push('warn', 'door-narrow', nm + ': 폭이 ' + o.width + 'mm입니다. 드나드는 문은 ' + K.AISLE_MIN + 'mm 이상을 권장합니다.', { itemId: o.id });
      for (let j = i + 1; j < openings.length; j++) {
        const q = openings[j];
        if (q.wall !== o.wall) continue;
        if (o.offset < q.offset + q.width - 0.5 && o.offset + o.width > q.offset + 0.5) push('warn', 'open-overlap', nm + ' · ' + openingName(design, q) + ': 같은 벽에서 서로 겹칩니다.', { itemId: o.id, otherId: q.id });
      }
      const zr = o.type === 'door' ? openingZone(o, room) : wallRect(room, o.wall, o.offset, o.offset + o.width, 0, 1);
      blocks.forEach((k, j) => {
        if (overlap(blockBoxes[j], zr, 0.25)) push('warn', 'open-block', nm + ': ' + k.name + '에 막혀 있습니다.', { itemId: o.id, otherId: k.id });
      });
    });
    return out;
  }

  function summary(design) {
    const s = { units: design.units.length, rods: 0, rodLen: 0, shelves: 0, drawers: 0, doors: 0, area: design.room.w * design.room.d / 1e6 };
    for (const u of design.units) {
      const corner = u.kind === 'corner' ? cornerGeo(u) : null;
      const iw = interior(u).w;
      for (const p of u.parts) {
        if (p.type === 'rod') { s.rods += 1; s.rodLen += corner ? (corner.rodA[1] - corner.rodA[0]) + (corner.rodB[1] - corner.rodB[0]) : iw; }
        else if (p.type === 'shelf') s.shelves += 1;
        else s.drawers += p.n;
      }
      if (doorKind(u) === 'hinge') s.doors += hingeInfo(u).leaves;
    }
    for (const r of slideRuns(design)) s.doors += r.n;
    return s;
  }

  function shelfDepth(u) { return isRack(u) ? u.d - 2 * K.RACK_GAP : u.style === 'pole' ? u.d - 10 : u.d - K.BACK_T - 20; }

  // 스피드랙 유닛의 크기에 가장 가까운 공식몰 규격. 이미 규격이면 null. room을 주면 천장보다 낮은 높이에서 고른다.
  // 코너장은 한 변의 길이와 높이만 본다 ({ w, w2, h }).
  function rackStd(u, room) {
    if (!isRack(u)) return null;
    const near = (list, v) => list.reduce((b, k) => (Math.abs(k - v) < Math.abs(b - v) ? k : b), list[0]);
    if (u.kind === 'corner') {
      const side = near(RACK_STD.cornerSide, (u.w + u.w2) / 2);
      const ch = RACK_STD.cornerH.filter((k) => !room || k <= room.h);
      const t = { w: side, w2: side, h: ch.length ? near(ch, u.h) : u.h };
      return t.w === u.w && t.w2 === u.w2 && t.h === u.h ? null : t;
    }
    const L = K.LIM.unit;
    const hs = RACK_STD.h.filter((k) => k >= L.h[0] && (!room || k <= room.h));
    const t = {
      w: near(RACK_STD.w.filter((k) => k >= L.w[0] && k <= L.w[1]), u.w),
      d: near(RACK_STD.d.filter((k) => k >= L.d[0] && k <= L.d[1]), u.d),
      h: hs.length ? near(hs, u.h) : u.h,
    };
    return t.w === u.w && t.d === u.d && t.h === u.h ? null : t;
  }

  // 참고용 부품 목록: 같은 규격끼리 묶는다.
  function bom(design) {
    const rows = [];
    const add = (kind, spec, qty) => {
      const r = rows.find((k) => k.kind === kind && k.spec === spec);
      if (r) r.qty += qty; else rows.push({ kind, spec, qty });
    };
    const x = ' × ';
    const R = Math.round;
    for (const u of design.units) {
      const it = interior(u);
      if (u.kind === 'corner' && isRack(u)) {
        // 코너 스피드랙: 날개마다 선반 단과 행거봉 세트를 따로 센다. 기둥은 ㄱ자 윤곽의 꼭짓점 여섯 곳.
        const c = cornerGeo(u);
        const levels = 2 + u.parts.filter((p) => p.type === 'shelf').length;
        const rodN = u.parts.filter((p) => p.type === 'rod').length;
        const a = u.w + x + c.DA;
        const b = R(c.frontB) + x + c.DB;
        add('스피드랙 기둥', String(u.h), 6);
        add('스피드랙 선반 단', a, levels);
        add('스피드랙 선반 단', b, levels);
        if (rodN) { add('스피드랙 행거봉 세트', a, rodN); add('스피드랙 행거봉 세트', b, rodN); }
      } else if (u.kind === 'corner') {
        const c = cornerGeo(u);
        add('측판', u.d + x + u.h + x + K.T, 1);
        add('측판', c.DB + x + u.h + x + K.T, 1);
        add('상판·하판', R(c.la) + x + it.d + x + K.T, 2);
        add('상판·하판', R(c.lbTop) + x + it.d2 + x + K.T, 2);
        add('뒷판', (u.w - K.T) + x + (u.h - K.BASE) + x + K.BACK_T, 1);
        add('뒷판', (u.w2 - K.T - K.BACK_T) + x + (u.h - K.BASE) + x + K.BACK_T, 1);
        add('걸레받이', (c.frontA + 40 - K.T) + x + K.BASE + x + K.T, 1);
        add('걸레받이', (c.frontB + 40 - K.T) + x + K.BASE + x + K.T, 1);
        for (const p of u.parts) {
          if (p.type === 'rod') {
            add('행거봉', 'Ø' + K.ROD_D + x + R(c.rodA[1] - c.rodA[0]), 1);
            add('행거봉', 'Ø' + K.ROD_D + x + R(c.rodB[1] - c.rodB[0]), 1);
          } else if (p.type === 'shelf') {
            add('선반', R(c.la) + x + R(c.sdA) + x + K.SHELF_T, 1);
            add('선반', R(c.lb) + x + R(c.sdB) + x + K.SHELF_T, 1);
          }
        }
      } else if (isRack(u)) {
        // 스피드랙은 판매 단위대로 적는다: 기둥, 선반 단(받침 + 합판), 행거봉 세트(행거봉 + 행거받침)
        add('스피드랙 기둥', String(u.h), 4);
        add('스피드랙 선반 단', u.w + x + u.d, 2 + u.parts.filter((p) => p.type === 'shelf').length);
        const rodN = u.parts.filter((p) => p.type === 'rod').length;
        if (rodN) add('스피드랙 행거봉 세트', u.w + x + u.d, rodN);
        for (const p of u.parts) if (p.type === 'drawer') add('스피드랙 서랍', u.w + x + u.d + ' · ' + p.n + '단', 1);
      } else {
        if (u.style === 'pole') {
          add('기둥', K.POST + x + K.POST + x + u.h, 2);
          add('상부 가로대', it.w + x + 20 + x + 20, 1);
        } else {
          add('측판', u.d + x + u.h + x + K.T, 2);
          add('상판·하판', it.w + x + it.d + x + K.T, 2);
          add('뒷판', it.w + x + (u.h - K.BASE) + x + K.BACK_T, 1);
          add('걸레받이', it.w + x + K.BASE + x + K.T, 1);
        }
        for (const p of u.parts) {
          if (p.type === 'rod') add('행거봉', 'Ø' + K.ROD_D + x + it.w, 1);
          else if (p.type === 'shelf') add('선반', it.w + x + shelfDepth(u) + x + K.SHELF_T, 1);
          else add('서랍', it.w + x + p.eh + x + (it.d - 30), p.n);
        }
      }
      if (doorKind(u) === 'hinge') {
        const hi = hingeInfo(u);
        const mirror = doorFinishOf(u) === 'mirror';
        if (u.kind === 'corner') add(mirror ? '코너 접이문 (거울)' : '코너 접이문', R(hi.widths[0]) + ' + ' + R(hi.widths[1]) + x + R(hi.height) + x + K.DOOR_T, 1);
        else add(mirror ? '여닫이문 (거울)' : '여닫이문', R(hi.widths[0]) + x + R(hi.height) + x + K.DOOR_T, hi.leaves);
      }
    }
    for (const r of slideRuns(design)) {
      add(r.finish === 'mirror' ? '미닫이문 (거울)' : '미닫이문', R(r.pw) + x + R(r.ph), r.n);
      add('미닫이 레일 (상·하)', String(R(r.w)), 1);
    }
    const order = ['측판', '상판·하판', '뒷판', '걸레받이', '기둥', '상부 가로대', '스피드랙 기둥', '스피드랙 선반 단', '스피드랙 행거봉 세트', '스피드랙 서랍', '선반', '행거봉', '서랍', '여닫이문', '여닫이문 (거울)', '코너 접이문', '코너 접이문 (거울)', '미닫이문', '미닫이문 (거울)', '미닫이 레일 (상·하)'];
    rows.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.spec.localeCompare(b.spec, 'ko', { numeric: true }));
    return rows;
  }

  /* ---------- 불러오기 검증 ---------- */

  function coerceOpening(raw, room) {
    const L = K.LIM;
    const type = raw.type === 'window' ? 'window' : 'door';
    const o = { id: raw.id, type, wall: WALLS.indexOf(raw.wall) >= 0 ? raw.wall : (type === 'door' ? 'S' : 'N'), offset: num(raw.offset, 0, L.room.w[1], 0) };
    if (type === 'door') {
      o.width = num(raw.width, L.door.width[0], L.door.width[1], 800);
      o.height = num(raw.height, L.door.height[0], L.door.height[1], Math.min(K.DOOR_H, room.h - 100));
      o.leaf = LEAVES.indexOf(raw.leaf) >= 0 ? raw.leaf : 'swing';
      o.swing = raw.swing === 'in' ? 'in' : 'out';
      o.hinge = raw.hinge === 'b' ? 'b' : 'a';
    } else {
      o.width = num(raw.width, L.window.width[0], L.window.width[1], 1200);
      o.height = num(raw.height, L.window.height[0], L.window.height[1], 1200);
      o.sill = num(raw.sill, L.window.sill[0], L.window.sill[1], 900);
    }
    fixOpening(o, room);
    return o;
  }

  function coerceBlock(raw, room, design) {
    const L = K.LIM.block;
    const kind = BLOCK_KINDS.indexOf(raw.kind) >= 0 ? raw.kind : 'pillar';
    const b = {
      id: raw.id, kind,
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim().slice(0, 20) : blockName(design, kind),
      x: isFinite(+raw.x) ? +raw.x : 0, z: isFinite(+raw.z) ? +raw.z : 0, rot: 0,
      w: num(raw.w, L.w[0], L.w[1], 300), d: num(raw.d, L.d[0], L.d[1], 300),
      h: num(raw.h, L.h[0], L.h[1], room.h), full: raw.full !== false,
    };
    fixBlock(b, room);
    return b;
  }

  // 외부에서 들어온 설계를 안전한 값으로 정리한다. 이전 형식(문 하나, 벽체 없음)도 받아 지금 형식으로 바꾼다. 형식이 아니면 null.
  function normalizeDesign(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (!raw.room || typeof raw.room !== 'object') return null;
    const L = K.LIM;
    const room = {
      w: num(raw.room.w, L.room.w[0], L.room.w[1], 2400),
      d: num(raw.room.d, L.room.d[0], L.room.d[1], 1800),
      h: num(raw.room.h, L.room.h[0], L.room.h[1], 2300),
      wallColor: WALL_COLORS.indexOf(raw.room.wallColor) >= 0 ? raw.room.wallColor : 'white',
    };
    const design = { v: 2, room, openings: [], blocks: [], units: [] };
    const ids = {};
    const takeId = (id, prefix) => {
      const ok = typeof id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(id) && !ids[id];
      const out = ok ? id : uid(prefix);
      ids[out] = true;
      return out;
    };

    if (Array.isArray(raw.openings)) {
      for (const ro of raw.openings.slice(0, K.MAX_OPENINGS)) {
        if (!ro || typeof ro !== 'object') continue;
        design.openings.push(coerceOpening(Object.assign({}, ro, { id: takeId(ro.id, 'o') }), room));
      }
    } else {
      // 이전 형식: 문 하나 (표시를 끈 경우에는 문 없음)
      const rd = raw.door && typeof raw.door === 'object' ? raw.door : {};
      if (rd.show !== false) design.openings.push(coerceOpening({ id: takeId('door1', 'o'), type: 'door', wall: rd.wall, offset: rd.offset, width: rd.width }, room));
    }

    if (Array.isArray(raw.blocks)) {
      for (const rb of raw.blocks.slice(0, K.MAX_BLOCKS)) {
        if (!rb || typeof rb !== 'object') continue;
        design.blocks.push(coerceBlock(Object.assign({}, rb, { id: takeId(rb.id, 'b') }), room, design));
      }
    }

    const list = Array.isArray(raw.units) ? raw.units.slice(0, K.MAX_UNITS) : [];
    for (const ru of list) {
      if (!ru || typeof ru !== 'object') continue;
      const kind = KINDS.indexOf(ru.kind) >= 0 ? ru.kind : 'std';
      const u = coerceUnit(Object.assign({}, ru, {
        id: takeId(ru.id, 'u'),
        name: typeof ru.name === 'string' && ru.name.trim() ? ru.name.trim().slice(0, 20) : unitName(design, kind),
      }));
      const c = clampToRoom(u, isFinite(+ru.x) ? +ru.x : 0, isFinite(+ru.z) ? +ru.z : 0, u.rot, room);
      u.x = half2(c.x); u.z = half2(c.z);
      const it = interior(u);
      const types = partTypes(u);
      const parts = Array.isArray(ru.parts) ? ru.parts.slice(0, K.MAX_PARTS) : [];
      for (const rp of parts) {
        if (!rp || typeof rp !== 'object' || types.indexOf(rp.type) < 0) continue;
        const p = { id: takeId(rp.id, 'p'), type: rp.type, y: 0 };
        if (p.type === 'drawer') {
          p.n = num(rp.n, L.drawer.n[0], L.drawer.n[1], 3);
          p.eh = num(rp.eh, L.drawer.eh[0], L.drawer.eh[1], 180);
        }
        // 내부보다 큰 부품(유닛 높이를 줄인 뒤 남은 부품)도 버리지 않고 맨 아래에 둔다: 화면에서 보던 그대로 열리고, 확인할 점으로 알린다
        p.y = num(rp.y, it.y0, it.y1 - partH(p, u), it.y0);
        u.parts.push(p);
      }
      design.units.push(u);
    }
    return design;
  }

  function emptyDesign(room) {
    const r = {
      w: room ? room.w : 2400, d: room ? room.d : 1800, h: room ? room.h : 2300,
      wallColor: room && WALL_COLORS.indexOf(room.wallColor) >= 0 ? room.wallColor : 'white',
    };
    return { v: 2, room: r, openings: [coerceOpening({ id: 'door1', type: 'door', wall: 'S', offset: 1500, width: 800 }, r)], blocks: [], units: [] };
  }

  /* ---------- 예시 배치 ---------- */

  // 벽마다 유닛을 세울 수 있는 빈 구간: 그 벽의 문·창문, 벽 앞의 벽체(통로 폭까지), 다른 문 앞 공간을 뺀다.
  function clearRuns(design, depth) {
    const room = design.room;
    const out = [];
    for (const wall of ['N', 'W', 'E', 'S']) {
      const taken = [];
      for (const o of openingsOf(design)) if (o.wall === wall) taken.push([o.offset - 50, o.offset + o.width + 50]);
      const rects = blocksOf(design).map((b) => ({ r: box(b), depth: depth + K.AISLE_MIN }));
      for (const z of doorZones(design)) if (z.o.wall !== wall) rects.push({ r: z.rect, depth });
      for (const k of rects) {
        const s = bandSpan(room, wall, k.depth, k.r);
        if (s) taken.push(s);
      }
      for (const iv of complement(taken, 0, wallLen(room, wall))) out.push({ wall, a: iv[0], b: iv[1] });
    }
    return out;
  }

  // 예시 배치의 유닛: 가장 길게 비어 있는 벽 구간을 같은 폭의 유닛으로 채운다 (방이 바뀌면 다시 만들 수 있다).
  function sampleUnits(design) {
    const room = design.room;
    // 예시 유닛(깊이 400 이상)과 통로가 들어가지 않는 작은 방에는 예시를 놓지 않는다
    if (Math.min(room.w, room.d) < 1000) return [];
    const d = Math.min(room.w, room.d) >= 1300 ? 580 : 400;
    const h = Math.max(K.LIM.unit.h[0], Math.min(2100, room.h - 100));
    let best = null;
    for (const run of clearRuns(design, d)) {
      const len = run.b - run.a;
      if (!best || len > best.len + 1) best = { run, len };
    }
    if (!best || best.len < 300) return [];
    const run = best.run;
    const n = clamp(Math.round(best.len / 800), 1, 6);
    const w = clamp(Math.floor(best.len / n), 300, 1000);
    const rot = { N: 0, W: 90, S: 180, E: 270 }[run.wall];
    const presets = ['double', 'drawers', 'shelves', 'long', 'mixed', 'double'];
    const tmp = { room, units: [] };
    for (let i = 0; i < n; i++) {
      const u = makeUnit(tmp, { w, h, d });
      const p = wallPoint(room, run.wall, run.a + w / 2 + i * w, d / 2);
      u.x = half2(p.x); u.z = half2(p.z); u.rot = rot;
      u.parts = presetParts(u, presets[i]);
      tmp.units.push(u);
    }
    return tmp.units;
  }

  // 처음 열었을 때 보여 주는 예시 배치
  function sampleDesign(room) {
    const d = emptyDesign(room);
    d.units = sampleUnits(d);
    return d;
  }

  return {
    K, FINISHES, DOOR_FINISHES, WALL_COLORS, KINDS, KIND_NAME, BLOCK_KINDS, BLOCK_NAME, LEAVES, WALLS, WALL_AXIS, ROTS, RIGHT, FRONT, OPP, PART_LABEL,
    STYLES, RACK_FINISHES, RACK_STD, isRack, d2of, shelfT, pitchOf, settleParts, rackStd,
    clamp, half2, round10, uid,
    fd, half, box, dirs, localToWorld, localRect, cornerGeo, solidRects, footprint, frontEdges, labelLocal, facesWall,
    overlap, inRoom, clampToRoom, interior,
    partH, refOffset, partRef, pitchNear, pitchDown, partTypes, freeIntervals, nearestFit, alignTargets,
    resolvePartMove, stepPart, partGaps, hangClear, hangLabel, fitParts, makePart, setPartRef, setDrawerSize, presetParts,
    doorKind, doorFinishOf, doorSpan, doorSpanOf, setDoor, doorAboveDrawers, tidyUnit, hingeInfo, frontExtra, slidePanelCount, slideRuns,
    obstacleRects, colliders, gapInDir, unitGaps, snapUnit, pushOut, faceDist, resolveUnitMove,
    applyResize, fitWidth, rotateUnit, setUnitEdge,
    wallLen, wallPoint, wallRect, openingName, fixOpening, zoneDepth, openingZone, doorZones, bandSpan, complement, wallFree,
    resolveOpeningMove, makeOpening, findOpeningSpot, blockName, blockH, fixBlock, makeBlock, findBlockSpot, resizeRoomByWall,
    unitName, makeUnit, wallRuns, findSpot,
    checkDesign, summary, bom, shelfDepth, normalizeDesign, emptyDesign, clearRuns, sampleUnits, sampleDesign,
  };
});
