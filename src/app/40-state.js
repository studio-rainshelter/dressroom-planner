  /* ---------- 기록 (실행 취소) ---------- */

  const History = (() => {
    let undo = [];
    let redo = [];
    let last = JSON.stringify(design);

    // keepSample: 예시 배치인 채로 방과 벽만 바꾼 경우
    function commit(keepSample) {
      const s = JSON.stringify(design);
      if (s === last) return false;
      undo.push(last);
      if (undo.length > 150) undo.shift();
      redo = [];
      last = s;
      if (!keepSample) ui.sample = false;
      Store.touch();
      Panel.refreshTop();
      return true;
    }
    function restore(s) {
      const was = design.room;
      design = JSON.parse(s);
      last = s;
      const resized = was.w !== design.room.w || was.d !== design.room.d || was.h !== design.room.h;
      if (!getUnit(ui.selUnit)) { ui.selUnit = null; ui.selPart = null; }
      else if (!getPart(getUnit(ui.selUnit), ui.selPart)) ui.selPart = null;
      if (!getOpening(ui.selItem) && !getBlock(ui.selItem)) ui.selItem = null;
      ui.guides = null; ui.hoverUnit = null; ui.hoverPart = null; ui.hoverItem = null;
      touched();
      Scene.rebuildAll();
      if (resized) { if (ui.view === '3d') Rig.fit(true); else Rig.ensureFit(); }
      Panel.refresh();
      Store.touch();
    }
    function back() {
      if (!undo.length) return;
      redo.push(last);
      restore(undo.pop());
    }
    function forward() {
      if (!redo.length) return;
      undo.push(last);
      restore(redo.pop());
    }
    // 불러오기처럼 설계를 통째로 바꿀 때. record가 false면 기록을 비운다.
    function replace(next, record) {
      if (record) { undo.push(last); redo = []; }
      else { undo = []; redo = []; }
      design = next;
      last = JSON.stringify(design);
      ui.selUnit = null; ui.selPart = null; ui.selItem = null; ui.guides = null;
      ui.hoverUnit = null; ui.hoverPart = null; ui.hoverItem = null;
      touched();
      Scene.rebuildAll();
      if (ui.view === '3d') Rig.fit(false); else Rig.ensureFit();
      Panel.refresh();
    }
    return { commit, back, forward, replace, can: () => ({ undo: undo.length > 0, redo: redo.length > 0 }) };
  })();

  /* ---------- 저장 ---------- */

  const Store = (() => {
    const KEY = 'dressroom-planner:v1';
    let docRef = null;
    let dl = null;
    let localOk = false;
    let savedAt = 0;
    let cloud = 'off';        // off | ok | saving | error | readonly
    let timer = 0;
    let writing = false;
    let dirty = false;
    let lastBody = '';
    let fails = 0;

    const prefsNow = () => ({ magnet: ui.magnet, strength: ui.strength, autoRotate: ui.autoRotate, dims: ui.dims, clothes: ui.clothes, doors: ui.doors });

    function readLocal() {
      try {
        const raw = window.localStorage.getItem(KEY);
        localOk = true;
        if (!raw) return null;
        const o = JSON.parse(raw);
        const d = C.normalizeDesign(o && o.design);
        if (!d) return null;
        return { design: d, savedAt: +o.savedAt || 0, prefs: (o && o.prefs) || {}, refused: !!(o && o.refused), sample: !!(o && o.sample) };
      } catch (e) {
        return null;
      }
    }
    function writeLocal(extra) {
      try {
        const o = { v: 1, savedAt, sample: ui.sample, design, prefs: prefsNow() };
        if (extra) Object.assign(o, extra);
        window.localStorage.setItem(KEY, JSON.stringify(o));
        localOk = true;
      } catch (e) {
        localOk = false;
      }
    }
    function touch() {
      savedAt = Date.now();
      if (cloud !== 'readonly') writeLocal();
      dirty = true;
      schedule(1200);
      Panel.refreshTop();
    }
    function prefs() { if (cloud !== 'readonly') writeLocal(); }
    function schedule(ms) {
      if (!docRef || cloud === 'readonly') return;
      clearTimeout(timer);
      timer = setTimeout(flush, ms);
    }
    async function flush() {
      if (!docRef || writing || !dirty || cloud === 'readonly') return;
      const body = JSON.stringify(design);
      if (body === lastBody) { dirty = false; cloud = 'ok'; Panel.refreshTop(); return; }
      writing = true;
      dirty = false;
      cloud = 'saving';
      Panel.refreshTop();
      let retry = 0;
      try {
        await docRef.set({ v: 1, savedAt, sample: ui.sample, design: JSON.parse(body) });
        lastBody = body;
        cloud = 'ok';
        fails = 0;
      } catch (err) {
        const code = err && err.code;
        if (code === 'invalid_argument') {
          // 이 사람은 공유 설계를 바꿀 수 없다: 보기 전용으로 전환
          cloud = 'readonly';
          ui.readonly = true;
          writeLocal({ refused: true });
        } else if (code === 'not_granted' || code === 'revoked' || code === 'capability_disabled' || code === 'capability_removed') {
          cloud = 'off';
          docRef = null;
        } else {
          // 일시적인 문제는 간격을 늘려 가며 세 번까지 다시 시도하고, 그 뒤에는 다음 변경 때 다시 저장한다
          dirty = true;
          cloud = 'error';
          fails += 1;
          if ((code === 'unavailable' || !code) && fails <= 3) retry = 6000 * fails * fails + Math.random() * 2000;
        }
      }
      writing = false;
      Panel.refreshTop();
      if (cloud === 'ok' && dirty) schedule(1200);
      else if (retry) schedule(retry);
    }

    // 계정 저장소와 파일 저장 기능은 화면이 뜬 뒤에 연결된다. 없으면 이 기기 저장만 쓴다.
    async function connect(local) {
      const cl = window.claude;
      if (!cl || typeof cl.use !== 'function') return;
      cl.use('downloads').then((ns) => { if (ns) { dl = ns; Panel.refresh(); } }, () => {});
      let db = null;
      let user = null;
      try { [db, user] = await Promise.all([cl.use('db'), cl.use('user')]); } catch (e) { db = null; }
      if (!db) return;
      let canWrite = null;
      try { if (user) canWrite = await user.can('data.write'); } catch (e) { canWrite = null; }
      let ref;
      try { ref = db.doc('designs/main'); } catch (e) { return; }
      let snap = null;
      try { snap = await ref.get(); } catch (e) { return; }
      docRef = ref;
      const viewer = canWrite === false || (local && local.refused && canWrite !== true);
      if (viewer) { cloud = 'readonly'; ui.readonly = true; }
      else cloud = 'ok';
      const data = snap && snap.exists ? snap.data() : null;
      const remote = data ? C.normalizeDesign(data.design) : null;
      if (remote) {
        const rAt = +data.savedAt || 0;
        const body = JSON.stringify(remote);
        // 이 기기에 남아 있던 설계보다 계정 쪽이 새것이면 계정 쪽을 쓴다
        if (viewer || !local || rAt > local.savedAt) {
          lastBody = body;
          ui.sample = data.sample === true;      // 예시 그대로 방 크기만 바꿔 둔 경우
          if (body !== JSON.stringify(design)) {
            savedAt = rAt;
            History.replace(remote, false);
            if (!viewer) writeLocal();
            toast(viewer ? '공유된 설계를 불러왔습니다.' : '계정에 저장된 설계를 불러왔습니다.');
          }
        } else if (body !== JSON.stringify(design)) {
          dirty = true;          // 이 기기에만 있던 변경을 계정에 올린다
          schedule(600);
        } else {
          lastBody = body;
        }
      } else if (local && !viewer) {
        dirty = true;
        schedule(600);
      }
      Panel.refresh();
    }

    // Claude 밖의 일반 웹사이트에서는 브라우저의 내려받기 기능으로 저장한다
    const plainWeb = () => !window.claude;
    function browserDownload(filename, data) {
      try {
        const blob = data instanceof Blob ? data : new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
        toast('파일을 내려받았습니다.');
      } catch (err) {
        toast('파일로 저장하지 못했습니다. 설계 코드 복사를 이용하세요.');
      }
    }

    async function saveFile(filename, data) {
      if (!dl) { if (plainWeb()) browserDownload(filename, data); return; }
      try {
        await dl.save({ filename, data });
        toast('파일을 저장했습니다.');
      } catch (err) {
        const code = err && err.code;
        if (code === 'declined') return;
        if (code === 'rate_limited') toast('저장 확인 창이 이미 열려 있습니다.');
        else toast('이 화면에서는 파일로 저장할 수 없습니다. 설계 코드 복사를 이용하세요.');
      }
    }

    function label() {
      if (cloud === 'readonly') return { text: '보기 전용', state: 'idle' };
      if (cloud === 'saving') return { text: '저장 중', state: 'idle' };
      if (cloud === 'error') return { text: localOk ? '계정 저장 실패 · 이 기기에는 저장됨' : '저장 실패', state: 'error' };
      if (cloud === 'ok') return { text: dirty || writing ? '저장 중' : lastBody ? '계정에 저장됨' : '', state: 'idle' };
      if (!savedAt) return { text: '', state: 'idle' };       // 아직 바꾼 것이 없다
      if (localOk) return { text: '이 기기에 저장됨', state: 'idle' };
      return { text: '저장되지 않음', state: 'error' };
    }
    function note() {
      if (cloud === 'readonly') return '공유받은 설계를 보고 있습니다. 바꾼 내용은 저장되지 않으니, 남기려면 설계 파일이나 설계 코드로 내보내세요.';
      if (cloud === 'error') return '계정에 저장하지 못했습니다. 다음에 내용을 바꿀 때 다시 저장합니다. 그동안은 이 기기의 브라우저에 저장됩니다.';
      if (cloud === 'ok' || cloud === 'saving') return '바꾼 내용은 계정에 자동으로 저장되어 다른 기기에서도 이어서 볼 수 있습니다.';
      if (localOk) return '바꾼 내용은 이 기기의 브라우저에 자동으로 저장됩니다. 다른 기기로 옮기려면 설계 코드를 복사하세요.';
      return '이 화면에서는 자동 저장을 쓸 수 없습니다. 설계 코드를 복사해 두세요.';
    }
    return { readLocal, touch, prefs, prefsNow, connect, saveFile, label, note, hasDownloads: () => !!dl || plainWeb(), setSavedAt: (t) => { savedAt = t; } };
  })();

