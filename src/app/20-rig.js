  /* ---------- 카메라 ---------- */

  const Rig = (() => {
    const persp = new THREE.PerspectiveCamera(34, 1, 60, 400000);
    const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 10, 400000);
    const st = {
      target: new THREE.Vector3(1200, 950, 900), theta: 0.42, phi: 1.07, dist: 9000,
      top: { cx: 1200, cz: 900, scale: 0.2 },
      front: { c: new THREE.Vector3(1200, 1150, 900), scale: 0.2 },
    };
    let W = 1;
    let H = 1;
    let anim = null;
    let moved = false;      // 사용자가 화면을 직접 돌리거나 옮겼는지
    const vx = new THREE.Vector3();
    const vy = new THREE.Vector3();
    const DIST = [900, 240000];      // 3D 보기에서 카메라가 떨어질 수 있는 거리 (큰 방도 한 화면에 들어오도록)
    const SCALE = [0.004, 2.5];      // 평면·정면 보기의 배율 (화면 1px에 담기는 mm의 역수)

    function camera() { return ui.view === '3d' ? persp : ortho; }

    function apply() {
      if (ui.view === '3d') {
        st.phi = C.clamp(st.phi, 0.1, 1.53);
        st.dist = C.clamp(st.dist, DIST[0], DIST[1]);
        // 아주 멀리서 볼 때는 가까운 쪽 한계를 함께 늘려 깊이 계산이 뭉개지지 않게 한다
        const near = st.dist > 60000 ? st.dist / 1000 : 60;
        if (persp.near !== near) { persp.near = near; persp.updateProjectionMatrix(); }
        const sp = Math.sin(st.phi);
        persp.position.set(st.target.x + st.dist * sp * Math.sin(st.theta), st.target.y + st.dist * Math.cos(st.phi), st.target.z + st.dist * sp * Math.cos(st.theta));
        persp.up.set(0, 1, 0);
        persp.lookAt(st.target);
        persp.updateMatrixWorld();
        Scene.setFog(st.dist * 1.25, st.dist * 4.5);
      } else {
        const o = ui.view === 'top' ? st.top : st.front;
        o.scale = C.clamp(o.scale, SCALE[0], SCALE[1]);
        ortho.left = -W / 2 / o.scale; ortho.right = W / 2 / o.scale;
        ortho.top = H / 2 / o.scale; ortho.bottom = -H / 2 / o.scale;
        ortho.updateProjectionMatrix();
        if (ui.view === 'top') {
          ortho.position.set(st.top.cx, 100000, st.top.cz);
          ortho.up.set(0, 0, -1);
          ortho.lookAt(st.top.cx, 0, st.top.cz);
        } else {
          const f = C.dirs(ui.frontRot).f;
          const c = st.front.c;
          ortho.position.set(c.x + f.x * 100000, c.y, c.z + f.z * 100000);
          ortho.up.set(0, 1, 0);
          ortho.lookAt(c);
        }
        ortho.updateMatrixWorld();
        Scene.setFog(1e7, 2e7);
      }
    }

    function setSize(w, h) {
      W = Math.max(1, w); H = Math.max(1, h);
      persp.aspect = W / H;
      persp.updateProjectionMatrix();
      apply();
    }

    // 방 전체(바닥의 치수선 포함)가 화면에 꼭 맞게 들어오는 거리와 중심
    function fitTarget() {
      const room = design.room;
      const m = 340;
      const pts = [];
      for (const x of [-m, room.w + m]) for (const z of [-m, room.d + m]) pts.push(new THREE.Vector3(x, 0, z));
      for (const x of [-K.WALL_T, room.w + K.WALL_T]) for (const z of [-K.WALL_T, room.d + K.WALL_T]) pts.push(new THREE.Vector3(x, room.h, z));
      const cam = persp.clone();
      const v = new THREE.Vector3();
      const target = new THREE.Vector3(room.w / 2, room.h * 0.45, room.d / 2);
      const sp = Math.sin(st.phi);
      const place = (dist) => {
        cam.position.set(target.x + dist * sp * Math.sin(st.theta), target.y + dist * Math.cos(st.phi), target.z + dist * sp * Math.cos(st.theta));
        cam.lookAt(target);
        cam.updateMatrixWorld();
      };
      const bounds = (dist) => {
        place(dist);
        const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, ok: true };
        for (const p of pts) {
          v.copy(p).project(cam);
          if (v.z > 1 || v.z < -1) b.ok = false;
          b.x0 = Math.min(b.x0, v.x); b.x1 = Math.max(b.x1, v.x); b.y0 = Math.min(b.y0, v.y); b.y1 = Math.max(b.y1, v.y);
        }
        return b;
      };
      const LX = 0.93;
      const LY = 0.88;
      let dist = 9000;
      for (let pass = 0; pass < 3; pass++) {
        let lo = DIST[0];
        let hi = DIST[1];
        for (let i = 0; i < 22; i++) {
          const mid = (lo + hi) / 2;
          const b = bounds(mid);
          if (b.ok && b.x1 - b.x0 <= 2 * LX && b.y1 - b.y0 <= 2 * LY) hi = mid; else lo = mid;
        }
        dist = hi;
        // 화면 가운데로 옮긴다
        const b = bounds(dist);
        const tv = Math.tan(persp.fov * Math.PI / 360);
        const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
        target.addScaledVector(right, (b.x0 + b.x1) / 2 * dist * tv * persp.aspect).addScaledVector(up, (b.y0 + b.y1) / 2 * dist * tv);
      }
      return { target, dist };
    }

    const roomSig = () => design.room.w + 'x' + design.room.d + 'x' + design.room.h;
    // 방 크기나 보는 벽이 바뀌었을 때만 다시 맞춘다 (돌리거나 확대해 둔 상태를 유지)
    function ensureFit() {
      if (ui.view === '3d' && st.sig !== roomSig()) fit(false);
      else if (ui.view === 'top' && st.top.sig !== roomSig()) fit(false);
      else if (ui.view === 'front' && st.front.sig !== roomSig() + '@' + ui.frontRot) fit(false);
      else { apply(); requestRender(); }
    }
    // 평면 보기에 방 전체(치수선 포함)가 들어와 있는지
    function topFits() {
      const room = design.room;
      const m = 320;
      const hw = W / 2 / st.top.scale;
      const hh = H / 2 / st.top.scale;
      return st.top.cx - hw <= -m && st.top.cx + hw >= room.w + m && st.top.cz - hh <= -m && st.top.cz + hh >= room.d + m;
    }
    // 평면 보기에서 벽을 끌어 방 크기를 바꾼 뒤: 방이 화면 밖으로 나갔을 때만 다시 맞추고, 아니면 지금 화면을 그대로 둔다
    function settleTop(fitted) {
      if (fitted && !topFits()) fit(false);
      else st.top.sig = roomSig();
    }

    function fit(animated) {
      const room = design.room;
      const m = 440;
      moved = false;
      if (ui.view === '3d') {
        const t = fitTarget();
        if (animated && !reducedMotion) {
          anim = { t0: performance.now(), ms: 420, from: { target: st.target.clone(), dist: st.dist }, to: t };
        } else {
          anim = null;
          st.target.copy(t.target); st.dist = t.dist;
        }
        st.sig = W > 1 ? roomSig() : '';
      } else if (ui.view === 'top') {
        st.top.cx = room.w / 2; st.top.cz = room.d / 2;
        st.top.scale = Math.min(W / (room.w + 2 * m), H / (room.d + 2 * m + 160));
        st.top.sig = W > 1 ? roomSig() : '';
      } else {
        const len = ui.frontRot % 180 === 0 ? room.w : room.d;
        st.front.c.set(room.w / 2, room.h / 2 - 40, room.d / 2);
        st.front.scale = Math.min(W / (len + 2 * m), H / (room.h + 2 * m * 0.8));
        st.front.sig = W > 1 ? roomSig() + '@' + ui.frontRot : '';
      }
      apply();
      requestRender();
    }

    function step(now) {
      if (!anim) return;
      const k = Math.min(1, (now - anim.t0) / anim.ms);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      st.target.lerpVectors(anim.from.target, anim.to.target, e);
      st.dist = anim.from.dist + (anim.to.dist - anim.from.dist) * e;
      apply();
      if (k < 1) requestRender(); else anim = null;
    }
    function stop() { anim = null; }

    function orbit(dx, dy) {
      if (ui.view !== '3d') { pan(dx, dy); return; }
      moved = true;
      st.theta -= dx * 0.0062;
      st.phi -= dy * 0.0062;
      apply(); requestRender();
    }

    function pan(dx, dy) {
      const room = design.room;
      moved = true;
      if (ui.view === '3d') {
        vx.setFromMatrixColumn(persp.matrixWorld, 0);
        vy.setFromMatrixColumn(persp.matrixWorld, 1);
        const k = 2 * st.dist * Math.tan(persp.fov * Math.PI / 360) / H;
        st.target.addScaledVector(vx, -dx * k).addScaledVector(vy, dy * k);
        st.target.x = C.clamp(st.target.x, -3000, room.w + 3000);
        st.target.z = C.clamp(st.target.z, -3000, room.d + 3000);
        st.target.y = C.clamp(st.target.y, -300, room.h + 1500);
      } else if (ui.view === 'top') {
        st.top.cx = C.clamp(st.top.cx - dx / st.top.scale, -3000, room.w + 3000);
        st.top.cz = C.clamp(st.top.cz - dy / st.top.scale, -3000, room.d + 3000);
      } else {
        const r = C.dirs(ui.frontRot).r;
        const k = dx / st.front.scale;
        st.front.c.x = C.clamp(st.front.c.x - r.x * k, -3000, room.w + 3000);
        st.front.c.z = C.clamp(st.front.c.z - r.z * k, -3000, room.d + 3000);
        st.front.c.y = C.clamp(st.front.c.y + dy / st.front.scale, -500, room.h + 1500);
      }
      apply(); requestRender();
    }

    // factor > 1 이면 확대. (mx, my)는 캔버스 안 좌표.
    function zoom(factor, mx, my) {
      moved = true;
      if (ui.view === '3d') {
        st.dist /= factor;
      } else {
        const o = ui.view === 'top' ? st.top : st.front;
        const s0 = o.scale;
        const s1 = C.clamp(s0 * factor, SCALE[0], SCALE[1]);
        const kx = (mx - W / 2) * (1 / s0 - 1 / s1);
        const ky = (my - H / 2) * (1 / s0 - 1 / s1);
        if (ui.view === 'top') { st.top.cx += kx; st.top.cz += ky; }
        else {
          const r = C.dirs(ui.frontRot).r;
          st.front.c.x += r.x * kx; st.front.c.z += r.z * kx; st.front.c.y -= ky;
        }
        o.scale = s1;
      }
      apply(); requestRender();
    }

    // 화면 방향키를 방 좌표로 바꾼다 (유닛 미세 이동용).
    function screenAxes() {
      if (ui.view === 'top') return { right: { x: 1, z: 0 }, up: { x: 0, z: -1 } };
      if (ui.view === 'front') { const r = C.dirs(ui.frontRot).r; return { right: r, up: { x: 0, z: 0 } }; }
      const a = ((Math.round(st.theta / (Math.PI / 2)) % 4) + 4) % 4;
      const table = [
        { right: { x: 1, z: 0 }, up: { x: 0, z: -1 } },
        { right: { x: 0, z: -1 }, up: { x: -1, z: 0 } },
        { right: { x: -1, z: 0 }, up: { x: 0, z: 1 } },
        { right: { x: 0, z: 1 }, up: { x: 1, z: 0 } },
      ];
      return table[a];
    }

    // 화면 크기가 바뀌었을 때: 사용자가 화면을 건드리지 않았다면 방 전체가 다시 보이도록 맞춘다
    function refit() {
      if (moved) return;
      st.top.sig = ''; st.front.sig = '';
      fit(false);
    }

    return { camera, apply, setSize, fit, refit, ensureFit, topFits, settleTop, step, stop, orbit, pan, zoom, screenAxes, size: () => ({ W, H }), state: st };
  })();

