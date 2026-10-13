// 소스 조각을 한 페이지로 묶는다
//   public/index.html          웹사이트용 (Cloudflare에 올리는 파일)
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

// 웹사이트용 머리말
const site = '<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  + '<meta name="description" content="방 크기를 넣고 행거·서랍·선반을 mm 단위로 배치해 보는 드레스룸 3D 플래너">\n'
  + '<meta name="theme-color" content="#2b6a5c">\n'
  + '<link rel="icon" href="favicon.svg" type="image/svg+xml">\n'
  + '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
  + 'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}'
  + 'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style>\n';

fs.mkdirSync(path.join(root, 'public'), { recursive: true });
fs.writeFileSync(path.join(root, 'public/index.html'), site + head + '\n</head>\n<body>\n' + rest + '</body>\n</html>\n');
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
fs.writeFileSync(path.join(root, 'dist/dressroom-planner.html'), page);
fs.writeFileSync(path.join(root, 'dist/preview.html'), skeleton + page + '\n</body></html>\n');
fs.writeFileSync(path.join(root, 'dist/app.js'), app + '\n');
console.log('built: ' + (page.length / 1024).toFixed(1) + ' KB');
