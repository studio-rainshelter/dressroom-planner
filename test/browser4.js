// 브라우저 점검 4: 이전 저장분 불러오기, 계정 저장, 보기 전용, 거울 표시, 외부 파일이 없을 때
const { open, settle, screenOf, drag, design } = require('./harness');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info))); };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// 이전 판(v1)이 저장하던 모양
const oldDesign = {
  room: { w: 2600, d: 2000, h: 2400 },
  door: { show: true, wall: 'E', offset: 300, width: 900 },
  units: [
    { id: 'u1', name: '왼쪽장', x: 400, z: 290, rot: 0, w: 800, h: 2100, d: 580, style: 'panel', finish: 'oak', parts: [{ id: 'p1', type: 'rod', y: 1688 }, { id: 'p2', type: 'drawer', y: 88, n: 3, eh: 180 }] },
    { id: 'u2', name: '기둥형', x: 1200, z: 290, rot: 0, w: 800, h: 2100, d: 450, style: 'pole', finish: 'black', parts: [{ id: 'p3', type: 'shelf', y: 1500 }] },
  ],
};
const oldLocal = (design, extra) => JSON.stringify(Object.assign({ v: 1, savedAt: 1700000000000, sample: false, design, prefs: { magnet: false, strength: 'high', autoRotate: true, dims: true, clothes: false } }, extra));

// 계정 저장소 흉내: window.__db 에 기록을 남긴다
const fakeClaude = (opts) => `
  (function () {
    var o = ${JSON.stringify(opts)};
    var state = { doc: o.doc || null, sets: [], gets: 0 };
    window.__db = state;
    var ref = {
      get: function () { state.gets += 1; return Promise.resolve({ exists: !!state.doc, data: function () { return JSON.parse(JSON.stringify(state.doc)); } }); },
      set: function (v) {
        if (o.refuse) { var e = new Error('refused'); e.code = 'invalid_argument'; return Promise.reject(e); }
        state.sets.push(JSON.parse(JSON.stringify(v))); state.doc = JSON.parse(JSON.stringify(v)); return Promise.resolve();
      },
    };
    window.claude = {
      use: function (name) {
        if (name === 'db') return Promise.resolve({ doc: function () { return ref; } });
        if (name === 'user') return Promise.resolve({ can: function () { return Promise.resolve(o.canWrite !== false); } });
        if (name === 'downloads') return Promise.resolve({ save: function (f) { state.saved = f.filename; return Promise.resolve(); } });
        return Promise.resolve(null);
      },
      ${opts.hot ? 'hot: { data: ' + JSON.stringify(opts.hot) + ', snapshot: function (fn) { window.__snap = fn; } },' : ''}
    };
  })();`;

(async () => {
  /* 1. 이 기기에 남아 있던 이전 형식 */
  let t = await open({ localStorage: { 'dressroom-planner:v1': oldLocal(oldDesign) } });
  let page = t.page;
  let d = await design(page);
  let ui = await page.evaluate(() => JSON.parse(JSON.stringify(__planner.ui)));
  check('이전 저장분(이 기기): 방과 유닛이 그대로', d.v === 2 && d.room.w === 2600 && d.room.d === 2000 && d.room.h === 2400 && d.units.length === 2 && d.units[0].id === 'u1' && d.units[0].name === '왼쪽장' && d.units[0].x === 400 && d.units[0].finish === 'oak' && d.units[0].parts.length === 2 && d.units[0].parts[1].n === 3, d);
  check('이전 저장분: 문이 같은 자리의 여닫이문으로', d.openings.length === 1 && d.openings[0].type === 'door' && d.openings[0].wall === 'E' && d.openings[0].offset === 300 && d.openings[0].width === 900 && d.openings[0].leaf === 'swing', d.openings);
  check('이전 저장분: 새 항목은 기본값', d.blocks.length === 0 && d.room.wallColor === 'white' && d.units.every((u) => u.kind === 'std' && u.door === 'none') && d.units[1].style === 'pole', d.units.map((u) => [u.kind, u.door, u.style]));
  check('이전 저장분: 설정도 그대로', ui.magnet === false && ui.strength === 'high' && ui.clothes === false && ui.doors === true && ui.sample === false, ui);
  check('이전 저장분: 확인할 점이 새로 생기지 않는다', (await page.evaluate(() => __planner.C.checkDesign(__planner.design).filter((i) => i.level === 'bad').length)) === 0);
  await page.screenshot({ path: 'shots/60-migrated.png' });
  check('오류 없음 (1)', t.errors.length === 0 && t.blocked.length === 0, t.errors);
  await t.close();

  /* 2. 문 표시를 꺼 둔 이전 설계 */
  t = await open({ localStorage: { 'dressroom-planner:v1': oldLocal(Object.assign({}, oldDesign, { door: { show: false, wall: 'S', offset: 0, width: 800 } })) } });
  d = await design(t.page);
  check('이전 저장분: 문 표시를 꺼 둔 경우 문 없음', d.openings.length === 0 && d.units.length === 2, d.openings);
  await t.close();

  /* 3. 계정에 저장된 이전 형식 */
  t = await open({ claude: fakeClaude({ doc: { v: 1, savedAt: 1700000000000, sample: false, design: oldDesign } }) });
  page = t.page;
  await page.waitForFunction(() => window.__db && window.__db.gets > 0 && __planner.design.units.length === 2, null, { timeout: 8000 });
  d = await design(page);
  check('계정 저장분(이전 형식): 불러와서 새 형식으로', d.v === 2 && d.units[0].name === '왼쪽장' && d.openings[0].wall === 'E', d);
  await page.waitForTimeout(2200);
  let db = await page.evaluate(() => JSON.parse(JSON.stringify(window.__db)));
  check('계정 저장분: 불러오기만으로는 다시 쓰지 않는다', db.sets.length === 0, db.sets.length);
  check('계정 저장분: 저장 상태 표시', (await page.textContent('#save-state')) === '계정에 저장됨', await page.textContent('#save-state'));
  // 바꾸면 새 형식으로 저장된다
  await page.click('#tab-layout');
  await page.click('#btn-add-corner');
  await page.waitForFunction(() => window.__db.sets.length > 0, null, { timeout: 8000 });
  db = await page.evaluate(() => JSON.parse(JSON.stringify(window.__db)));
  const saved = db.sets[db.sets.length - 1];
  check('계정 저장: 바꾼 뒤 새 형식으로 저장', saved.design.v === 2 && saved.design.units.length === 3 && saved.design.units[2].kind === 'corner' && Array.isArray(saved.design.openings) && saved.sample === false, saved && saved.design && saved.design.units.length);
  await page.click('#tab-list');
  check('파일 저장 버튼', await page.isVisible('#btn-save-file') && await page.isVisible('#btn-save-image'));
  await page.click('#btn-save-file');
  await page.waitForFunction(() => window.__db.saved === 'dressroom-plan.json', null, { timeout: 4000 });
  check('오류 없음 (3)', t.errors.length === 0, t.errors);
  await t.close();

  /* 4. 다른 기기에서 새 형식으로 저장한 것이 더 새것일 때 */
  const newer = { v: 2, room: { w: 3000, d: 2400, h: 2300, wallColor: 'sage' }, openings: [{ id: 'o1', type: 'window', wall: 'N', offset: 500, width: 1000, height: 1100, sill: 950 }],
    blocks: [{ id: 'b1', kind: 'notch', name: '꺾인 벽 1', x: 2600, z: 2100, rot: 0, w: 800, d: 600, h: 2300, full: true }],
    units: [{ id: 'c1', name: '코너장 1', kind: 'corner', x: 500, z: 500, rot: 0, w: 1000, h: 2100, w2: 1000, d: 580, style: 'panel', finish: 'white', door: 'hinge', doorFinish: 'mirror', hinge: 'left', parts: [] }] };
  t = await open({ localStorage: { 'dressroom-planner:v1': oldLocal(oldDesign) }, claude: fakeClaude({ doc: { v: 1, savedAt: 1800000000000, sample: false, design: newer } }) });
  page = t.page;
  await page.waitForFunction(() => __planner.design.units.length === 1 && __planner.design.units[0].kind === 'corner', null, { timeout: 8000 });
  d = await design(page);
  check('계정 쪽이 새것: 계정 설계를 쓴다 (코너장, 창문, 꺾인 벽, 벽 색)', d.room.wallColor === 'sage' && d.openings[0].type === 'window' && d.blocks[0].kind === 'notch' && d.units[0].doorFinish === 'mirror', d);
  await settle(page, 400);
  await page.screenshot({ path: 'shots/61-remote-v2.png' });
  await page.waitForTimeout(1800);
  check('계정 쪽이 새것: 다시 쓰지 않는다', (await page.evaluate(() => window.__db.sets.length)) === 0);
  await t.close();

  /* 5. 보기 전용 */
  t = await open({ claude: fakeClaude({ canWrite: false, doc: { v: 1, savedAt: 1700000000000, sample: false, design: newer } }) });
  page = t.page;
  await page.waitForFunction(() => __planner.ui.readonly === true && __planner.design.units.length === 1, null, { timeout: 8000 });
  check('보기 전용: 안내가 보이고 설계가 뜬다', await page.isVisible('#readonly-notice') && (await page.textContent('#save-state')) === '보기 전용');
  await page.click('#tab-room');
  await page.click('#wall-add [data-add="pillar"]');
  await page.waitForTimeout(1900);
  check('보기 전용: 바꿔도 저장하지 않는다', (await page.evaluate(() => window.__db.sets.length)) === 0 && (await page.evaluate(() => localStorage.getItem('dressroom-planner:v1'))) === null);
  check('오류 없음 (5)', t.errors.length === 0, t.errors);
  await t.close();

  /* 6. 페이지가 새 판으로 바뀔 때 넘겨받는 상태 (이전 형식) */
  t = await open({ claude: fakeClaude({ hot: { design: oldDesign, sample: false, tab: 'layout', prefs: { magnet: true, strength: 'low', autoRotate: false, dims: false, clothes: true } } }) });
  page = t.page;
  d = await design(page);
  ui = await page.evaluate(() => JSON.parse(JSON.stringify(__planner.ui)));
  check('넘겨받은 상태: 이전 형식 설계와 탭, 설정', d.v === 2 && d.units.length === 2 && d.openings[0].wall === 'E' && ui.tab === 'layout' && ui.strength === 'low' && ui.dims === false, { ui, n: d.units.length });
  const snap = await page.evaluate(() => window.__snap());
  check('넘겨줄 상태: 새 형식 설계와 문짝 표시 설정', snap.design.v === 2 && snap.prefs.doors === true && snap.tab === 'layout', snap && snap.prefs);
  await t.close();

  /* 7. 거울: 느린 기기에서는 움직이는 동안 은빛 면, 멈추면 다시 비춘다 */
  t = await open({});
  page = t.page;
  await page.evaluate(() => {
    const P = __planner;
    P.Act.load({ v: 2, room: { w: 3000, d: 2400, h: 2300 }, openings: [], blocks: [], units: [
      { id: 'm1', name: '거울장 1', kind: 'mirror', x: 250, z: 290, rot: 0, w: 500, h: 2100, d: 580, style: 'panel', finish: 'white', door: 'hinge', doorFinish: 'mirror', hinge: 'left', parts: [] },
      { id: 's1', name: '유닛 1', kind: 'std', x: 900, z: 290, rot: 0, w: 800, h: 2100, d: 580, style: 'panel', finish: 'oak', door: 'slide', doorFinish: 'mirror', hinge: 'left', parts: [] },
    ] });
    document.querySelector('#toast').hidden = true;
  });
  await settle(page, 900);
  let mc = await page.evaluate(() => { const P = __planner; for (let i = 0; i < 4; i++) P.Scene.render(); return P.Scene.mirrorCount(); });
  check('거울: 반사 면 2개 (거울장, 미닫이 거울문)', mc.all === 2 && mc.live === 2, mc);
  check('거울: 이 환경(소프트웨어 렌더링)은 느린 기기로 판정된다', mc.slow === true, mc);
  // 화면을 돌리는 동안
  const during = [];
  await drag(page, { x: 300, y: 620 }, { x: 420, y: 600 }, { steps: 8, hold: async () => { during.push(await page.evaluate(() => __planner.Scene.mirrorCount().shown)); } });
  check('거울: 움직이는 동안에는 은빛 면', during[0] === 0, during);
  const back = await page.waitForFunction(() => __planner.Scene.mirrorCount().shown === 2, null, { timeout: 8000 }).then(() => true, () => false);
  check('거울: 멈추면 다시 비춘다', back, await page.evaluate(() => __planner.Scene.mirrorCount()));
  await page.screenshot({ path: 'shots/62-mirrors-live.png' });
  await page.click('#view-seg [data-view="top"]');
  await settle(page, 400);
  mc = await page.evaluate(() => __planner.Scene.mirrorCount());
  check('거울: 평면 보기에서는 은빛 면', mc.shown === 0, mc);
  check('오류 없음 (7)', t.errors.length === 0, t.errors);
  await t.close();

  /* 8. 반사 파일을 받지 못해도 동작한다 */
  t = await open({ noReflector: true });
  page = t.page;
  await page.click('#tab-layout');
  await page.click('#btn-add-mirror');
  mc = await page.evaluate(() => __planner.Scene.mirrorCount());
  check('반사 파일 없음: 거울장은 은빛 면으로 그려진다', mc.all === 1 && mc.live === 0 && (await design(page)).units.some((u) => u.kind === 'mirror'), mc);
  check('반사 파일 없음: 페이지 오류 없음', t.errors.filter((e) => e.indexOf('pageerror') === 0).length === 0, t.errors);
  await settle(page, 300);
  await page.screenshot({ path: 'shots/63-no-reflector.png' });
  await t.close();

  /* 9. 3D 파일을 받지 못하면 안내를 보여 준다 */
  t = await open({ noThree: true });
  await t.page.waitForTimeout(600);
  check('3D 파일 없음: 안내 문구', await t.page.isVisible('#stage-msg') && /불러오지 못했습니다/.test(await t.page.textContent('#stage-msg')));
  await t.close();

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
