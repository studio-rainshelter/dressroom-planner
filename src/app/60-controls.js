  /* ---------- 포인터 조작 ---------- */

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function setRay(cx, cy) {
    const r = glCanvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, Rig.camera());
  }

  // 화면의 한 점 아래에 있는 것: 유닛·부품이면 { unitId, partId }, 문·창문·벽체면 { itemId, block, floor }
  function pick(cx, cy) {
    Scene.updateWorld();
    setRay(cx, cy);
    const interior = ui.tab === 'interior';
    const list = [];
    Scene.entries.forEach((e) => {
      if (!e.group.visible) return;
      for (const m of e.picks) list.push(m);
      if (interior && !e.ghost) e.parts.forEach((pe) => { for (const m of pe.picks) list.push(m); });
    });
    if (!interior) {
      Scene.blockEntries.forEach((e) => { if (e.group.visible) list.push(e.pick); });
      // 문 앞 바닥 표시는 방 단계에서만 집힌다 (다른 단계에서는 바닥을 눌러 선택을 풀 수 있어야 한다)
      for (const m of Scene.openingTargets()) if (ui.tab === 'room' || !m.userData.floor) list.push(m);
    }
    const hits = ray.intersectObjects(list, false);
    if (!hits.length) return null;
    const isGhost = (id) => { const e = Scene.entries.get(id); return !!(e && e.ghost); };
    if (!interior) {
      const faint = (k) => {
        const d = k.object.userData;
        if (d.unitId) return isGhost(d.unitId);
        const e = d.block ? Scene.blockEntries.get(d.itemId) : null;
        return !!(e && e.ghost);
      };
      const h = hits.find((k) => !faint(k)) || hits[0];
      const d = h.object.userData;
      if (d.itemId) return { itemId: d.itemId, block: !!d.block, floor: !!d.floor, point: h.point.clone() };
      return { unitId: d.unitId, partId: null, point: h.point.clone() };
    }
    // 내부 단계: 부품을 먼저 찾는다. 판넬형 유닛은 뒤를 가리고, 기둥형과 스피드랙은 뒤가 비쳐 보인다.
    let open = null;
    for (let i = 0; i < hits.length; i++) {
      const d = hits[i].object.userData;
      if (d.partId) return { unitId: d.unitId, partId: d.partId, point: hits[i].point.clone() };
      const u = getUnit(d.unitId);
      if (isGhost(d.unitId) || (u && u.style !== 'panel')) { if (!open) open = hits[i]; continue; }
      const inner = hits.find((h, k) => k > i && h.object.userData.partId && h.object.userData.unitId === d.unitId);
      if (inner) return { unitId: d.unitId, partId: inner.object.userData.partId, point: inner.point.clone() };
      if (!open) open = hits[i];
      break;
    }
    return open ? { unitId: open.object.userData.unitId, partId: null, point: open.point.clone() } : null;
  }

  // 화면의 한 점이 가리키는 바닥 위치
  function floorPoint(cx, cy) {
    setRay(cx, cy);
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    if (d.y > -1e-6) return null;
    const t = -o.y / d.y;
    return t > 0 ? { x: o.x + d.x * t, z: o.z + d.z * t } : null;
  }

  // 평면 보기에서 화면의 한 점이 벽 위에 있으면 그 벽
  function wallAt(cx, cy) {
    if (ui.view !== 'top') return null;
    const pt = floorPoint(cx, cy);
    if (!pt) return null;
    const room = design.room;
    const T = K.WALL_T;
    const tol = (coarse ? 18 : 9) / Rig.state.top.scale;      // 화면에서 9px, 손가락으로는 18px
    let best = null;
    const test = (wall, inward, along, len) => {
      if (along < -T - tol || along > len + T + tol || inward < -T - tol || inward > tol) return;
      const c = Math.abs(inward + T / 2);
      if (!best || c < best.c) best = { wall, c };
    };
    test('N', pt.z, pt.x, room.w);
    test('S', room.d - pt.z, pt.x, room.w);
    test('W', pt.x, pt.z, room.d);
    test('E', room.w - pt.x, pt.z, room.d);
    return best ? best.wall : null;
  }

  // 문·창문을 끌 때: 화면의 한 점이 가리키는 벽과, 그 벽을 따라간 거리. cur는 지금 놓여 있는 벽.
  function wallTarget(cx, cy, cur) {
    setRay(cx, cy);
    const room = design.room;
    const o = ray.ray.origin;
    const d = ray.ray.direction;
    const m = 400;
    let floorT = Infinity;
    let fp = null;
    if (d.y < -1e-6) {
      const t = -o.y / d.y;
      const x = o.x + d.x * t;
      const z = o.z + d.z * t;
      if (t > 0 && x >= -m && x <= room.w + m && z >= -m && z <= room.d + m) { floorT = t; fp = { x, z }; }
    }
    if (ui.view !== 'top') {
      // 바닥보다 먼저 닿는 벽면이 있으면 그 벽
      let best = null;
      for (const w of C.WALLS) {
        if (!Scene.wallShown(w)) continue;
        const ax = C.WALL_AXIS[w] === 'x';
        const at = w === 'N' || w === 'W' ? 0 : (ax ? room.d : room.w);
        const den = ax ? d.z : d.x;
        if (Math.abs(den) < 1e-6) continue;
        const t = (at - (ax ? o.z : o.x)) / den;
        if (t <= 0 || t >= floorT) continue;
        const y = o.y + d.y * t;
        const s = ax ? o.x + d.x * t : o.z + d.z * t;
        if (y < 0 || y > room.h + 300 || s < -m || s > C.wallLen(room, w) + m) continue;
        if (!best || t < best.t) best = { t, wall: w, s };
      }
      if (best) return { wall: best.wall, s: best.s };
    }
    if (!fp) return null;
    // 바닥 위: 가장 가까운 벽. 지금 벽에서 뚜렷하게 멀어져야 다른 벽으로 넘어간다.
    const dist = { N: fp.z, S: room.d - fp.z, W: fp.x, E: room.w - fp.x };
    let wall = C.WALLS[0];
    for (const w of C.WALLS) if (dist[w] < dist[wall]) wall = w;
    if (cur && dist[cur] <= dist[wall] + 200) wall = cur;
    return { wall, s: C.WALL_AXIS[wall] === 'x' ? fp.x : fp.z };
  }

  const Ctl = (() => {
    const pts = new Map();
    let drag = null;
    let pinch = null;
    let lastTap = { t: 0, id: null };
    let hoverQueued = null;
    const plane = new THREE.Plane();
    const hit = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const magnetOn = (e) => ui.magnet !== !!e.altKey;
    const EDITS = { unit: 1, part: 1, opening: 1, block: 1, wall: 1 };

    function cancel() {
      if (drag && EDITS[drag.kind] && drag.live) {
        design = JSON.parse(drag.before);
        if (drag.kind === 'wall') { Rig.state.top.cx = drag.cam.cx; Rig.state.top.cz = drag.cam.cz; Rig.apply(); }
        touched();
        Scene.rebuildAll();
        Panel.refresh();
      }
      drag = null;
      ui.guides = null; ui.dragging = null;
      glCanvas.style.cursor = '';
      requestRender();
    }

    function down(e) {
      if (e.pointerType === 'mouse' && e.button > 2) return;
      try { glCanvas.setPointerCapture(e.pointerId); } catch (err) { /* 일부 브라우저는 거부할 수 있다 */ }
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      Rig.stop();
      if (pts.size === 2) {
        cancel();
        const p = Array.from(pts.values());
        pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2 };
        return;
      }
      if (pts.size > 2) return;
      if (e.button === 1 || e.button === 2) { drag = { kind: 'pan', x: e.clientX, y: e.clientY }; return; }
      const orbit = (extra) => { drag = Object.assign({ kind: 'orbit', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY }, extra); };
      const p = e.shiftKey ? null : pick(e.clientX, e.clientY);
      if (p && p.itemId) {
        if (ui.tab !== 'room') return orbit({ onUnit: true, openItem: p.itemId });   // 누르기만 하면 방 단계로 간다
        return p.block ? startBlock(e, p) : startOpening(e, p);
      }
      if (p && ui.tab === 'interior' && p.partId) return startPart(e, p);
      if (p && ui.tab === 'interior') {
        select(p.unitId, null);
        return orbit({ onUnit: true });
      }
      // 방·목록 단계에서는 유닛이 실수로 움직이지 않게 한다: 끌면 화면이 돌고, 누르기만 하면 배치 단계로 간다
      if (p && ui.tab !== 'layout') return orbit({ onUnit: true, open: p.unitId });
      if (p) return startUnit(e, p);
      const wall = !e.shiftKey && ui.tab === 'room' ? wallAt(e.clientX, e.clientY) : null;
      if (wall) return startWall(e, wall);
      orbit();
    }

    // 바닥을 따라 끄는 것(유닛, 벽체)의 기준면: 잡은 높이의 수평면. 옆에서 볼 때는 화면과 나란한 세로 면.
    function floorDrag(kind, obj, e, p) {
      const dir = ray.ray.direction;
      const flat = Math.abs(dir.y) >= 0.2;
      if (flat) plane.set(tmp.set(0, 1, 0), -p.point.y);
      else plane.setFromNormalAndCoplanarPoint(tmp.set(-dir.x, 0, -dir.z).normalize(), p.point);
      drag = { kind, id: obj.id, sx: e.clientX, sy: e.clientY, live: false, flat, ox: obj.x - p.point.x, oz: obj.z - p.point.z, before: JSON.stringify(design) };
    }
    function floorTarget(e) {
      setRay(e.clientX, e.clientY);
      if (drag.flat && Math.abs(ray.ray.direction.y) < 0.06) return null;
      if (!ray.ray.intersectPlane(plane, hit)) return null;
      const room = design.room;
      return { x: C.clamp(hit.x + drag.ox, -2000, room.w + 2000), z: C.clamp(hit.z + drag.oz, -2000, room.d + 2000) };
    }

    function startUnit(e, p) {
      select(p.unitId, null);
      floorDrag('unit', getUnit(p.unitId), e, p);
    }

    function startBlock(e, p) {
      selectItem(p.itemId);
      floorDrag('block', getBlock(p.itemId), e, p);
    }

    function startOpening(e, p) {
      selectItem(p.itemId);
      const o = getOpening(p.itemId);
      const t = wallTarget(e.clientX, e.clientY, o.wall);
      const grab = t && t.wall === o.wall ? C.clamp(t.s - o.offset, 0, o.width) : o.width / 2;
      drag = { kind: 'opening', id: o.id, sx: e.clientX, sy: e.clientY, live: false, grab, before: JSON.stringify(design) };
    }

    function startWall(e, wall) {
      const pt = floorPoint(e.clientX, e.clientY);
      const room = design.room;
      const side = wall === 'E' || wall === 'W';
      const line = wall === 'N' || wall === 'W' ? 0 : (side ? room.w : room.d);
      const top = Rig.state.top;
      if (ui.selItem) selectItem(null);
      drag = { kind: 'wall', wall, sx: e.clientX, sy: e.clientY, live: false, grab: line - (side ? pt.x : pt.z), cam: { cx: top.cx, cz: top.cz }, fitted: Rig.topFits(), before: JSON.stringify(design) };
    }

    function startPart(e, p) {
      select(p.unitId, p.partId);
      const u = getUnit(p.unitId);
      const part = getPart(u, p.partId);
      const cam = Rig.camera();
      if (ui.view === '3d') tmp.copy(cam.position).sub(p.point); else cam.getWorldDirection(tmp).negate();
      tmp.y = 0;
      if (tmp.lengthSq() < 1e-6) {
        toast('평면 보기에서는 부품을 위아래로 옮길 수 없습니다. 3D나 정면 보기로 바꾸세요.');
        drag = { kind: 'none' };
        return;
      }
      plane.setFromNormalAndCoplanarPoint(tmp.normalize(), p.point);
      drag = { kind: 'part', uid: u.id, pid: part.id, sx: e.clientX, sy: e.clientY, live: false, gy: p.point.y, y0: part.y, before: JSON.stringify(design) };
    }

    function move(e) {
      const pt = pts.get(e.pointerId);
      if (!pt) { hover(e); return; }
      const px = pt.x;
      const py = pt.y;
      pt.x = e.clientX; pt.y = e.clientY;
      if (pinch && pts.size >= 2) {
        const p = Array.from(pts.values());
        const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const cx = (p[0].x + p[1].x) / 2;
        const cy = (p[0].y + p[1].y) / 2;
        const r = glCanvas.getBoundingClientRect();
        if (pinch.d > 0 && d > 0) Rig.zoom(d / pinch.d, cx - r.left, cy - r.top);
        Rig.pan(cx - pinch.cx, cy - pinch.cy);
        pinch.d = d; pinch.cx = cx; pinch.cy = cy;
        return;
      }
      if (!drag) return;
      if (drag.kind === 'orbit') { Rig.orbit(e.clientX - px, e.clientY - py); return; }
      if (drag.kind === 'pan') { Rig.pan(e.clientX - px, e.clientY - py); return; }
      if (drag.kind === 'unit') return moveUnit(e);
      if (drag.kind === 'part') return movePart(e);
      if (drag.kind === 'block') return moveBlock(e);
      if (drag.kind === 'opening') return moveOpening(e);
      if (drag.kind === 'wall') return moveWall(e);
    }

    function arm(e) {
      if (drag.live) return true;
      if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return false;
      drag.live = true;
      ui.dragging = drag.kind;
      glCanvas.style.cursor = drag.kind === 'wall' ? (drag.wall === 'E' || drag.wall === 'W' ? 'ew-resize' : 'ns-resize') : 'grabbing';
      return true;
    }

    function moveUnit(e) {
      if (!arm(e)) return;
      const u = getUnit(drag.id);
      const desired = u ? floorTarget(e) : null;
      if (!desired) return;
      const r = C.resolveUnitMove(u, desired, { design, snap: magnetOn(e), thresh: STRENGTH[ui.strength], autoRotate: ui.autoRotate && ui.view !== 'front' });
      u.x = r.x; u.z = r.z; u.rot = r.rot;
      ui.guides = { unit: r.guides };
      touched();
      Scene.placeUnit(u, true);
      Panel.live();
    }

    function moveBlock(e) {
      if (!arm(e)) return;
      const k = getBlock(drag.id);
      const desired = k ? floorTarget(e) : null;
      if (!desired) return;
      const r = C.resolveUnitMove(k, desired, { design, snap: magnetOn(e), thresh: STRENGTH[ui.strength], autoRotate: false });
      k.x = r.x; k.z = r.z;
      ui.guides = { unit: r.guides };
      touched();
      Scene.placeBlock(k);
      Panel.live();
    }

    function moveOpening(e) {
      if (!arm(e)) return;
      const o = getOpening(drag.id);
      const t = o ? wallTarget(e.clientX, e.clientY, o.wall) : null;
      if (!t) return;
      if (t.wall !== o.wall) drag.grab = o.width / 2;
      const r = C.resolveOpeningMove(design, o, t.wall, t.s - drag.grab, { snap: magnetOn(e), thresh: STRENGTH[ui.strength] });
      if (r.blocked) return;          // 그 벽에는 놓을 자리가 없다
      o.wall = r.wall; o.offset = r.offset; o.width = r.width;
      C.fixOpening(o, design.room);
      ui.guides = r.snap ? { opening: { id: o.id, kind: r.snap } } : null;
      touched();
      Scene.rebuildRoom();
      Panel.live();
    }

    function moveWall(e) {
      if (!arm(e)) return;
      const r = glCanvas.getBoundingClientRect();
      const top = Rig.state.top;
      const sz = Rig.size();
      // 끌기 시작할 때의 좌표로 읽는다 (왼쪽·위쪽 벽을 옮기면 안의 것들과 함께 좌표가 밀린다)
      const x0 = drag.cam.cx + (e.clientX - r.left - sz.W / 2) / top.scale;
      const z0 = drag.cam.cz + (e.clientY - r.top - sz.H / 2) / top.scale;
      const side = drag.wall === 'E' || drag.wall === 'W';
      const next = JSON.parse(drag.before);
      if (ui.sample) next.units = [];
      const res = C.resizeRoomByWall(next, drag.wall, (side ? x0 : z0) + drag.grab, { snap: magnetOn(e), thresh: STRENGTH[ui.strength] });
      if (ui.sample) { next.units = C.sampleUnits(next); ui.selUnit = null; ui.selPart = null; }
      design = next;
      top.cx = drag.cam.cx + res.dx; top.cz = drag.cam.cz + res.dz;
      Rig.apply();
      ui.guides = { wall: { wall: drag.wall, fit: res.fit } };
      touched();
      if (ui.sample) Scene.rebuildAll(); else { Scene.rebuildRoom(); Scene.placeAll(); }
      Panel.live();
    }

    function movePart(e) {
      if (!arm(e)) return;
      const u = getUnit(drag.uid);
      const p = getPart(u, drag.pid);
      if (!p) return;
      setRay(e.clientX, e.clientY);
      if (!ray.ray.intersectPlane(plane, hit)) return;
      const on = magnetOn(e);
      const r = C.resolvePartMove(design, u, p, drag.y0 + (hit.y - drag.gy), { snap: on, thresh: STRENGTH[ui.strength] });
      p.y = r.y;
      ui.guides = { unitId: u.id, part: r.guides, pitch: on, y: p.y };
      touched();
      Scene.placePart(u, p);
      Panel.live();
    }

    function up(e) {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      try { glCanvas.releasePointerCapture(e.pointerId); } catch (err) { /* 이미 풀린 경우 */ }
      if (pinch) { if (pts.size < 2) pinch = null; drag = null; return; }
      const d = drag;
      drag = null;
      if (!d) return;
      ui.guides = null; ui.dragging = null;
      glCanvas.style.cursor = '';
      if (d.kind === 'unit') {
        if (d.live) {
          Scene.refreshDoors();
          History.commit();
          Panel.refresh();
        } else {
          const now = performance.now();
          if (lastTap.id === d.id && now - lastTap.t < 420) { lastTap = { t: 0, id: null }; setTab('interior'); }
          else lastTap = { t: now, id: d.id };
        }
      } else if (d.kind === 'part') {
        if (d.live) {
          const u = getUnit(d.uid);
          if (u) Scene.rebuildUnit(u);
          History.commit();
          Panel.refresh();
        }
      } else if (d.kind === 'opening' || d.kind === 'block') {
        if (d.live) afterWallEdit(true);
      } else if (d.kind === 'wall') {
        if (d.live) {
          Rig.settleTop(d.fitted);
          History.commit(ui.sample);
          Panel.refresh();
        }
      } else if (d.kind === 'orbit' && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 4) {
        if (d.openItem) { setTab('room'); selectItem(d.openItem); }
        else if (d.open) { setTab('layout'); select(d.open, null); }
        else if (!d.onUnit && ui.selItem) selectItem(null);
        else if (!d.onUnit && (ui.selUnit || ui.selPart)) {
          if (ui.tab === 'interior') select(ui.selUnit, null); else select(null, null);
        }
      }
      requestRender();
    }

    function hover(e) {
      if (e.pointerType !== 'mouse' || drag) return;
      hoverQueued = { x: e.clientX, y: e.clientY };
      requestAnimationFrame(() => {
        if (!hoverQueued || drag) return;
        const h = hoverQueued;
        hoverQueued = null;
        const p = pick(h.x, h.y);
        const hu = p && p.unitId ? p.unitId : null;
        const hp = p && p.partId ? p.partId : null;
        const hi = p && p.itemId ? p.itemId : null;
        const hw = !p && ui.tab === 'room' ? wallAt(h.x, h.y) : null;
        let cur = '';
        if (hw) cur = hw === 'E' || hw === 'W' ? 'ew-resize' : 'ns-resize';
        else if (hi) cur = ui.tab === 'room' ? 'grab' : 'pointer';
        else if (p) cur = ui.tab === 'layout' || hp ? 'grab' : 'pointer';
        glCanvas.style.cursor = cur;
        if (hu !== ui.hoverUnit || hp !== ui.hoverPart || hi !== ui.hoverItem || hw !== ui.hoverWall) {
          ui.hoverUnit = hu; ui.hoverPart = hp; ui.hoverItem = hi; ui.hoverWall = hw;
          requestRender();
        }
      });
    }

    function wheel(e) {
      e.preventDefault();
      Rig.stop();
      const r = glCanvas.getBoundingClientRect();
      const dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY;
      Rig.zoom(Math.exp(-C.clamp(dy, -240, 240) * 0.0014), e.clientX - r.left, e.clientY - r.top);
    }

    function init() {
      glCanvas.addEventListener('pointerdown', down);
      glCanvas.addEventListener('pointermove', move);
      glCanvas.addEventListener('pointerup', up);
      glCanvas.addEventListener('pointercancel', (e) => { pts.delete(e.pointerId); pinch = null; cancel(); });
      glCanvas.addEventListener('pointerleave', () => {
        if (drag || !(ui.hoverUnit || ui.hoverPart || ui.hoverItem || ui.hoverWall)) return;
        ui.hoverUnit = null; ui.hoverPart = null; ui.hoverItem = null; ui.hoverWall = null;
        requestRender();
      });
      glCanvas.addEventListener('wheel', wheel, { passive: false });
      glCanvas.addEventListener('contextmenu', (e) => e.preventDefault());
      glCanvas.addEventListener('webglcontextrestored', () => { Scene.rebuildAll(); requestRender(); });
    }
    return { init, cancel, busy: () => !!(drag && drag.live) };
  })();

  /* ---------- 키보드 ---------- */

  function nudgeUnit(u, dx, dz) {
    const r = C.resolveUnitMove(u, { x: u.x + dx, z: u.z + dz }, { design, snap: false, thresh: 0, autoRotate: false });
    if (r.x === u.x && r.z === u.z) return;
    u.x = r.x; u.z = r.z;
    touched();
    Scene.placeUnit(u);
    History.commit();
    Panel.refresh();
  }
  function nudgePart(u, p, dir, big) {
    const y = C.stepPart(u, p, dir, { pitch: ui.magnet, step: big ? 10 : 1, count: ui.magnet && big ? 3 : 1 });
    if (y === p.y) return;
    p.y = y;
    touched();
    Scene.rebuildUnit(u);
    History.commit();
    Panel.refresh();
  }
  // 방 단계에서 고른 문·창문은 벽을 따라, 벽체는 바닥에서 옮긴다
  function nudgeItem(id, dx, dz) {
    const o = getOpening(id);
    if (o) {
      const step = C.WALL_AXIS[o.wall] === 'x' ? dx : dz;
      if (!step) return;
      const r = C.resolveOpeningMove(design, o, o.wall, o.offset + step, { snap: false });
      if (r.blocked || r.offset === o.offset) return;
      o.offset = r.offset;
    } else {
      const k = getBlock(id);
      if (!k) return;
      const r = C.resolveUnitMove(k, { x: k.x + dx, z: k.z + dz }, { design, snap: false, thresh: 0, autoRotate: false });
      if (r.x === k.x && r.z === k.z) return;
      k.x = r.x; k.z = r.z;
    }
    afterWallEdit(true);
  }

  function onKey(e) {
    const t = e.target;
    const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
    const mod = e.ctrlKey || e.metaKey;
    // 한글 입력 상태에서도 단축키가 듣도록 글자 키는 자판 위치(code)로 판단한다
    const letter = /^Key[A-Z]$/.test(e.code || '') ? e.code.slice(3).toLowerCase() : null;
    const key = letter || (e.key.length === 1 ? e.key.toLowerCase() : e.key);
    if (mod && key === 'z' && !typing) { e.preventDefault(); if (e.shiftKey) History.forward(); else History.back(); return; }
    if (mod && key === 'y' && !typing) { e.preventDefault(); History.forward(); return; }
    if (typing) return;
    const u = getUnit(ui.selUnit);
    const p = getPart(u, ui.selPart);
    const item = ui.tab === 'room' && (getOpening(ui.selItem) || getBlock(ui.selItem)) ? ui.selItem : null;
    if (mod && key === 'd') { if (u) { e.preventDefault(); Act.duplicateUnit(u.id); } return; }
    if (mod || e.altKey) return;
    if (key === 'Escape') {
      if (Ctl.busy()) Ctl.cancel();
      else if (p) select(u.id, null);
      else if (ui.selItem) selectItem(null);
      else select(null, null);
      return;
    }
    if (key === 'm') { setMagnet(!ui.magnet); return; }
    if (key === 'f') { Rig.fit(true); return; }
    if (key === 'r' && u && ui.tab !== 'interior') { Act.rotateUnit(u.id); return; }
    if (key === 'Delete' || key === 'Backspace') {
      if (t && t.tagName === 'BUTTON' && key === 'Backspace') return;
      if (p) { e.preventDefault(); Act.deletePart(p.id); }
      else if (item) { e.preventDefault(); Act.deleteItem(item); }
      else if (u && ui.tab === 'layout') { e.preventDefault(); Act.deleteUnit(u.id); }
      return;
    }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    const ar = arrows[key];
    if (!ar || (!u && !item)) return;
    if (t && t.getAttribute && t.getAttribute('role') === 'tab') return;
    if (p && ar[1] !== 0) { e.preventDefault(); nudgePart(u, p, ar[1], e.shiftKey); return; }
    if (p) return;
    const ax = Rig.screenAxes();
    const s = e.shiftKey ? 100 : 10;
    const dx = (ax.right.x * ar[0] + ax.up.x * ar[1]) * s;
    const dz = (ax.right.z * ar[0] + ax.up.z * ar[1]) * s;
    if (item) { e.preventDefault(); nudgeItem(item, dx, dz); }
    else if (u && ui.tab === 'layout') { e.preventDefault(); nudgeUnit(u, dx, dz); }
  }

  function setMagnet(on) {
    ui.magnet = !!on;
    Store.prefs();
    Panel.refreshView();
    Panel.refresh();
    toast(ui.magnet ? '자석 앵커를 켰습니다.' : '자석 앵커를 껐습니다. 1mm 단위로 자유롭게 움직입니다.');
  }
