  /* ---------- 설정 패널 ---------- */

  const Panel = (() => {
    const nums = [];
    const rows = new Map();
    let rowsUnit = null;
    let roomBase = null;
    const MIRROR_SW = 'linear-gradient(135deg, #eef3f5 0%, #b3c0c6 48%, #e3eaed 100%)';
    const setVal = (el, v) => { if (el && document.activeElement !== el && el.value !== String(v)) el.value = v; };
    const pressed = (el, on) => el.setAttribute('aria-pressed', on ? 'true' : 'false');
    const show = (id, on) => { document.getElementById(id).hidden = !on; };
    const selU = () => getUnit(ui.selUnit);
    const selO = () => getOpening(ui.selItem);
    const selB = () => getBlock(ui.selItem);
    // 이 유닛이 들어 있는 미닫이문 줄
    const runOf = (u) => C.slideRuns(design).find((r) => r.ids.indexOf(u.id) >= 0) || null;

    // 숫자를 치는 동안 바로 반영할 가장 작은 값. 그보다 작은 값은 입력을 마쳤을 때(Enter, 다른 곳 누르기) 반영한다.
    const liveMin = (el) => Math.max(+el.min, +el.dataset.live || 0);

    function bindNum(id, get, set) {
      const el = document.getElementById(id);
      el.addEventListener('input', () => {
        const v = parseFloat(el.value);
        if (!isFinite(v) || v < liveMin(el) || v > +el.max) return;
        set(Math.round(v), false);
      });
      el.addEventListener('change', () => {
        let v = parseFloat(el.value);
        const cur = get();
        if (cur == null) return;
        if (!isFinite(v)) v = cur;
        set(C.clamp(Math.round(v), +el.min, +el.max), true);
        const now = get();
        if (now != null) el.value = now;
      });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
      nums.push({ el, get });
    }

    function afterUnit(u, commit) {
      touched();
      Scene.rebuildUnit(u);
      if (commit) History.commit();
      refresh();
    }

    function roomChanged(commit) {
      const room = design.room;
      if (roomBase) {
        // 숫자를 넣는 동안에는 칸에 들어설 때의 배치에서 다시 계산한다 (중간 값 때문에 밀려난 채로 남지 않도록)
        const base = JSON.parse(roomBase);
        design.openings = base.openings; design.blocks = base.blocks; design.units = base.units;
      }
      for (const o of design.openings) C.fixOpening(o, room);
      for (const k of design.blocks) C.fixBlock(k, room);
      if (ui.sample) {
        // 아직 예시 배치 그대로라면 바뀐 방에 맞춰 예시를 다시 만든다
        design.units = C.sampleUnits(design);
        ui.selUnit = null; ui.selPart = null;
      } else {
        for (const u of design.units) {
          const c = C.clampToRoom(u, u.x, u.z, u.rot, room);
          u.x = C.half2(c.x); u.z = C.half2(c.z);
        }
      }
      touched();
      Scene.rebuildAll();
      if (commit) { roomBase = null; if (ui.view === '3d') Rig.fit(true); else Rig.ensureFit(); History.commit(ui.sample); }
      refresh();
    }

    function swatches(id, list, attr, look, name) {
      $(id).innerHTML = list.map((f) => '<button type="button" data-' + attr + '="' + f + '" aria-pressed="false" aria-label="' + name(f) + '" title="' + name(f) + '" style="--sw:' + look(f) + '"></button>').join('');
    }

    function init() {
      // 숫자 칸의 −, + 버튼
      document.addEventListener('click', (e) => {
        const b = e.target.closest && e.target.closest('.step');
        if (!b) return;
        const el = b.dataset.for ? document.getElementById(b.dataset.for) : b.parentElement.querySelector('input');
        if (!el) return;
        const inc = (+el.dataset.inc || 10) * (e.shiftKey ? 10 : 1) * (+b.dataset.dir);
        let v = parseFloat(el.value);
        if (!isFinite(v)) v = +el.min || 0;
        el.value = C.clamp(v + inc, +el.min, +el.max);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      });

      // 위쪽 도구
      $('#btn-undo').addEventListener('click', History.back);
      $('#btn-redo').addEventListener('click', History.forward);
      $('#view-seg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setView(b.dataset.view); });
      $('#front-turn').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) turnFront(+b.dataset.turn); });
      $('#btn-magnet').addEventListener('click', () => setMagnet(!ui.magnet));
      $('#btn-dims').addEventListener('click', () => { ui.dims = !ui.dims; Store.prefs(); refreshView(); requestRender(); });
      $('#btn-clothes').addEventListener('click', () => { ui.clothes = !ui.clothes; Store.prefs(); Scene.rebuildUnits(); refreshView(); requestRender(); });
      $('#btn-doors').addEventListener('click', () => { ui.doors = !ui.doors; Store.prefs(); Scene.rebuildUnits(); refreshView(); requestRender(); });
      $('#btn-fit').addEventListener('click', () => Rig.fit(true));
      $$('.tabs [role="tab"]').forEach((b) => {
        b.addEventListener('click', () => setTab(b.dataset.tab));
        b.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          const tabs = $$('.tabs [role="tab"]');
          const i = (tabs.indexOf(b) + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
          tabs[i].focus();
          setTab(tabs[i].dataset.tab);
        });
      });
      $('#btn-start-empty').addEventListener('click', () => {
        // 방과 벽은 그대로 두고 예시 유닛만 비운다
        const d = JSON.parse(JSON.stringify(design));
        d.units = [];
        History.replace(d, true);
        ui.sample = false;
        Store.touch();
        setTab('room');
        toast('빈 방에서 시작합니다.', { label: '되돌리기', fn: History.back });
      });

      // 1 방
      ['room-w', 'room-d', 'room-h'].forEach((id) => {
        const el = document.getElementById(id);
        el.addEventListener('focus', () => { roomBase = JSON.stringify(design); });
        el.addEventListener('blur', () => { roomBase = null; });
      });
      bindNum('room-w', () => design.room.w, (v, c) => { design.room.w = v; roomChanged(c); });
      bindNum('room-d', () => design.room.d, (v, c) => { design.room.d = v; roomChanged(c); });
      bindNum('room-h', () => design.room.h, (v, c) => { design.room.h = v; roomChanged(c); });

      $('#wall-add').addEventListener('click', (e) => { const b = e.target.closest('button[data-add]'); if (b) Act.addItem(b.dataset.add); });
      $('#wall-list').addEventListener('click', (e) => {
        const b = e.target.closest('.unit-row');
        if (b) selectItem(b.dataset.item === ui.selItem ? null : b.dataset.item);
      });
      $('#btn-del-item').addEventListener('click', () => ui.selItem && Act.deleteItem(ui.selItem));

      // 문과 창문
      $('#wi-wall').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        const o = selO();
        if (!b || !o || o.wall === b.dataset.wall) return;
        const r = C.resolveOpeningMove(design, o, b.dataset.wall, o.offset, { snap: false });
        if (r.blocked) { toast('그 벽에는 놓을 자리가 없습니다.'); return; }
        o.wall = r.wall; o.offset = r.offset; o.width = r.width;
        C.fixOpening(o, design.room);
        afterWallEdit(true);
      });
      bindNum('wi-offset', () => (selO() ? selO().offset : null), (v, c) => {
        const o = selO();
        if (!o) return;
        const r = C.resolveOpeningMove(design, o, o.wall, v, { snap: false });
        if (!r.blocked) o.offset = r.offset;
        if (c && !r.blocked && r.offset !== v) toast('다른 문·창문과 겹치지 않는 가장 가까운 자리로 옮겼습니다.');
        afterWallEdit(c);
      });
      bindNum('wi-width', () => (selO() ? selO().width : null), (v, c) => {
        const o = selO();
        if (!o) return;
        const was = { offset: o.offset, width: o.width };
        o.width = v;
        C.fixOpening(o, design.room);
        const r = C.resolveOpeningMove(design, o, o.wall, o.offset, { snap: false });
        if (r.blocked) {
          o.offset = was.offset; o.width = was.width;
          if (c) toast('공간이 부족해 바꾸지 못했습니다.');
        } else {
          o.offset = r.offset;
        }
        afterWallEdit(c);
      });
      const fieldO = (id, key) => bindNum(id, () => { const o = selO(); return o && o[key] != null ? o[key] : null; }, (v, c) => {
        const o = selO();
        if (!o) return;
        o[key] = v;
        C.fixOpening(o, design.room);
        afterWallEdit(c);
      });
      fieldO('wi-height', 'height');
      fieldO('wi-sill', 'sill');
      const segO = (id, key) => $(id).addEventListener('click', (e) => {
        const b = e.target.closest('button');
        const o = selO();
        if (!b || !o || o.type !== 'door' || o[key] === b.dataset[key]) return;
        o[key] = b.dataset[key];
        afterWallEdit(true);
      });
      segO('#wi-leaf', 'leaf');
      segO('#wi-swing', 'swing');
      segO('#wi-hinge', 'hinge');

      // 기둥, 가벽, 꺾인 벽
      const sizeB = (patch, c) => {
        const k = selB();
        if (!k) return;
        C.applyResize(k, patch, design, K.LIM.block);
        C.fixBlock(k, design.room);
        afterWallEdit(c);
      };
      bindNum('wb-w', () => (selB() ? selB().w : null), (v, c) => sizeB({ w: v }, c));
      bindNum('wb-d', () => (selB() ? selB().d : null), (v, c) => sizeB({ d: v }, c));
      bindNum('wb-h', () => (selB() ? C.blockH(selB(), design.room) : null), (v, c) => {
        const k = selB();
        if (!k) return;
        k.h = v;
        k.full = v >= design.room.h;
        C.fixBlock(k, design.room);
        afterWallEdit(c);
      });
      const edgeB = (left, top, c) => {
        const k = selB();
        if (!k) return;
        C.setUnitEdge(k, design, left, top);
        afterWallEdit(c);
      };
      bindNum('wb-left', () => (selB() ? Math.round(C.box(selB()).x0) : null), (v, c) => edgeB(v, null, c));
      bindNum('wb-top', () => (selB() ? Math.round(C.box(selB()).z0) : null), (v, c) => edgeB(null, v, c));
      $('#wb-full').addEventListener('change', (e) => {
        const k = selB();
        if (!k) return;
        k.full = e.target.checked;
        if (!k.full && k.h >= design.room.h) k.h = Math.min(1200, design.room.h - 100);
        C.fixBlock(k, design.room);
        afterWallEdit(true);
      });

      swatches('#wall-color', C.WALL_COLORS, 'color', (c) => WALL_COLOR[c].hex, (c) => WALL_COLOR[c].name);
      $('#wall-color').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b || design.room.wallColor === b.dataset.color) return;
        design.room.wallColor = b.dataset.color;
        touched();
        Scene.rebuildRoom();
        History.commit(ui.sample);
        refresh();
      });

      // 2 배치
      $('#btn-add-unit').addEventListener('click', () => Act.addUnit('std'));
      $('#btn-add-corner').addEventListener('click', () => Act.addUnit('corner'));
      $('#btn-add-mirror').addEventListener('click', () => Act.addUnit('mirror'));
      $('#unit-list').addEventListener('click', (e) => {
        const b = e.target.closest('.unit-row');
        if (b) select(b.dataset.unit === ui.selUnit ? null : b.dataset.unit, null);
      });
      $('#btn-rotate').addEventListener('click', () => ui.selUnit && Act.rotateUnit(ui.selUnit));
      $('#btn-dup').addEventListener('click', () => ui.selUnit && Act.duplicateUnit(ui.selUnit));
      $('#btn-del-unit').addEventListener('click', () => ui.selUnit && Act.deleteUnit(ui.selUnit));
      const nameEl = $('#unit-name');
      nameEl.addEventListener('change', () => {
        const u = selU();
        if (!u) return;
        const v = nameEl.value.trim().slice(0, 20);
        if (v) { u.name = v; touched(); History.commit(); }
        nameEl.value = u.name;
        refresh();
      });
      nameEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameEl.blur(); });
      const sizeU = (patch, c) => { const u = selU(); if (u) { C.applyResize(u, patch, design); afterUnit(u, c); } };
      const edgeU = (left, top, c) => {
        const u = selU();
        if (!u) return;
        C.setUnitEdge(u, design, left, top);
        touched();
        Scene.placeUnit(u);
        if (c) History.commit();
        refresh();
      };
      bindNum('unit-w', () => (selU() ? selU().w : null), (v, c) => sizeU({ w: v }, c));
      bindNum('unit-w2', () => (selU() && selU().kind === 'corner' ? selU().w2 : null), (v, c) => sizeU({ w2: v }, c));
      bindNum('unit-h', () => (selU() ? selU().h : null), (v, c) => sizeU({ h: v }, c));
      bindNum('unit-d', () => (selU() ? selU().d : null), (v, c) => sizeU({ d: v }, c));
      bindNum('unit-d2', () => (selU() && selU().kind === 'corner' ? C.d2of(selU()) : null), (v, c) => sizeU({ d2: v }, c));
      bindNum('unit-left', () => (selU() ? Math.round(C.box(selU()).x0) : null), (v, c) => edgeU(v, null, c));
      bindNum('unit-top', () => (selU() ? Math.round(C.box(selU()).z0) : null), (v, c) => edgeU(null, v, c));
      $('#unit-style').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        const u = selU();
        // 일반 유닛은 세 가지, 코너장은 판넬형과 스피드랙 가운데 고른다
        if (!b || !u || u.kind === 'mirror' || u.style === b.dataset.style) return;
        if (u.kind === 'corner' && b.dataset.style === 'pole') return;
        u.style = b.dataset.style;
        if (u.style !== 'panel') { u.door = 'none'; C.setDoor(u, null); }      // 문은 판넬형에만 단다
        if (u.style === 'rack' && C.RACK_FINISHES.indexOf(u.finish) < 0) u.finish = 'white';
        // 형태에 따라 선반 두께와 내부 높이가 달라진다: 겹친 부품은 떼어 놓고, 들어가지 않는 부품은 뺀다
        const removed = C.settleParts(u);
        afterUnit(u, true);
        if (removed) toast('들어가지 않는 부품 ' + removed + '개를 뺐습니다.', { label: '되돌리기', fn: History.back });
      });
      swatches('#unit-finish', C.FINISHES, 'finish', (f) => FINISH[f].body, (f) => FINISH[f].name);
      $('#unit-finish').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        const u = selU();
        if (!b || !u || u.finish === b.dataset.finish) return;
        // 문 색을 따로 고르지 않았다면 몸통 색을 따라간다 (미닫이문은 줄 전체의 색이라 그대로 둔다)
        if (u.doorFinish === u.finish && C.doorKind(u) !== 'slide') u.doorFinish = b.dataset.finish;
        u.finish = b.dataset.finish;
        afterUnit(u, true);
      });
      $('#unit-door').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        const u = selU();
        if (!b || !u || u.kind === 'mirror' || u.door === b.dataset.door) return;
        u.door = b.dataset.door;
        // 문 종류가 바뀌면 문 높이는 전체로 되돌린다 (여닫이와 미닫이는 달 수 있는 범위가 다르다)
        C.setDoor(u, null);
        if (C.doorKind(u) === 'slide') {
          // 이미 있는 미닫이문 줄에 붙으면 그 줄의 문 색을 따른다
          const r = runOf(u);
          const other = r && r.units.find((k) => k.id !== u.id);
          if (other) u.doorFinish = C.doorFinishOf(other);
        }
        afterUnit(u, true);
      });
      // 문 높이와 맞출 쪽. 미닫이문은 한 줄로 묶인 유닛들이 같은 문짝을 쓰므로 함께 바꾼다.
      const doorTargets = (u) => { const r = C.doorKind(u) === 'slide' ? runOf(u) : null; return r ? r.units : [u]; };
      const setDoorH = (h, at, c) => {
        const u = selU();
        if (!u || C.doorKind(u) === 'none') return;
        for (const k of doorTargets(u)) C.setDoor(k, h, at);
        afterUnit(u, c);
      };
      bindNum('unit-door-h', () => { const sp = selU() ? C.doorSpan(selU()) : null; return sp ? Math.round(sp.h) : null; }, (v, c) => setDoorH(v, null, c));
      $('#unit-door-at').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        const sp = selU() ? C.doorSpan(selU()) : null;
        if (!b || !sp || !sp.partial || (selU().doorAt || 'top') === b.dataset.at) return;
        setDoorH(sp.h, b.dataset.at, true);
      });
      $('#btn-door-fit').addEventListener('click', () => {
        const u = selU();
        const h = u ? C.doorAboveDrawers(u) : null;
        if (h == null) { toast('서랍 위에 문을 달 높이가 남지 않습니다.'); return; }
        const was = JSON.stringify(design.units);
        setDoorH(h, 'top', true);
        // 바뀐 것이 있을 때만 되돌리기를 내민다 (이미 맞춰져 있으면 되돌릴 것이 없다)
        if (JSON.stringify(design.units) === was) toast('문이 이미 서랍 위에 맞춰져 있습니다.');
        else toast('문 아래 끝을 서랍 윗면에 맞췄습니다. 문 높이 ' + fmt(h) + 'mm', { label: '되돌리기', fn: History.back });
      });
      swatches('#unit-door-finish', C.DOOR_FINISHES, 'finish', (f) => (f === 'mirror' ? MIRROR_SW : FINISH[f].body), (f) => DOOR_FINISH_NAME[f]);
      $('#unit-door-finish').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        const u = selU();
        if (!b || !u || u.kind === 'mirror') return;
        // 미닫이문은 한 줄로 묶인 유닛들이 같은 문짝을 쓴다
        const r = C.doorKind(u) === 'slide' ? runOf(u) : null;
        const targets = r ? r.units : [u];
        if (targets.every((k) => C.doorFinishOf(k) === b.dataset.finish)) return;
        for (const k of targets) k.doorFinish = b.dataset.finish;
        afterUnit(u, true);
      });
      $('#unit-hinge').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        const u = selU();
        if (!b || !u || u.hinge === b.dataset.hinge) return;
        u.hinge = b.dataset.hinge;
        afterUnit(u, true);
      });
      $('#btn-fit-width').addEventListener('click', () => ui.selUnit && Act.fitWidth(ui.selUnit));
      $('#btn-fit-rack').addEventListener('click', () => ui.selUnit && Act.fitRack(ui.selUnit));
      $('#btn-open-interior').addEventListener('click', () => setTab('interior'));
      $('#magnet-on').addEventListener('change', (e) => setMagnet(e.target.checked));
      $('#magnet-strength').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        ui.strength = b.dataset.strength; Store.prefs(); refresh();
      });
      $('#magnet-rotate').addEventListener('change', (e) => { ui.autoRotate = e.target.checked; Store.prefs(); });

      // 3 내부
      const stepUnit = (dir) => {
        const n = design.units.length;
        if (!n) return;
        const i = Math.max(0, design.units.findIndex((u) => u.id === ui.selUnit));
        select(design.units[(i + dir + n) % n].id, null);
      };
      $('#unit-prev').addEventListener('click', () => stepUnit(-1));
      $('#unit-next').addEventListener('click', () => stepUnit(1));
      $('#int-add').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.add) Act.addPart(b.dataset.add);
        else if (b.dataset.preset) Act.preset(b.dataset.preset);
      });
      const list = $('#part-list');
      const onField = (el, commit) => {
        const u = selU();
        const p = getPart(u, el.dataset.part);
        if (!p) return;
        let v = parseFloat(el.value);
        if (!isFinite(v)) { if (commit) refresh(); return; }
        if (!commit && (v < liveMin(el) || v > +el.max)) return;
        v = C.clamp(Math.round(v), +el.min, +el.max);
        let ok;
        if (el.dataset.field === 'ref') ok = C.setPartRef(u, p, v);
        else if (el.dataset.field === 'n') ok = C.setDrawerSize(u, p, v, p.eh);
        else ok = C.setDrawerSize(u, p, p.n, v);
        if (!ok && commit) toast('공간이 부족해 바꾸지 못했습니다.');
        touched();
        Scene.rebuildUnit(u);
        if (commit) {
          History.commit();
          const shown = el.dataset.field === 'ref' ? C.partRef(p, u) : el.dataset.field === 'n' ? p.n : p.eh;
          if (ok && el.dataset.field === 'ref' && Math.round(shown) !== v) toast('다른 부품과 겹치지 않는 가장 가까운 높이로 옮겼습니다.');
          el.value = Math.round(shown);
        }
        refresh();
      };
      list.addEventListener('input', (e) => { if (e.target.dataset && e.target.dataset.part) onField(e.target, false); });
      list.addEventListener('change', (e) => { if (e.target.dataset && e.target.dataset.part) onField(e.target, true); });
      list.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); e.target.blur(); } });
      list.addEventListener('click', (e) => {
        const del = e.target.closest('.del');
        if (del) { Act.deletePart(del.dataset.part); return; }
        const title = e.target.closest('.part-title');
        if (title) select(ui.selUnit, title.dataset.part === ui.selPart ? null : title.dataset.part);
      });
      list.addEventListener('focusin', (e) => {
        const li = e.target.closest('.part');
        if (li && e.target.tagName === 'INPUT' && li.dataset.part !== ui.selPart) { ui.selPart = li.dataset.part; markRows(); requestRender(); }
      });
      list.addEventListener('focusout', () => setTimeout(() => { if (!list.contains(document.activeElement)) orderRows(); }, 0));

      // 4 목록
      $('#issues').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.unit) {
          setTab(b.dataset.part ? 'interior' : 'layout');
          select(b.dataset.unit, b.dataset.part || null);
        } else if (b.dataset.item) {
          setTab('room');
          selectItem(b.dataset.item);
        }
      });
      $('#btn-save-file').addEventListener('click', () => Store.saveFile('dressroom-plan.json', JSON.stringify({ app: 'dressroom-3d-planner', design }, null, 1)));
      $('#btn-save-image').addEventListener('click', () => {
        Scene.render(true);
        Overlay.draw();
        const out = document.createElement('canvas');
        out.width = glCanvas.width; out.height = glCanvas.height;
        const g = out.getContext('2d');
        g.drawImage(glCanvas, 0, 0);
        g.drawImage(Overlay.canvas, 0, 0, out.width, out.height);
        out.toBlob((blob) => { if (blob) Store.saveFile('dressroom-plan.png', blob); else toast('이미지를 만들지 못했습니다.'); }, 'image/png');
      });
      $('#file-open').addEventListener('change', (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > 2e6) { toast('설계 파일이 아닙니다. 이 플래너에서 저장한 json 파일을 고르세요.'); return; }
        const rd = new FileReader();
        rd.onload = () => loadText(String(rd.result || ''));
        rd.onerror = () => toast('파일을 읽지 못했습니다.');
        rd.readAsText(f);
      });
      $('#btn-copy-code').addEventListener('click', () => {
        const text = JSON.stringify({ app: 'dressroom-3d-planner', design });
        const fallback = () => {
          const ta = $('#design-code');
          ta.value = text; ta.focus(); ta.select();
          toast('아래 칸에 설계 코드를 넣었습니다. 선택된 내용을 복사하세요.');
        };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => toast('설계 코드를 복사했습니다.'), fallback);
        else fallback();
      });
      $('#btn-load-code').addEventListener('click', () => {
        const ta = $('#design-code');
        if (!ta.value.trim()) { toast('먼저 아래 칸에 설계 코드를 붙여 넣으세요.'); ta.focus(); return; }
        if (loadText(ta.value)) ta.value = '';
      });
      $('#btn-load-sample').addEventListener('click', () => Act.load(C.sampleDesign(), '예시 배치를 불러왔습니다.'));
      $('#btn-clear').addEventListener('click', () => {
        if (!design.units.length) { toast('지울 유닛이 없습니다.'); return; }
        const d = JSON.parse(JSON.stringify(design));
        d.units = [];
        History.replace(d, true);
        ui.sample = false;
        Store.touch();
        toast('유닛을 모두 지웠습니다.', { label: '되돌리기', fn: History.back });
      });
    }

    function loadText(text) {
      let raw = null;
      try { raw = JSON.parse(text); } catch (e) { raw = null; }
      if (raw && raw.design) raw = raw.design;
      return Act.load(raw);
    }

    function partRowHtml(u, p) {
      const numBox = (field, label, unit, inc) => '<span class="num"><button type="button" class="step" data-dir="-1" aria-label="' + label + ' 줄이기">−</button>'
        + '<input id="f-' + p.id + '-' + field + '" type="number" inputmode="numeric" step="1" data-inc="' + inc + '" data-part="' + p.id + '" data-field="' + field + '">'
        + '<span class="u">' + unit + '</span><button type="button" class="step" data-dir="1" aria-label="' + label + ' 늘리기">+</button></span>';
      const row = (field, label, unit, inc) => '<div class="spec-row"><label for="f-' + p.id + '-' + field + '">' + label + '</label>' + numBox(field, label, unit, inc) + '</div>';
      let h = '<div class="part-head"><button type="button" class="part-title" data-part="' + p.id + '">' + PART_ICON[p.type] + '<span class="t"></span></button>'
        + '<button type="button" class="del" data-part="' + p.id + '" aria-label="' + C.PART_LABEL[p.type] + ' 삭제" title="삭제">' + TRASH + '</button></div>';
      h += row('ref', PART_FIELD[p.type], 'mm', C.pitchOf(u).step);
      if (p.type === 'drawer') h += row('n', '단 수', '단', 1) + row('eh', '단 높이', 'mm', 10);
      h += '<p class="part-info"></p>';
      return h;
    }

    function orderRows() {
      const u = selU();
      const list = $('#part-list');
      if (!u || list.contains(document.activeElement)) return;
      const sorted = u.parts.slice().sort((a, b) => b.y - a.y);
      let prev = null;
      for (const p of sorted) {
        const r = rows.get(p.id);
        if (!r) continue;
        const want = prev ? prev.nextSibling : list.firstChild;
        if (r.li !== want) list.insertBefore(r.li, want);
        prev = r.li;
      }
    }
    function markRows() {
      rows.forEach((r, id) => { r.li.dataset.selected = id === ui.selPart ? 'true' : 'false'; });
    }

    function renderParts() {
      const u = selU();
      const list = $('#part-list');
      if (!u) { list.textContent = ''; rows.clear(); rowsUnit = null; return; }
      if (rowsUnit !== u.id) { list.textContent = ''; rows.clear(); rowsUnit = u.id; }
      const it = C.interior(u);
      rows.forEach((r, id) => { if (!getPart(u, id)) { r.li.remove(); rows.delete(id); } });
      const sorted = u.parts.slice().sort((a, b) => b.y - a.y);
      sorted.forEach((p, i) => {
        let r = rows.get(p.id);
        if (!r) {
          const li = document.createElement('li');
          li.className = 'part';
          li.dataset.part = p.id;
          li.innerHTML = partRowHtml(u, p);
          list.appendChild(li);
          r = { li, title: $('.t', li), info: $('.part-info', li), ref: $('[data-field="ref"]', li), n: $('[data-field="n"]', li), eh: $('[data-field="eh"]', li) };
          rows.set(p.id, r);
        }
        r.li.style.order = i;
        const ph = C.partH(p, u);
        const off = C.refOffset(p, u);
        r.ref.dataset.inc = C.pitchOf(u).step;       // − + 버튼은 한 칸씩: 판넬형·기둥형 32mm, 스피드랙 30mm
        r.ref.min = Math.round(it.y0 + off);
        r.ref.max = Math.round(Math.max(it.y0, it.y1 - ph) + off);
        setVal(r.ref, Math.round(C.partRef(p, u)));
        let title = C.PART_LABEL[p.type];
        let info = '';
        let level = '';
        if (p.type === 'drawer') {
          title += ' ' + p.n + '단';
          r.n.min = K.LIM.drawer.n[0]; r.n.max = K.LIM.drawer.n[1];
          r.eh.min = K.LIM.drawer.eh[0]; r.eh.max = K.LIM.drawer.eh[1];
          r.eh.dataset.live = K.LIVE.drawer.eh;
          setVal(r.n, p.n); setVal(r.eh, p.eh);
          info = '전체 높이 ' + fmt(ph) + 'mm';
        } else if (p.type === 'rod') {
          const c = C.hangClear(u, p);
          const up = C.partGaps(u, p).above;
          info = '아래 여유 ' + fmt(c) + 'mm · ' + C.hangLabel(c);
          if (up < K.HOOK - 4) info += ' · 위 여유 ' + fmt(Math.max(0, up)) + 'mm라 옷걸이를 걸기 어렵습니다';
          if (c < K.HANG.short || up < K.HOOK - 4) level = 'warn';
        } else {
          const g = C.partGaps(u, p);
          info = '위 칸 ' + fmt(g.above) + 'mm · 아래 칸 ' + fmt(g.below) + 'mm';
        }
        if (r.title.textContent !== title) r.title.textContent = title;
        if (r.info.textContent !== info) r.info.textContent = info;
        r.info.dataset.level = level;
      });
      markRows();
      orderRows();
    }

    // 목록을 다시 그리되, 내용이 같으면 그대로 두고 누르고 있던 줄의 초점을 지킨다
    function fillList(ul, html) {
      if (ul.dataset.html === html) return;
      const act = document.activeElement && ul.contains(document.activeElement) ? document.activeElement.id : null;
      ul.innerHTML = html;
      ul.dataset.html = html;
      if (act && document.getElementById(act)) document.getElementById(act).focus();
    }
    function rowHtml(attr, id, on, lead, name, size, hint) {
      const lv = levelOf(id);
      return '<li><button type="button" class="unit-row" id="row-' + id + '" data-' + attr + '="' + id + '" aria-pressed="' + on + '"' + (hint ? ' title="' + hint + '"' : '') + '>'
        + lead
        + '<span class="nm">' + esc(name) + (lv ? '<span class="flag" data-level="' + lv + '" title="확인할 점이 있습니다">!</span>' : '') + '</span>'
        + '<span class="sz">' + size + '</span></button></li>';
    }

    function renderRoom() {
      const room = design.room;
      const area = room.w * room.d / 1e6;
      $('#room-area').textContent = '바닥 면적 ' + area.toFixed(2) + '㎡ (약 ' + (area / 3.3058).toFixed(1) + '평)';
      const html = design.openings.map((o) => rowHtml('item', o.id, o.id === ui.selItem, '<span class="ic">' + ITEM_ICON[o.type] + '</span>',
        C.openingName(design, o), '<span class="k">' + WALL_SHORT[o.wall] + '</span>' + o.width + ' × ' + o.height, '폭 × 높이'))
        .concat(design.blocks.map((k) => rowHtml('item', k.id, k.id === ui.selItem, '<span class="ic">' + ITEM_ICON[k.kind] + '</span>',
          k.name, k.w + ' × ' + k.d + (k.full ? '' : ' × ' + k.h), k.full ? '가로 × 세로' : '가로 × 세로 × 높이'))).join('');
      fillList($('#wall-list'), html);
      show('wall-empty', design.openings.length + design.blocks.length === 0);

      const o = selO();
      const k = o ? null : selB();
      show('wall-editor', !!(o || k));
      show('wall-fields-opening', !!o);
      show('wall-fields-block', !!k);
      let note = '';
      if (o) {
        const door = o.type === 'door';
        const L = door ? K.LIM.door : K.LIM.window;
        const len = C.wallLen(room, o.wall);
        const ns = C.WALL_AXIS[o.wall] === 'x';
        $('#wall-editor-title').textContent = C.openingName(design, o);
        $$('#wi-wall button').forEach((b) => pressed(b, b.dataset.wall === o.wall));
        $('#wi-offset-help').textContent = ns ? '왼쪽 모서리 기준' : '위쪽 모서리 기준';
        const LV = door ? K.LIVE.door : K.LIVE.window;
        $('#wi-offset').max = Math.max(0, len - o.width);
        $('#wi-width').min = Math.min(L.width[0], len);
        $('#wi-width').max = Math.min(L.width[1], len);
        $('#wi-width').dataset.live = LV.width;
        $('#wi-height').min = Math.min(L.height[0], room.h);
        $('#wi-height').max = Math.min(L.height[1], room.h);
        $('#wi-height').dataset.live = LV.height;
        $('#wi-sill').max = Math.max(0, room.h - o.height);
        show('wi-sill-row', !door);
        show('wi-leaf-row', door);
        show('wi-swing-row', door && o.leaf === 'swing');
        show('wi-hinge-row', door && o.leaf !== 'none');
        if (door) {
          $$('#wi-leaf button').forEach((b) => pressed(b, b.dataset.leaf === o.leaf));
          $$('#wi-swing button').forEach((b) => pressed(b, b.dataset.swing === o.swing));
          const hb = $$('#wi-hinge button');
          hb[0].textContent = ns ? '왼쪽' : '위쪽';
          hb[1].textContent = ns ? '오른쪽' : '아래쪽';
          hb.forEach((b) => pressed(b, b.dataset.hinge === o.hinge));
          $('#wi-hinge-label').textContent = o.leaf === 'slide' ? '밀어 두는 쪽' : '경첩 위치';
          note = '문 앞 ' + fmt(C.zoneDepth(o)) + 'mm는 비워 둘 공간으로 바닥에 표시합니다.' + (o.leaf === 'swing' && o.swing === 'in' ? ' 방 안으로 열리는 문은 문 폭만큼 비웁니다.' : '');
        } else {
          note = '유닛이 창문 아래쪽보다 높으면 창문을 가린다고 알려 줍니다.';
        }
      } else if (k) {
        $('#wall-editor-title').textContent = k.name;
        $('#wb-w').max = Math.min(K.LIM.block.w[1], room.w);
        $('#wb-d').max = Math.min(K.LIM.block.d[1], room.d);
        $('#wb-h').max = room.h;
        $('#wb-full').checked = !!k.full;
        show('wb-h-row', !k.full);
        $('#wb-left').max = Math.max(0, Math.round(room.w - k.w));
        $('#wb-top').max = Math.max(0, Math.round(room.d - k.d));
        note = {
          pillar: '기둥은 벽이나 모서리에 붙여 놓습니다. 유닛은 기둥을 피해 놓이고, 기둥 옆면에도 붙습니다.',
          partition: '가벽은 방 안을 나누는 얇은 벽입니다. 가로와 세로를 바꿔 방향과 길이를 정합니다.',
          notch: '꺾인 벽은 방의 모서리에 붙여 놓고, 가로와 세로로 막을 크기를 정합니다.',
        }[k.kind];
      }
      $('#wall-editor-note').textContent = note;
      $$('#wall-color button').forEach((b) => pressed(b, b.dataset.color === room.wallColor));
      $('#wall-color-name').textContent = (WALL_COLOR[room.wallColor] || WALL_COLOR.white).name;
    }

    function renderUnitEditor(u) {
      const room = design.room;
      const b = C.box(u);
      const corner = u.kind === 'corner';
      const rack = C.isRack(u);
      const dk = C.doorKind(u);
      const R = Math.round;
      $('#unit-editor-title').textContent = u.name;
      setVal($('#unit-name'), u.name);
      // 크기 칸의 범위: 그림이 깨지지 않는 한계만 둔다. live는 치는 동안 바로 반영하기 시작하는 값.
      const LW = corner ? K.LIM.corner.w : K.LIM.unit.w;
      const LD = corner ? K.LIM.corner.d : K.LIM.unit.d;
      const LV = corner ? K.LIVE.corner : K.LIVE.unit;
      const range = (id, lo, hi, live) => { const el = $(id); el.min = lo; el.max = hi; el.dataset.live = live; };
      range('#unit-w', LW[0], LW[1], LV.w);
      $('#unit-w-help').textContent = corner ? '뒷벽을 따라' : '폭';
      show('unit-w2-row', corner);
      range('#unit-w2', K.LIM.corner.w2[0], K.LIM.corner.w2[1], K.LIVE.corner.w2);
      range('#unit-h', K.LIM.unit.h[0], K.LIM.unit.h[1], K.LIVE.unit.h);
      // 코너장은 두 부분의 깊이를 따로 정한다. ㄱ자 모양이 유지되도록 반대쪽 날개의 앞면을 100mm 남기는 데까지.
      range('#unit-d', LD[0], corner ? Math.max(LD[0], Math.min(LD[1], u.w2 - K.CORNER_MIN)) : LD[1], LV.d);
      $('#unit-d-help').textContent = corner ? '뒷벽 쪽 부분' : '앞뒤';
      show('unit-d2-row', corner);
      range('#unit-d2', LD[0], corner ? Math.max(LD[0], Math.min(LD[1], u.w - K.CORNER_MIN)) : LD[1], LV.d);
      $('#unit-left').max = Math.max(0, R(room.w - (b.x1 - b.x0)));
      $('#unit-top').max = Math.max(0, R(room.d - (b.z1 - b.z0)));
      // 형태: 일반 유닛은 세 가지, 코너장은 판넬형과 스피드랙
      show('unit-style-row', u.kind !== 'mirror');
      $$('#unit-style button').forEach((k) => { pressed(k, k.dataset.style === u.style); k.hidden = corner && k.dataset.style === 'pole'; });
      // 색상: 스피드랙은 프레임(백색·검정)과 합판(백색·우드)의 네 가지 조합으로 보여 준다
      $$('#unit-finish button').forEach((k) => {
        const f = k.dataset.finish;
        const name = rack && RACK_FINISH[f] ? RACK_FINISH[f].name : FINISH[f].name;
        pressed(k, f === u.finish);
        k.hidden = rack && C.RACK_FINISHES.indexOf(f) < 0;
        k.style.setProperty('--sw', rack ? rackSwatch(f) : FINISH[f].body);
        k.title = name;
        k.setAttribute('aria-label', name);
      });
      $('#unit-finish-name').textContent = rack ? RACK_FINISH[u.finish].name : FINISH[u.finish].name;

      // 문: 거울장은 늘 거울 문, 기둥형과 스피드랙에는 문이 없다
      const run = dk === 'slide' ? runOf(u) : null;
      const hi = dk === 'hinge' ? C.hingeInfo(u) : null;
      const df = run ? run.finish : C.doorFinishOf(u);
      show('unit-door-row', u.kind !== 'mirror' && u.style === 'panel');
      $$('#unit-door button').forEach((k) => { pressed(k, k.dataset.door === dk); k.hidden = corner && k.dataset.door === 'slide'; });
      show('unit-door-finish-row', dk !== 'none' && u.kind !== 'mirror');
      $$('#unit-door-finish button').forEach((k) => pressed(k, k.dataset.finish === df));
      $('#unit-door-finish-name').textContent = DOOR_FINISH_NAME[df];
      show('unit-hinge-row', !!hi && (corner || hi.leaves === 1));
      $$('#unit-hinge button').forEach((k) => pressed(k, k.dataset.hinge === u.hinge));
      // 문 높이: 줄이면 문을 맞출 쪽(위·아래)을 고를 수 있고, 서랍이 있으면 서랍 위에 맞출 수 있다
      const sp = C.doorSpan(u);
      show('unit-door-h-row', !!sp);
      show('unit-door-at-row', !!sp && sp.partial);
      show('unit-door-fit-row', !!sp && u.parts.some((p) => p.type === 'drawer'));
      if (sp) {
        range('#unit-door-h', Math.min(K.DOOR_MIN, R(sp.full)), R(sp.full), K.LIVE.doorH);
        $('#unit-door-h-help').textContent = sp.partial ? '바닥에서 ' + fmt(sp.y0) + '~' + fmt(sp.y1) : '전체 높이';
        $$('#unit-door-at button').forEach((k) => pressed(k, k.dataset.at === (u.doorAt || 'top')));
      }
      let info = '';
      if (hi && corner) info = '코너 접이문 2짝 (' + R(hi.widths[0]) + ' + ' + R(hi.widths[1]) + 'mm) · 열 때 앞으로 ' + fmt(hi.swing) + 'mm가 필요합니다.';
      else if (hi) info = (C.doorFinishOf(u) === 'mirror' ? '거울 문 ' : '여닫이문 ') + hi.leaves + '짝 · 한 짝 ' + R(hi.widths[0]) + 'mm · 열 때 앞으로 ' + fmt(hi.swing) + 'mm가 필요합니다.';
      else if (run) info = '미닫이문 ' + run.n + '짝 · 한 짝 ' + R(run.pw) + 'mm · ' + (run.units.length > 1 ? '맞닿은 유닛 ' + run.units.length + '개를 한 줄로 묶었습니다.' : '높이와 문 높이가 같은 미닫이문 유닛을 옆에 붙이면 한 줄로 묶입니다.');
      else if (u.style === 'pole') info = '기둥형에는 문을 달 수 없습니다.';
      // 스피드랙: 짜임과, 공식몰 규격과 다를 때 가까운 규격
      const std = rack ? C.rackStd(u, room) : null;
      if (rack && corner) {
        info = '코너 스피드랙은 기둥 6개와 맨 위·맨 아래 선반으로 그리고, 그 사이에 선반과 행거봉을 넣습니다. 실제 기둥 수와 코너 연결 방식은 판매처에서 확인하세요. 문은 판넬형에만 답니다.';
        if (std) info += ' 공식몰의 코너 행거와 크기가 다릅니다. 가까운 규격은 ' + std.w + ' × ' + std.w2 + ' × ' + std.h + 'mm입니다.';
      } else if (rack) {
        info = '스피드랙은 기둥 4개와 맨 위·맨 아래 선반(기본 2단)으로 짜고, 그 사이에 선반, 행거봉, 서랍을 넣습니다. 문은 판넬형에만 답니다.';
        if (std) info += ' 지금 크기는 공식몰 규격과 다릅니다. 가까운 규격은 ' + std.w + ' × ' + std.h + ' × ' + std.d + 'mm입니다.';
      }
      $('#unit-door-info').textContent = info;
      show('unit-door-info', !!info);
      $('#btn-fit-width').hidden = corner;
      $('#btn-fit-rack').hidden = !std;
    }

    function refreshTop() {
      const c = History.can();
      $('#btn-undo').disabled = !c.undo;
      $('#btn-redo').disabled = !c.redo;
      const s = Store.label();
      const el = $('#save-state');
      if (el.textContent !== s.text) el.textContent = s.text;
      el.dataset.state = s.state;
      $('#sample-notice').hidden = !ui.sample || ui.readonly;
      $('#readonly-notice').hidden = !ui.readonly;
      const list = issues();
      const badge = $('#issue-badge');
      badge.hidden = !list.length;
      if (list.length) {
        badge.textContent = list.length;
        badge.dataset.level = list.some((i) => i.level === 'bad') ? 'bad' : 'warn';
        badge.title = '확인할 점 ' + list.length + '개';
      }
    }

    function refreshView() {
      $$('#view-seg button').forEach((b) => pressed(b, b.dataset.view === ui.view));
      $('#front-turn').hidden = ui.view !== 'front';
      $('#front-wall-name').textContent = WALL_NAME[ROT_WALL[ui.frontRot]];
      pressed($('#btn-magnet'), ui.magnet);
      $('#magnet-state').textContent = ui.magnet ? 'ON' : 'OFF';
      $('#btn-magnet').setAttribute('aria-label', ui.magnet ? '자석 앵커 켜짐' : '자석 앵커 꺼짐');
      pressed($('#btn-dims'), ui.dims);
      pressed($('#btn-clothes'), ui.clothes);
      // 문짝 표시: 문이 달린 유닛이 있을 때만 보이고, 내부 단계에서는 늘 반투명이다
      const doors = $('#btn-doors');
      doors.hidden = !design.units.some((u) => C.doorKind(u) !== 'none');
      doors.disabled = ui.tab === 'interior';
      pressed(doors, doorsSolid());
      $('#hint').textContent = hintText();
    }

    function hintText() {
      if (coarse) {
        if (ui.tab === 'interior') return '부품을 위아래로 끌어 옮깁니다. 두 손가락으로 확대하고 이동합니다.';
        if (ui.tab === 'layout') return '유닛을 끌어 옮깁니다. 빈 곳을 끌면 화면이 돌고, 두 손가락으로 확대합니다.';
        if (ui.tab === 'room') return ui.view === 'top' ? '벽을 끌어 방 크기를 바꿉니다. 문·창문·기둥도 끌어 옮깁니다.' : '문·창문·기둥을 끌어 옮깁니다. 벽은 평면 보기에서 끌어 옮깁니다.';
        return '끌어서 화면을 돌리고 두 손가락으로 확대합니다. 유닛을 누르면 배치 단계로 갑니다.';
      }
      if (ui.tab === 'interior') {
        if (ui.view === 'top') return '평면 보기에서는 부품을 위아래로 옮길 수 없습니다. 3D나 정면 보기로 바꾸세요.';
        return '부품을 위아래로 끌어 옮깁니다. 방향키 ↑↓로 한 칸씩, Delete로 삭제합니다.';
      }
      if (ui.tab === 'layout' && ui.selUnit) return '끌어서 이동 · R 회전 · 방향키 10mm · 두 번 누르면 내부 구성 · Alt 자석 반대로';
      if (ui.tab === 'layout') return '유닛을 끌어 옮깁니다. 빈 곳을 끌면 화면이 돌고, 휠로 확대, 오른쪽 버튼으로 화면을 옮깁니다.';
      if (ui.tab === 'room' && ui.selItem) return '끌어서 이동 · 방향키 10mm · Delete 삭제 · Alt 자석 반대로';
      if (ui.tab === 'room' && ui.view === 'top') return '벽을 끌어 방 크기를 바꿉니다. 문·창문은 벽을 따라, 기둥·가벽은 바닥에서 끌어 옮깁니다.';
      if (ui.tab === 'room') return '문·창문·기둥을 끌어 옮깁니다. 벽을 끌어 방 크기를 바꾸려면 평면 보기로 바꾸세요.';
      return '끌어서 화면을 돌리고 휠로 확대합니다. 유닛을 누르면 배치 단계로 갑니다.';
    }

    const syncNums = () => { for (const n of nums) { const v = n.get(); if (v != null) setVal(n.el, v); } };

    // 끄는 동안 바뀌는 값만 갱신
    function live() {
      if (ui.tab === 'interior') renderParts();
      else if (ui.tab === 'room') renderRoom();
      syncNums();
    }

    function refresh() {
      // 탭
      $$('.tabs [role="tab"]').forEach((b) => {
        const on = b.dataset.tab === ui.tab;
        b.setAttribute('aria-selected', on ? 'true' : 'false');
        b.tabIndex = on ? 0 : -1;
        $('#panel-' + b.dataset.tab).hidden = !on;
      });
      refreshTop();
      refreshView();
      const u = selU();

      // 1 방
      renderRoom();

      // 2 배치
      fillList($('#unit-list'), design.units.map((k) => rowHtml('unit', k.id, k.id === ui.selUnit, '<span class="sw" style="background:' + swatchOf(k) + '"></span>',
        k.name, (k.kind === 'corner' ? '<span class="k">ㄱ</span>' : '') + unitSize(k), k.kind === 'corner' ? '가로 × 옆 길이 × 높이' : '가로 × 높이 × 깊이')).join(''));
      $('#unit-empty').hidden = design.units.length > 0;
      $('#unit-editor').hidden = !u;
      $('#unit-none').hidden = !!u || !design.units.length;
      if (u) renderUnitEditor(u);
      $('#magnet-on').checked = ui.magnet;
      $('#magnet-rotate').checked = ui.autoRotate;
      $('#magnet-rotate').disabled = !ui.magnet;
      $$('#magnet-strength button').forEach((b) => { pressed(b, b.dataset.strength === ui.strength); b.disabled = !ui.magnet; });

      // 3 내부
      const has = design.units.length > 0;
      $('#int-none').hidden = has;
      $('#int-pager').hidden = !has;
      $('#int-add').hidden = !has || !u;
      $('#int-parts').hidden = !has || !u;
      if (u) {
        $('#int-unit-name').textContent = u.name;
        $('#int-unit-size').textContent = unitSize(u) + ' · ' + (u.kind === 'corner' ? (u.style === 'rack' ? '코너 스피드랙' : '코너장') : u.kind === 'mirror' ? '거울장' : u.style === 'rack' ? '스피드랙' : u.style === 'pole' ? '기둥형' : '판넬형');
        $('#pitch-mm').textContent = C.pitchOf(u).step;
        // 코너장에는 서랍을 넣지 않는다
        const drawer = C.partTypes(u).indexOf('drawer') >= 0;
        $$('#int-add [data-add="drawer"], #int-add [data-preset="drawers"], #int-add [data-preset="mixed"]').forEach((k) => { k.hidden = !drawer; });
      } else if (has) {
        $('#int-unit-name').textContent = '유닛을 고르세요';
        $('#int-unit-size').textContent = '';
      }
      $('#unit-prev').disabled = design.units.length < 2 && !!u;
      $('#unit-next').disabled = design.units.length < 2 && !!u;
      renderParts();
      $('#part-empty').hidden = !u || u.parts.length > 0;

      syncNums();

      // 4 목록
      if (ui.tab === 'list') renderList();
    }

    function renderList() {
      const s = C.summary(design);
      const rowsHtml = [
        ['방', design.room.w + ' × ' + design.room.d + ' × ' + design.room.h + ' mm'],
        ['바닥 면적', s.area.toFixed(2) + '㎡'],
        ['유닛', s.units + '개'],
        ['행거봉', s.rods + '개 · 총 ' + (s.rodLen / 1000).toFixed(2) + 'm'],
        ['선반', s.shelves + '개'],
        ['서랍', s.drawers + '칸'],
        ['문짝', s.doors + '짝'],
      ].map((r) => '<dt>' + r[0] + '</dt><dd>' + r[1] + '</dd>').join('');
      $('#stats').innerHTML = rowsHtml;
      const list = issues();
      $('#issues').innerHTML = list.map((i) => '<li data-level="' + i.level + '"><span class="mark" aria-hidden="true">' + (i.level === 'bad' ? '×' : '!') + '</span>'
        + '<button type="button"' + (i.unitId ? ' data-unit="' + i.unitId + '"' : '') + (i.partId ? ' data-part="' + i.partId + '"' : '') + (i.itemId ? ' data-item="' + i.itemId + '"' : '') + '>'
        + esc(i.text) + '</button></li>').join('');
      $('#issues-none').hidden = list.length > 0;
      const bom = C.bom(design);
      $('#bom').innerHTML = bom.map((r) => '<tr><td>' + r.kind + '</td><td class="spec-cell">' + r.spec + '</td><td class="n">' + r.qty + '</td></tr>').join('');
      $('#bom-none').hidden = bom.length > 0;
      $('#save-note').textContent = Store.note();
      $('#btn-save-file').hidden = !Store.hasDownloads();
      $('#btn-save-image').hidden = !Store.hasDownloads();
    }

    return { init, refresh, refreshTop, refreshView, live };
  })();
