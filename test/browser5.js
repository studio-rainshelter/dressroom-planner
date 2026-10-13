// 브라우저 점검 5: 정면 보기, 손가락 조작, 방 크기 입력, 이미지 저장
const { open, settle, screenOf, drag, design } = require('./harness');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info))); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const unit = (id, x, extra) => Object.assign({ id, name: id, kind: 'std', x, z: 290, rot: 0, w: 800, h: 2100, d: 580, style: 'panel', finish: 'white', door: 'none', parts: [{ id: id + 'p', type: 'rod', y: 1688 }] }, extra);
const base = (units, extra) => Object.assign({ v: 2, room: { w: 3200, d: 2600, h: 2300 }, openings: [
  { id: 'dr', type: 'door', wall: 'S', offset: 2200, width: 800, height: 2100, leaf: 'swing', swing: 'out', hinge: 'a' },
  { id: 'wn', type: 'window', wall: 'N', offset: 1800, width: 1000, height: 1200, sill: 900 }], blocks: [], units }, extra);

// 손가락으로 끌기 (CDP 터치 이벤트)
async function touchDrag(page, from, to, steps) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(from) });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt({ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }) });
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await settle(page);
  await cdp.detach();
}

(async () => {
  let t = await open({ width: 1280, height: 800 });
  let page = t.page;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const load = (raw) => ev((r) => { __planner.Act.load(r); document.querySelector('#toast').hidden = true; }, raw);
  const uiNow = () => ev(() => JSON.parse(JSON.stringify(__planner.ui)));

  /* 정면 보기 */
  await load(base([unit('a', 400), { id: 'c', name: '코너장', kind: 'corner', x: 2700, z: 500, rot: 270, w: 1000, h: 2100, w2: 1000, d: 580, style: 'panel', finish: 'oak', door: 'none', parts: [] }]));
  await page.click('#tab-room');
  await ev(() => __planner.selectItem('dr'));
  await page.click('#view-seg [data-view="front"]');
  await settle(page, 200);
  check('정면 보기: 고른 문이 있는 벽을 본다', (await uiNow()).frontRot === 180 && (await page.textContent('#front-wall-name')) === '아래쪽 벽', await uiNow());
  await page.screenshot({ path: 'shots/90-front-door-wall.png' });
  // 위쪽 벽을 보고 창문을 벽을 따라 끈다
  await page.click('#front-turn [data-turn="1"]');
  await page.click('#front-turn [data-turn="1"]');
  await settle(page, 200);
  check('정면 보기: 벽 돌려 보기', (await uiNow()).frontRot === 0);
  let from = await screenOf(page, 2000, 1500, 0);     // 코너장에 가려지지 않은 쪽
  let to = await screenOf(page, 1200, 1500, 0);
  await drag(page, from, to, { steps: 12 });
  let d = await design(page);
  let wn = d.openings.find((o) => o.id === 'wn');
  check('정면 보기: 창문을 벽을 따라 끈다', wn.wall === 'N' && near(wn.offset, 1000, 20), wn);
  check('정면 보기: 코너장은 두 벽에서 모두 보인다', await ev(() => { const P = __planner; const c = P.design.units.find((u) => u.id === 'c'); return P.C.facesWall(c, 0) && P.C.facesWall(c, 270) && !P.C.facesWall(c, 90); }));
  await page.screenshot({ path: 'shots/91-front-window.png' });
  await page.click('#view-seg [data-view="3d"]');

  /* 방 크기 입력: 중간 값을 거쳐도 가구가 밀려난 채로 남지 않는다 */
  await load(base([unit('a', 400), unit('b', 2800)]));
  await page.click('#tab-room');
  await page.click('#room-w');
  await page.fill('#room-w', '2000');       // 오른쪽 유닛이 방 밖이 되는 중간 값
  let mid = await design(page);
  await page.fill('#room-w', '3000');
  await page.press('#room-w', 'Enter');
  d = await design(page);
  check('방 가로 입력: 중간 값에서는 가구가 안으로 밀린다', mid.room.w === 2000 && mid.units[1].x === 1600 && mid.openings[0].offset === 1200, { u: mid.units[1].x, door: mid.openings[0].offset });
  check('방 가로 입력: 마지막 값에서는 처음 배치 기준으로 계산한다', d.room.w === 3000 && d.units[1].x === 2600 && d.openings[0].offset === 2200 && d.openings[1].offset === 1800, { u: d.units[1].x, o: d.openings.map((o) => o.offset) });
  // −/+ 버튼
  await page.click('[data-for="room-d"][data-dir="1"]');
  d = await design(page);
  check('방 세로 + 버튼', d.room.d === 2610 && d.units[0].x === 400);
  await page.click('#btn-undo');
  await page.click('#btn-undo');
  d = await design(page);
  check('방 크기 되돌리기', d.room.w === 3200 && d.room.d === 2600 && d.units[1].x === 2800, d.room);
  // 다른 편집 뒤에 − 버튼을 눌러도 예전 배치로 돌아가지 않는다
  await page.click('#room-h');
  await page.click('#tab-layout');
  await ev(() => { const P = __planner; P.select('a', null); });
  await page.fill('#unit-left', '500');
  await page.press('#unit-left', 'Enter');
  await page.click('#tab-room');
  await page.click('[data-for="room-h"][data-dir="-1"]');
  d = await design(page);
  check('방 높이 − 버튼: 그사이의 편집을 지우지 않는다', d.room.h === 2290 && d.units[0].x === 900, { h: d.room.h, x: d.units[0].x });

  /* 이미지 저장: 거울이 비친 모습으로 */
  check('오류 없음', t.errors.length === 0 && t.blocked.length === 0, t.errors);
  await t.close();

  /* 손가락 조작 */
  t = await open({ width: 390, height: 844, coarse: true, dpr: 2 });
  page = t.page;
  await page.evaluate((r) => { __planner.Act.load(r); document.querySelector('#toast').hidden = true; }, base([unit('a', 400)], { room: { w: 2400, d: 1800, h: 2300 }, openings: [{ id: 'dr', type: 'door', wall: 'S', offset: 1500, width: 800, height: 2100, leaf: 'swing', swing: 'out', hinge: 'a' }] }));
  await page.tap('#tab-layout');
  await settle(page, 200);
  from = await screenOf(page, 400, 1100, 580);
  to = await screenOf(page, 1500, 600, 700);
  await touchDrag(page, from, to, 10);
  d = await design(page);
  check('손가락: 유닛 끌기', d.units[0].x > 1000, d.units[0]);
  await page.tap('#tab-room');
  await page.tap('#view-seg [data-view="top"]');
  await settle(page, 200);
  from = await screenOf(page, 2440, 0, 900);
  to = await screenOf(page, 2740, 0, 900);
  await touchDrag(page, from, to, 10);
  d = await design(page);
  check('손가락: 평면 보기에서 벽 끌기', near(d.room.w, 2700, 20), d.room);
  from = await screenOf(page, 1900, 0, 1840);
  to = await screenOf(page, 900, 0, 1840);
  await touchDrag(page, from, to, 10);
  d = await design(page);
  check('손가락: 문 끌기', near(d.openings[0].offset, 500, 30), d.openings[0]);
  await page.screenshot({ path: 'shots/92-phone-top.png' });
  check('오류 없음 (손가락)', t.errors.length === 0, t.errors);
  await t.close();

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
