/****************************************************************
 * TRPG Archive — 구글 시트 스크립트
 *
 * ※ 이 스프레드시트는 키퍼 구글 계정에만 두세요. 플레이어에게 시트를 공유하면
 *    키퍼 전용 시트(키퍼자료·키퍼원문·키퍼기록·판정기록)가 그대로 보입니다.
 * ※ 방 비밀번호와 키퍼 비밀번호는 반드시 서로 다르게 정하세요. (같으면 키퍼 기능이 잠깁니다)
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

const SH = {
  CONF: '설정', LINES: '대화', SUM: '요약', NOTES: '정리', CHAR: '캐릭터', IMG: '이미지', STAGE: '요약대기', CSNAP: '캐릭터기록',
  // 아래 넷은 키퍼 전용: 플레이어에게 가는 응답과 공개 기록용 AI(요약·정정·이미지 분석)는 절대 읽지 않는다
  KB: '키퍼자료', KSRC: '키퍼원문', KLOG: '키퍼기록', ROLLS: '판정기록'
};
const SECTIONS = ['places', 'npcs', 'clues', 'handouts'];

const JOB_TTL = 7 * 60 * 1000;   // AI 작업 표시가 남아 있어도 이 시간이 지나면 끝난 것으로 본다 (스크립트 최대 실행 6분)
const WINDOW_LINES = 300;        // 요약 한 번에 보내는 최대 줄 수 (넘으면 이어서 다음 구간). AI 답이 약 60초 안에 와야 해서 작게 잡는다
const STORY_MAX = 3000;          // 누적 줄거리가 이보다 길어지면 AI가 한 번 줄여 쓴다
const KTOKEN_TTL = 12 * 3600 * 1000;   // 키퍼 로그인 유지 시간
const K_FAIL_MAX = 20;                 // 10분 안에 비밀번호를 이만큼 틀리면
const K_LOCK_MS = 10 * 60 * 1000;      // 이 시간 동안 비밀번호 로그인을 잠근다 (이미 로그인한 키퍼는 영향 없음)
const NOTE_CHUNK = 45000;        // 정리 JSON을 셀 하나(5만 자 제한)에 다 못 넣으면 아래 칸으로 나눠 저장

/* ───────────── 시트 머리글 ───────────── */
const HEADERS = {
  '캐릭터기록': ['시각', '세션', '탭', '플레이어', '이름', '체력', '이성', '마력', '행운'],
  '키퍼자료': ['키퍼 정리본 JSON (칸 A) · 키퍼 전용', '키퍼 정리본 JSON (칸 B) · 키퍼 전용'],
  '키퍼원문': ['조각ID', '출처', '순번', '글자수', '본문', '추가 시각'],
  '키퍼기록': ['ID', '시각', '초기화번호', '세션', '종류', '제목', '입력', '결과'],
  '판정기록': ['순번', '세션', '이름', '기술', '목표', '값', '결과', '원문']
};
// 없으면 만들어서 돌려준다 (코드만 바꾸고 setup을 아직 안 돌린 경우에도 동작하게)
function ensureSheet(name) {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    s.appendRow(HEADERS[name]);
    s.getRange(1, 1, s.getMaxRows(), HEADERS[name].length).setNumberFormat('@');
  }
  return s;
}
/* 시트에 글자를 쓸 때 수식으로 바뀌지 않게 한다 (이름·대사·로그·AI 답처럼 바깥에서 온 글자에 모두 적용).
 * =, +, @ 로 시작하거나 -바로 뒤에 글자가 붙어 있으면 앞에 작은따옴표를 붙인다. 시트에서 작은따옴표는 "이 칸은 글자"라는 표시다.
 * ("- 요약 줄"처럼 - 뒤에 빈칸이 오는 경우는 그대로 둔다)
 * 이게 없으면 방 비밀번호를 아는 사람이 이름 칸에 =IMPORTDATA(...) 같은 수식을 넣어 키퍼 전용 시트를 밖으로 빼낼 수 있다. */
function safeCell(v) { return (typeof v === 'string' && /^(?:[=+@]|-\S)/.test(v)) ? "'" + v : v; }

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
  Object.keys(HEADERS).forEach(n => { const s = make(n, HEADERS[n]); s.getRange(1, 1, s.getMaxRows(), HEADERS[n].length).setNumberFormat('@'); });
  make(SH.CHAR, ['탭', '플레이어', '카드 JSON', '해시', '갱신', '초상화 주소', '초상화 원본']);
  make(SH.IMG, ['시각', '세션', '파일ID', '주소', '분석 JSON']);
  // 시각·세션·ID가 날짜/숫자로 자동 변환되지 않게 글자 형식으로 고정
  L.getRange('B:F').setNumberFormat('@');
  M.getRange('A:F').setNumberFormat('@');
  ss.getSheetByName(SH.IMG).getRange('A:B').setNumberFormat('@');
  ss.getSheetByName(SH.CONF).getRange('B:B').setNumberFormat('@');

  const defaults = {
    session: '1', processedId: '0', story: '', notesVer: '1', charVer: '1', imgVer: '1', sumVer: '1',
    glossary: '요그소토스, 틴달로스의 사냥개, 크툴루, 니알라토텝, 아자토스, 슈브니구라스, 네크로노미콘, 이성 판정',
    charUrl: '', charMap: '[]', lastCharCheck: '0', keeperName: '', resetVer: '1', colors: '{}', corrections: '[]',
    colorVer: '1', job: '', pending: '', procStatus: '', notesSlot: 'A',
    kbSlot: 'A', kbGen: '1', kVer: '1', ktokens: '[]', recap: '', awards: '', charLast: '{}', sessionAt: '0'
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
  if (ROOM_PW === KEEPER_PW) Logger.log('⚠ 방 비밀번호와 키퍼 비밀번호가 같아요. 서로 다르게 바꾸지 않으면 키퍼 기능을 쓸 수 없어요.');
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
  val = safeCell(val == null ? '' : String(val));
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
/* 긴 JSON을 셀 여러 칸에 나눠 담기. 칸마다 앞에 § 를 붙여서, 나눈 조각이 '='로 시작해도 수식으로 바뀌지 않게 한다. */
const CELL_MARK = '§';
function toCells(txt) {
  const parts = [];
  for (let i = 0; i < txt.length; i += NOTE_CHUNK) parts.push(CELL_MARK + txt.slice(i, i + NOTE_CHUNK));
  if (!parts.length) parts.push(CELL_MARK);
  return parts;
}
function fromCells(cells) {
  const a = cells.map(x => (x == null ? '' : String(x)));
  while (a.length && a[a.length - 1] === '') a.pop();
  if (a.length && a[0].charAt(0) === CELL_MARK) return a.map(x => (x.charAt(0) === CELL_MARK ? x.slice(1) : x)).join('');
  return a.join('');   // 예전 버전이 쓴 형식 (표시 없음)
}
/* A·B 두 칸을 번갈아 쓰는 저장소: 새 내용을 쉬는 칸에 다 쓰고 확인한 뒤에만 설정의 칸 표시를 바꾼다.
 * 쓰다가 실패해도 지금 쓰는 칸은 그대로라 기존 내용이 사라지지 않는다. (정리, 키퍼 정리본이 함께 씀) */
function blobCol(slotKey) { return getConf(slotKey) === 'B' ? 2 : 1; }
function blobReadCol(sheetName, col) {
  const s = sheet(sheetName);
  if (!s) return null;
  const last = Math.max(2, s.getLastRow());
  const v = fromCells(s.getRange(2, col, last - 1, 1).getValues().map(r => r[0]));
  if (!v) return null;
  try { return JSON.parse(v); } catch (e) { return null; }
}
function blobRead(sheetName, slotKey) {
  const col = blobCol(slotKey), v = blobReadCol(sheetName, col);
  return v != null ? v : blobReadCol(sheetName, col === 1 ? 2 : 1);   // 지금 칸이 깨졌으면 예전 칸이라도
}
function blobWrite(sheetName, slotKey, obj) {
  const s = sheet(sheetName), txt = JSON.stringify(obj), parts = toCells(txt).map(x => [x]);
  const nxt = blobCol(slotKey) === 1 ? 2 : 1;
  const last = s.getLastRow();
  if (last >= 2) s.getRange(2, nxt, last - 1, 1).clearContent();        // 쉬는 칸만 비운다
  s.getRange(2, nxt, parts.length, 1).setNumberFormat('@').setValues(parts);
  const back = fromCells(s.getRange(2, nxt, parts.length, 1).getValues().map(r => r[0]));
  if (back !== txt) throw new Error(sheetName + ' 저장 확인 실패 (기존 내용은 그대로 둠)');
  setConf(slotKey, nxt === 2 ? 'B' : 'A');                              // 다 쓴 뒤에 한 번에 전환
}
function blobClearOther(sheetName, slotKey) {
  const s = sheet(sheetName), other = blobCol(slotKey) === 1 ? 2 : 1, last = s.getLastRow();
  if (last >= 2) s.getRange(2, other, last - 1, 1).clearContent();
}
function readNotes() {
  const n = blobRead(SH.NOTES, 'notesSlot');
  if (!n) return null;
  SECTIONS.forEach(sec => { n[sec] = (n[sec] || []).map(x => (x.id ? x : Object.assign({ id: newId() }, x))); });
  n.deleted = n.deleted || {};
  return n;
}
function writeNotes(n) { blobWrite(SH.NOTES, 'notesSlot', n); }
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

/* 누가 보낸 요청인지: 'keeper'(키퍼 로그인 토큰 또는 키퍼 비밀번호) / 'room'(방 비밀번호) / null
 * 방 비밀번호와 키퍼 비밀번호가 같으면 누구도 키퍼가 될 수 없다. */
function roleOf(pw, kt) {
  if (kt && tokenOk(kt)) return 'keeper';
  if (pw === ROOM_PW) return 'room';
  if (pw === KEEPER_PW && !keeperLocked()) return 'keeper';
  return null;
}

function doGet(e) {
  const p = e.parameter || {};
  try {
    const who = roleOf(p.pw, p.kt);
    if (!who) { badPw(p.pw); return out({ ok: false, error: '방 비밀번호가 틀렸어요' }); }
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
        if (who !== 'keeper') return out({ ok: false, error: '키퍼 비밀번호가 필요해요' });
        return out(listTabs(p.url));
      case 'ping':  return out({ ok: true, keeper: who === 'keeper' });
    }
    return out({ ok: false, error: '알 수 없는 요청' });
  } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: '잘못된 요청' }); }
  try {
    const who = roleOf(b.pw, b.kt);
    if (!who) { badPw(b.pw); return out({ ok: false, error: '방 비밀번호가 틀렸어요' }); }
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
      case 'klogin':     return out(keeperLogin(b.kpw));          // 키퍼 비밀번호 → 12시간짜리 로그인 토큰
      case 'klogout':    return out(keeperLogout(b.kt, b.all));
    }
    // ── 키퍼만
    if (who !== 'keeper') {
      return out(b.kt ? { ok: false, kexp: true, error: '키퍼 로그인이 만료됐어요. 다시 로그인해 주세요' } : { ok: false, error: '키퍼 비밀번호가 필요해요' });
    }
    switch (b.action) {
      case 'kping':      return out({ ok: true, keeper: true });
      case 'process':    return out(processNow(true));
      case 'newSession': return out(newSession());
      case 'tabs':       return out(listTabs(b.url));
      case 'chars':      return out(saveCharConfig(b.url, b.map));
      case 'charsRefresh': return out(refreshCharacters(!b.soft));
      case 'image':      return out(addImage(b.data, b.mime, b.caption));
      case 'keeperName': withLock(20000, () => { setConf('keeperName', String(b.name || '').trim().slice(0, 40)); bump('notesVer'); }); return out({ ok: true });
      case 'clearLog':   return out(clearLog(false));
      case 'resetAll':   return out(clearLog(true));
    }
    const kr = keeperTool(b);                                      // 키퍼 전용 도구 (맨 아래 '키퍼 전용 영역')
    if (kr) return out(kr);
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
      const uid = /^[A-Za-z0-9_.:\-]{1,64}$/.test(String(it.uid || '')) ? String(it.uid) : '';
      if (uid && seen.has(uid)) { dup.push(uid); return; }
      const text = String(it.text || '').trim();
      const name = String(it.name || b.name || '').trim().replace(/^[=+@']+/, '').slice(0, 40);
      // 초기화 전에 말한 줄은 초기화 뒤에 되살리지 않는다
      if (!text || !name || (it.rv != null && it.rv !== '' && String(it.rv) !== rv)) { if (uid) dropped.push(uid); return; }
      let sess = /^\d{1,5}$/.test(String(it.session || '')) ? String(it.session) : cur;
      // 세션을 넘긴 뒤 몇 초 동안은 다른 기기가 아직 예전 번호를 알고 있다 → 넘긴 시각 이후에 한 말이면 새 세션으로
      if (Number(sess) < Number(cur) && switchedAt && it.t && Date.parse(it.t) >= switchedAt) sess = cur;
      const u = uid || ('srv' + Utilities.getUuid().replace(/-/g, '').slice(0, 16));
      id++;
      rows.push([id, fmtTime(it.t), sess, name, safeCell(text.slice(0, 2000)), u]);
      seen.add(u);
      if (uid) saved.push(uid);
    });
    if (rows.length) {
      s.getRange(last + 1, 2, rows.length, 5).setNumberFormat('@');     // "1/2" 같은 말이 날짜로 바뀌지 않게 글자 칸으로
      s.getRange(last + 1, 1, rows.length, 6).setValues(rows);
    }
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
    corrections: confJson('corrections', []),
    recap: confJson('recap', null), awards: confJson('awards', null)      // 키퍼가 '공개'를 누른 것만 들어 있다
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
    s.getRange(id, 4).setValue(safeCell(String(text || '').slice(0, 20000)));
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
/* Apps Script의 외부 요청은 약 60초가 지나면 끊긴다고 알려져 있다. 그래서 AI 답이 길어지지 않게 호출마다 max_tokens를 작게 잡는다. */
function claude(system, content, maxTokens) {
  let r;
  try {
    r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json',
      headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify({ model: MODEL, max_tokens: maxTokens || 4000, system, messages: [{ role: 'user', content }] }),
      muteHttpExceptions: true
    });
  } catch (e) {
    throw new Error('AI 응답을 받지 못했어요 (약 60초 제한에 걸렸을 수 있어요): ' + String(e && e.message || e).slice(0, 150));
  }
  if (r.getResponseCode() !== 200) throw new Error('Claude 오류 ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  const j = JSON.parse(r.getContentText());
  if (j.stop_reason === 'max_tokens') throw new Error('AI 답이 너무 길어 잘렸어요 (구간을 줄여 다시 시도)');
  return j.content.filter(c => c.type === 'text').map(c => c.text).join('');
}
/* 공개 기록용 AI 작업(요약·정정·이미지 분석·캐릭터 읽기)은 이 안에서만 돌린다.
 * 이 안에서는 키퍼 자료를 읽는 함수가 모두 오류를 내므로, 실수로라도 비밀이 요약에 섞일 수 없다. */
let _publicAi = 0;
function publicAi(fn) { _publicAi++; try { return fn(); } finally { _publicAi--; } }
function keeperOnly(what) { if (_publicAi) throw new Error('공개 기록용 AI 작업에서는 키퍼 자료(' + what + ')를 읽을 수 없어요'); }
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
    try { res = JSON.parse(fromCells(r.slice(4))); } catch (e) {}
    const on = x => String(x) === '1';
    return { row, sum: on(r[1]), story: on(r[2]), notes: on(r[3]), res };
  }
  return null;
}
function stagePut(key, res) {
  const s = stageSheet(), parts = toCells(JSON.stringify(res));
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
  if (!err && !stale && Date.now() - t0 < budget) {
    try { confLoad(true); compactStory(job); } catch (e) { Logger.log('줄거리 줄이기 실패: ' + e); }
  }
  releaseJob(job);

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
        const keep = { summary: res.summary || '- (잡담 위주, 진행 없음)', storyAdd: res.storyAdd || '', notes: res.notes ? srcToUids(res.notes, idMap) : null,
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
          if (!summaryKeys().has(segKey)) {
            const ms = sheet(SH.SUM);
            ms.getRange(ms.getLastRow() + 1, 1, 1, 6).setNumberFormat('@').setValues([[String(r.session), r.from, r.to, safeCell(String(r.summary)), now(), segKey]]);
          }
          stageMark(cur.row, 2);
        }
        if (!cur.story) {
          if (r.story) setConf('story', String(r.story).slice(0, 20000));    // 예전 버전이 보관해 둔 결과 (줄거리 전체)
          else appendStory(r.storyAdd, r.session);
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
  return publicAi(() => {
    const transcript = g.map(l => '#' + l.id + ' [' + String(l.time).slice(11) + '] ' + l.name + ': ' + l.text).join('\n');
    const card = recapText(sess);
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
      '## 지금까지의 누적 줄거리 (참고용, 다시 쓰지 않는다)\n' + (getConf('story') || '(처음)') + '\n\n' +
      (card ? '## 지난 회차 정리 카드\n' + card + '\n\n' : '') +
      '## 현재 정리(notes)\n' + notesForAi(readNotes() || emptyNotes()) + '\n\n' +
      '## 새로 들어온 대화 (세션 ' + sess + ', 각 줄 앞 #번호는 발언 번호)\n' + transcript + '\n\n' +
      '## 출력 형식\n' +
      '{"summary":"이 대화 구간의 요약. 시간순으로 \\"- \\"로 시작하는 줄들. 키퍼가 준 정보는 모두 포함 (줄 수 제한 없음). ' +
      '줄마다 끝에 근거 발언 번호를 (#12, #15)처럼 붙여라",' +
      '"storyAdd":"이 구간에서 누적 줄거리 뒤에 덧붙일 내용. 중요한 사건·결정·알아낸 사실만 2~5문장(300자 이내)으로. 누적 줄거리를 다시 쓰지 말고 새로 더할 부분만 써라. 이야기 진행이 없으면 빈칸",' +
      '"notes":{"places":[],"npcs":[],"clues":[],"handouts":[]}}\n' + NOTES_RULE +
      '\n새 대화에 이야기 진행이 거의 없으면 summary는 "- (잡담 위주, 진행 없음)"으로 하고 storyAdd는 빈칸, notes는 생략하라.';
    return parseJson(claude(system, user, 5000));
  });
}
// 누적 줄거리 뒤에 덧붙인다. 같은 내용이 이미 있으면(재시도) 다시 붙이지 않는다. 세션이 바뀌면 【세션 N】 줄을 넣는다.
function appendStory(add, sess) {
  add = String(add || '').trim();
  if (!add) return;
  let story = getConf('story') || '';
  if (story.indexOf(add) >= 0) return;
  let lastTag = null, m; const re = /【세션 (\d+)】/g;
  while ((m = re.exec(story))) lastTag = m[1];
  if (lastTag !== String(sess)) story += (story ? '\n\n' : '') + '【세션 ' + sess + '】';
  story += '\n' + add;
  setConf('story', story.slice(-20000));
}
// 누적 줄거리가 길어지면 한 번 줄여 쓴다. 실패해도 기록에는 영향이 없다 (다음 정리 때 다시 시도).
function compactStory(job) {
  const story = getConf('story') || '';
  if (story.length <= STORY_MAX) return false;
  const res = publicAi(() => parseJson(claude(
    '너는 TRPG 세션 기록 담당이다. 길어진 누적 줄거리를 줄여 다시 쓴다. 없는 내용을 더하지 마라. JSON 하나만 출력하라.',
    '## 누적 줄거리\n' + story + '\n\n## 할 일\n1500자 이내로 다시 써라. 【세션 N】 구분 줄은 그대로 두어라. 오래된 일은 짧게, 최근 일은 자세히. ' +
    '인물·장소 이름과 중요한 사건·결정·알아낸 사실은 빠뜨리지 마라. 확인된 사실, NPC의 주장, 탐사자의 추측을 섞지 마라.\n' +
    '## 출력 형식\n{"story":"줄여 쓴 누적 줄거리"}', 2600)));
  const out = String(res.story || '').trim();
  if (out.length < 100 || out.length >= story.length) return false;
  return withLock(20000, () => {
    if (!jobAlive(job) || (getConf('story') || '') !== story) return false;   // 그 사이 초기화됐거나 누가 고쳤으면 그대로 둔다
    setConf('story', out); bump('sumVer');
    return true;
  });
}
// 키퍼가 공개한 지난 회차 카드 (공개 자료라서 요약 AI에 줘도 된다)
function recapText(sess) {
  const r = confJson('recap', null);
  if (!r || Number(r.session) >= Number(sess)) return '';
  const arr = a => (Array.isArray(a) ? a : []).join(' / ');
  return ['세션 ' + r.session + ' 마지막 장면: ' + (r.lastScene || ''), '알아낸 것: ' + arr(r.learned), '하기로 한 일: ' + arr(r.plans), '남은 의문: ' + arr(r.open)].join('\n').slice(0, 2500);
}

function newSession() {
  let proc;
  try { proc = processNow(true); } catch (e) { proc = { ok: false, error: String(e && e.message || e) }; }
  const s = withLock(20000, () => {
    const n = String(Number(getConf('session') || 1) + 1);
    setConf('session', n); setConf('sessionAt', String(Date.now())); bump('sumVer');
    try { snapChars(); } catch (e) {}       // 새 세션 시작 시점의 체력·이성 등을 적어 둔다 (세션별 변화 계산용)
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
    const recent = rows.slice(-8);
    const res = publicAi(() => {
      const system = '너는 TRPG 세션 기록 담당이다. 사람이 기록의 잘못된 부분을 정정해 달라고 했다. ' +
        '요청에 맞게 누적 줄거리, 요약, 정리를 고쳐라. 이번에는 locked 항목도 요청과 관계있으면 고쳐도 된다. 요청과 관계없는 부분은 바꾸지 마라. ' +
        '요약 줄 끝의 (#번호) 근거 표시와 줄거리의 【세션 N】 줄은 그대로 두어라. 답이 길면 중간에 끊기니 꼭 고쳐야 하는 것만 출력하라. ' + FACT_RULES + 'JSON 하나만 출력하라.';
      const user =
        '## 정정 요청 (' + (who || '플레이어') + ')\n' + text + '\n\n' +
        '## 기존 정정 메모\n' + correctionsText() + '\n\n' +
        '## 플레이어 = 캐릭터\n' + (charsText() || '(없음)') + '\n\n' +
        '## 누적 줄거리\n' + (getConf('story') || '(없음)') + '\n\n' +
        '## 최근 요약들\n' + recent.map(r => '[id ' + r.id + ', 세션 ' + r.session + ']\n' + r.text).join('\n\n') + '\n\n' +
        '## 현재 정리(notes)\n' + notesForAi(readNotes() || emptyNotes()) + '\n\n' +
        '## 출력 형식\n{"reply":"무엇을 고쳤는지 한두 문장","memo":"앞으로 기억해야 할 정정 사실 한 줄 (없으면 빈칸)",' +
        '"story":"고친 누적 줄거리 전체 (줄거리에 틀린 내용이 있을 때만. 없으면 빈칸)","summaries":[{"id":숫자,"text":"고친 요약 전문"}] (고친 것만),' +
        '"notes":{"places":[],"npcs":[],"clues":[],"handouts":[]} (고칠 게 없으면 생략)}\n' + NOTES_RULE +
        '\n정정할 때는 src를 출력하지 마라 (기존 근거가 유지된다).';
      return parseJson(claude(system, user, 5000));
    });
    const okIds = new Set(recent.map(r => r.id));
    const applied = withLock(30000, () => {
      if (!jobAlive(job)) return false;                      // 그 사이 초기화됨 → 아무것도 쓰지 않음
      if (res.story) setConf('story', String(res.story).slice(0, 20000));
      const last = sh.getLastRow();
      (res.summaries || []).forEach(x => { const id = Number(x.id); if (okIds.has(id) && id <= last && x.text) sh.getRange(id, 4).setValue(safeCell(String(x.text).slice(0, 20000))); });
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
    const card = publicAi(() => parseJson(claude(
      'TRPG 캐릭터시트를 읽고 핵심만 JSON으로 뽑아라. 시트에 없는 값은 비워라. JSON 하나만 출력.',
      '시트 내용:\n' + text + '\n\n출력 형식: {"name":"","occupation":"","age":"","gender":"","hp":"현재/최대","san":"현재/최대","mp":"현재/최대","luck":"",' +
      '"stats":[{"name":"근력 같은 능력치 이름","value":""}] (최대 9개),' +
      '"skills":[{"name":"","value":""}] (수치가 높은 기술 위주 최대 12개),"items":"소지품 요약","memo":"배경·특이사항 한두 줄"}', 1800)));
    rows.push([m.tab, m.player, JSON.stringify(card), hash, now(), pUrl, pSrc]);
    changed = true;
  });
  withLock(20000, () => {
    if (cs.getLastRow() > 1) cs.getRange(2, 1, cs.getLastRow() - 1, 7).clearContent();
    if (rows.length) cs.getRange(2, 1, rows.length, 7).setValues(rows);
    if (changed || force) bump('charVer');
    try { snapChars(); } catch (e) {}
  });
  return { ok: true, message: rows.length + '명의 캐릭터를 읽었어요' };
}
/* 캐릭터 수치(체력·이성·마력·행운)가 바뀌었거나 세션이 바뀌었으면 '캐릭터기록' 시트에 한 줄 남긴다.
 * 세션별로 처음과 마지막 기록을 비교해서 "이성을 가장 많이 잃은 탐사자" 같은 값을 낸다. (잠금 안에서 부를 것) */
function snapChars() {
  const cs = sheet(SH.CHAR), n = cs.getLastRow();
  if (n < 2) return;
  const sess = getConf('session') || '1', last = confJson('charLast', {}), add = [];
  cs.getRange(2, 1, n - 1, 3).getValues().forEach(r => {
    if (!r[0]) return;
    let c = {}; try { c = JSON.parse(r[2] || '{}'); } catch (e) {}
    const vals = [c.hp, c.san, c.mp, c.luck].map(x => String(x == null ? '' : x).slice(0, 20));
    const sig = sess + '|' + vals.join('|');
    if (last[r[0]] === sig) return;
    last[r[0]] = sig;
    add.push([now(), sess, safeCell(String(r[0])), safeCell(String(r[1] || '')), safeCell(String(c.name || r[0]))].concat(vals.map(safeCell)));
  });
  if (!add.length) return;
  const s = ensureSheet(SH.CSNAP);
  s.getRange(s.getLastRow() + 1, 1, add.length, 9).setNumberFormat('@').setValues(add);
  setJson('charLast', last);
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
  const res = publicAi(() => parseJson(claude('너는 TRPG 세션 기록 담당이다. JSON 하나만 출력하라.', content, 4000)));
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
    // 지운 회의록을 바탕으로 만든 것들도 함께 지운다: 키퍼 기록(현황판·NPC 제안·시상식·피드백), 판정 로그, 캐릭터 수치 기록, 공개한 카드
    [SH.KLOG, SH.ROLLS, SH.CSNAP].forEach(n => { ensureSheet(n); wipe(n); });
    setConf('recap', ''); setConf('awards', ''); setConf('charLast', '{}');
    setConf('processedId', '0'); setConf('story', '');
    setJson('job', null); setJson('pending', null); setJson('procStatus', null);
    if (all) {
      wipe(SH.IMG);
      writeNotes(emptyNotes());
      setConf('session', '1'); setConf('sessionAt', '0'); setConf('corrections', '[]');
      bump('imgVer'); bump('notesVer');
    }
    bump('sumVer'); bump('resetVer');
    return { ok: true, message: (all ? '전체 초기화했어요 (캐릭터 연결·용어집·이름 색은 그대로)' : '회의록과 요약을 지웠어요') + ' · 시나리오 자료는 키퍼 탭에서 따로 지워요' };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 키퍼 전용 영역
 *
 * 보안 원칙
 *  1) 여기 있는 함수는 doPost에서 키퍼로 확인된 요청(keeperTool)으로만 불린다. doGet(주소에 붙는 요청)으로는 부를 수 없다.
 *  2) 키퍼 자료는 키퍼 전용 시트(키퍼자료·키퍼원문·키퍼기록·판정기록)에만 저장한다.
 *     플레이어가 받는 응답(poll·data·history·sessionLines·evidence·token)은 이 시트를 읽지 않는다.
 *  3) 공개 기록용 AI(요약·정정·이미지 분석·캐릭터 읽기·줄거리 줄이기·시작 카드)는 publicAi() 안에서 돌고,
 *     그 안에서 키퍼 자료를 읽으면 keeperOnly()가 오류를 낸다. → 진상이 요약에 섞일 수 없다.
 *  4) 플레이어에게 공개되는 것은 키퍼가 '공개'를 누른 시작 카드와 시상식뿐이고, 서버가 정해진 칸만 골라 저장한다.
 *     (키퍼 메모 kNote 같은 칸은 공개 자료에 들어가지 않는다)
 *  5) 키퍼 비밀번호는 로그인할 때 한 번만 보내고, 그 뒤에는 12시간짜리 토큰을 쓴다. 시트에는 토큰의 해시만 남긴다.
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ───────────── 키퍼 로그인 ───────────── */
function sha(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8));
}
function keeperLocked() {
  try { const u = Number(CacheService.getScriptCache().get('k_lock') || 0); return Date.now() < u ? u : 0; } catch (e) { return 0; }
}
// 틀린 비밀번호가 올 때마다 센다. 10분 안에 K_FAIL_MAX번 틀리면 비밀번호 로그인을 잠시 잠근다 (비밀번호 찍어 맞히기 방지).
function badPw(pw) {
  if (!pw) return;
  try {
    const c = CacheService.getScriptCache();
    const n = Number(c.get('k_fail') || 0) + 1;
    if (n >= K_FAIL_MAX) { c.put('k_lock', String(Date.now() + K_LOCK_MS), 1200); c.put('k_fail', '0', 600); }
    else c.put('k_fail', String(n), 600);
  } catch (e) {}
}
function tokenOk(kt) {
  if (!kt || ROOM_PW === KEEPER_PW) return false;
  const h = sha(kt), t = Date.now();
  return confJson('ktokens', []).some(x => x && x.h === h && Number(x.exp) > t);
}
function keeperLogin(kpw) {
  if (ROOM_PW === KEEPER_PW) return { ok: false, error: '방 비밀번호와 키퍼 비밀번호가 같아서 키퍼 기능이 잠겨 있어요. Code.gs 맨 위에서 서로 다르게 바꾸고 다시 배포해 주세요' };
  const until = keeperLocked();
  if (until) return { ok: false, locked: true, error: '키퍼 비밀번호를 여러 번 틀려서 잠겼어요. ' + Math.max(1, Math.ceil((until - Date.now()) / 60000)) + '분 뒤에 다시 시도해 주세요' };
  if (String(kpw == null ? '' : kpw) !== KEEPER_PW) {
    badPw('x');
    Utilities.sleep(600);
    return { ok: false, error: '키퍼 비밀번호가 틀렸어요' };
  }
  const kt = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  const exp = Date.now() + KTOKEN_TTL;
  withLock(20000, () => {
    const t = Date.now();
    const list = confJson('ktokens', []).filter(x => x && Number(x.exp) > t).slice(-4);   // 동시에 5대까지
    list.push({ h: sha(kt), exp });
    setJson('ktokens', list);
  });
  return { ok: true, kt, exp };
}
function keeperLogout(kt, all) {
  if (!kt || !tokenOk(kt)) return { ok: true };
  withLock(20000, () => {
    const h = sha(kt);
    setJson('ktokens', all ? [] : confJson('ktokens', []).filter(x => x && x.h !== h));
  });
  return { ok: true };
}

/* ───────────── 키퍼 도구 목록 ───────────── */
function keeperTool(b) {
  switch (b.action) {
    case 'kData':          return kData();
    // 시나리오 자료
    case 'kSrcAdd':        return kSrcAdd(b);
    case 'kSrcDel':        return kSrcDel(b.source);
    case 'kOcr':           return kOcr(b);
    case 'kDigest':        return kDigestStep();
    case 'kKbSave':        return kKbSave(b.sec, b.item);
    case 'kKbDelete':      return kKbDelete(b.sec, b.id);
    case 'kKbUnlock':      return kKbUnlock(b.sec, b.id);
    case 'kKbText':        return kKbText(b.key, b.text);
    case 'kTruthPolish':   return kTruthPolish();
    case 'kKbClear':       return kKbClear();
    // 세션 중
    case 'kNpc':           return kNpc(b);
    case 'kRoll':          return kRoll(b);
    case 'kBoard':         return kBoard();
    case 'kClueMark':      return kClueMark(b.id, b.mark);
    // 세션 사이
    case 'kRecap':         return kRecap(b.session);
    case 'kRecapPublish':  return kRecapPublish(b.card, b.session);
    case 'kRecapOff':      return withLock(20000, () => { setConf('recap', ''); bump('sumVer'); return { ok: true }; });
    case 'kStats':         return { ok: true, stats: sessionStats(String(b.session || getConf('session'))) };
    case 'kRollsSave':     return kRollsSave(b);
    case 'kAwards':        return kAwards(b.session, b.useTruth);
    case 'kAwardsPublish': return kAwardsPublish(b.session, b.items);
    case 'kAwardsOff':     return withLock(20000, () => { setConf('awards', ''); bump('sumVer'); return { ok: true }; });
    case 'kFeedback':      return kFeedback(b.session);
  }
  return null;
}

/* ───────────── 키퍼 정리본 (시나리오 자료를 AI가 읽어 만든 키퍼용 노트) ───────────── */
const KB_SECTIONS = ['npcs', 'places', 'clues', 'rolls', 'scenes'];
const KB_FIELDS = {
  npcs:   ['name', 'role', 'secret', 'motive', 'lies', 'knows', 'attitude', 'voice'],
  places: ['name', 'hidden'],
  clues:  ['text', 'where', 'how', 'core'],
  rolls:  ['where', 'skill', 'success', 'hard', 'extreme', 'fail', 'fumble'],
  scenes: ['title', 'summary']
};
const KB_NAME = { npcs: 'name', places: 'name', clues: 'text', rolls: 'skill', scenes: 'title' };
function kbEmpty() { return { truth: '', memo: '', npcs: [], places: [], clues: [], rolls: [], scenes: [], done: [], deleted: {} }; }
function kid() { return 'k' + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function kbKey(sec, x) {
  const k = sec === 'rolls' ? String(x.where || '') + '|' + String(x.skill || '') : x[KB_NAME[sec]];
  return String(k || '').replace(/\s+/g, '').toLowerCase();
}
function kbRead() {
  keeperOnly('시나리오 정리본');
  ensureSheet(SH.KB);
  const k = blobRead(SH.KB, 'kbSlot') || kbEmpty();
  KB_SECTIONS.forEach(s => { k[s] = (Array.isArray(k[s]) ? k[s] : []).filter(x => x && typeof x === 'object').map(x => (x.id ? x : Object.assign({ id: kid() }, x))); });
  k.truth = String(k.truth || ''); k.memo = String(k.memo || '');
  k.done = Array.isArray(k.done) ? k.done : []; k.deleted = k.deleted || {};
  return k;
}
function kbWrite(k) { ensureSheet(SH.KB); blobWrite(SH.KB, 'kbSlot', k); bump('kVer'); }
function kbClean(sec, x) {
  const o = {};
  KB_FIELDS[sec].forEach(f => {
    if (x[f] == null) return;
    if (f === 'core') o.core = (x.core === true || x.core === 'true' || x.core === '예');
    else o[f] = String(x[f]).trim().slice(0, 3000);
  });
  return o;
}
// AI가 뽑은 내용을 정리본에 합친다. 키퍼가 고친(locked) 항목과 지운 항목은 건드리지 않는다.
// 이미 있는 항목의 칸은 지우거나 바꾸지 않고 뒤에 덧붙이기만 한다 → 나중 조각 때문에 앞에서 정리한 내용이 사라지지 않는다.
function kbMerge(base, ai) {
  const outK = Object.assign({}, base);
  KB_SECTIONS.forEach(sec => {
    const res = (base[sec] || []).map(o => Object.assign({}, o));
    const aiArr = ai && Array.isArray(ai[sec]) ? ai[sec] : [];
    const dead = new Set((base.deleted || {})[sec] || []);
    const byId = {}, byKey = {};
    res.forEach((o, i) => { byId[o.id] = i; const k = kbKey(sec, o); if (k && byKey[k] == null) byKey[k] = i; });
    aiArr.forEach(x => {
      if (!x || typeof x !== 'object') return;
      const clean = kbClean(sec, x);
      let i = (x.id && byId[x.id] != null) ? byId[x.id] : -1;
      const k = kbKey(sec, clean);
      if (i < 0 && k && byKey[k] != null) i = byKey[k];
      if (i >= 0) {
        const cur = res[i];
        if (cur.locked) return;
        Object.keys(clean).forEach(f => {
          const nv = clean[f];
          if (nv === '' || nv == null) return;
          if (f === 'core') { cur.core = cur.core || nv; return; }
          const old = String(cur[f] || '');
          if (!old || nv.indexOf(old) >= 0) cur[f] = nv;                       // 비어 있었거나, 기존 내용을 품은 채로 늘어난 경우
          else if (f !== KB_NAME[sec] && old.indexOf(nv) < 0) cur[f] = (old + ' / ' + nv).slice(0, 3000);
        });
        return;
      }
      if (!k || k === '|' || dead.has(k)) return;
      const item = Object.assign({ id: kid(), locked: false }, clean);
      res.push(item); byId[item.id] = res.length - 1; byKey[k] = res.length - 1;
    });
    outK[sec] = res;
  });
  const add = String((ai && ai.truthAdd) || '').trim().slice(0, 1500);
  if (add && String(outK.truth || '').indexOf(add) < 0) outK.truth = ((outK.truth ? outK.truth + '\n' : '') + add).slice(0, 8000);
  return outK;
}
// 정리 단계에서 AI에게 보여 줄 "지금까지의 정리본": 이번 조각에 이름이 나오는 NPC·장소·장면은 전체를(이미 적힌 내용을 또 쓰지 않게), 나머지는 이름만.
function kbForAi(kb, text) {
  const t = String(text || ''), o = {};
  KB_SECTIONS.forEach(sec => {
    o[sec] = (kb[sec] || []).map(x => {
      const nm = String(x[KB_NAME[sec]] || '');
      const showAll = !x.locked && (sec === 'clues' || sec === 'rolls' || (nm.length >= 2 && t.indexOf(nm) >= 0));
      const y = { id: x.id };
      if (showAll) KB_FIELDS[sec].forEach(f => { if (x[f] !== '' && x[f] != null) y[f] = x[f]; });
      else { y[KB_NAME[sec]] = nm.slice(0, 80); if (sec === 'rolls') y.where = String(x.where || '').slice(0, 40); if (x.locked) y.locked = true; }
      return y;
    });
  });
  return JSON.stringify(o);
}
const KB_RULE =
  '정리 규칙: npcs=[{id,name,role,secret,motive,lies,knows,attitude,voice}] ' +
  'role=겉으로 드러난 신분·역할, secret=숨기고 있는 것, motive=동기·목적, lies=플레이어에게 할 거짓말이나 둘러대는 말, ' +
  'knows=알고 있는 정보(물으면 말해 줄 수 있는 것), attitude=탐사자를 대하는 태도, voice=말투·버릇. ' +
  'places=[{id,name,hidden}] hidden=그 장소에 숨겨진 정보·위험·찾을 수 있는 것. ' +
  'clues=[{id,text,where,how,core}] 플레이어가 찾을 수 있는 단서. where=어디서, how=어떻게 얻는지(판정·행동), core=진상에 다다르는 데 꼭 필요하면 true. ' +
  'rolls=[{id,where,skill,success,hard,extreme,fail,fumble}] 시나리오에 적힌 판정. skill=기술 이름, 나머지는 그 결과일 때 줄 정보(적혀 있지 않은 칸은 비워라). ' +
  'scenes=[{id,title,summary}] 장면·챕터의 흐름. ' +
  '이미 정리본에 있는 대상은 같은 id로, 이번 조각에서 새로 알게 된 내용만 해당 칸에 짧게 써라. 기존 내용을 다시 쓰지 마라(네가 쓴 내용은 기존 칸 뒤에 덧붙여진다). ' +
  '이미 적혀 있는 내용이면 출력하지 마라. 새 대상은 id를 비워라. "locked":true 인 항목은 키퍼가 직접 고친 것이니 출력하지 마라.';

/* ───────────── 시나리오 원문 조각 ───────────── */
function ksrcRows() {
  keeperOnly('시나리오 원문');
  const s = ensureSheet(SH.KSRC), last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, 5).getValues()
    .map((r, i) => ({ row: i + 2, id: String(r[0]), source: String(r[1]).trim(), n: Number(r[2]) || 0, text: String(r[4]) }))
    .filter(r => r.id);
}
// 목록만 필요할 때는 본문을 읽지 않는다 (원문이 많아도 키퍼 탭이 빨리 열리게)
function ksrcMeta() {
  keeperOnly('시나리오 원문');
  const s = ensureSheet(SH.KSRC), last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, 4).getValues()
    .map(r => ({ id: String(r[0]), source: String(r[1]).trim(), text: { length: Number(r[3]) || 0 } })).filter(r => r.id);
}
function ksrcList(kb, rows) {
  const done = new Set(kb.done || []), by = {}, order = [];
  rows.forEach(r => {
    if (!by[r.source]) { by[r.source] = { source: r.source, chunks: 0, chars: 0, pending: 0 }; order.push(r.source); }
    const g = by[r.source]; g.chunks++; g.chars += r.text.length; if (!done.has(r.id)) g.pending++;
  });
  return order.map(k => by[k]);
}
function kSrcAdd(b) {
  const source = String(b.source || '').trim().replace(/^[=+@']+/, '').slice(0, 80) || '자료';
  const parts = (Array.isArray(b.parts) ? b.parts : []).map(x => String(x || '').trim()).filter(Boolean).map(x => x.slice(0, 12000));
  if (!parts.length) return { ok: false, error: '올릴 내용이 없어요' };
  return withLock(30000, () => {
    const s = ensureSheet(SH.KSRC), rows = ksrcRows();
    if (rows.length + parts.length > 600) return { ok: false, error: '원문이 너무 많아요 (조각 600개 한도). 필요 없는 자료를 지우고 다시 올려 주세요' };
    let n = rows.filter(r => r.source === source).length;
    const add = parts.map(t => ['c' + Utilities.getUuid().replace(/-/g, '').slice(0, 12), source, String(++n), String(t.length), safeCell(t), now()]);
    s.getRange(s.getLastRow() + 1, 1, add.length, 6).setNumberFormat('@').setValues(add);
    return { ok: true, added: add.length, total: rows.length + add.length };
  });
}
function kSrcDel(source) {
  source = String(source || '').trim();
  return withLock(30000, () => {
    const s = ensureSheet(SH.KSRC), rows = ksrcRows().filter(r => r.source === source);
    for (let i = rows.length - 1; i >= 0; i--) s.deleteRows(rows[i].row, 1);
    return { ok: true, removed: rows.length, message: '원문 ' + rows.length + '조각을 지웠어요. 이미 정리본에 들어간 내용은 남아 있어요' };
  });
}
// 조각이 너무 커서 AI 답이 잘리거나 시간 초과가 났을 때: 반으로 나눈다 (앞 절반은 제자리, 뒤 절반은 맨 아래에 새 조각으로)
function ksrcSplit(id) {
  return withLock(20000, () => {
    const s = ensureSheet(SH.KSRC), r = ksrcRows().find(x => x.id === id);
    if (!r || r.text.length <= 1500) return false;
    let cut = r.text.lastIndexOf('\n', Math.floor(r.text.length / 2));
    if (cut < r.text.length * 0.25) cut = Math.floor(r.text.length / 2);
    const a = r.text.slice(0, cut).trim(), b2 = r.text.slice(cut).trim();
    if (!a || !b2) return false;
    s.getRange(r.row, 4, 1, 2).setNumberFormat('@').setValues([[String(a.length), safeCell(a)]]);
    s.getRange(s.getLastRow() + 1, 1, 1, 6).setNumberFormat('@').setValues([['c' + Utilities.getUuid().replace(/-/g, '').slice(0, 12), r.source, String(r.n) + '-2', String(b2.length), safeCell(b2), now()]]);
    return true;
  });
}
// 글자가 없는(스캔) PDF의 한 쪽을 그림으로 받아 글자로 옮긴다
function kOcr(b) {
  if (!b.data) return { ok: false, error: '그림이 없어요' };
  const text = claude(
    '너는 문서의 글자를 옮겨 적는 도구다. 그림 속 글자를 빠짐없이, 보이는 순서대로 옮겨 적어라. 표는 줄로 풀어 써라. 설명이나 감상을 덧붙이지 마라. 글자가 없으면 아무것도 출력하지 마라.',
    [{ type: 'image', source: { type: 'base64', media_type: b.mime || 'image/jpeg', data: b.data } }, { type: 'text', text: '이 쪽의 글자를 옮겨 적어라.' }], 3500);
  return { ok: true, text: String(text || '').trim() };
}
// 정리 한 걸음: 아직 정리 안 된 조각 하나를 AI가 읽고 정리본에 합친다. 화면이 끝날 때까지 이걸 되풀이해서 부른다.
function kDigestStep() {
  const gen = getConf('kbGen') || '0';
  const kb = kbRead(), rows = ksrcRows(), done = new Set(kb.done);
  const pend = rows.filter(r => !done.has(r.id));
  if (!pend.length) return { ok: true, left: 0, total: rows.length };
  const c = pend[0];
  let res;
  try {
    res = parseJson(claude(
      '너는 TRPG 키퍼(게임 마스터)의 비공개 준비 노트를 만드는 조수다. 아래는 키퍼만 보는 시나리오 자료의 일부다. ' +
      '자료에 있는 내용만 정리하고 지어내지 마라. 문장을 길게 베끼지 말고, 키퍼가 진행 중에 한눈에 볼 수 있게 짧게 정리하라. JSON 하나만 출력하라.',
      '## 지금까지 만든 정리본\n' + kbForAi(kb, c.text) + '\n\n' +
      '## 시나리오 자료 (' + c.source + ', 조각 ' + c.n + ')\n' + c.text + '\n\n' +
      '## 출력 형식\n{"truthAdd":"이 조각에서 새로 알게 된 사건의 진상·배경·흑막 (400자 이내, 없으면 빈칸)",' +
      '"npcs":[],"places":[],"clues":[],"rolls":[],"scenes":[]}\n' + KB_RULE, 3500));
  } catch (e) {
    // 답이 잘렸거나 제한 시간에 걸렸으면 조각이 큰 것 → 반으로 나눈다. AI 서버가 바쁜 것(429·5xx)이면 그대로 다시 시도.
    const msg = String(e && e.message || e);
    let split = false;
    if (/잘렸|받지 못했|JSON/.test(msg)) { try { split = ksrcSplit(c.id); } catch (e2) {} }
    return { ok: false, retry: !!split || /Claude 오류 (429|5\d\d)/.test(msg), error: '정리 실패: ' + msg + (split ? ' · 조각을 반으로 나눠서 다시 시도해요' : '') };
  }
  return withLock(30000, () => {
    if ((getConf('kbGen') || '0') !== gen) return { ok: false, error: '정리하는 사이 시나리오 자료가 지워졌어요' };
    const cur = kbRead();
    if (cur.done.indexOf(c.id) >= 0) return { ok: true, left: pend.length - 1, total: rows.length };   // 다른 요청이 먼저 처리함
    const merged = kbMerge(cur, res);
    merged.done = cur.done.concat([c.id]).slice(-2000);     // 정리본과 "어디까지 읽었는지"를 한 번에 저장 → 같은 조각을 두 번 합치지 않는다
    kbWrite(merged);
    return { ok: true, left: pend.length - 1, total: rows.length, source: c.source };
  });
}
function kKbSave(sec, item) {
  if (KB_SECTIONS.indexOf(sec) < 0 || !item) return { ok: false, error: '잘못된 항목' };
  return withLock(20000, () => {
    const kb = kbRead(), clean = kbClean(sec, item);
    if (sec === 'clues' && item.core == null) clean.core = false;
    if (!kbKey(sec, clean).replace('|', '')) return { ok: false, error: '이름(내용)을 적어 주세요' };
    clean.locked = true; clean.editedAt = now();
    const i = item.id ? kb[sec].findIndex(x => x.id === item.id) : -1;
    if (i >= 0) kb[sec][i] = Object.assign({}, kb[sec][i], clean);
    else kb[sec].push(Object.assign({ id: kid() }, clean));
    const key = kbKey(sec, clean);
    if (kb.deleted[sec]) kb.deleted[sec] = kb.deleted[sec].filter(k => k !== key);
    kbWrite(kb);
    return { ok: true };
  });
}
function kKbDelete(sec, id) {
  if (KB_SECTIONS.indexOf(sec) < 0) return { ok: false, error: '잘못된 항목' };
  return withLock(20000, () => {
    const kb = kbRead(), it = kb[sec].find(x => x.id === id);
    if (!it) return { ok: false, error: '이미 지워졌어요' };
    kb[sec] = kb[sec].filter(x => x.id !== id);
    kb.deleted[sec] = (kb.deleted[sec] || []).concat([kbKey(sec, it)]).slice(-300);
    kbWrite(kb);
    return { ok: true };
  });
}
function kKbUnlock(sec, id) {
  if (KB_SECTIONS.indexOf(sec) < 0) return { ok: false, error: '잘못된 항목' };
  return withLock(20000, () => { const kb = kbRead(); kb[sec].forEach(x => { if (x.id === id) x.locked = false; }); kbWrite(kb); return { ok: true }; });
}
function kKbText(key, text) {
  if (key !== 'truth' && key !== 'memo') return { ok: false, error: '잘못된 항목' };
  return withLock(20000, () => { const kb = kbRead(); kb[key] = String(text || '').slice(0, 8000); kbWrite(kb); return { ok: true }; });
}
// 조각마다 덧붙여 온 진상 메모를 한 번 매끄럽게 다시 쓴다
function kTruthPolish() {
  const gen = getConf('kbGen') || '0', kb = kbRead(), before = kb.truth;
  if (before.length < 200) return { ok: false, error: '다듬을 만큼 길지 않아요' };
  const res = parseJson(claude(
    '너는 TRPG 키퍼의 비공개 준비 노트를 다듬는 조수다. 주어진 메모에 있는 내용만 쓰고 지어내지 마라. JSON 하나만 출력하라.',
    '## 진상 메모 (여러 조각에서 모은 것, 겹치는 내용 있음)\n' + before + '\n\n## 할 일\n겹치는 내용을 합치고 일어난 순서대로 정리해서 1500자 이내로 다시 써라. ' +
    '누가, 왜, 무엇을 했는지와 지금 무슨 일이 벌어지고 있는지가 한눈에 보이게 하라.\n## 출력 형식\n{"truth":"다시 쓴 진상"}', 2600));
  const outT = String(res.truth || '').trim();
  if (outT.length < 50) return { ok: false, error: 'AI가 빈 답을 줬어요. 다시 눌러 주세요' };
  return withLock(20000, () => {
    if ((getConf('kbGen') || '0') !== gen) return { ok: false, error: '그 사이 시나리오 자료가 지워졌어요' };
    const cur = kbRead();
    if (cur.truth !== before) return { ok: false, error: '그 사이 진상 내용이 바뀌었어요. 다시 눌러 주세요' };
    cur.truth = outT.slice(0, 8000); kbWrite(cur);
    return { ok: true };
  });
}
function kKbClear() {
  return withLock(30000, () => {
    const s = ensureSheet(SH.KSRC);
    if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1);
    kbWrite(kbEmpty()); blobClearOther(SH.KB, 'kbSlot');    // 쉬던 칸에 남은 예전 정리본도 지운다
    bump('kbGen');
    return { ok: true, message: '시나리오 자료와 정리본을 모두 지웠어요' };
  });
}

/* ───────────── 키퍼 기록 (현황판·제안·초안 보관) ───────────── */
function klogAdd(kind, session, title, input, result, rv) {
  keeperOnly('키퍼 기록');
  confLoad(true);                                            // AI를 기다리는 동안 초기화됐을 수 있으니 설정을 다시 읽는다
  const cur = getConf('resetVer') || '0';
  if (rv != null && String(rv) !== cur) return null;        // 그 사이 기록이 초기화됐으면 남기지 않는다
  const id = 'g' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
  const s = ensureSheet(SH.KLOG);
  s.getRange(s.getLastRow() + 1, 1, 1, 8).setNumberFormat('@').setValues([[id, now(), cur, String(session || ''), kind, safeCell(String(title || '').slice(0, 100)),
    JSON.stringify(input == null ? null : input).slice(0, 20000), JSON.stringify(result == null ? null : result).slice(0, 45000)]]);
  return id;
}
function klogRows() {
  keeperOnly('키퍼 기록');
  const s = ensureSheet(SH.KLOG), last = s.getLastRow();
  if (last < 2) return [];
  const rv = getConf('resetVer') || '0', from = Math.max(2, last - 399);
  return s.getRange(from, 1, last - from + 1, 8).getValues().filter(r => r[0] && String(r[2]) === rv).map(r => {
    const j = x => { try { return JSON.parse(String(x)); } catch (e) { return null; } };
    return { id: String(r[0]), at: String(r[1]), session: String(r[3]), kind: String(r[4]), title: String(r[5]), input: j(r[6]), result: j(r[7]) };
  });
}
function kData() {
  const kb = kbRead(), rows = ksrcMeta(), logs = klogRows();
  const lastN = (kind, n) => logs.filter(l => l.kind === kind).slice(-n).reverse();
  const done = new Set(kb.done);
  const rollS = ensureSheet(SH.ROLLS);
  return {
    ok: true, kb, sources: ksrcList(kb, rows), pending: rows.filter(r => !done.has(r.id)).length, chunks: rows.length,
    board: lastN('board', 1)[0] || null, recaps: lastN('recap', 6), awardsLogs: lastN('awards', 6), feedbacks: lastN('feedback', 6),
    npcLog: lastN('npc', 12), rollLog: lastN('roll', 12),
    recap: confJson('recap', null), awards: confJson('awards', null),
    rollsTotal: Math.max(0, rollS.getLastRow() - 1), sessions: sessionList().sessions, session: getConf('session'),
    keeperName: getConf('keeperName') || '', resetVer: getConf('resetVer') || '0'
  };
}

/* ───────────── 공통 재료 ───────────── */
function tms(t) { const d = new Date(String(t).replace(' ', 'T') + '+09:00').getTime(); return isNaN(d) ? 0 : d; }
function pickF(x, fields) { const o = {}; fields.forEach(f => { if (x[f] !== '' && x[f] != null) o[f] = x[f]; }); return o; }
function sameName(a, b) { return String(a || '').replace(/\s+/g, '') === String(b || '').replace(/\s+/g, ''); }
function recentTalk(n) {
  const total = totalLines();
  return readLines(Math.max(0, total - n), n).map(l => '[' + String(l.time).slice(11, 19) + '] ' + l.name + ': ' + l.text).join('\n');
}
function sessionSummaries(session, cap) {
  const rows = sheet(SH.SUM).getDataRange().getValues().slice(1)
    .filter(r => String(r[0]) === String(session))
    .map(r => ({ from: String(r[1]), to: String(r[2]), text: String(r[3]) }))
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  let outS = rows.map(r => '[' + r.from.slice(11, 16) + '~' + r.to.slice(11, 16) + ']\n' + r.text).join('\n\n');
  cap = cap || 40000;
  if (outS.length > cap) outS = '(앞부분 생략)\n' + outS.slice(-cap);
  return { text: outS, count: rows.length };
}
// 정리본에서 지금 상황과 관계있는 부분만 고른다 ("해당 부분만 AI에 주기")
//  - 그 항목의 이름이 상황 설명(hay)에 나오거나, 고른 NPC·장소 이름(names)이 그 항목 내용에 나오면 관계있다고 본다.
function kbRelated(kb, hay, names, skipId, cap) {
  hay = String(hay || ''); names = (names || []).map(x => String(x || '').trim()).filter(x => x.length >= 2);
  const outR = []; let size = 0;
  const hit = nm => { nm = String(nm || '').trim(); return nm.length >= 2 && hay.indexOf(nm) >= 0; };
  const mention = x => { const t = JSON.stringify(x); return names.some(n => t.indexOf(n) >= 0); };
  const push = (label, o) => { const s = label + ' ' + JSON.stringify(o); if (size + s.length > cap) return; size += s.length; outR.push(s); };
  kb.places.forEach(p => { if (hit(p.name) || mention(p)) push('[장소]', pickF(p, KB_FIELDS.places)); });
  kb.npcs.forEach(n => { if (n.id !== skipId && (hit(n.name) || mention(n))) push('[다른 NPC]', pickF(n, ['name', 'role', 'secret', 'lies', 'knows'])); });
  kb.clues.forEach(c => { if (hit(c.where) || mention(c)) push('[단서]', pickF(c, KB_FIELDS.clues)); });
  kb.rolls.forEach(r => { if (hit(r.where) || hit(r.skill) || mention(r)) push('[판정]', pickF(r, KB_FIELDS.rolls)); });
  kb.scenes.forEach(s => { if (hit(s.title) || mention(s)) push('[장면]', pickF(s, KB_FIELDS.scenes)); });
  return outR;
}
const LEVELS = ['대성공', '극단적 성공', '어려운 성공', '성공', '실패', '대실패'];
function txt(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 600); }
function arr(v, n, len) { return (Array.isArray(v) ? v : (v ? [v] : [])).map(x => txt(x, len || 300)).filter(Boolean).slice(0, n || 8); }

/* ───────────── NPC 반응 제안 ───────────── */
function kNpc(b) {
  const rv = getConf('resetVer') || '0';
  const name = txt(b.npc, 60);
  const situation = txt(b.situation, 2000);
  if (!name) return { ok: false, error: 'NPC를 고르거나 이름을 적어 주세요' };
  if (!situation) return { ok: false, error: '지금 상황을 한 줄이라도 적어 주세요' };
  const kb = kbRead(), notes = readNotes() || emptyNotes();
  const place = txt(b.place, 60), skill = txt(b.skill, 40), level = LEVELS.indexOf(b.level) >= 0 ? b.level : '';
  const kn = kb.npcs.find(x => sameName(x.name, name));
  const pub = (notes.npcs || []).find(x => sameName(x.name, name));
  const claims = (notes.clues || []).filter(c => c.kind === '주장').slice(-30).map(c => '- ' + c.text);   // "집사는 ~라고 주장함"처럼 이름 대신 호칭으로 적힌 것도 있어서 모두 준다
  const rel = kbRelated(kb, [name, place, situation, skill].join(' '), [name, place], kn && kn.id, 5000);
  const system =
    '너는 TRPG 키퍼(게임 마스터)의 진행을 돕는 비공개 조수다. 키퍼가 NPC를 연기할 수 있게 그 NPC의 반응을 제안하라. ' +
    '규칙: ① NPC는 자기가 아는 것만 말한다. 진상이나 다른 NPC의 비밀 가운데 이 NPC가 모르는 것은 대사에 넣지 마라. ' +
    '② NPC가 숨기는 것은 판정 결과가 충분히 좋거나 상황이 그럴 만할 때만 조금 드러내라. 판정이 실패면 둘러대게 하라. ' +
    '③ 이 NPC가 이전에 한 말(주장)과 어긋나지 않게 하라. 어긋날 수밖에 없으면 warn에 적어라. ' +
    '④ 자료에 없는 사실을 새로 지어내지 마라. 자료가 부족하면 warn에 "자료에 없음"이라고 적고 무난한 반응을 제안하라. ' +
    '⑤ 대사는 한국어 구어체로 짧게, 키퍼가 바로 소리 내어 읽을 수 있게 써라. JSON 하나만 출력하라.';
  const user =
    '## NPC 이름\n' + name + '\n\n' +
    '## 이 NPC의 비공개 설정 (키퍼 전용)\n' + (kn ? JSON.stringify(pickF(kn, KB_FIELDS.npcs)) : '(정리본에 없음)') + '\n\n' +
    '## 관계있는 비공개 자료 (키퍼 전용)\n' + (rel.length ? rel.join('\n') : '(없음)') + '\n\n' +
    (b.full ? '## 사건의 진상 전체 (키퍼 전용, 이 NPC가 모르는 부분은 대사에 쓰지 말 것)\n' + (kb.truth || '(없음)') + '\n\n' : '') +
    '## 플레이어가 이 NPC에 대해 아는 것 (공개 기록)\n' + (pub ? JSON.stringify(pickF(pub, ['name', 'affil', 'age', 'traits', 'said', 'relation'])) : '(아직 기록 없음)') + '\n\n' +
    '## 공개 기록에 남은 NPC들의 주장 (이 가운데 이 NPC가 한 말이 있으면 그것과 어긋나지 않게)\n' + (claims.length ? claims.join('\n') : '(없음)') + '\n\n' +
    '## 방금까지의 대화 (받아쓰기)\n' + (recentTalk(30) || '(없음)') + '\n\n' +
    '## 지금 상황\n' + (place ? '장소: ' + place + '\n' : '') + situation + '\n' +
    (skill || level ? '판정: ' + (skill || '(기술 미지정)') + ' → ' + (level || '(결과 미지정)') + '\n' : '') + '\n' +
    '## 출력 형식\n{"lines":["대사 후보 1","대사 후보 2","대사 후보 3"],"expression":"표정·몸짓·목소리","inner":"속마음 (키퍼만 봄)",' +
    '"reveal":"이번에 드러내도 되는 정보 (없으면 빈칸)","hide":"계속 숨겨야 하는 것 (없으면 빈칸)","consistency":"이전 주장과 맞는지 한 문장","warn":"주의할 점 (없으면 빈칸)"}';
  const res = parseJson(claude(system, user, 1500));
  const result = { lines: arr(res.lines, 4, 400), expression: txt(res.expression), inner: txt(res.inner), reveal: txt(res.reveal), hide: txt(res.hide), consistency: txt(res.consistency), warn: txt(res.warn) };
  const used = { inKb: !!kn, related: rel.length, full: !!b.full };
  klogAdd('npc', getConf('session'), name, { npc: name, place, situation, skill, level, full: !!b.full }, result, rv);
  return { ok: true, result, used };
}

/* ───────────── 판정 결과 보조 ───────────── */
// 원문에서 기술 이름이 나오는 대목을 찾아 앞뒤를 잘라 보여 준다 (AI 없이)
function ksrcFind(skill, place, max) {
  skill = String(skill || '').trim();
  if (skill.length < 2) return [];
  const found = [];
  ksrcRows().forEach(r => {
    let i = -1, n = 0;
    while ((i = r.text.indexOf(skill, i + 1)) >= 0 && n < 3) {
      const a = Math.max(0, i - 220), z = Math.min(r.text.length, i + skill.length + 380);
      const ex = r.text.slice(a, z);
      found.push({ source: r.source, n: r.n, text: (a > 0 ? '…' : '') + ex + (z < r.text.length ? '…' : ''), score: place && place.length >= 2 && ex.indexOf(place) >= 0 ? 2 : (place && place.length >= 2 && r.text.indexOf(place) >= 0 ? 1 : 0) });
      i += 300; n++;
    }
  });
  return found.sort((x, y) => y.score - x.score).slice(0, max || 3);
}
function kRoll(b) {
  const rv = getConf('resetVer') || '0';
  const skill = txt(b.skill, 40), place = txt(b.place, 60), memo = txt(b.text, 1000), level = LEVELS.indexOf(b.level) >= 0 ? b.level : '';
  if (!skill) return { ok: false, error: '기술 이름을 적어 주세요' };
  const kb = kbRead();
  const norm = x => String(x || '').replace(/\s+/g, '');
  const sk = norm(skill), pl = norm(place);
  const bySkill = kb.rolls.filter(r => { const s = norm(r.skill); return s && (s.indexOf(sk) >= 0 || sk.indexOf(s) >= 0); });
  const here = pl ? bySkill.filter(r => { const w = norm(r.where); return w && (w.indexOf(pl) >= 0 || pl.indexOf(w) >= 0); }) : bySkill;
  const written = (here.length ? here : bySkill).map(r => Object.assign({ otherPlace: !here.length && !!pl }, pickF(r, ['id'].concat(KB_FIELDS.rolls))));
  const excerpts = ksrcFind(skill, place, 3);
  let ai = null;
  if (b.ai) {
    const rel = kbRelated(kb, [place, memo, skill].join(' '), [place], null, 5000);
    const res = parseJson(claude(
      '너는 TRPG 키퍼(게임 마스터)의 진행을 돕는 비공개 조수다. 판정 결과에 따라 플레이어에게 무엇을 줄지 제안하라. ' +
      '규칙: ① 시나리오에 적힌 판정 결과가 있으면 그것을 그대로 따르고 basis를 "scenario"로 하라. 없을 때만 자료와 어긋나지 않는 선에서 제안하고 basis를 "ai"로 하라. ' +
      '② 자료에 없는 단서나 사실을 새로 만들지 마라. ③ 이야기 진행에 꼭 필요한 단서는 실패해도 다른 길(대가를 치르거나 시간이 더 걸리는 방식)이 있게 alt에 적어라. ' +
      '④ 플레이어에게 읽어 줄 묘사는 flavor에 한두 문장으로 써라. JSON 하나만 출력하라.',
      '## 판정\n기술: ' + skill + '\n결과: ' + (level || '(미지정)') + (place ? '\n장소: ' + place : '') + (memo ? '\n상황: ' + memo : '') + '\n\n' +
      '## 시나리오에 적힌 판정 (키퍼 전용)\n' + (written.length ? JSON.stringify(written) : '(정리본에 없음)') + '\n\n' +
      '## 원문에서 찾은 대목 (키퍼 전용)\n' + (excerpts.length ? excerpts.map(e => e.text).join('\n---\n') : '(없음)') + '\n\n' +
      '## 관계있는 비공개 자료 (키퍼 전용)\n' + (rel.length ? rel.join('\n') : '(없음)') + '\n\n' +
      (b.full ? '## 사건의 진상 전체 (키퍼 전용)\n' + (kb.truth || '(없음)') + '\n\n' : '') +
      '## 방금까지의 대화 (받아쓰기)\n' + (recentTalk(20) || '(없음)') + '\n\n' +
      '## 출력 형식\n{"basis":"scenario 또는 ai","give":"이 결과에서 줄 정보","hold":"아직 주지 말 것 (없으면 빈칸)","flavor":"읽어 줄 묘사 한두 문장","alt":"실패했을 때의 다른 길 (해당 없으면 빈칸)"}', 1200));
    ai = { basis: res.basis === 'scenario' ? 'scenario' : 'ai', give: txt(res.give, 800), hold: txt(res.hold), flavor: txt(res.flavor), alt: txt(res.alt) };
  }
  klogAdd('roll', getConf('session'), skill + (level ? ' · ' + level : ''), { skill, level, place, text: memo, ai: !!b.ai }, { written: written.length, excerpts: excerpts.length, ai }, rv);
  return { ok: true, written, excerpts, ai, level };
}

/* ───────────── 진행 현황판 ───────────── */
function kBoard() {
  const rv = getConf('resetVer') || '0';
  const kb = kbRead(), notes = readNotes() || emptyNotes();
  if (!kb.clues.length && !kb.truth) return { ok: false, error: '먼저 시나리오 자료를 올려서 정리본을 만들어 주세요' };
  const sums = sheet(SH.SUM).getDataRange().getValues().slice(1).slice(-8).map(r => '[세션 ' + r[0] + ' ' + String(r[1]).slice(11, 16) + ']\n' + r[3]).join('\n\n');
  const res = parseJson(claude(
    '너는 TRPG 키퍼(게임 마스터)만 보는 진행 현황판을 만드는 조수다. 키퍼만 아는 시나리오 자료와, 플레이어들이 지금까지 알아낸 공개 기록을 비교하라. ' +
    '공개 기록에 실제로 있는 내용만 "found"로 판단하고 짐작하지 마라. 짧게 써라. JSON 하나만 출력하라.',
    '## 사건의 진상 (키퍼 전용)\n' + (kb.truth || '(없음)') + '\n\n' +
    '## 단서 목록 (키퍼 전용)\n' + JSON.stringify(kb.clues.map(c => pickF(c, ['id', 'text', 'where', 'how', 'core']))) + '\n\n' +
    '## NPC의 비밀과 거짓말 (키퍼 전용)\n' + JSON.stringify(kb.npcs.map(n => pickF(n, ['name', 'secret', 'lies']))) + '\n\n' +
    '## 공개 기록: 누적 줄거리\n' + (getConf('story') || '(없음)') + '\n\n' +
    '## 공개 기록: 플레이어 쪽에 정리된 단서\n' + JSON.stringify((notes.clues || []).map(c => pickF(c, ['text', 'kind', 'status']))) + '\n\n' +
    '## 공개 기록: 최근 요약\n' + (sums || '(없음)') + '\n\n' +
    '## 출력 형식\n{"clues":[{"id":"단서 id","status":"found|partial|unfound","note":"공개 기록의 어떤 내용과 맞는지, 또는 무엇이 빠졌는지 (40자 이내)"}],' +
    '"wrong":[{"text":"플레이어가 잘못 짚고 있는 추측","why":"실제와 어떻게 다른지"}],' +
    '"lies":[{"npc":"이름","claim":"공개 기록에 남은 그 NPC의 주장","verdict":"거짓|참|일부만 참|불명","truth":"실제는 (30자 이내)"}],' +
    '"hints":["진행이 막혔을 때 자연스럽게 줄 수 있는 힌트 (최대 3개)"],"next":"지금 키퍼가 챙기면 좋은 것 한두 문장"}\n' +
    '단서 목록의 모든 id에 대해 status를 출력하라. wrong과 lies는 공개 기록에 근거가 있는 것만 적어라.', 3500));
  const ids = new Set(kb.clues.map(c => c.id));
  const result = {
    clues: (Array.isArray(res.clues) ? res.clues : []).filter(c => c && ids.has(c.id)).map(c => ({ id: c.id, status: ['found', 'partial', 'unfound'].indexOf(c.status) >= 0 ? c.status : 'unfound', note: txt(c.note, 200) })),
    wrong: (Array.isArray(res.wrong) ? res.wrong : []).slice(0, 8).map(w => ({ text: txt(w && w.text, 300), why: txt(w && w.why, 300) })).filter(w => w.text),
    lies: (Array.isArray(res.lies) ? res.lies : []).slice(0, 15).map(l => ({ npc: txt(l && l.npc, 60), claim: txt(l && l.claim, 300), verdict: txt(l && l.verdict, 20), truth: txt(l && l.truth, 200) })).filter(l => l.claim),
    hints: arr(res.hints, 5, 300), next: txt(res.next, 500),
    basis: { processedId: Number(getConf('processedId') || 0), total: totalLines() }
  };
  klogAdd('board', getConf('session'), '현황판', null, result, rv);
  return { ok: true, board: result };
}
// 키퍼가 직접 "찾음/아직"을 표시 (AI 판단보다 우선해서 보여 준다)
function kClueMark(id, mark) {
  return withLock(20000, () => {
    const kb = kbRead(), c = kb.clues.find(x => x.id === id);
    if (!c) return { ok: false, error: '단서를 찾지 못했어요' };
    c.mark = mark === 'found' || mark === 'unfound' ? mark : '';
    kbWrite(kb);
    return { ok: true };
  });
}

/* ───────────── 다음 회차 시작 카드 (공개 기록만으로 만든다) ───────────── */
function cleanCard(c) {
  c = c || {};
  return { lastScene: txt(c.lastScene, 600), learned: arr(c.learned, 8, 300), plans: arr(c.plans, 6, 300), open: arr(c.open, 6, 300) };
}
function kRecap(session) {
  const rv = getConf('resetVer') || '0';
  session = String(session || getConf('session'));
  const sums = sessionSummaries(session, 30000);
  if (!sums.count) return { ok: false, error: '세션 ' + session + '의 요약이 아직 없어요. 먼저 "지금 바로 정리"를 눌러 주세요' };
  // publicAi 안이라 키퍼 자료를 읽을 수 없다 → 이 카드에는 진상이 들어갈 수 없다
  const res = publicAi(() => {
    const notes = readNotes() || emptyNotes();
    return parseJson(claude(
      '너는 TRPG 세션 기록 담당이다. 다음 회차를 시작할 때 플레이어들이 읽을 "지난 회차 카드"를 만든다. ' +
      '아래 기록에 있는 내용만 쓰고 지어내지 마라. "하기로 한 일"에는 플레이어들이 실제로 합의했거나 분명히 선언한 계획만 넣어라. ' +
      '한 사람의 추측, 지나가는 말, NPC의 주장은 계획이 아니다. 근거가 분명하지 않으면 그 칸은 비워라. ' +
      '항목마다 끝에, 요약에 붙어 있던 (#번호) 근거 표시를 그대로 옮겨 붙여라. JSON 하나만 출력하라.',
      '## 세션 ' + session + ' 요약\n' + sums.text + '\n\n' +
      '## 아직 풀리지 않은 단서 (플레이어 쪽 정리)\n' + ((notes.clues || []).filter(c => c.status !== '해결').map(c => '- ' + c.text).join('\n') || '(없음)') + '\n\n' +
      '## 출력 형식\n{"lastScene":"마지막 장면 한두 문장 (#번호)","learned":["알아낸 것 (#번호)"] (최대 6개),' +
      '"plans":["하기로 한 일 (#번호)"] (없으면 빈 배열),"open":["아직 갈린 의견이나 남은 의문 (#번호)"] (최대 4개)}', 1500));
  });
  const card = cleanCard(res);
  klogAdd('recap', session, '시작 카드', null, card, rv);
  return { ok: true, card, session };
}
function kRecapPublish(card, session) {
  const c = cleanCard(card);
  if (!c.lastScene && !c.learned.length && !c.plans.length) return { ok: false, error: '카드 내용이 비어 있어요' };
  return withLock(20000, () => {
    setJson('recap', Object.assign({ session: String(session || getConf('session')), at: now() }, c));
    bump('sumVer');
    return { ok: true };
  });
}

/* ───────────── 세션 통계 (AI 없이 계산) ───────────── */
function numOf(v) { const m = /-?\d+/.exec(String(v == null ? '' : v)); return m ? Number(m[0]) : null; }
function charDeltas(session) {
  const s = ensureSheet(SH.CSNAP), last = s.getLastRow();
  if (last < 2) return [];
  const by = {}, order = [];
  s.getRange(2, 1, last - 1, 9).getValues().forEach(r => {
    if (String(r[1]) !== String(session) || !r[2]) return;
    const k = String(r[2]);
    if (!by[k]) { by[k] = { tab: k, player: String(r[3]), name: String(r[4]), first: r, last: r }; order.push(k); }
    by[k].last = r; by[k].player = String(r[3]); by[k].name = String(r[4]);
  });
  const pair = (a, b2) => { const x = numOf(a), y = numOf(b2); return x == null || y == null ? null : { from: x, to: y, diff: y - x }; };
  return order.map(k => { const g = by[k]; return { tab: g.tab, player: g.player, name: g.name, hp: pair(g.first[5], g.last[5]), san: pair(g.first[6], g.last[6]), mp: pair(g.first[7], g.last[7]), luck: pair(g.first[8], g.last[8]) }; });
}
function rollRows() {
  keeperOnly('판정 기록');
  const s = ensureSheet(SH.ROLLS), last = s.getLastRow();
  if (last < 2) return [];
  return s.getRange(2, 1, last - 1, 8).getValues().map(r => ({ session: String(r[1]), name: String(r[2]).trim(), skill: String(r[3]).trim(), target: numOf(r[4]), value: numOf(r[5]), level: String(r[6]), text: String(r[7]).trim() }));
}
function rollStats(session) {
  const by = {}, order = [];
  let total = 0;
  rollRows().forEach(r => {
    if (r.session !== String(session)) return;
    total++;
    if (!by[r.name]) { by[r.name] = { name: r.name, n: 0, ok: 0, fail: 0, crit: 0, extreme: 0, hard: 0, fumble: 0, sum: 0, cnt: 0 }; order.push(r.name); }
    const p = by[r.name]; p.n++;
    if (r.level === '대실패') { p.fumble++; p.fail++; } else if (r.level === '실패') p.fail++; else p.ok++;
    if (r.level === '대성공') p.crit++; if (r.level === '극단적 성공') p.extreme++; if (r.level === '어려운 성공') p.hard++;
    if (r.value != null) { p.sum += r.value; p.cnt++; }
  });
  return { total, people: order.map(k => { const p = by[k]; return { name: p.name, n: p.n, ok: p.ok, fail: p.fail, crit: p.crit, extreme: p.extreme, hard: p.hard, fumble: p.fumble, rate: p.n ? Math.round(p.ok / p.n * 100) : 0, avg: p.cnt ? Math.round(p.sum / p.cnt) : null }; }) };
}
function sessionStats(session) {
  session = String(session);
  const keeper = getConf('keeperName') || '';
  const lines = allLineRows().filter(l => l.session === session).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.id - b.id));
  const base = { session, keeper, chars: charDeltas(session), rolls: rollStats(session) };
  if (!lines.length) return Object.assign(base, { empty: true });
  const per = {}, P = n => per[n] || (per[n] = { name: n, lines: 0, chars: 0, questions: 0, replies: 0, longest: 0, longestId: 0 });
  const t0 = tms(lines[0].time), buckets = [], gaps = [];
  let prev = null, para = null, quiet = 0;
  lines.forEach(l => {
    const p = P(l.name), t = tms(l.time), len = String(l.text).length;
    p.lines++; p.chars += len;
    if (/[?？]/.test(l.text)) p.questions++;
    if (prev) {
      const gap = t - tms(prev.time);
      if (gap >= 5 * 60000) { gaps.push({ from: prev.time, to: l.time, min: Math.round(gap / 60000) }); quiet += gap; }
      if (keeper && prev.name === keeper && l.name !== keeper && gap <= 20000) p.replies++;     // 키퍼 말을 바로 받아친 횟수
    }
    if (para && para.name === l.name && t - para.last <= 20000) { para.chars += len; para.last = t; }
    else para = { name: l.name, chars: len, last: t, id: l.id };
    if (para.chars > p.longest) { p.longest = para.chars; p.longestId = para.id; }
    const bi = Math.floor((t - t0) / 600000);
    if (bi >= 0 && bi < 200) { const bk = buckets[bi] || (buckets[bi] = {}); bk[l.name] = (bk[l.name] || 0) + len; }
    prev = l;
  });
  for (let i = 0; i < buckets.length; i++) if (!buckets[i]) buckets[i] = {};
  const people = Object.keys(per).map(k => per[k]).sort((a, b) => b.chars - a.chars);
  const total = people.reduce((a, p) => a + p.chars, 0);
  const kChars = keeper && per[keeper] ? per[keeper].chars : 0;
  const plTotal = total - kChars;
  people.forEach(p => { p.keeper = !!keeper && p.name === keeper; p.share = p.keeper ? null : (plTotal ? Math.round(p.chars / plTotal * 1000) / 10 : 0); });
  const span = tms(lines[lines.length - 1].time) - t0;
  const idle = sheet(SH.SUM).getDataRange().getValues().slice(1)
    .filter(r => String(r[0]) === session && /잡담 위주/.test(String(r[3]))).map(r => ({ from: String(r[1]), to: String(r[2]) }));
  return Object.assign(base, {
    from: lines[0].time, to: lines[lines.length - 1].time, lines: lines.length,
    minutes: Math.round(span / 60000), activeMinutes: Math.round((span - quiet) / 60000),
    total, keeperShare: total ? Math.round(kChars / total * 1000) / 10 : 0, people,
    buckets: { start: lines[0].time, step: 10, data: buckets }, gaps, idle
  });
}
function statsText(st) {
  if (st.empty) return '(대화 없음)';
  return '전체 ' + st.lines + '줄, ' + st.minutes + '분 (쉬는 시간 뺀 ' + st.activeMinutes + '분). 키퍼(' + (st.keeper || '미지정') + ') 발언 비율 ' + st.keeperShare + '%.\n' +
    '플레이어별 발언 비중(글자 수 기준): ' + st.people.filter(p => !p.keeper).map(p => p.name + ' ' + p.share + '% (' + p.lines + '줄)').join(', ') + '\n' +
    '5분 넘게 조용했던 구간: ' + (st.gaps.map(g => g.from.slice(11, 16) + '~' + g.to.slice(11, 16)).join(', ') || '없음') + '\n' +
    '잡담 위주로 요약된 구간: ' + (st.idle.map(g => g.from.slice(11, 16) + '~' + g.to.slice(11, 16)).join(', ') || '없음');
}

/* ───────────── 코코포리아 판정 로그 ─────────────
 * 화면(브라우저)이 로그 HTML에서 1D100 판정만 골라 보내 준다. 로그에는 시각이 없어서,
 * "예전에 올린 것 다음부터가 이번 세션"이라고 본다 (mode auto). 로그 앞부분이 예전과 다르면 화면이 어떻게 할지 묻는다. */
function kRollsSave(b) {
  const session = /^\d{1,5}$/.test(String(b.session || '')) ? String(b.session) : (getConf('session') || '1');
  const mode = ['auto', 'append', 'replace'].indexOf(b.mode) >= 0 ? b.mode : 'auto';
  const rolls = (Array.isArray(b.rolls) ? b.rolls : []).slice(0, 5000).map(r => ({
    name: txt(r && r.name, 60).replace(/^[=+@']+/, ''), skill: txt(r && r.skill, 60), target: numOf(r && r.target), value: numOf(r && r.value),
    level: LEVELS.indexOf(r && r.level) >= 0 ? r.level : '', text: txt(r && r.text, 300)
  })).filter(r => r.name && r.level);
  if (!rolls.length) return { ok: false, error: '로그에서 1D100 판정을 찾지 못했어요' };
  return withLock(30000, () => {
    const s = ensureSheet(SH.ROLLS), old = rollRows();
    let add = rolls;
    if (mode === 'replace') { if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1); }
    else if (mode === 'auto') {
      const same = old.length <= rolls.length && old.every((o, i) => o.name === rolls[i].name && o.text === rolls[i].text);
      if (!same) return { ok: false, mismatch: true, stored: old.length, found: rolls.length, error: '이 로그의 앞부분이 예전에 올린 판정 기록과 달라요 (코코포리아 로그를 지웠거나 다른 방 로그일 수 있어요)' };
      add = rolls.slice(old.length);
    }
    const start = mode === 'replace' ? 0 : old.length;
    if (add.length) {
      const rows = add.map((r, i) => [String(start + i + 1), session, safeCell(r.name), safeCell(r.skill), r.target == null ? '' : String(r.target), r.value == null ? '' : String(r.value), r.level, safeCell(r.text)]);
      s.getRange(s.getLastRow() + 1, 1, rows.length, 8).setNumberFormat('@').setValues(rows);
    }
    return { ok: true, added: add.length, total: start + add.length, session };
  });
}

/* ───────────── 시상식 ───────────── */
function kAwards(session, useTruth) {
  const rv = getConf('resetVer') || '0';
  session = String(session || getConf('session'));
  const sums = sessionSummaries(session, 40000);
  if (!sums.count) return { ok: false, error: '세션 ' + session + '의 요약이 아직 없어요' };
  const kb = useTruth ? kbRead() : null;
  const res = parseJson(claude(
    '너는 TRPG 세션이 끝난 뒤 여는 "시상식"의 후보를 뽑는 조수다. 세션 요약을 읽고 플레이어의 활약 장면을 찾아라. ' +
    '규칙: ① 요약에 실제로 있는 일만 쓰고, text 끝에 근거 발언 번호 (#번호)를 반드시 붙여라. 근거가 없으면 후보에서 빼라. ' +
    '② 말을 많이 한 사람이 유리하지 않게, 결정적인 한마디나 행동을 찾아라. 플레이어마다 한 장면 이상 찾으려고 노력하되 없으면 지어내지 마라. ' +
    '③ title과 text는 플레이어에게 공개될 수 있다. 플레이어가 아직 모르는 진상·비밀은 title과 text에 절대 쓰지 마라. 진상과 견준 평가는 kNote에만 써라. ' +
    '④ 놀리거나 깎아내리는 상은 만들지 마라. JSON 하나만 출력하라.',
    '## 플레이어 = 캐릭터\n' + (charsText() || '(연결된 캐릭터 없음: 요약에 나온 이름을 그대로 써라)') + '\n\n' +
    (kb ? '## 사건의 진상과 핵심 단서 (키퍼 전용, kNote에만 활용)\n' + (kb.truth || '(없음)') + '\n' + JSON.stringify(kb.clues.filter(c => c.core).map(c => pickF(c, ['text', 'where']))) + '\n\n' : '') +
    '## 세션 ' + session + ' 요약\n' + sums.text + '\n\n' +
    '## 출력 형식\n{"highlights":[{"category":"핵심 단서 발견|결정적 추리|위기를 넘긴 행동|정보를 끌어낸 대화|명장면","player":"플레이어 이름","character":"캐릭터 이름",' +
    '"title":"상 이름 (재치 있게, 14자 이내)","text":"무슨 일이 있었는지 한두 문장 (#번호)","kNote":"키퍼만 보는 메모 (없으면 빈칸)"}]} (최대 8개)', 2500));
  const highlights = (Array.isArray(res.highlights) ? res.highlights : []).slice(0, 8).map(h => ({
    category: txt(h && h.category, 30), player: txt(h && h.player, 40), character: txt(h && h.character, 40), title: txt(h && h.title, 40), text: txt(h && h.text, 400), kNote: txt(h && h.kNote, 400)
  })).filter(h => h.text && /#\d+/.test(h.text));          // 근거 번호가 없는 후보는 버린다
  klogAdd('awards', session, '시상식 후보', { useTruth: !!useTruth }, { highlights }, rv);
  return { ok: true, highlights, session };
}
// 공개: 키퍼가 고른 항목의 제목·받는 사람·설명만 저장한다 (키퍼 메모는 받지 않는다)
function kAwardsPublish(session, items) {
  const list = (Array.isArray(items) ? items : []).slice(0, 12).map(x => ({ title: txt(x && x.title, 40), winner: txt(x && x.winner, 60), text: txt(x && x.text, 400) })).filter(x => x.title && x.winner);
  if (!list.length) return { ok: false, error: '공개할 항목을 하나 이상 골라 주세요' };
  return withLock(20000, () => {
    setJson('awards', { session: String(session || getConf('session')), at: now(), items: list });
    bump('sumVer');
    return { ok: true, count: list.length };
  });
}

/* ───────────── 마스터링 피드백 (키퍼만 봄) ───────────── */
function kFeedback(session) {
  const rv = getConf('resetVer') || '0';
  session = String(session || getConf('session'));
  const sums = sessionSummaries(session, 40000);
  if (!sums.count) return { ok: false, error: '세션 ' + session + '의 요약이 아직 없어요' };
  const st = sessionStats(session), kb = kbRead();
  const res = parseJson(claude(
    '너는 TRPG 키퍼(게임 마스터)가 자기 진행을 돌아보는 것을 돕는 조수다. 이 피드백은 키퍼만 본다. ' +
    '규칙: ① 키퍼의 진행(정보 전달, 속도 조절, 플레이어에게 기회를 나눠 주는 방식)만 다루고 플레이어 개인을 평가하지 마라. ' +
    '② 모든 항목은 요약에 있는 구체적인 장면을 근거로 하고 text 끝에 (#번호)를 붙여라. 근거 없는 말이나 "몰입감이 좋았다" 같은 두루뭉술한 말은 쓰지 마라. ' +
    '③ 받아쓰기 기록이라 목소리·분위기·연기는 알 수 없다. 그런 평가는 하지 마라. ' +
    '④ 아쉬운 점에는 다음에 해 볼 구체적인 방법(tip)을 붙여라. 듣기 좋은 말보다 쓸모 있는 말을 하라. JSON 하나만 출력하라.',
    '## 숫자 (받아쓰기에서 계산)\n' + statsText(st) + '\n\n' +
    '## 시나리오 자료 (키퍼 전용)\n진상: ' + (kb.truth || '(없음)') + '\n핵심 단서: ' + JSON.stringify(kb.clues.filter(c => c.core).map(c => pickF(c, ['text', 'where', 'how']))) + '\n장면 흐름: ' + JSON.stringify(kb.scenes.map(s => s.title)) + '\n\n' +
    '## 세션 ' + session + ' 요약 (시각 포함)\n' + sums.text + '\n\n' +
    '## 출력 형식\n{"good":[{"text":"잘된 진행 (#번호)"}] (최대 4개),"improve":[{"text":"아쉬운 진행 (#번호)","tip":"다음에 해 볼 방법"}] (최대 4개),' +
    '"scenes":[{"name":"장면·장소","from":"HH:MM","to":"HH:MM","note":"빨랐는지 막혔는지 한마디"}] (최대 10개),' +
    '"clues":[{"clue":"핵심 단서","status":"전달됨|일부|아직","when":"HH:MM (모르면 빈칸)"}],' +
    '"spotlight":"플레이어별 비중에 대한 한두 문장 (위 숫자를 근거로)","next":["다음 회차에 해 볼 것"] (최대 3개)}', 3000));
  const ev = x => /#\d+/.test(x);
  const result = {
    good: (Array.isArray(res.good) ? res.good : []).map(g => ({ text: txt(g && g.text, 500) })).filter(g => g.text && ev(g.text)).slice(0, 4),
    improve: (Array.isArray(res.improve) ? res.improve : []).map(g => ({ text: txt(g && g.text, 500), tip: txt(g && g.tip, 400) })).filter(g => g.text && ev(g.text)).slice(0, 4),
    scenes: (Array.isArray(res.scenes) ? res.scenes : []).slice(0, 10).map(s => ({ name: txt(s && s.name, 60), from: txt(s && s.from, 5), to: txt(s && s.to, 5), note: txt(s && s.note, 200) })).filter(s => s.name),
    clues: (Array.isArray(res.clues) ? res.clues : []).slice(0, 20).map(c => ({ clue: txt(c && c.clue, 200), status: txt(c && c.status, 10), when: txt(c && c.when, 5) })).filter(c => c.clue),
    spotlight: txt(res.spotlight, 500), next: arr(res.next, 3, 300)
  };
  klogAdd('feedback', session, '피드백', null, result, rv);
  return { ok: true, feedback: result, stats: st, session };
}
