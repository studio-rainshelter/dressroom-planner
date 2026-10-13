// 웹사이트용 페이지(public/index.html) 점검: Claude 밖에서 열었을 때 저장과 파일 내려받기가 동작하는지
const { open, settle, design } = require('./harness');
const results = [];
const check = (name, ok, info) => { results.push({ name, ok: !!ok, info }); console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  ' + JSON.stringify(info))); };

(async () => {
  const t = await open({ width: 1280, height: 800, file: 'public/index.html' });
  const page = t.page;
  check('페이지가 뜬다', await page.evaluate(() => !!window.__planner && !window.claude));
  check('문서 언어가 한국어', await page.evaluate(() => document.documentElement.lang === 'ko'));
  check('제목', (await page.title()).startsWith('드레스룸 3D 플래너'), await page.title());
  const seo = await page.evaluate(() => {
    const m = (sel) => { const e = document.querySelector(sel); return e ? e.getAttribute('content') || e.getAttribute('href') : null; };
    let ld = null;
    try { ld = JSON.parse(document.querySelector('script[type="application/ld+json"]').textContent); } catch (e) { ld = null; }
    return { titles: document.querySelectorAll('title').length, desc: m('meta[name="description"]'), canon: m('link[rel="canonical"]'), ogImage: m('meta[property="og:image"]'), ogTitle: m('meta[property="og:title"]'), ld };
  });
  const cfg = require('../site.config.json');
  check('제목 태그는 하나', seo.titles === 1, seo.titles);
  check('검색 설명', seo.desc === cfg.description, seo.desc);
  check('대표 주소', seo.canon === cfg.url, seo.canon);
  check('공유 이미지 주소', seo.ogImage === cfg.url + 'og-image.jpg' && !!seo.ogTitle, seo.ogImage);
  check('구조화 데이터', seo.ld && seo.ld['@type'] === 'WebApplication' && seo.ld.url === cfg.url, seo.ld);
  const fsx = require('fs');
  const pub = require('path').join(__dirname, '..', 'public');
  check('robots.txt에 사이트맵 주소', fsx.readFileSync(pub + '/robots.txt', 'utf8').includes('Sitemap: ' + cfg.url + 'sitemap.xml'));
  check('sitemap.xml에 사이트 주소', fsx.readFileSync(pub + '/sitemap.xml', 'utf8').includes('<loc>' + cfg.url + '</loc>'));
  check('공유 이미지 파일', fsx.statSync(pub + '/og-image.jpg').size > 10000);

  // 방 크기를 바꾸면 이 기기에 저장된다
  await page.click('#tab-room');
  await page.fill('#room-w', '3100');
  await page.press('#room-w', 'Enter');
  await settle(page, 1500);
  const saved = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('dressroom-planner:v1')); } catch (e) { return null; } });
  check('이 기기에 저장된다', saved && saved.design && saved.design.room.w === 3100, saved && saved.design && saved.design.room);

  // 목록 탭의 파일 저장 버튼이 보이고, 누르면 파일을 내려받는다
  await page.click('#tab-list');
  await settle(page);
  check('파일 저장 버튼이 보인다', await page.isVisible('#btn-save-file') && await page.isVisible('#btn-save-image'));
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#btn-save-file')]);
  check('설계 파일 이름', dl.suggestedFilename() === 'dressroom-plan.json', dl.suggestedFilename());
  const body = JSON.parse(require('fs').readFileSync(await dl.path(), 'utf8'));
  check('설계 파일 내용', body.app === 'dressroom-3d-planner' && body.design.room.w === 3100);
  const [img] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }), page.click('#btn-save-image')]);
  check('이미지 파일 이름', img.suggestedFilename() === 'dressroom-plan.png', img.suggestedFilename());
  const png = require('fs').readFileSync(await img.path());
  check('이미지가 PNG', png.length > 1000 && png.slice(1, 4).toString() === 'PNG', png.length);

  // 새로 고쳐도 남아 있다
  await page.reload();
  await page.waitForFunction(() => !!window.__planner);
  check('새로 고친 뒤에도 남아 있다', (await design(page)).room.w === 3100);
  check('오류 없음', t.errors.length === 0 && t.blocked.length === 0, { errors: t.errors, blocked: t.blocked });
  await t.close();

  const failed = results.filter((r) => !r.ok);
  console.log('\n' + (results.length - failed.length) + '/' + results.length + ' passed');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
