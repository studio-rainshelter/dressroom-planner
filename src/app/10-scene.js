  /* ---------- 3D 장면 ---------- */

  const Scene = (() => {
    let renderer, scene, hemi, sun;
    let floorMat, floorTex, wallMat, wallEdge, capMat, rodMat, pickMat, clothMat, zoneMat, arcIn, arcOut;
    let ghostMat, doorGhostMat, doorGhostEdge, glassMat, frameMat, frameEdge, leafMat, leafEdge, winMarkMat, mirrorMat, metalMat;
    let geoBox, geoEdge, geoCyl, geoPlane;
    const matG = new THREE.Group();
    const roomG = new THREE.Group();
    const blocksG = new THREE.Group();
    const unitsG = new THREE.Group();
    const slideG = new THREE.Group();
    const walls = {};
    let topHidden = [];      // 평면 보기에서 숨기는 것: 문·창문 위쪽 벽
    let topOnly = [];        // 평면 보기에서만 보이는 것: 창문 표시
    let openingPicks = [];
    let wallHidden = {};
    const entries = new Map();
    const blockEntries = new Map();
    let slides = [];
    let mirrors = [];
    let reflecting = false;
    let shown = { walls: [], units: [], blocks: [], slides: [] };   // 거울에 비칠 때만 되살릴 것들
    let slow = false;        // 거울까지 그리면 한 장면이 오래 걸리는 기기: 움직이는 동안에는 은빛 면으로 대신한다
    let probe = 0;           // 0보다 크면 그만큼 뒤의 장면에서 걸리는 시간을 잰다
    let lastDraw = 0;
    let calm = 0;
    const probePx = new Uint8Array(4);
    const MAX_MIRRORS = coarse ? 3 : 6;
    const solids = new Map();
    const lineMats = new Map();
    const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    const CLOTH = ['#2f3b4d', '#4b5057', '#b89b73', '#e8e3d7', '#6f7d63', '#8b3a45', '#a8bacf', '#d6d1c9', '#232427', '#c5a5a1', '#7a8794', '#ede9df'].map(lin);
    const HOOK = lin('#9aa0a6');
    const HANGER = lin('#c9b08a');

    function solid(hex, rough, metal) {
      const key = hex + '|' + rough + '|' + metal;
      let m = solids.get(key);
      if (!m) {
        m = new THREE.MeshStandardMaterial({ color: lin(hex), roughness: rough, metalness: metal || 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
        solids.set(key, m);
      }
      return m;
    }
    function lineMat(hex, opacity) {
      const key = hex + '|' + opacity;
      let m = lineMats.get(key);
      if (!m) {
        m = new THREE.LineBasicMaterial({ color: lin(hex), transparent: opacity < 1, opacity });
        lineMats.set(key, m);
      }
      return m;
    }

    function rng(seed) {
      let h = 2166136261;
      for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
      return () => {
        h = (h + 0x6D2B79F5) | 0;
        let t = Math.imul(h ^ (h >>> 15), h | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    function addBox(parent, sx, sy, sz, x, y, z, material, edge, cast) {
      const m = new THREE.Mesh(geoBox, material);
      m.scale.set(Math.max(sx, 0.1), Math.max(sy, 0.1), Math.max(sz, 0.1));
      m.position.set(x, y, z);
      m.castShadow = cast !== false;
      m.receiveShadow = true;
      if (edge) m.add(new THREE.LineSegments(geoEdge, edge));
      parent.add(m);
      return m;
    }
    // 두 꼭짓점으로 상자를 놓는다
    function addSpan(parent, x0, x1, y0, y1, z0, z1, material, edge, cast) {
      return addBox(parent, x1 - x0, y1 - y0, z1 - z0, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, material, edge, cast);
    }
    function addPick(parent, sx, sy, sz, x, y, z, data) {
      const m = new THREE.Mesh(geoBox, pickMat);
      m.scale.set(Math.max(sx, 1), Math.max(sy, 1), Math.max(sz, 1));
      m.position.set(x, y, z);
      m.userData = data;
      parent.add(m);
      return m;
    }

    const FACE = [
      { n: [1, 0, 0], v: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
      { n: [-1, 0, 0], v: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
      { n: [0, 1, 0], v: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
      { n: [0, -1, 0], v: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
      { n: [0, 0, 1], v: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
      { n: [0, 0, -1], v: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
    ];
    // 색이 다른 상자 여러 개를 하나의 지오메트리로 만든다 (걸린 옷).
    function boxesGeometry(list) {
      const n = list.length;
      const pos = new Float32Array(n * 72);
      const nor = new Float32Array(n * 72);
      const col = new Float32Array(n * 72);
      const idx = new (n * 24 > 65535 ? Uint32Array : Uint16Array)(n * 36);
      let pi = 0;
      let ii = 0;
      let vi = 0;
      for (const b of list) {
        const hx = b.sx / 2;
        const hy = b.sy / 2;
        const hz = b.sz / 2;
        for (const f of FACE) {
          for (const v of f.v) {
            pos[pi] = b.x + v[0] * hx; pos[pi + 1] = b.y + v[1] * hy; pos[pi + 2] = b.z + v[2] * hz;
            nor[pi] = f.n[0]; nor[pi + 1] = f.n[1]; nor[pi + 2] = f.n[2];
            col[pi] = b.c.r; col[pi + 1] = b.c.g; col[pi + 2] = b.c.b;
            pi += 3;
          }
          idx[ii++] = vi; idx[ii++] = vi + 1; idx[ii++] = vi + 2;
          idx[ii++] = vi; idx[ii++] = vi + 2; idx[ii++] = vi + 3;
          vi += 4;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      return g;
    }

    function gridGeometry(x0, x1, z0, z1, step, skip) {
      const pts = [];
      for (let x = Math.ceil(x0 / step) * step; x <= x1 + 0.01; x += step) {
        if (skip && Math.abs(x % skip) < 0.01) continue;
        pts.push(x, 0, z0, x, 0, z1);
      }
      for (let z = Math.ceil(z0 / step) * step; z <= z1 + 0.01; z += step) {
        if (skip && Math.abs(z % skip) < 0.01) continue;
        pts.push(x0, 0, z, x1, 0, z);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      return g;
    }

    function makeFloorTexture() {
      const c = document.createElement('canvas');
      c.width = c.height = 512;
      const g = c.getContext('2d');
      const rnd = rng('floor');
      g.fillStyle = '#d9cfbe';
      g.fillRect(0, 0, 512, 512);
      const rows = 8;
      const rh = 512 / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rnd() * 280;
        while (x < 512) {
          const len = 250 + rnd() * 230;
          g.fillStyle = 'hsl(' + (35 + rnd() * 4) + ',' + (23 + rnd() * 6) + '%,' + (79 + rnd() * 3.4) + '%)';
          g.fillRect(x, r * rh, len, rh);
          g.fillStyle = 'rgba(70, 52, 34, .13)';
          g.fillRect(x + len - 1, r * rh, 1, rh);
          x += len;
        }
        g.fillStyle = 'rgba(70, 52, 34, .12)';
        g.fillRect(0, r * rh, 512, 1);
      }
      const t = new THREE.CanvasTexture(c);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return t;
    }

    // 실제 반사를 쓸 수 없는 보기(평면, 정면)에서 거울을 대신하는 은빛 면
    function makeMirrorTexture() {
      const c = document.createElement('canvas');
      c.width = 64; c.height = 256;
      const g = c.getContext('2d');
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, '#e6edf0');
      grad.addColorStop(0.55, '#c3ced3');
      grad.addColorStop(1, '#a9b6bc');
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 256);
      const shine = g.createLinearGradient(0, 40, 64, 130);
      shine.addColorStop(0, 'rgba(255,255,255,0)');
      shine.addColorStop(0.5, 'rgba(255,255,255,.42)');
      shine.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = shine;
      g.fillRect(0, 0, 64, 256);
      const t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      return t;
    }

    function disposeTree(obj) {
      obj.traverse((o) => {
        if (o.userData.dispose) o.userData.dispose();
        else if (o.geometry && o.userData.own) o.geometry.dispose();
      });
    }
    function clearGroup(g) {
      for (let i = g.children.length - 1; i >= 0; i--) {
        const ch = g.children[i];
        g.remove(ch);
        disposeTree(ch);
      }
    }
    const own = (obj) => { obj.userData.own = true; return obj; };

    function init() {
      renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputEncoding = THREE.sRGBEncoding;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000000, 1e6, 2e6);
      hemi = new THREE.HemisphereLight(0xffffff, 0xb9c1bc, 0.84);
      sun = new THREE.DirectionalLight(0xffffff, 0.52);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0006;
      sun.shadow.normalBias = 16;
      scene.add(hemi, sun, sun.target, matG, roomG, blocksG, unitsG, slideG);

      geoBox = new THREE.BoxGeometry(1, 1, 1);
      geoEdge = new THREE.EdgesGeometry(geoBox);
      geoCyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 18);
      geoPlane = new THREE.PlaneGeometry(1, 1);
      pickMat = new THREE.MeshBasicMaterial({ visible: false });
      rodMat = solid('#c6ccd1', 0.38, 0.25);
      metalMat = solid('#b9bfc4', 0.42, 0.3);
      wallMat = solid(WALL_COLOR.white.hex, 0.95, 0);
      wallEdge = lineMat('#a9a59b', 0.55);
      capMat = solid('#6d6961', 0.9, 0);
      frameMat = solid('#e4e0d6', 0.85, 0);
      frameEdge = lineMat('#9c978c', 0.5);
      leafMat = solid('#ece6d9', 0.85, 0);
      leafEdge = lineMat('#8f897c', 0.6);
      clothMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
      ghostMat = new THREE.MeshBasicMaterial({ color: lin('#ffffff'), transparent: true, opacity: 0.1, depthWrite: false });
      doorGhostMat = new THREE.MeshBasicMaterial({ color: lin('#ffffff'), transparent: true, opacity: 0.12, depthWrite: false });
      doorGhostEdge = lineMat('#ffffff', 0.5);
      glassMat = new THREE.MeshStandardMaterial({ color: lin('#bcd9e8'), roughness: 0.2, metalness: 0, transparent: true, opacity: 0.32, depthWrite: false });
      winMarkMat = new THREE.MeshBasicMaterial({ color: lin('#8fbfd8') });
      mirrorMat = new THREE.MeshBasicMaterial({ map: makeMirrorTexture() });
      zoneMat = new THREE.LineDashedMaterial({ color: lin('#5c5348'), dashSize: 60, gapSize: 45, transparent: true, opacity: 0.7 });
      arcIn = lineMat('#5c5348', 0.7);
      arcOut = lineMat('#f1f7f4', 0.6);
      floorTex = makeFloorTexture();
      floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
      applyTheme();
    }

    function applyTheme() {
      const mat = getComputedStyle(document.documentElement).getPropertyValue('--mat').trim() || '#2b6a5c';
      const c = new THREE.Color(mat);
      renderer.setClearColor(c, 1);
      scene.fog.color.copy(c);   // r128은 출력 변환 뒤에 안개를 섞으므로 화면 색 그대로 넣는다
    }

    /* 거울 */

    // 거울에 비칠 모습을 그리는 동안에는, 화면에서 숨겨 둔 벽과 윤곽만 남긴 가구를 원래 모습으로 되돌린다.
    // 거울 속의 다른 거울은 은빛 면으로 그린다 (서로 마주 보면 끝없이 되풀이된다).
    function reveal(on, self) {
      for (const g of shown.walls) g.visible = on;
      for (const e of shown.units) setGhost(e, !on);
      for (const e of shown.blocks) setBlockGhost(e, !on);
      for (const s of shown.slides) s.group.visible = on;
      for (const m of mirrors) {
        if (!m.live) continue;
        m.live.visible = !on;
        m.fake.visible = on && m !== self;
      }
    }

    // 거울 면. 3D 보기에서는 방 안이 실제로 비치고, 평면·정면 보기에서는 은빛 면으로 대신한다.
    function addMirror(owner, parent, w, h, x, y, z, lite) {
      const fake = new THREE.Mesh(geoPlane, mirrorMat);
      fake.scale.set(w, h, 1);
      fake.position.set(x, y, z);
      parent.add(fake);
      const rec = { owner, fake, live: null };
      if (!lite && THREE.Reflector && mirrors.filter((m) => m.live).length < MAX_MIRRORS) {
        const size = coarse ? 512 : 1024;
        const live = new THREE.Reflector(new THREE.PlaneGeometry(w, h), { textureWidth: size, textureHeight: size, color: 0x868c90, clipBias: 0.003 });
        live.getRenderTarget().texture.format = THREE.RGBAFormat;      // 어느 기기에서나 그릴 수 있는 형식
        const draw = live.onBeforeRender;
        live.onBeforeRender = function (r, s, cam) {
          if (reflecting) return;
          reflecting = true;
          reveal(true, rec);
          try { draw.call(this, r, s, cam); } finally { reveal(false, rec); reflecting = false; }
        };
        live.userData.dispose = () => { live.getRenderTarget().dispose(); live.material.dispose(); live.geometry.dispose(); };
        live.position.set(x, y, z + 0.4);
        parent.add(live);
        rec.live = live;
        probe = 3;
      }
      mirrors.push(rec);
    }
    const dropMirrors = (owner) => { mirrors = mirrors.filter((m) => m.owner !== owner); };

    /* 방 */

    function buildMat() {
      clearGroup(matG);
      const w = design.room.w;
      const d = design.room.d;
      const near = 3000;
      const far = 120000;
      matG.add(own(new THREE.LineSegments(gridGeometry(-near, w + near, -near, d + near, 100, 500), lineMat('#ffffff', 0.075))));
      matG.add(own(new THREE.LineSegments(gridGeometry(-far, far, -far, far, 500, 0), lineMat('#ffffff', 0.15))));
      matG.position.y = -1.5;
    }

    // 벽 기준 좌표(벽을 따라간 거리 s, 안쪽으로 들어온 거리 in)로 상자를 놓는다
    function wallBox(g, wall, s0, s1, y0, y1, in0, in1, mat, edge) {
      const r = C.wallRect(design.room, wall, s0, s1, in0, in1);
      return addSpan(g, r.x0, r.x1, y0, y1, r.z0, r.z1, mat, edge, false);
    }
    function floorLine(points, mat, dashed) {
      const arr = [];
      for (let i = 0; i + 1 < points.length; i++) arr.push(points[i].x, 1.3, points[i].z, points[i + 1].x, 1.3, points[i + 1].z);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const ln = own(new THREE.LineSegments(lg, mat));
      if (dashed) ln.computeLineDistances();
      roomG.add(ln);
    }

    function buildDoor(g, wall, o) {
      const room = design.room;
      const T = K.WALL_T;
      const a = o.offset;
      const b = o.offset + o.width;
      const top = Math.min(o.height, room.h);
      const J = 28;      // 문틀 폭
      wallBox(g, wall, a, a + J, 0, top, -T - 3, 3, frameMat, frameEdge);
      wallBox(g, wall, b - J, b, 0, top, -T - 3, 3, frameMat, frameEdge);
      wallBox(g, wall, a + J, b - J, top - J, top, -T - 3, 3, frameMat, frameEdge);
      const lw = o.width - 2 * J;
      if (o.leaf === 'swing') {
        // 직각으로 열어 둔 문짝
        const s0 = o.hinge === 'a' ? a + J : b - J - 36;
        if (o.swing === 'in') wallBox(g, wall, s0, s0 + 36, 8, top - J - 4, 0, lw, leafMat, leafEdge);
        else wallBox(g, wall, s0, s0 + 36, 8, top - J - 4, -T - lw, -T, leafMat, leafEdge);
      } else if (o.leaf === 'slide') {
        // 벽 바깥면을 따라 반쯤 밀어 둔 문짝
        const len = C.wallLen(room, wall);
        let s0 = o.hinge === 'a' ? a - o.width * 0.5 : b - o.width * 0.5;
        s0 = C.clamp(s0, -T, len + T - o.width);
        wallBox(g, wall, s0, s0 + o.width, 8, top - 6, -T - 46, -T - 6, leafMat, leafEdge);
      }
      // 바닥 표시: 비워 둘 영역과 문이 지나가는 호
      const z = C.openingZone(o, room);
      floorLine([{ x: z.x0, z: z.z0 }, { x: z.x1, z: z.z0 }, { x: z.x1, z: z.z1 }, { x: z.x0, z: z.z1 }, { x: z.x0, z: z.z0 }], zoneMat, true);
      if (o.leaf === 'swing') {
        const sc = o.hinge === 'a' ? a : b;
        const ds = o.hinge === 'a' ? 1 : -1;
        const inner = o.swing === 'in';
        const pts = [];
        for (let i = 0; i <= 14; i++) {
          const t = i / 14 * Math.PI / 2;
          pts.push(C.wallPoint(room, wall, sc + ds * o.width * Math.cos(t), inner ? o.width * Math.sin(t) : -T - o.width * Math.sin(t)));
        }
        floorLine(pts, inner ? arcIn : arcOut, false);
      }
    }

    function buildWindow(g, wall, o) {
      const T = K.WALL_T;
      const a = o.offset;
      const b = o.offset + o.width;
      const y0 = o.sill;
      const y1 = Math.min(design.room.h, o.sill + o.height);
      const F = 34;      // 창틀 폭
      const m0 = -T / 2 - 22;
      const m1 = -T / 2 + 22;
      wallBox(g, wall, a, a + F, y0, y1, m0, m1, frameMat, frameEdge);
      wallBox(g, wall, b - F, b, y0, y1, m0, m1, frameMat, frameEdge);
      wallBox(g, wall, a + F, b - F, y0, y0 + F, m0, m1, frameMat, frameEdge);
      wallBox(g, wall, a + F, b - F, y1 - F, y1, m0, m1, frameMat, frameEdge);
      if (o.width > 1000) wallBox(g, wall, (a + b) / 2 - 16, (a + b) / 2 + 16, y0 + F, y1 - F, m0, m1, frameMat, frameEdge);
      const glass = wallBox(g, wall, a + F, b - F, y0 + F, y1 - F, -T / 2 - 3, -T / 2 + 3, glassMat, null);
      glass.receiveShadow = false;
      // 평면 보기에서 창문 자리를 알려 주는 띠
      const mark = wallBox(g, wall, a, b, y0, y0 + 6, -T, 0, winMarkMat, null);
      mark.receiveShadow = false;
      topOnly.push(mark);
    }

    function buildWall(g, wall) {
      const room = design.room;
      const T = K.WALL_T;
      const h = room.h;
      const len = C.wallLen(room, wall);
      const ns = C.WALL_AXIS[wall] === 'x';
      const s0 = ns ? -T : 0;          // 위·아래 벽이 모서리를 채운다
      const s1 = ns ? len + T : len;
      const ops = design.openings.filter((o) => o.wall === wall).map((o) => {
        const y0 = o.type === 'door' ? 0 : o.sill;
        return { o, a: o.offset, b: o.offset + o.width, y0, y1: Math.min(h, y0 + o.height) };
      });
      const cuts = [s0, s1];
      for (const k of ops) cuts.push(C.clamp(k.a, s0, s1), C.clamp(k.b, s0, s1));
      const xs = Array.from(new Set(cuts)).sort((p, q) => p - q);
      // 벽을 따라 구간을 나누고, 구간마다 문·창문을 뺀 높이 범위를 채운다
      const segs = [];
      for (let i = 0; i + 1 < xs.length; i++) {
        const p = xs[i];
        const q = xs[i + 1];
        if (q - p < 0.5) continue;
        const holes = ops.filter((k) => k.a <= p + 0.25 && k.b >= q - 0.25).map((k) => [k.y0, k.y1]);
        const fill = C.complement(holes, 0, h);
        const key = JSON.stringify(fill);
        const last = segs[segs.length - 1];
        if (last && last.key === key) last.q = q;
        else segs.push({ p, q, fill, key, open: holes.length > 0 });
      }
      for (const sg of segs) {
        for (const iv of sg.fill) {
          const m = wallBox(g, wall, sg.p, sg.q, iv[0], iv[1], -T, 0, wallMat, wallEdge);
          if (iv[0] > 0.5) topHidden.push(m);
        }
        // 잘린 면처럼 보이는 윗면 덮개
        const cap = wallBox(g, wall, sg.p, sg.q, h, h + 4, -T, 0, capMat, null);
        if (sg.open) topHidden.push(cap);
      }
      for (const k of ops) {
        if (k.o.type === 'door') buildDoor(g, wall, k.o); else buildWindow(g, wall, k.o);
        // 집는 영역: 벽에 난 자리, 그리고 문은 앞 바닥까지
        const r = C.wallRect(room, wall, k.a, k.b, -T - 30, 30);
        const pm = addPick(roomG, r.x1 - r.x0, k.y1 - k.y0, r.z1 - r.z0, (r.x0 + r.x1) / 2, (k.y0 + k.y1) / 2, (r.z0 + r.z1) / 2, { itemId: k.o.id, wall });
        openingPicks.push(pm);
        if (k.o.type === 'door') {
          const z = C.openingZone(k.o, room);
          openingPicks.push(addPick(roomG, z.x1 - z.x0, 6, z.z1 - z.z0, (z.x0 + z.x1) / 2, 3, (z.z0 + z.z1) / 2, { itemId: k.o.id, floor: true }));
        }
      }
    }

    function buildBlock(b) {
      const g = new THREE.Group();
      const h = C.blockH(b, design.room);
      const body = addBox(g, b.w, h, b.d, 0, h / 2, 0, wallMat, wallEdge, true);
      const cap = b.full ? addBox(g, b.w, 4, b.d, 0, h + 2, 0, capMat, null, false) : null;
      const pick = addPick(g, b.w, h, b.d, 0, h / 2, 0, { itemId: b.id, block: true });
      g.position.set(b.x, 0, b.z);
      return { group: g, body, cap, pick, ghost: false };
    }
    function setBlockGhost(e, on) {
      if (e.ghost === on) return;
      e.ghost = on;
      e.body.material = on ? ghostMat : wallMat;
      e.body.castShadow = !on;
      if (e.cap) e.cap.visible = !on;
    }

    function buildRoom() {
      clearGroup(roomG);
      clearGroup(blocksG);
      blockEntries.clear();
      topHidden = [];
      topOnly = [];
      openingPicks = [];
      const room = design.room;
      const w = room.w;
      const d = room.d;
      const h = room.h;
      wallMat = solid((WALL_COLOR[room.wallColor] || WALL_COLOR.white).hex, 0.95, 0);

      floorTex.repeat.set(w / 960, d / 960);
      const floor = own(new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat));
      floor.rotation.x = -Math.PI / 2;
      floor.position.set(w / 2, 0, d / 2);
      floor.receiveShadow = true;
      roomG.add(floor);
      const g1 = own(new THREE.LineSegments(gridGeometry(0, w, 0, d, 100, 500), lineMat('#4a3a28', 0.07)));
      const g2 = own(new THREE.LineSegments(gridGeometry(0, w, 0, d, 500, 0), lineMat('#4a3a28', 0.16)));
      g1.position.y = 0.6; g2.position.y = 0.6;
      roomG.add(g1, g2);

      for (const wall of C.WALLS) {
        const g = new THREE.Group();
        buildWall(g, wall);
        walls[wall] = g;
        roomG.add(g);
      }
      for (const b of design.blocks) {
        const e = buildBlock(b);
        blockEntries.set(b.id, e);
        blocksG.add(e.group);
      }

      const cx = w / 2;
      const cz = d / 2;
      const R = Math.hypot(w, d, h);
      sun.position.set(cx - R * 0.32, h + R * 0.95, cz + R * 0.7);
      sun.target.position.set(cx, h * 0.3, cz);
      const sc = sun.shadow.camera;
      sc.left = -R * 0.8; sc.right = R * 0.8; sc.top = R * 0.8; sc.bottom = -R * 0.8;
      sc.near = 100; sc.far = R * 3.6;
      sc.updateProjectionMatrix();
    }

    /* 유닛 */

    // 행거봉에 걸린 옷. 봉 가운데를 원점으로 x 방향으로 늘어선다. skipAt 근처(봉이 갈라지는 자리)는 비운다.
    function buildClothes(seed, clear, usable, depth, skipAt) {
      const rnd = rng(seed);
      const yc = K.ROD_SLAB / 2;
      const n = Math.floor(usable / 44);
      const list = [];
      let longest = 0;
      if (n < 1 || depth < 120) return null;
      for (let i = 0; i < n; i++) {
        const skip = rnd() < 0.14;
        const jitter = (rnd() - 0.5) * 8;
        const pickLen = rnd();
        const varLen = rnd();
        const th = 16 + rnd() * 18;
        const dp = depth * (0.86 + rnd() * 0.14);
        const col = CLOTH[Math.floor(rnd() * CLOTH.length)];
        if (skip) continue;
        let len;
        if (clear >= 1350) len = pickLen < 0.55 ? 1000 + varLen * 220 : 680 + varLen * 140;
        else if (clear >= 900) len = 640 + varLen * 170;
        else if (clear >= 560) len = 400 + varLen * 110;
        else len = clear - 110;
        len = Math.min(len, clear - 70);
        if (len < 80) continue;
        const x = -usable / 2 + (i + 0.5) * (usable / n) + jitter;
        if (skipAt != null && Math.abs(x - skipAt) < 44) continue;
        list.push({ x, y: yc - 24, z: 0, sx: 3, sy: 34, sz: 3, c: HOOK });
        list.push({ x, y: yc - 45, z: 0, sx: 7, sy: 9, sz: dp * 0.96, c: HANGER });
        list.push({ x, y: yc - 50 - len / 2, z: 0, sx: th, sy: len, sz: dp, c: col });
        longest = Math.max(longest, len);
      }
      if (!list.length) return null;
      const m = own(new THREE.Mesh(boxesGeometry(list), clothMat));
      m.castShadow = true;
      m.receiveShadow = true;
      return { mesh: m, drop: 50 + longest, depth };
    }

    function addRod(pg, len, x, y, z, alongZ) {
      const rod = new THREE.Mesh(geoCyl, rodMat);
      if (alongZ) rod.rotation.x = Math.PI / 2; else rod.rotation.z = Math.PI / 2;
      rod.scale.set(K.ROD_D, len, K.ROD_D);
      rod.position.set(x, y, z);
      rod.castShadow = true;
      rod.receiveShadow = true;
      pg.add(rod);
    }

    // 얇은 부품도 잡기 쉽게 위아래 빈 공간의 절반까지 넓힌 높이 범위 (이웃 부품과는 겹치지 않는다)
    function pickBand(u, p) {
      const gap = C.partGaps(u, p);
      const ph = C.partH(p, u);
      const up = Math.max(0, Math.min(26, gap.above / 2));
      const dn = Math.max(0, Math.min(26, gap.below / 2));
      return { sy: ph + up + dn, cy: (ph + up - dn) / 2 };
    }

    /* 스피드랙: 기둥(ㄱ자 앵글)에 받침을 걸고 그 안에 합판을 놓는다. 일반 유닛은 기둥 네 개, 코너장은 ㄱ자 윤곽의 꼭짓점 여섯 곳. */

    function rackLook(u) {
      const k = RACK_FINISH[u.finish] || RACK_FINISH.white;
      return { frame: solid(k.frame, 0.5, 0.25), board: solid(k.board, 0.9, 0), edge: lineMat(k.edge, 0.55), boardEdge: lineMat(k.boardEdge, 0.5) };
    }
    const RACK_BEAM = K.RACK_BEAM;      // 받침의 폭
    // 사각형 한 칸: 앞뒤와 양옆의 받침, 그 안의 합판. list를 주면 틀로 다루도록 담는다.
    function addRackRect(parent, x0, x1, z0, z1, y, look, list) {
      const B = RACK_BEAM;
      const y1 = y + K.RACK_T;
      const put = (m) => { if (list) list.push(m); };
      put(addSpan(parent, x0, x1, y, y1, z1 - B, z1, look.frame, look.edge));
      put(addSpan(parent, x0, x1, y, y1, z0, z0 + B, look.frame, look.edge));
      put(addSpan(parent, x0, x0 + B, y, y1, z0 + B, z1 - B, look.frame, null));
      put(addSpan(parent, x1 - B, x1, y, y1, z0 + B, z1 - B, look.frame, null));
      put(addSpan(parent, x0 + B - 4, x1 - B + 4, y1 - 3 - K.RACK_BOARD, y1 - 3, z0 + B - 4, z1 - B + 4, look.board, look.boardEdge));
    }
    // 선반 한 단. 코너장은 날개마다 한 칸씩 ㄱ자로 놓는다.
    function addRackLevel(parent, u, y, look, list) {
      const G = K.RACK_GAP;
      if (u.kind === 'corner') {
        const c = C.cornerGeo(u);
        addRackRect(parent, c.X0 + G, c.X1 - G, c.Z0 + G, c.Z0 + c.DA - G, y, look, list);
        addRackRect(parent, c.X0 + G, c.X0 + c.DB - G, c.Z0 + c.DA - G, c.Z1 - G, y, look, list);
        return;
      }
      addRackRect(parent, -u.w / 2 + G, u.w / 2 - G, -u.d / 2 + G, u.d / 2 - G, y, look, list);
    }
    // 기둥 하나: (x, z)는 바깥 모서리, sx·sz는 두 날개가 뻗는 쪽 (옆면을 덮는 날개와 앞·뒷면을 덮는 날개)
    function addRackPost(g, frame, look, h, x, z, sx, sz) {
      const P = K.RACK_POST;
      const t = 3;
      frame.push(addSpan(g, Math.min(x, x + sx * t), Math.max(x, x + sx * t), 0, h, Math.min(z, z + sz * P), Math.max(z, z + sz * P), look.frame, look.edge));
      frame.push(addSpan(g, Math.min(x, x + sx * P), Math.max(x, x + sx * P), 0, h, Math.min(z, z + sz * t), Math.max(z, z + sz * t), look.frame, look.edge));
    }
    function buildRackFrame(u, g, frame, look) {
      if (u.kind === 'corner') {
        const c = C.cornerGeo(u);
        const P = K.RACK_POST;
        const t = 3;
        const xi = c.X0 + c.DB;
        const zi = c.Z0 + c.DA;
        addRackPost(g, frame, look, u.h, c.X0, c.Z0, 1, 1);
        addRackPost(g, frame, look, u.h, c.X1, c.Z0, -1, 1);
        addRackPost(g, frame, look, u.h, c.X1, zi, -1, -1);
        addRackPost(g, frame, look, u.h, xi, c.Z1, -1, -1);
        addRackPost(g, frame, look, u.h, c.X0, c.Z1, 1, -1);
        // 안쪽 모서리의 기둥은 두 날개의 앞면을 따라 날개가 뻗는다
        frame.push(addSpan(g, xi, xi + P, 0, u.h, zi - t, zi, look.frame, look.edge));
        frame.push(addSpan(g, xi - t, xi, 0, u.h, zi, zi + P, look.frame, look.edge));
      } else {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) addRackPost(g, frame, look, u.h, sx * u.w / 2, sz * u.d / 2, -sx, -sz);
      }
      // 맨 아래 단과 맨 위 단은 틀에 속한다 (기본 2단)
      addRackLevel(g, u, K.RACK_BASE, look, frame);
      addRackLevel(g, u, u.h - K.RACK_T, look, frame);
    }
    function buildRackPart(u, p) {
      const pg = new THREE.Group();
      pg.position.y = p.y;
      const it = C.interior(u);
      const look = rackLook(u);
      const picks = [];
      const tag = { unitId: u.id, partId: p.id };
      const G = K.RACK_GAP;
      const B = RACK_BEAM;
      const yc = K.ROD_SLAB / 2;
      const c = u.kind === 'corner' ? C.cornerGeo(u) : null;
      if (p.type === 'shelf') {
        addRackLevel(pg, u, 0, look, null);
      } else if (p.type === 'rod' && c) {
        // 코너장: 날개마다 행거봉 세트를 따로 건다
        const la = c.rodA[1] - c.rodA[0];
        const lb = c.rodB[1] - c.rodB[0];
        const midA = (c.rodA[0] + c.rodA[1]) / 2;
        const midB = (c.rodB[0] + c.rodB[1]) / 2;
        for (const x of [c.X0 + G, c.X1 - G - B]) addSpan(pg, x, x + B, 0, K.ROD_SLAB, c.Z0 + G, c.Z0 + c.DA - G, look.frame, look.edge);
        for (const z of [c.Z0 + c.DA - G, c.Z1 - G - B]) addSpan(pg, c.X0 + G, c.X0 + c.DB - G, 0, K.ROD_SLAB, z, z + B, look.frame, look.edge);
        addRod(pg, la, midA, yc, c.zMidA, false);
        addRod(pg, lb, c.xMidB, yc, midB, true);
        if (ui.clothes) {
          const clear = C.hangClear(u, p);
          const ca = buildClothes(p.id, clear, la - 30, Math.min(440, c.DA + 40), null);
          if (ca) {
            ca.mesh.position.set(midA, 0, c.zMidA);
            pg.add(ca.mesh);
            picks.push(addPick(pg, la - 20, ca.drop, ca.depth, midA, yc - ca.drop / 2, c.zMidA, tag));
          }
          const cb = lb > 90 ? buildClothes(p.id + 'b', clear, lb - 30, Math.min(440, c.DB + 40), null) : null;
          if (cb) {
            cb.mesh.rotation.y = -Math.PI / 2;
            cb.mesh.position.set(c.xMidB, 0, midB);
            pg.add(cb.mesh);
            picks.push(addPick(pg, cb.depth, cb.drop, lb - 20, c.xMidB, yc - cb.drop / 2, midB, tag));
          }
        }
      } else if (p.type === 'rod') {
        // 행거봉 세트: 양옆의 행거받침에 봉이 걸린다
        const xi = u.w / 2 - G;
        for (const s of [-1, 1]) addSpan(pg, Math.min(s * xi, s * (xi - B)), Math.max(s * xi, s * (xi - B)), 0, K.ROD_SLAB, -u.d / 2 + G, u.d / 2 - G, look.frame, look.edge);
        addRod(pg, 2 * (xi - B), 0, yc, 0, false);
        if (ui.clothes) {
          // 앞뒤가 트여 있어 옷이 틀보다 조금 나올 수 있다
          const cl = buildClothes(p.id, C.hangClear(u, p), it.w - 2 * B - 30, Math.min(440, u.d + 40), null);
          if (cl) {
            pg.add(cl.mesh);
            picks.push(addPick(pg, it.w - 2 * B - 20, cl.drop, cl.depth, 0, yc - cl.drop / 2, 0, tag));
          }
        }
      } else {
        // 서랍장: 앞 기둥 사이에 들어간다. 양옆의 틀과 단마다 앞판.
        const ph = C.partH(p, u);
        const fw = u.w - 2 * K.RACK_POST - 8;
        const dd = u.d - 2 * G - 16;
        const zFront = u.d / 2 - G - K.T / 2;
        const zBody = zFront - K.T / 2 - (dd - K.T) / 2;
        const handle = solid(u.finish === 'walnut' || u.finish === 'black' ? '#2c2e31' : '#55595d', 0.5, 0.2);
        for (const s of [-1, 1]) addBox(pg, 10, ph, dd, s * (fw / 2 + 9), ph / 2, u.d / 2 - G - dd / 2, look.frame, look.edge);
        for (let i = 0; i < p.n; i++) {
          const y0 = i * p.eh;
          addBox(pg, fw, p.eh - 4, K.T, 0, y0 + p.eh / 2, zFront, look.board, look.boardEdge);
          addBox(pg, fw - 26, Math.max(20, p.eh - 36), dd - K.T, 0, y0 + p.eh / 2 - 6, zBody, look.board, null);
          addBox(pg, Math.min(150, fw * 0.36), 7, 12, 0, y0 + p.eh - 30, zFront + K.T / 2 + 6, handle, null);
        }
      }
      const band = pickBand(u, p);
      if (c) {
        picks.push(addPick(pg, u.w, band.sy, c.DA, 0, band.cy, c.Z0 + c.DA / 2, tag));
        picks.push(addPick(pg, c.DB, band.sy, c.frontB, c.X0 + c.DB / 2, band.cy, (c.Z0 + c.DA + c.Z1) / 2, tag));
      } else {
        picks.push(addPick(pg, it.w, band.sy, u.d, 0, band.cy, 0, tag));
      }
      return { group: pg, picks };
    }

    function buildPart(u, p) {
      const pg = new THREE.Group();
      pg.position.y = p.y;
      const it = C.interior(u);
      const fin = FINISH[u.finish];
      const panel = u.style !== 'pole';
      const body = solid(fin.body, 0.9, 0);
      const inner = solid(fin.back, 0.95, 0);
      const edge = lineMat(fin.edge, 0.6);
      const post = solid(fin.post, 0.55, 0.2);
      const iw = it.w;
      const d = u.d;
      const ph = C.partH(p, u);
      const zBack = -d / 2 + (panel ? K.BACK_T : 0);
      const zMid = (zBack + d / 2) / 2;
      const picks = [];
      const tag = { unitId: u.id, partId: p.id };

      if (p.type === 'shelf') {
        const sd = C.shelfDepth(u);
        const zc = zBack + sd / 2;
        addBox(pg, iw - 1, K.SHELF_T, sd, 0, K.SHELF_T / 2, zc, body, edge);
        if (!panel) {
          for (const s of [-1, 1]) addBox(pg, 5, 34, sd * 0.78, s * (iw / 2 - 2.5), -17, -d / 2 + 40 + sd * 0.39, post, null);
        }
      } else if (p.type === 'rod') {
        const yc = K.ROD_SLAB / 2;
        addRod(pg, iw - 8, 0, yc, zMid, false);
        for (const s of [-1, 1]) {
          addBox(pg, 5, 40, 40, s * (iw / 2 - 2.5), yc, zMid, rodMat, null);
          if (!panel) {
            const z0 = -d / 2 + 50;
            addBox(pg, 8, 12, zMid - z0 + 20, s * (iw / 2 - 4), yc + 18, (zMid + 20 + z0) / 2, post, null);
          }
        }
        if (ui.clothes) {
          const cl = buildClothes(p.id, C.hangClear(u, p), iw - 50, Math.min(440, it.d - 60), null);
          if (cl) {
            cl.mesh.position.z = zMid;
            pg.add(cl.mesh);
            // 걸린 옷을 잡아도 행거봉이 움직이도록
            picks.push(addPick(pg, iw - 40, cl.drop, cl.depth, 0, yc - cl.drop / 2, zMid, tag));
          }
        }
      } else {
        const dd = it.d - 30;
        const fw = panel ? iw - 4 : iw - 2 * K.T - 4;
        const zFront = d / 2 - 2 - K.T / 2;
        const zBody = d / 2 - 2 - K.T - (dd - K.T) / 2;
        if (!panel) {
          for (const s of [-1, 1]) addBox(pg, K.T, ph, dd, s * (iw / 2 - K.T / 2), ph / 2, d / 2 - 2 - dd / 2, body, edge);
        }
        const handle = solid(u.finish === 'black' || u.finish === 'walnut' ? '#c6ccd1' : '#55595d', 0.5, 0.2);
        for (let i = 0; i < p.n; i++) {
          const y0 = i * p.eh;
          addBox(pg, fw, p.eh - 4, K.T, 0, y0 + p.eh / 2, zFront, body, edge);
          addBox(pg, fw - 26, Math.max(20, p.eh - 36), dd - K.T, 0, y0 + p.eh / 2 - 6, zBody, inner, null);
          addBox(pg, Math.min(150, fw * 0.36), 7, 12, 0, y0 + p.eh - 30, d / 2 + 4, handle, null);
        }
      }
      const band = pickBand(u, p);
      picks.push(addPick(pg, iw, band.sy, d, 0, band.cy, 0, tag));
      return { group: pg, picks };
    }

    // 코너장의 부품: 선반과 행거봉이 두 날개를 따라 ㄱ자로 이어진다
    function buildCornerPart(u, p) {
      const pg = new THREE.Group();
      pg.position.y = p.y;
      const c = C.cornerGeo(u);
      const it = C.interior(u);
      const fin = FINISH[u.finish];
      const body = solid(fin.body, 0.9, 0);
      const edge = lineMat(fin.edge, 0.6);
      const B = K.BACK_T;
      const picks = [];
      const tag = { unitId: u.id, partId: p.id };

      if (p.type === 'shelf') {
        addSpan(pg, c.X0 + B, c.X0 + B + c.la - 1, 0, K.SHELF_T, c.Z0 + B, c.Z0 + B + c.sdA, body, edge);
        addSpan(pg, c.X0 + B, c.X0 + B + c.sdB, 0, K.SHELF_T, c.Z0 + B + c.sdA, c.Z0 + B + c.sdA + c.lb - 1, body, edge);
      } else {
        const yc = K.ROD_SLAB / 2;
        const la = c.rodA[1] - c.rodA[0];
        const lb = c.rodB[1] - c.rodB[0];
        const midA = (c.rodA[0] + c.rodA[1]) / 2;
        addRod(pg, la, midA, yc, c.zMidA, false);
        addRod(pg, lb, c.xMidB, yc, (c.rodB[0] + c.rodB[1]) / 2, true);
        addBox(pg, 5, 40, 40, c.rodA[0] - 1.5, yc, c.zMidA, rodMat, null);
        addBox(pg, 5, 40, 40, c.rodA[1] + 1.5, yc, c.zMidA, rodMat, null);
        addBox(pg, 40, 40, 5, c.xMidB, yc, c.rodB[1] + 1.5, rodMat, null);
        addBox(pg, 34, 34, 34, c.xMidB, yc, c.zMidA, rodMat, null);      // 봉이 갈라지는 이음쇠
        if (ui.clothes) {
          const clear = C.hangClear(u, p);
          // 두 부분의 깊이가 다르면 걸린 옷의 폭도 따로 맞춘다
          const ca = buildClothes(p.id, clear, la - 42, Math.min(440, it.d - 60), c.xMidB - midA);
          if (ca) {
            ca.mesh.position.set(midA, 0, c.zMidA);
            pg.add(ca.mesh);
            picks.push(addPick(pg, la - 40, ca.drop, ca.depth, midA, yc - ca.drop / 2, c.zMidA, tag));
          }
          // 날개 B의 옷은 날개 A 앞에서 시작한다
          const b0 = c.Z0 + c.DA + 24;
          const b1 = c.rodB[1] - 20;
          const cb = b1 - b0 > 60 ? buildClothes(p.id + 'b', clear, b1 - b0, Math.min(440, it.d2 - 60), null) : null;
          if (cb) {
            cb.mesh.rotation.y = -Math.PI / 2;
            cb.mesh.position.set(c.xMidB, 0, (b0 + b1) / 2);
            pg.add(cb.mesh);
            picks.push(addPick(pg, cb.depth, cb.drop, b1 - b0, c.xMidB, yc - cb.drop / 2, (b0 + b1) / 2, tag));
          }
        }
      }
      const band = pickBand(u, p);
      picks.push(addPick(pg, u.w, band.sy, c.DA, 0, band.cy, c.Z0 + c.DA / 2, tag));
      picks.push(addPick(pg, c.DB, band.sy, c.frontB, c.X0 + c.DB / 2, band.cy, (c.Z0 + c.DA + c.Z1) / 2, tag));
      return { group: pg, picks };
    }

    // 문짝의 재질. 반투명으로 그릴 때는 윤곽만 남긴다.
    function doorLook(u, ghost) {
      const fin = C.doorFinishOf(u);
      const base = FINISH[fin === 'mirror' ? u.finish : fin];
      return {
        mirror: fin === 'mirror',
        mat: ghost ? doorGhostMat : solid(base.body, 0.9, 0),
        edge: ghost ? doorGhostEdge : lineMat(base.edge, 0.6),
        handle: solid(fin === 'black' || fin === 'walnut' ? '#c6ccd1' : '#55595d', 0.5, 0.2),
      };
    }
    function addLeaf(dg, look, ghost, sx, sy, sz, x, y, z) {
      const m = addBox(dg, sx, sy, sz, x, y, z, look.mat, look.edge, !ghost);
      if (ghost) m.receiveShadow = false;
      return m;
    }
    // 손잡이의 길이와 높이: 손이 닿는 높이(1050)에 두되, 문 높이를 줄였으면 문짝 안에 들어오게 한다
    function handleAt(hi) {
      const len = Math.min(150, Math.max(30, hi.height - 40));
      const yc = hi.y0 + hi.height / 2;
      return { len, y: C.clamp(Math.min(1050, yc), hi.y0 + len / 2 + 20, Math.max(hi.y0 + len / 2 + 20, hi.y0 + hi.height - len / 2 - 20)) };
    }

    // 여닫이문 (닫힌 모습). 폭 600 이하는 한 짝, 넘으면 두 짝.
    function buildHinged(u, g, ghost) {
      const dg = new THREE.Group();
      const hi = C.hingeInfo(u);
      const look = doorLook(u, ghost);
      const yc = hi.y0 + hi.height / 2;
      const zc = u.d / 2 + 2 + K.DOOR_T / 2;
      const hd = handleAt(hi);
      let x = -u.w / 2 + 2;
      hi.widths.forEach((lw, i) => {
        const cx = x + lw / 2;
        addLeaf(dg, look, ghost, lw, hi.height, K.DOOR_T, cx, yc, zc);
        if (!ghost) {
          if (look.mirror) addMirror(u.id, dg, lw - 22, hi.height - 22, cx, yc, zc + K.DOOR_T / 2 + 0.5, false);
          // 손잡이는 경첩 반대쪽 가장자리에
          const free = hi.leaves === 1 ? (u.hinge === 'left' ? 1 : -1) : (i === 0 ? 1 : -1);
          addBox(dg, 10, hd.len, 14, cx + free * (lw / 2 - 26), hd.y, zc + K.DOOR_T / 2 + 7, look.handle, null);
        }
        x += lw + 3;
      });
      g.add(dg);
      return dg;
    }

    // 코너장의 접이문 (닫힌 모습): 두 짝이 안쪽 모서리에서 직각으로 만난다
    function buildCornerDoor(u, g, ghost) {
      const dg = new THREE.Group();
      const c = C.cornerGeo(u);
      const hi = C.hingeInfo(u);
      const look = doorLook(u, ghost);
      const T = K.DOOR_T;
      const yc = hi.y0 + hi.height / 2;
      const hd = handleAt(hi);
      const za = c.Z0 + c.DA + 2 + T / 2;         // 날개 A 앞
      const xb = c.X0 + c.DB + 2 + T / 2;         // 날개 B 앞
      const xa = c.X1 - hi.widths[0] / 2;
      const zb = c.Z0 + c.DA + hi.widths[1] / 2;
      addLeaf(dg, look, ghost, hi.widths[0], hi.height, T, xa, yc, za);
      addLeaf(dg, look, ghost, T, hi.height, hi.widths[1], xb, yc, zb);
      if (!ghost) {
        if (look.mirror) {
          addMirror(u.id, dg, hi.widths[0] - 22, hi.height - 22, xa, yc, za + T / 2 + 0.5, false);
          // 날개 B 쪽 거울은 +x를 향한다
          const holder = new THREE.Group();
          holder.rotation.y = Math.PI / 2;
          holder.position.set(xb + T / 2 + 0.5, yc, zb);
          dg.add(holder);
          addMirror(u.id, holder, hi.widths[1] - 22, hi.height - 22, 0, 0, 0, false);
        }
        // 손잡이는 경첩 반대쪽 끝에: 경첩이 왼쪽(옆벽 쪽 끝)이면 날개 A 끝, 오른쪽이면 날개 B 끝
        if (u.hinge === 'right') addBox(dg, 14, hd.len, 10, xb + T / 2 + 7, hd.y, c.Z0 + c.DA + hi.widths[1] - 26, look.handle, null);
        else addBox(dg, 10, hd.len, 14, c.X1 - 26, hd.y, za + T / 2 + 7, look.handle, null);
      }
      g.add(dg);
      return dg;
    }

    function buildCornerFrame(u, g, frame, body, back, edge) {
      const c = C.cornerGeo(u);
      const T = K.T;
      const B = K.BACK_T;
      const h = u.h;
      const put = (x0, x1, y0, y1, z0, z1, mat, ed) => frame.push(addSpan(g, x0, x1, y0, y1, z0, z1, mat, ed));
      put(c.X0, c.X1 - T, K.BASE, h, c.Z0, c.Z0 + B, back, null);                 // 뒷판 A
      put(c.X0, c.X0 + B, K.BASE, h, c.Z0 + B, c.Z1 - T, back, null);             // 뒷판 B
      // 날개 A는 깊이 DA, 날개 B는 깊이 DB
      put(c.X1 - T, c.X1, 0, h, c.Z0, c.Z0 + c.DA, body, edge);                   // 끝판 A
      put(c.X0, c.X0 + c.DB, 0, h, c.Z1 - T, c.Z1, body, edge);                   // 끝판 B
      for (const y of [h - T, K.BASE]) {                                           // 상판과 하판 (ㄱ자)
        put(c.X0 + B, c.X1 - T, y, y + T, c.Z0 + B, c.Z0 + c.DA, body, edge);
        put(c.X0 + B, c.X0 + c.DB, y, y + T, c.Z0 + c.DA, c.Z1 - T, body, edge);
      }
      put(c.X0 + c.DB - 40, c.X1 - T, 0, K.BASE, c.Z0 + c.DA - 40 - T, c.Z0 + c.DA - 40, body, edge);    // 걸레받이 A
      put(c.X0 + c.DB - 40 - T, c.X0 + c.DB - 40, 0, K.BASE, c.Z0 + c.DA - 40, c.Z1 - T, body, edge);    // 걸레받이 B
    }

    function buildUnit(u) {
      const g = new THREE.Group();
      const fin = FINISH[u.finish];
      const body = solid(fin.body, 0.9, 0);
      const back = solid(fin.back, 0.95, 0);
      const edge = lineMat(fin.edge, 0.6);
      const w = u.w;
      const h = u.h;
      const d = u.d;
      const T = K.T;
      const frame = [];
      const picks = [];
      const corner = u.kind === 'corner';
      const rack = C.isRack(u);
      if (rack) {
        buildRackFrame(u, g, frame, rackLook(u));
      } else if (corner) {
        buildCornerFrame(u, g, frame, body, back, edge);
      } else if (u.style !== 'pole') {
        const iw = w - 2 * T;
        const dz = d - K.BACK_T;
        const zc = K.BACK_T / 2;
        frame.push(addBox(g, T, h, d, -w / 2 + T / 2, h / 2, 0, body, edge));
        frame.push(addBox(g, T, h, d, w / 2 - T / 2, h / 2, 0, body, edge));
        frame.push(addBox(g, iw, T, dz, 0, h - T / 2, zc, body, edge));
        frame.push(addBox(g, iw, T, dz, 0, K.BASE + T / 2, zc, body, edge));
        frame.push(addBox(g, iw, h - K.BASE, K.BACK_T, 0, K.BASE + (h - K.BASE) / 2, -d / 2 + K.BACK_T / 2, back, null));
        frame.push(addBox(g, iw, K.BASE, T, 0, K.BASE / 2, d / 2 - 40 - T / 2, body, edge));
      } else {
        const P = K.POST;
        const post = solid(fin.post, 0.55, 0.2);
        const pz = -d / 2 + P / 2 + 20;
        for (const s of [-1, 1]) {
          frame.push(addBox(g, P, h, P, s * (w / 2 - P / 2), h / 2, pz, post, edge));
          frame.push(addBox(g, 70, 6, 70, s * (w / 2 - P / 2), 3, pz, post, null));
        }
        frame.push(addBox(g, w - 2 * P, 20, 20, 0, h - 10, pz, post, edge));
      }
      for (const m of frame) m.userData.base = m.material;
      const parts = new Map();
      for (const p of u.parts) {
        const pe = rack ? buildRackPart(u, p) : corner ? buildCornerPart(u, p) : buildPart(u, p);
        g.add(pe.group);
        parts.set(p.id, pe);
      }
      let doorG = null;
      if (C.doorKind(u) === 'hinge') doorG = corner ? buildCornerDoor(u, g, !doorsSolid()) : buildHinged(u, g, !doorsSolid());
      if (corner) {
        const c = C.cornerGeo(u);
        picks.push(addPick(g, w, h, c.DA, 0, h / 2, c.Z0 + c.DA / 2, { unitId: u.id }));
        picks.push(addPick(g, c.DB, h, c.frontB, c.X0 + c.DB / 2, h / 2, (c.Z0 + c.DA + c.Z1) / 2, { unitId: u.id }));
      } else {
        picks.push(addPick(g, w, h, d, 0, h / 2, 0, { unitId: u.id }));
      }
      g.position.set(u.x, 0, u.z);
      g.rotation.y = u.rot * Math.PI / 180;
      return { group: g, picks, parts, frame, doorG, ghost: false };
    }

    // 숨긴 벽을 등진 유닛은 윤곽만 남겨 방 안이 보이게 한다.
    function setGhost(e, on) {
      if (e.ghost === on) return;
      e.ghost = on;
      for (const m of e.frame) { m.material = on ? ghostMat : m.userData.base; m.castShadow = !on; }
      e.parts.forEach((pe) => { pe.group.visible = !on; });
      if (e.doorG) e.doorG.visible = !on;
    }

    // 카메라가 유닛의 등 뒤에 있고, 유닛이 그쪽 벽이나 벽체에 붙어 있는지
    function behind(b, dir, p, blockBoxes) {
      const back = dir === '-z' ? p.z < b.z0 : dir === '+z' ? p.z > b.z1 : dir === '-x' ? p.x < b.x0 : p.x > b.x1;
      return back && C.gapInDir(b, dir, blockBoxes, design.room).gap < 60;
    }
    function hiddenFromBehind(u, p, blockBoxes) {
      const b = C.box(u);
      if (behind(b, C.OPP[C.FRONT[u.rot]], p, blockBoxes)) return true;
      return u.kind === 'corner' && behind(b, C.OPP[C.RIGHT[u.rot]], p, blockBoxes);
    }

    /* 미닫이문: 한 줄로 묶인 유닛들 앞에 문짝을 나눠 단다 */

    function rebuildSlide(lite) {
      clearGroup(slideG);
      dropMirrors('slide');
      slides = [];
      const ghost = !doorsSolid();
      for (const r of C.slideRuns(design)) {
        const g = new THREE.Group();
        const mid = (r.a0 + r.a1) / 2;
        if (r.rot % 180 === 0) g.position.set(mid, 0, r.front); else g.position.set(r.front, 0, mid);
        g.rotation.y = r.rot * Math.PI / 180;
        const look = doorLook(r.units[0], ghost);
        const railMat = ghost ? doorGhostMat : metalMat;
        const ph = r.ph;
        const yc = r.y0 + ph / 2;
        const zFlat = 56 + 9;          // 거울 문은 한 평면에 놓고 문틀만 앞에 세운다
        // 위아래 레일: 문 높이를 줄였으면 문짝의 위아래 끝을 따라간다
        addBox(g, r.w, 14, K.SLIDE_RAIL - 4, 0, r.y1 + 7, K.SLIDE_RAIL / 2, railMat, null, !ghost);
        addBox(g, r.w, 8, K.SLIDE_RAIL - 4, 0, r.y0 - 6, K.SLIDE_RAIL / 2, railMat, null, !ghost);
        for (let i = 0; i < r.n; i++) {
          const x = -r.w / 2 + i * (r.pw - K.SLIDE_OV) + r.pw / 2;
          const z = look.mirror && !ghost ? zFlat - 9 : (i % 2 === 0 ? 26 : 56);
          addLeaf(g, look, ghost, r.pw - 4, ph, 14, x, yc, z);
          if (!ghost) {
            // 세로 문틀 (손잡이를 겸한다)
            const zs = look.mirror ? zFlat - 8 : z;
            for (const s of [-1, 1]) addBox(g, 20, ph, 22, x + s * (r.pw / 2 - 10), yc, zs, metalMat, null);
          }
        }
        if (look.mirror && !ghost) addMirror('slide', g, r.w - 6, ph - 8, 0, yc, zFlat - 1.5, lite);
        slideG.add(g);
        slides.push({ group: g, ids: r.ids, rot: r.rot });
      }
    }
    const hasSlide = () => design.units.some((u) => C.doorKind(u) === 'slide');

    function unitVisible(u) { return ui.view !== 'front' || C.facesWall(u, ui.frontRot); }

    function dropUnit(id) {
      const e = entries.get(id);
      if (!e) return;
      unitsG.remove(e.group);
      disposeTree(e.group);
      dropMirrors(id);
      entries.delete(id);
    }
    function rebuildUnit(u, keepSlide) {
      dropUnit(u.id);
      const e = buildUnit(u);
      e.group.visible = unitVisible(u);
      entries.set(u.id, e);
      unitsG.add(e.group);
      if (!keepSlide) rebuildSlide(false);
    }
    function rebuildUnits() {
      for (const id of Array.from(entries.keys())) dropUnit(id);
      mirrors = [];
      for (const u of design.units) rebuildUnit(u, true);
      rebuildSlide(false);
    }
    function rebuildAll() {
      buildMat();
      buildRoom();
      rebuildUnits();
      requestRender();
    }
    function rebuildRoom() {
      buildMat();
      buildRoom();
      requestRender();
    }
    // 위치만 옮긴다. 미닫이문 줄은 유닛 위치에 따라 달라지므로 다시 짠다 (lite: 끄는 동안에는 거울을 은빛 면으로).
    function placeUnit(u, lite) {
      const e = entries.get(u.id);
      if (!e) return;
      e.group.position.set(u.x, 0, u.z);
      e.group.rotation.y = u.rot * Math.PI / 180;
      if (slides.length || hasSlide()) rebuildSlide(!!lite);
    }
    // 벽을 끌어 좌표가 함께 밀릴 때: 모든 유닛의 위치를 다시 맞춘다
    function placeAll() {
      for (const u of design.units) {
        const e = entries.get(u.id);
        if (!e) continue;
        e.group.position.set(u.x, 0, u.z);
        e.group.rotation.y = u.rot * Math.PI / 180;
      }
      if (slides.length || hasSlide()) rebuildSlide(true);
    }
    function placePart(u, p) {
      const e = entries.get(u.id);
      const pe = e && e.parts.get(p.id);
      if (pe) pe.group.position.y = p.y;
    }
    function placeBlock(b) {
      const e = blockEntries.get(b.id);
      if (e) e.group.position.set(b.x, 0, b.z);
    }
    function setVisibility() {
      for (const u of design.units) {
        const e = entries.get(u.id);
        if (e) e.group.visible = unitVisible(u);
      }
    }
    function resize(w, h) {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(w, h, false);
    }

    // still: 움직이는 중이 아닌 것으로 보고 그린다 (이미지로 저장할 때)
    function render(still) {
      const cam = Rig.camera();
      const p = cam.position;
      const room = design.room;
      const top = ui.view === 'top';
      const three = ui.view === '3d';
      for (const m of topHidden) m.visible = !top;
      for (const m of topOnly) m.visible = top;
      // 카메라와 방 사이에 놓인 벽은 숨긴다
      const hidden = {};
      if (ui.view === 'front') hidden[{ 0: 'S', 90: 'E', 180: 'N', 270: 'W' }[ui.frontRot]] = true;
      else if (three) { hidden.N = p.z <= 0; hidden.S = p.z >= room.d; hidden.W = p.x <= 0; hidden.E = p.x >= room.w; }
      for (const k of C.WALLS) if (walls[k]) walls[k].visible = !hidden[k];
      wallHidden = hidden;

      shown = { walls: [], units: [], blocks: [], slides: [] };
      for (const k of C.WALLS) if (hidden[k] && walls[k]) shown.walls.push(walls[k]);
      const blockBoxes = design.blocks.map((b) => C.box(b));
      for (const u of design.units) {
        const e = entries.get(u.id);
        if (!e) continue;
        setGhost(e, three && u.id !== ui.selUnit && hiddenFromBehind(u, p, blockBoxes));
        if (e.ghost) shown.units.push(e);
      }
      design.blocks.forEach((b, i) => {
        const e = blockEntries.get(b.id);
        if (!e) return;
        const bx = blockBoxes[i];
        const touch = { N: bx.z0 < 1, S: bx.z1 > room.d - 1, W: bx.x0 < 1, E: bx.x1 > room.w - 1 };
        // 정면 보기에서는 보고 있는 벽에 붙은 벽체만 보인다
        e.group.visible = ui.view !== 'front' || !!touch[ROT_WALL[ui.frontRot]];
        setBlockGhost(e, three && b.id !== ui.selItem && C.WALLS.some((k) => hidden[k] && touch[k]));
        if (e.ghost) shown.blocks.push(e);
      });
      for (const s of slides) {
        const ghost = s.ids.some((id) => { const e = entries.get(id); return e && e.ghost; });
        s.group.visible = (ui.view !== 'front' || s.rot === ui.frontRot) && !ghost;
        if (ghost) shown.slides.push(s);
      }
      // 거울: 3D 보기에서만 실제로 비춘다. 느린 기기에서는 화면이 움직이는 동안 은빛 면으로 바꿨다가 멈추면 다시 비춘다.
      const now = performance.now();
      const moving = !still && now - lastDraw < 200;
      lastDraw = now;
      const hasLive = three && mirrors.some((m) => m.live);
      const liveNow = hasLive && !(slow && moving);
      for (const m of mirrors) {
        if (!m.live) continue;
        m.live.visible = liveNow;
        m.fake.visible = !liveNow;
      }
      // 평면 보기에서는 그림자가 배치를 가리므로 끈다
      const shade = !top;
      if (sun.castShadow !== shade) sun.castShadow = shade;
      const measure = liveNow && probe > 0 && --probe === 0;
      const t0 = measure ? performance.now() : 0;
      renderer.render(scene, cam);
      if (measure) {
        // 그리기가 끝날 때까지 기다려 실제로 걸린 시간을 잰다
        const gl = renderer.getContext();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, probePx);
        slow = performance.now() - t0 > 34;
      }
      if (hasLive && slow && moving) {
        clearTimeout(calm);
        calm = setTimeout(requestRender, 260);
      }
    }

    // 지금 화면에서 집을 수 있는 문·창문 영역: 숨긴 벽에 난 자리는 뺀다 (바닥 표시는 늘 집을 수 있다)
    function openingTargets() {
      return openingPicks.filter((m) => m.userData.floor || ui.view === 'top' || !wallHidden[m.userData.wall]);
    }

    return {
      init, applyTheme, rebuildAll, rebuildRoom, rebuildUnit, rebuildUnits, placeUnit, placeAll, placePart, placeBlock, setVisibility, resize, render,
      entries, blockEntries, openingTargets,
      refreshDoors: () => { rebuildSlide(false); requestRender(); },
      wallShown: (wall) => !wallHidden[wall],
      updateWorld: () => scene.updateMatrixWorld(),
      setFog: (near, far) => { scene.fog.near = near; scene.fog.far = far; },
      pixelRatio: () => renderer.getPixelRatio(),
      removeUnit: (id) => { dropUnit(id); rebuildSlide(false); },
      mirrorCount: () => ({ all: mirrors.length, live: mirrors.filter((m) => m.live).length, shown: mirrors.filter((m) => m.live && m.live.visible).length, slow }),
      // 점검용: 그려진 문짝이 차지하는 높이 범위 (여닫이문은 유닛마다, 미닫이문은 레일까지 포함해 줄마다)
      doorBounds: () => {
        scene.updateMatrixWorld();
        const span = (g) => { const b = new THREE.Box3().setFromObject(g); return [Math.round(b.min.y), Math.round(b.max.y)]; };
        const out = { hinged: {}, slides: slides.map((k) => ({ ids: k.ids, y: span(k.group) })) };
        entries.forEach((e, id) => { if (e.doorG) out.hinged[id] = span(e.doorG); });
        return out;
      },
    };
  })();

