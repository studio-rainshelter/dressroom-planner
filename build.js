// 소스 조각을 한 페이지로 묶는다
//   public/index.html, robots.txt, sitemap.xml  웹사이트용 (Cloudflare에 올리는 파일, 설정은 site.config.json)
//   dist/dressroom-planner.html Claude 아티팩트 게시용
//   dist/preview.html           브라우저 점검용 (아티팩트와 같은 틀)
const fs = require('fs');
const path = require('path');

const root = __dirname;
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const css = read('src/style.css').trimEnd();
const body = read('src/body.html').trimEnd();
const core = read('src/core.js').trimEnd();
const appDir = path.join(root, 'src/app');
const app = fs.readdirSync(appDir).filter((f) => f.endsWith('.js')).sort()
  .map((f) => fs.readFileSync(path.join(appDir, f), 'utf8').trimEnd()).join('\n\n');

for (const [name, src] of [['core', core], ['app', app]]) {
  if (/<\/script/i.test(src)) throw new Error(name + ': 스크립트 안에 닫는 태그가 들어 있습니다.');
}

const head = [
  '<title>드레스룸 3D 플래너</title>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+KR:wght@400;500;600&family=Orbit&display=swap">',
  '<style>',
  css,
  '</style>',
].join('\n');
const rest = [
  body,
  '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
  '<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/objects/Reflector.js"></script>',
  '<script>',
  core,
  '</script>',
  '<script>',
  app,
  '</script>',
  '',
].join('\n');
const page = head + '\n' + rest;

// 게시될 때 플랫폼이 씌우는 틀과 같은 모양
const skeleton = '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
  + '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
  + 'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}'
  + 'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>\n';

// 웹사이트용 머리말: 검색 결과와 공유 미리보기에 쓰이는 정보는 site.config.json에서 읽는다
const cfg = JSON.parse(read('site.config.json'));
const url = cfg.url.endsWith('/') ? cfg.url : cfg.url + '/';
const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const meta = (attr, key, value) => (value ? '<meta ' + attr + '="' + key + '" content="' + esc(value) + '">\n' : '');
const jsonLd = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: '드레스룸 3D 플래너',
  url,
  description: cfg.description,
  applicationCategory: 'DesignApplication',
  operatingSystem: 'Web',
  inLanguage: 'ko',
  image: url + 'og-image.jpg',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
}).replace(/</g, '\\u003c');
const site = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  + '<title>' + esc(cfg.title) + '</title>\n'
  + meta('name', 'description', cfg.description)
  + '<link rel="canonical" href="' + esc(url) + '">\n'
  + meta('name', 'google-site-verification', cfg.googleVerification)
  + meta('name', 'naver-site-verification', cfg.naverVerification)
  + meta('property', 'og:type', 'website')
  + meta('property', 'og:site_name', '드레스룸 3D 플래너')
  + meta('property', 'og:locale', 'ko_KR')
  + meta('property', 'og:url', url)
  + meta('property', 'og:title', cfg.title)
  + meta('property', 'og:description', cfg.description)
  + meta('property', 'og:image', url + 'og-image.jpg')
  + meta('property', 'og:image:width', '1200')
  + meta('property', 'og:image:height', '630')
  + meta('property', 'og:image:alt', '드레스룸 3D 플래너로 배치한 드레스룸 3D 화면')
  + meta('name', 'twitter:card', 'summary_large_image')
  + meta('name', 'twitter:title', cfg.title)
  + meta('name', 'twitter:description', cfg.description)
  + meta('name', 'twitter:image', url + 'og-image.jpg')
  + '<meta name="theme-color" content="#2b6a5c">\n'
  + '<link rel="icon" href="favicon.svg" type="image/svg+xml">\n'
  + '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
  + '<script type="application/ld+json">' + jsonLd + '</script>\n'
  + '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
  + 'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}'
  + 'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style>\n';
// 스크립트를 실행하지 않는 검색 로봇과 브라우저에 보여 줄 소개
const noscript = '<noscript><main style="max-width:640px;margin:40px auto;padding:0 20px;font:16px/1.7 sans-serif">'
  + '<h1>드레스룸 3D 플래너</h1><p>' + esc(cfg.description) + '</p>'
  + '<ol><li>방: 가로·세로·천장 높이를 mm 단위로 넣고 문·창문·기둥을 놓습니다.</li>'
  + '<li>배치: 행거 유닛·코너장·거울장을 끌어다 놓으면 자석 앵커가 벽과 옆 유닛에 붙여 줍니다. 판넬형·기둥형·스피드랙 형태와 여닫이문·미닫이문을 고를 수 있습니다.</li>'
  + '<li>내부: 행거봉·선반·서랍을 넣고 높이를 맞춥니다.</li>'
  + '<li>목록: 확인할 점과 부품 목록을 봅니다.</li></ol>'
  + '<p>이 플래너는 자바스크립트와 WebGL이 켜진 브라우저에서 동작합니다.</p></main></noscript>\n';
const pageHead = head.replace('<title>드레스룸 3D 플래너</title>\n', '');

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/index.html'), site + pageHead + '\n</head>\n<body>\n' + noscript + rest + '</body>\n</html>\n');
fs.writeFileSync(path.join(root, 'public/robots.txt'), 'User-agent: *\nAllow: /\n\nSitemap: ' + url + 'sitemap.xml\n');
const today = new Date().toISOString().slice(0, 10);
fs.writeFileSync(path.join(root, 'public/sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n'
  + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
  + '  <url><loc>' + esc(url) + '</loc><lastmod>' + today + '</lastmod></url>\n'
  + '</urlset>\n');

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/dressroom-planner.html'), page);
fs.writeFileSync(path.join(root, 'dist/preview.html'), skeleton + page + '\n</body></html>\n');
fs.writeFileSync(path.join(root, 'dist/app.js'), app + '\n');
console.log('built: ' + (page.length / 1024).toFixed(1) + ' KB');
