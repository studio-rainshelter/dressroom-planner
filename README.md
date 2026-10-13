# 드레스룸 3D 플래너

방 크기를 넣고 행거·서랍·선반을 mm 단위로 배치해 보는 웹 앱입니다. 3D·평면·정면 보기, 자석 앵커, 코너장·거울장·스피드랙, 여닫이문·미닫이문, 부품 목록을 지원합니다.

## 폴더 구성

| 경로 | 내용 |
|---|---|
| `src/` | 앱 소스 (`core.js` 계산, `app/` 화면 동작, `body.html`, `style.css`) |
| `build.js` | 소스를 한 페이지로 묶는 스크립트 |
| `public/` | 웹사이트로 올리는 파일 (`index.html`은 빌드 결과물) |
| `test/` | 점검 스크립트 |
| `wrangler.jsonc` | Cloudflare 배포 설정 |
| `site.config.json` | 사이트 주소, 검색 결과 제목·설명, 검색 서비스 소유 확인 값 |

## 수정 후 반영하기

1. `src/`의 파일을 고칩니다.
2. `npm run build`로 `public/index.html`을 다시 만듭니다.
3. `public/index.html`을 함께 커밋하고 `main`에 푸시합니다. Cloudflare가 푸시를 받아 자동으로 배포합니다.

## 점검

```bash
npm install
npm test                                   # 계산 점검
npm install --no-save playwright
npx playwright install chromium
npm run test:browser                       # 브라우저 점검 (화면은 shots/에 저장)
node test/monkey.js 7 70 wild              # 무작위 조작 점검 (시드, 횟수, wild)
```

## Cloudflare 배포 설정 (처음 한 번)

1. Cloudflare 대시보드에서 새 Worker 만들기를 열고 **Connect GitHub**(GitHub 연결)를 선택합니다. 메뉴 위치는 대시보드 버전에 따라 **Workers & Pages** 또는 오른쪽 위 **Add → Workers**입니다.
2. GitHub에 Cloudflare 앱 설치를 허용하고 `studio-rainshelter/dressroom-planner` 저장소를 고릅니다.
3. 설정값을 다음과 같이 넣고 **Deploy**를 누릅니다.
   - 프로젝트 이름: `dressroom-planner` (`wrangler.jsonc`의 `name`과 같아야 합니다)
   - Build command: 비워 둠
   - Deploy command: `npx wrangler deploy`
   - (선택) Advanced settings의 변수 `SKIP_DEPENDENCY_INSTALL` = `true`: 배포에 필요 없는 점검용 패키지 설치를 건너뜁니다
4. 배포가 끝나면 `https://dressroom-planner.<계정 하위 도메인>.workers.dev` 주소로 열립니다. 개인 도메인은 해당 Worker의 설정에서 연결할 수 있습니다.

## 검색 노출

`npm run build`가 `site.config.json`을 읽어 검색 결과 제목·설명, 공유 미리보기(`og-image.jpg`), `robots.txt`, `sitemap.xml`을 만듭니다.

1. **Google Search Console**(search.google.com/search-console)에 URL 접두어 `https://dressroom-planner.rainshelter.net/`로 사이트를 추가합니다.
2. **네이버 서치어드바이저**(searchadvisor.naver.com)의 웹마스터 도구에 같은 주소를 추가합니다.
3. 소유 확인 방법으로 HTML 태그를 고르고, 태그의 `content` 값만 `site.config.json`의 `googleVerification`, `naverVerification`에 넣습니다.
4. `npm run build` 후 커밋·푸시하고, 배포가 끝나면 각 사이트에서 소유 확인을 누릅니다.
5. 두 곳 모두 사이트맵 메뉴에 `sitemap.xml`을 제출합니다.

## 저장 방식

- 웹사이트에서는 설계가 그 기기의 브라우저에 자동 저장됩니다.
- 다른 기기로 옮길 때는 **목록 탭 → 설계 파일 저장**으로 받은 파일을 열거나, 설계 코드를 복사해 붙여 넣습니다.
