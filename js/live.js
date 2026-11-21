/* TRPG Archive · 주기적으로 읽어 오기 · 받아쓰기 · 알림 · 설정 탭
 * 모든 js 파일은 index.html 아래에서 순서대로 읽고 이름(함수·변수)을 함께 쓴다. */
'use strict';
/* ── 주기적으로 읽어 오기 ── */
let failCount = 0, live = {}, lastNewAt = Date.now();   // live: 마지막으로 받은 세션 번호·초기화 번호 (말할 때 붙여 둔다)
function net(cls, text){ $('netPill').className = 'chip net ' + cls; $('netPill').lastChild.textContent = text; }
async function pollOnce(){
  try {
    const r = await api('poll', { since: lastId, me: cfg.name, mic: micStatus, why: micStatus === 'off' ? micWhy : '', hid: document.hidden ? '1' : '' });
    if (!r.ok) throw new Error(r.error);
    failCount = 0; net('on', '연결됨');
    const v = r.v;
    if (live.resetVer !== undefined && v.resetVer !== live.resetVer) {
      resetLog(); ver = {}; live = {};
      keeperReset();                                  // 지워진 회의록으로 만들던 마스터 쪽 결과·초안도 버린다 (늦게 오는 답 포함)
      toast('마스터가 기록을 초기화했어요');
      setTimeout(pollOnce, 300); return;
    }
    live = { session: v.session, resetVer: v.resetVer };
    $('sessPill').textContent = '세션 ' + v.session;
    if (r.jumped) resetLog();                       // 너무 오래 끊겨 있었으면 최근 300줄부터 다시
    if (!lastId) hasOlder = r.from > 0;
    addLogLines(r.lines, { quiet: !lastId });
    if (r.lines.length) { const ll = r.lines[r.lines.length - 1]; lastId = Math.max(lastId, ll.last || ll.id); lastNewAt = Date.now(); }      // last: 나뉘어 저장된 긴 말의 마지막 조각 번호
    else if (!allLines.length) renderLog();
    renderWho(r.presence);
    renderSumState(v);
    if (data && ver.sumVer && v.sumVer !== ver.sumVer) srSay('새 요약이 도착했어요');
    if (!data || ['sumVer','notesVer','charVer','imgVer','session','resetVer','colorVer'].some(k => v[k] !== ver[k])) await refreshData();
  } catch (e) {
    failCount++; net('err', '연결 끊김 · 재시도');
    if (String(e.message || '').includes('비밀번호')) { stopAll(''); showJoin('방 비밀번호가 틀렸어요'); return; }
  }
  setTimeout(pollOnce, pollGap());
}
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
/* 기기 보관 두 번째 자리(IndexedDB): localStorage가 꽉 차거나 지워져도 못 보낸 말이 남게 같은 내용을 한 벌 더 둔다.
 * 다시 읽을 때 이미 보낸 말이 섞여 있어도 서버가 발언ID로 걸러서 두 번 저장되지 않는다. 실패해도 조용히 넘어간다(없던 때와 같음). */
const qdb = {
  p: null,
  open(){ if (this.p) return this.p; this.p = new Promise((ok, no) => { try { const r = indexedDB.open('trpg_q', 1); r.onupgradeneeded = () => r.result.createObjectStore('q'); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); } catch (e) { no(e); } }); this.p.catch(() => { this.bad = true; }); return this.p; },
  async put(k, v){ try { const d = await this.open(); await new Promise((ok, no) => { const t = d.transaction('q', 'readwrite'); if (v && v.length) t.objectStore('q').put(v, k); else t.objectStore('q').delete(k); t.oncomplete = ok; t.onerror = t.onabort = () => no(t.error); }); this.bad = false; return true; } catch (_) { this.bad = true; return false; } },
  async get(k){ try { const d = await this.open(); return await new Promise((ok, no) => { const r = d.transaction('q').objectStore('q').get(k); r.onsuccess = () => ok(r.result || []); r.onerror = () => no(r.error); }); } catch (_) { return []; } }
};
function loadQueue(){
  try { queue = JSON.parse(S.get(qKey()) || '[]'); } catch(_) { queue = []; }
  const k0 = qKey();
  qdb.get(k0).then(a => {                               // 두 번째 자리에만 남아 있던 말을 되살린다
    if (k0 !== qKey() || !Array.isArray(a)) return;
    const mine = new Set(queue.map(x => x.uid)); let n = 0;
    a.forEach(x => { if (x && x.uid && x.text && !mine.has(x.uid) && !qGone.has(x.uid)) { queue.push(x); n++; } });
    if (n) { queue.sort((x, y) => (String(x.t) < String(y.t) ? -1 : String(x.t) > String(y.t) ? 1 : 0)); saveQueue(); }
  });
  // 예전 버전 대기열(t_queue)을 지금 방·이름으로 옮긴다
  const old = S.get('t_queue');
  if (old) {
    try { JSON.parse(old).forEach(x => x && x.text && queue.push({ uid: newUid(), name: cfg.name, session: '', rv: '', t: x.t, text: x.text })); } catch(_) {}
    S.del('t_queue');
  }
  saveQueue();
}
/* 같은 방을 두 탭에서 열어도 서로의 미전송 말을 지우지 않게: 저장할 때 저장소에 있는 다른 탭의 말을 합친다.
 * 이 탭이 서버 저장을 확인한 말(qGone)만 뺀다. 기기 저장이 실패하면(공간 부족 등) 화면에 알린다. */
const qGone = new Set(); let qStoreErr = false;
function saveQueue(){
  // 못 보낸 말이 5,000줄을 넘어도 버리지 않는다: 오래된 것부터 "저장 못 한 말" 목록으로 옮긴다 (복사·내려받기·다시 보내기 가능)
  if (queue.length > QMAX) { const over = queue.slice(0, queue.length - QMAX); queue = queue.slice(-QMAX); over.forEach(x => qGone.add(x.uid)); failAdd(over, '못 보낸 말이 5,000줄을 넘어 따로 보관'); toast('못 보낸 말이 너무 많아 오래된 ' + over.length + '줄을 "저장 못 한 말"로 옮겼어요 (설정 탭)'); }
  if (cfg.url) {
    let other = []; try { other = JSON.parse(localStorage.getItem(qKey()) || '[]'); } catch (_) {}
    const mine = new Set(queue.map(x => x.uid));
    const all = queue.concat((Array.isArray(other) ? other : []).filter(x => x && x.uid && !mine.has(x.uid) && !qGone.has(x.uid)));
    let lsOk = true;
    try { if (all.length) localStorage.setItem(qKey(), JSON.stringify(all)); else localStorage.removeItem(qKey()); }
    catch (_) { lsOk = false; }
    qStoreErr = !lsOk && qdb.bad !== false;             // 두 자리 모두 실패했을 때만 "기기 보관 실패"
    qdb.put(qKey(), all).then(ok => { const e = !lsOk && !ok; if (e !== qStoreErr) { qStoreErr = e; sendState(); } });
  }
  if (failMem.length) failAdd([], '');                  // 보관하지 못했던 "저장 못 한 말"을 다시 보관해 본다
  sendState();
}
/* 다른 탭이 남기고 닫힌 말(1분 넘게 그대로인 것)을 이 탭이 이어받아 보낸다. 두 탭이 같이 보내도 서버가 발언ID로 거른다 */
function adoptOrphans(){
  if (!cfg.url) return;
  let other = []; try { other = JSON.parse(localStorage.getItem(qKey()) || '[]') || []; } catch (_) { return; }
  const mine = new Set(queue.map(x => x.uid)), old = Date.now() - 60000; let n = 0;
  other.forEach(x => { if (x && x.uid && x.text && !mine.has(x.uid) && !qGone.has(x.uid) && !(new Date(x.t).getTime() > old)) { queue.push(x); n++; } });
  if (n) saveQueue();
}
setInterval(adoptOrphans, 30000);
function sendState(){
  const n = queue.length, pill = $('sendPill'), st = $('sendSt');
  if (!pill) return;
  let txt = '', cls = '';
  if (sendErr && n) { txt = '⚠ 저장 실패 · 미전송 ' + n + '줄'; cls = 'sendErr'; }
  else if (n) { txt = '보내는 중 ' + n + '줄'; cls = 'send'; }
  else if (failGet().length) { txt = '⚠ 저장 못 한 말 ' + failGet().length + '줄 (설정 탭에서 복사)'; cls = 'sendErr'; }
  else if (gapGet().length) { txt = '⚠ 기록이 빠졌을 수 있는 구간 ' + gapGet().length + '곳'; cls = 'sendErr'; }
  pill.classList.toggle('hide', !txt); pill.className = 'chip net ' + cls + (txt ? '' : ' hide');
  pill.lastChild.textContent = txt; pill.title = sendErr ? '마지막 오류: ' + sendErr + ' (자동으로 다시 보내요)' : '내 말이 시트에 저장됐는지';
  st.className = 'sendst' + (sendErr && n ? ' warn' : '');
  if (qStoreErr && n) { pill.classList.remove('hide'); pill.className = 'chip net sendErr'; pill.lastChild.textContent = '⚠ 기기 보관 실패 · 미전송 ' + n + '줄'; pill.title = '이 기기 저장 공간이 부족해 못 보낸 말을 보관하지 못했어요. 이 창을 닫으면 사라질 수 있으니 연결이 돌아올 때까지 열어 두세요'; }
  const nf = failGet().length, ng = gapGet().length;
  st.textContent = n ? (sendErr ? '⚠ 미전송 ' + n + '줄 · ' + sendErr + ' · 4초마다 다시 보내요 (' + (qStoreErr ? '⚠ 이 기기에 보관하지 못함: 창을 닫지 마세요' : '이 기기에 보관 중') + ')' : '미전송 ' + n + '줄 보내는 중…')
    : (nf ? '' : (sentOnce ? '✔ 받아 적은 말은 모두 저장됨' + (ng ? ' · ⚠ 받아쓰기가 끊겨 빠졌을 수 있는 구간 ' + ng + '곳 (설정 탭)' : '') : ''));
  failShow(); gapShow();
}
async function flush(){
  if (sending || authBad || !queue.length || !cfg.url) return;
  sending = true;
  const batch = queue.slice(0, 100);
  const ac = window.AbortController ? new AbortController() : null;
  const to = setTimeout(() => ac && ac.abort(), 45000);
  try {
    const r = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ action: 'lines', pw: cfg.pw, pt: ptFor(cfg.url), items: batch }), signal: ac ? ac.signal : undefined }).then(x => x.json());
    if (!r.ok) { if (/비밀번호/.test(r.error || '')) authBad = true; throw new Error(r.error || '저장 실패'); }   // 비밀번호가 바뀌었으면 다시 입장할 때까지 보내지 않는다
    // 서버가 받지 않은 말은 먼저 "저장 못 한 말" 목록에 옮겨 적은 뒤에 대기열에서 뺀다 (목록 보관이 실패하면 이 창의 메모리에 남고 화면에 계속 보인다)
    if ((r.tooLong || []).length) { failAdd(batch.filter(q => r.tooLong.includes(q.uid)), '100만 자가 넘어 서버가 받지 않음'); toast('100만 자가 넘는 말 ' + r.tooLong.length + '줄은 저장하지 못했어요. 원문은 "저장 못 한 말"에서 복사할 수 있어요'); }
    const done = new Set([].concat(r.saved || [], r.dup || [], r.dropped || [], r.tooLong || []));
    done.forEach(u => qGone.add(u));
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
 * 보낼 곳은 대기열에 적힌 주소 그대로라서 언제나 원래 방에 들어가고, 서버가 발언ID로 걸러서 두 번 저장되지 않는다. */
let othersBusy = false, othersTurn = 0; const othersNeed = {};
async function flushOthers(){
  if (othersBusy || sending || !navigator.onLine) return;
  // 보낼 수 있는 방을 고른다. 비밀번호가 없는 방은 표시만 하고 건너뛰어서, 그 방 때문에 다른 방의 말이 밀리지 않게 한다 (방마다 차례가 돌아가게 순서를 돌린다)
  const keys = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('t_q:') && k !== qKey() && (JSON.parse(localStorage.getItem(k) || '[]') || []).length) keys.push(k); } } catch(_) { return; }
  if (!keys.length) return;
  keys.sort(); othersTurn++;
  let key = '', url = '', pw = '', pt = '', items = [], changed = false;
  for (let j = 0; j < keys.length && !key; j++) {
    const k = keys[(othersTurn + j) % keys.length], u = k.slice(4); if (!/^https:\/\//.test(u)) continue;
    const room = roomsGet().find(x => scriptUrl(x.url) === u);
    // 그 방의 비밀번호나 기기 토큰이 이 기기에 없으면 보내지 않는다 (지금 방 비밀번호를 대신 보내지 않음). 원문은 그대로 보관하고 다시 들어가라고 안내한다
    const w = room && room.pw ? room.pw : '', t = ptFor(u);
    if (!w && !t) { if (!othersNeed[k]) { othersNeed[k] = 1; changed = true; } continue; }
    if (othersNeed[k] && Date.now() - othersNeed[k] < 120000) continue;       // 방금 비밀번호 오류가 난 방은 2분 쉬었다가
    let a = []; try { a = JSON.parse(localStorage.getItem(k) || '[]') || []; } catch(_) {}
    if (a.length) { key = k; url = u; pw = w; pt = t; items = a; }
  }
  if (changed) otherRooms();
  if (!key) return;
  othersBusy = true;
  try {
    const body = { action: 'lines', items: items.slice(0, 100) }; if (pw) body.pw = pw; if (pt) body.pt = pt;
    const r = await fetch(url, { method: 'POST', body: JSON.stringify(body) }).then(x => x.json());
    if (r && !r.ok && /비밀번호|잠/.test(r.error || '')) { othersNeed[key] = Date.now(); otherRooms(); }
    if (r && r.ok) {
      delete othersNeed[key];
      let kept = true;
      if ((r.tooLong || []).length) kept = failAdd(items.filter(q => r.tooLong.includes(q.uid)), '100만 자가 넘어 서버가 받지 않음', url);
      const done = new Set([].concat(r.saved || [], r.dup || [], r.dropped || [], kept ? (r.tooLong || []) : []));     // 실패 목록에 옮겨 적지 못했으면 원래 자리에 그대로 둔다
      let now = []; try { now = JSON.parse(localStorage.getItem(key) || '[]') || []; } catch(_) {}
      now = now.filter(q => !done.has(q.uid));
      if (now.length) localStorage.setItem(key, JSON.stringify(now)); else localStorage.removeItem(key);
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
  if (!queue.length) return;
  try { navigator.sendBeacon(cfg.url, new Blob([JSON.stringify({ action: 'lines', pw: cfg.pw, pt: ptFor(cfg.url), items: queue.slice(0, 100) })], { type: 'text/plain' })); } catch(_) {}
});
function otherRooms(){
  const box = $('otherQ'); let total = 0; const keys = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('t_q:') && k !== qKey()) { const n = JSON.parse(localStorage.getItem(k) || '[]').length; if (n) { total += n; keys.push(k); } } } } catch(_) {}
  box.classList.toggle('hide', !total); box.innerHTML = '';
  if (!total) return;
  const need = keys.filter(k => othersNeed[k]);
  box.append('다른 방 주소로 못 보낸 말이 ' + total + '줄 있어요. ' + (need.length ? '그 방의 비밀번호가 이 기기에 없어서 보내지 못하고 보관 중이에요. 그 방에 다시 들어가면 자동으로 보내요. ' : '원래 방 주소로 자동으로 보내는 중이에요. '));
  need.forEach(k => { const u = k.slice(4), r = roomsGet().find(x => scriptUrl(x.url) === u); const b2 = el('button', '', (r && r.name ? r.name : '그 방') + '에 다시 들어가기'); b2.onclick = () => { if (r) switchRoom(r); else { S.set('t_url', u); location.reload(); } }; box.append(b2, ' '); });
  const b = el('button', '', '버리기'); b.dataset.label = '버리기'; twoStep(b, async () => { keys.forEach(k => S.del(k)); otherRooms(); }); box.append(b);
}

let ws = null, rec = null, stream = null, running = false, wantStop = false, micStatus = 'off';
let micWhy = '', micIntent = false;
let wsGen = 0, starting = false, retryN = 0, tkCache = null, wakeLock = null, dropCount = 0, retryTimer = 0;
/* 끊긴 동안의 말을 잃지 않기 위한 세 가지:
 *  ① 확정 전 글(pend): Deepgram이 아직 확정하지 않은 글. 연결이 끊기면 그대로 한 줄로 저장한다.
 *  ② 소리 임시 보관(abuf): 연결이 끊긴 동안의 마이크 소리를 이 창의 메모리에만 최대 90초 모아 두었다가, 다시 연결되면 이어서 보낸다.
 *     원래 실시간으로 보내던 바로 그 소리이고, 디스크에 쓰지 않으며, 보낸 뒤나 받아쓰기를 끄면 바로 버린다.
 *  ③ 누락 가능 구간(gap): 90초를 넘겨 소리를 버렸거나 전송이 막혀 못 보낸 구간. 시각을 이 기기에 적고 대화에도 안내 줄을 남긴다. */
const ABUF_MS = 90000, GAP_MIN = 5000;
let pend = '', abuf = [], abufAt = 0, abufLost = false, gapFrom = 0, lastDrain = 0, recMime = '';
function pushLine(text){ lastActivity = Date.now(); queue.push({ uid: newUid(), name: cfg.name, session: live.session || '', rv: live.resetVer || '', t: new Date().toISOString(), text }); saveQueue(); }
function commitPend(){ const t = pend.trim(); pend = ''; $('interim').textContent = ''; if (t) pushLine(t); }
const gapKey = () => 't_gap:' + cfg.url;
function gapGet(){ if (!cfg.url) return []; try { return JSON.parse(localStorage.getItem(gapKey()) || '[]') || []; } catch(_) { return gapMem; } }
let gapMem = [];
function noteGap(from, to, why){
  if (!from || to - from < GAP_MIN || !cfg.url) return;
  const hm = t => new Date(t).toTimeString().slice(0, 8), sec = Math.round((to - from) / 1000);
  const a = gapGet().concat([{ from: new Date(from).toISOString(), to: new Date(to).toISOString(), sec, why, name: cfg.name }]).slice(-50);
  gapMem = a; try { localStorage.setItem(gapKey(), JSON.stringify(a)); } catch(_) {}
  // 대화에도 한 줄 남겨서 모두(와 요약)에게 이 구간이 비어 있을 수 있음을 알린다
  pushLine('※ 받아쓰기 끊김 약 ' + (sec >= 60 ? Math.floor(sec / 60) + '분 ' + (sec % 60) + '초' : sec + '초') + ' (' + hm(from) + '~' + hm(to) + ', ' + why + '). 이 사이 ' + cfg.name + '의 말은 기록되지 않았을 수 있어요');
}
function gapShow(){
  const box = $('gapBox'); if (!box) return;
  const a = gapGet(); box.classList.toggle('hide', !a.length); if (!a.length) return;
  box.innerHTML = '';
  box.append('⚠ 받아쓰기가 끊겨 내 말이 빠졌을 수 있는 구간 ' + a.length + '곳: ' + a.slice(-8).map(g => new Date(g.from).toTimeString().slice(0, 8) + ' 약 ' + g.sec + '초').join(' · ') + '. 대화 탭에도 "※ 받아쓰기 끊김" 줄로 남아 있어요. 빠진 말은 직접 다시 말하거나 적어 주세요. ');
  const rm = el('button', '', '확인했어요'); rm.onclick = () => { gapMem = []; try { localStorage.removeItem(gapKey()); } catch(_) {} sendState(); }; box.append(rm);
}
/* 새 녹음기. 연결이 열려 있으면 바로 보내고, 아니면 메모리에 모은다. 연결마다 새 녹음기가 필요하다(소리 파일의 머리말이 첫 조각에만 있어서). */
function recStart(){
  if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch(_) {} }
  rec = null; abuf = []; abufAt = Date.now(); abufLost = false;
  if (!micAlive()) { abufLost = true; return; }
  let r; try { r = new MediaRecorder(stream, recMime ? { mimeType: recMime } : undefined); } catch(_) { abufLost = true; return; }
  r.ondataavailable = ev => {
    if (r !== rec || !ev.data.size) return;
    const w = ws;
    if (w && w.readyState === 1 && w._live) {
      if (w.bufferedAmount < 16000) lastDrain = Date.now();
      if (w.bufferedAmount > 400000) {                         // 네트워크가 막혀 소리가 밀림: 끊고 새로 연결. 못 보낸 구간은 누락 가능 구간으로 적는다
        logDrop('전송이 막혀 쌓임(네트워크 정체)'); noteGap(lastDrain || Date.now() - 30000, Date.now(), '전송 정체'); lastDrain = Date.now();
        try { w.close(); } catch(_) {} return;
      }
      try { while (abuf.length) w.send(abuf.shift()); w.send(ev.data); r._sent = true; } catch(_) {}
    } else if (!abufLost) {
      if (Date.now() - abufAt <= ABUF_MS) abuf.push(ev.data);
      else { abuf = []; abufLost = true; }                     // 90초를 넘김: 모아 둔 소리를 버리고, 다시 연결될 때 누락 가능 구간으로 적는다
    }
  };
  rec = r; try { r.start(250); } catch(_) { rec = null; abufLost = true; }
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
    // 마이크 장치가 끊겼으면(이어폰 뽑힘, 블루투스 전환, 절전) 죽은 마이크로 재연결하지 말고 새로 잡는다
    if (stream && !micAlive()) { try { stream.getTracks().forEach(t => t.stop()); } catch(_) {} stream = null; }
    if (!stream) {
      const fx = $('micFx').checked;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: fx, noiseSuppression: fx, autoGainControl: fx } });
        stream.getAudioTracks().forEach(tr => { tr.onended = () => { if (wantStop || tr.readyState !== 'ended') return; logDrop('마이크 장치 끊김'); $('micInfo').textContent = '마이크가 끊겼어요 (장치를 뽑았거나 다른 프로그램이 가져감). 다시 잡는 중…'; try { if (ws) ws.close(); } catch(_) {} if (!ws || ws.readyState > 1) scheduleRestart(500); }; });
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
    commitPend();                                           // 옛 연결에서 확정되지 못한 글은 버리지 않고 한 줄로 저장
    const my = ++wsGen;                                     // 옛 연결의 늦은 신호가 새 연결을 건드리지 못하게 번호를 매긴다
    if (ws && ws.readyState <= 1) { try { ws.close(); } catch(_) {} if (!gapFrom) gapFrom = Date.now(); recStart(); }    // 죽은 연결을 버릴 때도 지금부터의 소리를 모아 둔다
    const w = new WebSocket('wss://api.deepgram.com/v1/listen?' + p.toString(), ['bearer', tk.token]);
    ws = w; let opened = false, ka = 0;
    w.onopen = () => {
      if (my !== wsGen) { try { w.close(); } catch(_) {} return; }
      opened = true; retryN = 0;
      recMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      // 끊긴 동안 모아 둔 소리가 온전하면(90초 이내) 그 녹음기를 그대로 이어 쓰고 모은 것부터 보낸다. 아니면 새 녹음기로 시작하고 빈 구간을 적는다
      const keep = rec && rec.state !== 'inactive' && !rec._sent && !abufLost && abuf.length;
      if (gapFrom && !keep) noteGap(gapFrom, Date.now(), '연결 끊김');
      gapFrom = 0; lastDrain = Date.now(); w._live = true;
      if (keep) { try { while (abuf.length) w.send(abuf.shift()); rec._sent = true; } catch(_) {} }
      else recStart();
      ka = setInterval(() => { if (w.readyState === 1) { try { w.send(JSON.stringify({ type: 'KeepAlive' })); } catch(_) {} } }, 8000);
      running = true; document.title = 'TRPG Archive'; micState('on', '받아쓰는 중 · 멈추기');
      if (dropCount) $('micInfo').textContent = '연결이 ' + dropCount + '번 끊겼다가 자동으로 다시 이어졌어요'; else $('micInfo').textContent = '';
      keepAwake(true);
    };
    w.onmessage = ev => {
      if (my !== wsGen) return;
      let m; try { m = JSON.parse(ev.data); } catch(_) { return; }
      if (m.type !== 'Results') return;
      const t = (m.channel && m.channel.alternatives && m.channel.alternatives[0] || {}).transcript || '';
      if (m.is_final) { pend = ''; $('interim').textContent = ''; if (t.trim()) pushLine(t.trim()); }
      else { pend = t; $('interim').textContent = t ? cfg.name + ': ' + t : ''; }
    };
    w.onclose = ev => {
      clearInterval(ka);
      if (my !== wsGen) return;                              // 이미 새 연결로 넘어간 옛 연결의 종료는 무시
      w._live = false; commitPend();                         // 확정 전 글을 한 줄로 저장
      running = false;
      if (wantStop) { if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch(_){} } rec = null; abuf = []; return; }
      if (!gapFrom) gapFrom = Date.now();
      if (opened || !rec) recStart();                        // 끊긴 동안의 소리를 메모리에 모으기 시작 (열리지도 못한 재시도 중에는 이미 모으는 중이라 그대로)
      if (!opened) tkCache = null;                           // 열리지도 못했으면 토큰이 문제일 수 있으니 새로 받는다
      logDrop('연결 끊김 코드 ' + (ev && ev.code) + (ev && ev.reason ? ' ' + ev.reason : ''));
      micState('conn', '다시 연결 중…');
      $('micInfo').textContent = '연결이 끊겨 다시 잇는 중이에요 (끊김 ' + dropCount + '번, 코드 ' + (ev && ev.code) + ')';
      scheduleRestart(Math.min(5000, 400 * Math.pow(2, retryN++)));   // 0.4초부터 시작해 길게는 5초 간격
    };
  } finally { starting = false; }
}
// 다른 창을 보다 돌아왔을 때, 또는 인터넷이 다시 연결됐을 때: 끊겨 있으면 바로 다시 잇는다 (화면 꺼짐 방지도 다시 건다)
function resumeIfDropped(){
  if (wantStop || !stream) return;
  if (running && ws && ws.readyState === 1) { keepAwake(true); return; }       // 잘 이어져 있으면 건드리지 않는다
  if (!starting) { running = false; retryN = 0; scheduleRestart(100); }          // 닫힘 신호 없이 죽은 연결이면 새로 연결
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeIfDropped(); });
window.addEventListener('online', resumeIfDropped);
function stopAll(why){
  micWhy = why || ''; micIntent = false;
  wantStop = true; clearTimeout(retryTimer); keepAwake(false); tkCache = null;
  if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify({ type: 'CloseStream' })); } catch(_){} }
  const w = ws; setTimeout(() => { if (w) { try { w.close(); } catch(_){} } }, 800);
  if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch(_){} }
  rec = null; abuf = [];
  if (gapFrom) { noteGap(gapFrom, Date.now(), '연결 끊김'); gapFrom = 0; }      // 끊긴 채로 껐으면 그 구간은 받아 적지 못했다
  if (!ws || ws.readyState !== 1) commitPend();              // 연결이 살아 있으면 0.8초 안에 오는 확정 글을 기다리고(닫힐 때 남은 글을 저장), 아니면 지금 저장
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


/* 저장 못 한 말 (서버가 받지 않은 원문). 지워지지 않게 이 기기에 따로 두고, 복사·파일로 내려받을 수 있게 한다. '모두 저장됨'과 구분해 보여 준다 */
const failKey = url => 't_fail:' + (url || cfg.url);
let failMem = [];                 // 이 기기에 보관하지 못한 "저장 못 한 말" (이 창이 열려 있는 동안만 남는다. 화면에는 계속 보인다)
function failStored(url){ try { return JSON.parse(localStorage.getItem(failKey(url)) || '[]') || []; } catch(_) { return []; } }
function failGet(url){ const a = failStored(url); if (url && url !== cfg.url) return a; return a.concat(failMem.filter(m => !a.some(x => x.uid === m.uid))); }
// 돌려주는 값: 이 기기에 보관했으면 true. 보관하지 못하면 (지금 방의 말은) 메모리에 두고 false
function failAdd(items, why, url){
  const here = !url || url === cfg.url;
  const a = failStored(url), add = (items || []).map(q => ({ uid: q.uid, name: q.name, t: q.t, text: q.text, session: q.session, rv: q.rv, why }));
  (here ? failMem.concat(add) : add).forEach(q => { if (!a.some(x => x.uid === q.uid)) a.push(q); });
  let ok = true;
  try { if (a.length) localStorage.setItem(failKey(url), JSON.stringify(a)); if (here) failMem = []; }
  catch (_) { ok = false; if (here) { add.forEach(q => { if (!failMem.some(x => x.uid === q.uid)) failMem.push(q); }); } if (add.length) toast('저장 못 한 말을 이 기기에 보관하지 못했어요. 이 창을 닫기 전에 설정 탭에서 복사해 두세요'); }
  if (add.length) sendState();
  return ok;
}
function failText(){ return failGet().map(x => '[' + String(x.t || '').replace('T', ' ').slice(0, 19) + '] ' + x.name + ': ' + x.text).join('\n\n'); }
function failShow(){
  const box = $('failBox'); if (!box) return;
  const a = failGet(); box.classList.toggle('hide', !a.length); if (!a.length) return;
  box.innerHTML = '';
  box.append('⚠ 저장 못 한 말 ' + a.length + '줄 (' + (a[0].why || '') + '). 원문은 ' + (failMem.length ? '⚠ 이 창의 메모리에만 있어요 (기기 저장 공간 부족). 창을 닫기 전에 복사하거나 내려받아 주세요. ' : '이 기기에만 있어요. '));
  // 서버가 거절한 것이 아니라 밀려서 옮겨 둔 말은 다시 보낼 수 있다
  const back = a.filter(x => !/100만 자/.test(x.why || '')).slice(0, Math.max(0, QMAX - queue.length));
  if (back.length) { const rs = el('button', '', '다시 보내기 (' + back.length + '줄)'); rs.onclick = () => { const ids = new Set(back.map(x => x.uid)); back.forEach(x => { qGone.delete(x.uid); if (!queue.some(q => q.uid === x.uid)) queue.push({ uid: x.uid, name: x.name, session: x.session || '', rv: x.rv || '', t: x.t, text: x.text }); }); failMem = failMem.filter(x => !ids.has(x.uid)); const rest = failStored().filter(x => !ids.has(x.uid)); try { if (rest.length) localStorage.setItem(failKey(), JSON.stringify(rest)); else localStorage.removeItem(failKey()); } catch(_) {} saveQueue(); flush(); }; box.append(rs, ' '); }
  const cp = el('button', '', '복사'); cp.onclick = async () => { try { await navigator.clipboard.writeText(failText()); toast('복사했어요'); } catch (_) { toast('복사하지 못했어요. 내려받기를 써 주세요'); } };
  const dl = el('button', '', '내려받기'); dl.onclick = () => { const b = new Blob([failText()], { type: 'text/plain' }); const u = URL.createObjectURL(b); const x = document.createElement('a'); x.href = u; x.download = '저장_못_한_말.txt'; x.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); };
  const rm = el('button', '', '목록 비우기'); rm.dataset.label = '목록 비우기'; if (typeof twoStep === 'function') twoStep(rm, async () => { failMem = []; try { localStorage.removeItem(failKey()); } catch (_) {} sendState(); });
  box.append(cp, ' ', dl, ' ', rm);
}
