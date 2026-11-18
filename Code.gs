/****************************************************************
 * TRPG 세션 기록 보조 — 구글 시트 스크립트
 *
 * 1) 아래 네 줄에 키와 비밀번호를 넣는다. (따옴표 '' 안에)
 * 2) 위쪽 함수 선택에서 setup 을 고르고 ▶실행 (권한 허용).
 * 3) 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포.
 *    코드를 고친 뒤에는 배포 → 배포 관리 → 연필 → 새 버전 → 배포.
 ****************************************************************/
const CLAUDE_KEY   = '여기에_클로드_API_키';
const DEEPGRAM_KEY = '여기에_딥그램_API_키';
const ROOM_PW      = '방비밀번호';      // 플레이어 모두가 아는 비밀번호
const KEEPER_PW    = '키퍼비밀번호';    // 키퍼만 아는 비밀번호

const MODEL = 'claude-sonnet-5-5';
const TZ = 'Asia/Seoul';

const SH = { CONF: '설정', LINES: '대화', SUM: '요약', NOTES: '정리', CHAR: '캐릭터', IMG: '이미지' };
const SECTIONS = ['places', 'npcs', 'clues', 'handouts'];

/* ───────────── 설치 ───────────── */
function setup() {
  const ss = SpreadsheetApp.getActive();
  const make = (name, header) => {
    let s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name);
    if (header && s.getLastRow() === 0) s.appendRow(header);
    return s;
  };
  make(SH.CONF, ['키', '값']);
  make(SH.LINES, ['번호', '시각', '세션', '이름', '말']);
  make(SH.SUM, ['세션', '시작', '끝', '요약', '만든 시각']);
  make(SH.NOTES, ['정리 JSON (자동)']);
  make(SH.CHAR, ['탭', '플레이어', '카드 JSON', '해시', '갱신', '초상화 주소', '초상화 원본']);
  make(SH.IMG, ['시각', '세션', '파일ID', '주소', '분석 JSON']);
  // 시각·세션이 날짜/숫자로 자동 변환되지 않게 글자 형식으로 고정
  ss.getSheetByName(SH.LINES).getRange('B:C').setNumberFormat('@');
  ss.getSheetByName(SH.SUM).getRange('A:C').setNumberFormat('@');
  ss.getSheetByName(SH.SUM).getRange('E:E').setNumberFormat('@');
  ss.getSheetByName(SH.IMG).getRange('A:B').setNumberFormat('@');

  const defaults = {
    session: '1', processedId: '0', story: '', notesVer: '1', charVer: '1', imgVer: '1', sumVer: '1',
    glossary: '요그소토스, 틴달로스의 사냥개, 크툴루, 니알라토텝, 아자토스, 슈브니구라스, 네크로노미콘, 이성 판정',
    charUrl: '', charMap: '[]', lastCharCheck: '0', keeperName: '', resetVer: '1', colors: '{}', corrections: '[]'
  };
  Object.keys(defaults).forEach(k => { if (getConf(k) === null) setConf(k, defaults[k]); });
  if (!readNotes()) writeNotes(emptyNotes());

  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();

  // 외부 요청·캐시 권한을 미리 받아 두기 위한 호출
  UrlFetchApp.fetch('https://api.anthropic.com', { muteHttpExceptions: true });
  CacheService.getScriptCache().put('setup', '1', 60);
  Logger.log('설치 완료. 이제 웹 앱으로 배포하세요.');
}

/* ───────────── 설정 저장소 ───────────── */
function confSheet() { return SpreadsheetApp.getActive().getSheetByName(SH.CONF); }
function getConf(key) {
  const v = confSheet().getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === key) return String(v[i][1]);
  return null;
}
function setConf(key, val) {
  const s = confSheet(), v = s.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === key) { s.getRange(i + 1, 2).setValue(val); return; }
  s.appendRow([key, val]);
}
function bump(key) { setConf(key, String(Number(getConf(key) || 0) + 1)); }
function confJson(key, fallback) { try { const v = getConf(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
function now() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }

/* ───────────── 정리(장소·NPC·단서·핸드아웃) ───────────── */
function emptyNotes() { return { places: [], npcs: [], clues: [], handouts: [], deleted: {} }; }
function newId() { return 'n' + Utilities.getUuid().replace(/-/g, '').slice(0, 10); }
function itemKey(sec, x) {
  const k = sec === 'clues' ? x.text : sec === 'handouts' ? x.title : x.name;
  return String(k || '').replace(/\s+/g, '').toLowerCase();
}
function readNotes() {
  const v = SpreadsheetApp.getActive().getSheetByName(SH.NOTES).getRange('A2').getValue();
  try {
    if (!v) return null;
    const n = JSON.parse(v);
    SECTIONS.forEach(s => { n[s] = (n[s] || []).map(x => (x.id ? x : Object.assign({ id: newId() }, x))); });
    n.deleted = n.deleted || {};
    return n;
  } catch (e) { return null; }
}
function writeNotes(n) {
  SpreadsheetApp.getActive().getSheetByName(SH.NOTES).getRange('A2').setValue(JSON.stringify(n));
}
// AI에게 보낼 때: 사람이 확정한(locked) 항목은 표시만 하고 지운 항목 목록도 알려 준다
function notesForAi(n) {
  const o = {};
  SECTIONS.forEach(s => { o[s] = (n[s] || []).map(x => { const y = Object.assign({}, x); return y; }); });
  o.deleted = n.deleted || {};
  return JSON.stringify(o);
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
      const k = itemKey(sec, x);
      let i = (x.id && byId[x.id] != null) ? byId[x.id] : (k && byKey[k] != null ? byKey[k] : -1);
      if (i >= 0) {
        if (res[i].locked && !human) return;             // 사람이 고친 항목은 그대로 (정정 요청일 때만 바꿈)
        res[i] = Object.assign({}, res[i], x, { id: res[i].id, locked: !!(human && res[i].locked) });
        return;
      }
      if (!k || dead.has(k)) return;                      // 이름 없음, 또는 사람이 지운 대상
      const item = Object.assign({}, x, { id: newId(), locked: false });
      res.push(item); byId[item.id] = res.length - 1; byKey[k] = res.length - 1;
    });
    outN[sec] = res;
  });
  return outN;
}
function saveAiNotes(aiNotes, human) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try { writeNotes(mergeNotes(readNotes(), aiNotes, human)); bump('notesVer'); }
  finally { lock.releaseLock(); }
}

function noteSave(sec, item) {
  if (SECTIONS.indexOf(sec) < 0 || !item) return { ok: false, error: '잘못된 항목' };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const n = readNotes() || emptyNotes();
    const clean = {};
    ['name', 'desc', 'found', 'traits', 'said', 'relation', 'text', 'status', 'title', 'img', 'age', 'affil'].forEach(k => { if (item[k] != null) clean[k] = String(item[k]).slice(0, 4000); });
    clean.locked = true; clean.editedAt = now();
    const i = item.id ? n[sec].findIndex(x => x.id === item.id) : -1;
    if (i >= 0) n[sec][i] = Object.assign({ id: item.id }, clean);
    else n[sec].push(Object.assign({ id: newId() }, clean));
    const key = itemKey(sec, clean);
    if (n.deleted[sec]) n.deleted[sec] = n.deleted[sec].filter(k => k !== key);
    writeNotes(n); bump('notesVer');
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function noteDelete(sec, id) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const n = readNotes() || emptyNotes();
    const it = (n[sec] || []).find(x => x.id === id);
    if (!it) return { ok: false, error: '이미 지워졌어요' };
    n[sec] = n[sec].filter(x => x.id !== id);
    n.deleted[sec] = (n.deleted[sec] || []).concat([itemKey(sec, it)]).slice(-200);
    writeNotes(n); bump('notesVer');
    return { ok: true };
  } finally { lock.releaseLock(); }
}
function noteImage(sec, id, data) {
  if (!data) return { ok: false, error: '사진이 없어요' };
  const url = storePortrait(Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', 'n.jpg'), 'note_' + sec + '_' + Date.now());
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const n = readNotes() || emptyNotes();
    const it = (n[sec] || []).find(x => x.id === id);
    if (!it) return { ok: false, error: '항목을 찾지 못했어요' };
    it.img = url; it.locked = true; it.editedAt = now();
    writeNotes(n); bump('notesVer');
    return { ok: true, url };
  } finally { lock.releaseLock(); }
}
function noteUnlock(sec, id) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const n = readNotes() || emptyNotes();
    (n[sec] || []).forEach(x => { if (x.id === id) x.locked = false; });
    writeNotes(n); bump('notesVer');
    return { ok: true };
  } finally { lock.releaseLock(); }
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

function doGet(e) {
  const p = e.parameter || {};
  try {
    if (p.pw !== ROOM_PW && p.pw !== KEEPER_PW) return out({ ok: false, error: '방 비밀번호가 틀렸어요' });
    switch (p.action) {
      case 'poll':
        try { touchPresence(p.me, p.mic); } catch (err) {}
        return out(poll(Number(p.since || 0)));
      case 'data':  return out(allData());
      case 'token': return out(deepgramToken());
      case 'tabs':
        if (p.pw !== KEEPER_PW) return out({ ok: false, error: '키퍼 비밀번호가 필요해요' });
        return out(listTabs(p.url));
      case 'ping':  return out({ ok: true, keeper: p.pw === KEEPER_PW });
    }
    return out({ ok: false, error: '알 수 없는 요청' });
  } catch (err) { return out({ ok: false, error: String(err) }); }
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: '잘못된 요청' }); }
  try {
    if (b.pw !== ROOM_PW && b.pw !== KEEPER_PW) return out({ ok: false, error: '방 비밀번호가 틀렸어요' });
    // ── 플레이어 누구나
    switch (b.action) {
      case 'lines':      return out(addLines(b.name, b.items));
      case 'glossary':   setConf('glossary', String(b.glossary || '').slice(0, 5000)); bump('notesVer'); return out({ ok: true });
      case 'color':      return out(saveColor(b.name, b.color));
      case 'noteSave':   return out(noteSave(b.sec, b.item));
      case 'noteDelete': return out(noteDelete(b.sec, b.id));
      case 'noteUnlock': return out(noteUnlock(b.sec, b.id));
      case 'noteImage':  return out(noteImage(b.sec, b.id, b.data));
      case 'sumSave':    return out(sumSave(b.id, b.text));
      case 'storySave':  setConf('story', String(b.text || '').slice(0, 20000)); bump('sumVer'); return out({ ok: true });
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
      case 'keeperName': setConf('keeperName', String(b.name || '').trim()); bump('notesVer'); return out({ ok: true });
      case 'clearLog':   return out(clearLog(false));
      case 'resetAll':   return out(clearLog(true));
    }
    return out({ ok: false, error: '알 수 없는 요청' });
  } catch (err) { return out({ ok: false, error: String(err) }); }
}

/* ───────────── 받아쓰기 ───────────── */
function addLines(name, items) {
  if (!name || !Array.isArray(items) || !items.length) return { ok: true, added: 0 };
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const s = SpreadsheetApp.getActive().getSheetByName(SH.LINES);
    const session = getConf('session');
    let id = s.getLastRow() - 1;
    const rows = items.slice(0, 200).map(it => {
      id++;
      const t = it.t ? new Date(it.t) : new Date();
      return [id, Utilities.formatDate(t, TZ, 'yyyy-MM-dd HH:mm:ss'), session, String(name).slice(0, 40), String(it.text || '').slice(0, 2000)];
    });
    s.getRange(s.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
    return { ok: true, added: rows.length };
  } finally { lock.releaseLock(); }
}

function readLines(sinceId, maxRows) {
  const s = SpreadsheetApp.getActive().getSheetByName(SH.LINES);
  const last = s.getLastRow();
  const firstRow = sinceId + 2; // 번호 n 은 n+1 행
  if (firstRow > last) return [];
  let n = last - firstRow + 1;
  if (maxRows && n > maxRows) n = maxRows;
  return s.getRange(firstRow, 1, n, 5).getValues()
    .map(r => ({ id: r[0], time: String(r[1]), session: String(r[2]), name: r[3], text: r[4] }));
}

function versions() {
  return {
    session: getConf('session'), sumVer: getConf('sumVer'), notesVer: getConf('notesVer'),
    charVer: getConf('charVer'), imgVer: getConf('imgVer'), resetVer: getConf('resetVer') || '0',
    colorVer: getConf('colorVer') || '0', processedId: Number(getConf('processedId'))
  };
}

function poll(since) {
  // 처음 접속이면 최근 300줄만
  if (since <= 0) {
    const total = SpreadsheetApp.getActive().getSheetByName(SH.LINES).getLastRow() - 1;
    since = Math.max(0, total - 300);
  }
  const lines = readLines(since, 500);
  let who = [];
  try { who = presence(); } catch (e) {}
  return { ok: true, v: versions(), lines, presence: who };
}

function allData() {
  const ss = SpreadsheetApp.getActive();
  const sums = ss.getSheetByName(SH.SUM).getDataRange().getValues().slice(1)
    .map((r, i) => ({ id: i + 2, session: String(r[0]), from: String(r[1]), to: String(r[2]), text: r[3] }));
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
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const c = confJson('colors', {}); c[String(name).slice(0, 40)] = color;
    setConf('colors', JSON.stringify(c)); bump('colorVer');
    return { ok: true };
  } finally { lock.releaseLock(); }
}

function sumSave(id, text) {
  const s = SpreadsheetApp.getActive().getSheetByName(SH.SUM);
  id = Number(id);
  if (!id || id < 2 || id > s.getLastRow()) return { ok: false, error: '요약을 찾지 못했어요' };
  s.getRange(id, 4).setValue(String(text || '').slice(0, 20000));
  bump('sumVer');
  return { ok: true };
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
  SpreadsheetApp.getActive().getSheetByName(SH.CHAR).getDataRange().getValues().slice(1).forEach(r => {
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
  return j.content.filter(c => c.type === 'text').map(c => c.text).join('');
}
function parseJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error('JSON을 찾지 못함');
  return JSON.parse(text.slice(a, b + 1));
}

/* ───────────── 5분마다 ───────────── */
function tick() {
  try { processNow(false); } catch (e) { Logger.log(e); }
  try { if (Date.now() - Number(getConf('lastCharCheck') || 0) > 30 * 60 * 1000) refreshCharacters(false); } catch (e) { Logger.log(e); }
}

const NOTES_RULE =
  '정리(notes) 규칙: places=[{id,name,desc,found}] 장소와 거기서 일어난 일·발견한 것, ' +
  'npcs=[{id,name,affil,age,traits,said,relation}] NPC의 소속·직업(affil), 나이(age, 언급됐을 때만), 특징(쉼표로 구분한 짧은 말들), 가장 인상적인 대사 한두 개(said), 탐사자들과의 관계, ' +
  'clues=[{id,text,status}] 얻은 정보와 단서, status는 "미해결" 또는 "해결", ' +
  'handouts=[{id,title,text}] 핸드아웃 내용. ' +
  '기존 항목은 id를 그대로 유지하고, 새 항목은 id를 비워라. 바뀐 항목과 새 항목만 출력하면 되고, 바뀌지 않은 항목은 출력하지 않아도 남는다. 같은 대상을 새 항목으로 또 만들지 말고 기존 id에 보강하라. ' +
  '"locked":true 인 항목은 사람이 직접 확정한 내용이니 출력하지 말고 건드리지 마라. ' +
  'deleted 목록에 있는 대상은 사람이 지운 것이니 다시 만들지 마라. 확실하지 않은 내용은 추측이라고 표시하라.';

function keeperRules() {
  return '가장 중요한 원칙: 키퍼의 발언은 이야기의 정보 그 자체다. 키퍼가 말한 묘사, NPC 대사, 장소·물건·단서 정보, 판정 요구와 그 결과는 ' +
    '문장을 다듬어 줄이더라도 내용은 하나도 빠뜨리지 말고 요약과 정리에 담아라. 플레이어 발언은 행동과 결정 위주로 줄여도 된다. ';
}
function correctionsText() {
  const c = confJson('corrections', []);
  return c.length ? c.map(x => '- ' + x.text).join('\n') : '(없음)';
}
function charsText() {
  return SpreadsheetApp.getActive().getSheetByName(SH.CHAR).getDataRange().getValues().slice(1)
    .map(r => { try { const c = JSON.parse(r[2] || '{}'); return (r[1] || '?') + ' = ' + (c.name || r[0]); } catch (e) { return ''; } })
    .filter(Boolean).join('\n');
}

function processNow(manual) {
  // 받아쓰기 저장(스크립트 잠금)을 막지 않도록 문서 잠금을 따로 쓴다
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) return { ok: false, error: '이미 정리 중이에요' };
  try {
    const processed = Number(getConf('processedId') || 0);
    const lines = readLines(processed, 1500);
    if (!lines.length) return { ok: true, message: '새로 정리할 대화가 없어요' };
    const transcript = lines.map(l => '[' + l.time.slice(11) + '] ' + l.name + ': ' + l.text).join('\n');

    const system =
      '너는 한국어 TRPG(주로 크툴루의 부름) 세션의 기록 담당이다. 음성 받아쓰기라서 단어가 잘못 적혀 있을 수 있다. ' +
      '용어집·캐릭터 이름·앞뒤 맥락으로 잘못 들린 고유명사를 바로잡고, 의미 없는 조각은 무시하라. ' +
      '플레이어 잡담(규칙 질문, 농담, 현실 이야기)과 캐릭터로서의 행동·대사를 구분해서, 요약은 이야기 안의 일을 중심으로 캐릭터 이름으로 써라. ' +
      '판정 결과(성공/실패, 이성·체력 변화)는 말로 언급된 것만 적어라. 없는 일을 지어내지 마라. ' +
      keeperRules() + '정정 메모는 사람이 바로잡아 준 사실이니 반드시 따르라. 반드시 JSON 하나만 출력하라.';
    const user =
      '## 키퍼 이름\n' + (getConf('keeperName') || '(미지정: 상황 묘사와 NPC 대사를 하는 사람이 키퍼다)') + '\n\n' +
      '## 용어집\n' + getConf('glossary') + '\n\n' +
      '## 플레이어 = 캐릭터\n' + (charsText() || '(아직 없음)') + '\n\n' +
      '## 정정 메모 (반드시 따를 것)\n' + correctionsText() + '\n\n' +
      '## 지금까지의 누적 줄거리\n' + (getConf('story') || '(처음)') + '\n\n' +
      '## 현재 정리(notes)\n' + notesForAi(readNotes() || emptyNotes()) + '\n\n' +
      '## 새로 들어온 대화 (세션 ' + getConf('session') + ')\n' + transcript + '\n\n' +
      '## 출력 형식\n' +
      '{"summary":"새 대화 구간의 요약. 시간순으로 \\"- \\"로 시작하는 줄들. 키퍼가 준 정보는 모두 포함 (줄 수 제한 없음)",' +
      '"story":"세션 시작부터 지금까지 누적 줄거리를 갱신한 것 (2500자 이내, 중요한 사건 위주)",' +
      '"notes":{"places":[],"npcs":[],"clues":[],"handouts":[]}}\n' + NOTES_RULE +
      '\n새 대화에 이야기 진행이 거의 없으면 summary는 "- (잡담 위주, 진행 없음)"으로 하고 notes는 생략하라.';

    const res = parseJson(claude(system, user, 8000));
    const s = SpreadsheetApp.getActive().getSheetByName(SH.SUM);
    s.appendRow([getConf('session'), lines[0].time, lines[lines.length - 1].time, res.summary || '', now()]);
    if (res.story) setConf('story', res.story);
    if (res.notes) saveAiNotes(res.notes);
    setConf('processedId', String(lines[lines.length - 1].id));
    bump('sumVer');
    return { ok: true, message: lines.length + '줄을 정리했어요' };
  } finally { lock.releaseLock(); }
}

function newSession() {
  try { processNow(true); } catch (e) {}
  setConf('session', String(Number(getConf('session') || 1) + 1));
  bump('sumVer');
  return { ok: true, session: getConf('session') };
}

/* ───────────── AI에게 정정 요청 ───────────── */
function correct(text, who) {
  text = String(text || '').trim();
  if (!text) return { ok: false, error: '정정할 내용을 적어 주세요' };
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(30000)) return { ok: false, error: '지금 정리 중이에요. 잠시 뒤 다시 눌러 주세요' };
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(SH.SUM);
    const rows = sh.getDataRange().getValues().slice(1).map((r, i) => ({ id: i + 2, session: String(r[0]), text: r[3] }));
    const recent = rows.slice(-12);
    const system = '너는 TRPG 세션 기록 담당이다. 사람이 기록의 잘못된 부분을 정정해 달라고 했다. ' +
      '요청에 맞게 누적 줄거리, 요약, 정리를 고쳐라. 이번에는 locked 항목도 요청과 관계있으면 고쳐도 된다. 요청과 관계없는 부분은 바꾸지 마라. JSON 하나만 출력하라.';
    const user =
      '## 정정 요청 (' + (who || '플레이어') + ')\n' + text + '\n\n' +
      '## 기존 정정 메모\n' + correctionsText() + '\n\n' +
      '## 플레이어 = 캐릭터\n' + (charsText() || '(없음)') + '\n\n' +
      '## 누적 줄거리\n' + (getConf('story') || '(없음)') + '\n\n' +
      '## 최근 요약들\n' + recent.map(r => '[id ' + r.id + ', 세션 ' + r.session + ']\n' + r.text).join('\n\n') + '\n\n' +
      '## 현재 정리(notes)\n' + notesForAi(readNotes() || emptyNotes()) + '\n\n' +
      '## 출력 형식\n{"reply":"무엇을 고쳤는지 한두 문장","memo":"앞으로 기억해야 할 정정 사실 한 줄 (없으면 빈칸)",' +
      '"story":"고친 누적 줄거리 (바꿀 게 없으면 빈칸)","summaries":[{"id":숫자,"text":"고친 요약 전문"}] (고친 것만),' +
      '"notes":{"places":[],"npcs":[],"clues":[],"handouts":[]} (고칠 게 없으면 생략)}\n' + NOTES_RULE;
    const res = parseJson(claude(system, user, 8000));
    if (res.story) setConf('story', res.story);
    (res.summaries || []).forEach(x => { const id = Number(x.id); if (id >= 2 && id <= sh.getLastRow() && x.text) sh.getRange(id, 4).setValue(x.text); });
    if (res.notes) saveAiNotes(res.notes, true);
    if (res.memo) {
      const c = confJson('corrections', []);
      c.push({ text: String(res.memo).slice(0, 300), by: who || '', at: now() });
      setConf('corrections', JSON.stringify(c.slice(-40)));
    }
    bump('sumVer');
    return { ok: true, reply: res.reply || '고쳤어요' };
  } finally { lock.releaseLock(); }
}

/* ───────────── 캐릭터시트 ───────────── */
function listTabs(url) {
  const ss = SpreadsheetApp.openByUrl(url);
  return { ok: true, tabs: ss.getSheets().map(s => s.getName()) };
}

function saveCharConfig(url, map) {
  setConf('charUrl', String(url || ''));
  setConf('charMap', JSON.stringify(Array.isArray(map) ? map : []));
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
  const cs = SpreadsheetApp.getActive().getSheetByName(SH.CHAR);
  const v = cs.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === tab) {
    const url = storePortrait(Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', 'p.jpg'), 'portrait_' + tab + '_' + Date.now());
    cs.getRange(i + 1, 6, 1, 2).setValues([[url, 'manual']]);
    bump('charVer');
    return { ok: true, url };
  }
  return { ok: false, error: '캐릭터를 찾지 못했어요' };
}

function refreshCharacters(force) {
  setConf('lastCharCheck', String(Date.now()));
  const url = getConf('charUrl'); const map = confJson('charMap', []);
  const cs = SpreadsheetApp.getActive().getSheetByName(SH.CHAR);
  if (!url || !map.length) {
    if (cs.getLastRow() > 1) cs.deleteRows(2, cs.getLastRow() - 1);
    bump('charVer');
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
  if (cs.getLastRow() > 1) cs.getRange(2, 1, cs.getLastRow() - 1, 7).clearContent();
  if (rows.length) cs.getRange(2, 1, rows.length, 7).setValues(rows);
  if (changed || force) bump('charVer');
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
  SpreadsheetApp.getActive().getSheetByName(SH.IMG).appendRow([
    now(), getConf('session'), file.getId(), url,
    JSON.stringify({ title: res.title || '', text: res.text || '', description: res.description || '' })
  ]);
  if (res.notes) saveAiNotes(res.notes);
  bump('imgVer');
  return { ok: true, title: res.title || '' };
}

/* ───────────── 지우기 (키퍼) ───────────── */
function clearLog(all) {
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  const dlock = LockService.getDocumentLock(); dlock.waitLock(60000);
  try {
    const ss = SpreadsheetApp.getActive();
    const wipe = name => { const s = ss.getSheetByName(name); if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1); };
    wipe(SH.LINES); wipe(SH.SUM);
    setConf('processedId', '0'); setConf('story', '');
    if (all) {
      wipe(SH.IMG);
      writeNotes(emptyNotes());
      setConf('session', '1'); setConf('corrections', '[]');
      bump('imgVer'); bump('notesVer');
    }
    bump('sumVer'); bump('resetVer');
    return { ok: true, message: all ? '전체 초기화했어요 (캐릭터 연결·용어집·이름 색은 그대로)' : '회의록과 요약을 지웠어요' };
  } finally { dlock.releaseLock(); lock.releaseLock(); }
}
