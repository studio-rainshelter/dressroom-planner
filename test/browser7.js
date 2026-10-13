// 브라우저 점검 7: 스피드랙 형태, 코너장의 두 깊이
const { open, settle, screenOf, drag, design } = require('./harness');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info))); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

(async () => {
  let t = await open({ width: 1280, height: 800 });
  let page = t.page;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const uiNow = () => ev(() => JSON.parse(JSON.stringify(__planner.ui)));
  const codes = () => ev(() => __planner.C.checkDesign(__planner.design).map((i) => i.code));
  const hideToast = () => ev(() => { document.querySelector('#toast').hidden = true; });
  const visibleCount = (sel) => ev((s) => Array.from(document.querySelectorAll(s)).filter((el) => !el.hidden && el.offsetParent !== null).length, sel);

  /* 스피드랙으로 바꾸기 */
  await page.click('#tab-layout');
  let d = await design(page);
  const id = d.units[1].id;          // 예시의 가운데 유닛: 서랍 3단 + 선반 + 행거봉
  const before = d.units[1];
  await ev((i) => __planner.select(i, null), id);
  check('형태 칸에 스피드랙이 있다', await page.isVisible('#unit-style [data-style="rack"]') && (await page.textContent('#unit-style [data-style="rack"]')) === '스피드랙');
  await page.click('#unit-style [data-style="rack"]');
  d = await design(page);
  let u = d.units[1];
  check('스피드랙: 형태가 바뀌고 서랍을 포함한 부품은 그대로 남는다', u.style === 'rack' && u.door === 'none' && u.parts.some((p) => p.type === 'drawer') && JSON.stringify(u.parts.map((p) => [p.id, p.type, p.y]).sort()) === JSON.stringify(before.parts.map((p) => [p.id, p.type, p.y]).sort()), u.parts);
  check('스피드랙: 뺀 부품이 없으면 알림을 띄우지 않는다', await page.isHidden('#toast'));
  check('스피드랙: 형태 칸 표시, 문 칸 숨김', (await page.getAttribute('#unit-style [data-style="rack"]', 'aria-pressed')) === 'true' && await page.isHidden('#unit-door-row'));
  check('스피드랙: 색상은 네 가지 조합', (await visibleCount('#unit-finish button')) === 4 && await page.isHidden('#unit-finish [data-finish="gray"]') && (await page.textContent('#unit-finish-name')) === '백색 프레임 · 백색 합판', await page.textContent('#unit-finish-name'));
  check('스피드랙: 짜임 안내와 규격 안내', /기둥 4개/.test(await page.textContent('#unit-door-info')) && /선반, 행거봉, 서랍을 넣습니다/.test(await page.textContent('#unit-door-info')) && /가까운 규격은 800 × 2100 × 600mm/.test(await page.textContent('#unit-door-info')), await page.textContent('#unit-door-info'));
  check('스피드랙: 규격과 다른 크기를 확인할 점으로 알린다', (await codes()).indexOf('rack-size') >= 0 && await page.isVisible('#btn-fit-rack'), await codes());
  await page.click('#btn-undo');
  d = await design(page);
  check('되돌리기: 판넬형으로 돌아온다', d.units[1].style === 'panel' && JSON.stringify(d.units[1].parts) === JSON.stringify(before.parts), d.units[1]);
  await page.click('#unit-style [data-style="rack"]');
  await hideToast();
  await page.click('#btn-fit-rack');
  d = await design(page);
  u = d.units[1];
  check('규격에 맞추기: 깊이 600, 뒷면은 벽에 붙은 채', u.d === 600 && u.z === 300 && u.w === 800 && u.h === 2100 && (await codes()).indexOf('rack-size') < 0 && await page.isHidden('#btn-fit-rack'), [u.w, u.h, u.d, u.z]);
  await hideToast();
  await page.click('#unit-finish [data-finish="walnut"]');
  d = await design(page);
  check('스피드랙 색상: 검정 프레임 · 우드 합판', d.units[1].finish === 'walnut' && (await page.textContent('#unit-finish-name')) === '검정 프레임 · 우드 합판');
  await settle(page, 300);
  await page.screenshot({ path: 'shots/C1-rack.png' });

  /* 내부: 30mm 간격, 서랍 */
  await page.click('#btn-open-interior');
  check('스피드랙 내부: 서랍 버튼과 서랍 구성이 보인다', await page.isVisible('#int-add [data-add="drawer"]') && await page.isVisible('#int-add [data-preset="drawers"]') && await page.isVisible('#int-add [data-preset="mixed"]') && await page.isVisible('#int-add [data-add="shelf"]'));
  check('스피드랙 내부: 간격 안내는 30mm, 표시는 스피드랙', (await page.textContent('#pitch-mm')) === '30' && /스피드랙$/.test(await page.textContent('#int-unit-size')), await page.textContent('#int-unit-size'));
  await page.click('#int-add [data-preset="drawers"]');
  await hideToast();
  d = await design(page);
  u = d.units[1];
  check('스피드랙 내부: 서랍 + 행거 구성은 맨 아래 단 위의 서랍 3단과 봉 하나', u.parts.map((p) => p.type).join() === 'drawer,rod' && u.parts[0].y === 70 && u.parts[0].n === 3, u.parts);
  check('스피드랙 서랍: 800 × 600에는 맞는 서랍이 있어 알리지 않는다', (await codes()).indexOf('rack-drawer') < 0 && (await codes()).indexOf('parts') < 0, await codes());
  // 서랍을 눌러 고르고 단 높이를 바꾼다
  const drw = u.parts[0];
  await page.fill('#f-' + drw.id + '-eh', '200');
  await page.press('#f-' + drw.id + '-eh', 'Enter');
  d = await design(page);
  check('스피드랙 서랍: 단 높이를 바꾼다', d.units[1].parts.find((p) => p.id === drw.id).eh === 200, d.units[1].parts);
  await settle(page, 300);
  await page.screenshot({ path: 'shots/C1b-rack-drawers.png' });
  await page.click('#int-add [data-preset="shelves"]');
  await hideToast();
  d = await design(page);
  u = d.units[1];
  check('스피드랙 내부: 선반 구성은 30mm 간격에 놓인다', u.parts.length >= 3 && u.parts.every((p) => p.type === 'shelf' && (p.y - 10) % 30 === 0), u.parts.map((p) => p.y));
  // 숫자 칸의 + 버튼: 한 칸(30mm)
  const top = u.parts.slice().sort((a, b) => b.y - a.y)[0];
  const refBefore = +(await page.inputValue('#f-' + top.id + '-ref'));
  check('스피드랙 내부: 선반 윗면은 받침까지 40mm 위', refBefore === top.y + 40, [refBefore, top.y]);
  await page.click('#part-list li[data-part="' + top.id + '"] .step[data-dir="1"]');
  d = await design(page);
  let moved = d.units[1].parts.find((p) => p.id === top.id);
  check('스피드랙 내부: + 버튼은 30mm씩', moved.y === top.y + 30, [top.y, moved.y]);
  // 정면 보기에서 끌어도 30mm 간격
  await page.click('#view-seg [data-view="front"]');
  await settle(page, 200);
  const low = d.units[1].parts.slice().sort((a, b) => a.y - b.y)[0];
  let from = await screenOf(page, u.x, low.y + 20, u.z + u.d / 2);
  let to = await screenOf(page, u.x, low.y + 20 + 77, u.z + u.d / 2);
  await drag(page, from, to, { steps: 10 });
  d = await design(page);
  moved = d.units[1].parts.find((p) => p.id === low.id);
  check('스피드랙 내부: 끌면 30mm 간격에 맞는다', moved.y > low.y && (moved.y - 10) % 30 === 0, [low.y, moved.y]);
  await page.click('#int-add [data-preset="double"]');
  await hideToast();
  d = await design(page);
  check('스피드랙 내부: 2단 행거 구성 (봉 2개, 서랍·선반 없이)', d.units[1].parts.map((p) => p.type).join() === 'rod,rod' && (await codes()).filter((c) => c === 'hook' || c === 'parts' || c === 'depth').length === 0, { parts: d.units[1].parts, codes: await codes() });
  await page.click('#view-seg [data-view="3d"]');

  /* 스피드랙 옆에 유닛을 추가하면 같은 형태 */
  await page.click('#tab-layout');
  await ev(() => { const P = __planner; P.Act.deleteUnit(P.design.units[2].id); P.select(P.design.units[1].id, null); });
  await hideToast();
  await page.click('#btn-add-unit');
  d = await design(page);
  const nu = d.units[d.units.length - 1];
  check('유닛 추가: 고른 스피드랙의 형태와 크기를 따른다', nu.style === 'rack' && nu.d === 600 && nu.h === 2100 && nu.finish === 'walnut' && nu.parts.length === 0, nu);
  check('유닛 추가: 겹치지 않는다', (await ev(() => __planner.C.checkDesign(__planner.design).filter((i) => i.level === 'bad').length)) === 0);

  /* 문이 달린 그레이 유닛을 스피드랙으로 */
  await ev(() => { const P = __planner; P.select(P.design.units[0].id, null); });
  await page.click('#unit-finish [data-finish="gray"]');
  await page.click('#unit-door [data-door="hinge"]');
  check('문 표시 버튼이 보인다', await page.isVisible('#btn-doors'));
  await page.click('#unit-style [data-style="rack"]');
  await hideToast();
  d = await design(page);
  check('스피드랙: 문은 없어지고, 없는 색(그레이)은 백색으로', d.units[0].style === 'rack' && d.units[0].door === 'none' && d.units[0].finish === 'white' && await page.isHidden('#btn-doors'), d.units[0]);
  // 판넬형으로 돌아가면 다섯 색이 다시 보인다
  await page.click('#unit-style [data-style="panel"]');
  check('판넬형: 색상 다섯 가지와 문 칸이 돌아온다', (await visibleCount('#unit-finish button')) === 5 && await page.isVisible('#unit-door-row') && (await page.textContent('#unit-finish-name')) === '화이트');
  await page.click('#unit-style [data-style="rack"]');
  await hideToast();

  /* 목록 */
  await ev((i) => { const P = __planner; P.select(i, null); P.Act.preset('drawers'); }, nu.id);
  await hideToast();
  await page.click('#tab-list');
  const bom = (await page.textContent('#bom')).replace(/\s+/g, ' ');
  check('부품 목록: 스피드랙은 기둥·선반 단·행거봉 세트·서랍으로 적는다', /스피드랙 기둥/.test(bom) && /스피드랙 선반 단/.test(bom) && /스피드랙 행거봉 세트/.test(bom) && /스피드랙 서랍\s*800 × 600 · 3단\s*1(?!\d)/.test(bom), bom.slice(0, 400));

  /* 저장했다가 다시 열기 */
  const saved = await design(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__planner);
  await settle(page, 200);
  d = await design(page);
  check('새로 고침: 스피드랙 설계가 그대로', JSON.stringify(d) === JSON.stringify(saved) && d.units.filter((k) => k.style === 'rack').length === 3);
  await page.screenshot({ path: 'shots/C2-rack-reload.png' });
  check('오류 없음 (스피드랙)', t.errors.length === 0 && t.blocked.length === 0, t.errors);
  await t.close();

  /* 코너장: 두 부분의 깊이 */
  // 이전 판이 저장한 코너장 (옆 깊이 없음)
  const old = { v: 1, savedAt: 1700000000000, sample: false, design: { v: 2, room: { w: 3200, d: 2600, h: 2300, wallColor: 'white' }, openings: [], blocks: [],
    units: [{ id: 'c', name: '코너장 1', kind: 'corner', x: 500, z: 500, rot: 0, w: 1000, h: 2100, w2: 1000, d: 550, style: 'panel', finish: 'white', door: 'hinge', doorFinish: 'white', hinge: 'left', parts: [{ id: 'r', type: 'rod', y: 1688 }] },
      { id: 'a', name: '유닛 1', kind: 'std', x: 1400, z: 275, rot: 0, w: 800, h: 2100, d: 550, style: 'panel', finish: 'white', door: 'none', doorFinish: 'white', hinge: 'left', parts: [] }] }, prefs: {} };
  t = await open({ width: 1280, height: 800, localStorage: { 'dressroom-planner:v1': JSON.stringify(old) } });
  page = t.page;
  const ev2 = (fn, arg) => page.evaluate(fn, arg);
  d = await design(page);
  check('이전 코너장: 두 깊이가 같은 값으로 열린다', d.units[0].d === 550 && d.units[0].d2 === 550 && d.units[1].d2 === undefined, d.units[0]);
  await page.click('#tab-layout');
  await ev2(() => __planner.select('c', null));
  check('코너장: 깊이 칸이 둘', await page.isVisible('#unit-d2-row') && (await page.inputValue('#unit-d2')) === '550' && (await page.textContent('#unit-d-help')) === '뒷벽 쪽 부분');
  await page.fill('#unit-d2', '400');
  await page.press('#unit-d2', 'Enter');
  d = await design(page);
  let box = await ev2(() => { const P = __planner; return P.C.box(P.design.units[0]); });
  check('옆 깊이만 바꾼다: 뒷벽 쪽 깊이와 모서리는 그대로', d.units[0].d === 550 && d.units[0].d2 === 400 && box.x0 === 0 && box.z0 === 0 && box.x1 === 1000 && box.z1 === 1000, { u: d.units[0], box });
  await page.fill('#unit-d', '650');
  await page.press('#unit-d', 'Enter');
  d = await design(page);
  check('깊이(뒷벽 쪽)만 바꾼다', d.units[0].d === 650 && d.units[0].d2 === 400);
  check('코너 접이문 안내는 두 깊이를 반영한다', /코너 접이문 2짝 \(578 \+ 348mm\)/.test(await page.textContent('#unit-door-info')), await page.textContent('#unit-door-info'));
  // 가로를 줄이면 옆 깊이의 한도(가로 - 100)가 줄어든다
  await page.fill('#unit-w', '450');
  await page.press('#unit-w', 'Enter');
  d = await design(page);
  check('가로를 줄이면 옆 깊이가 한도에 맞춰진다', d.units[0].w === 450 && d.units[0].d2 === 350 && (await page.getAttribute('#unit-d2', 'max')) === '350', d.units[0]);
  await page.click('#btn-undo');
  // 옆에 선 유닛과의 관계: 뒷벽 쪽 깊이 650이면 옆 유닛(깊이 550)보다 앞으로 나온다
  const gaps = await ev2(() => { const P = __planner; const g = P.C.unitGaps(P.design.units[0], P.design); return { right: g.right.gap, aisleA: g.aisleA.gap, aisleB: g.aisleB.gap }; });
  check('간격: 두 부분 앞의 통로를 저마다의 깊이에서 잰다', gaps.right === 0 && gaps.aisleA === 2600 - 650 && gaps.aisleB === 3200 - 400, gaps);
  await ev2(() => __planner.select('a', null));
  check('일반 유닛: 옆 깊이 칸은 숨는다', await page.isHidden('#unit-d2-row') && (await page.textContent('#unit-d-help')) === '앞뒤');
  await ev2(() => __planner.select(null, null));
  await page.click('#view-seg [data-view="top"]');
  await settle(page, 300);
  await page.screenshot({ path: 'shots/C3-corner-depth-top.png' });
  // 저장 후 다시 열기
  const saved2 = await design(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__planner);
  await settle(page, 200);
  d = await design(page);
  check('새로 고침: 두 깊이가 그대로', JSON.stringify(d) === JSON.stringify(saved2) && d.units[0].d === 650 && d.units[0].d2 === 400);
  check('오류 없음 (코너장)', t.errors.length === 0 && t.blocked.length === 0, t.errors);
  await t.close();

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
