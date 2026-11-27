/* TRPG Archive · 주기적으로 읽어 오기 · 받아쓰기 · 알림 · 설정 탭
 * 모든 js 파일은 index.html 아래에서 순서대로 읽고 이름(함수·변수)을 함께 쓴다. */
'use strict';
/* ── 주기적으로 읽어 오기 ── */
let failCount = 0, live = {}, lastNewAt = Date.now();   // live: 마지막으로 받은 세션 번호·초기화 번호 (말할 때 붙여 둔다)
function net(cls, text){ $('netPill').className = 'chip net ' + cls; $('netPill').lastChild.textContent = text; }
/* 화면 구석의 판 표시: 화면(APP_VER)과 서버(CODE_VER). 예전 서버는 판을 알려 주지 않아 "예전 판"으로 적는다 */
function verTag(code){
  const el = $('verTag'); if (!el) return;
  const sh = x => String(x || '').replace(/^\d{4}-/, '');
  const app = typeof APP_VER === 'string' ? APP_VER : '';
  el.textContent = '판 ' + sh(app) + (code === app ? '' : ' · 서버 ' + (code ? sh(code) : '예전 판'));
  el.title = '화면 ' + app + ' · 서버 ' + (code || '예전 판 (판 번호를 알려 주지 않음)');
  el.classList.toggle('diff', !!code && code !== app || !code);
}
/* 새 말 확인 고리. pollGen: 지켜보기(아래)가 멈춘 고리를 버리고 새로 시작할 때 옛 고리가 이어 돌지 않게 하는 번호.
 * 서버에 닿지 못한 것만 '연결 끊김'으로 센다. 받은 답을 화면에 그리다 난 오류는 연결 문제가 아니므로 세지 않고 다음 확인을 계속한다. */
let pollGen = 0, pollBeat = Date.now(), pollErr = '';
async function pollOnce(gen){
  if (gen == null) gen = ++pollGen; else if (gen !== pollGen) return;
  pollBeat = Date.now();
  let r = null;
  try {
    r = await api('poll', { since: lastId, me: cfg.name, mic: micStatus, why: micStatus === 'off' ? micWhy : '', hid: document.hidden ? '1' : '' });
    if (!r.ok) throw new Error(r.error);
  } catch (e) {
    if (gen !== pollGen) return;
    failCount++; pollErr = String(e.message || e); net('err', '연결 끊김 · 재시도');
    if (String(e.message || '').includes('비밀번호')) { stopAll(''); showJoin('방 비밀번호가 틀렸어요'); return; }
    setTimeout(() => pollOnce(gen), pollGap()); return;
  }
  if (gen !== pollGen) return;
  failCount = 0; pollErr = ''; net('on', '연결됨');
  try {
    const v = r.v;
    if (live.resetVer !== undefined && v.resetVer !== live.resetVer) {
      resetLog(); ver = {}; live = {};
      keeperReset();                                  // 지워진 회의록으로 만들던 마스터 쪽 결과·초안도 버린다 (늦게 오는 답 포함)
      toast('마스터가 기록을 초기화했어요');
      setTimeout(() => pollOnce(gen), 300); return;
    }
    live = { session: v.session, resetVer: v.resetVer }; sessMark();
    $('sessPill').textContent = '세션 ' + v.session; verTag(v.code);
    if (r.jumped) resetLog();                       // 너무 오래 끊겨 있었으면 최근 300줄부터 다시
    if (!lastId) hasOlder = r.from > 0;
    addLogLines(r.lines, { quiet: !lastId });
    if (r.lines.length) { const ll = r.lines[r.lines.length - 1]; lastId = Math.max(lastId, ll.last || ll.id); lastNewAt = Date.now(); }      // last: 나뉘어 저장된 긴 말의 마지막 조각 번호
    else if (!allLines.length) renderLog();
    renderWho(r.presence);
    renderSumState(v);
    if (data && ver.sumVer && v.sumVer !== ver.sumVer) srSay('새 요약이 도착했어요');
    // 자료 다시 받기는 기다리지 않는다: 자료(요약·정리)가 커서 늦게 와도 새 말 확인은 계속 돈다
    if (!data || ['sumVer','notesVer','charVer','imgVer','session','resetVer','colorVer'].some(k => v[k] !== ver[k])) refreshDataOnce().then(() => { try { nextCheck(); } catch (_) {} });      // 자료가 오면 다음 할 일의 '그 뒤 바뀜' 줄을 다시 고친다
    nextCheck();                                    // 세션이 넘어갔으면 지난 추천을 걷고, 다음 할 일 탭이 열려 있으면 "그 뒤 새 기록" 줄을 고친다 (AI는 부르지 않음)
  } catch (e) { try { console.error('poll 화면 처리 오류', e); } catch (_) {} }
  setTimeout(() => pollOnce(gen), pollGap());
}
// 자료 다시 받기는 한 번에 하나만 (늦게 오는 동안 같은 요청을 겹쳐 보내지 않는다)
let refreshing = null;
function refreshDataOnce(){ if (!refreshing) refreshing = refreshData().finally(() => { refreshing = null; }); return refreshing; }
/* 지켜보기: 새 말 확인이 45초 넘게 한 번도 돌지 않았으면(요청이 멈춤, 숨은 탭에서 타이머가 밀림 등) 새로 시작한다 */
setInterval(() => {
  if ($('app').classList.contains('hide') || !cfg.url) return;
  if (Date.now() - pollBeat > 45000) { pollBeat = Date.now(); pollOnce(); }
}, 10000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - pollBeat > 10000 && !$('app').classList.contains('hide') && cfg.url) pollOnce(); });
/* 새로 고침 간격: 대화가 오가거나 내 마이크가 켜져 있으면 4초, 조용하면 8~12초, 다른 화면을 보고 있으면 15초.
 * 서버는 25초 동안 소식이 없으면 '접속 끊김'으로 보므로 15초를 넘기지 않는다. */
function pollGap(){
  if (failCount) return 8000;
  if (document.hidden) return 15000;
  const quiet = Date.now() - lastNewAt;
  if (running || quiet < 60000) return 4000;
  return quiet < 180000 ? 8000 : 12000;
}

/* ── 받아쓰기 → 시트 ──
 * 말이 끝나는 순간 발언ID·이름·세션·초기화 번호를 붙여 이 기기에 먼저 저장한다 (방마다 따로).
 * 보내기는 한 번에 하나만. 서버가 "저장됨/이미 있음/버림"이라고 확인해 준 줄만 대기열에서 뺀다.
 * 응답이 끊겨서 다시 보내도 서버가 발언ID로 걸러 내서 두 번 저장되지 않는다. */
const QMAX = 5000;
const qKey = url => 't_q:' + (url || cfg.url);
let queue = [], sending = false, sendErr = '', sendErrAt = 0, sentOnce = false, authBad = false;
function newUid(){
  const r = (window.crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '').slice(0, 12) : Math.random().toString(36).slice(2, 14);
  return Date.now().toString(36) + r;
}
/* 기기 보관 두 번째 자리(IndexedDB 'trpg_q' v2, 저장소 'u'): 발언 하나가 기록 하나다 (키 = 발언ID).
 *   기록 = { uid, room(방 주소), st('q' 못 보낸 말 | 'f' 저장 못 한 말), name, session, rv, t, text, why }
 * 여러 탭이 동시에 써도 자기 발언만 넣고 빼므로 서로의 말을 덮어쓰지 않는다. 상태를 바꿀 때(q↔f)는 같은 키에 한 번 쓰는 것이라 중간 상태가 없다.
 * 예전 판(v1, 저장소 'q': 방마다 배열 하나)에 남은 말은 처음 열 때 한 번에(트랜잭션 하나로) 옮긴다.
 * localStorage가 꽉 차거나 지워져도 여기에 남고, 다시 읽을 때 이미 보낸 말이 섞여 있어도 서버가 발언ID로 걸러서 두 번 저장되지 않는다. */
const qdb = {
  p: null, ok: undefined,
  open(){
    if (this.p) return this.p;
    const p = new Promise((ok, no) => {
      let end = false; const fin = (f, v) => { if (!end) { end = true; f(v); } };
      try {
        const r = indexedDB.open('trpg_q', 2);
        r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains('q')) d.createObjectStore('q'); if (!d.objectStoreNames.contains('u')) d.createObjectStore('u', { keyPath: 'uid' }).createIndex('room', 'room'); };
        r.onerror = () => fin(no, r.error);
        r.onsuccess = () => {
          const d = r.result; d.onversionchange = () => { try { d.close(); } catch(_) {} if (this.p === p) this.p = null; };
          try {                                   // 예전 판 자료 옮기기: 옮겨 적기와 지우기가 한 트랜잭션이라 중간에 창이 닫혀도 둘 중 하나에는 남는다
            const t = d.transaction(['q', 'u'], 'readwrite'), q = t.objectStore('q'), u = t.objectStore('u');
            q.openCursor().onsuccess = ev => { const c = ev.target.result; if (!c) return; const room = String(c.key).slice(4);
              (Array.isArray(c.value) ? c.value : []).forEach(x => { if (x && x.uid && x.text) { const g = u.get(x.uid); g.onsuccess = () => { if (!g.result) u.put({ uid: x.uid, room, st: 'q', name: x.name, session: x.session, rv: x.rv, t: x.t, text: x.text, why: '' }); }; } });
              c.delete(); c.continue(); };
            t.oncomplete = t.onerror = t.onabort = () => fin(ok, d);
          } catch (_) { fin(ok, d); }
        };
        setTimeout(() => fin(no, new Error('열리지 않음')), 4000);     // 예전 판 화면이 다른 탭에 열려 있으면 판 올리기가 막힌다: 기다리지 않고 다음에 다시 연다
      } catch (e) { fin(no, e); }
    });
    this.p = p; p.catch(() => { this.ok = false; if (this.p === p) this.p = null; });
    return p;
  },
  async tx(mode, fn){
    try { const d = await this.open(); const out = await new Promise((ok, no) => { const t = d.transaction('u', mode); const res = fn(t.objectStore('u')); t.oncomplete = () => ok(res); t.onerror = t.onabort = () => no(t.error); }); this.ok = true; return out; }
    catch (_) { this.ok = false; return null; }
  },
  /* 넣기(같은 발언ID가 있으면 상태만 바뀐다). 돌려주는 값: 기록됐으면 true (원문이 이 자리에 남아 있다는 뜻).
   * 조건부 쓰기: 상태 'q'로 적을 때, 이미 'f'(저장 못 한 말)로 적힌 기록은 덮어쓰지 않는다. 다른 탭이 방금 'f'로 옮긴 말을 옛 상태를 든 탭이 'q'로 되돌리지 못하게 하려는 것.
   * 읽기와 쓰기가 한 트랜잭션 안이라 사이에 다른 탭이 끼어들지 못한다. 'f' → 'q'는 [다시 보내기]만 한다 (force). 어느 쪽이든 원문은 지워지지 않는다. */
  put(items, room, st, why, force){
    if (!items.length) return Promise.resolve(true);
    return this.tx('readwrite', s => {
      items.forEach(x => {
        const rec = { uid: x.uid, room, st, name: x.name, session: x.session, rv: x.rv, t: x.t, text: x.text, why: why || x.why || '' };
        if (st === 'q' && !force) { const g = s.get(x.uid); g.onsuccess = () => { if (!(g.result && g.result.st === 'f')) s.put(rec); }; }
        else s.put(rec);
      });
      return true;
    }).then(r => !!r);
  },
  del(uids){ if (!uids.length) return Promise.resolve(true); return this.tx('readwrite', s => { uids.forEach(u => s.delete(u)); return true; }).then(r => !!r); },
  // 방 하나(또는 전체)의 기록. 읽지 못하면 null
  all(room){ return this.tx('readonly', s => { const o = { v: [] }, rq = room ? s.index('room').getAll(room) : s.getAll(); rq.onsuccess = () => { o.v = rq.result || []; }; return o; }).then(o => o ? o.v : null); }
};
/* 같은 기기의 다른 탭에 "서버가 이 발언을 받았다"고 알린다 (지원하는 브라우저만). 받은 탭은 그 말을 대기열에서 걷고 다시 보관하지 않는다.
 * 이게 없어도 기록은 안전하다(다시 보내면 서버가 발언ID로 거른다). 저장된 말의 옛 사본이 다른 탭에서 되살아나 한 번 더 보내지는 일과 숫자가 두 번 세어지는 일을 줄인다. */
let qBc = null;
try { if (typeof BroadcastChannel === 'function') { qBc = new BroadcastChannel('trpg_q'); qBc.onmessage = ev => {
  const m = ev.data || {}; if (m.room !== cfg.url || !Array.isArray(m.saved) || !m.saved.length) return;
  const ids = new Set(m.saved); let n = 0;
  m.saved.forEach(u => { qGone.add(u); qSaved.add(u); qInDb.delete(u); qT.delete(u); qTries.delete(u); });
  queue = queue.filter(q => { if (ids.has(q.uid)) { n++; return false; } return true; });
  failDrop(m.saved);
  if (n) { stat('peerSaved', n); saveQueue(); } else sendState();
}; } } catch(_) { qBc = null; }
const qItem = x => ({ uid: x.uid, name: x.name, session: x.session || '', rv: x.rv || '', t: x.t, text: x.text });
const byTime = (x, y) => (String(x.t) < String(y.t) ? -1 : String(x.t) > String(y.t) ? 1 : 0);
/* qGone: 이 탭이 대기열에서 뺀 말(서버가 확인했거나 "저장 못 한 말"로 옮김) → 다른 탭·저장소에서 다시 주워 오지 않는다
 * qSaved: 서버가 받았다고 확인한 말 → 두 번째 자리에서도 지운다.  qInDb: 두 번째 자리에 기록된 것이 확인된 말.  qLsOk: 마지막 localStorage 쓰기가 됐는지 */
const qGone = new Set(), qSaved = new Set(), qInDb = new Set(), qPutting = new Set(), qT = new Map(), qTries = new Map();
let qLsOk = true, qStoreErr = false;
// 이 기기 어디에도 저장되지 않고 이 창의 메모리에만 있는 못 보낸 말 수 (창을 닫으면 사라진다)
function qMemOnly(){ return qLsOk ? 0 : queue.filter(x => !qInDb.has(x.uid)).length; }
function loadQueue(){
  try { queue = JSON.parse(S.get(qKey()) || '[]'); } catch(_) { queue = []; }
  if (!Array.isArray(queue)) queue = [];
  // 예전 버전 대기열(t_queue)을 지금 방·이름으로 옮긴다
  const old = S.get('t_queue');
  if (old) {
    try { JSON.parse(old).forEach(x => x && x.text && queue.push({ uid: newUid(), name: cfg.name, session: '', rv: '', t: x.t, text: x.text })); } catch(_) {}
    S.del('t_queue');
  }
  saveQueue();
  dbSync(true);                                         // 두 번째 자리에만 남아 있던 말·저장 못 한 말을 되살린다
}
/* 두 번째 자리를 읽어 맞춘다. first = 방에 들어온 직후(나이와 상관없이 모두 되살림), 아니면 1분 넘게 그대로인 말만(다른 탭이 남기고 닫힌 것) 이어받는다 */
function dbSync(first){
  const room = cfg.url; if (!room) return Promise.resolve();
  return qdb.all(room).then(a => {
    if (room !== cfg.url || !Array.isArray(a)) return;
    const mine = new Set(queue.map(x => x.uid)), old = Date.now() - 60000, fails = []; let n = 0;
    a.forEach(x => {
      if (!x || !x.uid || !x.text) return;
      if (x.st === 'f') { fails.push(x); return; }
      if (qSaved.has(x.uid)) { qdb.del([x.uid]); return; }                   // 서버 저장이 확인된 뒤에 남은 찌꺼기
      if (mine.has(x.uid)) { qInDb.add(x.uid); return; }
      if (qGone.has(x.uid) || (!first && new Date(x.t).getTime() > old)) return;
      qInDb.add(x.uid); queue.push(qItem(x)); n++;
    });
    failDb = fails;
    if (n) { queue.sort(byTime); saveQueue(); } else sendState();
  });
}
/* 같은 방을 두 탭에서 열어도 서로의 미전송 말을 지우지 않게: 저장할 때 저장소에 있는 다른 탭의 말을 합친다.
 * 이 탭이 대기열에서 뺀 말(qGone)만 뺀다. 두 번째 자리에는 새로 생긴 내 말만 발언 하나씩 넣는다 (다른 탭의 기록은 건드리지 않음). */
function saveQueue(){
  // 못 보낸 말이 5,000줄을 넘어도 버리지 않는다: 오래된 것부터 "저장 못 한 말" 목록으로 옮긴다 (복사·내려받기·다시 보내기 가능)
  if (queue.length > QMAX) { const over = queue.slice(0, queue.length - QMAX); queue = queue.slice(-QMAX); over.forEach(x => { qGone.add(x.uid); qInDb.delete(x.uid); }); failAdd(over, '못 보낸 말이 5,000줄을 넘어 따로 보관'); toast('못 보낸 말이 너무 많아 오래된 ' + over.length + '줄을 "저장 못 한 말"로 옮겼어요 (설정 탭)'); }
  if (cfg.url) {
    let other = []; try { other = JSON.parse(localStorage.getItem(qKey()) || '[]'); } catch (_) {}
    const mine = new Set(queue.map(x => x.uid));
    const all = queue.concat((Array.isArray(other) ? other : []).filter(x => x && x.uid && !mine.has(x.uid) && !qGone.has(x.uid)));
    qLsOk = true;
    try { if (all.length) localStorage.setItem(qKey(), JSON.stringify(all)); else localStorage.removeItem(qKey()); }
    catch (_) { qLsOk = false; }
    const fresh = queue.filter(x => !qInDb.has(x.uid) && !qPutting.has(x.uid));
    if (fresh.length) {
      const room = cfg.url; fresh.forEach(x => qPutting.add(x.uid));
      qdb.put(fresh, room, 'q').then(ok => {
        const late = [];
        fresh.forEach(x => { qPutting.delete(x.uid); if (!ok) return; if (qSaved.has(x.uid)) late.push(x.uid); else if (!qGone.has(x.uid)) qInDb.add(x.uid); });
        if (late.length) qdb.del(late);                  // 적는 사이 서버 저장이 확인된 말은 바로 지운다
        sendState();
      });
    }
    qStoreErr = qMemOnly() > 0;
  }
  if (failMem.length) failAdd([], '');                  // 보관하지 못했던 "저장 못 한 말"을 다시 보관해 본다
  sendState();
}
/* 다른 탭이 남기고 닫힌 말(1분 넘게 그대로인 것)을 이 탭이 이어받아 보낸다. 두 탭이 같이 보내도 서버가 발언ID로 거른다.
 * localStorage와 두 번째 자리를 모두 본다 (저장 공간이 꽉 차 두 번째 자리에만 남은 다른 탭의 말도 이어받는다). */
function adoptOrphans(){
  if (!cfg.url) return;
  let other = []; try { other = JSON.parse(localStorage.getItem(qKey()) || '[]') || []; } catch (_) { other = []; }
  const mine = new Set(queue.map(x => x.uid)), old = Date.now() - 60000; let n = 0;
  (Array.isArray(other) ? other : []).forEach(x => { if (x && x.uid && x.text && !mine.has(x.uid) && !qGone.has(x.uid) && !(new Date(x.t).getTime() > old)) { queue.push(x); n++; } });
  if (n) saveQueue();
  dbSync(false);
}
setInterval(adoptOrphans, 30000);
function sendState(){
  const n = queue.length, pill = $('sendPill'), st = $('sendSt');
  if (!pill) return;
  qStoreErr = qMemOnly() > 0;
  const mem = qMemOnly(), nf = failGet().length, ng = gapGet().length, fm = failMemOnly();
  let txt = '', cls = '';
  if (sendErr && n) { txt = '⚠ 저장 실패 · 미전송 ' + n + '줄'; cls = 'sendErr'; }
  else if (n) { txt = '보내는 중 ' + n + '줄'; cls = 'send'; }
  else if (nf) { txt = '⚠ 저장 못 한 말 ' + nf + '줄 (설정 탭에서 복사)'; cls = 'sendErr'; }
  else if (ng) { txt = '⚠ 기록이 빠졌을 수 있는 구간 ' + ng + '곳'; cls = 'sendErr'; }
  pill.classList.toggle('hide', !txt); pill.className = 'chip net ' + cls + (txt ? '' : ' hide');
  pill.lastChild.textContent = txt; pill.title = sendErr ? '마지막 오류: ' + sendErr + ' (자동으로 다시 보내요)' : '내 말이 시트에 저장됐는지';
  st.className = 'sendst' + ((sendErr && n) || mem || fm ? ' warn' : '');
  // 기기 보관 상태를 세 가지로 나눠 말한다: 이 기기에 보관 중 / 이 기기 어디에도 저장되지 않고 이 창의 메모리에만 있음 / (서버가 받아) 저장됨
  if (mem) { pill.classList.remove('hide'); pill.className = 'chip net sendErr'; pill.lastChild.textContent = '⚠ 기기에 저장 안 됨 · 메모리에만 ' + mem + '줄'; pill.title = '못 보낸 말 ' + mem + '줄이 이 기기 어디에도 저장되지 않았어요 (저장 공간 부족). 지금은 이 창의 메모리에만 있어서, 창을 닫거나 새로 고치면 사라져요. 연결이 돌아와 보내질 때까지 이 창을 열어 두세요'; }
  const keep = mem ? '⚠ ' + mem + '줄은 이 기기 어디에도 저장되지 않고 이 창의 메모리에만 있어요: 창을 닫지 마세요' + (n > mem ? ' (나머지 ' + (n - mem) + '줄은 이 기기에 보관 중)' : '') : '이 기기에 보관 중';
  st.textContent = n ? (sendErr ? '⚠ 미전송 ' + n + '줄 · ' + sendErr + ' · 4초마다 다시 보내요 (' + keep + ')' : '미전송 ' + n + '줄 보내는 중…' + (mem ? ' (' + keep + ')' : ''))
    : (nf ? (fm ? '⚠ 저장 못 한 말 ' + fm + '줄이 이 창의 메모리에만 있어요: 창을 닫기 전에 설정 탭에서 복사해 주세요' : '') : (sentOnce ? '✔ 받아 적은 말은 모두 저장됨' + (ng ? ' · ⚠ 받아쓰기가 끊겨 빠졌을 수 있는 구간 ' + ng + '곳 (설정 탭)' : '') : ''));
  failShow(); gapShow(); statShow();
}
// 이 기기 어디에도 저장되지 않은 말이 있는 채로 창을 닫으려 하면 브라우저가 한 번 물어보게 한다
window.addEventListener('beforeunload', ev => { if (qMemOnly() || failMemOnly()) { ev.preventDefault(); ev.returnValue = ''; } });
async function flush(){
  if (sending || authBad || !queue.length || !cfg.url) return;
  sending = true;
  const batch = queue.slice(0, 100);
  const ac = window.AbortController ? new AbortController() : null;
  const to = setTimeout(() => ac && ac.abort(), 45000);
  batch.forEach(q => { const k = qTries.get(q.uid) || 0; if (k) stat('resend'); qTries.set(q.uid, k + 1); });
  try {
    const r = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ action: 'lines', pw: cfg.pw, pt: ptFor(cfg.url), items: batch }), signal: ac ? ac.signal : undefined }).then(x => x.json());
    if (!r.ok) { if (/비밀번호/.test(r.error || '')) authBad = true; throw new Error(r.error || '저장 실패'); }   // 비밀번호가 바뀌었으면 다시 입장할 때까지 보내지 않는다
    // 서버가 받지 않은 말은 먼저 "저장 못 한 말" 목록에 옮겨 적은 뒤에 대기열에서 뺀다 (목록 보관이 실패하면 이 창의 메모리에 남고 화면에 계속 보인다)
    if ((r.tooLong || []).length) { failAdd(batch.filter(q => r.tooLong.includes(q.uid)), '100만 자가 넘어 서버가 받지 않음'); toast('100만 자가 넘는 말 ' + r.tooLong.length + '줄은 저장하지 못했어요. 원문은 "저장 못 한 말"에서 복사할 수 있어요'); }
    const took = [].concat(r.saved || [], r.dup || [], r.dropped || []);            // 서버가 처리를 끝낸 말 (저장됨·이미 있음·초기화 전 말이라 버림)
    const done = new Set(took.concat(r.tooLong || []));
    const now = Date.now(); (r.saved || []).forEach(u => { const t0 = qT.get(u); if (t0) statLat(now - t0); });
    // 보존 성공을 셀 때: "이 창이 받아 적은 말"(qT에 있음)과 "이어받아 보낸 말"(다른 탭·예전 창이 남긴 것)을 나눠 센다. 서버가 "이미 있다(dup)"고 답한 것도 서버에 보존된 것이다
    // (응답을 받지 못해 다시 보낸 말이 대부분). 같은 말을 여러 탭이 보내도 '이 창이 받아 적은 줄' 대비 보존율이 100%를 넘지 않게 따로 둔다
    (r.saved || []).forEach(u => stat(qT.has(u) ? 'savedMine' : 'savedOther')); (r.dup || []).forEach(u => stat(qT.has(u) ? 'dupMine' : 'dupOther'));
    stat('saved', (r.saved || []).length); stat('dup', (r.dup || []).length); stat('dropped', (r.dropped || []).length); stat('tooLong', (r.tooLong || []).length);
    done.forEach(u => { qGone.add(u); qT.delete(u); qTries.delete(u); });
    took.forEach(u => { qSaved.add(u); qInDb.delete(u); });
    qdb.del(took.filter(u => !qPutting.has(u)));
    if (qBc && took.length) { try { qBc.postMessage({ room: cfg.url, saved: [].concat(r.saved || [], r.dup || []) }); } catch(_) {} }
    failDrop([].concat(r.saved || [], r.dup || []));                                   // "다시 보내기"로 되돌렸던 말이 저장됐으면 목록에 남은 사본도 걷는다
    queue = queue.filter(q => !done.has(q.uid));
    if ((r.dropped || []).length) toast('초기화 전에 말한 ' + r.dropped.length + '줄은 저장하지 않았어요');
    sendErr = ''; sentOnce = true;
  } catch (e) {
    sendErr = e.name === 'AbortError' ? '서버 응답이 45초 넘게 없음' : (e.message === 'Failed to fetch' ? '인터넷 연결 끊김' : (e.message || '연결 실패'));
    sendErrAt = Date.now();
  } finally {
    clearTimeout(to); sending = false; saveQueue();
  }
  if (!sendErr && queue.length) setTimeout(flush, 200);
}
setInterval(flush, 4000);
/* 다른 방 주소로 못 보낸 말 (예: 방을 엔진 주소로 옮기기 전 주소에 남은 말): 그 주소로 직접 보낸다.
 * 보낼 곳은 대기열에 적힌 주소 그대로라서 언제나 원래 방에 들어가고, 서버가 발언ID로 걸러서 두 번 저장되지 않는다.
 * localStorage뿐 아니라 두 번째 자리(IndexedDB)에만 남은 다른 방의 말도 함께 찾는다. */
let othersBusy = false, othersTurn = 0, idbOther = {}; const othersNeed = {};
function lsOther(){
  const map = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('t_q:') && k !== qKey()) { let a = []; try { a = JSON.parse(localStorage.getItem(k) || '[]') || []; } catch(_) {} if (Array.isArray(a) && a.length) map[k] = a.slice(); } } } catch(_) {}
  return map;
}
// 방(키 't_q:주소')마다 못 보낸 말: localStorage + 두 번째 자리에만 있는 것
function otherMap(){
  const map = lsOther();
  Object.keys(idbOther).forEach(k => { const a = map[k] = map[k] || [], have = new Set(a.map(x => x.uid)); idbOther[k].forEach(x => { if (!have.has(x.uid)) a.push(x); }); if (!a.length) delete map[k]; });
  return map;
}
async function otherScan(){
  const all = await qdb.all(); if (!Array.isArray(all)) return;
  const m = {}; all.forEach(x => { if (x && x.st === 'q' && x.uid && x.text && x.room && x.room !== cfg.url) (m['t_q:' + x.room] = m['t_q:' + x.room] || []).push(qItem(x)); });
  const was = JSON.stringify(Object.keys(idbOther).map(k => [k, idbOther[k].length])); idbOther = m;
  if (was !== JSON.stringify(Object.keys(m).map(k => [k, m[k].length]))) otherRooms();
}
async function flushOthers(){
  if (othersBusy || sending || !navigator.onLine) return;
  othersBusy = true;
  try {
    await otherScan();
    // 보낼 수 있는 방을 고른다. 비밀번호가 없는 방은 표시만 하고 건너뛰어서, 그 방 때문에 다른 방의 말이 밀리지 않게 한다 (방마다 차례가 돌아가게 순서를 돌린다)
    const map = otherMap(), keys = Object.keys(map).sort();
    if (!keys.length) return;
    othersTurn++;
    let key = '', url = '', pw = '', pt = '', items = [], changed = false;
    for (let j = 0; j < keys.length && !key; j++) {
      const k = keys[(othersTurn + j) % keys.length], u = k.slice(4); if (!/^https:\/\//.test(u)) continue;
      const room = roomsGet().find(x => scriptUrl(x.url) === u);
      // 그 방의 비밀번호나 기기 토큰이 이 기기에 없으면 보내지 않는다 (지금 방 비밀번호를 대신 보내지 않음). 원문은 그대로 보관하고 다시 들어가라고 안내한다
      const w = room && room.pw ? room.pw : '', t = ptFor(u);
      if (!w && !t) { if (!othersNeed[k]) { othersNeed[k] = 1; changed = true; } continue; }
      if (othersNeed[k] && Date.now() - othersNeed[k] < 120000) continue;       // 방금 비밀번호 오류가 난 방은 2분 쉬었다가
      key = k; url = u; pw = w; pt = t; items = map[k];
    }
    if (changed) otherRooms();
    if (!key) return;
    const body = { action: 'lines', items: items.slice(0, 100) }; if (pw) body.pw = pw; if (pt) body.pt = pt;
    const r = await fetch(url, { method: 'POST', body: JSON.stringify(body) }).then(x => x.json());
    if (r && !r.ok && /비밀번호|잠/.test(r.error || '')) { othersNeed[key] = Date.now(); otherRooms(); }
    if (r && r.ok) {
      delete othersNeed[key];
      let kept = true;
      if ((r.tooLong || []).length) kept = await failAddOther(items.filter(q => r.tooLong.includes(q.uid)), '100만 자가 넘어 서버가 받지 않음', url);
      const took = [].concat(r.saved || [], r.dup || [], r.dropped || []);
      const done = new Set(took.concat(kept ? (r.tooLong || []) : []));     // 실패 목록에 옮겨 적지 못했으면 원래 자리에 그대로 둔다
      let now = []; try { now = JSON.parse(localStorage.getItem(key) || '[]') || []; } catch(_) {}
      now = now.filter(q => !done.has(q.uid));
      try { if (now.length) localStorage.setItem(key, JSON.stringify(now)); else localStorage.removeItem(key); } catch(_) {}
      await qdb.del(took);                                                   // 저장 못 한 말로 옮긴 것은 같은 기록의 상태가 'f'로 바뀌어 있다 (지우지 않음)
      if (idbOther[key]) { idbOther[key] = idbOther[key].filter(q => !done.has(q.uid)); if (!idbOther[key].length) delete idbOther[key]; }
      if (done.size) otherRooms();
    }
  } catch(_) {} finally { othersBusy = false; }
}
setInterval(flushOthers, 15000);
// 창을 닫을 때: 대기열은 그대로 두고 마지막으로 한 번 던져 본다 (저장됐는지 모르니 다음 접속 때 다시 보내고, 서버가 중복을 거른다)
window.addEventListener('pagehide', ev => {
  if (!cfg.url || !navigator.sendBeacon) return;
  // 창을 정말 닫을 때(되돌아올 수 있는 일시 정지가 아닐 때)만 "일부러 나갔다"고 알려서, 다른 사람에게 끊김 알림이 가지 않게 한다
  if (!ev.persisted && cfg.name) { try { navigator.sendBeacon(cfg.url, new Blob([JSON.stringify({ action: 'bye', pw: cfg.pw, pt: ptFor(cfg.url), name: cfg.name })], { type: 'text/plain' })); } catch(_) {} }
  statSave(true);
  if (!queue.length) return;
  try { navigator.sendBeacon(cfg.url, new Blob([JSON.stringify({ action: 'lines', pw: cfg.pw, pt: ptFor(cfg.url), items: queue.slice(0, 100) })], { type: 'text/plain' })); } catch(_) {}
});
function otherRooms(){
  const box = $('otherQ'), map = otherMap(), keys = Object.keys(map); let total = 0; keys.forEach(k => { total += map[k].length; });
  box.classList.toggle('hide', !total); box.innerHTML = '';
  if (!total) return;
  const need = keys.filter(k => othersNeed[k]);
  box.append('다른 방 주소로 못 보낸 말이 ' + total + '줄 있어요. ' + (need.length ? '그 방의 비밀번호가 이 기기에 없어서 보내지 못하고 보관 중이에요. 그 방에 다시 들어가면 자동으로 보내요. ' : '원래 방 주소로 자동으로 보내는 중이에요. '));
  need.forEach(k => { const u = k.slice(4), r = roomsGet().find(x => scriptUrl(x.url) === u); const b2 = el('button', '', (r && r.name ? r.name : '그 방') + '에 다시 들어가기'); b2.onclick = () => { if (r) switchRoom(r); else { S.set('t_url', u); location.reload(); } }; box.append(b2, ' '); });
  const b = el('button', '', '버리기'); b.dataset.label = '버리기'; twoStep(b, async () => { const ids = []; keys.forEach(k => { map[k].forEach(x => ids.push(x.uid)); S.del(k); }); idbOther = {}; await qdb.del(ids); otherRooms(); }); box.append(b);
}

let ws = null, rec = null, stream = null, running = false, wantStop = false, micStatus = 'off';
let micWhy = '', micIntent = false;
let wsGen = 0, starting = false, retryN = 0, tkCache = null, wakeLock = null, dropCount = 0, retryTimer = 0;
/* 끊긴 동안의 말을 잃지 않기 위한 장치.
 *  ① 확정 전 글(pend): Deepgram이 아직 확정하지 않은 글. 연결이 끊기면 끝에 "(확정 전)"을 붙여 한 줄로 저장한다 (확정된 글과 구별).
 *  ② 소리 임시 보관: 연결이 끊긴 동안의 마이크 소리를 이 창의 메모리에만 최대 90초 모아 두었다가, 다시 연결되면 처음부터 이어서 보낸다.
 *     원래 실시간으로 보내던 바로 그 소리이고, 디스크에 쓰지 않으며, 보낸 뒤나 받아쓰기를 끄면 바로 버린다. 90초를 넘기면 가장 오래된 녹음부터 버리고 새로 모은다.
 *  ③ 누락 가능 구간(gap): Deepgram이 "여기까지 받아 적었다"고 알려 준 시각부터 다시 모으기 시작한 시각까지, 그리고 90초를 넘겨 버린 구간.
 *     1초 이상이면 이 기기에 적고, 3초 이상이면 대화에도 안내 줄을 남긴다.
 * 소리 한 줄기(녹음기 하나)는 연결 하나에만 보낸다: 소리 파일의 머리말이 첫 조각에만 있어서, 이미 일부를 보낸 녹음은 새 연결에서 이어 보낼 수 없다.
 *   그래서 "아직 아무것도 보내지 않은 녹음"만 새 연결에 처음부터 보내고, 보낸 적 있는 녹음은 버리고 그 구간을 누락 가능 구간으로 적는다.
 *   같은 소리를 두 번 보내는 일이 없으므로 같은 말이 두 번 적히지 않는다. (옛 연결에서 늦게 오는 글은 연결 번호로 버린다.)
 * "보냈다"와 "받아 적혔다"는 다르다: 소켓에 넘긴 조각 수(out)와 Deepgram이 답으로 알려 준 처리 위치(heard = start + duration)를 따로 센다.
 * 발언 시각은 저장한 순간이 아니라 말한 순간(녹음 시작 시각 + Deepgram이 알려 준 위치)이고, 세션·초기화 번호도 그 시각의 것을 붙인다. */
const ABUF_MS = 90000, GAP_MIN = 1000, GAP_LINE = 3000, CHUNK_MS = 250, PUMP_MS = 100, BUF_HI = 64000, STALL_MS = 5000, QUIET_MS = 8000, UNSURE = ' (확정 전)', CLOSE_TRIES = 20, STOP_WAIT = 2000;
let pend = '', pendAt = 0, gapFrom = 0, recMime = '';
// 시각 → 그때의 세션·초기화 번호 (늦게 복구된 말을 새 세션에 넣지 않으려고)
const sessLog = [];
function sessMark(){ const l = sessLog[sessLog.length - 1]; if (live.session === undefined) return; if (!l || l.session !== live.session || l.rv !== live.resetVer) { sessLog.push({ at: Date.now(), session: live.session || '', rv: live.resetVer || '' }); if (sessLog.length > 50) sessLog.shift(); } }
function sessAt(t){ let s = null; for (const e of sessLog) { if (e.at <= t || !s) s = e; else break; } return s || { session: live.session || '', rv: live.resetVer || '' }; }
// at = 말한 시각(ms). 없으면 지금
function pushLine(text, at){
  lastActivity = Date.now();
  const tm = at && at <= Date.now() ? at : Date.now(), s = sessAt(tm), uid = newUid();
  queue.push({ uid, name: cfg.name, session: s.session, rv: s.rv, t: new Date(tm).toISOString(), text }); qT.set(uid, Date.now()); stat('queued'); saveQueue();
}
// 확정되지 못한 글을 한 줄로 저장한다 (확정된 글과 구별되게 끝에 표시를 붙인다)
function commitPend(){ const t = pend.trim(), at = pendAt; pend = ''; pendAt = 0; $('interim').textContent = ''; if (t) { pushLine(t + UNSURE, at); stat('interim'); } }
const gapKey = () => 't_gap:' + cfg.url;
let gapMem = [];                  // 이 기기에 적지 못한 구간 (저장 공간 부족). 화면에는 저장된 것과 함께 보인다
function gapStored(){ try { const a = JSON.parse(localStorage.getItem(gapKey()) || '[]'); return Array.isArray(a) ? a : []; } catch(_) { return []; } }
function gapGet(){ if (!cfg.url) return []; const a = gapStored(), have = new Set(a.map(g => g.from)); return a.concat(gapMem.filter(g => g.url === cfg.url && !have.has(g.from))); }
function noteGap(from, to, why){
  if (!from || to - from < GAP_MIN || !cfg.url) return;
  const hm = t => new Date(t).toTimeString().slice(0, 8), sec = Math.round((to - from) / 1000);
  const g = { from: new Date(from).toISOString(), to: new Date(to).toISOString(), sec, why, name: cfg.name, url: cfg.url };
  const a = gapGet().concat([g]).slice(-50);
  try { localStorage.setItem(gapKey(), JSON.stringify(a)); gapMem = gapMem.filter(x => x.url !== cfg.url); } catch(_) { gapMem.push(g); gapMem = gapMem.slice(-50); }
  stat('gaps'); stat('gapSec', sec);
  // 3초 이상이면 대화에도 한 줄 남겨서 모두(와 요약)에게 이 구간이 비어 있을 수 있음을 알린다. 줄의 시각은 끊긴 시각
  if (to - from >= GAP_LINE) pushLine('※ 받아쓰기 끊김 약 ' + (sec >= 60 ? Math.floor(sec / 60) + '분 ' + (sec % 60) + '초' : sec + '초') + ' (' + hm(from) + '~' + hm(to) + ', ' + why + '). 이 사이 ' + cfg.name + '의 말은 기록되지 않았을 수 있어요', from);
  else sendState();
}
function gapShow(){
  const box = $('gapBox'); if (!box) return;
  const a = gapGet(); box.classList.toggle('hide', !a.length); if (!a.length) return;
  box.innerHTML = '';
  const long = a.filter(g => g.sec >= GAP_LINE / 1000).length;
  box.append('⚠ 받아쓰기가 끊겨 내 말이 빠졌을 수 있는 구간 ' + a.length + '곳: ' + a.slice(-8).map(g => new Date(g.from).toTimeString().slice(0, 8) + ' 약 ' + g.sec + '초').join(' · ') + '. ' + (long ? '3초 이상인 ' + long + '곳은 대화 탭에도 "※ 받아쓰기 끊김" 줄로 남아 있어요. ' : '') + '빠진 말은 직접 다시 말하거나 적어 주세요. ' + (gapMem.length ? '(이 목록 일부는 기기에 적지 못해 이 창에만 있어요) ' : ''));
  const rm = el('button', '', '확인했어요'); rm.onclick = () => { gapMem = gapMem.filter(x => x.url !== cfg.url); try { localStorage.removeItem(gapKey()); } catch(_) {} sendState(); }; box.append(rm);
}
function stopRec(r){ if (r && r.m && r.m.state !== 'inactive') { try { r.m.stop(); } catch(_) {} } }
/* 새 녹음기. w = 이 녹음을 보낼 연결(없으면 메모리에 모으기만 한다). 새 녹음기를 먼저 켜고 나서 옛 녹음기를 멈춘다(사이가 비지 않게).
 * r = { m: MediaRecorder, t0: 녹음 시작 시각, q: 아직 보내지 않은 조각, out: 소켓에 넘긴 조각 수, sent: 하나라도 넘겼는지, w: 보내는 연결, closing: 끄는 중, done: 마지막 조각까지 받음 } */
function recStart(w){
  const old = rec; rec = null;
  if (!micAlive()) { stopRec(old); return null; }
  let m; try { m = new MediaRecorder(stream, recMime ? { mimeType: recMime } : undefined); } catch(_) { stopRec(old); return null; }
  const r = { m, t0: Date.now(), q: [], out: 0, sent: false, w: w || null, closing: false, done: false };
  m.ondataavailable = ev => {
    if (!ev.data || !ev.data.size) return;
    if (r !== rec) return;                                   // 다른 녹음기로 바뀐 뒤의 조각: 이 녹음을 받던 연결이 이미 없다 (그 구간은 누락 가능 구간으로 적혀 있다)
    if (r.w && r.w._closeSent) { r.late = (r.late || 0) + 1; stat('lateTail'); return; }      // 종료 신호가 나간 뒤에 온 조각: Deepgram이 받지 않는다. 보낸 척하지 않고 세어 둔다 (finishStop이 구간으로 적는다)
    r.q.push(ev.data);                                       // 끄는 중(closing)에 오는 마지막 조각도 여기로 들어와서 CloseStream보다 먼저 나간다
    if (!r.sent && !r.w && Date.now() - r.t0 > ABUF_MS) {    // 90초 동안 보내지 못함: 이 녹음은 버리고 새로 모은다 (메모리에는 언제나 최근 90초 이내의 소리만)
      if (!gapFrom) gapFrom = r.t0;
      recStart(null); return;
    }
    pump();
  };
  m.onstop = () => { r.done = true; pump(); };
  rec = r; try { m.start(CHUNK_MS); } catch(_) { rec = null; stopRec(old); return null; }
  stopRec(old);
  return r;
}
/* 모아 둔 조각을 연결로 내보낸다. 밀린 소리는 한꺼번에 붓지 않고 0.1초에 한 조각(실시간의 2.5배)씩, 소켓에 쌓인 양이 많으면 쉬었다가.
 * 보내지 못한 조각은 버리지 않고 그대로 둔다(다음 차례에 다시). 끄는 중이면 남은 조각을 모두 내보낸 뒤에 CloseStream을 보낸다. */
function pump(timer){
  const r = rec, w = ws; if (!r || !w || w.readyState !== 1 || !w._live || r.w !== w) return;
  if (w.bufferedAmount < 2000) w._drain = Date.now();
  let n = r.closing ? r.q.length : r.q.length > 3 ? (timer ? 1 : 0) : r.q.length;
  while (n-- > 0 && r.q.length) {
    if (w.readyState !== 1 || w.bufferedAmount > BUF_HI) break;
    try { w.send(r.q[0]); } catch(_) { stat('sendFail'); break; }
    r.q.shift(); r.out++; r.sent = true;
  }
  // 종료 신호는 실제로 나간 뒤에만 "보냈다"고 적는다. 실패하면 다음 차례(0.1초 뒤)에 다시, 20번 실패하면 종료 실패로 마무리한다
  if (r.closing && r.done && !r.q.length && !w._closeSent) {
    try { w.send(JSON.stringify({ type: 'CloseStream' })); w._closeSent = true; }
    catch(_) { w._closeFail = (w._closeFail || 0) + 1; stat('closeFail'); if (w._closeFail >= CLOSE_TRIES) lost(w, '끌 때 종료 신호를 보내지 못함'); }
  }
}
/* 닫힘 신호 없이 죽은 연결 찾기 (1초마다). ① 소켓에 쌓인 소리가 5초 넘게 빠지지 않음 ② 브라우저가 오프라인이라고 함
 * ③ Deepgram에서 8초 넘게 아무 답이 없으면 방 주소에 가벼운 요청을 한 번 보내 보고, 그것도 안 되면 네트워크가 죽은 것으로 본다 (조용해서 답이 없는 것과 구별). */
let watchAt = 0;
function netProbe(){
  const ac = window.AbortController ? new AbortController() : null, to = setTimeout(() => ac && ac.abort(), 4000);
  return fetch(withQ(cfg.url, 'action=ver&_=' + Date.now()), { signal: ac ? ac.signal : undefined, cache: 'no-store' }).then(() => true, () => false).then(v => { clearTimeout(to); return v; });
}
function watch(){
  const now = Date.now(); if (now - watchAt < 1000) return; watchAt = now;
  const w = ws, r = rec; if (!w || w.readyState !== 1 || !w._live || w._dead || wantStop || !r || r.w !== w) return;
  if (now - (w._drain || w._openAt) > STALL_MS) { lost(w, '전송 정체'); return; }
  if (navigator.onLine === false) { lost(w, '인터넷 끊김'); return; }
  if (now - Math.max(w._msgAt || 0, w._openAt, w._probeAt || 0) > QUIET_MS && !w._probing) {
    w._probing = true;
    netProbe().then(ok => { w._probing = false; w._probeAt = Date.now() + (ok ? 12000 : 0); if (!ok && w === ws && !w._dead && !wantStop) lost(w, '응답 없음'); });
  }
}
// 끊겨 있는 동안: 60초가 지나면 "90초를 넘기면 그 사이의 말은 되살리지 못한다"고 미리 알리고, 넘긴 뒤에는 넘겼다고 알린다 (1초에 한 번만 고친다)
let disconAt = 0;
function disconNote(){
  const now = Date.now(); if (now - disconAt < 1000) return; disconAt = now;
  if (wantStop || running || !stream) return; const r = rec, el_ = $('micInfo'); if (!el_) return;
  if (gapFrom) el_.textContent = '⚠ 90초 넘게 끊겨 있어요. ' + new Date(gapFrom).toTimeString().slice(0, 8) + '부터의 말은 되살리지 못해요 (다시 이어지면 최근 90초 안의 말만 받아 적어요). 중요한 말은 채팅으로 적어 주세요';
  else if (r && !r.sent && !r.w && now - r.t0 > 60000) el_.textContent = '⚠ 끊긴 지 ' + Math.round((now - r.t0) / 1000) + '초예요. 90초를 넘기면 그 사이의 말은 되살리지 못해요 (지금은 이 기기의 메모리에 모으는 중)';
}
setInterval(() => { pump(true); watch(); disconNote(); }, PUMP_MS);
window.addEventListener('offline', () => { if (ws && ws._live && !ws._dead && !wantStop) lost(ws, '인터넷 끊김'); });
/* 연결 하나가 끝났을 때 (닫힘 신호가 왔거나, 죽은 것으로 판단했거나, 끄는 중에 Deepgram이 닫았을 때). 한 연결에 한 번만 돈다. */
function lost(w, why, noRetry){
  if (w._dead) return; w._dead = true; w._live = false; clearInterval(w._ka); clearTimeout(w._stopT);
  try { if (w.readyState <= 1) w.close(); } catch(_) {}
  if (w !== ws) return;                                      // 이미 새 연결로 넘어간 옛 연결
  running = false;
  const r = rec && rec.w === w ? rec : null, now = Date.now();
  // Deepgram이 실제로 받아 적은 곳(말한 시각 기준). 한 번도 위치를 알려 주지 않았으면 이 녹음은 하나도 확인되지 않은 것으로 본다
  const heard = r ? (w._heard != null ? Math.min(now, r.t0 + w._heard * 1000) : r.t0) : now;
  if (wantStop) { finishStop(w, r, heard); return; }
  commitPend();                                              // 확정 전 글을 "(확정 전)" 표시와 함께 저장
  if (w._replay) { w._replay = null; stat('recovFail'); }
  if (r && r.sent) {
    // 이 녹음은 죽은 연결로 일부가 나갔다 → 새 녹음을 모으기 시작하고, 받아 적힌 곳부터 새 녹음 시작까지를 누락 가능 구간으로 적는다
    const n = recStart(null), t1 = n ? n.t0 : now;
    noteGap(Math.min(heard, t1), t1, why);
    if (!n && !gapFrom) gapFrom = t1;
  } else if (r) { r.w = null; }                              // 아직 아무것도 보내지 않은 녹음: 그대로 계속 모은다 (새 연결에 처음부터 보낸다)
  else if (!rec) { if (!recStart(null) && !gapFrom) gapFrom = now; }      // 모을 녹음기도 없다(마이크가 죽음): 다시 이어질 때까지가 빈 구간
  if (!w._opened) tkCache = null;                            // 열리지도 못했으면 토큰이 문제일 수 있으니 새로 받는다
  logDrop(why); stat('drops');
  if (noRetry) return;
  micState('conn', '다시 연결 중…');
  $('micInfo').textContent = '연결이 끊겨 다시 잇는 중이에요 (끊김 ' + dropCount + '번, ' + why + ')';
  scheduleRestart(Math.min(5000, 400 * Math.pow(2, retryN++)));   // 0.4초부터 시작해 길게는 5초 간격
}
// 끄는 중이던 연결이 끝남: 남은 확정 전 글을 저장하고, 끝내 보내지 못했거나 받아 적히지 않은 꼬리가 있으면 적는다
function finishStop(w, r, heard){
  commitPend();
  if (r) {
    const end = r.tEnd || Date.now(), left = (r.q.length + (r.late || 0)) * CHUNK_MS;
    // ① 보내지 못한 꼬리 ② Deepgram이 처리했다고 알려 온 곳 뒤의 꼬리 ③ 처리 위치를 한 번도 듣지 못했으면 이 녹음 전체(heard = 녹음 시작)를 확인 못 한 구간으로
    if (left >= GAP_MIN) noteGap(end - left, end, w._closeSent ? '끌 때 보내지 못함' : '끌 때 보내지 못함 (종료 신호도 못 보냄)');
    else if (w._heard == null && r.out > 0 && end - r.t0 >= GAP_LINE) noteGap(r.t0, end, '끌 때 받아 적혔는지 확인 못 함');
    else if (w._heard != null && end - heard >= GAP_LINE) noteGap(heard, end, w._closeSent ? '끌 때 받아 적지 못함' : '끌 때 받아 적지 못함 (종료 신호를 못 보냄)');
    r.q = [];
  }
  if (rec === r || (rec && rec.closing)) { stopRec(rec); rec = null; }
  flush();
}
function micState(cls, text){
  micStatus = cls || 'off';
  $('micBtn').className = 'mic ' + cls;
  $('micTxt').textContent = text;
}
function micError(e){
  if (/system/i.test(e.message || '')) return '윈도우가 마이크를 막고 있어요 (설정 → 개인 정보 → 마이크)';
  return ({ NotAllowedError: '마이크 권한이 막혔어요 (주소창 왼쪽 아이콘 → 마이크 허용)', NotFoundError: '마이크를 찾지 못했어요',
    NotReadableError: '다른 프로그램이 마이크를 쓰는 중이에요' })[e.name] || ('마이크 오류: ' + e.name);
}
// 끊김 기록: 마지막 20번을 이 기기에 남긴다 (왜 끊겼는지 나중에 볼 수 있게)
function logDrop(why){
  dropCount++;
  try { const a = JSON.parse(S.get('t_disc') || '[]'); a.push({ t: new Date().toISOString(), why: String(why).slice(0, 80) }); S.set('t_disc', JSON.stringify(a.slice(-20))); } catch(_) {}
}
function micAlive(){ return !!stream && stream.getAudioTracks().some(t => t.readyState === 'live'); }
// 화면이 꺼지거나 절전으로 들어가면 마이크·연결이 끊기므로, 받아쓰는 동안은 화면을 켜 둔다 (지원하는 브라우저만)
async function keepAwake(on){
  try {
    if (!on) { if (wakeLock) { await wakeLock.release(); wakeLock = null; } return; }
    if (wakeLock || !navigator.wakeLock) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch(_) { wakeLock = null; }
}
function scheduleRestart(ms){
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => { if (!wantStop) startMic(true); }, ms);
}
async function startMic(isRetry){
  if (starting) return;
  starting = true;
  try {
    if (rec && rec.closing && ws && !ws._dead) lost(ws, '끔');          // 끄는 중에 다시 켰다: 앞의 것을 먼저 마무리한다
    // 마이크 장치가 끊겼으면(이어폰 뽑힘, 블루투스 전환, 절전) 죽은 마이크로 재연결하지 말고 새로 잡는다
    if (stream && !micAlive()) { try { stream.getTracks().forEach(t => t.stop()); } catch(_) {} stream = null; }
    if (!stream) {
      const fx = $('micFx').checked;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: fx, noiseSuppression: fx, autoGainControl: fx } });
        stream.getAudioTracks().forEach(tr => { tr.onended = () => { if (wantStop || tr.readyState !== 'ended') return; logDrop('마이크 장치 끊김'); $('micInfo').textContent = '마이크가 끊겼어요 (장치를 뽑았거나 다른 프로그램이 가져감). 다시 잡는 중…'; if (ws && !ws._dead) lost(ws, '마이크 장치 끊김'); else scheduleRestart(500); }; });
      }
      catch (e) {
        micState('err', '마이크 오류'); $('micInfo').textContent = micError(e);
        if (isRetry && !wantStop && e.name !== 'NotAllowedError') { $('micInfo').textContent += ' · 5초마다 다시 시도해요'; scheduleRestart(5000); }    // 재연결 중이면 포기하지 않고 계속 시도
        return;
      }
    }
    wantStop = false; micState('conn', isRetry ? '다시 연결 중…' : '연결 중…'); if (!isRetry) $('micInfo').textContent = '';
    let tk;
    // 임시 토큰은 1분 동안 쓸 수 있다: 바로 다시 연결할 때는 새로 받지 않고 재사용해서 끊긴 시간을 줄인다
    if (tkCache && Date.now() - tkCache.at < 40000) tk = tkCache.tk;
    else { try { tk = await api('token'); } catch (_) { tk = { ok: false, error: '방 주소 연결 실패' }; } }
    if (wantStop) return;
    if (!tk.ok) { tkCache = null; micState('err', '토큰 실패'); $('micInfo').textContent = tk.error || ''; scheduleRestart(5000); return; }
    tkCache = { tk, at: tkCache && tkCache.tk === tk ? tkCache.at : Date.now() };
    const p = new URLSearchParams({ model: 'nova-3', language: 'ko', smart_format: 'true', interim_results: 'true', endpointing: '400' });
    (tk.keyterms || []).forEach(k => p.append('keyterm', k));
    if (ws && !ws._dead && ws.readyState <= 1) lost(ws, '응답 없는 연결을 버림', true);     // 닫힘 신호 없이 죽은 연결을 버릴 때도 끊김과 똑같이 처리 (확정 전 글 저장, 지금부터의 소리 모으기, 빈 구간 적기)
    commitPend();
    const my = ++wsGen;                                     // 옛 연결의 늦은 신호가 새 연결을 건드리지 못하게 번호를 매긴다
    const w = new WebSocket('wss://api.deepgram.com/v1/listen?' + p.toString(), ['bearer', tk.token]);
    ws = w;
    w.onopen = () => {
      if (my !== wsGen || w._dead) { try { w.close(); } catch(_) {} return; }
      w._opened = true; retryN = 0; w._openAt = w._drain = Date.now(); w._live = true;
      recMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      // 끊긴 동안 모아 둔 녹음이 아직 하나도 나가지 않았으면 그 녹음을 처음부터 이 연결로 보낸다. 아니면 새 녹음으로 시작하고 빈 구간을 적는다
      let r = rec;
      if (r && !r.sent && !r.closing && r.m.state !== 'inactive') {
        if (gapFrom) noteGap(gapFrom, r.t0, '90초 넘게 끊김');
        r.w = w;
        if (r.q.length > 3) { w._replay = { from: r.t0, sec: (Date.now() - r.t0) / 1000 }; stat('recovTry'); stat('recovTrySec', Math.round(w._replay.sec)); }
      } else {
        const from = gapFrom || (r && !r.sent ? r.t0 : 0); r = recStart(w);
        if (from) noteGap(from, r ? r.t0 : Date.now(), '연결 끊김');
      }
      gapFrom = 0;
      w._ka = setInterval(() => { if (w.readyState === 1) { try { w.send(JSON.stringify({ type: 'KeepAlive' })); } catch(_) {} } }, 8000);
      running = true; document.title = 'TRPG Archive'; micState('on', '받아쓰는 중 · 멈추기');
      if (dropCount) $('micInfo').textContent = '연결이 ' + dropCount + '번 끊겼다가 자동으로 다시 이어졌어요' + (w._replay ? ' · 끊긴 동안의 소리 ' + Math.round(w._replay.sec) + '초를 이어서 보내는 중' : ''); else $('micInfo').textContent = '';
      keepAwake(true); pump();
    };
    w.onmessage = ev => {
      if (my !== wsGen || w._dead) return;                   // 옛 연결에서 늦게 온 글은 쓰지 않는다 (그 구간의 확정 전 글은 이미 저장했다)
      let m; try { m = JSON.parse(ev.data); } catch(_) { return; }
      w._msgAt = Date.now();
      if (m.type !== 'Results') return;
      const r = rec && rec.w === w ? rec : null;
      const s0 = Number(m.start), du = Number(m.duration), timed = m.start != null && m.duration != null && isFinite(s0) && isFinite(du);
      // 이미 확정해 저장한 소리 구간을 다시 가리키는 결과는 버린다 (글이 같아서가 아니라 소리의 위치로 판단)
      if (timed && w._final != null && s0 + du <= w._final + 0.01) return;
      if (timed) w._heard = Math.max(w._heard || 0, s0 + du);
      const alt = m.channel && m.channel.alternatives && m.channel.alternatives[0] || {};
      let t = alt.transcript || '', sAt = s0;
      // 확정한 곳과 일부만 겹치는 결과: 낱말 시각이 있으면 확정한 곳 뒤의 낱말만 남긴다 (글 비교가 아니라 소리 위치). 낱말 시각이 없으면 지우지 않고 통째로 둔다 (빠지는 것보다 겹치는 편이 낫다)
      if (timed && w._final != null && s0 < w._final - 0.01 && t) {
        const ws_ = Array.isArray(alt.words) ? alt.words.filter(x => x && isFinite(Number(x.start))) : [];
        if (ws_.length) { const keep = ws_.filter(x => Number(x.start) >= w._final - 0.01); t = keep.map(x => x.punctuated_word || x.word || '').join(' '); if (keep.length) sAt = Number(keep[0].start); if (m.is_final) stat('overlapCut'); }
        else if (m.is_final) stat('overlapKept');
      }
      const at = r && timed ? r.t0 + sAt * 1000 : Date.now();
      if (m.is_final) { if (timed) w._final = Math.max(w._final || 0, s0 + du); pend = ''; pendAt = 0; $('interim').textContent = ''; if (t.trim()) { pushLine(t.trim(), at); stat('final'); } }
      else { pend = t; pendAt = t ? at : 0; $('interim').textContent = t ? cfg.name + ': ' + t : ''; }
      // 끊긴 동안 모아 보낸 소리를 Deepgram이 끝까지 처리했다고 알려 왔을 때에만 "복구됨"으로 센다 (소켓에 넘긴 것만으로는 세지 않는다)
      if (w._replay && w._heard != null && w._heard >= w._replay.sec - 1) { stat('recovOk'); stat('recovSec', Math.round(w._replay.sec)); w._replay = null; if (!wantStop) $('micInfo').textContent = '끊긴 동안의 소리를 이어서 받아 적었어요'; }
    };
    w.onclose = ev => lost(w, '연결 끊김 코드 ' + (ev && ev.code) + (ev && ev.reason ? ' ' + ev.reason : ''));
  } finally { starting = false; }
}
// 다른 창을 보다 돌아왔을 때, 또는 인터넷이 다시 연결됐을 때: 끊겨 있으면 바로 다시 잇는다 (화면 꺼짐 방지도 다시 건다)
function resumeIfDropped(){
  if (wantStop || !stream) return;
  if (running && ws && ws.readyState === 1 && !ws._dead) { keepAwake(true); return; }       // 잘 이어져 있으면 건드리지 않는다
  if (!starting) { running = false; retryN = 0; scheduleRestart(100); }          // 닫힘 신호 없이 죽은 연결이면 새로 연결
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeIfDropped(); });
window.addEventListener('online', resumeIfDropped);
/* 받아쓰기 끄기. 연결이 살아 있으면: 녹음기를 멈춤 → 마지막 소리 조각이 나감 → CloseStream → Deepgram이 남은 글을 확정해 보냄 → 연결이 닫힘(finishStop).
 * 연결이 끊긴 채로 껐으면: 모아 둔 소리는 보낼 곳이 없어 버리고 그 구간을 적는다. */
function stopAll(why){
  micWhy = why || ''; micIntent = false;
  wantStop = true; clearTimeout(retryTimer); keepAwake(false); tkCache = null;
  const w = ws, r = rec;
  if (w && !w._dead && w.readyState === 1 && w._live && r && r.w === w && !r.closing) {
    r.closing = true; r.tEnd = Date.now(); stopRec(r); pump();
    setTimeout(() => { if (!r.done) { r.done = true; r.forced = true; stat('stopForced'); pump(); } }, STOP_WAIT);      // 녹음기가 멈췄다는 신호(onstop)를 2초 안에 주지 않을 때만 기다리지 않고 닫는다 (그 뒤에 온 조각은 lateTail로 센다)
    w._stopT = setTimeout(() => lost(w, '끔'), Math.min(20000, 3000 + STOP_WAIT + r.q.length * CHUNK_MS / 4));      // Deepgram이 닫아 주지 않으면 여기서 마무리
  } else if (!(r && r.closing)) {
    if (w && !w._dead) { w._dead = true; w._live = false; clearInterval(w._ka); try { w.close(); } catch(_) {} }
    commitPend();
    const from = gapFrom || (r && !r.sent ? r.t0 : 0); if (from) noteGap(from, Date.now(), '연결이 끊긴 채로 끔');
    stopRec(r); rec = null; gapFrom = 0;
  }
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  running = false;
  micState('', '받아쓰기 시작');
  flush();
}
$('micBtn').onclick = () => {
  if (running || (stream && !wantStop)) { stopAll('user'); return; }
  micIntent = true; micWhy = '';
  lastActivity = Date.now(); $('idleNote').classList.add('hide'); startMic();
};
// 방 전체에서 20분 동안 아무 말도 적히지 않으면 자동으로 받아쓰기를 멈춘다 (켜 두고 잊었을 때 요금 방지)
const IDLE_MS = 20 * 60 * 1000;
setInterval(() => {
  if (!stream || wantStop) return;
  if (Date.now() - lastActivity > IDLE_MS) { stopAll('idle'); $('idleNote').classList.remove('hide'); document.title = '⏸ 받아쓰기 멈춤 · TRPG Archive'; }
}, 30000);

/* ── 알림: 다른 사람의 접속 끊김·받아쓰기 꺼짐, 내 받아쓰기 끊김 ──
 * 접속 현황은 5초마다 받아 온다. 끊김 판단: 1분 넘게 응답이 없음 (탭을 숨겨 둔 사람은 3분). 일부러 나간(방 나가기·창 닫기) 사람은 알리지 않는다.
 * 받아쓰기 꺼짐: 켜져 있던 사람이 직접 끈 것도 자동 멈춤도 아닌데 1분 넘게 켜지지 않을 때 (기준값은 AL 한 곳). */
const palert = {}, alertNodes = {}, T_PAGE = Date.now();
/* 알림 기준 (한 곳에서만 정한다). 짧은 사적인 자리비움·조용히 듣는 시간 때문에 울리지 않도록 모두 1분 이상.
   - 말을 안 하는 것은 알림 대상이 아니다. 받아쓰기 '연결'이 끊긴 것만 본다.
   - 본인이 받아쓰기를 직접 끈 경우(버튼), 방을 나간 경우, 20분 무발언 자동 멈춤은 몇 분이 지나도 알리지 않는다. */
const AL = { calm: 15000, drop: 60000, dropHidden: 180000, mic: 60000, self: 60000 };
let alertAC = null, flashT = 0;
document.addEventListener('click', () => { try { if (!alertAC) alertAC = new (window.AudioContext || window.webkitAudioContext)(); if (alertAC.state === 'suspended') alertAC.resume(); } catch(_) {} }, { once: false });
function alertBeep(){
  if (S.get('t_beep') === '0') return;
  try {
    if (!alertAC) alertAC = new (window.AudioContext || window.webkitAudioContext)();
    if (alertAC.state === 'suspended') alertAC.resume();
    [[0, 880], [0.24, 660]].forEach(([t, f]) => { const o = alertAC.createOscillator(), g = alertAC.createGain(); o.frequency.value = f; g.gain.value = .16; o.connect(g); g.connect(alertAC.destination); o.start(alertAC.currentTime + t); o.stop(alertAC.currentTime + t + .18); });
  } catch(_) {}
}
function alertFlash(msg){
  clearInterval(flashT); let on = false; const base = 'TRPG Archive';
  flashT = setInterval(() => { on = !on; document.title = on ? msg : base; }, 1000);
  setTimeout(() => { clearInterval(flashT); document.title = base; }, 30000);
}
function clearAlert(key){ const n = alertNodes[key]; if (n) { n.remove(); delete alertNodes[key]; } }
function raiseAlert(key, msg, level){
  clearAlert(key);
  const d = el('div', 'alertItem ' + (level || '')); d.append(el('span', '', msg));
  const x = el('button', '', '✕'); x.title = '닫기'; x.onclick = () => clearAlert(key); d.append(x);
  $('alertBox').prepend(d); alertNodes[key] = d;
  setTimeout(() => { if (alertNodes[key] === d) clearAlert(key); }, 180000);
  alertBeep(); alertFlash(msg);
  try { if (S.get('t_notif') === '1' && window.Notification && Notification.permission === 'granted' && document.hidden) new Notification('TRPG Archive', { body: msg }); } catch(_) {}
}
function checkAlerts(list){
  const now = Date.now(), calm = now - T_PAGE < AL.calm;      // 막 들어온 직후에는 알리지 않는다 (현황을 아직 모름)
  (list || []).forEach(p => {
    if (p.name === cfg.name) return;
    const on = !p.bye && (p.age != null ? p.age : (p.online ? 0 : 1e9)) < (p.hid ? AL.dropHidden : AL.drop);
    let st = palert[p.name];
    if (st && p.bye && st.dropped) { st.dropped = false; clearAlert('d:' + p.name); }      // 끊긴 뒤 정식으로 나갔다면 끊김 알림을 걷는다
    if (!st) { palert[p.name] = { on, micOn: on && p.mic === 'on', bad: 0, dropped: false, micAlert: false }; return; }
    if (st.on && !on) {
      st.on = false; st.micOn = false; st.bad = 0;
      if (st.micAlert) { st.micAlert = false; clearAlert('m:' + p.name); }      // 나간 사람·끊긴 사람의 '받아쓰기 꺼짐' 알림은 걷는다 (끊김 알림이 대신함)
      if (!p.bye && !calm) { st.dropped = true; raiseAlert('d:' + p.name, '⚠ ' + p.name + '님의 접속이 끊겼어요 (' + Math.round((p.age || 0) / 1000) + '초째 응답 없음)', ''); }
      return;
    }
    if (!st.on && on) { st.on = true; if (st.dropped) { st.dropped = false; clearAlert('d:' + p.name); toast(p.name + '님이 다시 접속했어요'); } }
    if (!on) return;
    if (p.mic === 'on') { st.micOn = true; st.bad = 0; if (st.micAlert) { st.micAlert = false; clearAlert('m:' + p.name); } return; }
    if (!st.micOn) return;
    if (p.mic === 'off' && (p.why === 'user' || p.why === 'idle' || p.why === 'bye')) { st.micOn = false; st.bad = 0; if (st.micAlert) { st.micAlert = false; clearAlert('m:' + p.name); } return; }
    st.bad = st.bad || now;
    if (now - st.bad >= AL.mic) {
      st.micOn = false; st.micAlert = true;
      if (!calm) raiseAlert('m:' + p.name, '🎙 ' + p.name + '님의 받아쓰기가 꺼졌어요 (' + (p.mic === 'conn' ? '다시 연결 중' : p.mic === 'err' ? '오류' : '꺼짐') + ') · 말한 것이 기록되지 않고 있어요', 'amber');
    }
  });
}
// 내 받아쓰기: 켜 두려고 했는데 1분 넘게 받아쓰는 중이 아니면 나에게도 알린다
let selfBad = 0, selfAlerted = false;
setInterval(() => {
  const bad = micIntent && !wantStop && micStatus !== 'on';
  if (bad) { selfBad = selfBad || Date.now(); if (!selfAlerted && Date.now() - selfBad > AL.self) { selfAlerted = true; raiseAlert('self', '🎙 내 받아쓰기가 끊겨 있어요. 자동으로 다시 연결하는 중이에요. 계속 안 되면 받아쓰기를 껐다 켜 주세요 · 그동안 한 말은 기록되지 않아요', 'amber'); } }
  else { selfBad = 0; if (selfAlerted) { selfAlerted = false; clearAlert('self'); } }
}, 3000);
$('alBeep').checked = S.get('t_beep') !== '0';
$('alBeep').onchange = () => { S.set('t_beep', $('alBeep').checked ? '1' : '0'); if ($('alBeep').checked) alertBeep(); };
$('alNotif').checked = S.get('t_notif') === '1' && window.Notification && Notification.permission === 'granted';
$('alNotif').onchange = async () => {
  if (!$('alNotif').checked) { S.set('t_notif', '0'); return; }
  if (!window.Notification) { $('alNotif').checked = false; toast('이 브라우저는 바탕화면 알림을 지원하지 않아요'); return; }
  let perm = Notification.permission; if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch(_) {} }
  S.set('t_notif', perm === 'granted' ? '1' : '0'); $('alNotif').checked = perm === 'granted';
  if (perm !== 'granted') toast('브라우저에서 알림이 막혀 있어요 (주소창 왼쪽 아이콘 → 알림 허용)');
};

/* ── 설정 ── */
$('micFx').checked = S.get('t_fx') === '1';
$('micFx').onchange = () => S.set('t_fx', $('micFx').checked ? '1' : '0');
$('micTest').onclick = async () => {
  $('micMsg').textContent = '브라우저 위쪽 창에서 "허용"을 눌러 주세요…';
  let ts;
  try { ts = await navigator.mediaDevices.getUserMedia({ audio: true }); }
  catch (e) { $('micMsg').textContent = micError(e) + ' / ' + e.name; return; }
  $('micMsg').textContent = '연결됨: ' + ((ts.getAudioTracks()[0] || {}).label || '마이크') + ' · 지금 말해 보세요';
  $('micTest').disabled = true;
  let ctx = null, raf = 0;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)(); if (ctx.state === 'suspended') await ctx.resume();
    const an = ctx.createAnalyser(); an.fftSize = 512; ctx.createMediaStreamSource(ts).connect(an);
    const buf = new Uint8Array(an.fftSize);
    const tick = () => { an.getByteTimeDomainData(buf); let p = 0; for (const v of buf) p = Math.max(p, Math.abs(v - 128));
      $('testLevel').style.width = Math.min(100, p / 128 * 250) + '%'; raf = requestAnimationFrame(tick); };
    tick();
  } catch (_) { $('micMsg').textContent += ' (막대 표시는 이 브라우저에서 안 돼요)'; }
  setTimeout(() => { cancelAnimationFrame(raf); $('testLevel').style.width = '0'; if (ctx) { try { ctx.close(); } catch(_){} }
    ts.getTracks().forEach(t => t.stop()); $('micTest').disabled = false; $('micMsg').textContent = '확인 끝'; }, 10000);
};
$('sNameSave').onclick = () => {
  const n = $('sName').value.trim(); if (!n || n === cfg.name) return;
  const old = cfg.name; cfg.name = n; S.set('t_name', n); $('meName').textContent = n;
  post({ action: 'color', name: n, color: colorOf(old) }); toast('이름을 바꿨어요. 이제부터 새 이름으로 적혀요');
};
$('leave').onclick = async () => {
  if (queue.length && !confirm('아직 시트에 저장 안 된 말이 ' + queue.length + '줄 있어요. 이 기기에 남겨 두고 나갈까요? (같은 방에 다시 들어오면 보내요)')) return;
  stopAll('user');
  try { navigator.sendBeacon && navigator.sendBeacon(cfg.url, new Blob([JSON.stringify({ action: 'bye', pw: cfg.pw, pt: ptFor(cfg.url), name: cfg.name })], { type: 'text/plain' })); } catch(_) {}
  // 마스터로 로그인해 있었다면 서버에서도 로그인을 끊고 나간다 (응답은 2초까지만 기다림)
  if (cfg.kt) { try { await Promise.race([post({ action: 'klogout', kt: cfg.kt }), sleep(2000)]); } catch(_) {} }
  roomsSet(roomsGet().filter(x => scriptUrl(x.url) !== cfg.url));      // 이 방만 목록에서 뺀다 (다른 방은 그대로)
  SS.del('t_kt'); S.del('t_pt:' + cfg.url); ['t_url','t_pw','t_name','t_kpw','t_kt','t_colorSent'].forEach(S.del); location.reload();
};
$('glossSave').onclick = async () => { $('glossMsg').textContent = '저장 중…'; const r = await post({ action: 'glossary', glossary: $('gloss').value }); $('glossMsg').textContent = r.ok ? '저장됨 (다음에 받아쓰기를 켤 때부터 반영)' : r.error; };


/* 저장 못 한 말 (서버가 받지 않았거나, 밀려서 따로 옮겨 둔 원문). 지워지지 않게 이 기기에 따로 두고, 복사·파일로 내려받을 수 있게 한다. '모두 저장됨'과 구분해 보여 준다.
 * 보관 자리 셋: localStorage(t_fail:<주소>) · 두 번째 자리(IndexedDB, 상태 'f') · 둘 다 안 되면 이 창의 메모리(failMem, 화면에 계속 보이고 창을 닫을 때 브라우저가 한 번 물어본다) */
const failKey = url => 't_fail:' + (url || cfg.url);
let failMem = [];                 // localStorage에 적지 못한 "저장 못 한 말". db가 참이면 두 번째 자리에는 적혔다
let failDb = [];                  // 두 번째 자리에서 읽은 지금 방의 "저장 못 한 말"
function failStored(url){ try { const a = JSON.parse(localStorage.getItem(failKey(url)) || '[]'); return Array.isArray(a) ? a : []; } catch(_) { return []; } }
function failGet(url){
  const a = failStored(url); if (url && url !== cfg.url) return a;
  const have = new Set(a.map(x => x.uid));
  failMem.concat(failDb).forEach(m => { if (m && m.uid && !have.has(m.uid) && !qSaved.has(m.uid)) { have.add(m.uid); a.push(m); } });
  return a;
}
// 이 기기 어디에도 저장되지 않고 이 창의 메모리에만 있는 "저장 못 한 말" 수
function failMemOnly(){ return failMem.filter(m => !m.db).length; }
const failRec = (q, why) => ({ uid: q.uid, name: q.name, t: q.t, text: q.text, session: q.session, rv: q.rv, why: why || q.why || '' });
// 돌려주는 값: localStorage에 보관했으면 true. 못 했으면 (지금 방의 말은) 메모리에 두고 두 번째 자리에 적어 본다
function failAdd(items, why, url){
  const here = !url || url === cfg.url;
  const a = failStored(url), add = (items || []).map(q => failRec(q, why));
  (here ? failMem.concat(add) : add).forEach(q => { if (!a.some(x => x.uid === q.uid)) a.push(failRec(q)); });
  let ok = true;
  try { if (a.length) localStorage.setItem(failKey(url), JSON.stringify(a)); if (here) failMem = []; }
  catch (_) { ok = false; if (here) add.forEach(q => { if (!failMem.some(x => x.uid === q.uid)) failMem.push(q); }); }
  // 두 번째 자리: 같은 발언ID의 기록을 상태 'f'로 바꿔 적는다 (못 보낸 말 → 저장 못 한 말이 한 번에 바뀐다)
  if (add.length) qdb.put(add, url || cfg.url, 'f', why).then(dbOk => {
    if (dbOk && here) { add.forEach(q => { const m = failMem.find(x => x.uid === q.uid); if (m) m.db = true; if (!failDb.some(x => x.uid === q.uid)) failDb.push(q); }); }
    if (!ok && !dbOk && here) toast('저장 못 한 말을 이 기기 어디에도 보관하지 못했어요. 이 창을 닫기 전에 설정 탭에서 복사해 두세요');
    sendState();
  });
  if (add.length) sendState();
  return ok;
}
// 다른 방의 말을 실패 목록으로: localStorage나 두 번째 자리 중 한 곳에라도 적혔으면 true
async function failAddOther(items, why, url){ const ls = failAdd(items, why, url); const db = await qdb.put(items.map(q => failRec(q, why)), url, 'f', why); return ls || db; }
// 서버에 저장된 것이 확인된 말은 목록에서 걷는다 ("다시 보내기"로 되돌린 뒤 창이 닫혀 목록에 사본이 남은 경우)
function failDrop(uids){
  if (!uids.length) return; const ids = new Set(uids);
  failMem = failMem.filter(x => !ids.has(x.uid)); failDb = failDb.filter(x => !ids.has(x.uid));
  const a = failStored(), rest = a.filter(x => !ids.has(x.uid));
  if (rest.length !== a.length) { try { if (rest.length) localStorage.setItem(failKey(), JSON.stringify(rest)); else localStorage.removeItem(failKey()); } catch(_) {} }
}
function failText(){ return failGet().map(x => '[' + String(x.t || '').replace('T', ' ').slice(0, 19) + '] ' + x.name + ': ' + x.text).join('\n\n'); }
function failShow(){
  const box = $('failBox'); if (!box) return;
  const a = failGet(); box.classList.toggle('hide', !a.length); if (!a.length) return;
  box.innerHTML = '';
  const mo = failMemOnly();
  box.append('⚠ 저장 못 한 말 ' + a.length + '줄 (' + (a[0].why || '') + '). 원문은 ' + (mo ? '⚠ ' + mo + '줄이 이 기기 어디에도 저장되지 않고 이 창의 메모리에만 있어요 (기기 저장 공간 부족). 창을 닫기 전에 복사하거나 내려받아 주세요. ' : '서버에는 없고 이 기기에만 있어요. '));
  // 서버가 거절한 것이 아니라 밀려서 옮겨 둔 말은 다시 보낼 수 있다
  const back = a.filter(x => !/100만 자/.test(x.why || '')).slice(0, Math.max(0, QMAX - queue.length));
  if (back.length) { const rs = el('button', '', '다시 보내기 (' + back.length + '줄)'); rs.onclick = () => failResend(back); box.append(rs, ' '); }
  const cp = el('button', '', '복사'); cp.onclick = async () => { try { await navigator.clipboard.writeText(failText()); toast('복사했어요'); } catch (_) { toast('복사하지 못했어요. 내려받기를 써 주세요'); } };
  const dl = el('button', '', '내려받기'); dl.onclick = () => { const b = new Blob([failText()], { type: 'text/plain' }); const u = URL.createObjectURL(b); const x = document.createElement('a'); x.href = u; x.download = '저장_못_한_말.txt'; x.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
  const rm = el('button', '', '목록 비우기'); rm.dataset.label = '목록 비우기'; if (typeof twoStep === 'function') twoStep(rm, async () => { const ids = failGet().map(x => x.uid); failMem = []; failDb = []; try { localStorage.removeItem(failKey()); } catch (_) {} await qdb.del(ids.filter(u => !queue.some(q => q.uid === u))); sendState(); });
  box.append(cp, ' ', dl, ' ', rm);
}
/* 다시 보내기: ① 두 번째 자리의 같은 기록을 상태 'q'로 바꿔 적고(끝날 때까지 기다린다) ② 대기열에 넣어 localStorage에도 적은 뒤 ③ 둘 중 한 곳에라도 적힌 것이 확인된 다음에만 목록에서 뺀다.
 * 어느 단계에서 창이 닫혀도 원문은 목록이나 대기열 중 적어도 한 곳에 남는다. 양쪽에 다 남으면 서버 저장이 확인될 때 사본을 걷는다(failDrop).
 * 두 곳 모두 적지 못했으면(저장 공간이 꽉 참) 목록에 그대로 두고 메모리의 대기열로만 보낸다: 그렇다고 화면에 알린다. */
let failBusy = false;
async function failResend(back){
  if (failBusy || !back.length) return; failBusy = true;
  try {
    const room = cfg.url, ids = new Set(back.map(x => x.uid));
    const dbOk = await qdb.put(back.map(qItem), room, 'q', '', true);
    if (room !== cfg.url) return;                           // 기다리는 사이 다른 방으로 옮김: 그 방의 기록은 두 번째 자리에 'q'로 남아 다음에 보내진다
    back.forEach(x => { qGone.delete(x.uid); qSaved.delete(x.uid); if (dbOk) qInDb.add(x.uid); else qInDb.delete(x.uid); if (!queue.some(q => q.uid === x.uid)) queue.push(qItem(x)); });
    queue.sort(byTime); saveQueue();
    if (dbOk || qLsOk) {
      failMem = failMem.filter(x => !ids.has(x.uid)); failDb = failDb.filter(x => !ids.has(x.uid));
      const rest = failStored().filter(x => !ids.has(x.uid)); try { if (rest.length) localStorage.setItem(failKey(), JSON.stringify(rest)); else localStorage.removeItem(failKey()); } catch(_) {}
    } else toast('다시 보내는 중이에요. 기기에 적지 못해서, 저장이 확인될 때까지 "저장 못 한 말" 목록에도 그대로 둘게요');
    stat('failResend', back.length);
  } finally { failBusy = false; }
  sendState(); flush();
}

/* ── 세션 측정 (이 기기에서만 센다. 서버 요청을 늘리지 않고, 화면에는 설정 탭을 펼쳤을 때만 보인다) ──
 * 받아쓰기: 확정 글·확정 전 글·대기열에 넣은 줄·서버 저장·다시 보냄·서버가 거른 중복·끊김·누락 가능 구간·복구 시도/확인, 저장까지 걸린 시간(p50/p95/최대)
 * 화면: 다음 할 일·지금 장면을 연 횟수와 뜨는 데 걸린 시간, 근거 보기, AI 없이 찾은 판정, 장면 추정을 고친 횟수 등 (room.js·keeper.js가 stat()으로 센다) */
const statKey = () => 't_stat:' + cfg.url;
let statO = null, statDirty = false;
function statLoad(){ if (statO && statO.url === cfg.url) return statO; let o = null; try { o = JSON.parse(localStorage.getItem(statKey()) || 'null'); } catch(_) {} statO = o && typeof o === 'object' && o.n ? o : { since: Date.now(), n: {}, lat: [], ms: {} }; statO.url = cfg.url; return statO; }
function stat(k, v){ if (!cfg.url) return; const o = statLoad(); o.n[k] = (o.n[k] || 0) + (v == null ? 1 : v); statDirty = true; }
// 걸린 시간 표본 (k별로 최근 300개)
function statMs(k, ms){ if (!cfg.url || !(ms >= 0)) return; const o = statLoad(), a = o.ms[k] = o.ms[k] || []; a.push(Math.round(ms)); if (a.length > 300) a.shift(); o.msN = o.msN || {}; o.msN[k] = (o.msN[k] || 0) + 1; statDirty = true; }
// 저장까지 걸린 시간: 표본은 최근 3,000줄만 두고(중간·느린 5% 계산용), 줄 수·합계·최대는 재기 시작한 뒤 전체를 따로 센다
function statLat(ms){ const o = statLoad(); ms = Math.round(ms); o.lat.push(ms); if (o.lat.length > 3000) o.lat.shift(); o.latN = (o.latN || 0) + 1; o.latSum = (o.latSum || 0) + ms; o.latMax = Math.max(o.latMax || 0, ms); statDirty = true; }
function statSave(force){ if (!statO || (!statDirty && !force)) return; statDirty = false; try { localStorage.setItem(statKey(), JSON.stringify(statO)); } catch(_) {} }
setInterval(() => statSave(), 15000);
const pct = (a, p) => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
function statText(){
  const o = statLoad(), n = k => o.n[k] || 0, sec = ms => ms == null ? '-' : (ms / 1000).toFixed(1) + '초';
  // 화면이 뜨기까지의 시간. 표본은 최근 300번만 둔다: 전체 횟수가 그보다 많으면 그렇다고 적는다
  const tm = k => { const a = o.ms[k] || [], all = (o.msN && o.msN[k]) || a.length; return a.length ? '중간 ' + sec(pct(a, .5)) + ' · 느린 5% ' + sec(pct(a, .95)) + ' (' + (all > a.length ? '전체 ' + all + '번 중 최근 ' + a.length + '번 표본' : a.length + '번 전체') + ')' : '아직 없음'; };
  const latAll = o.latN || o.lat.length, kept = n('savedMine') + n('dupMine'), fl = failGet().length;
  const old = !n('savedMine') && !n('dupMine') && (n('saved') || n('dup'));           // 예전 판에서 재기 시작한 숫자: 나눠 세지 않았다
  return [
    '세션 측정 · ' + (cfg.name || '') + ' · ' + new Date(o.since).toLocaleString() + ' ~ ' + new Date().toLocaleString() + ' · 화면 판 ' + (typeof APP_VER === 'string' ? APP_VER : '') + ' · 이 기기의 이 브라우저에서만 센 숫자예요 (탭을 여러 개 열었으면 탭마다 따로 세요)',
    '[받아쓰기] 확정 글 ' + n('final') + '줄 · 확정 전 글로 저장 ' + n('interim') + '줄 · 이 창이 받아 적어 기기에 넣은 줄 ' + n('queued'),
    '[기록 보존] ' + (old ? '서버 저장 확인 ' + n('saved') + ' · 서버에 이미 있었음 ' + n('dup') + ' (예전 판에서 재기 시작해 나눠 세지 못함. [새로 재기]를 누르면 나눠 세요)'
      : '이 창이 받아 적은 ' + n('queued') + '줄 가운데 서버 보존 확인 ' + kept + '줄 (새로 저장 ' + n('savedMine') + ' + 서버에 이미 있었음 ' + n('dupMine') + ': 저장은 됐는데 응답을 못 받아 다시 보낸 말)'
        + ' · 이어받아 보낸 말(다른 탭·닫힌 창이 남긴 것) 새로 저장 ' + n('savedOther') + ', 이미 있었음 ' + n('dupOther') + ' · 다른 탭이 저장했다고 알려 와 걷은 줄 ' + n('peerSaved'))
      + ' · 다시 보낸 횟수 ' + n('resend') + ' · 초기화 전이라 서버가 버림 ' + n('dropped') + ' · 너무 길어 거절 ' + n('tooLong') + ' · "저장 못 한 말"에서 다시 보낸 줄 ' + n('failResend'),
    '  ↳ 보존 판단: "이 창이 받아 적은 줄" = 보존 확인 + 서버가 버림·거절 + 지금 남은 것이면 빠진 것이 없어요. "이미 있었음"도 서버에 보존된 것이에요. 창을 새로 고친 뒤 보낸 말은 "이어받아 보낸 말"로 세어져요',
    '[끊김] 연결 끊김 ' + n('drops') + '번 · 누락 가능 구간 ' + n('gaps') + '곳 합계 ' + n('gapSec') + '초 · 끊긴 동안의 소리 이어 보내기 시도 ' + n('recovTry') + '번(' + n('recovTrySec') + '초) · Deepgram이 그 소리의 끝 위치까지 처리했다고 알림 ' + n('recovOk') + '번(' + n('recovSec') + '초) · 확인 전에 다시 끊김 ' + n('recovFail') + '번 · 소리 조각 보내기 실패 ' + n('sendFail'),
    '  ↳ "처리했다고 알림"은 Deepgram이 그 위치까지 들었다는 뜻이에요. 그때 한 말이 글로 맞게 적혔는지는 재지 못해요 (대화 탭에서 사람이 확인)',
    '[끄기] 종료 신호 보내기 실패 ' + n('closeFail') + '번 · 녹음기가 멈춤 신호를 주지 않아 2초 뒤 닫음 ' + n('stopForced') + '번 · 종료 신호 뒤에 와서 보내지 못한 소리 조각 ' + n('lateTail') + ' · 확정한 곳과 겹쳐 온 결과: 겹친 낱말만 뺌 ' + n('overlapCut') + '번, 낱말 시각이 없어 통째로 둠 ' + n('overlapKept') + '번',
    '[저장까지 걸린 시간] 중간 ' + sec(pct(o.lat, .5)) + ' · 느린 5% ' + sec(pct(o.lat, .95)) + ' (' + (latAll > o.lat.length ? '전체 ' + latAll + '줄 중 최근 ' + o.lat.length + '줄 표본' : o.lat.length + '줄 전체') + ') · 전체 평균 ' + sec(o.latN ? o.latSum / o.latN : (o.lat.length ? o.lat.reduce((a, b) => a + b, 0) / o.lat.length : null)) + ' · 전체 최대 ' + sec(o.latMax || (o.lat.length ? Math.max.apply(null, o.lat) : null)),
    '[지금 남은 것] 못 보낸 말 ' + queue.length + '줄 (메모리에만 ' + qMemOnly() + ') · 저장 못 한 말 ' + fl + '줄 (메모리에만 ' + failMemOnly() + ') · 누락 가능 구간 ' + gapGet().length + '곳',
    '[다음 할 일] 연 횟수 ' + n('nextOpen') + ' · 바로 보이는 부분이 화면에 뜨기까지 ' + tm('nextInstant') + ' · AI 추천이 화면에 뜨기까지 ' + tm('nextAi') + ' · 근거 보기 ' + n('nextEv') + '번 · 다시 추천 ' + n('nextForce') + '번 · "그 뒤 새 기록 있음"이 뜬 채로 본 횟수 ' + n('nextStale'),
    '[지금 장면] 연 횟수 ' + n('kNow') + ' · 화면에 뜨기까지 ' + tm('kNow') + ' · AI 없이 판정 찾기 ' + n('kRollQuick') + '번 · AI로 판정 묻기 ' + n('kRollAi') + '번 · 장면 추정을 손으로 고침 ' + n('kSceneFix') + '번 · 장면 고정 ' + n('kScenePin') + '번 · NPC 카드 펼침 ' + n('kNpcOpen') + '번 · 원문 보기 ' + n('kEv') + '번',
    '  ↳ "화면에 뜨기까지"는 누른 뒤 화면에 그려질 때까지의 시간이에요. 읽고 이해하는 데 걸린 시간은 기계가 재지 못해요 (세션 뒤 설문으로)'
  ].join('\n');
}
function statShow(){ const b = $('statBox'); if (!b || !b.open) return; $('statTxt').textContent = statText(); }
const statInit = () => {
  const b = $('statBox'); if (!b) return;
  b.addEventListener('toggle', statShow);
  $('statCopy').onclick = async () => { try { await navigator.clipboard.writeText(statText()); toast('복사했어요'); } catch (_) { toast('복사하지 못했어요. 글을 길게 눌러 복사해 주세요'); } };
  $('statReset').dataset.label = '새로 재기'; twoStep($('statReset'), async () => { statO = { since: Date.now(), n: {}, lat: [], ms: {}, url: cfg.url }; statSave(true); statShow(); });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', statInit); else setTimeout(statInit, 0);      // twoStep은 뒤에 읽는 파일(keeper.js)에 있다
