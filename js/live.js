/* TRPG Archive · 주기적으로 읽어 오기 · 받아쓰기 · 알림 · 설정 탭
 * 모든 js 파일은 index.html 아래에서 순서대로 읽고 이름(함수·변수)을 함께 쓴다. */
'use strict';
/* ── 주기적으로 읽어 오기 ── */
let failCount = 0, live = {};   // live: 마지막으로 받은 세션 번호·초기화 번호 (말할 때 붙여 둔다)
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
    if (r.lines.length) lastId = Math.max(lastId, r.lines[r.lines.length - 1].id);
    else if (!allLines.length) renderLog();
    renderWho(r.presence);
    renderSumState(v);
    if (!data || ['sumVer','notesVer','charVer','imgVer','session','resetVer','colorVer'].some(k => v[k] !== ver[k])) await refreshData();
  } catch (e) {
    failCount++; net('err', '연결 끊김 · 재시도');
    if (String(e.message || '').includes('비밀번호')) { stopAll(''); showJoin('방 비밀번호가 틀렸어요'); return; }
  }
  setTimeout(pollOnce, failCount ? 8000 : 5000);
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
function loadQueue(){
  try { queue = JSON.parse(S.get(qKey()) || '[]'); } catch(_) { queue = []; }
  // 예전 버전 대기열(t_queue)을 지금 방·이름으로 옮긴다
  const old = S.get('t_queue');
  if (old) {
    try { JSON.parse(old).forEach(x => x && x.text && queue.push({ uid: newUid(), name: cfg.name, session: '', rv: '', t: x.t, text: x.text })); } catch(_) {}
    S.del('t_queue');
  }
  saveQueue();
}
function saveQueue(){
  if (queue.length > QMAX) { toast('못 보낸 말이 너무 많아 오래된 ' + (queue.length - QMAX) + '줄을 버렸어요'); queue = queue.slice(-QMAX); }
  if (cfg.url) S.set(qKey(), JSON.stringify(queue));
  sendState();
}
function sendState(){
  const n = queue.length, pill = $('sendPill'), st = $('sendSt');
  if (!pill) return;
  let txt = '', cls = '';
  if (sendErr && n) { txt = '⚠ 저장 실패 · 미전송 ' + n + '줄'; cls = 'sendErr'; }
  else if (n) { txt = '보내는 중 ' + n + '줄'; cls = 'send'; }
  pill.classList.toggle('hide', !txt); pill.className = 'chip net ' + cls + (txt ? '' : ' hide');
  pill.lastChild.textContent = txt; pill.title = sendErr ? '마지막 오류: ' + sendErr + ' (자동으로 다시 보내요)' : '내 말이 시트에 저장됐는지';
  st.className = 'sendst' + (sendErr && n ? ' warn' : '');
  st.textContent = n ? (sendErr ? '⚠ 미전송 ' + n + '줄 · ' + sendErr + ' · 4초마다 다시 보내요 (이 기기에 보관 중)' : '미전송 ' + n + '줄 보내는 중…') : (sentOnce ? '✔ 내 말 모두 저장됨' : '');
}
async function flush(){
  if (sending || authBad || !queue.length || !cfg.url) return;
  sending = true;
  const batch = queue.slice(0, 100);
  const ac = window.AbortController ? new AbortController() : null;
  const to = setTimeout(() => ac && ac.abort(), 45000);
  try {
    const r = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ action: 'lines', pw: cfg.pw, items: batch }), signal: ac ? ac.signal : undefined }).then(x => x.json());
    if (!r.ok) { if (/비밀번호/.test(r.error || '')) authBad = true; throw new Error(r.error || '저장 실패'); }   // 비밀번호가 바뀌었으면 다시 입장할 때까지 보내지 않는다
    const done = new Set([].concat(r.saved || [], r.dup || [], r.dropped || []));
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
// 창을 닫을 때: 대기열은 그대로 두고 마지막으로 한 번 던져 본다 (저장됐는지 모르니 다음 접속 때 다시 보내고, 서버가 중복을 거른다)
window.addEventListener('pagehide', ev => {
  if (!cfg.url || !navigator.sendBeacon) return;
  // 창을 정말 닫을 때(되돌아올 수 있는 일시 정지가 아닐 때)만 "일부러 나갔다"고 알려서, 다른 사람에게 끊김 알림이 가지 않게 한다
  if (!ev.persisted && cfg.name) { try { navigator.sendBeacon(cfg.url, new Blob([JSON.stringify({ action: 'bye', pw: cfg.pw, name: cfg.name })], { type: 'text/plain' })); } catch(_) {} }
  if (!queue.length) return;
  try { navigator.sendBeacon(cfg.url, new Blob([JSON.stringify({ action: 'lines', pw: cfg.pw, items: queue.slice(0, 100) })], { type: 'text/plain' })); } catch(_) {}
});
function otherRooms(){
  const box = $('otherQ'); let total = 0; const keys = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith('t_q:') && k !== qKey()) { const n = JSON.parse(localStorage.getItem(k) || '[]').length; if (n) { total += n; keys.push(k); } } } } catch(_) {}
  box.classList.toggle('hide', !total); box.innerHTML = '';
  if (!total) return;
  box.append('다른 방 주소로 못 보낸 말이 ' + total + '줄 있어요. 그 방으로 다시 들어가면 자동으로 보내요. ');
  const b = el('button', '', '버리기'); b.dataset.label = '버리기'; twoStep(b, async () => { keys.forEach(k => S.del(k)); otherRooms(); }); box.append(b);
}

let ws = null, rec = null, stream = null, running = false, wantStop = false, micStatus = 'off';
let micWhy = '', micIntent = false;
let wsGen = 0, starting = false, retryN = 0, tkCache = null, wakeLock = null, dropCount = 0, retryTimer = 0;
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
    const my = ++wsGen;                                     // 옛 연결의 늦은 신호가 새 연결을 건드리지 못하게 번호를 매긴다
    if (ws && ws.readyState <= 1) { try { ws.close(); } catch(_) {} }
    const w = new WebSocket('wss://api.deepgram.com/v1/listen?' + p.toString(), ['bearer', tk.token]);
    ws = w; let opened = false, ka = 0;
    w.onopen = () => {
      if (my !== wsGen) { try { w.close(); } catch(_) {} return; }
      opened = true; retryN = 0;
      const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      rec.ondataavailable = ev => {
        if (my !== wsGen || !ev.data.size || w.readyState !== 1) return;
        if (w.bufferedAmount > 400000) { logDrop('전송이 막혀 쌓임(네트워크 정체)'); try { w.close(); } catch(_) {} return; }     // 네트워크가 막혀 오디오가 밀리면 끊고 새로 연결
        w.send(ev.data);
      };
      rec.start(250);
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
      if (m.is_final) { $('interim').textContent = ''; if (t.trim()) { lastActivity = Date.now(); queue.push({ uid: newUid(), name: cfg.name, session: live.session || '', rv: live.resetVer || '', t: new Date().toISOString(), text: t.trim() }); saveQueue(); } }
      else $('interim').textContent = t ? cfg.name + ': ' + t : '';
    };
    w.onclose = ev => {
      clearInterval(ka);
      if (my !== wsGen) return;                              // 이미 새 연결로 넘어간 옛 연결의 종료는 무시
      if (rec && rec.state !== 'inactive') { try { rec.stop(); } catch(_){} }
      rec = null; running = false;
      if (wantStop) return;
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
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  running = false; $('interim').textContent = '';
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
  try { navigator.sendBeacon && navigator.sendBeacon(cfg.url, new Blob([JSON.stringify({ action: 'bye', pw: cfg.pw, name: cfg.name })], { type: 'text/plain' })); } catch(_) {}
  // 마스터로 로그인해 있었다면 서버에서도 로그인을 끊고 나간다 (응답은 2초까지만 기다림)
  if (cfg.kt) { try { await Promise.race([post({ action: 'klogout', kt: cfg.kt }), sleep(2000)]); } catch(_) {} }
  roomsSet(roomsGet().filter(x => scriptUrl(x.url) !== cfg.url));      // 이 방만 목록에서 뺀다 (다른 방은 그대로)
  SS.del('t_kt'); ['t_url','t_pw','t_name','t_kpw','t_kt','t_colorSent'].forEach(S.del); location.reload();
};
$('glossSave').onclick = async () => { $('glossMsg').textContent = '저장 중…'; const r = await post({ action: 'glossary', glossary: $('gloss').value }); $('glossMsg').textContent = r.ok ? '저장됨 (다음에 받아쓰기를 켤 때부터 반영)' : r.error; };

