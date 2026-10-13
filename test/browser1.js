// 브라우저 점검 1: 이전 기능이 그대로 동작하는지
const { open, settle, screenOf, drag, design } = require('./harness');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info))); };

(async () => {
  let t = await open({ width: 1280, height: 800 });
  let page = t.page;
  const ev = (fn, arg) => page.evaluate(fn, arg);
  const ui = () => ev(() => JSON.parse(JSON.stringify(__planner.ui)));

  // 시작: 예시 배치
  let d = await design(page);
  check('시작: 새 형식(v2) 예시 배치', d.v === 2 && d.units.length === 3 && d.openings.length === 1 && d.blocks.length === 0, d);
  check('시작: 예시 표시', (await ui()).sample === true && await page.isVisible('#sample-notice'));
  check('시작: 문짝 표시 버튼은 문이 없으면 숨김', await page.isHidden('#btn-doors'));

  // 배치: 유닛을 끌어 옮긴다 (3D)
  await page.click('#tab-layout');
  const u0 = d.units[0];
  let from = await screenOf(page, u0.x, 1000, u0.z + u0.d / 2);
  // 아래쪽 벽 가까이, 왼쪽 벽에서 떨어진 곳으로
  let to = await screenOf(page, 600, 0, 1450);
  await drag(page, from, to, { steps: 16 });
  d = await design(page);
  let m = d.units.find((u) => u.id === u0.id);
  check('유닛 끌기: 다른 벽 가까이에서 그 벽을 등지고 붙는다', m.rot === 180 && Math.abs(m.z - (1800 - 290)) < 1, m);
  check('유닛 끌기: 예시 표시가 꺼진다', (await ui()).sample === false);
  let issues = await ev(() => __planner.C.checkDesign(__planner.design).filter((i) => i.level === 'bad'));
  check('유닛 끌기: 겹침·이탈 없음', issues.length === 0, issues);

  // 실행 취소, 다시 실행
  await page.click('#btn-undo');
  d = await design(page);
  m = d.units.find((u) => u.id === u0.id);
  check('실행 취소: 원래 자리', m.x === u0.x && m.z === u0.z && m.rot === u0.rot, m);
  await page.click('#btn-redo');
  d = await design(page);
  m = d.units.find((u) => u.id === u0.id);
  check('다시 실행', m.rot === 180, m);
  await page.click('#btn-undo');

  // 자석 끄기: 1mm 단위로 움직인다
  await page.click('#btn-magnet');
  check('자석 앵커 끄기', (await ui()).magnet === false && (await page.textContent('#magnet-state')) === 'OFF');
  d = await design(page);
  const u2 = d.units[2];
  from = await screenOf(page, u2.x, 1000, u2.z + u2.d / 2);
  to = await screenOf(page, u2.x - 30, 1000, u2.z + u2.d / 2 + 437);
  await drag(page, from, to, { steps: 14 });
  d = await design(page);
  m = d.units.find((u) => u.id === u2.id);
  check('자석 끔: 벽에서 떨어진 자리에 그대로 놓인다', m.rot === 0 && m.z > 600 && m.z < 800, m);
  await page.click('#btn-magnet');
  await page.keyboard.press('Control+z');
  d = await design(page);
  m = d.units.find((u) => u.id === u2.id);
  check('Ctrl+Z', m.z === u2.z, m);

  // 유닛 추가, 복제, 회전, 삭제
  await page.click('#btn-add-unit');
  d = await design(page);
  check('유닛 추가: 네 번째 유닛', d.units.length === 4 && d.units[3].kind === 'std', d.units[3]);
  const added = d.units[3];
  issues = await ev(() => __planner.C.checkDesign(__planner.design).filter((i) => i.level === 'bad'));
  check('유닛 추가: 겹치지 않는 자리', issues.length === 0, issues);
  await page.keyboard.press('KeyR');
  d = await design(page);
  check('R 회전', d.units[3].rot === (added.rot + 90) % 360, d.units[3]);
  await page.keyboard.press('Delete');
  d = await design(page);
  check('Delete 삭제', d.units.length === 3);

  // 숫자 칸: 폭 바꾸기
  await ev((id) => __planner.select(id, null), d.units[1].id);
  await page.fill('#unit-w', '700');
  await page.press('#unit-w', 'Enter');
  d = await design(page);
  check('폭 입력', d.units[1].w === 700, d.units[1]);

  // 내부: 정면 보기에서 부품을 끌어 옮긴다
  await ev((id) => __planner.select(id, null), d.units[0].id);
  await page.click('#tab-interior');
  await page.click('#view-seg [data-view="front"]');
  await settle(page, 100);
  d = await design(page);
  const iu = d.units[0];
  const rod = iu.parts.filter((p) => p.type === 'rod').sort((a, b) => a.y - b.y)[0];
  from = await screenOf(page, iu.x, rod.y + 16, iu.z + iu.d / 2);
  to = await screenOf(page, iu.x, rod.y + 16 + 150, iu.z + iu.d / 2);
  await drag(page, from, to, { steps: 10 });
  d = await design(page);
  const rod2 = d.units[0].parts.find((p) => p.id === rod.id);
  check('부품 끌기: 위로 옮겨지고 32mm 간격에 맞는다', rod2.y > rod.y + 100 && (rod2.y - 24) % 32 === 0, [rod.y, rod2.y]);
  check('부품 끌기: 내부 단계에서는 문짝 표시 버튼을 쓸 수 없다', await page.isHidden('#btn-doors') || await page.isDisabled('#btn-doors'));
  await page.click('#int-add [data-add="shelf"]');
  d = await design(page);
  check('부품 넣기: 선반', d.units[0].parts.length === iu.parts.length + 1);
  await page.keyboard.press('Delete');
  d = await design(page);
  check('부품 삭제', d.units[0].parts.length === iu.parts.length);

  // 목록
  await page.click('#tab-list');
  const stats = await page.textContent('#stats');
  check('목록: 요약에 문짝 줄이 있다', /문짝\s*0짝/.test(stats.replace(/\n/g, '')), stats);
  check('목록: 부품 목록이 채워진다', (await page.locator('#bom tr').count()) > 3);

  // 저장: 새로 고치면 그대로
  const before = await design(page);
  const stored = await ev(() => JSON.parse(localStorage.getItem('dressroom-planner:v1')));
  check('이 기기 저장: 새 형식으로 저장', stored && stored.design.v === 2 && Array.isArray(stored.design.openings), stored && Object.keys(stored.design));
  await page.reload();
  await page.waitForFunction(() => !!window.__planner);
  await settle(page, 200);
  d = await design(page);
  check('새로 고침: 설계가 그대로', JSON.stringify(d) === JSON.stringify(before));
  check('새로 고침: 예시 표시는 꺼진 채', (await ui()).sample === false && await page.isHidden('#sample-notice'));
  check('오류 없음', t.errors.length === 0 && t.blocked.length === 0, { errors: t.errors, blocked: t.blocked });
  await t.close();

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
