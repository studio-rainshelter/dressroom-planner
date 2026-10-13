// 브라우저 점검 3: 끌어서 옮기기 (문·창문, 벽체, 벽), 키보드, 예시 배치
const { open, settle, screenOf, drag, design } = require('./harness');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info))); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

(async () => {
  const t = await open({ width: 1280, height: 800 });
  const page = t.page;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const ui = () => ev(() => JSON.parse(JSON.stringify(__planner.ui)));
  const codes = () => ev(() => __planner.C.checkDesign(__planner.design).map((i) => i.code));
  const bad = () => ev(() => __planner.C.checkDesign(__planner.design).filter((i) => i.level === 'bad').map((i) => i.text));
  const hideToast = () => ev(() => { document.querySelector('#toast').hidden = true; });
  const shot = async (n) => { await hideToast(); await settle(page, 250); await page.screenshot({ path: 'shots/' + n + '.png' }); };
  const load = (raw) => ev((r) => { __planner.Act.load(r); document.querySelector('#toast').hidden = true; }, raw);
  const unit = (id, x, w) => ({ id, name: id, kind: 'std', x, z: 290, rot: 0, w: w || 800, h: 2100, d: 580, style: 'panel', finish: 'white', door: 'none', parts: [{ id: id + 'p', type: 'rod', y: 1688 }] });

  /* 평면 보기에서 문을 벽을 따라 끈다 */
  await load({ v: 2, room: { w: 3200, d: 2600, h: 2300 }, openings: [
    { id: 'dr', type: 'door', wall: 'S', offset: 2200, width: 800, height: 2100, leaf: 'swing', swing: 'out', hinge: 'a' },
    { id: 'wn', type: 'window', wall: 'N', offset: 400, width: 1200, height: 1200, sill: 900 },
  ], blocks: [{ id: 'pl', kind: 'pillar', name: '기둥 1', x: 3050, z: 150, w: 300, d: 300, h: 2300, full: true }], units: [] });
  await page.click('#tab-room');
  await page.click('#view-seg [data-view="top"]');
  await settle(page, 100);
  let from = await screenOf(page, 2600, 0, 2640);
  let to = await screenOf(page, 1000, 0, 2640);
  await drag(page, from, to, { steps: 14 });
  let d = await design(page);
  let dr = d.openings.find((o) => o.id === 'dr');
  check('문 끌기(평면): 벽을 따라 옮겨진다', dr.wall === 'S' && near(dr.offset, 600, 15) && dr.offset % 10 === 0, dr);
  check('문 끌기: 고른 상태가 되고 편집 칸이 뜬다', (await ui()).selItem === 'dr' && await page.isVisible('#wall-fields-opening') && (await page.inputValue('#wi-offset')) === String(dr.offset));
  // 벽 끝 가까이에서는 끝에 붙는다
  from = await screenOf(page, dr.offset + 400, 0, 2640);
  to = await screenOf(page, 430, 0, 2640);
  await drag(page, from, to, { steps: 12 });
  d = await design(page);
  dr = d.openings.find((o) => o.id === 'dr');
  check('문 끌기: 벽 끝에 붙는다', dr.wall === 'S' && dr.offset === 0, dr);
  // 모서리를 돌아 왼쪽 벽으로
  from = await screenOf(page, 400, 0, 2640);
  to = await screenOf(page, -40, 0, 1300);
  await drag(page, from, to, { steps: 16 });
  d = await design(page);
  dr = d.openings.find((o) => o.id === 'dr');
  check('문 끌기: 다른 벽으로 넘어간다', dr.wall === 'W' && near(dr.offset, 900, 30), dr);
  await shot('40-door-moved-top');
  // 창문과 겹치지 않는다: 위쪽 벽으로 끌어 창문 위에 놓으려 하면 옆에 선다
  from = await screenOf(page, -40, 0, dr.offset + 400);
  to = await screenOf(page, 1000, 0, -40);
  await drag(page, from, to, { steps: 16 });
  d = await design(page);
  dr = d.openings.find((o) => o.id === 'dr');
  const wn = d.openings.find((o) => o.id === 'wn');
  const apart = dr.wall !== 'N' || dr.offset + dr.width <= wn.offset || dr.offset >= wn.offset + wn.width;
  check('문 끌기: 창문과 겹치지 않는다', apart && (await codes()).indexOf('open-overlap') < 0, { dr, wn });
  await page.keyboard.press('Control+z');

  /* 숫자 칸과 벽 고르기 */
  await page.click('#wi-wall [data-wall="E"]');
  d = await design(page);
  dr = d.openings.find((o) => o.id === 'dr');
  check('문: 벽 고르기', dr.wall === 'E', dr);
  await page.fill('#wi-offset', '1500');
  await page.press('#wi-offset', 'Enter');
  await page.click('#wi-leaf [data-leaf="slide"]');
  await page.click('#wi-hinge [data-hinge="b"]');
  d = await design(page);
  dr = d.openings.find((o) => o.id === 'dr');
  check('문: 거리, 미닫이, 밀어 두는 쪽', dr.offset === 1500 && dr.leaf === 'slide' && dr.hinge === 'b' && await page.isHidden('#wi-swing-row') && (await page.textContent('#wi-hinge-label')) === '밀어 두는 쪽', dr);
  await page.click('#wi-leaf [data-leaf="swing"]');
  await page.click('#wi-swing [data-swing="in"]');
  let zone = await ev(() => { const P = __planner; return P.C.doorZones(P.design)[0].rect; });
  check('문: 방 안으로 열리면 문 폭만큼 비운다', near(zone.x1 - zone.x0, 800, 0.6), zone);

  /* 키보드 */
  await ev(() => __planner.selectItem('pl'));
  await page.focus('#gl');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Shift+ArrowDown');
  d = await design(page);
  let pl = d.blocks[0];
  check('방향키: 벽체를 10mm, Shift와 함께 100mm 옮긴다 (평면 보기 기준)', pl.x === 3040 && pl.z === 250, pl);
  await ev(() => __planner.selectItem('wn'));
  await page.keyboard.press('ArrowRight');
  d = await design(page);
  check('방향키: 창문은 벽을 따라 옮긴다', d.openings.find((o) => o.id === 'wn').offset === 410);
  await page.keyboard.press('ArrowUp');
  d = await design(page);
  check('방향키: 벽과 직각 방향은 그대로', d.openings.find((o) => o.id === 'wn').offset === 410);
  await page.keyboard.press('Delete');
  d = await design(page);
  check('Delete: 고른 창문 삭제', d.openings.length === 1 && (await ui()).selItem === null);
  await page.keyboard.press('Control+z');
  d = await design(page);
  check('Ctrl+Z: 창문 되살리기', d.openings.length === 2);

  /* 벽체를 바닥에서 끈다 */
  from = await screenOf(page, pl.x, 0, pl.z);
  to = await screenOf(page, 1600, 0, 1400);
  await drag(page, from, to, { steps: 14 });
  d = await design(page);
  pl = d.blocks[0];
  check('벽체 끌기(평면)', near(pl.x, 1600, 12) && near(pl.z, 1400, 12), pl);
  // 벽 가까이에서는 벽에 붙는다
  from = await screenOf(page, pl.x, 0, pl.z);
  to = await screenOf(page, 190, 0, 1900);
  await drag(page, from, to, { steps: 14 });
  d = await design(page);
  pl = d.blocks[0];
  check('벽체 끌기: 벽에 붙는다', pl.x === 150, pl);

  /* 3D 보기에서 창문을 벽면을 따라 끈다 */
  await page.click('#view-seg [data-view="3d"]');
  await settle(page, 100);
  d = await design(page);
  let w0 = d.openings.find((o) => o.id === 'wn');
  from = await screenOf(page, w0.offset + 600, 1500, 0);
  to = await screenOf(page, w0.offset + 600 + 900, 1500, 0);
  await drag(page, from, to, { steps: 14 });
  d = await design(page);
  let w1 = d.openings.find((o) => o.id === 'wn');
  check('창문 끌기(3D): 벽면을 따라 옮겨진다', w1.wall === 'N' && near(w1.offset, w0.offset + 900, 20), w1);
  // 모서리를 돌아 왼쪽 벽면으로
  from = await screenOf(page, w1.offset + 600, 1500, 0);
  to = await screenOf(page, 0, 1500, 1300);
  await drag(page, from, to, { steps: 18 });
  d = await design(page);
  w1 = d.openings.find((o) => o.id === 'wn');
  // 왼쪽 벽 아래쪽에는 기둥이 붙어 있어, 창문은 기둥에 닿기 전까지만 내려간다
  check('창문 끌기(3D): 옆 벽면으로 넘어가고 기둥과 겹치지 않는다', w1.wall === 'W' && w1.offset === 550 && (await codes()).indexOf('open-block') < 0, w1);
  await shot('41-window-moved-3d');
  // 3D에서 벽체를 끈다
  from = await screenOf(page, pl.x, 1200, pl.z + 150);
  to = await screenOf(page, 2000, 1200, 1500);
  await drag(page, from, to, { steps: 14 });
  d = await design(page);
  check('벽체 끌기(3D)', d.blocks[0].x > 1500 && d.blocks[0].z > 900 && (await bad()).length === 0, d.blocks[0]);
  // 배치 단계에서는 문·창문이 끌리지 않고, 누르면 방 단계로 간다
  await page.click('#tab-layout');
  const wpos = await screenOf(page, 0, 1500, w1.offset + 600);
  await page.mouse.click(wpos.x, wpos.y);
  await settle(page);
  check('배치 단계에서 창문을 누르면 방 단계로 가서 고른다', (await ui()).tab === 'room' && (await ui()).selItem === 'wn', await ui());

  /* 평면 보기에서 벽을 끌어 방 크기를 바꾼다 */
  await load({ v: 2, room: { w: 2400, d: 1800, h: 2300 }, openings: [{ id: 'dr', type: 'door', wall: 'S', offset: 1500, width: 800, height: 2100, leaf: 'swing', swing: 'out', hinge: 'a' }], blocks: [],
    units: [unit('a', 400), unit('b', 1200), unit('c', 2000)] });
  await page.click('#tab-room');
  await page.click('#view-seg [data-view="top"]');
  await settle(page, 100);
  check('벽 찾기: 평면 보기의 방 단계에서만 벽이 집힌다', await ev(() => { const P = __planner; const r = document.getElementById('gl').getBoundingClientRect(); const v = new THREE.Vector3(2440, 0, 900).project(P.Rig.camera()); return P.wallAt(r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height); }) === 'E');
  from = await screenOf(page, 2440, 0, 900);
  to = await screenOf(page, 2940, 0, 900);
  await drag(page, from, to, { steps: 12 });
  d = await design(page);
  check('오른쪽 벽 끌기: 가로가 늘어난다', near(d.room.w, 2900, 10) && d.units[0].x === 400 && d.openings[0].offset === 1500, d.room);
  check('오른쪽 벽 끌기: 숫자 칸에 반영', (await page.inputValue('#room-w')) === String(d.room.w));
  // 안쪽으로 끌면 가구에 닿아 멈춘다
  from = await screenOf(page, d.room.w + 40, 0, 900);
  to = await screenOf(page, 1500, 0, 900);
  await drag(page, from, to, { steps: 12 });
  d = await design(page);
  check('오른쪽 벽 끌기: 가구에 닿으면 멈춘다', d.room.w === 2400 && (await bad()).length === 0, d.room);
  // 왼쪽 벽: 바깥으로 500. 안의 것들은 화면에서 제자리에 있다.
  const before = await screenOf(page, d.units[0].x, 0, d.units[0].z);
  from = await screenOf(page, -40, 0, 900);
  to = await screenOf(page, -340, 0, 900);
  let after = null;
  let mid = null;
  await drag(page, from, to, { steps: 12, hold: async () => {
    // 끄는 동안: 좌표는 밀렸지만 화면에서는 그 자리
    mid = await design(page);
    after = await screenOf(page, mid.units[0].x, 0, mid.units[0].z);
  } });
  d = await design(page);
  check('왼쪽 벽 끌기: 가로가 늘고 좌표가 함께 밀린다', near(d.room.w, 2700, 10) && near(d.units[0].x, 400 + (d.room.w - 2400), 0.6) && d.openings[0].offset === 1500 + (d.room.w - 2400), { room: d.room, x: d.units[0].x, door: d.openings[0].offset });
  check('왼쪽 벽 끌기: 끄는 동안 가구는 화면에서 제자리', mid.units[0].x > 600 && near(before.x, after.x, 1.5) && near(before.y, after.y, 1.5), { before, after });
  check('벽 끌기 뒤: 방 전체가 평면 보기에 들어온다', await ev(() => __planner.Rig.topFits()));
  await shot('42-wall-drag-top');
  // 위쪽 벽은 가구가 붙어 있어 안으로 들어오지 않는다
  from = await screenOf(page, 1200, 0, -40);
  to = await screenOf(page, 1200, 0, 500);
  await drag(page, from, to, { steps: 10 });
  d = await design(page);
  check('위쪽 벽 끌기: 가구가 붙어 있으면 그대로', d.room.d === 1800 && d.units[0].z === 290, d.room);
  // 아래쪽 벽: 바깥으로
  from = await screenOf(page, 600, 0, 1840);
  to = await screenOf(page, 600, 0, 2340);
  await drag(page, from, to, { steps: 10 });
  d = await design(page);
  check('아래쪽 벽 끌기: 세로가 늘고 문은 벽을 따라간다', near(d.room.d, 2300, 10) && d.openings[0].wall === 'S', d.room);
  await page.click('#btn-undo');
  d = await design(page);
  check('벽 끌기 되돌리기', d.room.d === 1800);
  // 3D 보기에서는 벽이 집히지 않는다
  await page.click('#view-seg [data-view="3d"]');
  check('3D 보기에서는 벽이 끌리지 않는다', await ev(() => __planner.wallAt(400, 400)) === null);
  // 3D로 돌아오면 바뀐 방에 맞춰 화면을 다시 맞춘다
  const fit = await ev(() => { const P = __planner; const cam = P.Rig.camera(); const pts = [[0, 0, 0], [P.design.room.w, 0, 0], [0, 0, P.design.room.d], [P.design.room.w, 0, P.design.room.d]]; return pts.every((p) => { const v = new THREE.Vector3(p[0], p[1], p[2]).project(cam); return Math.abs(v.x) < 1 && Math.abs(v.y) < 1; }); });
  check('3D 보기: 방 전체가 화면에 들어온다', fit);

  /* 예시 배치인 채로 벽을 바꾸면 예시가 다시 짜인다 */
  await ev(() => { localStorage.clear(); });
  await page.reload();
  await page.waitForFunction(() => !!window.__planner);
  await settle(page, 200);
  await page.click('#wall-add [data-add="window"]');
  d = await design(page);
  check('예시 + 창문: 예시 유닛이 창문을 피해 다시 놓인다', (await ui()).sample === true && d.units.length >= 2 && (await codes()).length === 0, { units: d.units.map((u) => [u.x, u.z, u.rot]), codes: await codes() });
  await page.click('#wall-add [data-add="pillar"]');
  await page.click('#wall-add [data-add="partition"]');
  await page.click('#wall-add [data-add="notch"]');
  d = await design(page);
  check('예시 + 벽체: 확인할 점 없이 다시 놓인다', (await ui()).sample === true && d.blocks.length === 3 && (await codes()).length === 0, { codes: await codes(), blocks: d.blocks.map((k) => [k.kind, k.x, k.z]), units: d.units.map((u) => [u.x, u.z, u.rot, u.w]) });
  await shot('43-sample-walls');
  await page.click('#view-seg [data-view="top"]');
  await settle(page, 100);
  from = await screenOf(page, 2440, 0, 1000);
  to = await screenOf(page, 3240, 0, 1000);
  await drag(page, from, to, { steps: 10 });
  d = await design(page);
  check('예시 + 벽 끌기: 예시인 채로 방이 커진다', (await ui()).sample === true && near(d.room.w, 3200, 10) && (await bad()).length === 0, { room: d.room, bad: await bad() });
  await shot('44-sample-wall-drag');
  await page.click('#btn-start-empty');
  d = await design(page);
  check('빈 방에서 시작: 방과 벽은 그대로, 유닛만 비운다', d.units.length === 0 && d.blocks.length === 3 && d.openings.length === 2 && near(d.room.w, 3200, 10) && (await ui()).sample === false, d);

  check('오류 없음', t.errors.length === 0 && t.blocked.length === 0, { errors: t.errors, blocked: t.blocked });
  await t.close();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
