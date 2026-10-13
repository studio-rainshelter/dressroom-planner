// 브라우저 점검용 도구: 게시될 페이지와 같은 틀(dist/preview.html)을 띄우고, 외부 주소는 로컬 파일로 돌려준다.
const fs = require('fs');
const path = require('path');
// PLAYWRIGHT_PATH: 설치된 playwright 위치가 다를 때 지정한다
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
// 점검 중 찍는 화면은 shots 폴더에 저장한다
fs.mkdirSync(path.join(process.cwd(), 'shots'), { recursive: true });

const root = path.join(__dirname, '..');
const nm = path.join(root, 'node_modules');
const ORIGIN = 'https://planner.test';

function fontCss() {
  const pick = [
    ['@fontsource/ibm-plex-mono', ['400', '500']],
    ['@fontsource/ibm-plex-sans-kr', ['400', '500', '600']],
    ['@fontsource/orbit', ['400']],
  ];
  let css = '';
  for (const [pkg, weights] of pick) {
    for (const w of weights) {
      const file = path.join(nm, pkg, w + '.css');
      css += fs.readFileSync(file, 'utf8').replace(/url\(\.\/files\//g, 'url(https://fonts.gstatic.com/local/' + pkg + '/files/');
    }
  }
  return css;
}

/**
 * opts: { width, height, dark, coarse, localStorage: {key: value}, claude: 문자열(페이지 안에서 실행해 window.claude를 만드는 코드),
 *         noReflector, noThree, query, file: 띄울 페이지 (기본 dist/preview.html) }
 */
async function open(opts) {
  opts = opts || {};
  const browser = await chromium.launch({
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
  });
  const context = await browser.newContext({
    viewport: { width: opts.width || 1280, height: opts.height || 800 },
    deviceScaleFactor: opts.dpr || 1,
    colorScheme: opts.dark ? 'dark' : 'light',
    hasTouch: !!opts.coarse,
    isMobile: !!opts.coarse,
    locale: 'ko-KR',
  });
  const page = await context.newPage();
  const errors = [];
  const blocked = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

  const css = fontCss();
  await context.route('**/*', async (route) => {
    const url = route.request().url();
    if (url === ORIGIN + '/favicon.svg') {
      return route.fulfill({ status: 200, contentType: 'image/svg+xml', body: fs.readFileSync(path.join(root, 'public/favicon.svg')) });
    }
    if (url.startsWith(ORIGIN)) {
      return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(root, opts.file || 'dist/preview.html')) });
    }
    if (url === 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js') {
      if (opts.noThree) return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(nm, 'three/build/three.min.js')) });
    }
    if (url === 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/objects/Reflector.js') {
      if (opts.noReflector) return route.abort();
      return route.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(path.join(nm, 'three/examples/js/objects/Reflector.js')) });
    }
    if (url.startsWith('https://fonts.googleapis.com/css2')) {
      return route.fulfill({ status: 200, contentType: 'text/css; charset=utf-8', body: css });
    }
    if (url.startsWith('https://fonts.gstatic.com/local/')) {
      const file = path.join(nm, url.slice('https://fonts.gstatic.com/local/'.length));
      if (fs.existsSync(file)) return route.fulfill({ status: 200, contentType: 'font/woff2', body: fs.readFileSync(file) });
      return route.abort();
    }
    if (url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    blocked.push(url);
    return route.abort();
  });

  if (opts.localStorage) {
    await page.addInitScript((data) => {
      // 처음 열 때만 넣는다 (새로 고친 뒤에는 페이지가 저장한 내용이 남아 있어야 한다)
      try {
        if (window.sessionStorage.getItem('__seeded')) return;
        window.sessionStorage.setItem('__seeded', '1');
        for (const k of Object.keys(data)) window.localStorage.setItem(k, data[k]);
      } catch (e) { /* 저장소를 쓸 수 없는 경우 */ }
    }, opts.localStorage);
  }
  if (opts.claude) await page.addInitScript(opts.claude);

  await page.goto(ORIGIN + '/' + (opts.query || ''));
  if (!opts.noThree) {
    await page.waitForFunction(() => !!window.__planner, null, { timeout: 20000 });
    await settle(page);
  }
  return { browser, context, page, errors, blocked, close: () => browser.close() };
}

// 화면이 다시 그려질 때까지 기다린다
async function settle(page, ms) {
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  if (ms) await page.waitForTimeout(ms);
}

// 방 좌표(mm)를 화면 좌표로
async function screenOf(page, x, y, z) {
  return page.evaluate(([px, py, pz]) => {
    const P = window.__planner;
    const cam = P.Rig.camera();
    cam.updateMatrixWorld();
    const v = new window.THREE.Vector3(px, py, pz).project(cam);
    const r = document.getElementById('gl').getBoundingClientRect();
    return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height, depth: v.z };
  }, [x, y, z]);
}

async function drag(page, from, to, opts) {
  opts = opts || {};
  const steps = opts.steps || 12;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down({ button: opts.button || 'left' });
  if (opts.alt) await page.keyboard.down('Alt');
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(from.x + (to.x - from.x) * i / steps, from.y + (to.y - from.y) * i / steps);
    if (opts.eachStep) await opts.eachStep(i);
  }
  if (opts.hold) await opts.hold();
  if (opts.alt) await page.keyboard.up('Alt');
  await page.mouse.up({ button: opts.button || 'left' });
  await settle(page);
}

const design = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.__planner.design)));

module.exports = { open, settle, screenOf, drag, design, root, ORIGIN };
