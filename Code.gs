/****************************************************************
 * TRPG 세션 기록 보조 — 구글 시트 스크립트
 *
 * 1) 아래 네 줄에 키와 비밀번호를 넣는다.
 * 2) 위쪽 함수 선택에서 setup 을 고르고 ▶실행 (권한 허용).
 * 3) 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포.
 ****************************************************************/
const CLAUDE_KEY   = '여기에_클로드_API_키';
const DEEPGRAM_KEY = '여기에_딥그램_API_키';
const ROOM_PW      = '방비밀번호';      // 플레이어 모두가 아는 비밀번호
const KEEPER_PW    = '키퍼비밀번호';    // 키퍼만 아는 비밀번호

const MODEL = 'claude-sonnet-5-5';
const TZ = 'Asia/Seoul';

const SH = { CONF: '설정', LINES: '대화', SUM: '요약', NOTES: '정리', CHAR: '캐릭터', IMG: '이미지' };

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
  make(SH.CHAR, ['탭', '플레이어', '카드 JSON', '해시', '갱신']);
  make(SH.IMG, ['시각', '세션', '파일ID', '주소', '분석 JSON']);
  // 시각·세션이 날짜/숫자로 자동 변환되지 않게 글자 형식으로 고정
  ss.getSheetByName(SH.LINES).getRange('B:C').setNumberFormat('@');
  ss.getSheetByName(SH.SUM).getRange('A:C').setNumberFormat('@');
  ss.getSheetByName(SH.SUM).getRange('E:E').setNumberFormat('@');
  ss.getSheetByName(SH.IMG).getRange('A:B').setNumberFormat('@');

  const defaults = {
    session: '1', processedId: '0', story: '', notesVer: '1', charVer: '1', imgVer: '1', sumVer: '1',
    glossary: '요그소토스, 틴달로스의 사냥개, 크툴루, 니알라토텝, 아자토스, 슈브니구라스, 네크로노미콘, 이성 판정',
    charUrl: '', charMap: '[]', lastCharCheck: '0'
  };
  Object.keys(defaults).forEach(k => { if (getConf(k) === null) setConf(k, defaults[k]); });
  if (!readNotes()) writeNotes({ places: [], npcs: [], clues: [], handouts: [] });

  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();

  // 외부 요청 권한을 미리 받아 두기 위한 호출
  UrlFetchApp.fetch('https://api.anthropic.com', { muteHttpExceptions: true });
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

function readNotes() {
  const v = SpreadsheetApp.getActive().getSheetByName(SH.NOTES).getRange('A2').getValue();
  try { return v ? JSON.parse(v) : null; } catch (e) { return null; }
}
function writeNotes(n) {
  SpreadsheetApp.getActive().getSheetByName(SH.NOTES).getRange('A2').setValue(JSON.stringify(n));
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
      case 'poll':  return out(poll(Number(p.since || 0)));
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
    if (b.action === 'lines') return out(addLines(b.name, b.items));
    if (b.pw !== KEEPER_PW) return out({ ok: false, error: '키퍼 비밀번호가 필요해요' });
    switch (b.action) {
      case 'process':    return out(processNow(true));
      case 'newSession': return out(newSession());
      case 'glossary':   setConf('glossary', String(b.glossary || '')); bump('notesVer'); return out({ ok: true });
      case 'chars':      return out(saveCharConfig(b.url, b.map));
      case 'charsRefresh': return out(refreshCharacters(true));
      case 'image':      return out(addImage(b.data, b.mime, b.caption));
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
    charVer: getConf('charVer'), imgVer: getConf('imgVer'), processedId: Number(getConf('processedId'))
  };
}

function poll(since) {
  // 처음 접속이면 최근 300줄만
  if (since <= 0) {
    const total = SpreadsheetApp.getActive().getSheetByName(SH.LINES).getLastRow() - 1;
    since = Math.max(0, total - 300);
  }
  const lines = readLines(since, 500);
  return { ok: true, v: versions(), lines };
}

function allData() {
  const ss = SpreadsheetApp.getActive();
  const sums = ss.getSheetByName(SH.SUM).getDataRange().getValues().slice(1)
    .map(r => ({ session: String(r[0]), from: String(r[1]), to: String(r[2]), text: r[3] }));
  const chars = ss.getSheetByName(SH.CHAR).getDataRange().getValues().slice(1)
    .map(r => { let c = {}; try { c = JSON.parse(r[2] || '{}'); } catch (e) {} return Object.assign({ tab: r[0], player: r[1] }, c); });
  const imgs = ss.getSheetByName(SH.IMG).getDataRange().getValues().slice(1)
    .map(r => { let a = {}; try { a = JSON.parse(r[4] || '{}'); } catch (e) {} return { time: String(r[0]), session: String(r[1]), url: r[3], title: a.title || '', text: a.text || '', description: a.description || '' }; });
  return {
    ok: true, v: versions(), summaries: sums, notes: readNotes(), characters: chars, images: imgs,
    story: getConf('story'), glossary: getConf('glossary'),
    charUrl: getConf('charUrl'), charMap: JSON.parse(getConf('charMap') || '[]')
  };
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
  '정리(notes) 규칙: places=[{name,desc,found}] 장소와 거기서 일어난 일·발견한 것, ' +
  'npcs=[{name,traits,said,relation}] NPC의 특징·했던 중요한 말·탐사자들과의 관계, ' +
  'clues=[{text,status}] 얻은 정보와 단서, status는 "미해결" 또는 "해결", ' +
  'handouts=[{title,text}] 핸드아웃 내용. 기존 항목은 지우지 말고 새 정보로 보강하라. 같은 대상은 하나로 합쳐라. ' +
  '확실하지 않은 내용은 추측이라고 표시하라.';

function processNow(manual) {
  // 받아쓰기 저장(스크립트 잠금)을 막지 않도록 문서 잠금을 따로 쓴다
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(5000)) return { ok: false, error: '이미 정리 중이에요' };
  try {
    const processed = Number(getConf('processedId') || 0);
    const lines = readLines(processed, 1500);
    if (!lines.length) return { ok: true, message: '새로 정리할 대화가 없어요' };

    const chars = SpreadsheetApp.getActive().getSheetByName(SH.CHAR).getDataRange().getValues().slice(1)
      .map(r => { try { const c = JSON.parse(r[2] || '{}'); return (r[1] || '?') + ' = ' + (c.name || r[0]); } catch (e) { return ''; } })
      .filter(Boolean).join('\n');
    const transcript = lines.map(l => '[' + l.time.slice(11) + '] ' + l.name + ': ' + l.text).join('\n');

    const system =
      '너는 한국어 TRPG(주로 크툴루의 부름) 세션의 기록 담당이다. 음성 받아쓰기라서 단어가 잘못 적혀 있을 수 있다. ' +
      '용어집·캐릭터 이름·앞뒤 맥락으로 잘못 들린 고유명사를 바로잡고, 의미 없는 조각은 무시하라. ' +
      '플레이어 잡담(규칙 질문, 농담, 현실 이야기)과 캐릭터로서의 행동·대사를 구분해서, 요약은 이야기 안의 일을 중심으로 캐릭터 이름으로 써라. ' +
      '판정 결과(성공/실패, 이성·체력 변화)는 말로 언급된 것만 적어라. 없는 일을 지어내지 마라. ' +
      '반드시 JSON 하나만 출력하라.';
    const user =
      '## 용어집\n' + getConf('glossary') + '\n\n' +
      '## 플레이어 = 캐릭터\n' + (chars || '(아직 없음)') + '\n\n' +
      '## 지금까지의 누적 줄거리\n' + (getConf('story') || '(처음)') + '\n\n' +
      '## 현재 정리(notes)\n' + JSON.stringify(readNotes() || {}) + '\n\n' +
      '## 새로 들어온 대화 (세션 ' + getConf('session') + ')\n' + transcript + '\n\n' +
      '## 출력 형식\n' +
      '{"summary":"새 대화 구간의 요약. 시간순으로 3~10개의 \\"- \\"로 시작하는 줄",' +
      '"story":"세션 시작부터 지금까지 누적 줄거리를 갱신한 것 (2500자 이내, 중요한 사건 위주)",' +
      '"notes":{"places":[],"npcs":[],"clues":[],"handouts":[]}}\n' + NOTES_RULE +
      '\n새 대화에 이야기 진행이 거의 없으면 summary는 "- (잡담 위주, 진행 없음)"으로 하고 notes는 그대로 둬라.';

    const res = parseJson(claude(system, user, 6000));
    const s = SpreadsheetApp.getActive().getSheetByName(SH.SUM);
    s.appendRow([getConf('session'), lines[0].time, lines[lines.length - 1].time, res.summary || '',
      Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss')]);
    if (res.story) setConf('story', res.story);
    if (res.notes) { writeNotes(Object.assign({ places: [], npcs: [], clues: [], handouts: [] }, res.notes)); bump('notesVer'); }
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

function refreshCharacters(force) {
  setConf('lastCharCheck', String(Date.now()));
  const url = getConf('charUrl'); const map = JSON.parse(getConf('charMap') || '[]');
  if (!url || !map.length) return { ok: true, message: '연결된 캐릭터시트가 없어요' };
  const src = SpreadsheetApp.openByUrl(url);
  const cs = SpreadsheetApp.getActive().getSheetByName(SH.CHAR);
  const old = {};
  cs.getDataRange().getValues().slice(1).forEach(r => { old[r[0]] = r; });

  const rows = [];
  let changed = false;
  map.forEach(m => {
    const sh = src.getSheetByName(m.tab); if (!sh) return;
    const vals = sh.getRange(1, 1, Math.min(sh.getLastRow(), 120), Math.min(sh.getLastColumn(), 30)).getDisplayValues();
    const text = vals.map(r => r.filter(c => String(c).trim() !== '').join(' | ')).filter(Boolean).join('\n').slice(0, 9000);
    const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text + '|' + m.player));
    const prev = old[m.tab];
    if (!force && prev && prev[3] === hash) { rows.push([m.tab, m.player, prev[2], prev[3], prev[4]]); return; }
    const card = parseJson(claude(
      'TRPG 캐릭터시트를 읽고 핵심만 JSON으로 뽑아라. 시트에 없는 값은 비워라. JSON 하나만 출력.',
      '시트 내용:\n' + text + '\n\n출력 형식: {"name":"","occupation":"","age":"","hp":"현재/최대","san":"현재/최대","mp":"현재/최대","luck":"",' +
      '"skills":[{"name":"","value":""}] (수치가 높은 기술 위주 최대 12개),"items":"소지품 요약","memo":"배경·특이사항 한두 줄"}', 1500));
    rows.push([m.tab, m.player, JSON.stringify(card), hash, Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss')]);
    changed = true;
  });
  if (cs.getLastRow() > 1) cs.getRange(2, 1, cs.getLastRow() - 1, 5).clearContent();
  if (rows.length) cs.getRange(2, 1, rows.length, 5).setValues(rows);
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
      '## 현재 정리(notes)\n' + JSON.stringify(readNotes() || {}) + '\n\n' +
      '이미지 속 글자는 빠짐없이 옮기고, 그림이면 무엇이 보이는지 묘사하라. 그리고 정리를 갱신하라.\n' +
      '출력 형식: {"title":"짧은 제목","text":"이미지 속 글자 전문","description":"묘사와 눈여겨볼 점","notes":{"places":[],"npcs":[],"clues":[],"handouts":[]}}\n' + NOTES_RULE }
  ];
  const res = parseJson(claude('너는 TRPG 세션 기록 담당이다. JSON 하나만 출력하라.', content, 5000));
  SpreadsheetApp.getActive().getSheetByName(SH.IMG).appendRow([
    Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'), getConf('session'), file.getId(), url,
    JSON.stringify({ title: res.title || '', text: res.text || '', description: res.description || '' })
  ]);
  if (res.notes) { writeNotes(Object.assign({ places: [], npcs: [], clues: [], handouts: [] }, res.notes)); bump('notesVer'); }
  bump('imgVer');
  return { ok: true, title: res.title || '' };
}
