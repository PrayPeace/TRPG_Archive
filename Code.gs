/****************************************************************
 * TRPG Archive — 구글 시트 스크립트
 *
 * 1) 아래 네 줄에 키와 비밀번호를 넣는다. (따옴표 '' 안에)
 * 2) 위쪽 함수 선택에서 setup 을 고르고 ▶실행 (권한 허용).
 *    코드를 새로 붙여 넣었을 때도 setup 을 한 번 실행한다. (기존 기록은 그대로 두고 빠진 칸만 채움)
 * 3) 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포.
 *    코드를 고친 뒤에는 배포 → 배포 관리 → 연필 → 버전: 새 버전 → 배포.
 ****************************************************************/
const CLAUDE_KEY   = '여기에_클로드_API_키';
const DEEPGRAM_KEY = '여기에_딥그램_API_키';
const ROOM_PW      = '방비밀번호';      // 플레이어 모두가 아는 비밀번호
const KEEPER_PW    = '키퍼비밀번호';    // 키퍼만 아는 비밀번호

const MODEL = 'claude-sonnet-5-5';
const TZ = 'Asia/Seoul';

const SH = { CONF: '설정', LINES: '대화', SUM: '요약', NOTES: '정리', CHAR: '캐릭터', IMG: '이미지', STAGE: '요약대기' };
const SECTIONS = ['places', 'npcs', 'clues', 'handouts'];

const JOB_TTL = 7 * 60 * 1000;   // AI 작업 표시가 남아 있어도 이 시간이 지나면 끝난 것으로 본다 (스크립트 최대 실행 6분)
const WINDOW_LINES = 700;        // 요약 한 번에 보내는 최대 줄 수 (넘으면 이어서 다음 구간)
const NOTE_CHUNK = 45000;        // 정리 JSON을 셀 하나(5만 자 제한)에 다 못 넣으면 아래 칸으로 나눠 저장

/* ───────────── 설치 ───────────── */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const make = (name, header) => {
    let s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name);
    if (s.getLastRow() === 0) s.appendRow(header);
    else header.forEach((h, i) => { if (!s.getRange(1, i + 1).getValue()) s.getRange(1, i + 1).setValue(h); });
    return s;
  };
  make(SH.CONF, ['키', '값']);
  const L = make(SH.LINES, ['번호', '시각', '세션', '이름', '말', '발언ID']);
  const M = make(SH.SUM, ['세션', '시작', '끝', '요약', '만든 시각', '구간키']);
  make(SH.NOTES, ['정리 JSON (자동, 칸 A)', '정리 JSON (자동, 칸 B)']);
  make(SH.STAGE, STAGE_HEADER);
  make(SH.CHAR, ['탭', '플레이어', '카드 JSON', '해시', '갱신', '초상화 주소', '초상화 원본']);
  make(SH.IMG, ['시각', '세션', '파일ID', '주소', '분석 JSON']);
  // 시각·세션·ID가 날짜/숫자로 자동 변환되지 않게 글자 형식으로 고정
  L.getRange('B:C').setNumberFormat('@'); L.getRange('F:F').setNumberFormat('@');
  M.getRange('A:C').setNumberFormat('@'); M.getRange('E:F').setNumberFormat('@');
  ss.getSheetByName(SH.IMG).getRange('A:B').setNumberFormat('@');
  ss.getSheetByName(SH.CONF).getRange('B:B').setNumberFormat('@');

  const defaults = {
    session: '1', processedId: '0', story: '', notesVer: '1', charVer: '1', imgVer: '1', sumVer: '1',
    glossary: '요그소토스, 틴달로스의 사냥개, 크툴루, 니알라토텝, 아자토스, 슈브니구라스, 네크로노미콘, 이성 판정',
    charUrl: '', charMap: '[]', lastCharCheck: '0', keeperName: '', resetVer: '1', colors: '{}', corrections: '[]',
    colorVer: '1', job: '', pending: '', procStatus: '', notesSlot: 'A'
  };
  confLoad(true);
  Object.keys(defaults).forEach(k => { if (getConf(k) === null) setConf(k, defaults[k]); });
  if (!readNotes()) writeNotes(emptyNotes());

  // 예전 대화 줄에 발언ID 채우기 (근거 원문 찾기용)
  const last = L.getLastRow();
  if (last >= 2) {
    const rv = getConf('resetVer') || '0';
    const v = L.getRange(2, 1, last - 1, 6).getValues();
    const f = v.map(r => [r[5] ? String(r[5]) : 'old' + rv + '-' + r[0]]);
    L.getRange(2, 6, last - 1, 1).setValues(f);
  }

  // 5분 자동 정리 트리거만 다시 건다 (다른 트리거는 건드리지 않음)
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'tick') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();

  // 외부 요청·캐시 권한을 미리 받아 두기 위한 호출
  UrlFetchApp.fetch('https://api.anthropic.com', { muteHttpExceptions: true });
  CacheService.getScriptCache().put('setup', '1', 60);
  SpreadsheetApp.flush();
  Logger.log('설치 완료. 이제 웹 앱으로 배포(또는 새 버전으로 다시 배포)하세요.');
}

/* ───────────── 설정 저장소 (한 번 읽어서 실행 내내 씀) ───────────── */
let _conf = null;
function confSheet() { return SpreadsheetApp.getActive().getSheetByName(SH.CONF); }
function confLoad(force) {
  if (_conf && !force) return _conf;
  const v = confSheet().getDataRange().getValues();
  _conf = {};
  for (let i = 1; i < v.length; i++) {
    const k = String(v[i][0]); if (!k || _conf[k]) continue;
    _conf[k] = { row: i + 1, val: v[i][1] == null ? '' : String(v[i][1]) };
  }
  return _conf;
}
function getConf(key) { const c = confLoad()[key]; return c ? c.val : null; }
function setConf(key, val) {
  val = val == null ? '' : String(val);
  let c = confLoad()[key];
  if (!c) { confLoad(true); c = _conf[key]; }
  const s = confSheet();
  if (c) { s.getRange(c.row, 2).setValue(val); c.val = val; return; }
  s.appendRow([key, val]);
  _conf[key] = { row: s.getLastRow(), val };
}
function bump(key) { setConf(key, String(Number(getConf(key) || 0) + 1)); }
function confJson(key, fallback) { try { const v = getConf(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
function setJson(key, obj) { setConf(key, obj == null ? '' : JSON.stringify(obj)); }
function now() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function sheet(name) { return SpreadsheetApp.getActive().getSheetByName(name); }

// 짧게 잠그고 바로 푼다. 잠금 안에서 쓴 내용은 풀기 전에 시트에 확정한다.
function withLock(ms, fn) {
  const l = LockService.getScriptLock();
  if (!l.tryLock(ms)) throw new Error('다른 저장 작업이 몰려 있어요. 잠시 뒤 다시 시도해 주세요');
  try { confLoad(true); const r = fn(); SpreadsheetApp.flush(); return r; }
  finally { l.releaseLock(); }
}

/* ───────────── AI 작업 표시 (잠금 없이 오래 걸리는 Claude 호출을 하기 위한 자리표) ───────────── */
function liveJob() {
  const j = confJson('job', null);
  return j && Date.now() - Number(j.at || 0) < JOB_TTL ? j : null;
}
function acquireJob(kind, waitMs) {
  const until = Date.now() + (waitMs || 0);
  while (true) {
    const job = withLock(20000, () => {
      if (liveJob()) return null;
      const j = { token: Utilities.getUuid(), kind, at: Date.now(), rv: getConf('resetVer') || '0' };
      setJson('job', j);
      return j;
    });
    if (job || Date.now() > until) return job;
    Utilities.sleep(3000);
  }
}
// 반드시 withLock 안에서 부른다: 내 작업 표시가 그대로이고, 그 사이 초기화가 없었는지
function jobAlive(job) {
  const j = confJson('job', null);
  return !!j && j.token === job.token && (getConf('resetVer') || '0') === job.rv;
}
function releaseJob(job) {
  try { withLock(20000, () => { const j = confJson('job', null); if (j && j.token === job.token) setJson('job', null); }); } catch (e) {}
}
function setStatus(o) {
  try { withLock(20000, () => setJson('procStatus', Object.assign({ at: now() }, o))); } catch (e) {}
}

/* ───────────── 정리(장소·NPC·단서·핸드아웃) ───────────── */
function emptyNotes() { return { places: [], npcs: [], clues: [], handouts: [], deleted: {} }; }
function newId() { return 'n' + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function itemKey(sec, x) {
  const k = sec === 'clues' ? x.text : sec === 'handouts' ? x.title : x.name;
  return String(k || '').replace(/\s+/g, '').toLowerCase();
}
// 정리는 A·B 두 칸을 번갈아 쓴다: 새 내용을 쉬는 칸에 다 쓰고 확인한 뒤에만 설정의 notesSlot을 바꾼다.
// 쓰다가 실패해도 지금 쓰는 칸은 그대로라 기존 정리가 사라지지 않는다.
function notesCol() { return getConf('notesSlot') === 'B' ? 2 : 1; }
function readNotesCol(col) {
  const s = sheet(SH.NOTES);
  const last = Math.max(2, s.getLastRow());
  const v = s.getRange(2, col, last - 1, 1).getValues().map(r => r[0] == null ? '' : String(r[0])).join('');
  if (!v) return null;
  try {
    const n = JSON.parse(v);
    SECTIONS.forEach(sec => { n[sec] = (n[sec] || []).map(x => (x.id ? x : Object.assign({ id: newId() }, x))); });
    n.deleted = n.deleted || {};
    return n;
  } catch (e) { return null; }
}
function readNotes() {
  const col = notesCol();
  return readNotesCol(col) || readNotesCol(col === 1 ? 2 : 1);   // 지금 칸이 깨졌으면 예전 칸이라도
}
function writeNotes(n) {
  const s = sheet(SH.NOTES), txt = JSON.stringify(n), parts = [];
  for (let i = 0; i < txt.length; i += NOTE_CHUNK) parts.push([txt.slice(i, i + NOTE_CHUNK)]);
  const nxt = notesCol() === 1 ? 2 : 1;
  const last = s.getLastRow();
  if (last >= 2) s.getRange(2, nxt, last - 1, 1).clearContent();        // 쉬는 칸만 비운다
  s.getRange(2, nxt, parts.length, 1).setNumberFormat('@').setValues(parts);
  const back = s.getRange(2, nxt, parts.length, 1).getValues().map(r => String(r[0] == null ? '' : r[0])).join('');
  if (back !== txt) throw new Error('정리 저장 확인 실패 (기존 정리는 그대로 둠)');
  setConf('notesSlot', nxt === 2 ? 'B' : 'A');                           // 다 쓴 뒤에 한 번에 전환
}
// AI에게 보낼 때: 근거 ID·사진 주소처럼 AI에게 필요 없는 칸은 빼서 토큰을 아낀다
function notesForAi(n) {
  const o = {};
  SECTIONS.forEach(s => {
    o[s] = (n[s] || []).map(x => { const y = Object.assign({}, x); delete y.src; delete y.img; delete y.editedAt; if (!y.locked) delete y.locked; return y; });
  });
  o.deleted = n.deleted || {};
  return JSON.stringify(o);
}
function unionSrc(a, b) {
  const out = [];
  [].concat(a || [], b || []).forEach(x => { x = String(x || ''); if (x && out.indexOf(x) < 0) out.push(x); });
  return out.slice(-8);
}
// AI가 돌려준 정리를 지금 저장된 정리와 합친다: 사람이 고친 항목은 그대로, 사람이 지운 항목은 다시 안 생기게
function mergeNotes(base, ai, human) {
  base = base || emptyNotes();
  const outN = { deleted: base.deleted || {} };
  SECTIONS.forEach(sec => {
    const oldArr = (base[sec] || []).slice();
    const aiArr = (ai && Array.isArray(ai[sec])) ? ai[sec] : null;
    if (!aiArr) { outN[sec] = oldArr; return; }
    const dead = new Set(outN.deleted[sec] || []);
    const res = oldArr.map(o => Object.assign({}, o));
    const byId = {}, byKey = {};
    res.forEach((o, i) => { byId[o.id] = i; const k = itemKey(sec, o); if (k && byKey[k] == null) byKey[k] = i; });
    aiArr.forEach(x => {
      if (!x || typeof x !== 'object') return;
      x = Object.assign({}, x); delete x.locked; delete x.img; delete x.editedAt;
      const k = itemKey(sec, x);
      let i = (x.id && byId[x.id] != null) ? byId[x.id] : (k && byKey[k] != null ? byKey[k] : -1);
      if (i >= 0) {
        if (res[i].locked && !human) return;             // 사람이 고친 항목은 그대로 (정정 요청일 때만 바꿈)
        const src = unionSrc(res[i].src, x.src);
        res[i] = Object.assign({}, res[i], x, { id: res[i].id, locked: !!(human && res[i].locked), src });
        return;
      }
      if (!k || dead.has(k)) return;                      // 이름 없음, 또는 사람이 지운 대상
      const item = Object.assign({}, x, { id: newId(), locked: false, src: unionSrc([], x.src) });
      res.push(item); byId[item.id] = res.length - 1; byKey[k] = res.length - 1;
    });
    outN[sec] = res;
  });
  return outN;
}
function mergeWriteNotes(aiNotes, human) { writeNotes(mergeNotes(readNotes(), aiNotes, human)); bump('notesVer'); }
function saveAiNotes(aiNotes, human) { withLock(30000, () => mergeWriteNotes(aiNotes, human)); }

const NOTE_FIELDS = ['name', 'desc', 'found', 'traits', 'said', 'relation', 'text', 'status', 'kind', 'title', 'img', 'age', 'affil'];
function noteSave(sec, item) {
  if (SECTIONS.indexOf(sec) < 0 || !item) return { ok: false, error: '잘못된 항목' };
  return withLock(20000, () => {
    const n = readNotes() || emptyNotes();
    const clean = {};
    NOTE_FIELDS.forEach(k => { if (item[k] != null) clean[k] = String(item[k]).slice(0, 4000); });
    clean.locked = true; clean.editedAt = now();
    const i = item.id ? n[sec].findIndex(x => x.id === item.id) : -1;
    if (i >= 0) n[sec][i] = Object.assign({}, n[sec][i], clean);   // 근거 발언(src) 같은 다른 칸은 남긴다
    else n[sec].push(Object.assign({ id: newId() }, clean));
    const key = itemKey(sec, clean);
    if (n.deleted[sec]) n.deleted[sec] = n.deleted[sec].filter(k => k !== key);
    writeNotes(n); bump('notesVer');
    return { ok: true };
  });
}
function noteDelete(sec, id) {
  return withLock(20000, () => {
    const n = readNotes() || emptyNotes();
    const it = (n[sec] || []).find(x => x.id === id);
    if (!it) return { ok: false, error: '이미 지워졌어요' };
    n[sec] = n[sec].filter(x => x.id !== id);
    n.deleted[sec] = (n.deleted[sec] || []).concat([itemKey(sec, it)]).slice(-200);
    writeNotes(n); bump('notesVer');
    return { ok: true };
  });
}
function noteImage(sec, id, data) {
  if (!data) return { ok: false, error: '사진이 없어요' };
  const url = storePortrait(Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', 'n.jpg'), 'note_' + sec + '_' + Date.now());
  return withLock(20000, () => {
    const n = readNotes() || emptyNotes();
    const it = (n[sec] || []).find(x => x.id === id);
    if (!it) return { ok: false, error: '항목을 찾지 못했어요' };
    it.img = url; it.locked = true; it.editedAt = now();
    writeNotes(n); bump('notesVer');
    return { ok: true, url };
  });
}
function noteUnlock(sec, id) {
  return withLock(20000, () => {
    const n = readNotes() || emptyNotes();
    (n[sec] || []).forEach(x => { if (x.id === id) x.locked = false; });
    writeNotes(n); bump('notesVer');
    return { ok: true };
  });
}

/* ───────────── 접속 현황 (캐시에만 저장) ───────────── */
function touchPresence(name, mic) {
  if (!name) return;
  name = String(name).slice(0, 40);
  const c = CacheService.getScriptCache();
  c.put('p_' + name, JSON.stringify({ t: Date.now(), mic: String(mic || 'off').slice(0, 8) }), 600);
  const names = JSON.parse(c.get('p_names') || '[]');
  if (names.indexOf(name) < 0) { names.push(name); c.put('p_names', JSON.stringify(names.slice(-30)), 21600); }
}
function presence() {
  const c = CacheService.getScriptCache();
  const names = JSON.parse(c.get('p_names') || '[]');
  if (!names.length) return [];
  const all = c.getAll(names.map(n => 'p_' + n));
  return names.map(n => {
    const v = all['p_' + n]; if (!v) return null;
    const o = JSON.parse(v);
    return { name: n, online: Date.now() - o.t < 25000, mic: o.mic, seen: o.t };
  }).filter(Boolean);
}

/* ───────────── 웹 요청 ───────────── */
function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function csv(v) { return String(v || '').split(',').map(s => s.trim()).filter(Boolean); }

function doGet(e) {
  const p = e.parameter || {};
  try {
    if (p.pw !== ROOM_PW && p.pw !== KEEPER_PW) return out({ ok: false, error: '방 비밀번호가 틀렸어요' });
    switch (p.action) {
      case 'poll':
        try { touchPresence(p.me, p.mic); } catch (err) {}
        return out(poll(Number(p.since || 0)));
      case 'data':        return out(allData());
      case 'token':       return out(deepgramToken());
      case 'history':     return out(history(Number(p.before || 0), Number(p.limit || 300)));
      case 'sessionLines':return out(sessionLines(String(p.session || '')));
      case 'sessions':    return out(sessionList());
      case 'evidence':    return out(evidence(csv(p.uids), csv(p.ids).map(Number), String(p.rv || ''), Number(p.ctx || 2)));
      case 'tabs':
        if (p.pw !== KEEPER_PW) return out({ ok: false, error: '키퍼 비밀번호가 필요해요' });
        return out(listTabs(p.url));
      case 'ping':  return out({ ok: true, keeper: p.pw === KEEPER_PW });
    }
    return out({ ok: false, error: '알 수 없는 요청' });
  } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: '잘못된 요청' }); }
  try {
    if (b.pw !== ROOM_PW && b.pw !== KEEPER_PW) return out({ ok: false, error: '방 비밀번호가 틀렸어요' });
    // ── 플레이어 누구나
    switch (b.action) {
      case 'lines':      return out(addLines(b));
      case 'glossary':   withLock(20000, () => { setConf('glossary', String(b.glossary || '').slice(0, 5000)); bump('notesVer'); }); return out({ ok: true });
      case 'color':      return out(saveColor(b.name, b.color));
      case 'noteSave':   return out(noteSave(b.sec, b.item));
      case 'noteDelete': return out(noteDelete(b.sec, b.id));
      case 'noteUnlock': return out(noteUnlock(b.sec, b.id));
      case 'noteImage':  return out(noteImage(b.sec, b.id, b.data));
      case 'sumSave':    return out(sumSave(b.id, b.text, b.rv));
      case 'storySave':  withLock(20000, () => { setConf('story', String(b.text || '').slice(0, 20000)); bump('sumVer'); }); return out({ ok: true });
      case 'correct':    return out(correct(b.text, b.name));
      case 'portrait':   return out(savePortraitUpload(b.tab, b.data));
    }
    // ── 키퍼만
    if (b.pw !== KEEPER_PW) return out({ ok: false, error: '키퍼 비밀번호가 필요해요' });
    switch (b.action) {
      case 'process':    return out(processNow(true));
      case 'newSession': return out(newSession());
      case 'chars':      return out(saveCharConfig(b.url, b.map));
      case 'charsRefresh': return out(refreshCharacters(true));
      case 'image':      return out(addImage(b.data, b.mime, b.caption));
      case 'keeperName': withLock(20000, () => { setConf('keeperName', String(b.name || '').trim()); bump('notesVer'); }); return out({ ok: true });
      case 'clearLog':   return out(clearLog(false));
      case 'resetAll':   return out(clearLog(true));
    }
    return out({ ok: false, error: '알 수 없는 요청' });
  } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
}

/* ───────────── 받아쓰기 저장 ─────────────
 * 브라우저가 말이 끝난 순간 붙인 발언ID(uid)·이름·세션·초기화번호(rv)를 그대로 저장한다.
 * 같은 uid가 다시 오면(응답이 끊겨 다시 보낸 경우) 저장하지 않고 "이미 있음"으로 알려 준다.
 * 같은 문장을 진짜로 두 번 말하면 uid가 달라서 두 줄로 남는다. */
function fmtTime(t) {
  let d = t ? new Date(t) : new Date();
  if (isNaN(d.getTime())) d = new Date();
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm:ss');
}
function addLines(b) {
  const items = Array.isArray(b.items) ? b.items.slice(0, 300) : [];
  if (!items.length) return { ok: true, saved: [], dup: [], dropped: [], added: 0 };
  return withLock(25000, () => {
    const rv = getConf('resetVer') || '0', cur = getConf('session') || '1', switchedAt = Number(getConf('sessionAt') || 0);
    const s = sheet(SH.LINES), last = s.getLastRow();
    const seen = new Set();
    if (last >= 2) s.getRange(2, 6, last - 1, 1).getValues().forEach(r => { if (r[0]) seen.add(String(r[0])); });
    const rows = [], saved = [], dup = [], dropped = [];
    let id = Math.max(0, last - 1);
    items.forEach(it => {
      if (!it || typeof it !== 'object') return;
      const uid = it.uid ? String(it.uid).slice(0, 64) : '';
      if (uid && seen.has(uid)) { dup.push(uid); return; }
      const text = String(it.text || '').trim();
      const name = String(it.name || b.name || '').trim().slice(0, 40);
      // 초기화 전에 말한 줄은 초기화 뒤에 되살리지 않는다
      if (!text || !name || (it.rv != null && it.rv !== '' && String(it.rv) !== rv)) { if (uid) dropped.push(uid); return; }
      let sess = /^\d{1,5}$/.test(String(it.session || '')) ? String(it.session) : cur;
      // 세션을 넘긴 뒤 몇 초 동안은 다른 기기가 아직 예전 번호를 알고 있다 → 넘긴 시각 이후에 한 말이면 새 세션으로
      if (Number(sess) < Number(cur) && switchedAt && it.t && Date.parse(it.t) >= switchedAt) sess = cur;
      const u = uid || ('srv' + Utilities.getUuid().replace(/-/g, '').slice(0, 16));
      id++;
      rows.push([id, fmtTime(it.t), sess, name, text.slice(0, 2000), u]);
      seen.add(u);
      if (uid) saved.push(uid);
    });
    if (rows.length) s.getRange(last + 1, 1, rows.length, 6).setValues(rows);
    return { ok: true, saved, dup, dropped, added: rows.length };
  });
}

function rowToLine(r) { return { id: Number(r[0]), time: String(r[1]), session: String(r[2]), name: String(r[3]), text: String(r[4]), uid: String(r[5] || '') }; }
function readLines(sinceId, maxRows) {
  const s = sheet(SH.LINES);
  const last = s.getLastRow();
  const firstRow = sinceId + 2; // 번호 n 은 n+1 행
  if (firstRow > last) return [];
  let n = last - firstRow + 1;
  if (maxRows && n > maxRows) n = maxRows;
  return s.getRange(firstRow, 1, n, 6).getValues().map(rowToLine);
}
function totalLines() { return Math.max(0, sheet(SH.LINES).getLastRow() - 1); }

function versions() {
  const job = liveJob();
  return {
    session: getConf('session'), sumVer: getConf('sumVer'), notesVer: getConf('notesVer'),
    charVer: getConf('charVer'), imgVer: getConf('imgVer'), resetVer: getConf('resetVer') || '0',
    colorVer: getConf('colorVer') || '0', processedId: Number(getConf('processedId') || 0),
    total: totalLines(), job: job ? { kind: job.kind, at: job.at } : null, proc: confJson('procStatus', null)
  };
}

function poll(since) {
  const total = totalLines();
  let jumped = false;
  // 처음 접속이거나 너무 많이 밀렸으면 최근 300줄만 (앞부분은 "이전 대화 더 보기")
  if (since <= 0 || total - since > 600) { jumped = since > 0; since = Math.max(0, total - 300); }
  if (since > total) since = total;  // 시트가 비워졌는데 예전 번호로 물어본 경우
  const lines = readLines(since, 600);
  let who = [];
  try { who = presence(); } catch (e) {}
  return { ok: true, v: versions(), lines, presence: who, from: since, jumped };
}

function history(before, limit) {
  limit = Math.max(1, Math.min(limit || 300, 1000));
  const total = totalLines();
  if (!before || before > total + 1) before = total + 1;
  const start = Math.max(1, before - limit);
  const lines = before > 1 ? readLines(start - 1, before - start) : [];
  return { ok: true, lines, hasMore: start > 1 };
}

function allLineRows() {
  const s = sheet(SH.LINES), last = s.getLastRow();
  return last >= 2 ? s.getRange(2, 1, last - 1, 6).getValues().map(rowToLine) : [];
}
function sessionLines(session) {
  if (!session) return { ok: false, error: '세션을 골라 주세요' };
  const lines = allLineRows().filter(l => l.session === session)
    .sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.id - b.id));
  return { ok: true, session, lines };
}
function sessionList() {
  const s = sheet(SH.LINES), last = s.getLastRow(), cnt = {};
  if (last >= 2) s.getRange(2, 3, last - 1, 1).getValues().forEach(r => { const k = String(r[0]); cnt[k] = (cnt[k] || 0) + 1; });
  return { ok: true, sessions: Object.keys(cnt).sort((a, b) => Number(a) - Number(b)).map(k => ({ session: k, count: cnt[k] })) };
}

// 근거 원문: 발언ID(단서) 또는 발언 번호(요약) → 그 줄과 앞뒤 몇 줄
function evidence(uids, ids, rv, ctx) {
  ctx = Math.max(0, Math.min(ctx, 5));
  const rows = allLineRows();
  const curRv = getConf('resetVer') || '0';
  const pos = [];
  const byUid = {};
  rows.forEach((l, i) => { if (l.uid) byUid[l.uid] = i; });
  const missing = [];
  uids.slice(0, 20).forEach(u => {
    if (byUid[u] != null) { pos.push(byUid[u]); return; }
    const m = /^id:(\d+):(\d+)$/.exec(u);          // 발언ID가 없던 예전 줄: id:초기화번호:번호
    if (m && m[1] === curRv && rows[Number(m[2]) - 1]) pos.push(Number(m[2]) - 1); else missing.push(u);
  });
  if (ids.length && (!rv || rv === curRv)) ids.slice(0, 20).forEach(n => { if (n > 0 && rows[n - 1] && rows[n - 1].id === n) pos.push(n - 1); else missing.push('#' + n); });
  else if (ids.length) missing.push('기록이 초기화돼서 원문이 없어요');
  const focus = new Set(pos.map(i => rows[i].id));
  const take = new Set();
  pos.forEach(i => { for (let k = Math.max(0, i - ctx); k <= Math.min(rows.length - 1, i + ctx); k++) take.add(k); });
  const lines = Array.from(take).sort((a, b) => a - b).map(i => Object.assign({}, rows[i], { focus: focus.has(rows[i].id) }));
  return { ok: true, lines, missing };
}

function allData() {
  const ss = SpreadsheetApp.getActive();
  const sums = ss.getSheetByName(SH.SUM).getDataRange().getValues().slice(1)
    .map((r, i) => ({ id: i + 2, session: String(r[0]), from: String(r[1]), to: String(r[2]), text: String(r[3]), seg: String(r[5] || '') }));
  const chars = ss.getSheetByName(SH.CHAR).getDataRange().getValues().slice(1)
    .map(r => { let c = {}; try { c = JSON.parse(r[2] || '{}'); } catch (e) {} return Object.assign({ tab: r[0], player: r[1], portrait: r[5] || '' }, c); });
  const imgs = ss.getSheetByName(SH.IMG).getDataRange().getValues().slice(1)
    .map(r => { let a = {}; try { a = JSON.parse(r[4] || '{}'); } catch (e) {} return { time: String(r[0]), session: String(r[1]), url: r[3], title: a.title || '', text: a.text || '', description: a.description || '' }; });
  return {
    ok: true, v: versions(), summaries: sums, notes: readNotes() || emptyNotes(), characters: chars, images: imgs,
    story: getConf('story'), glossary: getConf('glossary'), keeperName: getConf('keeperName') || '',
    charUrl: getConf('charUrl'), charMap: confJson('charMap', []), colors: confJson('colors', {}),
    corrections: confJson('corrections', [])
  };
}

function saveColor(name, color) {
  if (!name || !/^#[0-9a-fA-F]{6}$/.test(String(color || ''))) return { ok: false, error: '색이 올바르지 않아요' };
  return withLock(20000, () => {
    const c = confJson('colors', {}); c[String(name).slice(0, 40)] = color;
    setConf('colors', JSON.stringify(c)); bump('colorVer');
    return { ok: true };
  });
}

function sumSave(id, text, rv) {
  return withLock(20000, () => {
    if (rv != null && rv !== '' && String(rv) !== (getConf('resetVer') || '0')) return { ok: false, error: '그 사이 기록이 초기화됐어요. 새로고침해 주세요' };
    const s = sheet(SH.SUM);
    id = Number(id);
    if (!id || id < 2 || id > s.getLastRow()) return { ok: false, error: '요약을 찾지 못했어요' };
    s.getRange(id, 4).setValue(String(text || '').slice(0, 20000));
    bump('sumVer');
    return { ok: true };
  });
}

/* ───────────── Deepgram 임시 토큰 ───────────── */
function deepgramToken() {
  const r = UrlFetchApp.fetch('https://api.deepgram.com/v1/auth/grant', {
    method: 'post', contentType: 'application/json',
    headers: { Authorization: 'Token ' + DEEPGRAM_KEY },
    payload: JSON.stringify({ ttl_seconds: 60 }), muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) return { ok: false, error: 'Deepgram 토큰 발급 실패: ' + r.getContentText().slice(0, 200) };
  const j = JSON.parse(r.getContentText());
  // 받아쓰기 엔진에 미리 알려 줄 단어: 용어집 + 캐릭터 이름 + 정리된 NPC·장소 이름
  const terms = new Set(String(getConf('glossary') || '').split(',').map(s => s.trim()).filter(Boolean));
  const n = readNotes() || {};
  (n.npcs || []).forEach(x => x.name && terms.add(x.name));
  (n.places || []).forEach(x => x.name && terms.add(x.name));
  sheet(SH.CHAR).getDataRange().getValues().slice(1).forEach(r => {
    try { const c = JSON.parse(r[2] || '{}'); if (c.name) terms.add(c.name); } catch (e) {}
  });
  return { ok: true, token: j.access_token, keyterms: Array.from(terms).slice(0, 80) };
}

/* ───────────── Claude 호출 ───────────── */
function claude(system, content, maxTokens) {
  const r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post', contentType: 'application/json',
    headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify({ model: MODEL, max_tokens: maxTokens || 4000, system, messages: [{ role: 'user', content }] }),
    muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) throw new Error('Claude 오류 ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  const j = JSON.parse(r.getContentText());
  if (j.stop_reason === 'max_tokens') throw new Error('AI 답이 너무 길어 잘렸어요 (구간을 줄여 다시 시도)');
  return j.content.filter(c => c.type === 'text').map(c => c.text).join('');
}
function parseJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('AI 답에서 JSON을 찾지 못함');
  return JSON.parse(text.slice(a, b + 1));
}

/* ───────────── 5분마다 ───────────── */
function tick() {
  try { processNow(false); } catch (e) { Logger.log(e); }
  try { if (Date.now() - Number(getConf('lastCharCheck') || 0) > 30 * 60 * 1000) refreshCharacters(false); } catch (e) { Logger.log(e); }
}

const NOTES_RULE =
  '정리(notes) 규칙: places=[{id,name,desc,found,src}] 장소와 거기서 일어난 일·발견한 것, ' +
  'npcs=[{id,name,affil,age,traits,said,relation,src}] NPC의 소속·직업(affil), 나이(age, 언급됐을 때만), 특징(쉼표로 구분한 짧은 말들), 가장 인상적인 대사 한두 개(said), 탐사자들과의 관계, ' +
  'clues=[{id,text,status,kind,src}] 얻은 정보와 단서. status는 "미해결" 또는 "해결". ' +
  'kind는 "확인"(키퍼 묘사나 판정 결과로 확인된 사실), "주장"(NPC가 한 말이라 사실인지 모름. text에 "OO는 ~라고 주장함"처럼 누가 말했는지 적는다), "추측"(탐사자의 추리·의심) 중 하나. ' +
  'handouts=[{id,title,text,src}] 핸드아웃 내용. ' +
  'src는 그 내용의 근거가 된 발언 번호 배열(예: [12,15], 1~5개, 대화에 #번호로 표시됨). 대화가 아니라 이미지에서 나온 내용이면 src는 비운다. ' +
  '기존 항목은 id를 그대로 유지하고, 새 항목은 id를 비워라. 바뀐 항목과 새 항목만 출력하면 되고, 바뀌지 않은 항목은 출력하지 않아도 남는다. 같은 대상을 새 항목으로 또 만들지 말고 기존 id에 보강하라. ' +
  '"locked":true 인 항목은 사람이 직접 확정한 내용이니 출력하지 말고 건드리지 마라. ' +
  'deleted 목록에 있는 대상은 사람이 지운 것이니 다시 만들지 마라.';

const FACT_RULES =
  '사실 구분 규칙 (매우 중요): ' +
  '① 키퍼의 상황 묘사·지문은 이야기 속 사실로 적는다. ' +
  '② 키퍼가 NPC로서 한 말은 사실이 아니라 그 NPC의 주장이다. "OO는 ~라고 말함/주장함"으로 적고 사실처럼 단정하지 마라. ' +
  '예: 키퍼가 집사로서 "난 서재에 안 갔어" → "집사는 서재에 가지 않았다고 주장함". ' +
  '③ 플레이어(탐사자)의 추리·의심·가설은 사실로 적지 말고 "(추측)"을 붙여라. 예: "(추측) 프레이피스는 집사가 범인이라고 의심함". ' +
  '④ 판정은 성공/실패나 수치 변화가 말로 선언된 것만 "[판정]"을 붙여 적는다. 예: "[판정] 프레이피스 도서관 이용 성공". 선언되지 않은 결과를 짐작하지 마라. ';

function keeperRules() {
  return '가장 중요한 원칙: 키퍼의 발언은 이야기의 정보 그 자체다. 키퍼가 말한 묘사, NPC 대사, 장소·물건·단서 정보, 판정 요구와 그 결과는 ' +
    '문장을 다듬어 줄이더라도 내용은 하나도 빠뜨리지 말고 요약과 정리에 담아라. 플레이어 발언은 행동과 결정 위주로 줄여도 된다. ';
}
function correctionsText() {
  const c = confJson('corrections', []);
  return c.length ? c.map(x => '- ' + x.text).join('\n') : '(없음)';
}
function charsText() {
  return sheet(SH.CHAR).getDataRange().getValues().slice(1)
    .map(r => { try { const c = JSON.parse(r[2] || '{}'); return (r[1] || '?') + ' = ' + (c.name || r[0]); } catch (e) { return ''; } })
    .filter(Boolean).join('\n');
}
function summaryKeys() {
  const s = sheet(SH.SUM), last = s.getLastRow();
  const set = new Set();
  if (last >= 2) s.getRange(2, 6, last - 1, 1).getValues().forEach(r => { if (r[0]) set.add(String(r[0])); });
  return set;
}
// AI가 적은 근거 번호를 발언ID로 바꾼다 (초기화로 번호가 다시 1부터 시작해도 근거가 엇갈리지 않게)
function srcToUids(notes, idMap) {
  if (!notes) return notes;
  SECTIONS.forEach(sec => (notes[sec] || []).forEach(x => {
    if (!x || typeof x !== 'object') return;
    const arr = Array.isArray(x.src) ? x.src : (x.src != null ? [x.src] : []);
    x.src = arr.map(v => idMap[Number(String(v).replace(/[^0-9]/g, ''))]).filter(Boolean).slice(0, 5);
  }));
  return notes;
}

/* ───────────── 요약 ─────────────
 * 1) 짧게 잠그고 "지금 정리 중" 표시를 남긴 뒤 바로 푼다 → 정리하는 동안에도 받아쓰기는 계속 저장된다.
 * 2) 처리할 구간(번호 from~to)을 기억해 둔다 → 실패 후 다시 시도해도 같은 구간을 같은 구간키로 처리.
 * 3) 구간 안의 줄을 실제 세션 번호별로 나눠서 각각 요약한다.
 * 4) 저장할 때 다시 짧게 잠그고, 그 사이 초기화가 없었고 내 정리 표시가 그대로일 때만 저장한다.
 *    같은 구간키의 요약이 이미 있으면 다시 저장하지 않는다. */
/* ───────────── 요약대기: AI 결과를 먼저 보관하고 단계별로 반영 ─────────────
 * 한 행 = 한 구간키. [구간키, 요약 반영, 줄거리 반영, 정리 반영, AI 결과 JSON(여러 칸)]
 * 중간에 실패하면 다음 실행이 같은 AI 결과로 남은 단계만 마저 한다 → AI를 다시 부르지 않고, 중복도 없다. */
const STAGE_HEADER = ['구간키', '요약 반영', '줄거리 반영', '정리 반영', 'AI 결과 (나눠 저장)'];
function stageSheet() {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(SH.STAGE);
  if (!s) { s = ss.insertSheet(SH.STAGE); s.appendRow(STAGE_HEADER); }
  return s;
}
function stageFind(key) {
  const s = stageSheet(), last = s.getLastRow();
  if (last < 2) return null;
  const keys = s.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) if (String(keys[i][0]) === key) {
    const row = i + 2, w = Math.max(5, s.getLastColumn());
    const r = s.getRange(row, 1, 1, w).getValues()[0];
    let res = null;
    try { res = JSON.parse(r.slice(4).map(x => x == null ? '' : String(x)).join('')); } catch (e) {}
    const on = x => String(x) === '1';
    return { row, sum: on(r[1]), story: on(r[2]), notes: on(r[3]), res };
  }
  return null;
}
function stagePut(key, res) {
  const s = stageSheet(), txt = JSON.stringify(res), parts = [];
  for (let i = 0; i < txt.length; i += NOTE_CHUNK) parts.push(txt.slice(i, i + NOTE_CHUNK));
  const row = s.getLastRow() + 1;
  s.getRange(row, 1, 1, 4 + parts.length).setNumberFormat('@').setValues([[key, '', '', ''].concat(parts)]);
}
function stageMark(row, col) { stageSheet().getRange(row, col).setValue('1'); }
function stageDeleteWindow(prefix) {
  const s = stageSheet(), last = s.getLastRow();
  if (last < 2) return;
  const keys = s.getRange(2, 1, last - 1, 1).getValues();
  for (let i = keys.length - 1; i >= 0; i--) if (String(keys[i][0]).indexOf(prefix) === 0) s.deleteRows(i + 2, 1);
}
function stageHasWindow(prefix) {
  const s = stageSheet(), last = s.getLastRow();
  if (last < 2) return false;
  return s.getRange(2, 1, last - 1, 1).getValues().some(r => String(r[0]).indexOf(prefix) === 0);
}

function processNow(manual) {
  const job = acquireJob('summary', manual ? 15000 : 0);
  if (!job) {
    const j = liveJob();
    return { ok: false, busy: true, error: (j && j.kind === 'correct' ? 'AI 정정을 처리하는 중이에요.' : '이미 다른 정리가 진행 중이에요.') + ' 잠시 뒤 다시 확인해 주세요' };
  }
  const t0 = Date.now(), budget = manual ? 150000 : 200000;
  let lines = 0, segs = 0, more = false, err = null, stale = false;
  try {
    while (true) {
      const r = processWindow(job, t0, budget);
      lines += r.lines; segs += r.segs;
      if (r.stale) { stale = true; break; }
      if (!r.more) break;
      if (Date.now() - t0 > budget) { more = true; break; }
    }
  } catch (e) { err = String(e && e.message || e); }
  finally { releaseJob(job); }

  if (stale) return { ok: false, error: '정리하는 사이 기록이 초기화돼서 결과를 버렸어요' };
  confLoad(true);
  const left = Math.max(0, totalLines() - Number(getConf('processedId') || 0));
  if (err) {
    setStatus({ ok: false, error: err, left });
    return { ok: false, error: '요약 실패: ' + err + (lines ? ' (그 전에 ' + lines + '줄은 정리됨)' : '') + ' · 다음 자동 정리 때 같은 구간부터 다시 시도해요', left };
  }
  const msg = lines ? lines + '줄을 ' + segs + '개 요약으로 정리했어요' + (more || left ? ' · 남은 ' + left + '줄은 이어서 정리해요' : '') : '새로 정리할 대화가 없어요';
  if (lines || manual) setStatus({ ok: true, message: msg, left });
  return { ok: true, message: msg, left, more: more || left > 0 };
}

function processWindow(job, t0, budget) {
  // 구간 정하기 (짧게 잠금)
  const win = withLock(20000, () => {
    if (!jobAlive(job)) return { stale: true };
    const processed = Number(getConf('processedId') || 0), total = totalLines();
    if (processed > total) { setConf('processedId', '0'); setJson('pending', null); return { empty: true }; }
    let p = confJson('pending', null);
    if (!p || p.rv !== job.rv || p.from !== processed || p.to <= processed || p.to > total) {
      if (total <= processed) { setJson('pending', null); return { empty: true }; }
      p = { from: processed, to: Math.min(total, processed + WINDOW_LINES), rv: job.rv, fails: 0, done: [] };
      setJson('pending', p);
    }
    return { p, total };
  });
  if (win.stale) return { stale: true, lines: 0, segs: 0 };
  if (win.empty) return { lines: 0, segs: 0, more: false };
  const p = win.p;

  const rows = readLines(p.from, p.to - p.from);
  const idMap = {}; rows.forEach(l => { idMap[l.id] = l.uid || ('id:' + job.rv + ':' + l.id); });
  const groups = {}, order = [];
  rows.forEach(l => { if (!String(l.text).trim()) return; if (!groups[l.session]) { groups[l.session] = []; order.push(l.session); } groups[l.session].push(l); });
  order.sort((a, b) => Number(a) - Number(b));
  const existing = summaryKeys();
  const prefix = job.rv + ':' + p.from + '-' + p.to + ':';
  let segs = 0;

  try {
    for (let gi = 0; gi < order.length; gi++) {
      const sess = order[gi];
      const segKey = prefix + 's' + sess;
      let st = stageFind(segKey);
      if (!st && existing.has(segKey)) continue;                 // 예전 버전에서 이미 끝낸 구간
      if (st && st.sum && st.story && st.notes) continue;        // 세 단계 모두 반영됨
      if (!st || !st.res) {
        // AI 결과가 아직 없을 때만 AI를 부른다
        if (segs > 0 && Date.now() - t0 > budget) return { lines: 0, segs, more: true };
        const g = groups[sess].slice().sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.id - b.id));
        const res = summarizeGroup(g, sess);
        const keep = { summary: res.summary || '- (잡담 위주, 진행 없음)', story: res.story || '', notes: res.notes ? srcToUids(res.notes, idMap) : null,
                       session: sess, from: g[0].time, to: g[g.length - 1].time };
        const put = withLock(30000, () => {
          if (!jobAlive(job) || Number(getConf('processedId') || 0) !== p.from) return 'stale';
          const cur = stageFind(segKey);
          if (cur && cur.res) return 'ok';                        // 그 사이 다른 실행이 보관함
          if (cur) stageSheet().deleteRows(cur.row, 1);           // 깨진 보관분은 지우고 다시
          stagePut(segKey, keep);
          return 'ok';
        });
        if (put === 'stale') return { stale: true, lines: 0, segs };
      }
      // 보관된 AI 결과를 단계별로 반영 (각 단계 끝에 표시 → 실패하면 다음 실행이 남은 단계부터)
      const applied = withLock(30000, () => {
        if (!jobAlive(job) || Number(getConf('processedId') || 0) !== p.from) return 'stale';
        const cur = stageFind(segKey);
        if (!cur || !cur.res) throw new Error('보관된 AI 결과를 찾지 못했어요');
        const r = cur.res;
        if (!cur.sum) {
          if (!summaryKeys().has(segKey)) sheet(SH.SUM).appendRow([r.session, r.from, r.to, r.summary, now(), segKey]);
          stageMark(cur.row, 2);
        }
        if (!cur.story) {
          if (r.story) setConf('story', String(r.story).slice(0, 20000));
          stageMark(cur.row, 3);
        }
        if (!cur.notes) {
          if (r.notes) mergeWriteNotes(r.notes);
          stageMark(cur.row, 4);
        }
        bump('sumVer');
        return 'ok';
      });
      if (applied === 'stale') return { stale: true, lines: 0, segs };
      segs++;
    }
  } catch (e) {
    // 같은 구간에서 두 번 넘게 실패하고 아직 보관된 AI 결과가 없으면 구간을 반으로 줄여 본다 (AI 답 잘림 대비)
    try {
      withLock(20000, () => {
        const pp = confJson('pending', null);
        if (!pp || pp.from !== p.from || pp.to !== p.to) return;
        pp.fails = (pp.fails || 0) + 1; pp.lastError = String(e && e.message || e).slice(0, 300);
        if (pp.fails >= 2 && !stageHasWindow(prefix) && pp.to - pp.from > 40) { pp.to = pp.from + Math.floor((pp.to - pp.from) / 2); pp.fails = 0; }
        setJson('pending', pp);
      });
    } catch (e2) {}
    throw e;
  }

  // 구간 전체를 마쳤을 때만 처리 번호를 넘긴다
  const fin = withLock(20000, () => {
    if (!jobAlive(job) || Number(getConf('processedId') || 0) !== p.from) return false;
    // 이 구간의 모든 묶음이 세 단계까지 반영됐는지 마지막으로 확인
    for (let gi = 0; gi < order.length; gi++) {
      const k = prefix + 's' + order[gi], st = stageFind(k);
      if (st ? !(st.sum && st.story && st.notes) : !summaryKeys().has(k)) return 'incomplete';
    }
    setConf('processedId', String(p.to)); setJson('pending', null);
    stageDeleteWindow(prefix);
    return true;
  });
  if (fin === 'incomplete') throw new Error('구간 반영이 끝나지 않았어요 (다음 정리 때 이어서)');
  if (!fin) return { stale: true, lines: 0, segs };
  return { lines: p.to - p.from, segs, more: p.to < totalLines() };
}

function summarizeGroup(g, sess) {
  const transcript = g.map(l => '#' + l.id + ' [' + String(l.time).slice(11) + '] ' + l.name + ': ' + l.text).join('\n');
  const system =
    '너는 한국어 TRPG(주로 크툴루의 부름) 세션의 기록 담당이다. 음성 받아쓰기라서 단어가 잘못 적혀 있을 수 있다. ' +
    '용어집·캐릭터 이름·앞뒤 맥락으로 잘못 들린 고유명사를 바로잡고, 의미 없는 조각은 무시하라. ' +
    '플레이어 잡담(규칙 질문, 농담, 현실 이야기)과 캐릭터로서의 행동·대사를 구분해서, 요약은 이야기 안의 일을 중심으로 캐릭터 이름으로 써라. ' +
    '없는 일을 지어내지 마라. ' + FACT_RULES + keeperRules() +
    '정정 메모는 사람이 바로잡아 준 사실이니 반드시 따르라. 반드시 JSON 하나만 출력하라.';
  const user =
    '## 키퍼 이름\n' + (getConf('keeperName') || '(미지정: 상황 묘사와 NPC 대사를 하는 사람이 키퍼다)') + '\n\n' +
    '## 용어집\n' + getConf('glossary') + '\n\n' +
    '## 플레이어 = 캐릭터\n' + (charsText() || '(아직 없음)') + '\n\n' +
    '## 정정 메모 (반드시 따를 것)\n' + correctionsText() + '\n\n' +
    '## 지금까지의 누적 줄거리\n' + (getConf('story') || '(처음)') + '\n\n' +
    '## 현재 정리(notes)\n' + notesForAi(readNotes() || emptyNotes()) + '\n\n' +
    '## 새로 들어온 대화 (세션 ' + sess + ', 각 줄 앞 #번호는 발언 번호)\n' + transcript + '\n\n' +
    '## 출력 형식\n' +
    '{"summary":"이 대화 구간의 요약. 시간순으로 \\"- \\"로 시작하는 줄들. 키퍼가 준 정보는 모두 포함 (줄 수 제한 없음). ' +
    '줄마다 끝에 근거 발언 번호를 (#12, #15)처럼 붙여라",' +
    '"story":"처음부터 지금까지 누적 줄거리를 갱신한 것 (2500자 이내, 중요한 사건 위주, 세션 번호가 바뀌면 세션별로 구분)",' +
    '"notes":{"places":[],"npcs":[],"clues":[],"handouts":[]}}\n' + NOTES_RULE +
    '\n새 대화에 이야기 진행이 거의 없으면 summary는 "- (잡담 위주, 진행 없음)"으로 하고 notes는 생략하라.';
  return parseJson(claude(system, user, 8000));
}

function newSession() {
  let proc;
  try { proc = processNow(true); } catch (e) { proc = { ok: false, error: String(e && e.message || e) }; }
  const s = withLock(20000, () => {
    const n = String(Number(getConf('session') || 1) + 1);
    setConf('session', n); setConf('sessionAt', String(Date.now())); bump('sumVer');
    return n;
  });
  const res = { ok: true, session: s };
  const prev = String(Number(s) - 1);
  if (!proc.ok) res.warning = '세션 ' + s + '을 시작했지만 이전 대화 요약은 실패했어요: ' + proc.error + '. 이전 대화는 세션 ' + prev + ' 번호 그대로 남아 있어서, 다음 정리 때 세션 ' + prev + ' 요약으로 들어가요.';
  else if (proc.more) res.warning = '세션 ' + s + '을 시작했어요. 이전 대화 중 ' + proc.left + '줄은 아직 요약 전이라 이어서 정리해요 (세션 ' + prev + '으로 들어감).';
  return res;
}

/* ───────────── AI에게 정정 요청 ───────────── */
function correct(text, who) {
  text = String(text || '').trim();
  if (!text) return { ok: false, error: '정정할 내용을 적어 주세요' };
  const job = acquireJob('correct', 45000);
  if (!job) return { ok: false, busy: true, error: '지금 요약을 만드는 중이에요. 1~2분 뒤 다시 눌러 주세요 (적은 내용은 그대로 남아 있어요)' };
  try {
    const sh = sheet(SH.SUM);
    const rows = sh.getDataRange().getValues().slice(1).map((r, i) => ({ id: i + 2, session: String(r[0]), text: String(r[3]) }));
    const recent = rows.slice(-12);
    const system = '너는 TRPG 세션 기록 담당이다. 사람이 기록의 잘못된 부분을 정정해 달라고 했다. ' +
      '요청에 맞게 누적 줄거리, 요약, 정리를 고쳐라. 이번에는 locked 항목도 요청과 관계있으면 고쳐도 된다. 요청과 관계없는 부분은 바꾸지 마라. ' +
      '요약 줄 끝의 (#번호) 근거 표시는 그대로 두어라. ' + FACT_RULES + 'JSON 하나만 출력하라.';
    const user =
      '## 정정 요청 (' + (who || '플레이어') + ')\n' + text + '\n\n' +
      '## 기존 정정 메모\n' + correctionsText() + '\n\n' +
      '## 플레이어 = 캐릭터\n' + (charsText() || '(없음)') + '\n\n' +
      '## 누적 줄거리\n' + (getConf('story') || '(없음)') + '\n\n' +
      '## 최근 요약들\n' + recent.map(r => '[id ' + r.id + ', 세션 ' + r.session + ']\n' + r.text).join('\n\n') + '\n\n' +
      '## 현재 정리(notes)\n' + notesForAi(readNotes() || emptyNotes()) + '\n\n' +
      '## 출력 형식\n{"reply":"무엇을 고쳤는지 한두 문장","memo":"앞으로 기억해야 할 정정 사실 한 줄 (없으면 빈칸)",' +
      '"story":"고친 누적 줄거리 (바꿀 게 없으면 빈칸)","summaries":[{"id":숫자,"text":"고친 요약 전문"}] (고친 것만),' +
      '"notes":{"places":[],"npcs":[],"clues":[],"handouts":[]} (고칠 게 없으면 생략)}\n' + NOTES_RULE +
      '\n정정할 때는 src를 출력하지 마라 (기존 근거가 유지된다).';
    const res = parseJson(claude(system, user, 8000));
    const okIds = new Set(recent.map(r => r.id));
    const applied = withLock(30000, () => {
      if (!jobAlive(job)) return false;                      // 그 사이 초기화됨 → 아무것도 쓰지 않음
      if (res.story) setConf('story', String(res.story).slice(0, 20000));
      const last = sh.getLastRow();
      (res.summaries || []).forEach(x => { const id = Number(x.id); if (okIds.has(id) && id <= last && x.text) sh.getRange(id, 4).setValue(String(x.text).slice(0, 20000)); });
      if (res.notes) { SECTIONS.forEach(s => (res.notes[s] || []).forEach(x => { if (x) delete x.src; })); mergeWriteNotes(res.notes, true); }
      if (res.memo) {
        const c = confJson('corrections', []);
        c.push({ text: String(res.memo).slice(0, 300), by: who || '', at: now() });
        setConf('corrections', JSON.stringify(c.slice(-40)));
      }
      bump('sumVer');
      return true;
    });
    if (!applied) return { ok: false, error: '정정하는 사이 기록이 초기화돼서 적용하지 않았어요' };
    return { ok: true, reply: res.reply || '고쳤어요' };
  } catch (e) {
    return { ok: false, error: '정정 실패: ' + String(e && e.message || e) };
  } finally { releaseJob(job); }
}

/* ───────────── 캐릭터시트 ───────────── */
function listTabs(url) {
  const ss = SpreadsheetApp.openByUrl(url);
  return { ok: true, tabs: ss.getSheets().map(s => s.getName()) };
}

function saveCharConfig(url, map) {
  withLock(20000, () => {
    setConf('charUrl', String(url || ''));
    setConf('charMap', JSON.stringify(Array.isArray(map) ? map : []));
  });
  return refreshCharacters(true);
}

// 시트 안의 사진 찾기: =IMAGE("주소") 수식 → 셀 안 이미지 → 셀 위에 띄운 이미지(주소가 있는 경우)
function findPortraitSrc(sh, rows, cols) {
  try {
    const rng = sh.getRange(1, 1, rows, cols);
    const f = rng.getFormulas();
    for (let r = 0; r < f.length; r++) for (let c = 0; c < f[r].length; c++) {
      const m = /IMAGE\(\s*"([^"]+)"/i.exec(f[r][c] || '');
      if (m) return m[1];
    }
    const v = rng.getValues();
    for (let r = 0; r < v.length; r++) for (let c = 0; c < v[r].length; c++) {
      const x = v[r][c];
      if (x && typeof x === 'object' && typeof x.getContentUrl === 'function') {
        const u = x.getContentUrl() || (x.getUrl && x.getUrl());
        if (u) return u;
      }
    }
  } catch (e) {}
  try {
    const imgs = sh.getImages();
    for (let i = 0; i < imgs.length; i++) { const u = imgs[i].getUrl(); if (u) return u; }
  } catch (e) {}
  return '';
}
function portraitFolder() {
  const root = imageFolder();
  const it = root.getFoldersByName('초상화');
  return it.hasNext() ? it.next() : root.createFolder('초상화');
}
function storePortrait(blob, name) {
  const file = portraitFolder().createFile(blob.setName(name));
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w600';
}
function fetchPortrait(src, tab) {
  let r = UrlFetchApp.fetch(src, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200) {
    r = UrlFetchApp.fetch(src, { muteHttpExceptions: true, followRedirects: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
  }
  if (r.getResponseCode() !== 200) return '';
  return storePortrait(r.getBlob(), 'portrait_' + tab + '_' + Date.now());
}
function savePortraitUpload(tab, data) {
  if (!tab || !data) return { ok: false, error: '사진이 없어요' };
  const url = storePortrait(Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', 'p.jpg'), 'portrait_' + tab + '_' + Date.now());
  return withLock(20000, () => {
    const cs = sheet(SH.CHAR);
    const v = cs.getDataRange().getValues();
    for (let i = 1; i < v.length; i++) if (v[i][0] === tab) {
      cs.getRange(i + 1, 6, 1, 2).setValues([[url, 'manual']]);
      bump('charVer');
      return { ok: true, url };
    }
    return { ok: false, error: '캐릭터를 찾지 못했어요' };
  });
}

function refreshCharacters(force) {
  withLock(20000, () => setConf('lastCharCheck', String(Date.now())));
  const url = getConf('charUrl'); const map = confJson('charMap', []);
  const cs = sheet(SH.CHAR);
  if (!url || !map.length) {
    withLock(20000, () => { if (cs.getLastRow() > 1) cs.deleteRows(2, cs.getLastRow() - 1); bump('charVer'); });
    return { ok: true, message: '캐릭터 연결을 해제했어요' };
  }
  const src = SpreadsheetApp.openByUrl(url);
  const old = {};
  cs.getDataRange().getValues().slice(1).forEach(r => { old[r[0]] = r; });

  const rows = [];
  let changed = false;
  map.forEach(m => {
    const sh = src.getSheetByName(m.tab); if (!sh) return;
    const nr = Math.max(1, Math.min(sh.getLastRow(), 120)), nc = Math.max(1, Math.min(sh.getLastColumn(), 30));
    const vals = sh.getRange(1, 1, nr, nc).getDisplayValues();
    const text = vals.map(r => r.filter(c => String(c).trim() !== '').join(' | ')).filter(Boolean).join('\n').slice(0, 9000);
    const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text + '|' + m.player));
    const prev = old[m.tab] || [];

    // 초상화: 사람이 직접 올린 사진이 우선, 아니면 시트 속 사진
    let pUrl = prev[5] || '', pSrc = prev[6] || '';
    if (pSrc !== 'manual') {
      const found = findPortraitSrc(sh, nr, nc);
      if (found && (found !== pSrc || !pUrl)) {
        try { const u = fetchPortrait(found, m.tab); if (u) { pUrl = u; pSrc = found; changed = true; } } catch (e) {}
      }
      if (!found && pSrc) { pUrl = ''; pSrc = ''; changed = true; }
    }

    if (!force && prev[3] === hash) { rows.push([m.tab, m.player, prev[2], prev[3], prev[4], pUrl, pSrc]); return; }
    const card = parseJson(claude(
      'TRPG 캐릭터시트를 읽고 핵심만 JSON으로 뽑아라. 시트에 없는 값은 비워라. JSON 하나만 출력.',
      '시트 내용:\n' + text + '\n\n출력 형식: {"name":"","occupation":"","age":"","gender":"","hp":"현재/최대","san":"현재/최대","mp":"현재/최대","luck":"",' +
      '"stats":[{"name":"근력 같은 능력치 이름","value":""}] (최대 9개),' +
      '"skills":[{"name":"","value":""}] (수치가 높은 기술 위주 최대 12개),"items":"소지품 요약","memo":"배경·특이사항 한두 줄"}', 1800));
    rows.push([m.tab, m.player, JSON.stringify(card), hash, now(), pUrl, pSrc]);
    changed = true;
  });
  withLock(20000, () => {
    if (cs.getLastRow() > 1) cs.getRange(2, 1, cs.getLastRow() - 1, 7).clearContent();
    if (rows.length) cs.getRange(2, 1, rows.length, 7).setValues(rows);
    if (changed || force) bump('charVer');
  });
  return { ok: true, message: rows.length + '명의 캐릭터를 읽었어요' };
}

/* ───────────── 이미지 ───────────── */
function imageFolder() {
  const it = DriveApp.getFoldersByName('TRPG 세션 이미지');
  return it.hasNext() ? it.next() : DriveApp.createFolder('TRPG 세션 이미지');
}

function addImage(data, mime, caption) {
  if (!data) return { ok: false, error: '이미지가 없어요' };
  mime = mime || 'image/jpeg';
  const rv = getConf('resetVer') || '0';
  const blob = Utilities.newBlob(Utilities.base64Decode(data), mime, 'handout_' + Date.now());
  const file = imageFolder().createFile(blob);
  try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}
  const url = 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600';

  const content = [
    { type: 'image', source: { type: 'base64', media_type: mime, data } },
    { type: 'text', text:
      'TRPG 세션 중 키퍼가 보여 준 핸드아웃/이미지다. ' + (caption ? '키퍼 메모: ' + caption + '\n' : '') +
      '## 현재 정리(notes)\n' + notesForAi(readNotes() || emptyNotes()) + '\n\n' +
      '이미지 속 글자는 빠짐없이 옮기고, 그림이면 무엇이 보이는지 묘사하라. 그리고 정리를 갱신하라.\n' +
      '출력 형식: {"title":"짧은 제목","text":"이미지 속 글자 전문","description":"묘사와 눈여겨볼 점","notes":{"places":[],"npcs":[],"clues":[],"handouts":[]}}\n' + NOTES_RULE }
  ];
  const res = parseJson(claude('너는 TRPG 세션 기록 담당이다. JSON 하나만 출력하라.', content, 5000));
  return withLock(30000, () => {
    if ((getConf('resetVer') || '0') !== rv) return { ok: false, error: '분석하는 사이 기록이 초기화돼서 저장하지 않았어요' };
    sheet(SH.IMG).appendRow([
      now(), getConf('session'), file.getId(), url,
      JSON.stringify({ title: res.title || '', text: res.text || '', description: res.description || '' })
    ]);
    if (res.notes) { SECTIONS.forEach(s => (res.notes[s] || []).forEach(x => { if (x) x.src = []; })); mergeWriteNotes(res.notes); }
    bump('imgVer');
    return { ok: true, title: res.title || '' };
  });
}

/* ───────────── 지우기 (키퍼) ─────────────
 * 스크립트 잠금 안에서 지우고 초기화 번호(resetVer)를 올린다.
 * 진행 중이던 요약·정정은 저장 직전에 초기화 번호와 작업 표시를 확인하므로 지운 기록을 되살리지 못한다. */
function clearLog(all) {
  return withLock(30000, () => {
    const ss = SpreadsheetApp.getActive();
    const wipe = name => { const s = ss.getSheetByName(name); if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1); };
    wipe(SH.LINES); wipe(SH.SUM); stageSheet(); wipe(SH.STAGE);
    setConf('processedId', '0'); setConf('story', '');
    setJson('job', null); setJson('pending', null); setJson('procStatus', null);
    if (all) {
      wipe(SH.IMG);
      writeNotes(emptyNotes());
      setConf('session', '1'); setConf('sessionAt', '0'); setConf('corrections', '[]');
      bump('imgVer'); bump('notesVer');
    }
    bump('sumVer'); bump('resetVer');
    return { ok: true, message: all ? '전체 초기화했어요 (캐릭터 연결·용어집·이름 색은 그대로)' : '회의록과 요약을 지웠어요' };
  });
}
