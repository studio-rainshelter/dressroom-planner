  /* ---------- 치수와 안내선 (2D 캔버스) ---------- */

  const Overlay = (() => {
    const cv = $('#overlay');
    const ctx = cv.getContext('2d');
    let W = 1;
    let H = 1;
    let dpr = 1;
    let cam = null;
    const col = {};
    let fontNum = '500 11.5px monospace';
    let fontTxt = '500 11.5px sans-serif';
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const chips = [];
    const asked = {};
    const P = (x, y, z) => new THREE.Vector3(x, y, z);
    // 유닛 기준 좌표 → 방 좌표
    const UL = (u, lx, ly, lz) => { const w = C.localToWorld(u, lx, lz); return new THREE.Vector3(w.x, ly, w.z); };
    // 벽 기준 좌표(벽을 따라간 거리 s, 방 안쪽으로 들어온 거리 inward) → 방 좌표
    const WP = (wall, s, inward, y) => { const p = C.wallPoint(design.room, wall, s, inward); return new THREE.Vector3(p.x, y || 0, p.z); };

    function readTheme() {
      const cs = getComputedStyle(document.documentElement);
      for (const k of ['ink', 'ink-2', 'on-ink', 'sheet', 'rule', 'pick', 'on-pick', 'magnet', 'on-magnet', 'warn', 'warn-soft', 'bad', 'bad-soft']) col[k] = cs.getPropertyValue('--' + k).trim();
      fontNum = '500 11.5px ' + (cs.getPropertyValue('--font-data').trim() || 'monospace');
      fontTxt = '500 11.5px ' + (cs.getPropertyValue('--font-body').trim() || 'sans-serif');
    }

    function resize(w, h, ratio) {
      W = w; H = h; dpr = ratio;
      cv.width = Math.round(w * ratio);
      cv.height = Math.round(h * ratio);
    }

    function clipSeg(p, q) {
      a.copy(p).applyMatrix4(cam.matrixWorldInverse);
      b.copy(q).applyMatrix4(cam.matrixWorldInverse);
      const zn = -(cam.near + 0.5);
      if (a.z > zn && b.z > zn) return null;
      if (a.z > zn) a.lerp(b, (a.z - zn) / (a.z - b.z));
      else if (b.z > zn) b.lerp(a, (b.z - zn) / (b.z - a.z));
      a.applyMatrix4(cam.projectionMatrix);
      b.applyMatrix4(cam.projectionMatrix);
      return [(a.x + 1) / 2 * W, (1 - a.y) / 2 * H, (b.x + 1) / 2 * W, (1 - b.y) / 2 * H];
    }
    function point(p) {
      a.copy(p).applyMatrix4(cam.matrixWorldInverse);
      if (a.z > -(cam.near + 0.5)) return null;
      a.applyMatrix4(cam.projectionMatrix);
      return [(a.x + 1) / 2 * W, (1 - a.y) / 2 * H];
    }

    // 여러 선분을 바탕색 테두리와 함께 그린다.
    function strokeSegs(segs, color, width, dash) {
      if (!segs.length) return;
      const trace = () => {
        ctx.beginPath();
        for (const s of segs) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
      };
      ctx.lineCap = 'round';
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.72;
      ctx.strokeStyle = col.sheet;
      ctx.lineWidth = width + 2.4;
      trace(); ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash(dash || []);
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      trace(); ctx.stroke();
      ctx.setLineDash([]);
    }
    function lines3(pairs, color, width, dash) {
      const segs = [];
      for (const pr of pairs) { const s = clipSeg(pr[0], pr[1]); if (s) segs.push(s); }
      strokeSegs(segs, color, width, dash);
      return segs;
    }

    // 바닥 윤곽(유닛 기준 좌표의 꼭짓점들)을 높이 y0~y1의 기둥 모양 선으로
    function prism(u, poly, y0, y1) {
      const pairs = [];
      const n = poly.length;
      for (let i = 0; i < n; i++) {
        const p = poly[i];
        const q = poly[(i + 1) % n];
        pairs.push([UL(u, p[0], y0, p[1]), UL(u, q[0], y0, q[1])]);
        pairs.push([UL(u, p[0], y1, p[1]), UL(u, q[0], y1, q[1])]);
        pairs.push([UL(u, p[0], y0, p[1]), UL(u, p[0], y1, p[1])]);
      }
      return pairs;
    }
    const unitPairs = (u) => prism(u, C.footprint(u), 0, u.h);
    function partPairs(u, p) {
      const y1 = p.y + C.partH(p, u);
      if (u.kind === 'corner') return prism(u, C.footprint(u), p.y, y1);
      const hw = C.interior(u).w / 2;
      const hd = u.d / 2;
      return prism(u, [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], p.y, y1);
    }
    function blockPairs(k) {
      const hw = k.w / 2;
      const hd = k.d / 2;
      return prism(k, [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]], 0, C.blockH(k, design.room));
    }
    const openingY = (o) => { const y0 = o.type === 'door' ? 0 : o.sill; return [y0, Math.min(design.room.h, y0 + o.height)]; };
    function openingPairs(o) {
      const y = openingY(o);
      const s0 = o.offset;
      const s1 = o.offset + o.width;
      const T = K.WALL_T;
      const pairs = [];
      for (const inw of [0, -T]) {
        pairs.push([WP(o.wall, s0, inw, y[0]), WP(o.wall, s1, inw, y[0])], [WP(o.wall, s0, inw, y[1]), WP(o.wall, s1, inw, y[1])]);
        pairs.push([WP(o.wall, s0, inw, y[0]), WP(o.wall, s0, inw, y[1])], [WP(o.wall, s1, inw, y[0]), WP(o.wall, s1, inw, y[1])]);
      }
      for (const s of [s0, s1]) for (const yy of y) pairs.push([WP(o.wall, s, 0, yy), WP(o.wall, s, -T, yy)]);
      return pairs;
    }

    function textWidth(text) {
      ctx.font = /[^\x00-\x7f]/.test(text) ? fontTxt : fontNum;
      return ctx.measureText(text).width;
    }
    function dim(p, q, text, kind) {
      const s = clipSeg(p, q);
      if (!s) return;
      const dx = s[2] - s[0];
      const dy = s[3] - s[1];
      const len = Math.hypot(dx, dy);
      if (len < 3) return;
      const nx = -dy / len;
      const ny = dx / len;
      const t = 4;
      const color = kind === 'pick' ? col.pick : kind === 'warn' ? col.warn : col.ink;
      strokeSegs([s, [s[0] - nx * t, s[1] - ny * t, s[0] + nx * t, s[1] + ny * t], [s[2] - nx * t, s[3] - ny * t, s[2] + nx * t, s[3] + ny * t]], color, 1.2);
      let cx = (s[0] + s[2]) / 2;
      let cy = (s[1] + s[3]) / 2;
      if (len < textWidth(text) + 22) {
        const sg = ny > 0.01 || (Math.abs(ny) <= 0.01 && nx > 0) ? 1 : -1;
        cx += nx * 16 * sg; cy += ny * 16 * sg;
      }
      chips.push({ x: cx, y: cy, text, kind: kind || 'dim' });
    }
    // 한 점에서 방향 v로 len만큼 잰 치수
    function dimRay(p, v, len, kind) {
      if (len < 1) return;
      dim(p, P(p.x + v.x * len, p.y, p.z + v.z * len), String(Math.round(len)), kind);
    }

    function rr(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }
    function drawChips() {
      const placed = [];
      for (const c of chips) {
        const korean = /[^\x00-\x7f]/.test(c.text);
        ctx.font = korean ? fontTxt : fontNum;
        if (korean && !asked[c.text] && document.fonts && document.fonts.load) {
          asked[c.text] = true;
          document.fonts.load(fontTxt, c.text).then(requestRender, () => {});
        }
        const w = Math.ceil(ctx.measureText(c.text).width) + 12;
        const h = 19;
        let x = Math.round(C.clamp(c.x - w / 2, 3, Math.max(3, W - w - 3)));
        let y = Math.round(C.clamp(c.y - h / 2, 3, Math.max(3, H - h - 3)));
        for (let k = 0; k < 4; k++) {
          const hit = placed.find((r) => x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y);
          if (!hit) break;
          y = hit.y + hit.h + 3;
        }
        placed.push({ x, y, w, h });
        let bg = col.sheet;
        let fg = col.ink;
        let bd = col.rule;
        if (c.kind === 'pick') { bg = col.pick; fg = col['on-pick']; bd = col.pick; }
        else if (c.kind === 'magnet') { bg = col.magnet; fg = col['on-magnet']; bd = col.magnet; }
        else if (c.kind === 'warn') { bg = col['warn-soft']; fg = col.warn; bd = col.warn; }
        else if (c.kind === 'bad') { bg = col['bad-soft']; fg = col.bad; bd = col.bad; }
        else if (c.kind === 'name') { bg = col.ink; fg = col['on-ink']; bd = col.ink; }
        ctx.globalAlpha = c.kind === 'name' ? 0.86 : 0.96;
        ctx.fillStyle = bg;
        rr(x, y, w, h, 4.5); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = bd; ctx.lineWidth = 1;
        rr(x + 0.5, y + 0.5, w - 1, h - 1, 4); ctx.stroke();
        ctx.fillStyle = fg;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.text, x + w / 2, y + h / 2 + 0.5);
      }
    }
    function chipAt(p, text, kind, dy) {
      const pt = point(p);
      if (pt) chips.push({ x: pt[0], y: pt[1] + (dy || 0), text, kind });
    }

    function unitDims(u) {
      const o = 110;
      const g = C.unitGaps(u, design);
      const d = C.dirs(u.rot);
      const tight = (gap) => (gap - C.frontExtra(u) < K.AISLE_MIN ? 'warn' : 'dim');
      if (u.kind === 'corner') {
        const c = C.cornerGeo(u);
        // 두 날개의 길이는 벽 쪽 윗모서리 위에, 깊이와 높이는 날개 A 끝에 적는다
        dim(UL(u, c.X0, u.h + o, c.Z0), UL(u, c.X1, u.h + o, c.Z0), String(u.w), 'pick');
        dim(UL(u, c.X0, u.h + o, c.Z0), UL(u, c.X0, u.h + o, c.Z1), String(u.w2), 'pick');
        // 두 부분의 깊이는 저마다의 끝에 적는다
        dim(UL(u, c.X1 + o, 0, c.Z0), UL(u, c.X1 + o, 0, c.Z0 + c.DA), String(c.DA), 'pick');
        dim(UL(u, c.X0, 0, c.Z1 + o), UL(u, c.X0 + c.DB, 0, c.Z1 + o), String(c.DB), 'pick');
        dim(UL(u, c.X1 + o, 0, c.Z0 + c.DA), UL(u, c.X1 + o, u.h, c.Z0 + c.DA), String(u.h), 'pick');
        dimRay(UL(u, c.X1, 0, c.Z0 + c.DA - 50), d.r, g.right.gap);
        dimRay(UL(u, c.X0 + c.DB - 50, 0, c.Z1), d.f, g.front.gap);
        dimRay(UL(u, (c.X0 + c.DB + c.X1) / 2, 0, c.Z0 + c.DA), d.f, g.aisleA.gap, tight(g.aisleA.gap));
        dimRay(UL(u, c.X0 + c.DB, 0, (c.Z0 + c.DA + c.Z1) / 2), d.r, g.aisleB.gap, tight(g.aisleB.gap));
        return;
      }
      dim(UL(u, -u.w / 2, 0, u.d / 2 + o), UL(u, u.w / 2, 0, u.d / 2 + o), String(u.w), 'pick');
      dim(UL(u, u.w / 2 + o, 0, -u.d / 2), UL(u, u.w / 2 + o, 0, u.d / 2), String(u.d), 'pick');
      dim(UL(u, -u.w / 2 - o, 0, u.d / 2), UL(u, -u.w / 2 - o, u.h, u.d / 2), String(u.h), 'pick');
      dimRay(UL(u, -u.w / 2, 0, u.d / 2 - 50), { x: -d.r.x, z: -d.r.z }, g.left.gap);
      dimRay(UL(u, u.w / 2, 0, u.d / 2 - 50), d.r, g.right.gap);
      dimRay(UL(u, 0, 0, u.d / 2), d.f, g.front.gap, tight(g.front.gap));
    }

    // 부품 치수를 적을 앞면의 위치 (유닛 기준 좌표)
    function partFace(u) {
      if (u.kind === 'corner') {
        const c = C.cornerGeo(u);
        return { x0: c.X0 + c.DB, x1: c.X1, z: c.Z0 + c.DA, gapX: c.X1 - K.T - 70, refX: c.X1 + 90, dots: [c.X0 + c.DB + 22, c.X1 - K.T - 22] };
      }
      const hw = C.interior(u).w / 2;
      return { x0: -u.w / 2, x1: u.w / 2, z: u.d / 2, gapX: hw - 70, refX: -u.w / 2 - 90, dots: [-hw + 22, hw - 22] };
    }

    function partDims(u, p) {
      const g = C.partGaps(u, p);
      const ph = C.partH(p, u);
      const f = partFace(u);
      // 행거봉은 봉 중심에서, 선반과 서랍은 윗면·아랫면에서 잰다
      const top = p.type === 'rod' ? p.y + ph / 2 : p.y + ph;
      const bot = p.type === 'rod' ? p.y + ph / 2 : p.y;
      if (g.aboveAt - top >= 1) dim(UL(u, f.gapX, top, f.z), UL(u, f.gapX, g.aboveAt, f.z), String(Math.round(g.aboveAt - top)));
      if (bot - g.belowAt >= 1) dim(UL(u, f.gapX, bot, f.z), UL(u, f.gapX, g.belowAt, f.z), String(Math.round(bot - g.belowAt)));
      const ref = C.partRef(p, u);
      dim(UL(u, f.refX, 0, f.z), UL(u, f.refX, ref, f.z), String(Math.round(ref)), 'pick');
    }

    function openingDims(o) {
      const len = C.wallLen(design.room, o.wall);
      const s0 = o.offset;
      const s1 = o.offset + o.width;
      const inw = 130;
      if (s0 >= 1) dim(WP(o.wall, 0, inw), WP(o.wall, s0, inw), String(Math.round(s0)));
      dim(WP(o.wall, s0, inw), WP(o.wall, s1, inw), String(o.width), 'pick');
      if (len - s1 >= 1) dim(WP(o.wall, s1, inw), WP(o.wall, len, inw), String(Math.round(len - s1)));
      if (ui.view !== 'top') {
        const y = openingY(o);
        if (y[0] >= 1) dim(WP(o.wall, s0, 0, 0), WP(o.wall, s0, 0, y[0]), String(Math.round(y[0])));
        dim(WP(o.wall, s1, 0, y[0]), WP(o.wall, s1, 0, y[1]), String(Math.round(y[1] - y[0])), 'pick');
      }
    }

    function blockDims(k) {
      const room = design.room;
      const r = C.box(k);
      const o = 110;
      // 가로·세로는 방 안쪽으로 열린 면 앞에 적는다
      const zf = r.z1 + o <= room.d ? r.z1 + o : r.z0 - o;
      const xf = r.x1 + o <= room.w ? r.x1 + o : r.x0 - o;
      dim(P(r.x0, 0, zf), P(r.x1, 0, zf), String(k.w), 'pick');
      dim(P(xf, 0, r.z0), P(xf, 0, r.z1), String(k.d), 'pick');
      if (!k.full && ui.view !== 'top') dim(P(r.x1, 0, r.z1), P(r.x1, C.blockH(k, room), r.z1), String(C.blockH(k, room)), 'pick');
      const xc = (r.x0 + r.x1) / 2;
      const zc = (r.z0 + r.z1) / 2;
      if (r.x0 >= 1) dim(P(0, 0, zc), P(r.x0, 0, zc), String(Math.round(r.x0)));
      if (room.w - r.x1 >= 1) dim(P(r.x1, 0, zc), P(room.w, 0, zc), String(Math.round(room.w - r.x1)));
      if (r.z0 >= 1) dim(P(xc, 0, 0), P(xc, 0, r.z0), String(Math.round(r.z0)));
      if (room.d - r.z1 >= 1) dim(P(xc, 0, r.z1), P(xc, 0, room.d), String(Math.round(room.d - r.z1)));
    }

    function marker(pt) {
      if (!pt) return;
      const s = 4.2;
      ctx.beginPath();
      ctx.moveTo(pt[0], pt[1] - s); ctx.lineTo(pt[0] + s, pt[1]); ctx.lineTo(pt[0], pt[1] + s); ctx.lineTo(pt[0] - s, pt[1]);
      ctx.closePath();
      ctx.fillStyle = col.magnet; ctx.fill();
      ctx.strokeStyle = col.sheet; ctx.lineWidth = 1; ctx.stroke();
    }

    // 앞면 표시: 앞쪽 가장자리 가운데에서 바깥으로 향하는 삼각형
    function frontMark(c0, c1) {
      if (!c0 || !c1) return;
      const dx = c1[0] - c0[0];
      const dy = c1[1] - c0[1];
      const L = Math.hypot(dx, dy) || 1;
      const ux = dx / L;
      const uy = dy / L;
      const s = 6;
      ctx.beginPath();
      ctx.moveTo(c0[0] + ux * (s + 3), c0[1] + uy * (s + 3));
      ctx.lineTo(c0[0] - uy * s + ux * 3, c0[1] + ux * s + uy * 3);
      ctx.lineTo(c0[0] + uy * s + ux * 3, c0[1] - ux * s + uy * 3);
      ctx.closePath();
      ctx.fillStyle = col.ink; ctx.fill();
      ctx.strokeStyle = col.sheet; ctx.lineWidth = 1.2; ctx.stroke();
    }

    // 평면 보기: 여닫이문이 열리며 지나가는 자리
    function swingArcs(u) {
      if (u.kind === 'corner' || C.doorKind(u) !== 'hinge') return;
      const hi = C.hingeInfo(u);
      const zf = u.d / 2;
      const pairs = [];
      hi.widths.forEach((lw, i) => {
        // 한 짝이면 고른 쪽에, 두 짝이면 양 끝에 경첩이 있다
        const left = hi.leaves === 1 ? u.hinge === 'left' : i === 0;
        const hx = left ? -u.w / 2 : u.w / 2;
        const s = left ? 1 : -1;
        let prev = UL(u, hx + s * lw, u.h, zf);
        for (let k = 1; k <= 10; k++) {
          const t = k / 10 * Math.PI / 2;
          const cur = UL(u, hx + s * lw * Math.cos(t), u.h, zf + lw * Math.sin(t));
          pairs.push([prev, cur]);
          prev = cur;
        }
        pairs.push([UL(u, hx, u.h, zf), prev]);
      });
      lines3(pairs, col['ink-2'], 1, [4, 3]);
    }

    // 평면 보기의 방 단계: 벽마다 끌 수 있다는 표시를 둔다
    function wallGrips() {
      const room = design.room;
      const T = K.WALL_T;
      const active = (ui.guides && ui.guides.wall && ui.guides.wall.wall) || (!ui.dragging ? ui.hoverWall : null);
      for (const wall of C.WALLS) {
        const len = C.wallLen(room, wall);
        // 문·창문이 없는 가장 긴 구간의 가운데
        let best = [0, len];
        let bl = -1;
        for (const iv of C.wallFree(design, wall, null, false)) if (iv[1] - iv[0] > bl) { bl = iv[1] - iv[0]; best = iv; }
        const on = wall === active;
        if (on) lines3([[WP(wall, 0, 0, room.h), WP(wall, len, 0, room.h)]], col.pick, 2.2);
        const pt = point(WP(wall, (best[0] + best[1]) / 2, -T / 2, room.h));
        if (!pt) continue;
        const along = C.WALL_AXIS[wall] === 'x';
        const w = along ? 30 : 10;
        const h = along ? 10 : 30;
        ctx.fillStyle = on ? col.pick : col.sheet;
        rr(pt[0] - w / 2, pt[1] - h / 2, w, h, 5); ctx.fill();
        ctx.strokeStyle = on ? col.pick : col['ink-2']; ctx.lineWidth = 1.2;
        rr(pt[0] - w / 2, pt[1] - h / 2, w, h, 5); ctx.stroke();
        ctx.strokeStyle = on ? col['on-pick'] : col['ink-2'];
        ctx.beginPath();
        for (const k of [-4, 0, 4]) {
          if (along) { ctx.moveTo(pt[0] + k, pt[1] - 2.5); ctx.lineTo(pt[0] + k, pt[1] + 2.5); }
          else { ctx.moveTo(pt[0] - 2.5, pt[1] + k); ctx.lineTo(pt[0] + 2.5, pt[1] + k); }
        }
        ctx.stroke();
      }
    }

    function drawGuides() {
      const g = ui.guides;
      if (!g) return;
      const U_TXT = { wall: '벽에 붙음', unit: '맞닿음', align: '선 맞춤' };
      const P_TXT = { align: '같은 높이', stack: '맞닿음', limit: '끝' };
      const O_TXT = { end: '벽 끝', center: '벽 가운데', next: '맞닿음' };
      for (const k of g.unit || []) {
        const p = k.axis === 'x' ? P(k.at, 0, k.a) : P(k.a, 0, k.at);
        const q = k.axis === 'x' ? P(k.at, 0, k.b) : P(k.b, 0, k.at);
        const segs = lines3([[p, q]], col.magnet, 1.6, [6, 4]);
        marker(point(p)); marker(point(q));
        if (segs.length) chips.push({ x: (segs[0][0] + segs[0][2]) / 2, y: (segs[0][1] + segs[0][3]) / 2, text: U_TXT[k.kind], kind: 'magnet' });
      }
      const og = g.opening ? getOpening(g.opening.id) : null;
      if (og) {
        const len = C.wallLen(design.room, og.wall);
        const y = openingY(og);
        const yy = ui.view === 'top' ? design.room.h : (y[0] + y[1]) / 2;
        const ends = g.opening.kind === 'center' ? [len / 2] : g.opening.kind === 'next' ? [og.offset, og.offset + og.width]
          : [og.offset < 0.5 ? 0 : len];
        for (const s of ends) marker(point(WP(og.wall, s, 0, yy)));
        chipAt(WP(og.wall, og.offset + og.width / 2, 0, yy), O_TXT[g.opening.kind], 'magnet', -18);
      }
      if (g.wall && g.wall.fit) {
        const len = C.wallLen(design.room, g.wall.wall);
        lines3([[WP(g.wall.wall, 0, 0, design.room.h), WP(g.wall.wall, len, 0, design.room.h)]], col.magnet, 1.8, [6, 4]);
        chipAt(WP(g.wall.wall, len / 2, 160, design.room.h), '가구에 맞닿음', 'magnet');
      }
      const u = getUnit(g.unitId);
      if (!u) return;
      const f = partFace(u);
      if (g.pitch) {
        const it = C.interior(u);
        const step = C.pitchOf(u).step;         // 판넬형·기둥형 32mm, 스피드랙 30mm
        const p0 = point(UL(u, f.dots[0], 0, f.z));
        const p1 = point(UL(u, f.dots[0], step, f.z));
        if (p0 && p1 && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) >= 4.5) {
          ctx.fillStyle = col.magnet;
          for (let y = C.pitchNear(it.y0 + 15, u); y <= it.y1; y += step) {
            const on = Math.abs(y - g.y) < 0.5;
            ctx.globalAlpha = on ? 1 : 0.5;
            for (const x of f.dots) {
              const pt = point(UL(u, x, y, f.z));
              if (!pt) continue;
              ctx.beginPath(); ctx.arc(pt[0], pt[1], on ? 3.2 : 1.5, 0, Math.PI * 2); ctx.fill();
            }
          }
          ctx.globalAlpha = 1;
        }
      }
      for (const k of g.part || []) {
        const pairs = [[UL(u, f.x0, k.y, f.z), UL(u, f.x1, k.y, f.z)]];
        for (const id of k.unitIds) {
          const o = getUnit(id);
          if (!o) continue;
          const of = partFace(o);
          const oa = UL(o, of.x0, k.y, of.z);
          const ob = UL(o, of.x1, k.y, of.z);
          pairs.push([oa, ob]);
          // 두 유닛 사이를 잇는 선: 가장 가까운 끝끼리
          let best = null;
          for (const m of pairs[0]) for (const n of [oa, ob]) {
            const dd = m.distanceToSquared(n);
            if (!best || dd < best.dd) best = { dd, m, n };
          }
          if (best && best.dd > 1) pairs.push([best.m, best.n]);
        }
        const segs = lines3(pairs, col.magnet, 1.6, [6, 4]);
        if (segs.length) {
          marker([segs[0][0], segs[0][1]]); marker([segs[0][2], segs[0][3]]);
          chips.push({ x: (segs[0][0] + segs[0][2]) / 2, y: (segs[0][1] + segs[0][3]) / 2 - 14, text: P_TXT[k.kind] || '맞닿음', kind: 'magnet' });
        }
      }
    }

    const itemPairs = (id) => { const o = getOpening(id); if (o) return openingPairs(o); const k = getBlock(id); return k ? blockPairs(k) : null; };
    function itemTop(id) {
      const o = getOpening(id);
      if (o) return { p: WP(o.wall, o.offset + o.width / 2, 0, openingY(o)[1]), name: C.openingName(design, o) };
      const k = getBlock(id);
      return k ? { p: P(k.x, C.blockH(k, design.room), k.z), name: k.name } : null;
    }

    function draw() {
      cam = Rig.camera();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      chips.length = 0;
      const room = design.room;
      const selU = getUnit(ui.selUnit);
      const selP = getPart(selU, ui.selPart);
      const topView = ui.view === 'top';
      const vis = (u) => ui.view !== 'front' || C.facesWall(u, ui.frontRot);
      const nameAt = (u, lift) => { const l = C.labelLocal(u); return UL(u, l.x, u.h + lift, l.z); };

      const bad = {};
      for (const i of issues()) if (i.level === 'bad') { bad[i.unitId] = true; if (i.otherId) bad[i.otherId] = true; if (i.itemId) bad[i.itemId] = true; }
      for (const u of design.units) if (bad[u.id] && vis(u)) lines3(unitPairs(u), col.bad, 1.6, [5, 4]);
      for (const k of design.blocks) if (bad[k.id]) lines3(blockPairs(k), col.bad, 1.6, [5, 4]);

      if (ui.dims || ui.dragging === 'wall') {
        // 치수선은 카메라에서 가까운 쪽 바닥 가장자리에 놓는다
        const o = 270;
        const south = topView || cam.position.z >= room.d / 2;
        const east = topView || cam.position.x >= room.w / 2;
        const zw = south ? room.d + o : -o;
        const xd = east ? room.w + o : -o;
        const xh = east ? -o : room.w + o;
        const zh = south ? room.d : 0;
        dim(P(0, 0, zw), P(room.w, 0, zw), String(room.w));
        dim(P(xd, 0, 0), P(xd, 0, room.d), String(room.d));
        dim(P(xh, 0, zh), P(xh, room.h, zh), String(room.h));
      }
      if (ui.dims && ui.view !== 'front') {
        for (const z of C.doorZones(design)) {
          chipAt(P((z.rect.x0 + z.rect.x1) / 2, 0, (z.rect.z0 + z.rect.z1) / 2), '문 앞 ' + C.zoneDepth(z.o), 'dim');
        }
      }

      if (topView) {
        if (ui.tab === 'room') wallGrips();
        for (const u of design.units) {
          if (ui.doors) swingArcs(u);
          for (const e of C.frontEdges(u)) {
            const mx = (e.x0 + e.x1) / 2;
            const mz = (e.z0 + e.z1) / 2;
            frontMark(point(UL(u, mx, u.h, mz)), point(UL(u, mx + e.nx * 100, u.h, mz + e.nz * 100)));
          }
          chipAt(nameAt(u, 0), u.name, u.id === ui.selUnit ? 'pick' : 'name');
        }
      }

      const hov = getUnit(ui.hoverUnit);
      if (hov && vis(hov) && !ui.dragging) {
        const hp = getPart(hov, ui.hoverPart);
        if (hp && hp.id !== ui.selPart) lines3(partPairs(hov, hp), col.pick, 1.1, [3, 3]);
        else if (!hp && hov.id !== ui.selUnit) lines3(unitPairs(hov), col.pick, 1.1, [3, 3]);
        if (!topView && hov.id !== ui.selUnit) chipAt(nameAt(hov, 140), hov.name, 'name');
      }
      if (ui.hoverItem && ui.hoverItem !== ui.selItem && !ui.dragging) {
        const pairs = itemPairs(ui.hoverItem);
        const top = itemTop(ui.hoverItem);
        if (pairs) lines3(pairs, col.pick, 1.1, [3, 3]);
        if (top) chipAt(top.p, top.name, 'name', -16);
      }

      if (selU && vis(selU)) {
        if (selP) {
          lines3(unitPairs(selU), col.pick, 1, [2, 4]);
          lines3(partPairs(selU, selP), col.pick, 1.8);
          if (ui.dims || ui.dragging === 'part') partDims(selU, selP);
        } else {
          lines3(unitPairs(selU), col.pick, 1.8);
          if (!topView) chipAt(nameAt(selU, 140), selU.name, 'pick');
          if ((ui.dims && ui.tab !== 'interior') || ui.dragging === 'unit') unitDims(selU);
        }
      }

      const selO = getOpening(ui.selItem);
      const selB = selO ? null : getBlock(ui.selItem);
      if (selO || selB) {
        lines3(selO ? openingPairs(selO) : blockPairs(selB), col.pick, 1.8);
        const top = itemTop(ui.selItem);
        chipAt(top.p, top.name, 'pick', -16);
        if (ui.dims || ui.dragging === 'opening' || ui.dragging === 'block') { if (selO) openingDims(selO); else blockDims(selB); }
      }

      drawGuides();
      drawChips();
    }

    return { readTheme, resize, draw, canvas: cv };
  })();
