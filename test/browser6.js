// 브라우저 점검 6: 코너장 내부 부품 끌기, 확인할 점에서 벽 요소로 가기, 코너장을 다른 모서리로
const { open, settle, screenOf, drag, design } = require('./harness');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info))); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

(async () => {
  const t = await open({ width: 1280, height: 800 });
  const page = t.page;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const uiNow = () => ev(() => JSON.parse(JSON.stringify(__planner.ui)));
  await ev(() => {
    __planner.Act.load({ v: 2, room: { w: 3200, d: 2600, h: 2300 }, openings: [
      { id: 'dr', type: 'door', wall: 'S', offset: 1200, width: 800, height: 2100, leaf: 'swing', swing: 'out', hinge: 'a' },
      { id: 'wn', type: 'window', wall: 'E', offset: 1400, width: 1000, height: 1200, sill: 900 }],
      blocks: [{ id: 'pl', kind: 'pillar', name: '기둥 1', x: 3050, z: 1900, w: 300, d: 300, h: 2300, full: true }],
      units: [{ id: 'c', name: '코너장 1', kind: 'corner', x: 500, z: 500, rot: 0, w: 1000, h: 2100, w2: 1000, d: 580, style: 'panel', finish: 'white', door: 'hinge', doorFinish: 'white', hinge: 'left', parts: [{ id: 's1', type: 'shelf', y: 1784 }, { id: 'r1', type: 'rod', y: 1688 }] }] });
    document.querySelector('#toast').hidden = true;
  });

  /* 코너장 내부: 3D에서 선반을 위로 끈다 (문짝은 반투명이 되어 가리지 않는다) */
  await ev(() => __planner.select('c', null));
  await page.click('#tab-interior');
  await settle(page, 200);
  // 날개 A의 선반 앞 모서리
  let from = await screenOf(page, 800, 1784 + 9, 560);
  let to = await screenOf(page, 800, 1784 + 9 + 150, 560);
  await drag(page, from, to, { steps: 10 });
  let d = await design(page);
  let shelf = d.units[0].parts.find((p) => p.id === 's1');
  check('코너장 내부(3D): 선반을 끌어 올린다', shelf.y > 1784 + 100 && (await uiNow()).selPart === 's1', shelf);
  // 정면 보기(왼쪽 벽 쪽 날개)에서 봉을 끌어 내린다
  await page.click('#view-seg [data-view="front"]');
  await page.click('#front-turn [data-turn="-1"]');
  await settle(page, 200);
  check('코너장: 왼쪽 벽을 보는 정면 보기에서도 고른 채로 남는다', (await uiNow()).frontRot === 90 && (await uiNow()).selUnit === 'c', await uiNow());
  from = await screenOf(page, 580, 1688 + 16, 800);
  to = await screenOf(page, 580, 1688 + 16 - 400, 800);
  await drag(page, from, to, { steps: 10 });
  d = await design(page);
  const rod = d.units[0].parts.find((p) => p.id === 'r1');
  check('코너장 내부(정면, 옆 날개): 봉을 끌어 내린다', rod.y < 1688 - 250 && (rod.y - 24) % 32 === 0, rod);
  await page.screenshot({ path: 'shots/95-corner-front-side.png' });
  await page.click('#view-seg [data-view="3d"]');

  /* 코너장을 오른쪽 위 모서리로 */
  await page.click('#tab-layout');
  await settle(page, 200);
  from = await screenOf(page, 800, 1000, 590);
  to = await screenOf(page, 3000, 1000, 600);      // 잡은 높이의 면에서 오른쪽 위 모서리 쪽으로
  await drag(page, from, to, { steps: 16 });
  d = await design(page);
  const box = await ev(() => { const P = __planner; return P.C.box(P.design.units[0]); });
  check('코너장 끌기: 오른쪽 위 모서리에 맞게 돈다', d.units[0].rot === 270 && near(box.x1, 3200, 0.6) && near(box.z0, 0, 0.6), { u: d.units[0], box });
  let codes = await ev(() => __planner.C.checkDesign(__planner.design).map((i) => i.code));
  check('코너장이 창문에서 떨어져 있으면 창문 경고가 없다', codes.indexOf('window') < 0, codes);
  const hit = await ev(() => { const P = __planner; const o = P.design.openings.find((k) => k.id === 'wn'); o.offset = 200; return P.C.checkDesign(P.design).filter((i) => i.code === 'window').map((i) => ({ text: i.text, unitId: i.unitId, itemId: i.itemId })); });
  check('코너장이 창문 앞을 가리면 알려 준다', hit.length === 1 && hit[0].unitId === 'c' && hit[0].itemId === 'wn' && /앞을 가립니다/.test(hit[0].text), hit);

  /* 확인할 점에서 벽 요소로 간다 */
  await ev(() => { const P = __planner; P.design.blocks[0].z = 1900; P.design.blocks[0].x = 3050; });
  await ev(() => { const P = __planner; const o = P.design.openings.find((k) => k.id === 'wn'); o.offset = 1400; P.setTab('room'); P.selectItem('pl'); });
  await page.fill('#wb-top', '1500');      // 기둥을 창문 앞으로
  await page.press('#wb-top', 'Enter');
  codes = await ev(() => __planner.C.checkDesign(__planner.design).map((i) => i.code));
  check('기둥이 창문을 막으면 확인할 점에 뜬다', codes.indexOf('open-block') >= 0, codes);
  await page.click('#tab-list');
  const btn = page.locator('#issues button', { hasText: '막혀 있습니다' }).first();
  await btn.click();
  const u2 = await uiNow();
  check('확인할 점을 누르면 방 단계에서 그 창문을 고른다', u2.tab === 'room' && u2.selItem === 'wn' && await page.isVisible('#wall-fields-opening'), u2);
  check('벽 목록에 표시가 붙는다', (await page.locator('#wall-list .flag').count()) >= 1);

  check('오류 없음', t.errors.length === 0 && t.blocked.length === 0, t.errors);
  await t.close();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
