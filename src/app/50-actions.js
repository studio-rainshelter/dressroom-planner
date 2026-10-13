  /* ---------- 선택, 탭, 보기 ---------- */

  function select(unitId, partId) {
    const u = getUnit(unitId);
    ui.selUnit = u ? u.id : null;
    ui.selPart = u && getPart(u, partId) ? partId : null;
    if (u) ui.selItem = null;
    if (u && ui.view === 'front' && !C.facesWall(u, ui.frontRot)) {
      ui.frontRot = u.rot;
      Scene.setVisibility();
      Rig.ensureFit();
    }
    Panel.refresh();
    requestRender();
  }

  // 방 단계에서 고르는 것: 문, 창문, 기둥, 가벽, 꺾인 벽
  function selectItem(id) {
    ui.selItem = getOpening(id) || getBlock(id) ? id : null;
    if (ui.selItem) { ui.selUnit = null; ui.selPart = null; }
    Panel.refresh();
    requestRender();
  }

  function setView(v, keep) {
    if (ui.view === v && !keep) return;
    ui.view = v;
    const u = getUnit(ui.selUnit);
    const o = getOpening(ui.selItem);
    if (v === 'front' && u) ui.frontRot = u.rot;
    else if (v === 'front' && o) ui.frontRot = WALL_ROT[o.wall];
    ui.hoverWall = null;
    Scene.setVisibility();
    Rig.stop();
    Rig.ensureFit();
    Panel.refreshView();
    requestRender();
  }

  function turnFront(dir) {
    ui.frontRot = (ui.frontRot + (dir > 0 ? 270 : 90)) % 360;
    const u = getUnit(ui.selUnit);
    if (u && !C.facesWall(u, ui.frontRot)) { ui.selUnit = null; ui.selPart = null; }
    Scene.setVisibility();
    Rig.ensureFit();
    Panel.refresh();
  }

  // 좁은 화면에서는 조작 안내 줄이 보이지 않으므로, 단계마다 처음 한 번만 잠깐 알려 준다
  const hinted = {};
  function maybeHint() {
    const bar = $('.hud-bl');
    if (!bar || getComputedStyle(bar).display !== 'none' || hinted[ui.tab] || ui.tab === 'list') return;
    hinted[ui.tab] = true;
    toast($('#hint').textContent);
  }

  function setTab(tab) {
    const solid = doorsSolid();
    ui.tab = tab;
    if (tab !== 'room') ui.selItem = null;
    if (tab === 'interior') {
      if (!getUnit(ui.selUnit) && design.units.length) {
        const first = design.units.find((u) => ui.view !== 'front' || C.facesWall(u, ui.frontRot)) || design.units[0];
        ui.selUnit = first.id; ui.selPart = null;
      }
      const u = getUnit(ui.selUnit);
      if (ui.view === 'top' && design.units.length) setView('front');
      else if (ui.view === 'front' && u && !C.facesWall(u, ui.frontRot)) { ui.frontRot = u.rot; Scene.setVisibility(); Rig.ensureFit(); }
    } else {
      ui.selPart = null;
    }
    ui.hoverUnit = null; ui.hoverPart = null; ui.hoverItem = null; ui.hoverWall = null;
    // 내부 단계에서는 안이 보이도록 문짝을 반투명으로 바꾼다
    if (doorsSolid() !== solid && design.units.some((u) => C.doorKind(u) !== 'none')) Scene.rebuildUnits();
    Panel.refresh();
    $('#panels').scrollTop = 0;
    requestRender();
    maybeHint();
  }

  /* ---------- 동작 ---------- */

  // 문·창문·벽체를 바꾼 뒤: 아직 예시 배치 그대로라면 바뀐 벽에 맞춰 예시를 다시 만든다
  function afterWallEdit(commit) {
    if (ui.sample) {
      design.units = C.sampleUnits(design);
      ui.selUnit = null; ui.selPart = null;
    }
    touched();
    if (ui.sample) Scene.rebuildAll(); else Scene.rebuildRoom();
    if (commit) History.commit(ui.sample);
    Panel.refresh();
  }

  const Act = {
    addUnit(kind) {
      kind = C.KINDS.indexOf(kind) >= 0 ? kind : 'std';
      if (design.units.length >= K.MAX_UNITS) { toast('유닛은 ' + K.MAX_UNITS + '개까지 넣을 수 있습니다.'); return; }
      const room = design.room;
      const sel = getUnit(ui.selUnit);
      const like = sel || design.units[design.units.length - 1] || null;
      const base = { kind };
      if (like) { base.h = Math.min(like.h, room.h); base.d = like.d; base.finish = like.finish; }
      let u = null;
      let spot = null;
      let note = '';
      if (kind === 'corner') {
        // 스피드랙 유닛 옆에 넣는 코너장은 스피드랙으로 만든다
        if (like && like.style === 'rack') base.style = 'rack';
        // 처음 넣을 때의 깊이: 옆 유닛의 깊이를 따르되, 두 날개의 앞면이 넉넉히 남는 데까지
        const sized = (w, w2) => {
          const d = Math.max(K.LIM.corner.d[0], Math.min(base.d || 580, 700, Math.min(w, w2) - K.CORNER_FRONT));
          return Object.assign({}, base, { w, w2, d, d2: d });
        };
        // 방이 좁으면 날개 길이를 줄여 가며 빈 모서리를 찾는다
        for (const s of [1000, 900, 800, 700, 600]) {
          u = C.makeUnit(design, sized(Math.min(s, Math.floor(room.w / 10) * 10), Math.min(s, Math.floor(room.d / 10) * 10)));
          spot = C.findSpot(u, design, sel);
          if (spot) break;
        }
        if (!spot) {
          u = C.makeUnit(design, sized(Math.min(1000, room.w), Math.min(1000, room.d)));
          note = '빈 모서리가 없어 방 가운데에 놓았습니다. 모서리로 끌어 옮기세요.';
        }
        u.parts = C.presetParts(u, 'long');
      } else {
        const first = kind === 'mirror' ? 500 : (sel && sel.kind === 'std' ? sel.w : 800);
        const extra = kind === 'std' && like && like.kind === 'std' ? { style: like.style, door: like.door, doorFinish: like.doorFinish, doorH: like.doorH, doorAt: like.doorAt } : {};
        for (const w of [first, 600, 500, 400, 300]) {
          if (w > first) continue;
          u = C.makeUnit(design, Object.assign({}, base, extra, { w }));
          spot = C.findSpot(u, design, sel);
          if (spot) break;
        }
        if (!spot) {
          u = C.makeUnit(design, Object.assign({}, base, extra, { w: first }));
          note = '빈자리가 없어 방 가운데에 놓았습니다. 끌어서 옮기세요.';
        } else if (u.w !== first) {
          note = '빈자리에 맞춰 폭 ' + u.w + 'mm로 넣었습니다.';
        }
        if (kind === 'mirror') u.parts = C.presetParts(u, 'shelves');
      }
      if (!spot) {
        const c = C.clampToRoom(u, room.w / 2, room.d / 2, 0, room);
        spot = { x: C.half2(c.x), z: C.half2(c.z), rot: 0 };
      }
      u.x = spot.x; u.z = spot.z; u.rot = spot.rot;
      design.units.push(u);
      touched();
      Scene.rebuildUnit(u);
      History.commit();
      if (ui.tab !== 'layout') setTab('layout');
      select(u.id, null);
      if (note) toast(note);
    },
    deleteUnit(id) {
      const i = design.units.findIndex((u) => u.id === id);
      if (i < 0) return;
      const u = design.units[i];
      design.units.splice(i, 1);
      Scene.removeUnit(id);
      const next = design.units[Math.min(i, design.units.length - 1)];
      ui.selUnit = next && ui.tab === 'interior' ? next.id : null;
      ui.selPart = null;
      touched();
      History.commit();
      Panel.refresh();
      toast('유닛을 삭제했습니다: ' + u.name, { label: '되돌리기', fn: History.back });
    },
    duplicateUnit(id) {
      const src = getUnit(id);
      if (!src) return;
      if (design.units.length >= K.MAX_UNITS) { toast('유닛은 ' + K.MAX_UNITS + '개까지 넣을 수 있습니다.'); return; }
      const u = C.makeUnit(design, Object.assign({}, src, { name: null }));
      u.parts = src.parts.map((p) => Object.assign({}, p, { id: C.uid('p') }));
      const spot = C.findSpot(u, design, src);
      if (!spot) { toast(src.kind === 'corner' ? '복제한 코너장을 놓을 빈 모서리가 없습니다.' : '복제한 유닛을 놓을 빈자리가 없습니다.'); return; }
      u.x = spot.x; u.z = spot.z; u.rot = spot.rot;
      design.units.push(u);
      touched();
      Scene.rebuildUnit(u);
      History.commit();
      select(u.id, null);
    },
    rotateUnit(id) {
      const u = getUnit(id);
      if (!u) return;
      C.rotateUnit(u, design);
      if (ui.view === 'front') { ui.frontRot = u.rot; Scene.setVisibility(); Rig.ensureFit(); }
      touched();
      Scene.placeUnit(u);
      History.commit();
      Panel.refresh();
    },
    fitWidth(id) {
      const u = getUnit(id);
      if (!u) return;
      const f = C.fitWidth(u, design);
      if (!f) { toast('양옆에 채울 빈 공간이 없습니다.'); return; }
      u.w = f.w; u.x = f.x; u.z = f.z;
      C.fitParts(u);
      touched();
      Scene.rebuildUnit(u);
      History.commit();
      Panel.refresh();
      toast('폭을 ' + fmt(u.w) + 'mm로 맞췄습니다.');
    },
    // 스피드랙 유닛을 가장 가까운 공식몰 규격으로 맞춘다
    fitRack(id) {
      const u = getUnit(id);
      const t = u ? C.rackStd(u, design.room) : null;
      if (!t) return;
      // 일반 유닛은 가로·깊이·높이, 코너장은 두 날개의 길이와 높이를 맞춘다
      C.applyResize(u, t, design);
      C.settleParts(u);
      touched();
      Scene.rebuildUnit(u);
      History.commit();
      Panel.refresh();
      toast('스피드랙 규격 ' + unitSize(u) + 'mm로 맞췄습니다.', { label: '되돌리기', fn: History.back });
    },
    addPart(type) {
      const u = getUnit(ui.selUnit);
      if (!u) return;
      if (u.parts.length >= K.MAX_PARTS) { toast('한 유닛에는 부품을 ' + K.MAX_PARTS + '개까지 넣을 수 있습니다.'); return; }
      const p = C.makePart(u, type);
      if (!p) { toast('이 유닛에는 ' + C.PART_LABEL[type] + ' 넣을 공간이 없습니다.'); return; }
      u.parts.push(p);
      touched();
      Scene.rebuildUnit(u);
      History.commit();
      select(u.id, p.id);
    },
    deletePart(pid) {
      const u = getUnit(ui.selUnit);
      const i = u ? u.parts.findIndex((p) => p.id === pid) : -1;
      if (i < 0) return;
      u.parts.splice(i, 1);
      if (ui.selPart === pid) ui.selPart = null;
      touched();
      Scene.rebuildUnit(u);
      History.commit();
      Panel.refresh();
    },
    preset(key) {
      const u = getUnit(ui.selUnit);
      if (!u) return;
      const parts = C.presetParts(u, key);
      if (!parts.length) { toast('유닛 높이가 낮아 이 구성을 넣을 수 없습니다.'); return; }
      u.parts = parts;
      ui.selPart = null;
      touched();
      Scene.rebuildUnit(u);
      const changed = History.commit();
      Panel.refresh();
      if (changed) toast('부품 구성을 바꿨습니다: ' + u.name, { label: '되돌리기', fn: History.back });
    },
    // 방 단계: 문, 창문, 기둥, 가벽, 꺾인 벽을 넣는다
    addItem(type) {
      const room = design.room;
      const opening = type === 'door' || type === 'window';
      // 예시 배치는 어차피 다시 만들므로 자리를 찾을 때 빼고 본다
      const scratch = ui.sample ? Object.assign({}, design, { units: [] }) : design;
      let id = null;
      let note = '';
      if (opening) {
        if (design.openings.length >= K.MAX_OPENINGS) { toast('문과 창문은 모두 ' + K.MAX_OPENINGS + '개까지 넣을 수 있습니다.'); return; }
        const o = C.makeOpening(design, type);
        const first = o.width;
        let ok = false;
        // 빈 벽이 좁으면 폭을 줄여 가며 자리를 찾는다
        for (const w of type === 'door' ? [first, 700, 600] : [first, 900, 600, 300]) {
          if (w > first) continue;
          o.width = w;
          const spot = C.findOpeningSpot(o, scratch);
          const r = C.resolveOpeningMove(scratch, o, spot.wall, spot.offset, { snap: false });
          if (r.blocked) continue;
          o.wall = r.wall; o.offset = r.offset; o.width = r.width;
          ok = true;
          break;
        }
        if (!ok) { toast((type === 'door' ? '문을' : '창문을') + ' 놓을 빈 벽이 없습니다.'); return; }
        C.fixOpening(o, room);
        design.openings.push(o);
        id = o.id;
      } else {
        if (design.blocks.length >= K.MAX_BLOCKS) { toast('기둥과 가벽은 모두 ' + K.MAX_BLOCKS + '개까지 넣을 수 있습니다.'); return; }
        const k = C.makeBlock(design, type);
        const spot = C.findBlockSpot(k, scratch);
        k.x = spot.x; k.z = spot.z;
        C.fixBlock(k, room);
        if (spot.forced) note = '빈자리가 없어 방 가운데에 놓았습니다. 끌어서 옮기세요.';
        design.blocks.push(k);
        id = k.id;
      }
      if (ui.tab !== 'room') setTab('room');
      ui.selItem = id; ui.selUnit = null; ui.selPart = null;
      afterWallEdit(true);
      if (note) toast(note);
    },
    deleteItem(id) {
      let name = '';
      let i = design.openings.findIndex((o) => o.id === id);
      if (i >= 0) {
        name = C.openingName(design, design.openings[i]);
        design.openings.splice(i, 1);
      } else {
        i = design.blocks.findIndex((k) => k.id === id);
        if (i < 0) return;
        name = design.blocks[i].name;
        design.blocks.splice(i, 1);
      }
      if (ui.selItem === id) ui.selItem = null;
      if (ui.hoverItem === id) ui.hoverItem = null;
      afterWallEdit(true);
      toast('삭제했습니다: ' + name, { label: '되돌리기', fn: History.back });
    },
    load(raw, msg) {
      const d = C.normalizeDesign(raw);
      if (!d) { toast('설계를 읽을 수 없습니다. 복사한 내용 전체가 들어 있는지 확인하세요.'); return false; }
      History.replace(d, true);
      ui.sample = false;
      Store.touch();
      toast(msg || '설계를 불러왔습니다.', { label: '되돌리기', fn: History.back });
      return true;
    },
  };
