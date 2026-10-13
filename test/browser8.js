// 브라우저 점검 8: 코너 스피드랙, 문 높이, 크기 범위
const { open, settle, screenOf, drag, design } = require('./harness');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info))); };

const part = (id, type, y, extra) => Object.assign({ id, type, y }, extra);
const envelope = (dz) => ({ 'dressroom-planner:v1': JSON.stringify({ v: 1, savedAt: 1700000000000, sample: false, design: dz, prefs: {} }) });

(async () => {
  /* ---------- 1. 코너 스피드랙 ---------- */
  // 이전 판이 저장한 판넬형 코너장 둘(1200, 1000)과 서랍이 든 유닛
  const saved = { v: 2, room: { w: 2190, d: 2460, h: 2300, wallColor: 'white' }, openings: [{ id: 'door1', type: 'door', wall: 'S', offset: 60, width: 830, height: 2100, leaf: 'swing', swing: 'in', hinge: 'a' }], blocks: [],
    units: [
      { id: 'c1', name: '코너장 1', kind: 'corner', x: 600, z: 600, rot: 0, w: 1200, h: 2100, w2: 1200, d: 500, style: 'panel', finish: 'white', door: 'none', doorFinish: 'white', hinge: 'left', parts: [part('c1r', 'rod', 1990), part('c1q', 'rod', 1016), part('c1s', 'shelf', 1112)] },
      { id: 'u1', name: '유닛 1', kind: 'std', x: 1600, z: 250, rot: 0, w: 800, h: 2100, d: 500, style: 'panel', finish: 'white', door: 'none', doorFinish: 'white', hinge: 'left', parts: [part('u1d', 'drawer', 88, { n: 3, eh: 180 }), part('u1r', 'rod', 1990)] },
      { id: 'c2', name: '코너장 2', kind: 'corner', x: 1690, z: 1960, rot: 180, w: 1000, h: 2100, w2: 1000, d: 500, style: 'panel', finish: 'white', door: 'none', doorFinish: 'white', hinge: 'left', parts: [part('c2r', 'rod', 1990), part('c2q', 'rod', 1016)] },
    ] };
  let t = await open({ width: 1280, height: 800, localStorage: envelope(saved) });
  let page = t.page;
  let ev = (fn, arg) => page.evaluate(fn, arg);
  const codes = () => ev(() => __planner.C.checkDesign(__planner.design).map((i) => i.code));
  const hideToast = () => ev(() => { document.querySelector('#toast').hidden = true; });
  const unitOf = async (id) => (await design(page)).units.find((k) => k.id === id);
  const typeIn = async (sel, v) => { await page.fill(sel, String(v)); await page.press(sel, 'Enter'); };

  await page.click('#tab-layout');
  await ev(() => __planner.select('c1', null));
  check('코너장: 형태 칸이 보이고 기둥형은 숨는다', await page.isVisible('#unit-style-row') && await page.isVisible('#unit-style [data-style="rack"]') && await page.isHidden('#unit-style [data-style="pole"]'));
  await page.click('#unit-style [data-style="rack"]');
  let c1 = await unitOf('c1');
  check('코너장을 스피드랙으로: 형태가 바뀌고 크기·위치·깊이는 그대로', c1.style === 'rack' && c1.door === 'none' && c1.w === 1200 && c1.w2 === 1200 && c1.d === 500 && c1.d2 === 500 && c1.x === 600 && c1.z === 600, c1);
  check('코너 스피드랙: 부품은 남고, 높이는 내부 범위 안에 있다', c1.parts.length === 3 && c1.parts.every((p) => p.y >= 70 && p.y <= 2060) && (await codes()).indexOf('parts') < 0, c1.parts);
  check('코너 스피드랙: 형태 표시, 문 칸 숨김, 색상 네 가지', (await page.getAttribute('#unit-style [data-style="rack"]', 'aria-pressed')) === 'true' && await page.isHidden('#unit-door-row')
    && (await ev(() => Array.from(document.querySelectorAll('#unit-finish button')).filter((b) => !b.hidden).length)) === 4 && (await page.textContent('#unit-finish-name')) === '백색 프레임 · 백색 합판');
  check('코너 스피드랙: 짜임 안내 (1200 코너는 공식몰 세트 구성에 있는 크기라 규격 안내가 없다)', /기둥 6개/.test(await page.textContent('#unit-door-info')) && !/가까운 규격/.test(await page.textContent('#unit-door-info')) && await page.isHidden('#btn-fit-rack'), await page.textContent('#unit-door-info'));
  check('코너 스피드랙: 폭 1200에도 처짐 알림이 없다', (await codes()).indexOf('span') < 0 && (await codes()).indexOf('rack-size') < 0, await codes());
  await page.click('#unit-finish [data-finish="walnut"]');
  await ev(() => __planner.select(null, null));
  await hideToast();
  await settle(page, 500);
  await page.screenshot({ path: 'shots/G1-corner-rack.png' });

  // 3D에서 눌러 고를 수 있다 (날개 A의 앞쪽 기둥 근처)
  let pt = await screenOf(page, 900, 1000, 500);
  await page.mouse.click(pt.x, pt.y);
  check('코너 스피드랙: 3D에서 눌러 고른다', (await ev(() => __planner.ui.selUnit)) === 'c1', await ev(() => __planner.ui.selUnit));

  // 내부: 서랍 없음, 30mm 간격, 선반 넣기
  await page.click('#btn-open-interior');
  check('코너 스피드랙 내부: 서랍은 숨고 간격은 30mm, 표시는 코너 스피드랙', await page.isHidden('#int-add [data-add="drawer"]') && await page.isHidden('#int-add [data-preset="drawers"]') && (await page.textContent('#pitch-mm')) === '30' && /코너 스피드랙$/.test(await page.textContent('#int-unit-size')), await page.textContent('#int-unit-size'));
  await page.click('#int-add [data-add="shelf"]');
  c1 = await unitOf('c1');
  const ns = c1.parts.find((p) => ['c1r', 'c1q', 'c1s'].indexOf(p.id) < 0);
  check('코너 스피드랙 내부: 새 선반은 30mm 간격에 놓인다', ns && ns.type === 'shelf' && (ns.y - 10) % 30 === 0 && (await codes()).indexOf('parts') < 0, ns);
  // 선반을 3D에서 위로 끈다 (날개 A의 앞쪽 받침)
  await ev((id) => __planner.select('c1', id), ns.id);
  await settle(page, 200);
  let from = await screenOf(page, 800, ns.y + 20, 496);
  let to = await screenOf(page, 800, ns.y + 20 + 95, 496);
  await drag(page, from, to, { steps: 10 });
  c1 = await unitOf('c1');
  let moved = c1.parts.find((p) => p.id === ns.id);
  // 옆 유닛의 서랍 윗면(88 + 540 = 628)이 가까우면 선반 윗면을 거기에 맞춘다 (628 - 받침 40)
  check('코너 스피드랙 내부: 선반을 끌면 옆 유닛의 서랍 윗면에 맞는다', moved.y === 588, [ns.y, moved.y]);
  from = await screenOf(page, 800, moved.y + 20, 496);
  to = await screenOf(page, 800, moved.y + 20 + 110, 496);
  await drag(page, from, to, { steps: 10 });
  c1 = await unitOf('c1');
  const again = c1.parts.find((p) => p.id === ns.id);
  check('코너 스피드랙 내부: 맞출 곳이 없으면 30mm 간격에 맞는다', again.y > moved.y && (again.y - 10) % 30 === 0, [moved.y, again.y]);
  await page.click('#int-add [data-preset="double"]');
  await hideToast();
  c1 = await unitOf('c1');
  check('코너 스피드랙 내부: 2단 행거 구성', c1.parts.map((p) => p.type).join() === 'rod,rod' && (await codes()).filter((k) => k === 'parts' || k === 'hook' || k === 'depth').length === 0, { parts: c1.parts, codes: await codes() });
  await page.click('#view-seg [data-view="front"]');
  await settle(page, 400);
  await page.screenshot({ path: 'shots/G2-corner-rack-front.png' });
  await page.click('#view-seg [data-view="3d"]');

  // 다른 크기의 코너장: 규격 안내와 맞추기
  await page.click('#tab-layout');
  await ev(() => __planner.select('c2', null));
  await page.click('#unit-style [data-style="rack"]');
  await typeIn('#unit-w', 900);
  let c2 = await unitOf('c2');
  check('코너 스피드랙: 규격과 다른 크기를 알린다', c2.style === 'rack' && c2.w === 900 && (await codes()).indexOf('rack-size') >= 0 && await page.isVisible('#btn-fit-rack') && /가까운 규격은 1000 × 1000 × 2100mm/.test(await page.textContent('#unit-door-info')), await page.textContent('#unit-door-info'));
  let box0 = await ev(() => { const P = __planner; return P.C.box(P.design.units.find((k) => k.id === 'c2')); });
  await page.click('#btn-fit-rack');
  c2 = await unitOf('c2');
  let box1 = await ev(() => { const P = __planner; return P.C.box(P.design.units.find((k) => k.id === 'c2')); });
  check('규격에 맞추기: 1000 × 1000, 모서리(오른쪽 아래)는 제자리', c2.w === 1000 && c2.w2 === 1000 && box1.x1 === box0.x1 && box1.z1 === box0.z1 && box1.x0 === 1190 && (await codes()).indexOf('rack-size') < 0 && await page.isHidden('#btn-fit-rack'), { c2, box0, box1 });
  check('규격에 맞추기: 알림에 코너장 크기를 적는다', /스피드랙 규격 1000 × 1000 × 2100mm로 맞췄습니다/.test(await page.textContent('#toast')), await page.textContent('#toast'));
  await hideToast();

  // 유닛을 스피드랙으로 바꾼 뒤 코너장을 넣으면 스피드랙으로 들어온다
  await ev(() => { const P = __planner; P.Act.deleteUnit('c2'); P.select('u1', null); });
  await hideToast();
  await page.click('#unit-style [data-style="rack"]');
  let u1 = await unitOf('u1');
  check('서랍이 든 유닛을 스피드랙으로: 서랍이 남는다', u1.style === 'rack' && u1.parts.some((p) => p.type === 'drawer') && u1.parts.length === 2 && await page.isHidden('#toast'), u1.parts);
  check('스피드랙 800 × 500 서랍 유닛: 규격과 서랍 알림이 없다', (await codes()).filter((k) => k.indexOf('rack') === 0).length === 0, await codes());
  await page.click('#btn-add-corner');
  let dz = await design(page);
  const nc = dz.units[dz.units.length - 1];
  check('코너장 추가: 스피드랙 옆에서는 스피드랙 코너장, 깊이는 옆 유닛(500)을 따른다', nc.kind === 'corner' && nc.style === 'rack' && nc.d === 500 && nc.d2 === 500 && nc.door === 'none', nc);
  check('코너장 추가: 겹치지 않는다', (await ev(() => __planner.C.checkDesign(__planner.design).filter((i) => i.level === 'bad').length)) === 0, await codes());
  await ev(() => __planner.select(null, null));
  await hideToast();
  await settle(page, 500);
  await page.screenshot({ path: 'shots/G3-rack-set.png' });

  // 목록과 저장
  await page.click('#tab-list');
  const bom = (await page.textContent('#bom')).replace(/\s+/g, ' ');
  check('부품 목록: 코너 스피드랙의 날개마다 선반 단을 적고 서랍을 적는다', /스피드랙 선반 단\s*700 × 500/.test(bom) && /스피드랙 선반 단\s*1200 × 500/.test(bom) && /스피드랙 서랍\s*800 × 500 · 3단/.test(bom), bom.slice(0, 500));
  const before = await design(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__planner);
  await settle(page, 200);
  dz = await design(page);
  check('새로 고침: 코너 스피드랙 설계가 그대로', JSON.stringify(dz) === JSON.stringify(before) && dz.units.filter((k) => k.kind === 'corner' && k.style === 'rack').length === 2, dz.units.map((k) => [k.kind, k.style]));
  check('오류 없음 (코너 스피드랙)', t.errors.length === 0 && t.blocked.length === 0, t.errors);
  await t.close();

  /* ---------- 2. 문 높이 ---------- */
  const doors = { v: 2, room: { w: 3200, d: 2400, h: 2300, wallColor: 'white' }, openings: [], blocks: [],
    units: [
      { id: 'a', name: '유닛 1', kind: 'std', x: 400, z: 290, rot: 0, w: 800, h: 2100, d: 580, style: 'panel', finish: 'oak', door: 'none', doorFinish: 'oak', hinge: 'left', parts: [part('ad', 'drawer', 88, { n: 3, eh: 180 }), part('as', 'shelf', 628), part('ar', 'rod', 1900)] },
      { id: 'b', name: '유닛 2', kind: 'std', x: 1200, z: 290, rot: 0, w: 800, h: 2100, d: 580, style: 'panel', finish: 'oak', door: 'slide', doorFinish: 'white', hinge: 'left', parts: [part('bd', 'drawer', 88, { n: 3, eh: 180 }), part('br', 'rod', 1900)] },
      { id: 'c', name: '유닛 3', kind: 'std', x: 1850, z: 290, rot: 0, w: 500, h: 2100, d: 580, style: 'panel', finish: 'oak', door: 'slide', doorFinish: 'white', hinge: 'left', parts: [part('cr', 'rod', 1900)] },
      { id: 'k', name: '코너장 1', kind: 'corner', x: 2700, z: 1900, rot: 180, w: 1000, h: 2100, w2: 1000, d: 550, d2: 550, style: 'panel', finish: 'oak', door: 'hinge', doorFinish: 'oak', hinge: 'left', parts: [part('kr', 'rod', 1900)] },
    ] };
  t = await open({ width: 1280, height: 800, localStorage: envelope(doors) });
  page = t.page;
  ev = (fn, arg) => page.evaluate(fn, arg);
  const unit2 = async (id) => (await design(page)).units.find((k) => k.id === id);
  const hide2 = () => ev(() => { document.querySelector('#toast').hidden = true; });
  const type2 = async (sel, v) => { await page.fill(sel, String(v)); await page.press(sel, 'Enter'); };
  await page.click('#tab-layout');
  await ev(() => __planner.select('a', null));
  check('문이 없으면 문 높이 칸이 없다', await page.isHidden('#unit-door-h-row') && await page.isHidden('#unit-door-at-row') && await page.isHidden('#unit-door-fit-row'));
  await page.click('#unit-door [data-door="hinge"]');
  check('여닫이문: 문 높이 칸에 전체 높이(2026)가 적힌다', await page.isVisible('#unit-door-h-row') && (await page.inputValue('#unit-door-h')) === '2026' && (await page.textContent('#unit-door-h-help')) === '전체 높이' && await page.isHidden('#unit-door-at-row') && (await page.getAttribute('#unit-door-h', 'max')) === '2026');
  check('서랍이 있으면 서랍 위에 맞추기가 보인다', await page.isVisible('#unit-door-fit-row'));
  await page.click('#btn-door-fit');
  let a = await unit2('a');
  check('서랍 위에 맞추기: 문 아래 끝이 서랍 윗면(628) 바로 위', a.doorH === 2098 - 628 - 2 && a.doorAt === 'top' && (await page.inputValue('#unit-door-h')) === '1468' && (await page.textContent('#unit-door-h-help')) === '바닥에서 630~2,098', [a.doorH, a.doorAt, await page.textContent('#unit-door-h-help')]);
  check('서랍 위에 맞추기: 알리고 되돌릴 수 있다', /문 높이 1,468mm/.test(await page.textContent('#toast')) && await page.isVisible('#toast button'));
  await hide2();
  await page.click('#btn-door-fit');
  check('이미 맞춰져 있으면 되돌리기를 내밀지 않는다', /이미 서랍 위에 맞춰져/.test(await page.textContent('#toast')) && (await page.locator('#toast button').count()) === 0 && (await unit2('a')).doorH === 1468, await page.textContent('#toast'));
  await hide2();
  check('문 높이를 줄이면 문 위치 칸이 보이고 위쪽이 눌려 있다', await page.isVisible('#unit-door-at-row') && (await page.getAttribute('#unit-door-at [data-at="top"]', 'aria-pressed')) === 'true');
  check('여닫이문 안내는 그대로', /여닫이문 2짝 · 한 짝 397mm/.test(await page.textContent('#unit-door-info')), await page.textContent('#unit-door-info'));
  await ev(() => __planner.select(null, null));
  await settle(page, 500);
  await page.screenshot({ path: 'shots/H1-door-above-drawers.png' });

  // 문짝이 실제로 그 높이에 그려지는지: 문 아래 끝 바로 아래(서랍)와 위(문)의 화면 색이 다르다
  const doorBox = await ev(() => __planner.Scene.doorBounds().hinged.a);
  check('3D: 문짝이 630~2098 높이에 그려진다', doorBox && doorBox[0] === 630 && doorBox[1] === 2098, doorBox);

  await ev(() => __planner.select('a', null));
  await page.click('#unit-door-at [data-at="bottom"]');
  a = await unit2('a');
  check('문 위치 아래쪽: 문이 걸레받이 위(72)에서 시작한다', a.doorAt === 'bottom' && a.doorH === 1468 && (await page.textContent('#unit-door-h-help')) === '바닥에서 72~1,540', [a.doorAt, await page.textContent('#unit-door-h-help')]);
  await page.click('#unit-door-at [data-at="top"]');
  // 숫자로 정하기: 치는 동안 작은 값은 반영하지 않고, 입력을 마치면 반영한다
  await page.fill('#unit-door-h', '120');
  a = await unit2('a');
  check('문 높이: 치는 도중의 작은 값(120)은 바로 반영하지 않는다', a.doorH === 1468, a.doorH);
  await page.press('#unit-door-h', 'Enter');
  a = await unit2('a');
  check('문 높이: 입력을 마치면 120도 반영한다', a.doorH === 120 && a.doorAt === 'top', a);
  await type2('#unit-door-h', 1200);
  a = await unit2('a');
  check('문 높이 1200: 위쪽 끝에 맞춘다', a.doorH === 1200 && (await page.textContent('#unit-door-h-help')) === '바닥에서 898~2,098', [a.doorH, await page.textContent('#unit-door-h-help')]);
  await type2('#unit-door-h', 9999);
  a = await unit2('a');
  check('전체 높이 이상을 넣으면 전체로 돌아간다', !('doorH' in a) && !('doorAt' in a) && (await page.inputValue('#unit-door-h')) === '2026' && await page.isHidden('#unit-door-at-row'), a);
  await type2('#unit-door-h', 1200);
  // 유닛 높이를 바꾸면 문은 위쪽 끝을 따라간다
  await type2('#unit-h', 2200);
  a = await unit2('a');
  check('유닛 높이 2200: 문 높이 1200은 그대로, 위쪽 끝을 따라간다', a.h === 2200 && a.doorH === 1200 && (await page.textContent('#unit-door-h-help')) === '바닥에서 998~2,198', await page.textContent('#unit-door-h-help'));
  await type2('#unit-h', 2100);
  // 문을 없애면 값도 없어진다
  await page.click('#unit-door [data-door="none"]');
  a = await unit2('a');
  check('문을 없애면 문 높이 값도 없어진다', a.door === 'none' && !('doorH' in a) && await page.isHidden('#unit-door-h-row'), a);
  await page.click('#unit-door [data-door="hinge"]');
  await page.click('#btn-door-fit');
  await hide2();

  // 미닫이문: 한 줄로 묶인 유닛은 문 높이를 함께 쓴다
  await ev(() => __planner.select('b', null));
  check('미닫이문: 전체 높이는 2076', (await page.inputValue('#unit-door-h')) === '2076' && await page.isVisible('#unit-door-fit-row'), await page.inputValue('#unit-door-h'));
  const codesNow = () => ev(() => __planner.C.checkDesign(__planner.design).map((i) => i.code));
  check('미닫이문이 서랍을 가리고 서랍이 문짝 두 칸에 걸치면 알린다', (await codesNow()).indexOf('slide-drawer') >= 0, await codesNow());
  await page.click('#btn-door-fit');
  await hide2();
  let b = await unit2('b');
  let c = await unit2('c');
  const runs = await ev(() => __planner.C.slideRuns(__planner.design).map((r) => ({ n: r.ids.length, y0: r.y0, y1: r.y1 })));
  check('미닫이문 서랍 위에 맞추기: 줄 전체가 같은 문 높이', b.doorH === 2086 - 628 - 12 && c.doorH === b.doorH && runs.length === 1 && runs[0].n === 2 && runs[0].y0 === 640 && runs[0].y1 === 2086, { b: b.doorH, c: c.doorH, runs });
  check('미닫이문 안내: 한 줄로 묶여 있다', /맞닿은 유닛 2개를 한 줄로 묶었습니다/.test(await page.textContent('#unit-door-info')), await page.textContent('#unit-door-info'));
  const slideBox = await ev(() => __planner.Scene.doorBounds().slides);
  check('3D: 미닫이문과 레일이 서랍 위(630~2100)에 그려진다', slideBox.length === 1 && slideBox[0].ids.length === 2 && slideBox[0].y[0] === 630 && slideBox[0].y[1] === 2100, slideBox);
  check('문 높이를 줄여 서랍이 드러나면 서랍 알림이 없어진다', (await codesNow()).indexOf('slide-drawer') < 0, await codesNow());

  // 코너 접이문
  await ev(() => __planner.select('k', null));
  check('코너 접이문: 문 높이 칸은 있고 서랍 위에 맞추기는 없다', await page.isVisible('#unit-door-h-row') && await page.isHidden('#unit-door-fit-row') && (await page.inputValue('#unit-door-h')) === '2026');
  await type2('#unit-door-h', 1500);
  let k = await unit2('k');
  check('코너 접이문 문 높이 1500', k.doorH === 1500 && k.doorAt === 'top', k);
  await ev(() => __planner.select(null, null));
  await settle(page, 600);
  await page.screenshot({ path: 'shots/H2-door-heights.png' });

  // 목록: 문 높이가 부품 목록에 반영된다
  await page.click('#tab-list');
  const bom2 = (await page.textContent('#bom')).replace(/\s+/g, ' ');
  check('부품 목록: 문짝 높이가 정한 값으로 적힌다', /여닫이문\s*397 × 1468 × 18/.test(bom2) && /미닫이문\s*665 × 1446/.test(bom2) && /코너 접이문\s*428 \+ 448 × 1500 × 18/.test(bom2), bom2);
  // 유닛을 복제하면 문 높이도 따라간다
  await page.click('#tab-layout');
  await ev(() => { const P = __planner; P.select('a', null); P.Act.duplicateUnit('a'); });
  dz = await design(page);
  const dup = dz.units[dz.units.length - 1];
  check('복제: 문 종류와 문 높이를 그대로 가져간다', dup.door === 'hinge' && dup.doorH === 1468 && dup.doorAt === 'top', dup);
  const before2 = await design(page);
  await page.reload();
  await page.waitForFunction(() => !!window.__planner);
  await settle(page, 200);
  dz = await design(page);
  const pickDoor = (list) => list.units.map((q) => [q.id, q.door, q.doorH, q.doorAt]);
  check('새로 고침: 문 높이가 그대로', JSON.stringify(pickDoor(dz)) === JSON.stringify(pickDoor(before2)) && JSON.stringify(dz.units) === JSON.stringify(before2.units), pickDoor(dz));
  check('오류 없음 (문 높이)', t.errors.length === 0 && t.blocked.length === 0, t.errors);
  await t.close();

  /* ---------- 3. 크기 범위 ---------- */
  t = await open({ width: 1280, height: 800 });
  page = t.page;
  ev = (fn, arg) => page.evaluate(fn, arg);
  const type3 = async (sel, v) => { await page.fill(sel, String(v)); await page.press(sel, 'Enter'); };
  const hide3 = () => ev(() => { document.querySelector('#toast').hidden = true; });
  const codes3 = () => ev(() => __planner.C.checkDesign(__planner.design).map((i) => i.code));
  // 방: 이전 한도(8000)보다 크게
  await type3('#room-w', 12000);
  await type3('#room-d', 9000);
  await type3('#room-h', 4000);
  dz = await design(page);
  check('방 크기: 12000 × 9000 × 4000', dz.room.w === 12000 && dz.room.d === 9000 && dz.room.h === 4000, dz.room);
  await settle(page, 700);
  // 큰 방도 화면 안에 들어온다: 방의 여덟 꼭짓점이 모두 캔버스 안에 있다
  const inView = async () => ev(() => {
    const P = __planner;
    const cam = P.Rig.camera();
    cam.updateMatrixWorld();
    const r = document.getElementById('gl').getBoundingClientRect();
    const room = P.design.room;
    let ok = true;
    for (const x of [0, room.w]) for (const y of [0, room.h]) for (const z of [0, room.d]) {
      const v = new window.THREE.Vector3(x, y, z).project(cam);
      if (v.x < -1 || v.x > 1 || v.y < -1 || v.y > 1 || v.z < -1 || v.z > 1) ok = false;
    }
    return { ok, dist: Math.round(P.Rig.state.dist), w: Math.round(r.width) };
  });
  // 화면 맞춤은 움직이며 바뀌므로, 다 움직인 상태로 맞춘 뒤에 잰다
  const fitNow = async () => { await ev(() => __planner.Rig.fit(false)); await settle(page, 200); };
  await fitNow();
  let view = await inView();
  check('큰 방(12m): 3D 화면에 방 전체가 들어온다', view.ok && view.dist > 20000, view);
  await page.screenshot({ path: 'shots/J1-room-12m.png' });
  await page.click('#view-seg [data-view="top"]');
  await settle(page, 400);
  check('큰 방(12m): 평면 보기에 방 전체가 들어온다', await ev(() => __planner.Rig.topFits()));
  await page.click('#view-seg [data-view="3d"]');
  await type3('#room-w', 50000);
  await fitNow();
  view = await inView();
  dz = await design(page);
  check('가장 큰 방(50m): 값이 들어가고 3D 화면에 들어온다', dz.room.w === 50000 && view.ok, view);
  await type3('#room-w', 99999);
  dz = await design(page);
  check('방 가로는 50,000까지', dz.room.w === 50000 && (await page.inputValue('#room-w')) === '50000', dz.room);
  // 치는 도중의 작은 값은 반영하지 않는다
  await page.fill('#room-w', '360');
  dz = await design(page);
  check('방 크기: 치는 도중의 360은 바로 반영하지 않는다', dz.room.w === 50000, dz.room.w);
  await page.fill('#room-w', '3600');
  dz = await design(page);
  check('방 크기: 3600은 치는 동안 바로 반영한다', dz.room.w === 3600, dz.room.w);
  await page.press('#room-w', 'Enter');
  await type3('#room-d', 2400);
  await type3('#room-h', 2300);
  await page.click('#btn-start-empty').catch(() => {});
  await hide3();

  // 유닛
  await page.click('#tab-layout');
  await page.click('#btn-add-unit');
  let u = (await design(page)).units[0];
  const uid = u.id;
  const cur = async () => (await design(page)).units.find((q) => q.id === uid);
  await ev((id) => { const P = __planner; P.select(id, null); P.Act.preset('double'); }, uid);
  await hide3();
  const partsBefore = (await cur()).parts.map((p) => p.y);
  await type3('#unit-w', 2400);
  u = await cur();
  check('유닛 가로 2400 (이전 한도 1500)', u.w === 2400 && (await page.getAttribute('#unit-w', 'max')) === '20000', u.w);
  await type3('#unit-d', 1200);
  u = await cur();
  check('유닛 깊이 1200 (이전 한도 900), 뒷면은 벽에 붙은 채', u.d === 1200 && u.z === 600, [u.d, u.z]);
  // 높이: 치는 도중의 210은 반영하지 않아 부품이 눌리지 않는다
  await page.fill('#unit-h', '210');
  u = await cur();
  check('유닛 높이: 치는 도중의 210은 반영하지 않는다 (부품 위치 그대로)', u.h === 2100 && JSON.stringify(u.parts.map((p) => p.y)) === JSON.stringify(partsBefore), [u.h, u.parts.map((p) => p.y)]);
  await page.fill('#unit-h', '2600');
  await page.press('#unit-h', 'Enter');
  u = await cur();
  check('유닛 높이 2600: 천장(2300)보다 높아도 들어가고 확인할 점으로 알린다', u.h === 2600 && (await codes3()).indexOf('tall') >= 0, [u.h, await codes3()]);
  await type3('#unit-h', 2100);
  await type3('#unit-w', 150);
  u = await cur();
  check('유닛 가로 150 (이전 한도 300)', u.w === 150, u.w);
  await type3('#unit-w', 5);
  u = await cur();
  check('유닛 가로는 100부터', u.w === 100 && (await page.inputValue('#unit-w')) === '100', u.w);
  // − 버튼: 100에서 더 내려가지 않는다
  await page.click('.step[data-for="unit-w"][data-dir="-1"]');
  u = await cur();
  check('− 버튼: 가장 작은 값에서 멈춘다', u.w === 100, u.w);
  await page.click('.step[data-for="unit-w"][data-dir="1"]');
  u = await cur();
  check('+ 버튼: 10mm씩 (작은 값에서도 바로 반영)', u.w === 110, u.w);
  await type3('#unit-w', 800);
  await type3('#unit-d', 580);
  check('오류 없음 (유닛 크기)', t.errors.length === 0, t.errors);

  // 서랍
  await ev((id) => { const P = __planner; P.select(id, null); P.Act.preset('drawers'); P.setTab('interior'); }, uid);
  await hide3();
  u = await cur();
  const dr = u.parts.find((p) => p.type === 'drawer');
  await type3('#f-' + dr.id + '-eh', 450);
  u = await cur();
  check('서랍 단 높이 450 (이전 한도 400): 공간이 모자라면 바꾸지 않고 알린다', u.parts.find((p) => p.id === dr.id).eh === 450 || /공간이 부족/.test(await page.textContent('#toast')), u.parts);
  await hide3();
  await type3('#f-' + dr.id + '-n', 1);
  await type3('#f-' + dr.id + '-eh', 450);
  u = await cur();
  check('서랍 1단 × 450', u.parts.find((p) => p.id === dr.id).n === 1 && u.parts.find((p) => p.id === dr.id).eh === 450, u.parts);
  await type3('#f-' + dr.id + '-eh', 60);
  u = await cur();
  check('서랍 단 높이 60 (이전 한도 100)', u.parts.find((p) => p.id === dr.id).eh === 60, u.parts);

  // 코너장 깊이
  await page.click('#tab-layout');
  await page.click('#btn-add-corner');
  dz = await design(page);
  const cid = dz.units[dz.units.length - 1].id;
  const curC = async () => (await design(page)).units.find((q) => q.id === cid);
  let cc = await curC();
  check('코너장 추가: 처음 깊이는 앞면이 넉넉히 남는 값', cc.kind === 'corner' && cc.w - cc.d2 >= 250 && cc.w2 - cc.d >= 250 && (await codes3()).indexOf('corner-front') < 0, cc);
  await type3('#unit-d', 850);
  cc = await curC();
  check('코너장 깊이 850 (이전 한도 700)', cc.d === 850 && (await page.getAttribute('#unit-d', 'max')) === String(cc.w2 - 100), [cc.d, await page.getAttribute('#unit-d', 'max')]);
  check('코너장: 앞면이 좁으면 막지 않고 확인할 점으로 알린다', (await codes3()).indexOf('corner-front') >= 0, await codes3());
  await type3('#unit-d', 5000);
  cc = await curC();
  check('코너장 깊이는 옆 길이 - 100까지', cc.d === cc.w2 - 100, cc);
  await type3('#unit-w', 2000);
  await type3('#unit-w2', 1800);
  cc = await curC();
  check('코너장 가로 2000 · 옆 길이 1800 (이전 한도 1500)', cc.w === 2000 && cc.w2 === 1800, cc);
  await page.click('#btn-undo'); await page.click('#btn-undo'); await page.click('#btn-undo'); await page.click('#btn-undo');

  // 문과 기둥
  await page.click('#tab-room');
  await ev(() => { const P = __planner; P.selectItem(P.design.openings[0].id); });
  await type3('#wi-width', 450);
  dz = await design(page);
  check('문 폭 450 (이전 한도 600): 들어가고 확인할 점으로 알린다', dz.openings[0].width === 450 && (await codes3()).indexOf('door-narrow') >= 0, [dz.openings[0].width, await codes3()]);
  await type3('#wi-height', 1500);
  dz = await design(page);
  check('문 높이 1500 (이전 한도 1800)', dz.openings[0].height === 1500, dz.openings[0]);
  await type3('#wi-width', 800);
  await type3('#wi-height', 2100);
  await page.click('#wall-add [data-add="pillar"]');
  await type3('#wb-w', 20);
  dz = await design(page);
  check('기둥 가로 20 (이전 한도 50)', dz.blocks[0].w === 20, dz.blocks[0]);
  await page.click('#tab-list');
  const text = await page.textContent('#issues');
  check('확인할 점 목록이 그려진다', typeof text === 'string');
  check('오류 없음 (크기 범위)', t.errors.length === 0 && t.blocked.length === 0, t.errors);
  await t.close();

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
