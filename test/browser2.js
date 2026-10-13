// 브라우저 점검 2: 코너장, 거울장, 문짝, 벽 설계
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
  const byName = (d, name) => d.units.find((u) => u.name === name);

  // 넓은 빈 방 (이전 형식으로 불러와도 된다)
  await ev(() => __planner.Act.load({ room: { w: 3200, d: 2600, h: 2300 }, door: { show: true, wall: 'S', offset: 2200, width: 800 }, units: [] }));
  let d = await design(page);
  check('이전 형식 불러오기: 문이 벽 요소로 바뀐다', d.v === 2 && d.openings.length === 1 && d.openings[0].wall === 'S' && d.openings[0].offset === 2200 && d.openings[0].leaf === 'swing', d.openings);

  /* 코너장 */
  await page.click('#tab-layout');
  await page.click('#btn-add-corner');
  d = await design(page);
  let c = d.units[0];
  check('코너장 추가: 왼쪽 위 모서리에 놓인다', c.kind === 'corner' && c.x === 500 && c.z === 500 && c.rot === 0 && c.parts.length > 0, c);
  check('코너장: 옆 길이 칸이 보이고 빈 폭 채우기는 숨는다', await page.isVisible('#unit-w2-row') && await page.isHidden('#btn-fit-width'));
  check('코너장: 형태는 판넬형과 스피드랙 가운데 고른다', await page.isVisible('#unit-style [data-style="panel"]') && await page.isVisible('#unit-style [data-style="rack"]') && await page.isHidden('#unit-style [data-style="pole"]') && (await page.getAttribute('#unit-style [data-style="panel"]', 'aria-pressed')) === 'true');
  check('코너장: 미닫이 선택지는 숨는다', await page.isHidden('#unit-door [data-door="slide"]') && await page.isVisible('#unit-door [data-door="hinge"]'));
  // 오른쪽 아래 모서리로 끈다
  let from = await screenOf(page, 800, 1200, 580);
  let to = await screenOf(page, 2650, 0, 2050);
  await drag(page, from, to, { steps: 18 });
  d = await design(page);
  c = d.units[0];
  let box = await ev((id) => { const P = __planner; return P.C.box(P.design.units.find((u) => u.id === id)); }, c.id);
  check('코너장 끌기: 오른쪽 아래 모서리에 맞게 돌아 두 벽에 붙는다', c.rot === 180 && near(box.x1, 3200, 0.6) && near(box.z1, 2600, 0.6), { c, box });
  check('코너장 끌기: 모서리 경고 없음', (await codes()).indexOf('corner') < 0 && (await bad()).length === 0, await codes());
  await page.click('#btn-undo');
  // 크기: 옆 길이를 줄이면 모서리는 제자리
  await ev(() => { const P = __planner; P.select(P.design.units[0].id, null); });
  await page.fill('#unit-w2', '800');
  await page.press('#unit-w2', 'Enter');
  d = await design(page);
  c = d.units[0];
  box = await ev(() => { const P = __planner; return P.C.box(P.design.units[0]); });
  check('코너장 옆 길이: 모서리 고정', c.w2 === 800 && box.x0 === 0 && box.z0 === 0 && box.z1 === 800, { c, box });
  // 코너장 내부: 서랍은 넣을 수 없다
  await page.click('#btn-open-interior');
  check('코너장 내부: 서랍 버튼과 서랍 구성은 숨는다', await page.isHidden('#int-add [data-add="drawer"]') && await page.isHidden('#int-add [data-preset="drawers"]') && await page.isVisible('#int-add [data-add="rod"]'));
  await page.click('#int-add [data-preset="double"]');
  d = await design(page);
  check('코너장 내부: 2단 행거 구성', d.units[0].parts.filter((p) => p.type === 'rod').length === 2, d.units[0].parts);
  await page.click('#tab-layout');

  /* 일반 유닛 둘과 거울장 */
  await ev(() => { const P = __planner; P.select(P.design.units[0].id, null); });
  await page.click('#btn-add-unit');
  await page.click('#btn-add-unit');
  await page.click('#btn-add-mirror');
  d = await design(page);
  const a = byName(d, '유닛 1');
  const b = byName(d, '유닛 2');
  let mir = byName(d, '거울장 1');
  check('유닛 추가: 코너장 날개 끝에서 이어진다', a && b && a.rot === 0 && near(a.x - a.w / 2, 1000, 0.6) && near(b.x - b.w / 2, a.x + a.w / 2, 0.6), { a, b });
  check('거울장 추가: 거울 여닫이문, 선반 구성', mir && mir.kind === 'mirror' && mir.door === 'hinge' && mir.doorFinish === 'mirror' && mir.w === 500 && mir.parts.length > 2, mir);
  check('거울장: 문 종류 칸은 숨고 경첩 위치는 보인다', await page.isHidden('#unit-door-row') && await page.isHidden('#unit-door-finish-row') && await page.isVisible('#unit-hinge-row'));
  let mc = await ev(() => __planner.Scene.mirrorCount());
  check('거울장: 3D 보기에서 실제 반사 면이 만들어진다', mc.all === 1 && mc.live === 1, mc);
  await page.click('#unit-hinge [data-hinge="right"]');
  d = await design(page);
  check('거울장: 경첩 위치 바꾸기', byName(d, '거울장 1').hinge === 'right');
  await page.fill('#unit-w', '700');
  await page.press('#unit-w', 'Enter');
  mc = await ev(() => __planner.Scene.mirrorCount());
  check('거울장: 폭 700이면 두 짝이 되고 경첩 칸은 숨는다', await page.isHidden('#unit-hinge-row') && mc.all === 2, mc);
  check('거울장: 문짝 안내', /거울 문 2짝/.test(await page.textContent('#unit-door-info')), await page.textContent('#unit-door-info'));
  await page.fill('#unit-w', '500');
  await page.press('#unit-w', 'Enter');
  check('문짝 표시 버튼이 나타난다', await page.isVisible('#btn-doors'));
  await shot('30-mirror-3d');

  /* 여닫이문 */
  await ev((id) => __planner.select(id, null), a.id);
  await page.click('#unit-door [data-door="hinge"]');
  d = await design(page);
  check('여닫이문: 설정', byName(d, '유닛 1').door === 'hinge' && byName(d, '유닛 1').doorFinish === 'white');
  check('여닫이문: 두 짝 안내, 경첩 칸 숨김', /여닫이문 2짝 · 한 짝 397mm · 열 때 앞으로 397mm/.test(await page.textContent('#unit-door-info')) && await page.isHidden('#unit-hinge-row'), await page.textContent('#unit-door-info'));
  await page.click('#unit-finish [data-finish="oak"]');
  d = await design(page);
  check('여닫이문: 몸통 색을 바꾸면 문 색도 따라간다', byName(d, '유닛 1').finish === 'oak' && byName(d, '유닛 1').doorFinish === 'oak');
  await page.click('#unit-door-finish [data-finish="black"]');
  await page.click('#unit-finish [data-finish="white"]');
  d = await design(page);
  check('여닫이문: 따로 고른 문 색은 그대로', byName(d, '유닛 1').finish === 'white' && byName(d, '유닛 1').doorFinish === 'black');

  /* 미닫이문: 맞닿은 두 유닛이 한 줄 */
  await page.click('#unit-door [data-door="slide"]');
  let info = await page.textContent('#unit-door-info');
  check('미닫이문: 유닛 하나 안내', /미닫이문 2짝 · 한 짝 415mm/.test(info), info);
  await page.click('#unit-door-finish [data-finish="oak"]');
  await ev((id) => __planner.select(id, null), b.id);
  await page.click('#unit-door [data-door="slide"]');
  d = await design(page);
  info = await page.textContent('#unit-door-info');
  check('미닫이문: 옆 유닛과 한 줄로 묶이고 줄의 문 색을 따른다', byName(d, '유닛 2').door === 'slide' && byName(d, '유닛 2').doorFinish === 'oak' && /미닫이문 2짝 · 한 짝 815mm · 맞닿은 유닛 2개/.test(info), info);
  await page.click('#unit-door-finish [data-finish="mirror"]');
  d = await design(page);
  check('미닫이문: 문 색은 줄 전체에 적용된다', byName(d, '유닛 1').doorFinish === 'mirror' && byName(d, '유닛 2').doorFinish === 'mirror');
  mc = await ev(() => __planner.Scene.mirrorCount());
  check('미닫이문(거울): 줄 전체가 거울 한 면', mc.all === 2 && mc.live === 2, mc);
  let sum = await ev(() => __planner.C.summary(__planner.design));
  check('요약: 문짝 수 (미닫이 2 + 거울장 1)', sum.doors === 3, sum);
  check('확인할 점: 문제 없음', (await bad()).length === 0, await codes());
  await ev(() => __planner.select(null, null));
  await shot('31-doors-3d');
  // 끄는 동안 미닫이문 줄이 따라 바뀐다
  from = await screenOf(page, b.x, 1000, b.z + b.d / 2 + 70);
  to = await screenOf(page, b.x + 150, 600, 1500);
  await drag(page, from, to, { steps: 12 });
  let runs = await ev(() => __planner.C.slideRuns(__planner.design).map((r) => r.ids.length));
  check('미닫이문: 유닛을 떼면 줄이 나뉜다', runs.length === 2 && runs[0] === 1 && runs[1] === 1, runs);
  mc = await ev(() => __planner.Scene.mirrorCount());
  check('미닫이문: 끌기를 마치면 반사 면이 다시 만들어진다', mc.live === mc.all && mc.all === 3, mc);
  await page.click('#btn-undo');
  runs = await ev(() => __planner.C.slideRuns(__planner.design).map((r) => r.ids.length));
  check('미닫이문: 되돌리면 다시 한 줄', runs.length === 1 && runs[0] === 2, runs);

  /* 문짝 표시 끄기, 평면·정면 보기 */
  await page.click('#btn-doors');
  check('문짝 표시 끄기', (await ui()).doors === false && (await page.getAttribute('#btn-doors', 'aria-pressed')) === 'false');
  mc = await ev(() => __planner.Scene.mirrorCount());
  check('문짝 표시 끔: 거울 면을 만들지 않는다', mc.all === 0, mc);
  await page.click('#btn-doors');
  await page.click('#view-seg [data-view="top"]');
  await shot('32-doors-top');
  await page.click('#view-seg [data-view="front"]');
  await shot('33-doors-front');
  await page.click('#view-seg [data-view="3d"]');

  /* 목록 */
  await page.click('#tab-list');
  const bom = await page.textContent('#bom');
  check('부품 목록: 문짝과 레일', /미닫이문 \(거울\)/.test(bom) && /미닫이 레일/.test(bom) && /여닫이문 \(거울\)/.test(bom), bom.slice(0, 400));
  check('요약: 문짝 3짝', /문짝\s*3짝/.test((await page.textContent('#stats')).replace(/\n/g, '')));

  /* 벽 설계 */
  await page.click('#tab-room');
  await page.click('#wall-add [data-add="window"]');
  d = await design(page);
  let w = d.openings.find((o) => o.type === 'window');
  check('창문 추가: 유닛이 가리지 않는 벽에 놓인다', w && (await codes()).indexOf('window') < 0 && (await ui()).selItem === w.id, w);
  check('창문 편집 칸: 바닥에서 높이는 보이고 문짝 칸은 숨는다', await page.isVisible('#wi-sill-row') && await page.isHidden('#wi-leaf-row') && await page.isHidden('#wall-fields-block'));
  await page.fill('#wi-width', '900');
  await page.press('#wi-width', 'Enter');
  await page.fill('#wi-sill', '1000');
  await page.press('#wi-sill', 'Enter');
  d = await design(page);
  w = d.openings.find((o) => o.type === 'window');
  check('창문: 폭과 바닥에서 높이 입력', w.width === 900 && w.sill === 1000, w);
  await page.click('#wall-add [data-add="pillar"]');
  await page.click('#wall-add [data-add="partition"]');
  await page.click('#wall-add [data-add="notch"]');
  d = await design(page);
  check('기둥·가벽·꺾인 벽 추가', d.blocks.length === 3 && d.blocks.map((k) => k.kind).join() === 'pillar,partition,notch', d.blocks);
  check('벽체 추가: 유닛이나 문·창문과 부딪히지 않는다', (await bad()).length === 0 && (await codes()).filter((k) => k === 'open-block' || k === 'door').length === 0, await codes());
  check('벽체 편집 칸', await page.isVisible('#wall-fields-block') && await page.isHidden('#wall-fields-opening') && (await page.textContent('#wall-editor-title')) === '꺾인 벽 1');
  check('벽 목록: 다섯 줄', (await page.locator('#wall-list .unit-row').count()) === 5);
  await shot('34-walls-3d');
  // 꺾인 벽 크기
  const notch = d.blocks[2];
  await page.fill('#wb-w', '1200');
  await page.press('#wb-w', 'Enter');
  d = await design(page);
  let nb = await ev((id) => { const P = __planner; return P.C.box(P.design.blocks.find((k) => k.id === id)); }, notch.id);
  const nb0 = { x0: notch.x - notch.w / 2, z1: notch.z + notch.d / 2 };
  check('벽체 가로: 한쪽은 제자리에 두고 빈 쪽으로 늘어난다', d.blocks[2].w === 1200 && near(nb.x0, nb0.x0, 0.6) && near(nb.z1, nb0.z1, 0.6) && (await bad()).length === 0, { nb, nb0, bad: await bad() });
  await page.click('#wb-full');
  d = await design(page);
  check('벽체: 천장까지 채우기를 끄면 높이 칸이 나온다', d.blocks[2].full === false && d.blocks[2].h === 1200 && await page.isVisible('#wb-h-row'), d.blocks[2]);
  await page.click('#wb-full');
  // 삭제와 되돌리기
  await page.click('#btn-del-item');
  d = await design(page);
  check('벽체 삭제', d.blocks.length === 2 && (await ui()).selItem === null);
  await page.click('#toast button');
  d = await design(page);
  check('삭제 되돌리기', d.blocks.length === 3);
  // 벽 색
  await page.click('#wall-color [data-color="sage"]');
  d = await design(page);
  check('벽 색', d.room.wallColor === 'sage' && (await page.textContent('#wall-color-name')) === '세이지');
  await shot('35-walls-color');

  check('오류 없음', t.errors.length === 0 && t.blocked.length === 0, { errors: t.errors, blocked: t.blocked });
  await t.close();
  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
