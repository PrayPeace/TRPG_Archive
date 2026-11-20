/****************************************************************
 * TRPG Archive — 구글 시트 스크립트
 *
 * ※ 이 스프레드시트는 마스터 구글 계정에만 두세요. 플레이어에게 시트를 공유하면
 *    마스터 전용 시트(키퍼자료·키퍼원문·키퍼기록·판정기록)가 그대로 보입니다.
 * ※ 방 비밀번호와 마스터 비밀번호는 반드시 서로 다르게 정하세요. (같으면 마스터 기능이 잠깁니다)
 * ※ 마스터 비밀번호는 10자 이상을 권합니다. 짧아도 동작하지만 화면과 실행 로그에 경고가 나옵니다.
 *
 * 1) 아래 네 줄에 키와 비밀번호를 넣는다. (따옴표 '' 안에)
 * 2) 위쪽 함수 선택에서 setup 을 고르고 ▶실행 (권한 허용). 새 방이면 아래 RULE 줄에서 룰을 먼저 고른다.
 *    (이미 쓰던 방에 코드를 새로 붙였다면 setup 대신 fixTrigger 를 한 번 실행해도 5분마다 자동 정리가 맞춰진다)
 *    코드를 새로 붙여 넣었을 때도 setup 을 한 번 실행한다. (기존 기록은 그대로 두고 빠진 칸만 채움)
 * 3) 배포 → 새 배포 → 웹 앱 / 실행: 나 / 액세스: 모든 사용자 → 배포.
 *    코드를 고친 뒤에는 배포 → 배포 관리 → 연필 → 버전: 새 버전 → 배포.
 * 4) (권장) 함수 선택에서 selfTest 를 고르고 ▶실행 → 실행 로그가 "결과: 모두 PASS"인지 확인한다.
 *    실제 구글 시트에서 "=1+1" 같은 글이 수식으로 바뀌지 않는지 등을 점검한다. 기존 기록은 건드리지 않는다. (맨 아래 설명 참고)
 *
 * ★ 라이브러리 방식 (권장, 11-20.15부터): 이 파일은 "🎲TRPG Archive 엔진" 프로젝트 하나에만 두고,
 *   방 시트(로비 포함)에는 저장소의 Room.gs(짧은 연결 코드)만 붙여 라이브러리 TRPG(HEAD 개발 모드)로 부른다.
 *   그러면 업데이트는 엔진의 이 파일만 바꿔 저장하면 끝 (방마다 붙이기·다시 배포 불필요). 키 네 줄도 엔진에만 넣는다.
 *   방 비밀번호는 방마다 설정 탭(roomPw)에 있고, 마스터 비밀번호는 아래 KEEPER_PW (로비 🔑로 바꾸면 방마다 설정 탭이 우선).
 ****************************************************************/
const CLAUDE_KEY   = '여기에_클로드_API_키';
const DEEPGRAM_KEY = '여기에_딥그램_API_키';
const ROOM_PW      = '방비밀번호';      // 플레이어 모두가 아는 비밀번호 (로비에서 방을 개설했거나 ⚙ 설정에서 바꿨으면 설정 탭의 값이 우선)
const KEEPER_PW    = '키퍼비밀번호';    // 마스터만 아는 비밀번호 (로비 ⚙ 설정에서 바꿨으면 그게 우선. 바꾼 뒤엔 여기를 고쳐도 소용없음)

// 새 방을 만들 때 어떤 룰로 진행할지 고른다 (아래 RULES의 이름 중 하나). 이미 만든 방은 마스터 탭에서 바꿀 수 있다.
const RULE = 'coc';
const RULES = {
  coc:       { abbr: 'CoC', name: '크툴루의 부름', pc: '탐사자', en: 'INVESTIGATOR', hint: '',
               gloss: '요그소토스, 틴달로스의 사냥개, 크툴루, 니알라토텝, 아자토스, 슈브니구라스, 네크로노미콘, 이성 판정' },
  triangle:  { abbr: 'TA', name: '트라이앵글 에이전시', pc: '요원', en: 'AGENT',
               hint: '이 세션은 트라이앵글 에이전시 룰이다. 플레이어 캐릭터는 "요원"이라 부른다. 룰 용어와 설정은 대화에 나온 것만 적고, 알고 있다고 짐작해서 보태지 마라. ',
               gloss: '트라이앵글 에이전시, 요원, 이상 현상' },
  unlimited: { abbr: 'UW', name: '언리미티드 월드', pc: '캐릭터', en: 'CHARACTER',
               hint: '이 세션은 언리미티드 월드 룰이다. 룰 용어와 설정은 대화에 나온 것만 적고, 짐작해서 보태지 마라. ',
               gloss: '언리미티드 월드' },
  shinobi:   { abbr: 'SG', name: '시노비가미', pc: '닌자', en: 'SHINOBI',
               hint: '이 세션은 시노비가미 룰이다. 플레이어 캐릭터는 "닌자"라 부른다. 비밀·사명·인연·감정·유파·닌법 같은 룰 용어는 대화에 나온 그대로 적고, 나오지 않은 설정은 보태지 마라. ',
               gloss: '시노비가미, 닌법, 유파, 비밀, 사명, 인연' },
  etc:       { abbr: 'ETC', name: '기타 TRPG', pc: '캐릭터', en: 'CHARACTER', hint: '', gloss: '' }
};
function ruleKey() { const k = String(getConf('rule') || RULE); return RULES[k] ? k : 'coc'; }
function R() { return RULES[ruleKey()]; }
function ruleInfo() { const r = R(); return { key: ruleKey(), name: r.name, pc: r.pc, en: r.en, list: Object.keys(RULES).map(k => ({ key: k, name: RULES[k].name })) }; }
// 스프레드시트(방) 이름 규칙: "🎲TRPG Archive · 룰약자 방이름" (예: 🎲TRPG Archive · CoC 질긴 결속)
function roomFileName(rule, name) { return '🎲TRPG Archive · ' + (RULES[rule] || RULES.coc).abbr + ' ' + String(name || '').trim(); }
function bareRoomName(full) {
  const ab = Object.keys(RULES).map(k => RULES[k].abbr).join('|');
  return String(full || '').replace(/^\s*(?:🎲)?\s*TRPG Archive\s*[·\-]\s*/, '').replace(new RegExp('^(?:' + ab + ')\\s+'), '').trim();
}
// 지금 방의 이름을 규칙에 맞게 고친다 (setup·룰 바꾸기 때). 방 이름은 그대로, 앞부분과 룰 약자만 맞춘다
function fixRoomName() {
  try {
    const ss = SpreadsheetApp.getActive(), cur = String(ss.getName() || '');
    const bare = bareRoomName(cur) || cur;
    // 로비 전용 시트(이름이 "로비"로 시작)는 룰 약자 없이 "🎲TRPG Archive · 로비"
    const want = /^로비/.test(bare) ? '🎲TRPG Archive · ' + bare : roomFileName(ruleKey(), bare);
    if (want !== cur) { ss.rename(want); Logger.log('방 이름을 바꿨어요: ' + cur + ' → ' + want); }
  } catch (e) { Logger.log('방 이름 바꾸기 실패: ' + e); }
}
function rl(t) { const pc = R().pc; return pc === '탐사자' ? t : String(t).replace(/탐사자/g, pc); }     // 프롬프트의 "탐사자"를 룰에 맞는 말로 (대화 원문에는 쓰지 않는다)

const MODEL = 'claude-sonnet-5-5';
// NPC·장소·단서 자동 정리와 "AI에게 다시 맡기기"에 쓰는 싼 모델. 정리 품질이 아쉬우면 이 줄을 MODEL 과 같게 바꾸면 된다.
const MODEL_LIGHT = 'claude-haiku-5-5';
// AI가 답하기 전에 속으로 생각하는 양. 생각한 글자도 출력 토큰으로 값을 낸다. 요약·정리·정정 같은 공개 기록 작업은 'medium'으로 둔다 (low는 요약 품질이 떨어져서 쓰지 않음. 마스터 도구는 적용 안 함).
// 더 아끼려면 'low', 예전처럼 하려면 '' (빈칸이면 보내지 않는다)
const AI_EFFORT = 'medium';
// 자동 요약을 건너뛰는 기준: 새 대화가 이 글자 수보다 적거나 마스터 발언이 없으면 이번 5분은 쉬고, 그래도 SUM_MAX_WAIT가 지나면 요약한다
const SUM_MIN_CHARS = 1500;
const SUM_MAX_WAIT = 9 * 60 * 1000;
const CODE_VER = '2026-11-21.2';          // 이 파일의 판. 화면(index.html)의 APP_VER와 같아야 한다 (다르면 마스터 탭에 알림이 뜬다)
const TZ = 'Asia/Seoul';

const SH = {
  CONF: '설정', LINES: '대화', SUM: '요약', NOTES: '정리', CHAR: '캐릭터', IMG: '이미지', STAGE: '요약대기', CSNAP: '캐릭터기록',
  // 아래 넷은 마스터 전용: 플레이어에게 가는 응답과 공개 기록용 AI(요약·정정·이미지 분석)는 절대 읽지 않는다
  KB: '키퍼자료', KSRC: '키퍼원문', KLOG: '키퍼기록', ROLLS: '판정기록',
  TOK: '토큰기록'
};
const SECTIONS = ['places', 'npcs', 'pcs', 'clues', 'handouts'];

const JOB_TTL = 7 * 60 * 1000;   // AI 작업 표시가 남아 있어도 이 시간이 지나면 끝난 것으로 본다 (스크립트 최대 실행 6분)
const WINDOW_LINES = 120;        // 요약 한 번에 보내는 최대 줄 수 (넘으면 이어서 다음 구간). AI 답이 길어지면 늦거나 잘리므로 작게 잡는다
const WINDOW_CHARS = 12000;       // 한 구간의 글자 수 상한 (묘사가 길면 줄 수가 적어도 여기서 끊어 나눠 처리한다)
const NOTES_Q_MAX = 80;          // 정리(NPC·장소·단서) 대기 최대 건수
const STORY_MAX = 3000;
const STORY_REF = 900;           // 요약 AI에 참고로 주는 누적 줄거리는 끝부분만 (길이와 호출 무게를 줄이려고)          // 누적 줄거리가 이보다 길어지면 AI가 한 번 줄여 쓴다
const KTOKEN_TTL = 12 * 3600 * 1000;   // 마스터 로그인 유지 시간
const K_FAIL_MAX = 20;                 // 10분 안에 비밀번호를 이만큼 틀리면
const K_LOCK_MS = 10 * 60 * 1000;      // 이 시간 동안 비밀번호 로그인을 잠근다 (이미 로그인한 마스터는 영향 없음)
const NOTE_CHUNK = 45000;        // 정리 JSON을 셀 하나(5만 자 제한)에 다 못 넣으면 아래 칸으로 나눠 저장

/* ───────────── 시트 머리글 ───────────── */
const HEADERS = {
  '캐릭터기록': ['시각', '세션', '탭', '플레이어', '이름', '체력', '이성', '마력', '행운'],
  '키퍼자료': ['마스터 정리본 JSON (칸 A) · 마스터 전용', '마스터 정리본 JSON (칸 B) · 마스터 전용'],
  '키퍼원문': ['조각ID', '출처', '순번', '글자수', '본문', '추가 시각', '나눈 원래 조각'],
  '키퍼기록': ['ID', '시각', '초기화번호', '세션', '종류', '제목', '입력', '결과', '자료번호'],
  '판정기록': ['순번', '세션', '이름', '기술', '목표', '값', '결과', '원문']
};
// 없으면 만들어서 돌려준다 (코드만 바꾸고 setup을 아직 안 돌린 경우에도 동작하게).
// 예전 버전이 만든 시트라 새로 생긴 칸의 머리글이 비어 있으면 채운다 (기존 내용은 건드리지 않는다).
const _ensured = {};
function ensureSheet(name) {
  const ss = SpreadsheetApp.getActive();
  let s = ss.getSheetByName(name);
  const h = HEADERS[name];
  if (!s) {
    s = ss.insertSheet(name);
    s.getRange(1, 1, s.getMaxRows(), h.length).setNumberFormat('@');
    s.getRange(1, 1, 1, h.length).setValues([h]);
    _ensured[name] = true;
  } else if (!_ensured[name]) {
    _ensured[name] = true;
    const cur = s.getRange(1, 1, 1, h.length).getValues()[0];
    h.forEach((t, i) => { if (!String(cur[i] || '')) { s.getRange(1, i + 1, s.getMaxRows(), 1).setNumberFormat('@'); s.getRange(1, i + 1).setValue(t); } });
  }
  return s;
}
/* 시트에 글자를 쓸 때 수식으로 바뀌지 않게 한다 (이름·대사·탭 이름·로그·AI 답처럼 바깥에서 온 글자에 모두 적용).
 * =, +, -, @, ' 로 시작하는 글은 앞에 § 를 붙여 쓰고(enc), 읽을 때 그 § 를 뗀다(dec).
 *  - ' (작은따옴표)는 시트가 "글자로 넣으라"는 표시로 보고 떼어 버릴 수 있어서 함께 막는다.
 *  - 앞 글자를 지우지 않으니 "=철수"와 "철수"가 같은 이름이 되지 않고, 읽은 값은 언제나 쓴 값 그대로다.
 *  - "- 요약 줄"처럼 줄표로 시작하는 글도 붙인다. 시트에서 "- IMPORTDATA(...)"는 수식으로 읽힐 수 있어서 예외를 두지 않는다.
 *    (그래서 구글 시트를 직접 열면 그런 칸 앞에 § 가 보인다. 앱 화면에는 보이지 않는다)
 *  - 숫자·날짜처럼 보이는 글("0012", "1/2")이 바뀌지 않게 하는 것은 칸 형식(글자 '@')이 맡는다. 그래서 쓰기 전에 형식도 함께 지정한다.
 * 이게 없으면 방 비밀번호를 아는 사람이 이름 칸에 =IMPORTDATA(...) 같은 수식을 넣어 마스터 전용 시트를 밖으로 빼낼 수 있다.
 * 실제 구글 시트에서 이 규칙이 통하는지는 맨 아래 selfTest()를 한 번 실행해서 확인한다. */
const SAFE_MARK = '§';
// 방 비밀번호: 로비에서 개설한 방은 설정 탭의 roomPw, 아니면 Code.gs 맨 위 ROOM_PW
function roomPw() { try { const v = getConf('roomPw'); return v ? String(v) : ROOM_PW; } catch (e) { return ROOM_PW; } }
/* 마스터 비밀번호: 로비 ⚙ 설정에서 바꿨으면 설정 탭의 keeperPwH(소금+해시, 비밀번호 자체는 남기지 않는다)가 우선, 아니면 Code.gs 맨 위 KEEPER_PW */
function keeperHash() { try { const v = getConf('keeperPwH'); return v ? String(v) : ''; } catch (e) { return ''; } }
function keeperPwOk(p) {
  p = String(p == null ? '' : p);
  if (!p) return false;
  const h = keeperHash();
  if (!h) return p === KEEPER_PW;
  const i = h.indexOf(':');
  return i > 0 && sha(h.slice(0, i) + p) === h.slice(i + 1);
}
function keeperWeak() { return keeperHash() ? getConf('keeperWeak') === '1' : KEEPER_PW.length < 10; }
function enc(v) { return (typeof v === 'string' && /^[=+\-@§'\t\r\n]/.test(v)) ? SAFE_MARK + v : v; }
function dec(v) { return (typeof v === 'string' && v.charAt(0) === SAFE_MARK) ? v.slice(1) : v; }
function decS(v) { return dec(v == null ? '' : String(v)); }

/* ───────────── 설치 ───────────── */
// 자동 정리 트리거(5분마다)만 다시 건다. 다른 설정은 건드리지 않는다. 트리거만 바꾸고 싶을 때 이것만 실행해도 된다.
function fixTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => { const h = t.getHandlerFunction(); if (h === 'tick' || h === 'tickMore') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tick').timeBased().everyMinutes(5).create();
  Logger.log('자동 정리 트리거를 5분마다로 설정했어요');
}
// roomPwFirst: (라이브러리로 쓸 때) 방 시트의 연결 코드가 넘겨주는 이 방 비밀번호. 비어 있으면 건드리지 않는다
function setup(roomPwFirst) {
  const ss = SpreadsheetApp.getActive();
  if (!ss) { Logger.log('여기는 시트가 없는 엔진 프로젝트예요. setup은 엔진에서 실행하지 말고, 각 방 시트의 Apps Script(Room.gs)에서 실행해 주세요. 엔진은 저장만 하면 돼요.'); return; }
  const make = (name, header) => {
    let s = ss.getSheetByName(name);
    if (!s) s = ss.insertSheet(name);
    if (s.getLastRow() === 0) s.appendRow(header);
    else header.forEach((h, i) => { if (!s.getRange(1, i + 1).getValue()) s.getRange(1, i + 1).setValue(h); });
    return s;
  };
  make(SH.CONF, ['키', '값']);
  fixRoomName();                                   // 방 이름을 "🎲TRPG Archive · 룰약자 방이름"으로 맞춘다
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
    glossary: (RULES[RULE] || RULES.coc).gloss, rule: RULE,
    charUrl: '', charMap: '[]', lastCharCheck: '0', keeperName: '', resetVer: '1', colors: '{}', corrections: '[]',
    colorVer: '1', job: '', pending: '', procStatus: '', notesSlot: 'A',
    notesQ: '', kbSlot: 'A', kbGen: '1', kVer: '1', ktokens: '[]', recap: '', awards: '', charLast: '{}', sessionAt: '0'
  };
  confLoad(true);
  Object.keys(defaults).forEach(k => { if (getConf(k) === null) setConf(k, defaults[k]); });
  const rp = typeof roomPwFirst === 'string' ? roomPwFirst.trim() : '';
  if (rp) { if (keeperPwOk(rp)) Logger.log('⚠ 방 비밀번호가 마스터 비밀번호와 같아서 넣지 않았어요'); else { setConf('roomPw', rp); Logger.log('방 비밀번호를 설정 탭에 넣었어요'); } }
  if (!readNotes()) writeNotes(emptyNotes());

  // 예전 대화 줄에 발언ID 채우기 (근거 원문 찾기용)
  const last = L.getLastRow();
  if (last >= 2) {
    const rv = getConf('resetVer') || '0';
    const v = L.getRange(2, 1, last - 1, 6).getValues();
    const f = v.map(r => [r[5] ? enc(decS(r[5])) : 'old' + rv + '-' + r[0]]);
    L.getRange(2, 6, last - 1, 1).setNumberFormat('@').setValues(f);
  }

  fixTrigger();

  // 외부 요청·캐시 권한을 미리 받아 두기 위한 호출
  UrlFetchApp.fetch('https://api.anthropic.com', { muteHttpExceptions: true });
  roomCache().put('setup', '1', 60);
  SpreadsheetApp.flush();
  pwWarnings().forEach(w => Logger.log('⚠ ' + w));
  // 예전 버전에서 이 문서의 내부 탭을 캐릭터로 연결해 둔 것이 있으면 바로 끊는다
  try { const fixed = charLinkFix(); if (fixed.length) Logger.log('⚠ 앱 내부 탭이 캐릭터로 연결돼 있어서 끊고, 그 탭으로 만든 캐릭터 카드를 지웠어요: ' + fixed.join(', ')); }
  catch (e) { Logger.log('캐릭터 연결 점검을 건너뛰었어요: ' + String(e && e.message || e)); }
  Logger.log('설치 완료. 이제 웹 앱으로 배포(또는 새 버전으로 다시 배포)하세요.');
}

// 비밀번호 설정 점검 (값 자체는 어디에도 찍지 않는다)
function pwWarnings() {
  const w = [];
  if (keeperPwOk(roomPw())) w.push('방 비밀번호와 마스터 비밀번호가 같아요. 서로 다르게 바꾸지 않으면 마스터 기능을 쓸 수 없어요.');
  if ((!keeperHash() && KEEPER_PW === '키퍼비밀번호') || roomPw() === '방비밀번호') w.push('비밀번호가 처음 예시 그대로예요. Code.gs 맨 위에서 바꿔 주세요.');
  if (keeperWeak()) w.push('마스터 비밀번호가 10자보다 짧아요. 짧아도 동작은 하지만, 방 비밀번호를 아는 사람이 찍어 맞히기 쉬워지니 10자 이상을 권해요.');
  return w;
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
    _conf[k] = { row: i + 1, val: decS(v[i][1]) };
  }
  return _conf;
}
function getConf(key) { const c = confLoad()[key]; return c ? c.val : null; }
function setConf(key, val) {
  val = val == null ? '' : String(val);
  let c = confLoad()[key];
  if (!c) { confLoad(true); c = _conf[key]; }
  const s = confSheet();
  if (c) { s.getRange(c.row, 2).setValue(enc(val)); c.val = val; return; }
  const row = s.getLastRow() + 1;
  s.getRange(row, 1, 1, 2).setNumberFormat('@').setValues([[key, enc(val)]]);
  _conf[key] = { row, val };
}
function bump(key) { setConf(key, String(Number(getConf(key) || 0) + 1)); }
function confJson(key, fallback) { try { const v = getConf(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; } }
function setJson(key, obj) { setConf(key, obj == null ? '' : JSON.stringify(obj)); }
function now() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function sheet(name) { return SpreadsheetApp.getActive().getSheetByName(name); }

/* ───────────── 라이브러리로 써도 방끼리 섞이지 않게 ─────────────
 * 이 코드는 방 시트에 통째로 붙여도 되고, "엔진" 프로젝트 하나에 두고 방 시트에서 라이브러리(TRPG)로 불러도 된다.
 * 라이브러리로 쓰면 캐시와 스크립트 잠금은 모든 방이 같이 쓰므로, 캐시 이름 앞에 시트 ID를 붙이고 잠금은 시트(문서) 잠금을 쓴다. */
let _ssId = null;
function ssId() { if (_ssId == null) { try { _ssId = SpreadsheetApp.getActive().getId(); } catch (e) { _ssId = 'x'; } } return _ssId; }
function roomCache() {
  const c = CacheService.getScriptCache(), p = ssId().slice(0, 60) + ':';
  return {
    get: k => c.get(p + k), put: (k, v, t) => c.put(p + k, v, t), remove: k => c.remove(p + k),
    getAll: ks => { const o = c.getAll(ks.map(k => p + k)), r = {}; Object.keys(o).forEach(k => { r[k.slice(p.length)] = o[k]; }); return r; }
  };
}
function roomLock() { let l = null; try { l = LockService.getDocumentLock(); } catch (e) {} return l || LockService.getScriptLock(); }
// 짧게 잠그고 바로 푼다. 잠금 안에서 쓴 내용은 풀기 전에 시트에 확정한다.
let _lockDepth = 0, _lockPatient = false;
function withLock(ms, fn) {
  if (_lockDepth > 0) return fn();                       // 이미 이 실행이 잠금을 잡고 있다: 그대로 이어서 실행
  const l = roomLock();
  // 요약 실행은 대화 저장이 몰려도 쉽게 포기하지 않는다 (잠금을 못 잡으면 잠깐 쉬고 몇 번 더 시도)
  let got = l.tryLock(ms);
  for (let i = 0; !got && _lockPatient && i < 3; i++) { Utilities.sleep(1500 + i * 1500); got = l.tryLock(ms); }
  if (!got) throw new Error('다른 저장 작업이 몰려 있어요. 잠시 뒤 다시 시도해 주세요');
  _lockDepth = 1;
  try { confLoad(true); const r = fn(); SpreadsheetApp.flush(); return r; }
  finally { _lockDepth = 0; l.releaseLock(); }
}

/* ───────────── AI 작업 표시 (잠금 없이 오래 걸리는 Claude 호출을 하기 위한 자리표) ───────────── */
function liveJob() {
  const j = confJson('job', null);
  return j && Date.now() - Number(j.at || 0) < JOB_TTL ? j : null;
}
// ── 진행 표시: 지금 무슨 일을 하는지와 퍼센트를 캐시에 적어 둔다 (잠금·시트를 쓰지 않는다)
let _prog = null;                                   // 이번 실행의 계산 기준
function setProg(job, label, pct, next, detail) {
  try {
    if (!job) return;
    const c = roomCache();
    let old = null; try { old = JSON.parse(c.get('prog') || 'null'); } catch (e) {}
    pct = Math.max(0, Math.min(99, Math.round(pct)));
    if (old && old.token === job.token && old.pct > pct) pct = old.pct;             // 뒤로 가지 않는다
    c.put('prog', JSON.stringify({ token: job.token, label, detail: detail || '', pct, next: Math.max(pct, Math.min(99, Math.round(next == null ? pct : next))) }), 600);
  } catch (e) {}
}
function getProg(job) {
  try { const o = JSON.parse(roomCache().get('prog') || 'null'); return o && job && o.token === job.token ? { label: o.label, detail: o.detail, pct: o.pct, next: o.next } : null; } catch (e) { return null; }
}
function clearProg() { try { roomCache().remove('prog'); } catch (e) {} }
// 요약 단계는 3~55%, NPC·장소·단서 정리는 55~93%, 마무리는 93~100%
function pSum(extra) { const l0 = Math.max(1, _prog && _prog.l0 || 1); return 3 + 52 * Math.min(1, ((_prog ? _prog.lines : 0) + (extra || 0)) / l0); }
function pNotes(done, step) { const b = _prog || { nb: 55, ns: 38 }; const q = notesQ().length; return b.nb + b.ns * Math.min(1, (done + (step || 0)) / Math.max(1, done + q)); }
function acquireJob(kind, waitMs) {
  const until = Date.now() + (waitMs || 0);
  while (true) {
    const job = withLock(20000, () => {
      if (liveJob()) return null;
      const j = { token: Utilities.getUuid(), kind, at: Date.now(), rv: getConf('resetVer') || '0' };
      setJson('job', j);
      return j;
    });
    if (job || Date.now() >= until) return job;
    Utilities.sleep(3000);
  }
}
// 반드시 withLock 안에서 부른다: 내 작업 표시가 그대로이고, 그 사이 초기화가 없었는지
function jobAlive(job) {
  const j = confJson('job', null);
  return !!j && j.token === job.token && (getConf('resetVer') || '0') === job.rv;
}
function releaseJob(job) {
  clearProg();
  try { withLock(20000, () => { const j = confJson('job', null); if (j && j.token === job.token) setJson('job', null); }); } catch (e) {}
}
function setStatus(o) {
  try { withLock(20000, () => setJson('procStatus', Object.assign({ at: now() }, o))); } catch (e) {}
}

/* ───────────── 정리(장소·NPC·단서·핸드아웃) ───────────── */
function emptyNotes() { return { places: [], npcs: [], pcs: [], clues: [], handouts: [], deleted: {} }; }
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
 * 쓰다가 실패해도 지금 쓰는 칸은 그대로라 기존 내용이 사라지지 않는다. (정리, 마스터 정리본이 함께 씀) */
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
// 정리 AI에 줄 현재 정리: 이번 대화에 이름이 나온 항목만 전체, 나머지는 이름표(id+이름)만. 단서는 앞부분만. (길어질수록 무거워지는 것을 막는다)
function notesForAiLite(n, transcript) {
  const t = String(transcript || '');
  const hit = x => [x.name, x.player, x.title].concat(akaList(x.aka)).some(v => { v = String(v || '').trim(); return v.length >= 2 && t.indexOf(v) >= 0; });
  const cut = (v, n) => { v = String(v || ''); return v.length > n ? '…' + v.slice(-n) : v; };
  const strip = x => { const y = Object.assign({}, x); delete y.src; delete y.img; delete y.editedAt; if (!y.locked) delete y.locked; ['found', 'desc', 'text', 'said', 'relation'].forEach(k => { if (y[k]) y[k] = cut(y[k], k === 'text' ? 600 : 300); }); return y; };
  const o = {};
  ['places', 'npcs', 'pcs', 'handouts'].forEach(sec => { o[sec] = (n[sec] || []).map(x => hit(x) ? strip(x) : (sec === 'handouts' ? { id: x.id, title: x.title } : { id: x.id, name: x.name, aka: x.aka || undefined, locked: x.locked ? true : undefined })); });
  o.clues = (n.clues || []).slice(-40).map(x => ({ id: x.id, text: String(x.text || '').slice(0, 70), status: x.status, locked: x.locked ? true : undefined }));
  o.deleted = n.deleted || {};
  return JSON.stringify(o);
}
function notesForAi(n) {
  const o = {};
  SECTIONS.forEach(s => {
    o[s] = (n[s] || []).map(x => { const y = Object.assign({}, x); delete y.src; delete y.img; delete y.editedAt; if (!y.locked) delete y.locked; return y; });
  });
  o.deleted = n.deleted || {};
  return JSON.stringify(o);
}
// 다른 이름(aka): 쉼표로 구분한 글 ↔ 배열. 합칠 때는 겹치지 않게 더한다 (최대 12개)
function akaList(v) { return (Array.isArray(v) ? v : String(v || '').split(/[,，、\n]+/)).map(x => String(x || '').trim()).filter(x => x.length >= 2 && x.length <= 30); }
function akaUnion(a, b) { const out = []; akaList(a).concat(akaList(b)).forEach(x => { if (out.indexOf(x) < 0) out.push(x); }); return out.slice(0, 12).join(', '); }
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
      const fadd = String(x.found_add || '').trim(); delete x.found_add;
      const k = itemKey(sec, x);
      let i = (x.id && byId[x.id] != null) ? byId[x.id] : (k && byKey[k] != null ? byKey[k] : -1);
      if (i >= 0) {
        if (res[i].locked && !human) {                   // 사람이 고친 항목은 그대로 (정정 요청일 때만 바꿈). 다른 이름만은 더해 준다
          if (x.aka != null) { const ak = akaUnion(res[i].aka, x.aka); if (ak !== String(res[i].aka || '')) res[i] = Object.assign({}, res[i], { aka: ak }); }
          return;
        }
        const src = unionSrc(res[i].src, x.src);
        if (x.aka != null) x.aka = akaUnion(res[i].aka, x.aka);           // 다른 이름은 지우지 않고 더한다
        res[i] = Object.assign({}, res[i], x, { id: res[i].id, locked: !!(human && res[i].locked), src });
        if (fadd && String(res[i].found || '').indexOf(fadd) < 0) res[i].found = (String(res[i].found || '').trim() ? String(res[i].found).trim() + '\n' : '') + fadd;
        return;
      }
      if (!k || dead.has(k)) return;                      // 이름 없음, 또는 사람이 지운 대상
      if (x.aka != null) x.aka = akaUnion('', x.aka);
      const item = Object.assign({}, x, { id: newId(), locked: false, src: unionSrc([], x.src) });
      if (fadd) item.found = (String(item.found || '').trim() ? String(item.found).trim() + '\n' : '') + fadd;
      res.push(item); byId[item.id] = res.length - 1; byKey[k] = res.length - 1;
    });
    outN[sec] = res;
  });
  return outN;
}
function mergeWriteNotes(aiNotes, human) { writeNotes(mergeNotes(readNotes(), aiNotes, human)); bump('notesVer'); }
function saveAiNotes(aiNotes, human) { withLock(30000, () => mergeWriteNotes(aiNotes, human)); }

const NOTE_FIELDS = ['name', 'aka', 'desc', 'found', 'traits', 'said', 'relation', 'text', 'status', 'kind', 'title', 'img', 'age', 'affil', 'player'];
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
// 대기열을 지금 처리해 본다. 요약이 돌고 있으면 기다리지 않고 1분 뒤 이어서 하도록 예약한다.
function runQueueNow() {
  let job = null;
  try { job = acquireJob('notes', 0); } catch (e) {}
  if (!job) { scheduleMore(); return { busy: true }; }
  let r = null, msg = '';
  _prog = { job, l0: 0, lines: 0, nb: 5, ns: 90 };
  try { _lockPatient = true; r = processNotesQueue(job, Date.now(), 100000); } catch (e) { msg = String(e && e.message || e).slice(0, 160); }
  releaseJob(job); _lockPatient = false; _prog = null;
  confLoad(true);
  return { r, msg, stale: !!(r && r.stale) };
}
const NOTE_KEYF = { npcs: 'name', places: 'name', pcs: 'name', clues: 'text', handouts: 'title' };
// "AI에게 맡기기": 마스터가 적어 둔 입력을 먼저 그대로 저장하고(🔒 없이), 그 항목을 AI가 대화에서 다시 읽고 보강하게 한다.
// 입력은 AI 결과와 상관없이 항상 남는다. (저장하지 않은 입력이 있는 창에서 눌러도 사라지지 않게)
function noteHandoff(sec, item) {
  if (SECTIONS.indexOf(sec) < 0 || !item) return { ok: false, error: '잘못된 항목' };
  const kf = NOTE_KEYF[sec];
  if (!String(item[kf] || '').trim()) return { ok: false, error: (sec === 'clues' ? '내용' : sec === 'handouts' ? '제목' : '이름') + '을(를) 적어 주세요' };
  const id = withLock(20000, () => {
    const n = readNotes() || emptyNotes();
    const clean = {};
    NOTE_FIELDS.forEach(k => { if (item[k] != null && k !== 'img') clean[k] = String(item[k]).slice(0, 4000); });
    clean.locked = false; clean.editedAt = now();
    let i = item.id ? n[sec].findIndex(x => x.id === item.id) : -1;
    let nid;
    if (i < 0) {                                                  // 같은 이름이 이미 있으면 새로 만들지 않고 그 항목에 합친다 (적은 칸만 덮어씀)
      const k0 = itemKey(sec, clean); i = k0 ? n[sec].findIndex(x => itemKey(sec, x) === k0) : -1;
      if (i >= 0) Object.keys(clean).forEach(k => { if (clean[k] === '' && k !== 'locked') delete clean[k]; });
    }
    if (i >= 0) { n[sec][i] = Object.assign({}, n[sec][i], clean); nid = n[sec][i].id; }
    else { nid = newId(); n[sec].push(Object.assign({ id: nid, src: [] }, clean)); }
    const key = itemKey(sec, clean);
    if (n.deleted[sec]) n.deleted[sec] = n.deleted[sec].filter(k => k !== key);
    writeNotes(n); bump('notesVer');
    if (sec === 'npcs' || sec === 'places' || sec === 'pcs') queueNotes({ r: 1, sec, id: nid });
    return nid;
  });
  if (sec !== 'npcs' && sec !== 'places' && sec !== 'pcs') return { ok: true, id, saved: true, message: '저장했어요. 이 항목은 다음 정리 때 AI가 보강할 수 있게 열어 뒀어요' };
  const q = runQueueNow();
  if (q.busy) return { ok: true, id, saved: true, queued: true, message: '입력한 내용은 저장했어요. 지금 다른 정리가 돌고 있어서, 곧 이어서 AI가 대화를 읽고 보강해요' };
  if (q.stale) return { ok: true, id, saved: true, queued: true, message: '입력한 내용은 저장했어요' };
  const left = notesQ().some(x => x.r && x.sec === sec && x.id === id);
  if (left) { scheduleMore(); return { ok: true, id, saved: true, queued: true, message: '입력한 내용은 저장했어요. AI가 곧 이어서 보강해요' + (q.msg || (q.r && q.r.warn) ? ' (' + (q.msg || q.r.warn) + ')' : '') }; }
  return { ok: true, id, saved: true, refreshed: !(q.r && q.r.warn), message: (q.r && q.r.warn) ? '입력한 내용은 그대로 저장했어요 · ' + q.r.warn : '저장하고 AI가 대화를 읽어 보강했어요' };
}
// 탐사자 특징 만들기: 한 명 또는 (이름을 비우면) 최근 대화에 나온 플레이어 모두
function pcBuild(player) {
  const want = String(player || '').trim();
  let names = [];
  if (want) names = [want];
  else {
    const s = sheet(SH.LINES), last = s.getLastRow();
    if (last >= 2) {
      const from = Math.max(2, last - 1500 + 1), keeper = String(getConf('keeperName') || '').trim(), cnt = {};
      s.getRange(from, 4, last - from + 1, 1).getValues().forEach(r => { const nm = decS(r[0]); if (nm && nm !== keeper) cnt[nm] = (cnt[nm] || 0) + 1; });
      names = Object.keys(cnt).filter(k => cnt[k] >= 3).sort((a, b) => cnt[b] - cnt[a]).slice(0, 8);
    }
  }
  if (!names.length) return { ok: false, error: '특징을 만들 만큼 말한 플레이어가 아직 없어요' };
  withLock(20000, () => names.forEach(nm => queueNotes({ pc: 1, player: nm })));
  const q = runQueueNow();
  if (q.busy) return { ok: true, queued: true, message: names.length + '명의 ' + R().pc + ' 특징 만들기를 대기열에 넣었어요. 지금 다른 정리가 돌고 있어서 곧 이어서 해요' };
  const left = notesQ().filter(x => x.pc).length;
  if (left) scheduleMore();
  return { ok: true, queued: left > 0, message: (names.length - left) + '명의 ' + R().pc + ' 특징을 정리했어요' + (left ? ' · ' + left + '명은 곧 이어서 해요' : '') + (q.r && q.r.warn ? ' · ' + q.r.warn : '') };
}
// "AI에게 다시 맡기기": 확정을 풀고, 이 항목을 AI가 대화 전체에서 다시 읽고 새로 정리하도록 대기열에 넣는다.
// 요약이 돌고 있지 않으면 바로 처리하고, 돌고 있으면 1분 안에 이어서 처리한다.
function noteUnlock(sec, id) {
  const found = withLock(20000, () => {
    const n = readNotes() || emptyNotes();
    let hit = false;
    (n[sec] || []).forEach(x => { if (x.id === id) { x.locked = false; hit = true; } });
    if (!hit) return false;
    writeNotes(n); bump('notesVer');
    queueNotes({ r: 1, sec, id });
    return true;
  });
  if (!found) return { ok: false, error: '항목을 찾지 못했어요' };
  let job = null;
  try { job = acquireJob('notes', 0); } catch (e) {}
  if (!job) { scheduleMore(); return { ok: true, queued: true, message: '확정을 풀었어요. 지금 다른 정리가 돌고 있어서, 곧 이어서 AI가 다시 읽고 정리해요' }; }
  let r = null, msg = '';
  try {
    _lockPatient = true;
    r = processNotesQueue(job, Date.now(), 90000);
  } catch (e) { msg = String(e && e.message || e).slice(0, 160); }
  releaseJob(job); _lockPatient = false;
  if (r && r.stale) return { ok: true, queued: true, message: '확정을 풀었어요' };
  confLoad(true);
  const left = notesQ().some(x => x.r && x.sec === sec && x.id === id);
  if (left) { scheduleMore(); return { ok: true, queued: true, message: '확정을 풀었어요. AI가 곧 이어서 다시 읽고 정리해요' + (msg || (r && r.warn) ? ' (' + (msg || r.warn) + ')' : '') }; }
  return { ok: true, refreshed: true, message: (r && r.warn) ? '확정을 풀었어요 · ' + r.warn : '확정을 풀고 AI가 대화를 다시 읽어 정리했어요' };
}

/* ───────────── 접속 현황 (캐시에만 저장) ───────────── */
function touchPresence(name, mic, why, hid, bye) {
  if (!name) return;
  name = String(name).slice(0, 40);
  const c = roomCache();
  const o = { t: Date.now(), mic: String(mic || 'off').slice(0, 8) };
  if (why) o.why = String(why).slice(0, 8);       // 받아쓰기가 꺼진 이유: user(직접 끔) · idle(자동 멈춤)
  if (hid) o.hid = 1;                             // 이 사람의 탭이 숨겨져 있음 (숨은 탭은 요청이 드물어져도 끊김이 아니다)
  if (bye) o.bye = 1;                             // 방 나가기·창 닫기: 일부러 나간 것
  c.put('p_' + name, JSON.stringify(o), 600);
  const names = JSON.parse(c.get('p_names') || '[]');
  if (names.indexOf(name) < 0) { names.push(name); c.put('p_names', JSON.stringify(names.slice(-30)), 21600); }
}
function presence() {
  const c = roomCache();
  const names = JSON.parse(c.get('p_names') || '[]');
  if (!names.length) return [];
  const all = c.getAll(names.map(n => 'p_' + n));
  return names.map(n => {
    const v = all['p_' + n]; if (!v) return null;
    const o = JSON.parse(v);
    return { name: n, online: !o.bye && Date.now() - o.t < 25000, mic: o.mic, seen: o.t, age: Date.now() - o.t, why: o.why || '', hid: !!o.hid, bye: !!o.bye };
  }).filter(Boolean);
}

/* ───────────── 웹 요청 ───────────── */
function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function csv(v) { return String(v || '').split(',').map(s => s.trim()).filter(Boolean); }

/* 누가 보낸 요청인지: 'keeper'(마스터 로그인 토큰이 유효함) / 'room'(방 비밀번호가 맞음) / null
 * 마스터 비밀번호는 여기서 보지 않는다. 마스터 비밀번호를 받는 곳은 로그인(keeperLogin) 하나뿐이다. */
function roleOf(pw, kt) {
  if (kt && tokenOk(kt)) return 'keeper';
  if (pw != null && pw !== '' && pw === roomPw()) return 'room';
  return null;
}

function doGet(e) {
  const p = e.parameter || {};
  try {
    // 로비(폰 화면)의 방 목록은 비밀번호 없이 읽는다: 방 이름·룰·주소만 있고, 들어가려면 그 방의 비밀번호가 필요하다
    if (p.action === 'hub') return out(hubList());
    // 주소에 붙는 요청(GET)은 방 비밀번호만 본다. 마스터 토큰은 주소·기록에 남지 않게 POST로만 받는다.
    if (!roleOf(p.pw, null)) return out({ ok: false, error: '방 비밀번호가 틀렸어요' });
    switch (p.action) {
      case 'poll':
        try { touchPresence(p.me, p.mic, p.why, p.hid === '1'); } catch (err) {}
        return out(poll(Number(p.since || 0)));
      case 'data':        return out(allData());
      case 'token':       return out(deepgramToken());
      case 'history':     return out(history(Number(p.before || 0), Number(p.limit || 300)));
      case 'sessionLines':return out(sessionLines(String(p.session || '')));
      case 'sessions':    return out(sessionList());
      case 'evidence':    return out(evidence(csv(p.uids), csv(p.ids).map(Number), String(p.rv || ''), Number(p.ctx || 2), p.session));
      case 'ping':  return out({ ok: true, title: roomTitle(), rule: ruleKey() });
    }
    return out({ ok: false, error: '알 수 없는 요청' });
  } catch (err) { return out({ ok: false, error: String(err && err.message || err) }); }
}

function doPost(e) {
  let b;
  try { b = JSON.parse(e.postData.contents); } catch (err) { return out({ ok: false, error: '잘못된 요청' }); }
  try {
    // 로비의 ⚙ 설정: 방 비밀번호 없이 마스터 비밀번호만으로 로그인 (틀린 횟수 잠금은 keeperLogin이 그대로 한다)
    if (b.action === 'hubLogin') return out(keeperLogin(b.kpw));
    const who = roleOf(b.pw, b.kt);
    if (!who) return out({ ok: false, error: '방 비밀번호가 틀렸어요' });
    // ── 플레이어 누구나
    switch (b.action) {
      case 'lines':      return out(addLines(b));
      case 'bye':        try { touchPresence(String(b.name || ''), 'off', 'bye', false, true); } catch (err) {} return out({ ok: true });
      case 'noteHandoff': return out(noteHandoff(b.sec, b.item));
      case 'pcBuild':    return out(pcBuild(b.player));
      case 'glossary':   withLock(20000, () => { setConf('glossary', String(b.glossary || '').slice(0, 5000)); bump('notesVer'); }); return out({ ok: true });
      case 'color':      return out(saveColor(b.name, b.color));
      case 'noteSave':   return out(noteSave(b.sec, b.item));
      case 'noteDelete': return out(noteDelete(b.sec, b.id));
      case 'noteUnlock': return out(noteUnlock(b.sec, b.id));
      case 'noteImage':  return out(noteImage(b.sec, b.id, b.data));
      case 'sumSave':    return out(sumSave(b.id, b.text, b.rv));
      case 'storySave':  withLock(20000, () => { storyWrite(String(b.text || '').slice(0, 20000), storyDoc().k); bump('sumVer'); }); return out({ ok: true });
      case 'correct':    return out(correct(b.text, b.name));
      case 'bookmark':   return out(bookmark(b));
      case 'nextSteps':  return out(nextSteps(!!b.force));
      case 'portrait':   return out(savePortraitUpload(b.tab, b.data));
      case 'process':    return out(processNow(true));            // "지금 요약": 방 비밀번호만 있으면 누구나 (새 대화가 없으면 AI를 부르지 않는다)
      case 'klogin':     return out(keeperLogin(b.kpw));          // 마스터 비밀번호 → 12시간짜리 로그인 토큰
      case 'klogout':    return out(keeperLogout(b.kt, b.all));
    }
    // ── 마스터만
    if (who !== 'keeper') {
      return out(b.kt ? { ok: false, kexp: true, error: '마스터 로그인이 만료됐어요. 다시 로그인해 주세요' } : { ok: false, error: '마스터 로그인이 필요해요' });
    }
    switch (b.action) {
      case 'kping':      return out({ ok: true, keeper: true });
      case 'setRule':    return out(setRule(b.rule));
      case 'tokenUsage': return out(Object.assign({ ok: true }, tokenUsage()));
      case 'hubSave':    return out(hubSave(b.rooms));
      case 'hubGet':     return out({ ok: true, rooms: hubClean(confJson('hubRooms', [])), title: roomTitle(), self: ScriptApp.getService().getUrl() || '' });
      case 'hubNewRoom': return out(hubNewRoom(b.name, b.rule, b.pw));
      case 'credits':    return out(credits(!!b.force));
      case 'creditsSet': return out(creditsSet(b));
      case 'setPw':      return out(setPw(b));
      case 'newRoom':    return out(newRoom(b.name, b.rule));
      case 'newSession': return out(newSession());
      case 'tabs':       return out(listTabs(b.url));
      case 'chars':      return out(saveCharConfig(b.url, b.map));
      case 'charsPreview': return out(charPreview(b.url, b.map));
      case 'charsRefresh': return out(refreshCharacters(!b.soft));
      case 'image':      return out(addImage(b.data, b.mime, b.caption));
      case 'keeperName': withLock(20000, () => { setConf('keeperName', String(b.name || '').trim().slice(0, 40)); bump('notesVer'); }); return out({ ok: true });
      case 'clearLog':   return out(clearLog(false));
      case 'resetAll':   return out(clearLog(true));
    }
    const kr = keeperTool(b);                                      // 마스터 전용 도구 (맨 아래 '마스터 전용 영역')
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
    if (last >= 2) s.getRange(2, 6, last - 1, 1).getValues().forEach(r => { if (r[0]) seen.add(decS(r[0])); });
    const rows = [], saved = [], dup = [], dropped = [];
    let id = Math.max(0, last - 1);
    items.forEach(it => {
      if (!it || typeof it !== 'object') return;
      const uid = /^[A-Za-z0-9_.:\-]{1,64}$/.test(String(it.uid || '')) ? String(it.uid) : '';
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
      rows.push([id, fmtTime(it.t), sess, enc(name), enc(text.slice(0, 2000)), enc(u)]);
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

function rowToLine(r) { return { id: Number(r[0]), time: String(r[1]), session: String(r[2]), name: decS(r[3]), text: decS(r[4]), uid: decS(r[5]) }; }
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

function roomTitle() { try { return bareRoomName(SpreadsheetApp.getActive().getName()).slice(0, 40); } catch (e) { return ''; } }
/* 새 방: 이 스프레드시트를 복사한다 (붙어 있는 Apps Script도 같이 복사됨). 복사본에서 앱 기록 탭을 모두 비우고 룰만 정해 둔다.
 * 지금 방의 기록은 그대로 남는다. 복사본은 주인이 한 번 열어서 setup 실행 → 웹 앱 배포를 해야 쓸 수 있다 (구글 정책상 자동으로는 못 함). */
function newRoom(name, rule, pw) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) return { ok: false, error: '새 방 이름을 적어 주세요' };
  rule = RULES[rule] ? rule : ruleKey();
  const ss = SpreadsheetApp.getActive();
  const f = DriveApp.getFileById(ss.getId()).makeCopy(roomFileName(rule, name));
  const c = SpreadsheetApp.openById(f.getId());
  Object.keys(SH).forEach(k => { const sh = c.getSheetByName(SH[k]); if (sh) sh.clear(); });     // 대화·요약·정리·마스터 자료·토큰기록 등 앱 탭은 모두 비운다
  const cs = c.getSheetByName(SH.CONF);
  const rows = [['키', '값'], ['rule', rule], ['glossary', RULES[rule].gloss]];
  if (pw) rows.push(['roomPw', enc(String(pw))]);                  // 로비에서 정한 방 비밀번호 (Code.gs의 ROOM_PW보다 우선)
  if (cs) cs.getRange(1, 1, rows.length, 2).setNumberFormat('@').setValues(rows);
  return { ok: true, url: c.getUrl(), name, file: roomFileName(rule, name), rule: RULES[rule].name, ruleKey: rule,
    message: '새 방 "' + name + '"(' + RULES[rule].name + ')을 만들었어요. 지금 방의 기록은 그대로예요.' };
}
function setRule(k) {
  k = String(k || '');
  if (!RULES[k]) return { ok: false, error: '알 수 없는 룰이에요' };
  withLock(20000, () => { setConf('rule', k); bump('notesVer'); bump('charVer'); });
  fixRoomName();                                   // 방 이름 앞의 룰 약자도 맞춘다
  return { ok: true, rule: ruleInfo(), message: RULES[k].name + '로 바꿨어요. 이미 쌓인 용어집·기록은 그대로예요 (용어집은 직접 고쳐 주세요)' };
}
/* ───────────── 로비: 이 방을 "로비"로 쓰면, 여기에 다른 방 목록을 적어 둔다 ─────────────
 * [{name, rule, url}] 최대 30개. 방 비밀번호는 적지 않는다 (들어갈 때 각자 입력). */
const HUB_URL_RE = /^https:\/\/script\.google\.com\/(?:a\/[^\/]+\/)?macros\/s\/[A-Za-z0-9_\-]{10,}\/exec$/;
const SHEET_URL_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_\-]{20,}(?:\/[^\s"'<>]*)?$/;
// url: 방의 웹 앱 주소 (아직 배포 전이면 빈칸) · sheet: 그 방의 구글 시트 주소 (마스터에게만 보낸다)
function hubClean(list) {
  return (Array.isArray(list) ? list : []).filter(x => x && typeof x === 'object')
    .map(x => ({ name: String(x.name || '').trim().slice(0, 40) || '이름 없는 방', rule: RULES[x.rule] ? x.rule : 'etc',
                 url: HUB_URL_RE.test(String(x.url || '')) ? String(x.url) : '', sheet: SHEET_URL_RE.test(String(x.sheet || '')) ? String(x.sheet) : '' }))
    .filter(x => x.url || x.sheet)
    .filter((x, i, a) => a.findIndex(y => (x.url && y.url === x.url) || (!x.url && x.sheet && y.sheet === x.sheet)) === i).slice(0, 30);
}
function hubList() { return { ok: true, title: roomTitle(), rule: ruleKey(), bat: credPct(), rooms: hubClean(confJson('hubRooms', [])).filter(x => x.url).map(x => ({ name: x.name, rule: x.rule, url: x.url })), rules: Object.keys(RULES).map(k => ({ key: k, abbr: RULES[k].abbr, name: RULES[k].name })) }; }
// 로비에서 방 개설: 이 시트를 복사해 새 방을 만들고(newRoom), 방 비밀번호를 새 시트의 설정에 넣고, 로비 목록에 "배포 대기"로 올린다
function hubNewRoom(name, rule, pw) {
  pw = String(pw || '').trim();
  if (!pw) return { ok: false, error: '새 방 비밀번호를 정해 주세요' };
  if (keeperPwOk(pw)) return { ok: false, error: '방 비밀번호는 마스터 비밀번호와 달라야 해요' };
  const r = newRoom(name, rule, pw);
  if (!r.ok) return r;
  const rooms = hubClean(confJson('hubRooms', []));
  rooms.push({ name: r.name, rule: r.ruleKey, url: '', sheet: r.url });
  const saved = hubSave(rooms);
  return Object.assign(r, { rooms: saved.rooms });
}
function hubSave(list) {
  const rooms = hubClean(list);
  withLock(20000, () => setJson('hubRooms', rooms));
  return { ok: true, rooms };
}
function versions() {
  const job = liveJob();
  return {
    session: getConf('session'), sumVer: getConf('sumVer'), notesVer: getConf('notesVer'),
    charVer: getConf('charVer'), imgVer: getConf('imgVer'), resetVer: getConf('resetVer') || '0',
    colorVer: getConf('colorVer') || '0', processedId: Number(getConf('processedId') || 0),
    total: totalLines(), nq: notesQ().length, job: job ? { kind: job.kind, at: job.at, prog: getProg(job) } : null, proc: confJson('procStatus', null)
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
function evidence(uids, ids, rv, ctx, session) {
  ctx = Math.max(0, Math.min(ctx, 5));
  const rows = allLineRows();
  const only = /^\d{1,5}$/.test(String(session || '')) ? String(session) : '';      // 세션을 정하면 그 세션의 줄만 (다른 회차의 번호·앞뒤 줄은 보여 주지 않는다)
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
  if (ids.length && (!rv || rv === curRv)) ids.slice(0, 20).forEach(n => { if (n > 0 && rows[n - 1] && rows[n - 1].id === n && (!only || rows[n - 1].session === only)) pos.push(n - 1); else missing.push('#' + n); });
  else if (ids.length) missing.push('기록이 초기화돼서 원문이 없어요');
  const focus = new Set(pos.map(i => rows[i].id));
  const take = new Set();
  pos.forEach(i => { for (let k = Math.max(0, i - ctx); k <= Math.min(rows.length - 1, i + ctx); k++) if (!only || rows[k].session === only) take.add(k); });
  const lines = Array.from(take).sort((a, b) => a - b).map(i => Object.assign({}, rows[i], { focus: focus.has(rows[i].id) }));
  return { ok: true, lines, missing };
}

function allData() {
  const ss = SpreadsheetApp.getActive();
  const sums = ss.getSheetByName(SH.SUM).getDataRange().getValues().slice(1)
    .map((r, i) => ({ id: i + 2, session: String(r[0]), from: String(r[1]), to: String(r[2]), text: decS(r[3]), seg: String(r[5] || '') }));
  const chars = ss.getSheetByName(SH.CHAR).getDataRange().getValues().slice(1)
    .map(r => { let c = {}; try { c = JSON.parse(decS(r[2]) || '{}'); } catch (e) {} return Object.assign({}, cardClean(c), { tab: decS(r[0]), player: decS(r[1]), portrait: decS(r[5]) }); });
  const imgs = ss.getSheetByName(SH.IMG).getDataRange().getValues().slice(1)
    .map(r => { let a = {}; try { a = JSON.parse(decS(r[4]) || '{}'); } catch (e) {} return { time: String(r[0]), session: String(r[1]), url: decS(r[3]), title: a.title || '', text: a.text || '', description: a.description || '' }; });
  return {
    ok: true, v: versions(), summaries: sums, notes: readNotes() || emptyNotes(), characters: chars, images: imgs,
    story: storyText(), rule: ruleInfo(), roomTitle: roomTitle(), glossary: getConf('glossary'), keeperName: getConf('keeperName') || '',
    charUrl: getConf('charUrl'), charMap: confJson('charMap', []), colors: confJson('colors', {}),
    corrections: confJson('corrections', []),
    recap: confJson('recap', null), awards: confJson('awards', null),     // 마스터가 '공개'를 누른 것만 들어 있다
    bookmarks: confJson('bookmarks', [])
  };
}

/* ───────────── 📌 북마크: 요약 타임라인의 한 줄을 누구나 표시 ─────────────
 * {sid: 요약 줄 번호(시트 행), text: 그 줄 글자, by, at, session} 최대 200개. 요약을 고쳐 글이 바뀌면 화면의 "북마크 모음"에만 남는다. */
function bookmark(b) {
  const sid = Number(b.sid), text = String(b.text || '').trim().slice(0, 400);
  if (!sid || !text) return { ok: false, error: '북마크할 줄을 찾지 못했어요' };
  return withLock(20000, () => {
    let list = confJson('bookmarks', []);
    const i = list.findIndex(x => x && x.sid === sid && x.text === text);
    if (b.on === false) { if (i >= 0) list.splice(i, 1); }
    else if (i < 0) list.push({ sid, text, by: String(b.name || '').trim().slice(0, 40), at: now(), session: String(b.session || getConf('session') || '') });
    list = list.slice(-200);
    setJson('bookmarks', list); bump('sumVer');
    return { ok: true, bookmarks: list };
  });
}

/* ───────────── 🧭 다음 할 일: 지금까지의 공개 기록으로 "다음에 해 볼 만한 것"을 추천 ─────────────
 * 요약·정리·북마크가 바뀌었을 때만 새로 만든다 (그대로면 저장된 것을 돌려줌). 마스터 자료는 보지 않는다(publicAi). */
const NEXT_KINDS = ['장소', '인물', '단서', '행동', '준비'];
function nextSteps(force) {
  const key = [getConf('sumVer'), getConf('notesVer'), getConf('session'), getConf('resetVer')].join('.');
  const cur = confJson('nextSteps', null);
  if (cur && cur.key === key && !force) return { ok: true, next: cur, fresh: true };
  if (cur && force && Date.now() - Number(cur.t || 0) < 60 * 1000) return { ok: true, next: cur, fresh: cur.key === key, wait: true };
  const sums = sheet(SH.SUM);
  const sess = String(getConf('session') || '1');
  const rows = sums.getLastRow() >= 2 ? sums.getRange(2, 1, sums.getLastRow() - 1, 4).getValues() : [];
  const recent = rows.filter(r => String(r[0]) === sess).map(r => decS(r[3])).filter(t => t && !/\(잡담 위주, 진행 없음\)/.test(t)).slice(-6);
  const story = storyTail(2500);
  if (!recent.length && !story.trim()) return { ok: true, next: null, empty: true };
  const c = roomCache();
  if (c.get('nextBusy')) return { ok: true, next: cur, busy: true };
  c.put('nextBusy', '1', 150);
  try {
    const n = readNotes() || emptyNotes();
    const nm = x => x.name || x.title || '';
    const places = (n.places || []).map(x => '- ' + nm(x) + (x.desc ? ': ' + String(x.desc).slice(0, 80) : '') + (x.found ? ' / 발견: ' + String(x.found).slice(-160) : '')).join('\n');
    const npcs = (n.npcs || []).map(x => '- ' + nm(x) + (x.affil ? ' (' + x.affil + ')' : '') + (x.relation ? ': ' + String(x.relation).slice(0, 80) : '')).join('\n');
    const clues = (n.clues || []).filter(x => x.status !== '해결').slice(-40).map(x => '- [' + (x.kind || '확인') + '] ' + String(x.text || '').slice(0, 140)).join('\n');
    const bms = confJson('bookmarks', []).filter(x => x.session === sess).slice(-15).map(x => '- ' + String(x.text).replace(/\s*\(#[^)]*\)/g, '')).join('\n');
    const sys = 'TRPG 세션의 공개 기록(줄거리·요약·정리)을 읽고, 플레이어들이 다음에 해 볼 만한 것을 추천하는 조수다. ' +
      '기록에 나온 사실만 근거로 삼고, 시나리오의 숨은 진실을 지어내거나 단정하지 마라. 이미 끝낸 일은 다시 권하지 마라. ' +
      '플레이어가 북마크한 내용과 풀리지 않은 단서를 우선 고려하라. 짧고 구체적으로, 한국어로.';
    const stable = '## 룰\n' + ruleInfo().name + '\n\n## 출력 형식 (JSON 하나만)\n' +
      '{"items":[{"kind":"' + NEXT_KINDS.join('|') + '","title":"한 줄 제안 (예: 장미 정원의 분수대를 조사한다)","why":"그렇게 권하는 이유 한 문장 (기록 근거)","target":"관련 장소·인물 이름 (정리 목록의 이름 그대로, 없으면 빈칸)","prio":1}]}\n' +
      '규칙: 5~8개. prio는 1(가장 중요)~3. kind 장소=가 볼 곳, 인물=만나거나 물어볼 사람, 단서=확인·대조할 단서, 행동=해 볼 행동·판정, 준비=챙길 것·조심할 것. 같은 내용을 겹치지 마라.';
    const fresh = '## 누적 줄거리 (끝부분)\n' + (story || '(없음)') + '\n\n## 이번 세션 최근 요약\n' + (recent.join('\n\n') || '(없음)') +
      '\n\n## 장소\n' + (places || '(없음)') + '\n\n## NPC\n' + (npcs || '(없음)') + '\n\n## 풀리지 않은 단서\n' + (clues || '(없음)') +
      '\n\n## 플레이어가 북마크한 장면\n' + (bms || '(없음)');
    const r = publicAi(() => parseJson(claude(sys, [stable, fresh], 2500)));
    const items = (Array.isArray(r.items) ? r.items : []).filter(x => x && x.title).slice(0, 10).map(x => ({
      kind: NEXT_KINDS.indexOf(String(x.kind)) >= 0 ? String(x.kind) : '행동', title: String(x.title).slice(0, 160), why: String(x.why || '').slice(0, 240),
      target: String(x.target || '').slice(0, 60), prio: Math.min(3, Math.max(1, Number(x.prio) || 2)) })).sort((a, b) => a.prio - b.prio);
    const o = { key, t: Date.now(), at: now(), items };
    withLock(20000, () => setJson('nextSteps', o));
    return { ok: true, next: o, fresh: true };
  } finally { c.remove('nextBusy'); }
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
    s.getRange(id, 4).setValue(enc(String(text || '').slice(0, 20000)));
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
    try { const c = JSON.parse(decS(r[2]) || '{}'); if (c.name) terms.add(c.name); } catch (e) {}
  });
  return { ok: true, token: j.access_token, keyterms: Array.from(terms).slice(0, 80) };
}

/* ───────────── Claude 호출 ───────────── */
/* AI 호출. 실패하면 종류(kind)를 붙여서 던진다 → 다시 시도할지, 양을 줄일지, 키를 확인할지 판단할 수 있게.
 *  fetch: 연결 실패·응답 지연 (Apps Script가 바깥 요청을 기다리는 시간에는 한도가 있다. 정확한 값은 공식 문서에 없다)
 *  truncated: 답이 max_tokens를 넘어 잘림 / parse: 답이 JSON이 아님 / rate: 호출 제한(429) / server: Claude 쪽 일시 오류(5xx)
 *  auth: 키·권한 문제(401·403) / bad: 요청이 거부됨(400·413 등)
 * 답이 길어질수록 지연·잘림이 늘어나므로 호출마다 max_tokens를 작게 잡는다. */
function aiErr(kind, msg) { const e = new Error(msg); e.kind = kind; return e; }
/* 프롬프트 캐싱: 지시문(system)은 늘 캐시 표시를 붙인다. content를 [바뀌지 않는 앞부분, 매번 바뀌는 뒷부분] 배열로 주면
 * 앞부분까지 캐시한다. 같은 앞부분으로 5분 안에 다시 부르면 그 부분 입력비가 크게 줄어든다 (짧으면 저절로 캐시되지 않을 뿐 오류는 없다). */
function cacheBlocks(parts) {
  const b = parts.filter(x => x != null && String(x) !== '').map(x => ({ type: 'text', text: String(x) }));
  if (b.length) b[b.length - 1].cache_control = { type: 'ephemeral' };
  return b;
}
function aiBody(model, maxTokens, sys, msg, effort) {
  const b = { model, max_tokens: maxTokens || 4000, system: sys.length ? sys : undefined, messages: [{ role: 'user', content: msg }] };
  if (effort && AI_EFFORT && aiFeature().indexOf('마스터') !== 0) b.output_config = { effort: AI_EFFORT };      // 마스터 도구(시나리오 정리·NPC 대사 등)는 기본값 그대로
  return b;
}
function claude(system, content, maxTokens, model) {
  let r; model = model || MODEL;
  const sys = cacheBlocks([system]);
  let msg;
  if (Array.isArray(content) && content.length && typeof content[0] === 'string') {      // 글자 배열만 [앞부분, 뒷부분]으로 본다 (이미지 블록 배열은 그대로 보낸다)
    const head = cacheBlocks([content[0]]), tail = content.slice(1).filter(x => x != null && String(x) !== '').map(x => ({ type: 'text', text: String(x) }));
    msg = tail.length ? head.concat(tail) : head;
  } else msg = content;
  try {
    r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
      method: 'post', contentType: 'application/json',
      headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
      payload: JSON.stringify(aiBody(model, maxTokens, sys, msg, true)),
      muteHttpExceptions: true
    });
    // 생각 양 설정을 이 모델이 받지 않으면 (400) 설정 없이 한 번 더 보낸다
    if (r.getResponseCode() === 400 && AI_EFFORT && /effort|output_config/i.test(r.getContentText())) {
      r = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
        method: 'post', contentType: 'application/json',
        headers: { 'x-api-key': CLAUDE_KEY, 'anthropic-version': '2023-06-01' },
        payload: JSON.stringify(aiBody(model, maxTokens, sys, msg, false)),
        muteHttpExceptions: true
      });
    }
  } catch (e) {
    throw aiErr('fetch', 'AI 서버 응답을 받지 못했어요 (연결이 끊겼거나 응답이 너무 늦었어요). 잠시 뒤 다시 시도하고, 되풀이되면 한 번에 보내는 양을 줄여 주세요 · ' + String(e && e.message || e).slice(0, 120));
  }
  const code = r.getResponseCode();
  if (code !== 200) {
    const body = r.getContentText().slice(0, 200);
    if (code === 401 || code === 403) throw aiErr('auth', 'Claude API 키가 맞지 않거나 권한이 없어요 (' + code + '). Code.gs 맨 위의 키를 확인해 주세요');
    if (code === 429) throw aiErr('rate', 'Claude 호출 제한에 걸렸어요 (429). 1~2분 뒤 다시 시도해 주세요');
    if (code >= 500) throw aiErr('server', 'Claude 서버가 일시적으로 응답하지 못했어요 (' + code + '). 잠시 뒤 다시 시도해 주세요');
    throw aiErr('bad', 'Claude가 요청을 받지 않았어요 (' + code + '). 보낸 내용이 너무 길거나 형식이 맞지 않을 수 있어요 · ' + body);
  }
  const j = JSON.parse(r.getContentText());
  logTokens(model, j.usage, j.stop_reason);
  try { if (j.usage) credSpend(costUsd(model, j.usage)); } catch (e) {}
  if (j.stop_reason === 'max_tokens') throw aiErr('truncated', 'AI 답이 정해 둔 길이를 넘어 중간에 끊겼어요. 한 번에 보내는 양(구간·조각)을 줄이면 해결돼요');
  return j.content.filter(c => c.type === 'text').map(c => c.text).join('');
}
/* ── 토큰 기록: 호출마다 어느 기능이 얼마를 썼는지 '토큰기록' 시트에 한 줄 (실패해도 본 작업에는 영향 없음) */
const AI_FEATURES = [
  ['summarizeGroup', '요약'], ['extractNotes', 'NPC·장소·단서 정리'], ['refineItem', 'AI에게 다시 맡기기'], ['buildPc', '특징 만들기'],
  ['compactStory', '줄거리 다듬기'], ['correct', 'AI 정정'], ['cardFor', '캐릭터시트 읽기'], ['addImage', '이미지 분석'],
  ['kOcr', '마스터: 자료 글자 읽기'], ['kDigestStep', '마스터: 시나리오 정리'], ['kTruthPolish', '마스터: 진상 다듬기'], ['kNpc', '마스터: NPC 대사'],
  ['kRoll', '마스터: 판정 도움'], ['kBoard', '마스터: 단서 보드'], ['kRecap', '마스터: 지난 회차'], ['kAwardsCompare', '마스터: 시상 비교'],
  ['kAwards', '마스터: 시상'], ['kFeedback', '마스터: 피드백'], ['selfTestAi', '연결 확인'], ['nextSteps', '다음 할 일']
];
function aiFeature() {
  const st = String((new Error()).stack || '');
  let best = null, at = 1e9;
  AI_FEATURES.forEach(([fn, lb]) => { const m = st.search(new RegExp('\\b' + fn + '\\b')); if (m >= 0 && m < at) { at = m; best = lb; } });
  return best || '기타';
}
function logTokens(model, u, stop) {
  try {
    if (!u) return;
    const ss = SpreadsheetApp.getActive();
    let sh = ss.getSheetByName(SH.TOK);
    if (!sh) sh = ss.insertSheet(SH.TOK);
    if (sh.getLastRow() === 0) { sh.getRange(1, 1, 1, 7).setValues([['시각', '세션', '기능', '모델', '입력 토큰', '출력 토큰', '비고']]); try { sh.setFrozenRows(1); } catch (e) {} }
    if (sh.getMaxColumns() < 9 || !sh.getRange(1, 8).getValue()) { if (sh.getMaxColumns() < 9) sh.insertColumnsAfter(sh.getMaxColumns(), 9 - sh.getMaxColumns()); sh.getRange(1, 8, 1, 2).setValues([['캐시 읽기', '캐시 쓰기']]); }
    // 입력 토큰 = 캐시 없이 읽은 양 + 캐시에 새로 쓴 양 (둘 다 제값 이상을 낸다). 캐시 읽기는 입력값의 약 1/10~1/20
    const cw = Number(u.cache_creation_input_tokens || 0), cr = Number(u.cache_read_input_tokens || 0);
    sh.appendRow([now(), String(getConf('session') || ''), aiFeature(), String(model).replace('claude-', ''), Number(u.input_tokens || 0) + cw, Number(u.output_tokens || 0), stop === 'max_tokens' ? '길이 초과로 끊김' : '', cr, cw]);
    if (sh.getLastRow() > 6000) sh.deleteRows(2, 1000);               // 아주 오래된 기록은 지운다
  } catch (e) {}
}
/* ── 남은 잔액 (로비 화면 위젯, 마스터만) ──
 * 딥그램: 잔액 API(/v1/projects/{id}/balances)로 실제 잔액을 읽는다 (10분 캐시).
 * 클로드: 일반 API 키로는 잔액을 읽을 수 없어서, 마스터가 콘솔(Billing)에서 본 잔액을 한 번 적으면
 *   그 뒤 이 프로그램이 부른 만큼(토큰 × 단가)을 빼서 보여 준다. 다른 곳에서 같은 키를 쓰면 그만큼 어긋나니 가끔 다시 적는다.
 * 라이브러리 방식이면 스크립트 속성·캐시가 엔진 하나라서 모든 방의 사용량이 한곳에 모인다. */
const PRICE = {                          // 100만 토큰당 달러: [입력, 출력, 캐시 읽기]. 캐시 쓰기는 입력의 1.25배
  'claude-sonnet-5-5': [2, 10, 0.10],
  'claude-haiku-5-5':  [0.10, 0.50, 0.01],   // 입력 10만 토큰 이하. 넘으면 아래에서 [0.5, 2.5, 0.05]
  'claude-opus-5-5':   [10, 50, 0.50]
};
function costUsd(model, u) {
  const m = String(model || '');
  const inp = Number(u.input_tokens || 0), out = Number(u.output_tokens || 0);
  const cw = Number(u.cache_creation_input_tokens || 0), cr = Number(u.cache_read_input_tokens || 0);
  let p = PRICE[m] || (/haiku/.test(m) ? PRICE['claude-haiku-5-5'] : /opus/.test(m) ? PRICE['claude-opus-5-5'] : PRICE['claude-sonnet-5-5']);
  if (/haiku-5-5/.test(m) && inp + cw + cr > 100000) p = [0.5, 2.5, 0.05];
  return (inp * p[0] + cw * p[0] * 1.25 + cr * p[2] + out * p[1]) / 1e6;
}
function credGet() { try { return JSON.parse(PropertiesService.getScriptProperties().getProperty('credits') || '{}') || {}; } catch (e) { return {}; } }
function credEdit(fn) {
  const l = LockService.getScriptLock(); let got = false;
  try { got = l.tryLock(3000); } catch (e) {}
  try { const c = credGet(); fn(c); PropertiesService.getScriptProperties().setProperty('credits', JSON.stringify(c)); return c; }
  finally { if (got) try { l.releaseLock(); } catch (e) {} }
}
function credSpend(usd) { if (usd > 0) credEdit(c => { c.spent = (Number(c.spent) || 0) + usd; }); }
function credits(force) {
  const c = credGet(), spent = Number(c.spent) || 0;
  const o = { ok: true };
  if (c.base != null && c.base !== '') {
    const base = Number(c.base) || 0;
    o.claude = { ok: true, left: Math.max(0, base - spent), base, top: Number(c.top) || base, spent, at: c.at || '' };
  } else o.claude = { ok: false, unset: true, spent };
  o.deepgram = dgBalance(force);
  return o;
}
// 로비 맨 위 배터리용: 누구나 보는 화면이라 금액은 빼고 퍼센트만 (모르면 null)
function credPct() {
  const pct = d => d && d.ok && d.top > 0 ? Math.max(0, Math.min(100, Math.round(d.left / d.top * 100))) : null;
  try { const c = credits(false); return { c: pct(c.claude), d: pct(c.deepgram) }; } catch (e) { return { c: null, d: null }; }
}
function creditsSet(b) {
  const num = v => (v === '' || v == null) ? null : Number(String(v).replace(/[$,\s]/g, ''));
  const bal = num(b.claude), top = num(b.claudeTop), dgTop = num(b.dgTop);
  for (const v of [bal, top, dgTop]) if (v != null && !(v >= 0 && v < 1e6)) return { ok: false, error: '금액은 0 이상의 숫자로 적어 주세요' };
  credEdit(c => {
    if (bal != null) { c.base = bal; c.spent = 0; c.at = now(); c.top = top != null && top >= bal ? top : bal; }
    else if (top != null) c.top = top;
    if (b.dgTop !== undefined) c.dgTop = dgTop;            // 비우면 자동(본 적 있는 가장 큰 잔액)
  });
  try { CacheService.getScriptCache().remove('dgBal'); } catch (e) {}
  return credits(true);
}
function dgBalance(force) {
  const cache = CacheService.getScriptCache();
  if (!force) { try { const v = cache.get('dgBal'); if (v) return JSON.parse(v); } catch (e) {} }
  let o;
  try {
    if (!DEEPGRAM_KEY || /여기에/.test(DEEPGRAM_KEY)) throw new Error('엔진 Code.gs에 딥그램 키가 없어요');
    const h = { headers: { Authorization: 'Token ' + DEEPGRAM_KEY }, muteHttpExceptions: true };
    const r1 = UrlFetchApp.fetch('https://api.deepgram.com/v1/projects', h);
    if (r1.getResponseCode() !== 200) throw new Error('딥그램이 키를 받지 않았어요 (' + r1.getResponseCode() + ')');
    const ps = JSON.parse(r1.getContentText()).projects || [];
    let amt = 0, units = 'usd', n = 0, code = 0;
    ps.forEach(p => {
      const r = UrlFetchApp.fetch('https://api.deepgram.com/v1/projects/' + encodeURIComponent(p.project_id) + '/balances', h);
      if (r.getResponseCode() !== 200) { code = r.getResponseCode(); return; }
      (JSON.parse(r.getContentText()).balances || []).forEach(x => { amt += Number(x.amount) || 0; units = x.units || units; n++; });
    });
    if (!n && code) throw new Error(code === 403 ? '이 딥그램 키는 잔액을 볼 권한이 없어요. 딥그램 콘솔에서 권한이 Owner나 Admin인 키를 만들어 엔진 Code.gs에 넣어 주세요' : '딥그램 잔액을 읽지 못했어요 (' + code + ')');
    if (!n) throw new Error('딥그램 프로젝트에 잔액 정보가 없어요');
    const c = credEdit(cc => { if (!(Number(cc.dgMax) >= amt)) cc.dgMax = amt; });
    const top = Number(c.dgTop) > 0 ? Number(c.dgTop) : Number(c.dgMax) || amt;
    o = { ok: true, left: amt, units: String(units).toLowerCase(), top: Math.max(top, amt), auto: !(Number(c.dgTop) > 0) };
  } catch (e) { o = { ok: false, error: String(e && e.message || e).slice(0, 200) }; }
  try { cache.put('dgBal', JSON.stringify(o), o.ok ? 600 : 60); } catch (e) {}
  return o;
}
// 마스터 탭: 기능별 사용량 (이번 세션 / 최근 24시간)
function tokenUsage() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SH.TOK);
  const out = { session: String(getConf('session') || ''), rows: 0, byS: [], byD: [], tot: { s: [0, 0, 0, 0], d: [0, 0, 0, 0] } };
  if (!sh || sh.getLastRow() < 2) return out;
  const nc = Math.min(8, sh.getLastColumn());
  const rows = sh.getRange(2, 1, sh.getLastRow() - 1, nc).getValues();
  const since = Date.now() - 24 * 3600 * 1000;
  const agg = {}, aggD = {};
  rows.forEach(r => {
    const t = new Date(String(r[0]).replace(' ', 'T')).getTime();
    const cr = Number(r[7]) || 0;
    const add = (o, tt) => { const k = String(r[2]) + ' · ' + String(r[3]); o[k] = o[k] || [0, 0, 0, 0]; o[k][0]++; o[k][1] += Number(r[4]) || 0; o[k][2] += Number(r[5]) || 0; o[k][3] += cr; tt[0]++; tt[1] += Number(r[4]) || 0; tt[2] += Number(r[5]) || 0; tt[3] += cr; };
    if (String(r[1]) === out.session) add(agg, out.tot.s);
    if (!isNaN(t) && t >= since) add(aggD, out.tot.d);
  });
  const list = o => Object.keys(o).map(k => ({ k, n: o[k][0], i: o[k][1], o: o[k][2], c: o[k][3] })).sort((a, b) => (b.i + b.o * 5 + b.c / 10) - (a.i + a.o * 5 + a.c / 10));
  out.byS = list(agg); out.byD = list(aggD); out.rows = rows.length;
  return out;
}
/* 공개 기록용 AI 작업(요약·정정·이미지 분석·캐릭터 읽기)은 이 안에서만 돌린다.
 * 이 안에서는 마스터 자료를 읽는 함수가 모두 오류를 내므로, 실수로라도 비밀이 요약에 섞일 수 없다. */
let _publicAi = 0;
function publicAi(fn) { _publicAi++; try { return fn(); } finally { _publicAi--; } }
function keeperOnly(what) { if (_publicAi) throw new Error('공개 기록용 AI 작업에서는 마스터 자료(' + what + ')를 읽을 수 없어요'); }
function parseJson(text) {
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  if (a < 0 || b < a) throw aiErr('parse', 'AI 답이 약속한 형식(JSON)이 아니에요. 다시 시도해 주세요');
  try { return JSON.parse(text.slice(a, b + 1)); } catch (e) { throw aiErr('parse', 'AI 답의 형식이 깨져 있어요. 다시 시도해 주세요'); }
}

/* ───────────── 5분마다 (그 사이에는 "지금 요약" 버튼으로 누구나 요청) ───────────── */
function tick() {
  try {
    if (!quietSkip()) { const r = processNow(false); if (r && r.ok && r.more && r.progress) scheduleMore(); }
  } catch (e) { Logger.log(e); }
  try { if (Date.now() - Number(getConf('lastCharCheck') || 0) > 30 * 60 * 1000) refreshCharacters(false); } catch (e) { Logger.log(e); }
}

/* 자동 요약을 이번엔 쉴지: 새 대화가 조금뿐이거나(SUM_MIN_CHARS 미만) 마스터 발언이 없으면 쉰다.
 * 그래도 마지막 자동 요약에서 SUM_MAX_WAIT가 지났거나, 새 대화가 아예 없거나(AI를 부르지 않음), 정리 대기가 있으면 평소처럼 돈다.
 * 손으로 누르는 "지금 요약"과 밀린 것을 잇는 tickMore는 이 검사를 거치지 않는다. */
function quietSkip() {
  const c = roomCache();
  const last = Number(c.get('lastAutoSum') || 0);
  const go = () => { c.put('lastAutoSum', String(Date.now()), 21600); return false; };
  if (!last || Date.now() - last >= SUM_MAX_WAIT) return go();
  if (notesQ().length) return go();
  const processed = Number(getConf('processedId') || 0), total = totalLines();
  if (total <= processed) return go();
  const rows = readLines(processed, Math.min(total - processed, 400));
  const chars = rows.reduce((n, l) => n + (isFiller(l.text) ? 0 : String(l.text).replace(/\s+/g, '').length), 0);      // 추임새를 뺀 실제 발언 글자 수
  const keeper = String(getConf('keeperName') || '').trim();
  const keeperSpoke = !keeper || rows.some(l => l.name === keeper);
  if (chars >= SUM_MIN_CHARS && keeperSpoke) return go();
  if (total - processed >= WINDOW_LINES) return go();            // 줄 수가 이미 한 구간만큼 쌓였으면 기다리지 않는다
  return true;
}

// 밀렸을 때: 다음 5분 정각을 기다리지 않고 1분 뒤에 이어서 정리한다 (진전이 있을 때만 이어 예약 → 계속 실패하면 반복하지 않는다)
function scheduleMore() {
  try {
    if (ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'tickMore')) return;
    ScriptApp.newTrigger('tickMore').timeBased().after(60 * 1000).create();
  } catch (e) { Logger.log('이어서 정리 예약 실패: ' + e); }
}
function tickMore() {
  ScriptApp.getProjectTriggers().forEach(t => { if (t.getHandlerFunction() === 'tickMore') ScriptApp.deleteTrigger(t); });
  try { const r = processNow(false); if (r && r.ok && r.more && r.progress) scheduleMore(); } catch (e) { Logger.log(e); }
}

const NOTES_RULE =
  '정리(notes) 규칙: places=[{id,name,aka,desc,found_add,src}] 장소와 거기서 일어난 일·발견한 것. 기존 장소의 found(지금까지 적힌 내용)는 다시 쓰지 말고, 이번 대화에서 새로 일어난 일·발견한 것만 found_add에 한두 문장으로 적어라(덧붙여 저장된다). desc는 바뀔 때만 적어라. ' +
  'npcs=[{id,name,aka,affil,age,traits,said,relation,src}] NPC의 소속·직업(affil), 나이(age, 언급됐을 때만), 캐릭터성(성격·말투·행동 습관을 쉼표로 구분한 짧은 말들. 대화에서 드러난 것만), 가장 인상적인 대사 한두 개(said), 탐사자들과의 관계, ' +
  'pcs=[{id,name,aka,player,traits,said,relation,src}] 탐사자(플레이어 캐릭터)의 특징. name은 "플레이어 = 캐릭터" 목록의 캐릭터 이름(목록에 없으면 플레이어 이름), player는 플레이어 이름, ' +
  'traits는 그 플레이어 본인의 발언·결정(캐릭터로서 한 말과 행동, 선택)에서 드러난 성격·말투·행동 습관·판단 성향을 쉼표로 구분한 짧은 말들(최대 8개), said는 가장 인상적인 발언 1~2개, relation은 동료·NPC와의 관계. ' +
  '마스터의 묘사나 판정 요구만으로는 탐사자의 특징을 적지 마라. 이번 대화에서 새로 드러난 특징이 있을 때만 출력하고, 출력할 때는 기존 특징과 합쳐 전체를 다시 써라. ' +
  'clues=[{id,text,status,kind,src}] 얻은 정보와 단서. status는 "미해결" 또는 "해결". ' +
  'kind는 "확인"(마스터 묘사나 판정 결과로 확인된 사실), "주장"(NPC가 한 말이라 사실인지 모름. text에 "OO는 ~라고 주장함"처럼 누가 말했는지 적는다), "추측"(탐사자의 추리·의심) 중 하나. ' +
  'handouts=[{id,title,text,src}] 핸드아웃 내용. ' +
  'aka(장소·NPC·탐사자)=그 대상이 대화에서 정식 이름 말고 다르게 불린 말을 쉼표로: 이름만·성만(예: "루시 프레이저"→"루시, 프레이저"), 별명·호칭(예: "프레이저 양"), 받아쓰기·발음 차이로 다르게 적힌 표기(예: "해켓"↔"헤켓", "브라이든"↔"브라이던"), 장소의 줄임말(예: "보든 암스 호텔"→"호텔, 보든 암스"), 방·층(예: "312호")은 aka가 아니라 따로 장소로. 새로 드러난 것만 적으면 기존 것에 더해진다. 다른 대상과 헷갈릴 말은 넣지 마라. ' +
  'src는 그 내용의 근거가 된 발언 번호 배열(예: [12,15], 1~5개, 대화에 #번호로 표시됨). 대화가 아니라 이미지에서 나온 내용이면 src는 비운다. ' +
  '기존 항목은 id를 그대로 유지하고, 새 항목은 id를 비워라. 바뀐 항목과 새 항목만 출력하고, 바뀐 항목은 id와 바뀐 칸만 적어라(적지 않은 칸은 그대로 남는다). 바뀌지 않은 항목은 출력하지 마라. 같은 대상을 새 항목으로 또 만들지 말고 기존 id에 보강하라. ' +
  '"locked":true 인 항목은 사람이 직접 확정한 내용이니 출력하지 말고 건드리지 마라. ' +
  'deleted 목록에 있는 대상은 사람이 지운 것이니 다시 만들지 마라.';

const FACT_RULES =
  '사실 구분 규칙 (매우 중요): ' +
  '① 마스터의 상황 묘사·지문은 이야기 속 사실로 적는다. ' +
  '② 마스터가 NPC로서 한 말은 사실이 아니라 그 NPC의 주장이다. "OO는 ~라고 말함/주장함"으로 적고 사실처럼 단정하지 마라. ' +
  '예: 마스터가 집사로서 "난 서재에 안 갔어" → "집사는 서재에 가지 않았다고 주장함". ' +
  '③ 플레이어(탐사자)의 추리·의심·가설은 사실로 적지 말고 "(추측)"을 붙여라. 예: "(추측) 프레이피스는 집사가 범인이라고 의심함". ' +
  '④ 판정은 성공/실패나 수치 변화가 말로 선언된 것만 "[판정]"을 붙여 적는다. 예: "[판정] 프레이피스 도서관 이용 성공". 선언되지 않은 결과를 짐작하지 마라. ';

function keeperRules() {
  return R().hint + '가장 중요한 원칙: 마스터의 발언은 이야기의 정보 그 자체다. 마스터가 말한 묘사, NPC 대사, 장소·물건·단서 정보, 판정 요구와 그 결과는 ' +
    '문장을 다듬어 줄이더라도 내용은 하나도 빠뜨리지 말고 요약과 정리에 담아라. 플레이어 발언은 행동과 결정 위주로 줄여도 된다. ';
}
function correctionsText() {
  const c = confJson('corrections', []);
  return c.length ? c.map(x => '- ' + x.text).join('\n') : '(없음)';
}
// 캐릭터시트에 연결된 "플레이어 = 캐릭터" 짝
function charPairs() {
  try {
    return sheet(SH.CHAR).getDataRange().getValues().slice(1).map(r => { let c = {}; try { c = JSON.parse(decS(r[2]) || '{}'); } catch (e) {} return { player: String(decS(r[1]) || '').trim(), name: String(c.name || decS(r[0]) || '').trim() }; }).filter(x => x.player || x.name);
  } catch (e) { return []; }
}
// 카드의 이름(캐릭터 이름일 수도, 플레이어 이름일 수도)으로 실제로 말한 사람(플레이어 이름)을 찾는다
function pcPlayerOf(x) {
  x = String(x || '').trim(); if (!x) return '';
  const pairs = charPairs();
  if (pairs.some(p => p.player === x)) return x;
  const hit = pairs.find(p => p.name && (p.name === x || p.name.split(/\s+/)[0] === x || x.split(/\s+/)[0] === p.name.split(/\s+/)[0]));
  return hit && hit.player ? hit.player : x;
}
// 세션마다 플레이어별로 자동으로 탐사자 특징을 만든다: 이 세션에서 25줄 넘게 말하면 1번, 150줄을 넘기면 1번 더 (플레이어마다 세션당 최대 2번)
const PC_AUTO = [25, 150];
function autoPcQueue() {
  const s = sheet(SH.LINES), last = s.getLastRow();
  if (last < 2) return;
  const sess = String(getConf('session') || '1'), keeper = String(getConf('keeperName') || '').trim();
  const from = Math.max(2, last - 2000 + 1);
  const cnt = {};
  s.getRange(from, 3, last - from + 1, 3).getValues().forEach(r => {
    if (String(r[0]) !== sess) return;
    const nm = String(decS(r[1]) || '').trim(), t = String(decS(r[2]) || '').trim();
    if (!nm || nm === keeper || t.length < 4) return;
    cnt[nm] = (cnt[nm] || 0) + 1;
  });
  // 마스터가 누구인지 모르면 마스터 말을 탐사자로 착각할 수 있다: 캐릭터시트에 연결된 플레이어만, 그것도 없으면 건너뛴다
  const pl = charPairs().map(p => p.player).filter(Boolean);
  let names = Object.keys(cnt);
  if (pl.length && names.some(n => pl.indexOf(n) >= 0)) names = names.filter(n => pl.indexOf(n) >= 0);
  else if (!keeper) return;
  withLock(20000, () => {
    let st = confJson('pcAuto', null);
    if (!st || st.s !== sess) st = { s: sess, d: {} };
    let changed = false;
    names.sort((a, b) => cnt[b] - cnt[a]).slice(0, 8).forEach(nm => {
      const stage = PC_AUTO.filter(n => cnt[nm] >= n).length;
      if (stage > (st.d[nm] || 0)) { queueNotes({ pc: 1, player: nm }); st.d[nm] = stage; changed = true; }
    });
    if (changed) setJson('pcAuto', st);
  });
}
function pcNameOf(player) { const p = charPairs().find(x => x.player === player); return p && p.name ? p.name : ''; }
function charsText() {
  return sheet(SH.CHAR).getDataRange().getValues().slice(1)
    .map(r => { try { const c = JSON.parse(decS(r[2]) || '{}'); return (decS(r[1]) || '?') + ' = ' + (c.name || decS(r[0])); } catch (e) { return ''; } })
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
  let first = null; const bad = [];
  for (let i = 0; i < keys.length; i++) if (String(keys[i][0]) === key) {
    const row = i + 2, w = Math.max(5, s.getLastColumn());
    const r = s.getRange(row, 1, 1, w).getValues()[0];
    let res = null;
    try { res = JSON.parse(fromCells(r.slice(4))); } catch (e) {}
    if (res && typeof res !== 'object') res = null;
    const on = x => String(x) === '1';
    const o = { row, sum: on(r[1]), story: on(r[2]), notes: on(r[3]), res };
    if (res) { o.bad = bad; return o; }                 // 같은 키의 깨진 줄은 건너뛰고 제대로 읽히는 줄을 쓴다
    bad.push(row); if (!first) first = o;
  }
  if (first) first.bad = bad;
  return first;
}
// 같은 키의 깨진 보관 줄(AI 결과를 읽을 수 없는 줄)을 모두 지운다 (아래 줄부터)
function stageDropBad(st) { if (!st || !st.bad) return; st.bad.slice().sort((a, b) => b - a).forEach(r => stageSheet().deleteRows(r, 1)); }
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
  _lockPatient = true;
  const t0 = Date.now(), budget = manual ? 150000 : 200000;
  _prog = { job, l0: Math.max(0, totalLines() - Number(getConf('processedId') || 0)), lines: 0, nb: 55, ns: 38 };
  setProg(job, '대화를 읽을 준비 중', 2, 4);
  let lines = 0, segs = 0, more = false, err = null, stale = false, nDone = 0, nWarn = '';
  try {
    // ① 요약 (밀렸으면 시간이 허락하는 만큼 구간을 계속 이어서)
    while (true) {
      const r = processWindow(job, t0, budget);
      lines += r.lines; segs += r.segs; _prog.lines += r.lines;
      if (r.stale) { stale = true; break; }
      if (!r.more) break;
      if (Date.now() - t0 > budget) { more = true; break; }
    }
  } catch (e) { err = String(e && e.message || e); }
  // ② NPC·장소·단서 정리 (요약이 막혔어도 따로 진행. 여기서 실패해도 요약 결과에는 영향이 없다)
  if (!stale && Date.now() - t0 < budget) {
    try { autoPcQueue(); } catch (e) { Logger.log('탐사자 자동 정리 예약 실패: ' + e); }
    try {
      const nr = processNotesQueue(job, t0, budget);
      if (nr.stale) stale = true; else { nDone = nr.done; nWarn = nr.warn || ''; }
    } catch (e) { nWarn = '정리 처리 중 오류: ' + String(e && e.message || e).slice(0, 160); }
  }
  if (!err && !stale && Date.now() - t0 < budget) {
    try { setProg(job, '누적 줄거리를 다듬는 중', 94, 98); confLoad(true); compactStory(job); } catch (e) { Logger.log('줄거리 줄이기 실패: ' + e); }
  }
  releaseJob(job);
  _lockPatient = false; _prog = null;

  if (stale) return { ok: false, error: '정리하는 사이 기록이 초기화돼서 결과를 버렸어요' };
  confLoad(true);
  const left = Math.max(0, totalLines() - Number(getConf('processedId') || 0));
  const nLeft = notesQ().length;
  const progress = lines + nDone;
  if (err) {
    setStatus({ ok: false, error: err, left, nLeft });
    return { ok: false, error: '요약 실패: ' + err + (lines ? ' (그 전에 ' + lines + '줄은 정리됨)' : '') + ' · 다음 자동 정리 때 같은 구간부터 다시 시도해요', left, nLeft };
  }
  const msg = (lines ? lines + '줄을 ' + segs + '개 요약으로 정리했어요' + (more || left ? ' · 남은 ' + left + '줄은 이어서 정리해요' : '') : '새로 정리할 대화가 없어요')
    + (nDone ? ' · NPC·장소·단서 ' + nDone + '건 정리' : '') + (nLeft ? ' · 정리 대기 ' + nLeft + '건' : '');
  if (lines || nDone || manual || nWarn) setStatus(Object.assign({ ok: true, message: msg, left, nLeft }, nWarn ? { warn: nWarn } : {}));
  return { ok: true, message: msg, left, nLeft, progress, lines, more: more || left > 0 || nLeft > 0 };
}

function windowEnd(from, to) {
  const rows = readLines(from, to - from);
  let sum = 0, n = 0;
  for (; n < rows.length; n++) {
    sum += String(rows[n].text).length + String(rows[n].name).length + 12;
    if (sum > WINDOW_CHARS && n >= 8) break;
  }
  return from + Math.max(1, n);
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
      p = { from: processed, to: windowEnd(processed, Math.min(total, processed + WINDOW_LINES)), rv: job.rv, fails: 0, done: [] };
      setJson('pending', p);
    }
    if (p.to - p.from > WINDOW_LINES && !stageHasWindow(job.rv + ':' + p.from + '-' + p.to + ':')) { p.to = windowEnd(p.from, p.from + WINDOW_LINES); p.fails = 0; setJson('pending', p); }
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
  let segs = 0, halved = false;

  try {
    for (let gi = 0; gi < order.length; gi++) {
      const sess = order[gi];
      const segKey = prefix + 's' + sess;
      let st = stageFind(segKey), fresh = null;
      if (!st && existing.has(segKey)) continue;                 // 예전 버전에서 이미 끝낸 구간
      if (st && st.sum && st.story && st.notes) continue;        // 세 단계 모두 반영됨
      if (!st || !st.res) {
        // AI 결과가 아직 없을 때만 AI를 부른다
        if (segs > 0 && Date.now() - t0 > budget) return { lines: 0, segs, more: true };
        const g = groups[sess].slice().sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.id - b.id));
        setProg(job, '회의록 요약 중', pSum(0), pSum(g.length), '대화 ' + g.length + '줄을 읽고 요약해요');
        const res = summarizeGroup(g, sess);
        const keep = { summary: res.summary || '- (잡담 위주, 진행 없음)', storyAdd: res.storyAdd || '', notes: null,
                       session: sess, from: g[0].time, to: g[g.length - 1].time };
        const put = withLock(30000, () => {
          if (!jobAlive(job) || Number(getConf('processedId') || 0) !== p.from) return 'stale';
          const cur = stageFind(segKey);
          if (cur && cur.res) return 'ok';                        // 그 사이 다른 실행이 보관함
          stageDropBad(cur);                                      // 깨진 보관분은 모두 지우고 다시
          stagePut(segKey, keep);
          return 'ok';
        });
        if (put === 'stale') return { stale: true, lines: 0, segs };
        fresh = keep;
      }
      // 보관된 AI 결과를 단계별로 반영 (각 단계 끝에 표시 → 실패하면 다음 실행이 남은 단계부터)
      const applied = withLock(30000, () => {
        if (!jobAlive(job) || Number(getConf('processedId') || 0) !== p.from) return 'stale';
        let cur = stageFind(segKey);
        if ((!cur || !cur.res) && fresh) {                        // 보관본을 다시 못 읽었지만 방금 받은 AI 답이 있다: 한 번 더 보관하고, 그래도 안 되면 그대로 반영
          stageDropBad(cur); stagePut(segKey, fresh); cur = stageFind(segKey);
          if (!cur || !cur.res) { Logger.log('요약대기 보관본을 읽지 못해 메모리의 결과로 바로 반영: ' + segKey); cur = { row: 0, sum: false, story: false, notes: false, res: fresh }; }
        }
        if (!cur || !cur.res) throw new Error('보관된 AI 결과를 찾지 못했어요 (다음 정리 때 이 구간을 다시 요약해요)');
        const r = cur.res;
        const mark = (c) => { if (cur.row) stageMark(cur.row, c); };
        if (!cur.sum) {
          if (!summaryKeys().has(segKey)) {
            const ms = sheet(SH.SUM);
            ms.getRange(ms.getLastRow() + 1, 1, 1, 6).setNumberFormat('@').setValues([[String(r.session), r.from, r.to, enc(String(r.summary)), now(), segKey]]);
          }
          mark(2);
        }
        if (!cur.story) {
          storyApply(segKey, r);          // 줄거리 내용과 "이 구간은 반영함" 표시를 한 칸에 한 번에 쓴다
          mark(3);
        }
        if (!cur.notes) {
          if (r.notes) mergeWriteNotes(r.notes);                       // 예전 버전이 보관해 둔 결과
          else queueNotes({ k: segKey, s: String(r.session), f: p.from, t: p.to });   // NPC·장소·단서 정리는 따로(요약을 막지 않게)
          mark(4);
        }
        bump('sumVer');
        return 'ok';
      });
      if (applied === 'stale') return { stale: true, lines: 0, segs };
      segs++;
      setProg(job, '요약을 저장했어요', pSum(0), pSum(0));
    }
  } catch (e) {
    // 같은 구간에서 두 번 넘게 실패하고 아직 보관된 AI 결과가 없으면 구간을 반으로 줄여 본다 (AI 답 잘림 대비)
    try {
      withLock(20000, () => {
        const pp = confJson('pending', null);
        if (!pp || pp.from !== p.from || pp.to !== p.to) return;
        pp.fails = (pp.fails || 0) + 1; pp.lastError = String(e && e.message || e).slice(0, 300);
        const cut = e && (e.kind === 'truncated' || e.kind === 'parse');     // 답이 길어 끊김: 기다리지 않고 바로 반으로 줄인다
        if ((cut || pp.fails >= 2) && !stageHasWindow(prefix) && pp.to - pp.from > 12) { pp.to = pp.from + Math.floor((pp.to - pp.from) / 2); pp.fails = 0; halved = true; }
        setJson('pending', pp);
      });
    } catch (e2) {}
    if (halved) return { lines: 0, segs, more: true };      // 같은 실행 안에서 줄인 구간으로 바로 다시
    throw e;
  }

  // 구간 전체를 마쳤을 때만 처리 번호를 넘긴다
  const fin = withLock(20000, () => {
    if (!jobAlive(job) || Number(getConf('processedId') || 0) !== p.from) return false;
    // 이 구간의 모든 묶음이 세 단계까지 반영됐는지 마지막으로 확인
    for (let gi = 0; gi < order.length; gi++) {
      const k = prefix + 's' + order[gi], st = stageFind(k);
      if (st && st.res ? !(st.sum && st.story && st.notes) : !summaryKeys().has(k)) return 'incomplete';     // 보관본을 못 읽는 줄이면 요약이 실제로 저장됐는지로 판단
    }
    setConf('processedId', String(p.to)); setJson('pending', null);
    stageDeleteWindow(prefix);
    return true;
  });
  if (fin === 'incomplete') throw new Error('구간 반영이 끝나지 않았어요 (다음 정리 때 이어서)');
  if (!fin) return { stale: true, lines: 0, segs };
  return { lines: p.to - p.from, segs, more: p.to < totalLines() };
}

/* ───────────── NPC·장소·단서 정리: 요약과 따로 (대기열) ─────────────
 * 요약은 짧고 빨리 끝나게 하고, 정리는 이 대기열에서 자기 속도로 처리한다.
 * 정리가 길어지거나 실패해도 요약은 밀리지 않는다. 대기열 한 건 = {k,s,f,t}(대화 구간 정리) 또는 {r:1,sec,id}(마스터가 "AI에게 다시 맡기기"한 항목). */
function taskSame(a, b) { return (!!b.k && a.k === b.k) || (!!b.r && !!a.r && a.sec === b.sec && a.id === b.id) || (!!b.pc && !!a.pc && a.player === b.player); }
function notesQ() { const q = confJson('notesQ', []); return Array.isArray(q) ? q : []; }
function notesQSet(q) { setJson('notesQ', q.length ? q : null); }
// 잠금 안에서 부른다
function queueNotes(task) {
  const q = notesQ();
  if (!q.some(x => taskSame(x, task))) q.push(task);
  notesQSet(q.slice(-NOTES_Q_MAX));
}
function notesCall(sys2, user2, maxTok, model) {
  const system =
    '너는 한국어 TRPG(' + R().name + ') 세션의 기록 담당이다. 음성 받아쓰기라서 단어가 잘못 적혀 있을 수 있다. ' +
    '용어집·캐릭터 이름·앞뒤 맥락으로 잘못 들린 고유명사를 바로잡아라. 없는 일을 지어내지 마라. ' + rl(FACT_RULES) + keeperRules() +
    '정정 메모는 사람이 바로잡아 준 사실이니 반드시 따르라. ' + sys2 + ' 반드시 JSON 하나만 출력하라.';
  return parseJson(claude(system, user2, maxTok, model));
}
function notesCommon() {
  return '## 용어집\n' + getConf('glossary') + '\n\n## 플레이어 = 캐릭터\n' + (charsText() || '(아직 없음)') + '\n\n## 정정 메모 (반드시 따를 것)\n' + correctionsText() + '\n\n';
}
const LINE_FMT = l => '#' + l.id + ' [' + String(l.time).slice(11) + '] ' + l.name + ': ' + l.text;
// 뜻이 없는 짧은 추임새 줄 (받아쓰기에 많이 섞인다). AI에 보내지 않는다 (기록에는 그대로 남는다).
const FILLER = /^(음+|어+|아+|오+|에+|네+|예+|응+|엉+|흠+|헐+|와+|우와|ㅋ+|ㅎ+|하+|허+|으+|그+|저+|넹|넵|웅|오케이|ok|okay|yes|no)$/i;
function isFiller(t) { const x = String(t || '').replace(/[\s.,!?~…·'"()\-]/g, ''); return x.length <= 1 || FILLER.test(x); }
// AI에 보낼 대화 글: 추임새 줄을 빼고, 시각은 [HH:MM] 줄로 분이 바뀔 때만 적는다 (줄마다 시각을 붙이면 글자 수가 크게 는다)
function aiLines(rows, keepAll) {
  let lastT = '', out = [];
  rows.forEach(l => {
    if (!keepAll && isFiller(l.text)) return;
    const t = String(l.time).slice(11, 16);
    if (t && t !== lastT) { out.push('[' + t + ']'); lastT = t; }
    out.push('#' + l.id + ' ' + l.name + ': ' + String(l.text).trim());
  });
  return out.join('\n');
}
// 대화 구간에서 NPC·장소·단서·핸드아웃을 뽑는다
function extractNotes(g, sess) {
  const transcriptText = aiLines(g);
  if (!transcriptText.replace(/\[\d\d:\d\d\]/g, '').trim()) return { notes: {} };
  // 캐시를 위해 바뀌지 않는 부분(용어집·캐릭터·정정 메모·출력 형식)을 앞에, 매번 바뀌는 부분(현재 정리·대화)을 뒤에 둔다
  return publicAi(() => notesCall('이 대화에서 장소·NPC·' + R().pc + '·단서·핸드아웃만 정리한다.', [
    notesCommon() + '## 출력 형식 (아래 "대화"를 정리한다)\n{"notes":{"places":[],"npcs":[],"pcs":[],"clues":[],"handouts":[]}}\n' + rl(NOTES_RULE) +
    '\n이야기 진행이 없거나 정리할 것이 없으면 {"notes":{}}로 답하라.\n\n',
    '## 현재 정리(notes) (이름이 나온 항목만 자세히, 나머지는 이름표만. 이름표 항목을 고치려면 id를 그대로 쓰고 바뀐 칸을 모두 적어라)\n' + notesForAiLite(readNotes() || emptyNotes(), transcriptText) + '\n\n' +
    '## 대화 (세션 ' + sess + ', 각 줄 앞 #번호는 발언 번호)\n' + transcriptText + '\n\n위 출력 형식대로 JSON 하나만 출력하라.'], 5000, MODEL_LIGHT));
}
// 마스터가 "AI에게 다시 맡기기"한 항목 하나를, 그 이름이 나온 대화 전체를 다시 읽고 새로 정리한다
function refineItem(sec, id) {
  const n = readNotes() || emptyNotes();
  const it = (n[sec] || []).find(x => x.id === id);
  if (!it) return { skip: '항목이 이미 지워졌어요' };
  if (sec === 'pcs') return buildPc(it.player || it.name, it.name);
  const nm = String(it.name || it.title || '').trim();
  const s = sheet(SH.LINES), last = s.getLastRow();
  if (last < 2) return { skip: '대화 기록이 없어요' };
  const from = Math.max(2, last - 3000 + 1);
  const all = s.getRange(from, 1, last - from + 1, 6).getValues().map(rowToLine);
  const byText = nm.length >= 2 ? all.filter(l => String(l.text).indexOf(nm) >= 0) : [];
  const srcSet = new Set((it.src || []).map(String));
  const bySrc = all.filter(l => l.uid && srcSet.has(String(l.uid)));
  const seen = new Set(), picked = [];
  byText.slice(-60).concat(bySrc).forEach(l => { if (!seen.has(l.id)) { seen.add(l.id); picked.push(l); } });
  picked.sort((a, b) => a.id - b.id);
  if (!picked.length) return { skip: '대화에서 "' + nm + '"이(가) 나온 줄을 찾지 못했어요' };
  // 앞뒤 맥락: 선택한 줄 바로 다음 줄을 하나씩 붙인다 (마스터 묘사가 이어지는 경우가 많다)
  const byId = {}; all.forEach(l => { byId[l.id] = l; });
  picked.slice().forEach(l => { const nx = byId[l.id + 1]; if (nx && !seen.has(nx.id)) { seen.add(nx.id); picked.push(nx); } });
  picked.sort((a, b) => a.id - b.id);
  const lines = picked.slice(-90);
  const idMap = {}; lines.forEach(l => { idMap[l.id] = l.uid || ('id:' + l.id); });
  const cur = notesForAi({ [sec]: [it], deleted: n.deleted });
  const res = publicAi(() => notesCall('아래 항목 하나를 대화 전체를 근거로 다시 정리한다. 마스터가 이 항목을 AI에게 다시 맡겼다.',
    notesCommon() + '## 지금 저장된 항목 (' + sec + ')\n' + JSON.stringify(it && (function(o){ const y = Object.assign({}, o); delete y.img; delete y.editedAt; delete y.src; return y; })(it)) + '\n\n' +
    '## 이 항목과 관련된 대화 (각 줄 앞 #번호는 발언 번호, [시:분]은 시각)\n' + aiLines(lines) + '\n\n' +
    '## 출력 형식\n{"notes":{"' + sec + '":[{"id":"' + id + '", ...이 항목의 칸들}]}}\n' + rl(NOTES_RULE) +
    '\n이 항목 하나만 출력하라. id는 그대로 두고, 대화에서 확인되는 내용으로 칸을 새로 채워라. 대화에 없는 내용은 기존 칸을 지우지 말고 그대로 두어라.' + (sec === 'places' ? ' 이번에는 found_add를 쓰지 말고 found 전체를 새로 써라.' : ''), 3000, MODEL_LIGHT));
  const out = res && res.notes && Array.isArray(res.notes[sec]) ? res.notes[sec].filter(x => x && typeof x === 'object') : [];
  const mine = out.filter(x => String(x.id || '') === id)[0] || out[0];
  if (!mine) return { skip: 'AI가 새로 정리할 내용을 찾지 못했어요' };
  mine.id = id;
  const o = {}; o[sec] = [srcToUids({ [sec]: [mine] }, idMap)[sec][0]];
  return { notes: o };
}
// 탐사자 한 명의 특징을 그 플레이어 본인의 발언으로 (NPC 카드처럼) 만든다. 이미 카드가 있으면 거기에 합쳐 다시 쓴다.
function buildPc(player, cardName) {
  const nm = pcPlayerOf(player);
  if (!nm) return { skip: '플레이어 이름이 없어요' };
  if (nm === String(getConf('keeperName') || '').trim()) return { skip: '마스터는 플레이어 캐릭터(' + R().pc + ')가 아니라서 특징을 만들지 않아요' };
  const s = sheet(SH.LINES), last = s.getLastRow();
  if (last < 2) return { skip: '대화 기록이 없어요' };
  const from = Math.max(2, last - 3000 + 1);
  const all = s.getRange(from, 1, last - from + 1, 6).getValues().map(rowToLine);
  const mine = all.filter(l => l.name === nm && String(l.text).trim().length >= 4);
  if (mine.length < 3) return { skip: all.some(l => l.name === nm) ? '"' + nm + '"님의 발언이 아직 너무 적어요 (' + mine.length + '줄)' : '"' + nm + '"(이)라는 이름으로 말한 기록이 없어요. 카드의 플레이어 칸에 이 캐릭터를 하는 사람의 접속 이름을 적어 주세요 (캐릭터시트를 연결하면 자동으로 찾아요)' };
  const byId = {}; all.forEach(l => { byId[l.id] = l; });
  const pick = mine.slice(-90), seen = new Set(pick.map(l => l.id)), lines = pick.slice();
  pick.forEach(l => { const pv = byId[l.id - 1]; if (pv && pv.name !== nm && !seen.has(pv.id)) { seen.add(pv.id); lines.push(pv); } });   // 바로 앞 줄(마스터의 물음 등)은 맥락으로만
  lines.sort((a, b) => a.id - b.id);
  const n = readNotes() || emptyNotes();
  const cn = pcNameOf(nm), want = String(cardName || '').trim();
  const ex = (n.pcs || []).find(x => want && String(x.name || '').trim() === want) || (n.pcs || []).find(x => String(x.player || '').trim() === nm || String(x.name || '').trim() === nm || (cn && String(x.name || '').trim() === cn));
  const idMap = {}; lines.forEach(l => { idMap[l.id] = l.uid || ('id:' + l.id); });
  const exJson = ex ? JSON.stringify((function (o) { const y = Object.assign({}, o); delete y.img; delete y.editedAt; delete y.src; return y; })(ex)) : '(아직 없음)';
  const res = publicAi(() => notesCall(rl('탐사자 한 명의 특징을 그 플레이어의 발언으로 정리한다.'),
    notesCommon() + '## 정리할 플레이어\n' + nm + (cn ? ' (캐릭터: ' + cn + ')' : '') + '\n\n## 지금 저장된 이 ' + R().pc + ' 항목\n' + exJson + '\n\n' +
    '## 대화 (' + nm + '님의 발언과, 이해를 돕는 바로 앞 줄. 각 줄 앞 #번호는 발언 번호)\n' + aiLines(lines) + '\n\n' +
    '## 출력 형식\n{"notes":{"pcs":[{"id":"' + (ex ? ex.id : '') + '","name":"캐릭터 이름","player":"' + nm + '","traits":"","said":"","relation":"","src":[]}]}}\n' + rl(NOTES_RULE) +
    '\n이 ' + R().pc + ' 항목 하나만 출력하라. ' + (ex ? 'id는 그대로 두고, 기존 특징과 새로 드러난 특징을 합쳐 전체를 다시 써라. 직접 적어 둔 내용은 지우지 마라.' : 'id는 비워라.') + ' ' + nm + '님 본인의 말에서 드러난 것만 쓰고, 대화에 없는 성격은 지어내지 마라.', 2500));
  const out = res && res.notes && Array.isArray(res.notes.pcs) ? res.notes.pcs.filter(x => x && typeof x === 'object') : [];
  const mineItem = out[0];
  if (!mineItem || !(mineItem.traits || mineItem.said || mineItem.relation)) return { skip: 'AI가 정리할 만한 특징을 찾지 못했어요' };
  mineItem.player = nm; mineItem.id = ex ? ex.id : '';
  mineItem.name = (ex && ex.name) || cn || mineItem.name || nm;     // 카드 이름은 바꾸지 않는다 (캐릭터 이름이 있으면 그것으로)
  return { notes: { pcs: [srcToUids({ pcs: [mineItem] }, idMap).pcs[0]] } };
}
function readLinesWindow(f, t, sess) {
  return readLines(f, t - f).filter(l => String(l.session) === String(sess) && String(l.text).trim());
}
// 대기열을 처리한다 (job은 이 실행이 잡고 있는 작업 표시). 한 건씩: AI(잠금 밖) → 저장(짧은 잠금) → 대기열에서 뺌
function processNotesQueue(job, t0, budget) {
  let done = 0, warn = '';
  while (Date.now() - t0 < budget) {
    const head = withLock(20000, () => jobAlive(job) ? (notesQ()[0] || null) : 'stale');
    if (head === 'stale') return { stale: true, done };
    if (!head) break;
    const lbl = head.r ? 'NPC·장소 데이터를 다시 읽는 중' : head.pc ? R().pc + ' 특징 만드는 중' : 'NPC·장소·단서 데이터 업데이트 중';
    setProg(job, lbl, pNotes(done, 0), pNotes(done, 1), '남은 정리 ' + notesQ().length + '건');
    let res = null, err = null;
    try {
      if (head.r) res = refineItem(head.sec, head.id);
      else if (head.pc) res = buildPc(head.player);
      else {
        const g = readLinesWindow(head.f, head.t, head.s).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.id - b.id));
        if (!g.length) res = { skip: '' };
        else {
          const idMap = {}; g.forEach(l => { idMap[l.id] = l.uid || ('id:' + job.rv + ':' + l.id); });
          const r = extractNotes(g, head.s);
          res = { notes: r && r.notes ? srcToUids(r.notes, idMap) : null };
        }
      }
    } catch (e) { err = e; }
    const outcome = withLock(30000, () => {
      if (!jobAlive(job)) return 'stale';
      const q = notesQ();
      const i = q.findIndex(x => taskSame(x, head));
      if (i < 0) return 'gone';
      let e2 = err;
      if (!e2) { try { if (res.notes) mergeWriteNotes(res.notes); } catch (x) { e2 = x; } }     // 저장이 실패해도 요약은 이미 끝났다. 이 건만 실패로 세고 다시 시도
      if (!e2) {
        q.splice(i, 1); notesQSet(q);
        return res.skip ? 'skip:' + res.skip : 'ok';
      }
      const t = q[i]; t.fails = (t.fails || 0) + 1;
      const cut = e2 && (e2.kind === 'truncated' || e2.kind === 'parse');
      if (head.k && cut && head.t - head.f > 12) {           // 답이 길어 끊김: 구간을 반으로 나눠 두 건으로
        const mid = head.f + Math.floor((head.t - head.f) / 2);
        q.splice(i, 1, { k: head.k + 'a', s: head.s, f: head.f, t: mid }, { k: head.k + 'b', s: head.s, f: mid, t: head.t });
        notesQSet(q); return 'split';
      }
      if (t.fails >= 4) { q.splice(i, 1); notesQSet(q); return 'drop:' + String(e2.message || e2).slice(0, 160); }
      notesQSet(q); return 'retry:' + String(e2.message || e2).slice(0, 160);
    });
    if (outcome === 'stale') return { stale: true, done };
    if (outcome === 'ok') done++;
    else if (String(outcome).indexOf('skip:') === 0) { done++; warn = outcome.slice(5) || warn; }
    else if (String(outcome).indexOf('drop:') === 0) warn = '정리 한 건을 4번 실패해서 건너뛰었어요: ' + outcome.slice(5);
    else if (String(outcome).indexOf('retry:') === 0) { warn = '정리가 잠깐 막혔어요 (곧 다시 시도): ' + outcome.slice(6); break; }   // 같은 문제로 계속 부르지 않고 다음 실행으로
  }
  return { done, warn };
}

function summarizeGroup(g, sess) {
  return publicAi(() => {
    const transcript = aiLines(g);
    if (!transcript.replace(/\[\d\d:\d\d\]/g, '').trim()) return { summary: '- (잡담 위주, 진행 없음)', storyAdd: '' };
    const card = recapText(sess);
    const system =
      '너는 한국어 TRPG(' + R().name + ') 세션의 기록 담당이다. 음성 받아쓰기라서 단어가 잘못 적혀 있을 수 있다. ' +
      '용어집·캐릭터 이름·앞뒤 맥락으로 잘못 들린 고유명사를 바로잡고, 의미 없는 조각은 무시하라. ' +
      '플레이어 잡담(규칙 질문, 농담, 현실 이야기)과 캐릭터로서의 행동·대사를 구분해서, 요약은 이야기 안의 일을 중심으로 캐릭터 이름으로 써라. ' +
      '없는 일을 지어내지 마라. ' + rl(FACT_RULES) + keeperRules() +
      '정정 메모는 사람이 바로잡아 준 사실이니 반드시 따르라. 반드시 JSON 하나만 출력하라.';
    // 캐시를 위해 바뀌지 않는 부분(마스터 이름·용어집·캐릭터·정정 메모·출력 형식)을 앞에, 매번 바뀌는 부분(줄거리·대화)을 뒤에 둔다
    const stable =
      '## 마스터 이름\n' + (getConf('keeperName') || '(미지정: 상황 묘사와 NPC 대사를 하는 사람이 마스터다)') + '\n\n' +
      '## 용어집\n' + getConf('glossary') + '\n\n' +
      '## 플레이어 = 캐릭터\n' + (charsText() || '(아직 없음)') + '\n\n' +
      '## 정정 메모 (반드시 따를 것)\n' + correctionsText() + '\n\n' +
      '## 출력 형식 (아래 "새로 들어온 대화"를 요약한다)\n' +
      '{"summary":"이 대화 구간의 요약. 읽기 쉽게 장소(장면) 기준으로 문단을 나눠라: 문단은 \\"【장소 이름】\\" 한 줄로 시작하고, 이어서 그 장소에서 일어난 일을 시간순으로 \\"- HH:MM 내용\\" 줄들(HH:MM은 그 일이 나온 대화의 시각)로 쓴다. 문단 사이는 빈 줄 하나. ' +
      '장소가 바뀌면 새 문단이고, 같은 장소로 돌아오면 그 장소 문단에 이어 써도 된다. 장소를 알 수 없으면 \\"【장소 미상】\\". ' +
      '길이: 구간 전체 12줄 안팎(최대 16줄), 문단마다 2~5줄. 한 줄은 한두 문장으로 핵심만 쓴다. ' +
      '마스터가 준 정보(이름·장소·단서·판정 결과·NPC의 주장)는 빠뜨리지 말고 한 줄에 압축해서 담되, 분위기 묘사 문장은 줄여라 (자세한 묘사는 NPC·장소·단서 정리에 따로 남는다). ' +
      '줄마다 끝에 근거 발언 번호를 (#12, #15)처럼 붙여라",' +
      '"storyAdd":"이 구간에서 누적 줄거리 뒤에 덧붙일 내용. 중요한 사건·결정·알아낸 사실만 2~4문장(250자 이내)으로. 누적 줄거리를 다시 쓰지 말고 새로 더할 부분만 써라. 이야기 진행이 없으면 빈칸"}\n' +
      '(NPC·장소·단서 정리는 따로 처리하니 여기서는 출력하지 마라.)\n' +
      '\n새 대화에 이야기 진행이 거의 없으면 summary는 "- (잡담 위주, 진행 없음)"으로 하고 storyAdd는 빈칸으로 하라.' + '\n';
    const fresh =
      '## 지금까지의 누적 줄거리 중 최근 부분 (참고용, 다시 쓰지 않는다)\n' + (storyTail(STORY_REF) || '(처음)') + '\n\n' +
      (card ? '## 지난 회차 정리 카드\n' + card + '\n\n' : '') +
      '## 새로 들어온 대화 (세션 ' + sess + ', 각 줄 앞 #번호는 발언 번호, [시:분] 줄은 그 뒤 발언들의 시각)\n' + transcript + '\n\n' +
      '위 출력 형식대로 JSON 하나만 출력하라.';
    return parseJson(claude(system, [stable, fresh], 6500));
  });
}
/* 누적 줄거리 저장소 (설정 시트의 story 칸 하나)
 * 줄거리 글과 "이미 반영한 요약 구간 목록"을 한 칸에 함께 담는다: {"_story":1,"t":"글","k":["구간키",...]}
 * → 글을 붙이는 것과 "반영함" 표시가 한 번의 쓰기로 끝나서, 그 직후에 실패해도 다시 붙지 않는다.
 * → 같은 구간인지는 구간키로만 판단한다. 글이 같아도 구간이 다르면 각각 남는다.
 * 예전 버전이 남긴 글(그냥 문장)은 그대로 읽고, 다음에 쓸 때 새 형식이 된다. 사람이 고치거나 AI가 줄여 써도 구간 목록은 유지한다. */
function storyDoc() {
  const v = getConf('story') || '';
  if (v.charAt(0) === '{') {
    try { const o = JSON.parse(v); if (o && o._story === 1 && typeof o.t === 'string') return { t: o.t, k: Array.isArray(o.k) ? o.k.map(String) : [] }; } catch (e) {}
  }
  return { t: v, k: [], legacy: true };       // 예전 버전이 남긴 글 (구간 목록 없음)
}
function storyText() { return storyDoc().t; }
function storyTail(n) { const t = storyDoc().t; return t.length <= n ? t : '…' + t.slice(-n); }
function storyWrite(text, keys) { setConf('story', JSON.stringify({ _story: 1, t: String(text || ''), k: (keys || []).slice(-600) })); }
// 요약 한 구간의 줄거리 반영 (잠금 안에서 부른다). 이미 반영한 구간이면 아무것도 하지 않는다.
function storyApply(segKey, r) {
  const d = storyDoc();
  if (d.k.indexOf(segKey) >= 0) return false;
  let t = d.t;
  if (r.story) t = String(r.story).slice(0, 20000);              // 예전 버전이 보관해 둔 결과 (줄거리 전체를 다시 쓴 것)
  else {
    const add = String(r.storyAdd || '').trim();
    // 예전 버전에서 넘어온 직후 한 번만: 예전 버전이 이 구간 글을 붙인 직후에 멈췄다면 줄거리 맨 끝이 바로 그 글이다 → 다시 붙이지 않고 표시만 남긴다
    const already = d.legacy && add && t.replace(/\s+$/, '').slice(-add.length) === add;
    if (add && !already) {
      let lastTag = null, m; const re = /【세션 (\d+)】/g;
      while ((m = re.exec(t))) lastTag = m[1];
      if (lastTag !== String(r.session)) t += (t ? '\n\n' : '') + '【세션 ' + r.session + '】';
      t = (t + '\n' + add).slice(-20000);
    }
  }
  storyWrite(t, d.k.concat([segKey]));
  return true;
}
// 누적 줄거리가 길어지면 한 번 줄여 쓴다. 실패해도 기록에는 영향이 없다 (다음 정리 때 다시 시도).
function compactStory(job) {
  const story = storyText();
  if (story.length <= STORY_MAX) return false;
  const res = publicAi(() => parseJson(claude(
    '너는 TRPG 세션 기록 담당이다. 길어진 누적 줄거리를 줄여 다시 쓴다. 없는 내용을 더하지 마라. JSON 하나만 출력하라.',
    '## 누적 줄거리\n' + story + '\n\n## 할 일\n1500자 이내로 다시 써라. 【세션 N】 구분 줄은 그대로 두어라. 오래된 일은 짧게, 최근 일은 자세히. ' +
    '인물·장소 이름과 중요한 사건·결정·알아낸 사실은 빠뜨리지 마라. 확인된 사실, NPC의 주장, ' + R().pc + '의 추측을 섞지 마라.\n' +
    '## 출력 형식\n{"story":"줄여 쓴 누적 줄거리"}', 2600)));
  const outStory = String(res.story || '').trim();
  if (outStory.length < 100 || outStory.length >= story.length) return false;
  return withLock(20000, () => {
    const d = storyDoc();
    if (!jobAlive(job) || d.t !== story) return false;     // 그 사이 초기화됐거나 누가 고쳤으면 그대로 둔다
    storyWrite(outStory, d.k); bump('sumVer');              // 글만 바꾸고 "반영한 구간" 목록은 그대로
    return true;
  });
}
// 마스터가 공개한 지난 회차 카드 (공개 자료라서 요약 AI에 줘도 된다)
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
    const rows = sh.getDataRange().getValues().slice(1).map((r, i) => ({ id: i + 2, session: String(r[0]), text: decS(r[3]) }));
    const recent = rows.slice(-8);
    setProg(job, 'AI가 정정 요청을 읽고 고치는 중', 10, 85);
    const res = publicAi(() => {
      const system = '너는 TRPG 세션 기록 담당이다. 사람이 기록의 잘못된 부분을 정정해 달라고 했다. ' +
        '요청에 맞게 누적 줄거리, 요약, 정리를 고쳐라. 이번에는 locked 항목도 요청과 관계있으면 고쳐도 된다. 요청과 관계없는 부분은 바꾸지 마라. ' +
        '요약 줄 끝의 (#번호) 근거 표시와 줄거리의 【세션 N】 줄은 그대로 두어라. 답이 길면 중간에 끊기니 꼭 고쳐야 하는 것만 출력하라. ' + FACT_RULES + 'JSON 하나만 출력하라.';
      const user =
        '## 정정 요청 (' + (who || '플레이어') + ')\n' + text + '\n\n' +
        '## 기존 정정 메모\n' + correctionsText() + '\n\n' +
        '## 플레이어 = 캐릭터\n' + (charsText() || '(없음)') + '\n\n' +
        '## 누적 줄거리\n' + (storyText() || '(없음)') + '\n\n' +
        '## 최근 요약들\n' + recent.map(r => '[id ' + r.id + ', 세션 ' + r.session + ']\n' + r.text).join('\n\n') + '\n\n' +
        '## 현재 정리(notes)\n' + notesForAi(readNotes() || emptyNotes()) + '\n\n' +
        '## 출력 형식\n{"reply":"무엇을 고쳤는지 한두 문장","memo":"앞으로 기억해야 할 정정 사실 한 줄 (없으면 빈칸)",' +
        '"story":"고친 누적 줄거리 전체 (줄거리에 틀린 내용이 있을 때만. 없으면 빈칸)","summaries":[{"id":숫자,"text":"고친 요약 전문"}] (고친 것만),' +
        '"notes":{"places":[],"npcs":[],"clues":[],"handouts":[]} (고칠 게 없으면 생략)}\n' + rl(NOTES_RULE) +
        '\n정정할 때는 src를 출력하지 마라 (기존 근거가 유지된다).';
      return parseJson(claude(system, user, 5000));
    });
    setProg(job, '고친 내용을 저장하는 중', 90, 98);
    const okIds = new Set(recent.map(r => r.id));
    const applied = withLock(30000, () => {
      if (!jobAlive(job)) return false;                      // 그 사이 초기화됨 → 아무것도 쓰지 않음
      if (res.story) storyWrite(String(res.story).slice(0, 20000), storyDoc().k);
      const last = sh.getLastRow();
      (res.summaries || []).forEach(x => { const id = Number(x.id); if (okIds.has(id) && id <= last && x.text) sh.getRange(id, 4).setValue(enc(String(x.text).slice(0, 20000))); });
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
/* 캐릭터시트 문서 열기.
 * 마스터가 실수로 이 앱의 저장용 문서를 캐릭터시트로 연결하면, 마스터 전용 탭의 내용이 "캐릭터 카드"가 되어 모두에게 나갈 수 있다.
 * 그래서 문서 ID로 같은 문서인지 확인하고, 같은 문서라면 앱이 쓰는 탭(설정·대화·요약·정리·키퍼자료 등)은 연결하지 못하게 한다.
 * 다른 문서라면 탭 이름이 우연히 같아도 막지 않는다. */
const INTERNAL_TABS = Object.keys(SH).map(k => SH[k]);
function charSource(url) {
  let src;
  try { src = SpreadsheetApp.openByUrl(String(url || '').trim()); }
  catch (e) { throw new Error('캐릭터시트를 열지 못했어요. 주소가 맞는지, 마스터 구글 계정이 열 수 있는 시트인지 확인해 주세요'); }
  return { src, same: src.getId() === SpreadsheetApp.getActive().getId() };
}
function tabAllowed(same, name) { return !(same && INTERNAL_TABS.indexOf(String(name)) >= 0); }

/* 같은 문서일 때, 허용된 탭이라도 그 탭의 "표시값"이 마스터 전용 탭에서 끌려오면 안 된다.
 *  예) 캐릭터 탭의 셀이 =키퍼자료!A2 , =INDEX('키퍼원문'!E:E,3) , 이름 붙인 범위(=비밀범위) , =INDIRECT("키퍼"&"자료!A1") 처럼 앱 내부 탭을 가리키면
 *      getDisplayValues()가 그 글자를 그대로 읽어 와서 AI → 캐릭터 카드(모두에게 공개)로 나간다.
 *  그래서 같은 문서의 모든 일반 탭의 수식을 훑어서, 앱 내부 탭을 (직접·이름 붙인 범위로·INDIRECT로·이 문서 주소로) 참조하거나,
 *  그런 탭을 다시 참조하는(연쇄) 탭은 "새는 탭"으로 보고 연결하지 못하게 한다. 훑는 범위를 넘는 탭을 참조하는 것도 확인할 수 없으니 막는다.
 *  다른 문서는 이 앱의 탭과 무관하므로 이 검사를 하지 않는다. */
const SCAN_ROWS = 400, SCAN_COLS = 50;
function escRe(x) { return String(x).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function tabTaint(c) {
  if (c._taint) return c._taint;
  const bad = {};                       // 탭 이름 → 이유
  if (!c.same) { c._taint = bad; return bad; }
  const appId = SpreadsheetApp.getActive().getId();
  const names = [];
  try { c.src.getNamedRanges().forEach(n => { try { if (INTERNAL_TABS.indexOf(n.getRange().getSheet().getName()) >= 0) names.push(n.getName()); } catch (e) { names.push(n.getName()); } }); } catch (e) {}
  const info = {};
  c.src.getSheets().forEach(sh => {
    const nm = sh.getName(); if (INTERNAL_TABS.indexOf(nm) >= 0) return;
    const lr = sh.getLastRow(), lc = sh.getLastColumn();
    const trunc = lr > SCAN_ROWS || lc > SCAN_COLS;
    let F = '';
    if (lr > 0 && lc > 0) F = sh.getRange(1, 1, Math.min(lr, SCAN_ROWS), Math.min(lc, SCAN_COLS)).getFormulas().map(r => r.filter(Boolean).join('\n')).filter(Boolean).join('\n');
    let why = '';
    for (let i = 0; i < INTERNAL_TABS.length && !why; i++) if (F.indexOf(INTERNAL_TABS[i] + '!') >= 0 || F.indexOf(INTERNAL_TABS[i] + "'!") >= 0) why = "수식이 앱 내부 탭 '" + INTERNAL_TABS[i] + "'을(를) 참조해요";
    if (!why && /INDIRECT\s*\(/i.test(F)) why = '수식이 INDIRECT로 다른 탭을 동적으로 참조해요 (어느 탭을 읽는지 확인할 수 없어요)';
    if (!why && F.indexOf(appId) >= 0) why = '수식이 이 앱의 저장용 문서 주소를 참조해요';
    for (let i = 0; i < names.length && !why; i++) if (new RegExp('(^|[^A-Za-z0-9_가-힣])' + escRe(names[i]) + '(?![A-Za-z0-9_가-힣])').test(F)) why = "수식이 앱 내부 탭을 가리키는 이름 붙인 범위 '" + names[i] + "'를 참조해요";
    info[nm] = { F, trunc, why };
  });
  const tabs = Object.keys(info);
  tabs.forEach(n => { if (info[n].why) bad[n] = info[n].why; });
  // 연쇄: 새는 탭(또는 확인 범위를 넘는 탭)을 참조하는 탭도 새는 탭
  for (let guard = 0, ch = true; ch && guard < 40; guard++) {
    ch = false;
    tabs.forEach(n => {
      if (bad[n]) return;
      tabs.forEach(o => {
        if (bad[n] || o === n) return;
        if (info[n].F.indexOf(o + '!') >= 0 || info[n].F.indexOf(o + "'!") >= 0) {
          if (bad[o]) { bad[n] = "수식이 마스터 전용 내용이 섞인 탭 '" + o + "'을(를) 참조해요"; ch = true; }
          else if (info[o].trunc) { bad[n] = "수식이 너무 큰 탭 '" + o + "'을(를) 참조해서 내용을 확인할 수 없어요"; ch = true; }
        }
      });
    });
  }
  c._taint = bad; return bad;
}
// 이 탭을 캐릭터로 쓸 수 없는 이유 (없으면 빈 글자)
function tabIssue(c, name) {
  if (!tabAllowed(c.same, name)) return '앱이 쓰는 탭이에요';
  return tabTaint(c)[String(name)] || '';
}
function listTabs(url) {
  const c = charSource(url);
  const all = c.src.getSheets().map(x => x.getName());
  const tabs = [], blocked = [];
  all.forEach(n => { const w = tabIssue(c, n); if (!w) tabs.push(n); else if (INTERNAL_TABS.indexOf(n) < 0) blocked.push({ tab: n, why: w }); });
  return { ok: true, tabs, same: c.same, hidden: all.length - tabs.length - blocked.length, blocked };
}
// 예전 버전에서 저장용 문서의 내부 탭(또는 마스터 자료가 섞이는 탭)을 캐릭터로 연결해 둔 것이 있으면 끊고, 그 탭으로 만들어진 캐릭터 카드도 지운다.
// 끊은 탭 이름을 돌려준다.
function charLinkFix(c) {
  const url = getConf('charUrl'), map = confJson('charMap', []);
  if (!url || !map.length) return [];
  c = c || charSource(url);
  const bad = map.filter(m => tabIssue(c, m.tab)).map(m => String(m.tab));
  if (!bad.length) return [];
  withLock(20000, () => {
    setConf('charMap', JSON.stringify(confJson('charMap', []).filter(m => bad.indexOf(String(m.tab)) < 0)));
    const cs = sheet(SH.CHAR), v = cs.getDataRange().getValues();
    for (let i = v.length - 1; i >= 1; i--) if (bad.indexOf(decS(v[i][0])) >= 0) cs.deleteRows(i + 1, 1);
    bump('charVer');
  });
  return bad;
}

/* 캐릭터 카드로 AI에 보내는 것(입력)과 공개되는 것(출력)
 *  입력: 그 탭의 앞 120줄×30칸의 "표시값"(수식이 계산된 결과)을 줄마다 ' | '로 이어 9000자까지. 시트 안의 사진 주소는 따로 읽는다.
 *  출력: 아래 cardClean이 허용한 칸(이름·직업·나이·성별·체력·이성·마력·행운·능력치 9개·기술 12개·소지품·메모)만. AI가 다른 칸을 만들어도 버린다. */
function readTabText(sh) {
  const nr = Math.max(1, Math.min(sh.getLastRow(), 120)), nc = Math.max(1, Math.min(sh.getLastColumn(), 30));
  const vals = sh.getRange(1, 1, nr, nc).getDisplayValues();
  return { text: vals.map(r => r.filter(x => String(x).trim() !== '').join(' | ')).filter(Boolean).join('\n').slice(0, 9000), nr, nc };
}
function cardClean(c) {
  c = c && typeof c === 'object' ? c : {};
  const nv = (list, n) => (Array.isArray(list) ? list : []).slice(0, n).map(x => ({ name: txt(x && x.name, 30), value: txt(x && x.value, 20) })).filter(x => x.name);
  return {
    name: txt(c.name, 40), occupation: txt(c.occupation, 40), age: txt(c.age, 10), gender: txt(c.gender, 20),
    hp: txt(c.hp, 20), san: txt(c.san, 20), mp: txt(c.mp, 20), luck: txt(c.luck, 20),
    stats: nv(c.stats, 9), skills: nv(c.skills, 12), items: txt(c.items, 300), memo: txt(c.memo, 300)
  };
}
// 시트 내용 → 카드. 같은 내용이면 미리 보기에서 만든 카드를 그대로 쓴다 (마스터가 본 카드와 공개되는 카드가 같게)
function cardFor(text, player, keepPreview) {
  const key = 'cc_' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text + '|' + player));
  const cache = roomCache();
  const hit = cache.get(key);
  if (hit) { try { return { card: cardClean(JSON.parse(hit)), cached: true }; } catch (e) {} }
  const card = cardClean(publicAi(() => parseJson(claude(
    'TRPG 캐릭터시트를 읽고 핵심만 JSON으로 뽑아라. 시트에 없는 값은 비워라. JSON 하나만 출력.',
    '시트 내용:\n' + text + '\n\n출력 형식: {"name":"","occupation":"","age":"","gender":"","hp":"현재/최대","san":"현재/최대","mp":"현재/최대","luck":"",' +
    '"stats":[{"name":"근력 같은 능력치 이름","value":""}] (최대 9개),' +
    '"skills":[{"name":"","value":""}] (수치가 높은 기술 위주 최대 12개),"items":"소지품 요약","memo":"배경·특이사항 한두 줄"}', 1800))));
  if (keepPreview) { try { cache.put(key, JSON.stringify(card), 1800); } catch (e) {} }
  return { card, cached: false };
}
function mapKey(url, list, texts) {
  return 'cp_' + Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,
    JSON.stringify([String(url), list.map((m, i) => [m.tab, m.player, texts[i]])])));
}
function checkList(c, url, list) {
  const bad = list.map(m => ({ tab: m.tab, why: tabIssue(c, m.tab) })).filter(x => x.why);
  if (bad.length) return { ok: false, error: '이 탭은 캐릭터로 연결할 수 없어요: ' + bad.map(x => x.tab + ' (' + x.why + ')').join(' / ') + ' · 기존 연결은 그대로 뒀어요', blocked: bad };
  const missing = list.filter(m => !c.src.getSheetByName(m.tab)).map(m => m.tab);
  if (missing.length) return { ok: false, error: '시트에서 이 탭을 찾지 못했어요: ' + missing.join(', ') + ' · 기존 연결은 그대로 뒀어요' };
  return null;
}
function cleanMap(map) {
  return (Array.isArray(map) ? map : []).filter(m => m && m.tab).slice(0, 30)
    .map(m => ({ tab: String(m.tab).slice(0, 100), player: String(m.player || '').trim().slice(0, 40) }));
}
// 마스터 전용: 이 연결로 플레이어에게 보일 카드를 저장·공개하지 않고 미리 만들어 본다.
// 돌려주는 것: 탭마다 AI에 보낼 입력(시트 표시값)의 앞부분과 길이, 그리고 만들어진 카드. 같은 문서면 이걸 본 뒤에야 연결 저장이 된다.
function charPreview(url, map) {
  url = String(url || '').trim();
  const list = cleanMap(map);
  if (!url || !list.length) return { ok: false, error: '주소와 캐릭터 탭을 먼저 골라 주세요' };
  const c = charSource(url);
  const bad = checkList(c, url, list); if (bad) return bad;
  const items = [], texts = [];
  list.forEach(m => {
    const t = readTabText(c.src.getSheetByName(m.tab));
    texts.push(t.text);
    const r = cardFor(t.text, m.player, true);
    items.push({ tab: m.tab, player: m.player, inputChars: t.text.length, input: t.text.slice(0, 1500), card: r.card });
  });
  try { roomCache().put(mapKey(url, list, texts), '1', 1800); } catch (e) {}
  return { ok: true, same: c.same, items };
}
// 연결 저장: 먼저 검사하고, 통과했을 때만 설정을 바꾼다 (잘못된 새 연결 때문에 기존 연결이 지워지지 않게)
function saveCharConfig(url, map) {
  url = String(url || '').trim();
  const list = cleanMap(map);
  if (url && list.length) {
    const c = charSource(url);
    const bad = checkList(c, url, list); if (bad) return bad;
    if (c.same) {          // 이 앱의 저장용 문서: 마스터가 플레이어에게 보일 카드를 미리 본 뒤에만 저장한다
      const texts = list.map(m => readTabText(c.src.getSheetByName(m.tab)).text);
      if (!roomCache().get(mapKey(url, list, texts)))
        return { ok: false, needPreview: true, error: '이 주소는 이 앱의 저장용 시트예요. 먼저 "플레이어에게 보일 카드 미리 보기"를 눌러 카드 내용을 확인해 주세요 (30분 안에 저장해야 하고, 그 사이 시트 내용이 바뀌면 다시 미리 봐야 해요) · 기존 연결은 그대로 뒀어요' };
    }
  }
  withLock(20000, () => {
    setConf('charUrl', url && list.length ? url : '');
    setConf('charMap', JSON.stringify(url && list.length ? list : []));
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
// 구글 계정 토큰을 붙여도 되는 주소인지: https + 구글 드라이브·문서 주소만. (시트에 적힌 아무 주소에나 마스터 토큰을 보내면 그 서버가 마스터 드라이브에 접근할 수 있다)
function googleHost(src) {
  const m = /^https:\/\/([^\/?#:@]+)(?:[\/?#]|$)/i.exec(String(src || ''));
  if (!m) return false;
  const h = m[1].toLowerCase();
  return h === 'drive.google.com' || h === 'docs.google.com' || h === 'lh3.googleusercontent.com' || h === 'drive.usercontent.google.com';
}
function fetchPortrait(src, tab) {
  if (!/^https?:\/\//i.test(String(src || ''))) return '';
  let r = UrlFetchApp.fetch(src, { muteHttpExceptions: true, followRedirects: true });
  if (r.getResponseCode() !== 200 && googleHost(src)) {
    r = UrlFetchApp.fetch(src, { muteHttpExceptions: true, followRedirects: true, headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
  }
  if (r.getResponseCode() !== 200) return '';
  return storePortrait(r.getBlob(), 'portrait_' + tab + '_' + Date.now());
}
function savePortraitUpload(tab, data) {
  if (!tab || !data) return { ok: false, error: '사진이 없어요' };
  const url = storePortrait(Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', 'p.jpg'), 'portrait_' + Date.now());
  return withLock(20000, () => {
    const cs = sheet(SH.CHAR);
    const v = cs.getDataRange().getValues();
    for (let i = 1; i < v.length; i++) if (decS(v[i][0]) === String(tab)) {
      cs.getRange(i + 1, 6, 1, 2).setNumberFormat('@').setValues([[enc(url), 'manual']]);
      bump('charVer');
      return { ok: true, url };
    }
    return { ok: false, error: '캐릭터를 찾지 못했어요' };
  });
}

function refreshCharacters(force) {
  withLock(20000, () => setConf('lastCharCheck', String(Date.now())));
  const url = getConf('charUrl');
  const cs = sheet(SH.CHAR);
  const off = () => { withLock(20000, () => { if (cs.getLastRow() > 1) cs.deleteRows(2, cs.getLastRow() - 1); bump('charVer'); }); return { ok: true, message: '캐릭터 연결을 해제했어요' }; };
  if (!url || !confJson('charMap', []).length) return off();
  const c = charSource(url), src = c.src;
  // 읽기 직전에 한 번 더 확인한다 (예전에 잘못 저장된 연결에도 적용): 저장용 문서의 앱 내부 탭은 연결을 끊고 읽지 않는다
  const fixed = charLinkFix(c);
  const map = confJson('charMap', []);
  if (!map.length) return Object.assign(off(), { blocked: fixed, message: '앱 내부 탭이거나 마스터 전용 내용이 섞이는 탭이 캐릭터로 연결돼 있어서 끊었어요: ' + fixed.join(', ') + ' · 캐릭터시트를 다시 연결해 주세요' });
  const old = {};
  cs.getDataRange().getValues().slice(1).forEach(r => { const d = r.map(x => (typeof x === 'string' ? dec(x) : x)); old[String(d[0])] = d; });

  const rows = [], blocked = fixed.slice();
  let changed = fixed.length > 0;
  map.forEach(m => {
    if (tabIssue(c, m.tab)) { blocked.push(m.tab); changed = true; return; }      // (위에서 끊었으니 여기 올 일은 없다. 그래도 읽지 않는다)
    const sh = src.getSheetByName(m.tab); if (!sh) return;
    const rd = readTabText(sh), text = rd.text, nr = rd.nr, nc = rd.nc;
    const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text + '|' + m.player));
    const prev = old[m.tab] || [];

    // 초상화: 사람이 직접 올린 사진이 우선, 아니면 시트 속 사진
    let pUrl = String(prev[5] || ''), pSrc = String(prev[6] || '');
    if (pSrc !== 'manual') {
      const found = findPortraitSrc(sh, nr, nc);
      if (found && (found !== pSrc || !pUrl)) {
        try { const u = fetchPortrait(found, m.tab); if (u) { pUrl = u; pSrc = found; changed = true; } } catch (e) {}
      }
      if (!found && pSrc) { pUrl = ''; pSrc = ''; changed = true; }
    }

    if (!force && prev[3] === hash) { rows.push([m.tab, m.player, String(prev[2] || ''), hash, String(prev[4] || ''), pUrl, pSrc]); return; }
    const card = cardFor(text, m.player, false).card;
    rows.push([m.tab, m.player, JSON.stringify(card), hash, now(), pUrl, pSrc]);
    changed = true;
  });
  withLock(20000, () => {
    if (cs.getLastRow() > 1) cs.getRange(2, 1, cs.getLastRow() - 1, 7).clearContent();
    // 탭 이름·플레이어 이름·주소는 바깥에서 온 글자라 수식으로 바뀌지 않게 enc를 거쳐 쓴다
    if (rows.length) cs.getRange(2, 1, rows.length, 7).setNumberFormat('@').setValues(rows.map(r => r.map(x => enc(String(x == null ? '' : x)))));
    if (changed || force) bump('charVer');
    try { snapChars(); } catch (e) {}
  });
  return { ok: true, blocked, message: rows.length + '명의 캐릭터를 읽었어요' + (blocked.length ? ' · 앱 내부 탭이거나 마스터 전용 내용이 섞여서 연결을 끊은 것: ' + blocked.join(', ') : '') };
}
/* 캐릭터 수치(체력·이성·마력·행운)가 바뀌었거나 세션이 바뀌었으면 '캐릭터기록' 시트에 한 줄 남긴다.
 * 세션별로 처음과 마지막 기록을 비교해서 "이성을 가장 많이 잃은 탐사자" 같은 값을 낸다. (잠금 안에서 부를 것) */
function snapChars() {
  const cs = sheet(SH.CHAR), n = cs.getLastRow();
  if (n < 2) return;
  const sess = getConf('session') || '1', last = confJson('charLast', {}), add = [];
  cs.getRange(2, 1, n - 1, 3).getValues().forEach(r => {
    const tab = decS(r[0]); if (!tab) return;
    let c = {}; try { c = JSON.parse(decS(r[2]) || '{}'); } catch (e) {}
    const vals = [c.hp, c.san, c.mp, c.luck].map(x => String(x == null ? '' : x).slice(0, 20));
    const sig = sess + '|' + vals.join('|');
    if (last[tab] === sig) return;
    last[tab] = sig;
    add.push([now(), sess, tab, decS(r[1]), String(c.name || tab)].concat(vals).map(x => enc(String(x))));
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
      'TRPG 세션 중 마스터가 보여 준 핸드아웃/이미지다. ' + (caption ? '마스터 메모: ' + caption + '\n' : '') +
      '## 현재 정리(notes)\n' + notesForAi(readNotes() || emptyNotes()) + '\n\n' +
      '이미지 속 글자는 빠짐없이 옮기고, 그림이면 무엇이 보이는지 묘사하라. 그리고 정리를 갱신하라.\n' +
      '출력 형식: {"title":"짧은 제목","text":"이미지 속 글자 전문","description":"묘사와 눈여겨볼 점","notes":{"places":[],"npcs":[],"clues":[],"handouts":[]}}\n' + rl(NOTES_RULE) }
  ];
  const res = publicAi(() => parseJson(claude('너는 TRPG 세션 기록 담당이다. JSON 하나만 출력하라.', content, 4000)));
  return withLock(30000, () => {
    if ((getConf('resetVer') || '0') !== rv) return { ok: false, error: '분석하는 사이 기록이 초기화돼서 저장하지 않았어요' };
    const is = sheet(SH.IMG);
    is.getRange(is.getLastRow() + 1, 1, 1, 5).setNumberFormat('@').setValues([[
      now(), String(getConf('session') || ''), enc(String(file.getId())), enc(url),
      enc(JSON.stringify({ title: String(res.title || ''), text: String(res.text || ''), description: String(res.description || '') }))
    ]]);
    if (res.notes) { SECTIONS.forEach(s => (res.notes[s] || []).forEach(x => { if (x) x.src = []; })); mergeWriteNotes(res.notes); }
    bump('imgVer');
    return { ok: true, title: res.title || '' };
  });
}

/* ───────────── 지우기 (마스터) ─────────────
 * 스크립트 잠금 안에서 지우고 초기화 번호(resetVer)를 올린다.
 * 진행 중이던 요약·정정은 저장 직전에 초기화 번호와 작업 표시를 확인하므로 지운 기록을 되살리지 못한다. */
function clearLog(all) {
  return withLock(30000, () => {
    const ss = SpreadsheetApp.getActive();
    const wipe = name => { const s = ss.getSheetByName(name); if (s.getLastRow() > 1) s.deleteRows(2, s.getLastRow() - 1); };
    wipe(SH.LINES); wipe(SH.SUM); stageSheet(); wipe(SH.STAGE);
    // 지운 회의록을 바탕으로 만든 것들도 함께 지운다: 마스터 기록(현황판·NPC 제안·시상식·피드백), 판정 로그, 캐릭터 수치 기록, 공개한 카드
    [SH.KLOG, SH.ROLLS, SH.CSNAP].forEach(n => { ensureSheet(n); wipe(n); });
    setConf('recap', ''); setConf('awards', ''); setConf('charLast', '{}'); setConf('bookmarks', ''); setConf('nextSteps', '');
    setConf('processedId', '0'); storyWrite('', []);
    setJson('job', null); setJson('pending', null); setJson('procStatus', null); setJson('notesQ', null); setJson('pcAuto', null);
    if (all) {
      wipe(SH.IMG);
      writeNotes(emptyNotes());
      setConf('session', '1'); setConf('sessionAt', '0'); setConf('corrections', '[]');
      bump('imgVer'); bump('notesVer');
    }
    bump('sumVer'); bump('resetVer');
    return { ok: true, message: (all ? '전체 초기화했어요 (캐릭터 연결·용어집·이름 색은 그대로)' : '회의록과 요약을 지웠어요') + ' · 시나리오 자료는 마스터 탭에서 따로 지워요' };
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 마스터 전용 영역
 *
 * 보안 원칙
 *  1) 여기 있는 함수는 doPost에서 마스터로 확인된 요청(keeperTool)으로만 불린다. doGet(주소에 붙는 요청)으로는 부를 수 없다.
 *  2) 마스터 자료는 마스터 전용 시트(키퍼자료·키퍼원문·키퍼기록·판정기록)에만 저장한다.
 *     플레이어가 받는 응답(poll·data·history·sessionLines·evidence·token)은 이 시트를 읽지 않는다.
 *  3) 공개 기록용 AI(요약·정정·이미지 분석·캐릭터 읽기·줄거리 줄이기·시작 카드)는 publicAi() 안에서 돌고,
 *     그 안에서 마스터 자료를 읽으면 keeperOnly()가 오류를 낸다. → 진상이 요약에 섞일 수 없다.
 *  4) 플레이어에게 공개되는 것은 마스터가 '공개'를 누른 시작 카드와 시상식뿐이고, 서버가 정해진 칸만 골라 저장한다.
 *     (마스터 메모 kNote 같은 칸은 공개 자료에 들어가지 않는다)
 *  5) 마스터 비밀번호는 로그인(keeperLogin)할 때 한 번만 받는다. 그 뒤의 마스터 작업은 12시간짜리 토큰으로만 확인하고, 시트에는 토큰의 해시만 남긴다.
 *  6) AI가 답을 만드는 동안 회의록이나 시나리오 자료가 지워졌으면, 그 답은 저장하지 않고 버린다 (klogAdd가 잠금 안에서 확인).
 * ═══════════════════════════════════════════════════════════════════════════ */

/* ───────────── 마스터 로그인 ───────────── */
function sha(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8));
}
function tokenOk(kt) {
  if (!kt || keeperPwOk(roomPw())) return false;
  const h = sha(kt), t = Date.now();
  return confJson('ktokens', []).some(x => x && x.h === h && Number(x.exp) > t);
}
/* 마스터 비밀번호를 받는 유일한 곳.
 *  - 틀린 횟수는 여기서만 센다 (방 비밀번호를 잘못 친 것은 세지 않는다).
 *  - 세는 일을 잠금 안에서 하므로 여러 요청이 동시에 틀려도 횟수가 빠지지 않는다.
 *  - 10분 안에 K_FAIL_MAX번 틀리면 비밀번호 로그인만 10분 잠근다. 이미 로그인한 마스터(토큰)는 영향을 받지 않는다. */
function keeperLogin(kpw) {
  if (keeperPwOk(roomPw())) return { ok: false, error: '방 비밀번호와 마스터 비밀번호가 같아서 마스터 기능이 잠겨 있어요. Code.gs 맨 위에서 서로 다르게 바꾸고 다시 배포해 주세요' };
  const kt = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  return withLock(20000, () => {
    const c = roomCache(), t = Date.now();
    const until = Number(c.get('k_lock') || 0);
    const lockedOut = u => ({ ok: false, locked: true, error: '마스터 비밀번호를 여러 번 틀려서 잠겼어요. ' + Math.max(1, Math.ceil((u - Date.now()) / 60000)) + '분 뒤에 다시 시도해 주세요 (이미 로그인한 기기는 계속 쓸 수 있어요)' });
    if (t < until) return lockedOut(until);
    if (!keeperPwOk(kpw)) {
      const n = Number(c.get('k_fail') || 0) + 1;
      if (n >= K_FAIL_MAX) { const u = t + K_LOCK_MS; c.put('k_lock', String(u), 1200); c.remove('k_fail'); return lockedOut(u); }
      c.put('k_fail', String(n), 600);
      return { ok: false, error: '마스터 비밀번호가 틀렸어요', left: K_FAIL_MAX - n };
    }
    c.remove('k_fail');
    const exp = t + KTOKEN_TTL;
    const list = confJson('ktokens', []).filter(x => x && Number(x.exp) > t).slice(-4);   // 동시에 5대까지
    list.push({ h: sha(kt), exp });
    setJson('ktokens', list);
    return { ok: true, kt, exp, weak: keeperWeak() };     // weak: 비밀번호가 10자보다 짧다 (막지는 않고 화면에 알린다)
  });
}
/* 비밀번호 바꾸기 (마스터 로그인 + 지금 마스터 비밀번호를 한 번 더 확인).
 *  b.room: 새 방 비밀번호 → 설정 탭 roomPw. 예전 비밀번호로 들어와 있던 사람은 다음 요청부터 막힌다.
 *  b.keeper: 새 마스터 비밀번호 → 설정 탭 keeperPwH(해시). 모든 마스터 로그인(토큰)을 끊는다.
 *  유출됐을 때 쓰는 기능이라 Code.gs를 다시 배포하지 않아도 바로 적용된다. */
const PW_MIN = 4, KPW_MIN = 8;
function setPw(b) {
  if (!keeperPwOk(b.kpw)) return { ok: false, error: '지금 마스터 비밀번호가 틀렸어요' };
  const room = b.room == null ? '' : String(b.room).trim(), keeper = b.keeper == null ? '' : String(b.keeper);
  if (!room && !keeper) return { ok: false, error: '바꿀 비밀번호를 적어 주세요' };
  if (room && room.length < PW_MIN) return { ok: false, error: '방 비밀번호는 ' + PW_MIN + '자 이상으로 정해 주세요' };
  if (keeper && keeper.length < KPW_MIN) return { ok: false, error: '마스터 비밀번호는 ' + KPW_MIN + '자 이상으로 정해 주세요' };
  if (keeper && /^\s|\s$/.test(keeper)) return { ok: false, error: '마스터 비밀번호 앞뒤에 빈칸이 있으면 안 돼요' };
  const newRoom = room || roomPw();
  if (keeper ? newRoom === keeper : keeperPwOk(newRoom)) return { ok: false, error: '방 비밀번호와 마스터 비밀번호는 서로 달라야 해요' };
  withLock(20000, () => {
    if (room) setConf('roomPw', room);
    if (keeper) {
      const salt = Utilities.getUuid().replace(/-/g, '');
      setConf('keeperPwH', salt + ':' + sha(salt + keeper));
      setConf('keeperWeak', keeper.length < 10 ? '1' : '');
      setJson('ktokens', []);                         // 모든 기기의 마스터 로그인을 끊는다
    }
  });
  return { ok: true, room: !!room, keeper: !!keeper, title: roomTitle() };
}
function keeperLogout(kt, all) {
  if (!kt || !tokenOk(kt)) return { ok: true };
  withLock(20000, () => {
    const h = sha(kt);
    setJson('ktokens', all ? [] : confJson('ktokens', []).filter(x => x && x.h !== h));
  });
  return { ok: true };
}

/* 구글 문서 링크에서 글자를 읽는다 (마스터 전용). 읽은 글은 화면이 받아서 PDF와 같은 길(kSrcAdd)로 올린다.
 * 문서에 탭이 여러 개면 탭마다 ⟦탭 이름⟧ 표시를 붙여 모두 읽는다. 마스터(이 시트 주인)의 구글 계정으로 열 수 있어야 한다. */
function kDocText(url) {
  url = String(url || '').trim();
  const m = url.match(/\/document\/d\/([A-Za-z0-9_-]{20,})/) || url.match(/^([A-Za-z0-9_-]{25,})$/);
  if (!m) return { ok: false, error: '구글 문서 링크가 아니에요 (https://docs.google.com/document/d/… 형식). 구글 드라이브에 올린 PDF·워드 파일은 내려받아서 파일로 올려 주세요' };
  let doc;
  try { doc = DocumentApp.openById(m[1]); }
  catch (e) { return { ok: false, error: '이 구글 문서를 열 수 없어요. 이 시트 주인(마스터)의 구글 계정이 볼 수 있게 공유돼 있는지 확인해 주세요 · ' + String(e && e.message || e).slice(0, 120) }; }
  let parts = [];
  try {
    const tabs = [];
    const walk = t => { tabs.push(t); (t.getChildTabs() || []).forEach(walk); };
    (doc.getTabs() || []).forEach(walk);
    parts = tabs.map(t => { const tx = t.asDocumentTab().getBody().getText(); return tabs.length > 1 ? '⟦' + t.getTitle() + '⟧\n' + tx : tx; });
  } catch (e) { parts = []; }
  if (!parts.join('').trim()) { try { parts = [doc.getBody().getText()]; } catch (e) {} }
  const text = parts.join('\n\n').trim();
  if (!text) return { ok: false, error: '문서에 읽을 글자가 없어요 (그림만 있는 문서는 PDF로 저장해서 올려 주세요)' };
  return { ok: true, title: String(doc.getName() || '구글 문서').slice(0, 60), text: text.slice(0, 800000), chars: text.length };
}
/* ───────────── 마스터 도구 목록 ───────────── */
function keeperTool(b) {
  switch (b.action) {
    case 'kData':          return kData();
    // 시나리오 자료
    case 'kSrcAdd':        return kbGuard(b.gen, () => kSrcAdd(b));
    case 'kSrcDel':        return kSrcDel(b.source);
    case 'kDocText':       return kDocText(b.url);
    case 'kOcr':           return kOcr(b);
    case 'kDigest':        return kDigestStep();
    case 'kKbSave':        return kbGuard(b.gen, () => kKbSave(b.sec, b.item));
    case 'kKbDelete':      return kbGuard(b.gen, () => kKbDelete(b.sec, b.id));
    case 'kKbOrder':       return kbGuard(b.gen, () => kKbOrder(b.sec, b.ids));
    case 'kKbUnlock':      return kbGuard(b.gen, () => kKbUnlock(b.sec, b.id));
    case 'kKbText':        return kbGuard(b.gen, () => kKbText(b.key, b.text));
    case 'kTruthPolish':   return kTruthPolish();
    case 'kKbClear':       return kKbClear();
    // 세션 중
    case 'kNpc':           return kNpc(b);
    case 'kRoll':          return kRoll(b);
    case 'kBoard':         return kBoard(!!b.full);
    case 'kClueMark':      return kbGuard(b.gen, () => kClueMark(b.id, b.mark));
    // 세션 사이
    case 'kRecap':         return kRecap(b.session);
    case 'kRecapPublish':  return kRecapPublish(b.card, b.rv, b.draftId);
    case 'kRecapOff':      return withLock(20000, () => { setConf('recap', ''); bump('sumVer'); return { ok: true }; });
    case 'kStats':         return { ok: true, stats: sessionStats(sessOf(b.session)), rv: getConf('resetVer') || '0' };
    case 'kRollsSave':     return kRollsSave(b);
    case 'kAwards':        return kAwards(b.session);                       // 공개 기록만으로 후보 만들기
    case 'kAwardsCompare': return kAwardsCompare(b.draftId);                // (마스터가 고를 때만) 만든 후보를 진상과 견줘 마스터 메모만 붙이기
    case 'kAwardsPublish': return kAwardsPublish(b.session, b.items, b.rv, b.draftId);
    case 'kAwardsOff':     return withLock(20000, () => { setConf('awards', ''); bump('sumVer'); return { ok: true }; });
    case 'kFeedback':      return kFeedback(b.session, !!b.full);
  }
  return null;
}
/* 시나리오 자료를 고치거나 더하는 요청에 쓰는 확인. gen = 화면이 그 자료를 받아 왔을 때의 자료 번호.
 * 그 뒤 다른 탭에서 "시나리오 자료 전체 지우기"를 했다면 번호가 달라져 있다 → 지운 자료를 보고 만든 수정·추가가 새 자료에 섞이지 않게 받지 않는다.
 * (gen을 보내지 않는 예전 화면의 요청은 그대로 받는다) */
function kbGuard(gen, fn) {
  return withLock(30000, () => (gen != null && gen !== '' && String(gen) !== (getConf('kbGen') || '0'))
    ? { ok: false, stale: true, error: '그 사이 시나리오 자료를 모두 지웠어요. 지우기 전 화면에서 보낸 내용이라 반영하지 않았어요. "새로 고침"을 눌러 주세요' } : fn());
}
// AI가 답을 만드는 사이 기록·자료가 지워져서 결과를 버렸다는 응답 (화면은 stale을 보면 결과를 쓰지 않는다)
function staleOut(what) {
  return { ok: false, stale: true, error: 'AI가 답을 만드는 사이에 ' + (what || '회의록이나 시나리오 자료') + '가 지워졌어요. 지워진 자료로 만든 결과라서 저장하지 않고 버렸어요. 필요하면 다시 눌러 주세요' };
}

/* ───────────── 마스터 정리본 (시나리오 자료를 AI가 읽어 만든 마스터용 노트) ───────────── */
const KB_SECTIONS = ['npcs', 'places', 'clues', 'rolls', 'scenes'];
const KB_FIELDS = {
  npcs:   ['name', 'role', 'secret', 'motive', 'lies', 'knows', 'attitude', 'voice'],
  places: ['name', 'hidden'],
  clues:  ['text', 'where', 'how', 'core'],
  rolls:  ['where', 'skill', 'success', 'hard', 'extreme', 'fail', 'fumble'],
  scenes: ['title', 'summary']
};
const KB_NAME = { npcs: 'name', places: 'name', clues: 'text', rolls: 'skill', scenes: 'title' };
function kbEmpty() { return { truth: '', memo: '', glossary: '', npcs: [], places: [], clues: [], rolls: [], scenes: [], done: [], deleted: {} }; }
function kbNextSeq(arr) { let m = 0; (arr || []).forEach(x => { if (Number(x.seq) > m) m = Number(x.seq); }); return m + 1; }
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
  // seq: 처음 정리된 순번 (= 시나리오 원문에 나온 순서). 카드를 끌어 순서를 바꿔도 그대로라서 "시간순" 정렬에 쓴다
  KB_SECTIONS.forEach(s => { let m = 0; k[s].forEach(x => { if (Number(x.seq) > m) m = Number(x.seq); }); const none = !m; k[s].forEach((x, i) => { if (!Number(x.seq)) x.seq = none ? i + 1 : ++m; }); });
  k.truth = String(k.truth || ''); k.memo = String(k.memo || ''); k.glossary = String(k.glossary || '');
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
// AI가 뽑은 내용을 정리본에 합친다. 마스터가 고친(locked) 항목과 지운 항목은 건드리지 않는다.
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
      const item = Object.assign({ id: kid(), locked: false }, clean); item.seq = kbNextSeq(res);
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
  '이미 적혀 있는 내용이면 출력하지 마라. 새 대상은 id를 비워라. "locked":true 인 항목은 마스터가 직접 고친 것이니 출력하지 마라.';

/* ───────────── 시나리오 원문 조각 ─────────────
 * 한 행 = 조각 하나: [조각ID, 출처, 순번, 글자수, 본문, 추가 시각, 나눈 원래 조각]
 *
 * 조각 나누기 (AI 답이 잘려서 조각을 반으로 줄일 때)
 *  - 원래 조각의 행은 고치지 않는다. 앞 절반·뒤 절반을 새 조각 두 개로, 한 번의 쓰기로 맨 아래에 덧붙인다 (순번은 "3.1", "3.2").
 *  - 쓸 조각은 "두 자식이 모두 있는 원래 조각"을 뺀 나머지다(ksrcEffective).
 *      쓰기 전에 멈춤 → 원래 조각이 그대로 쓰인다.   쓰기가 끝남 → 자식 두 개가 쓰이고 원래 조각은 숨는다.
 *      혹시 자식이 하나만 남았다면 → 원래 조각이 그대로 쓰이고, 다음에 나눌 때 그 하나를 치운 뒤 다시 둘을 쓴다.
 *    어느 순간에 멈춰도 "원래 조각 전체" 아니면 "완전한 두 조각" 가운데 하나이고, 다시 실행해도 뒤 절반이 두 번 생기지 않는다.
 *  - 순번은 "3.1.2"처럼 점으로 이어 쓰고 숫자 묶음으로 견준다 → 나뉜 조각이 원래 자리에서 순서대로 읽힌다.
 *    (예전 버전이 쓴 "1-2" 꼴도 같은 방식으로 읽는다)
 *  - 쪽 표시: PDF에서 온 글에는 화면이 쪽마다 ⟦12쪽⟧ 표시를 넣어 보낸다. 나눌 때 뒤 절반 앞에 ⟦12쪽 이어짐⟧을 붙여 쪽 번호를 잇는다. */
function ordPath(ord) { return String(ord == null ? '' : ord).split(/[.\-]/).map(x => Number(x) || 0); }
function ordCmp(a, b) {
  const x = ordPath(a), y = ordPath(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] == null ? -1 : x[i]) - (y[i] == null ? -1 : y[i]); if (d) return d; }
  return 0;
}
function ordLabel(ord) { return String(ord == null ? '' : ord).replace(/\./g, '-'); }
// 시트에 있는 모든 행 (숨은 원래 조각 포함). withText가 아니면 본문은 읽지 않는다 (원문이 많아도 빠르게)
function ksrcAll(withText) {
  keeperOnly('시나리오 원문');
  const s = ensureSheet(SH.KSRC), last = s.getLastRow();
  if (last < 2) return [];
  const n = last - 1;
  const v = withText ? s.getRange(2, 1, n, 7).getValues()
    : (() => { const a = s.getRange(2, 1, n, 4).getValues(), p = s.getRange(2, 7, n, 1).getValues(); return a.map((r, i) => [r[0], r[1], r[2], r[3], '', '', p[i][0]]); })();
  return v.map((r, i) => {
    const text = withText ? decS(r[4]) : '';
    return { row: i + 2, id: String(r[0]), source: decS(r[1]).trim(), ord: String(r[2]), len: withText ? text.length : (Number(r[3]) || 0), text, parent: String(r[6] || '') };
  }).filter(r => r.id);
}
// 실제로 쓰는 조각만 읽는 순서대로 (나뉜 원래 조각과, 짝이 없는 자식은 뺀다)
function ksrcEffective(all) {
  const byId = {}, kids = {}, first = {};
  all.forEach(r => { byId[r.id] = r; if (first[r.source] == null) first[r.source] = r.row; });
  all.forEach(r => { if (r.parent && byId[r.parent]) (kids[r.parent] = kids[r.parent] || []).push(r); });
  const pair = id => { const k = kids[id] || [], a = k.find(x => /\.1$/.test(x.ord)), b = k.find(x => /\.2$/.test(x.ord)); return a && b ? [a, b] : null; };
  const outE = [];
  const walk = (r, depth) => { const p = depth < 12 ? pair(r.id) : null; if (p) { walk(p[0], depth + 1); walk(p[1], depth + 1); } else outE.push(r); };
  all.forEach(r => { if (!r.parent || !byId[r.parent]) walk(r, 0); });
  return outE.sort((x, y) => (first[x.source] - first[y.source]) || ordCmp(x.ord, y.ord) || (x.row - y.row));
}
function ksrcList(kb, eff) {
  const done = new Set(kb.done || []), by = {}, order = [];
  eff.forEach(r => {
    if (!by[r.source]) { by[r.source] = { source: r.source, chunks: 0, chars: 0, pending: 0 }; order.push(r.source); }
    const g = by[r.source]; g.chunks++; g.chars += r.len; if (!done.has(r.id)) g.pending++;
  });
  return order.map(k => by[k]);
}
function chunkId() { return 'c' + Utilities.getUuid().replace(/-/g, '').slice(0, 12); }
function kSrcAdd(b) {
  const source = String(b.source || '').trim().slice(0, 80) || '자료';       // 이름 앞 글자를 지우지 않는다 (수식 방지는 enc가 맡는다)
  const parts = (Array.isArray(b.parts) ? b.parts : []).map(x => String(x || '').trim()).filter(Boolean).map(x => x.slice(0, 12000));
  if (!parts.length) return { ok: false, error: '올릴 내용이 없어요' };
  return withLock(30000, () => {
    const s = ensureSheet(SH.KSRC), all = ksrcAll(false);
    if (all.length + parts.length > 600) return { ok: false, error: '원문이 너무 많아요 (조각 600개 한도). 필요 없는 자료를 지우고 다시 올려 주세요' };
    let n = all.filter(r => r.source === source).reduce((m, r) => Math.max(m, ordPath(r.ord)[0] || 0), 0);
    const add = parts.map(t => [chunkId(), enc(source), String(++n), String(t.length), enc(t), now(), '']);
    s.getRange(s.getLastRow() + 1, 1, add.length, 7).setNumberFormat('@').setValues(add);
    return { ok: true, added: add.length, total: ksrcEffective(all).length + add.length };
  });
}
// 자료 하나 지우기: 그 출처의 행(나뉜 원래 조각·자식 포함)을 모두 지운다.
// 그 조각을 읽고 있던 AI 정리가 뒤늦게 끝나도, 반영 직전에 "조각이 아직 있는지" 확인하므로 정리본에 들어가지 않는다.
function kSrcDel(source) {
  source = String(source || '').trim();
  return withLock(30000, () => {
    const s = ensureSheet(SH.KSRC), all = ksrcAll(false), rows = all.filter(r => r.source === source);
    const shown = ksrcEffective(all).filter(r => r.source === source).length;
    for (let i = rows.length - 1; i >= 0; i--) s.deleteRows(rows[i].row, 1);
    bump('kVer');
    return { ok: true, removed: shown, message: '원문 ' + shown + '조각을 지웠어요. 이미 정리본에 들어간 내용은 남아 있어요 (정리 중이던 조각의 결과는 버려요)' };
  });
}
// 쪽 표시: 지금 화면이 넣는 ⟦12쪽⟧ / ⟦12쪽 이어짐⟧, 그리고 예전 버전이 넣던 "[12쪽]"(그것만 있는 줄)
const PAGE_MARK = /⟦(\d+)쪽(?: 이어짐)?⟧|(?:^|\n)\[(\d+)쪽\](?=\n|$)/g;
function pageAt(text, i) {                   // 글의 i번째 글자가 PDF의 몇 번째 쪽인지 (그 앞에 쪽 표시가 없으면 null: 짐작하지 않는다)
  let pg = null, m; const re = new RegExp(PAGE_MARK.source, 'g');
  while ((m = re.exec(text)) && m.index <= i) pg = Number(m[1] || m[2]);
  return pg;
}
/* 조각을 반으로 나눈다. 돌려주는 값: 'split'(나눴음) / 'already'(다른 요청이 이미 나눴음) / false(나눌 수 없음)
 * len·gen: 호출한 쪽이 읽었던 조각 길이와 자료 번호. 그 사이 조각이 바뀌었거나 자료를 모두 지웠으면 나누지 않는다. */
function ksrcSplit(id, len, gen) {
  return withLock(20000, () => {
    if (gen != null && (getConf('kbGen') || '0') !== String(gen)) return false;
    const s = ensureSheet(SH.KSRC), all = ksrcAll(true), r = ksrcEffective(all).find(x => x.id === id);
    if (!r) return all.some(x => x.id === id) ? 'already' : false;
    if (len != null && r.len !== len) return false;
    if (kbRead().done.indexOf(id) >= 0) return false;                       // 그 사이 정리가 끝난 조각
    if (r.text.length <= 1500) return false;
    let cut = r.text.lastIndexOf('\n', Math.floor(r.text.length / 2));
    if (cut < r.text.length * 0.25) cut = Math.floor(r.text.length / 2);
    const a = r.text.slice(0, cut).trim();
    let b2 = r.text.slice(cut).trim();
    if (!a || !b2) return false;
    if (!/^⟦\d+쪽/.test(b2)) { const pg = pageAt(a, a.length); if (pg != null) b2 = '⟦' + pg + '쪽 이어짐⟧\n' + b2; }
    // 예전에 나누다 멈춰서 자식이 하나만 남아 있으면 먼저 치운다 (아래쪽 행부터)
    all.filter(x => x.parent === id).sort((x, y) => y.row - x.row).forEach(o => s.deleteRows(o.row, 1));
    const mk = (tail, t) => [chunkId(), enc(r.source), r.ord + tail, String(t.length), enc(t), now(), id];
    s.getRange(s.getLastRow() + 1, 1, 2, 7).setNumberFormat('@').setValues([mk('.1', a), mk('.2', b2)]);   // 두 조각을 한 번에 쓴다
    return 'split';
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
// AI 호출은 잠금 밖에서 하고, 결과를 합치기 직전에만 짧게 잠가서 "그 조각이 아직 그대로 있는지"를 다시 확인한다.
function kDigestStep() {
  const gen = getConf('kbGen') || '0';
  const kb = kbRead(), eff = ksrcEffective(ksrcAll(true)), done = new Set(kb.done);
  const pend = eff.filter(r => !done.has(r.id));
  if (!pend.length) return { ok: true, left: 0, total: eff.length };
  const c = pend[0], label = ordLabel(c.ord);
  let res;
  try {
    res = parseJson(claude(
      '너는 TRPG 마스터(게임 마스터)의 비공개 준비 노트를 만드는 조수다. 아래는 마스터만 보는 시나리오 자료의 일부다. ' +
      '자료에 있는 내용만 정리하고 지어내지 마라. 문장을 길게 베끼지 말고, 마스터가 진행 중에 한눈에 볼 수 있게 짧게 정리하라. ' +
      '자료 속 ⟦12쪽⟧ 같은 표시는 원본의 쪽 번호일 뿐이니 정리에 옮기지 마라. JSON 하나만 출력하라.',
      '## 지금까지 만든 정리본\n' + kbForAi(kb, c.text) + '\n\n' +
      '## 시나리오 자료 (' + c.source + ', 조각 ' + label + ')\n' + c.text + '\n\n' +
      '## 출력 형식\n{"truthAdd":"이 조각에서 새로 알게 된 사건의 진상·배경·흑막 (400자 이내, 없으면 빈칸)",' +
      '"npcs":[],"places":[],"clues":[],"rolls":[],"scenes":[]}\n' + KB_RULE, 3500));
  } catch (e) {
    /* 실패한 까닭에 따라 다르게 대응한다.
     *  truncated·parse: 답이 길어서 끊겼거나 형식이 깨짐 → 조각을 반으로 나눠 다시
     *  fetch: 응답을 못 받음(연결·지연) → 한 번은 그대로 다시, 같은 조각에서 또 그러면 반으로 나눈다
     *  rate·server: Claude 쪽이 바쁨 → 조각은 그대로 두고 잠시 뒤 다시 / auth·bad: 다시 해도 같으니 멈춘다 */
    const kind = (e && e.kind) || '', msg = String(e && e.message || e);
    let split = null, again = false, wait = 0;
    if (kind === 'truncated' || kind === 'parse') { try { split = ksrcSplit(c.id, c.len, gen); } catch (e2) {} }
    else if (kind === 'fetch') {
      let n = 1;
      try { const ch = roomCache(); n = Number(ch.get('kd_' + c.id) || 0) + 1; ch.put('kd_' + c.id, String(n), 900); } catch (e2) {}
      if (n >= 2) { try { split = ksrcSplit(c.id, c.len, gen); } catch (e2) {} }
      again = true; wait = 3000;
    }
    else if (kind === 'rate') { again = true; wait = 30000; }
    else if (kind === 'server') { again = true; wait = 8000; }
    const didSplit = split === 'split' || split === 'already';
    return { ok: false, kind, retry: again || didSplit, wait, split: didSplit, source: c.source, part: label,
      error: '정리 실패 (' + c.source + ' 조각 ' + label + '): ' + msg + (didSplit ? ' · 조각을 반으로 나눠서 다시 시도해요 (AI 호출이 그만큼 늘어요)' : '') };
  }
  return withLock(30000, () => {
    if ((getConf('kbGen') || '0') !== gen) return staleOut('시나리오 자료');
    const effNow = ksrcEffective(ksrcAll(false)), cur = kbRead(), doneNow = new Set(cur.done);
    const left = () => effNow.filter(r => !doneNow.has(r.id)).length;
    const still = effNow.find(r => r.id === c.id);
    // 그 사이 이 자료를 지웠거나(자료 하나 지우기) 다른 요청이 조각을 나눴다 → 이 결과는 정리본에 넣지 않는다
    if (!still || still.len !== c.len) return { ok: true, ai: true, skipped: true, left: left(), total: effNow.length, source: c.source, note: '정리하는 사이 이 조각이 지워지거나 나뉘어서, 그 결과는 정리본에 넣지 않았어요' };
    if (doneNow.has(c.id)) return { ok: true, ai: true, left: left(), total: effNow.length, source: c.source };   // 다른 요청이 먼저 처리함
    const merged = kbMerge(cur, res);
    merged.done = cur.done.concat([c.id]).slice(-2000);     // 정리본과 "어디까지 읽었는지"를 한 번에 저장 → 같은 조각을 두 번 합치지 않는다
    kbWrite(merged);
    doneNow.add(c.id);
    return { ok: true, ai: true, left: left(), total: effNow.length, source: c.source, part: label };     // ai: 이번 걸음에 AI를 한 번 불렀다
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
    else kb[sec].push(Object.assign({ id: kid(), seq: kbNextSeq(kb[sec]) }, clean));
    const key = kbKey(sec, clean);
    if (kb.deleted[sec]) kb.deleted[sec] = kb.deleted[sec].filter(k => k !== key);
    kbWrite(kb);
    return { ok: true };
  });
}
// 마스터가 카드를 끌어서 정한 순서로 저장한다 (목록에 없는 항목은 원래 순서대로 뒤에)
function kKbOrder(sec, ids) {
  if (KB_SECTIONS.indexOf(sec) < 0 || !Array.isArray(ids)) return { ok: false, error: '잘못된 요청' };
  return withLock(20000, () => {
    const kb = kbRead(), arr = kb[sec] || [], pos = {};
    ids.slice(0, 2000).forEach((id, i) => { if (pos[id] == null) pos[id] = i; });
    const known = arr.filter(x => pos[x.id] != null).sort((a, b) => pos[a.id] - pos[b.id]);
    const rest = arr.filter(x => pos[x.id] == null);
    kb[sec] = known.concat(rest);
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
  if (key !== 'truth' && key !== 'memo' && key !== 'glossary') return { ok: false, error: '잘못된 항목' };
  return withLock(20000, () => { const kb = kbRead(); kb[key] = String(text || '').slice(0, 8000); kbWrite(kb); return { ok: true }; });
}
// 조각마다 덧붙여 온 진상 메모를 한 번 매끄럽게 다시 쓴다
function kTruthPolish() {
  const gen = getConf('kbGen') || '0', kb = kbRead(), before = kb.truth;
  if (before.length < 200) return { ok: false, error: '다듬을 만큼 길지 않아요' };
  const res = parseJson(claude(
    '너는 TRPG 마스터의 비공개 준비 노트를 다듬는 조수다. 주어진 메모에 있는 내용만 쓰고 지어내지 마라. JSON 하나만 출력하라.',
    '## 진상 메모 (여러 조각에서 모은 것, 겹치는 내용 있음)\n' + before + '\n\n## 할 일\n겹치는 내용을 합치고 일어난 순서대로 정리해서 1500자 이내로 다시 써라. ' +
    '누가, 왜, 무엇을 했는지와 지금 무슨 일이 벌어지고 있는지가 한눈에 보이게 하라.\n## 출력 형식\n{"truth":"다시 쓴 진상"}', 2600));
  const outT = String(res.truth || '').trim();
  if (outT.length < 50) return { ok: false, error: 'AI가 빈 답을 줬어요. 다시 눌러 주세요' };
  return withLock(20000, () => {
    if ((getConf('kbGen') || '0') !== gen) return staleOut('시나리오 자료');
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

/* ───────────── 마스터 기록 (현황판·제안·초안 보관) ─────────────
 * 한 행: [ID, 시각, 초기화번호, 세션, 종류, 제목, 입력, 결과, 자료번호]
 * deps = 이 결과가 무엇을 읽고 만들어졌는지. { rv: 회의록(초기화번호), gen: 시나리오 자료(자료번호) }
 *   AI를 부르기 전에 읽어 둔 번호를 넘기면, 저장할 때 잠금 안에서 지금 번호와 견준다.
 *   그 사이 '회의록 지우기'(rv가 바뀜)나 '시나리오 자료 지우기'(gen이 바뀜)를 했으면 저장하지 않고 null을 돌려준다.
 *   번호 확인 · 쓸 행 고르기 · 쓰기가 한 잠금 안에서 이어지므로, 확인과 쓰기 사이에 지우기가 끼어들 수 없다.
 * 회의록만 읽은 결과(시작 카드·시상식 후보)는 rv만, 시나리오 자료만 읽은 결과는 gen만, 둘 다 읽은 결과는 둘 다 넘긴다. */
function klogAdd(kind, session, title, input, result, deps) {
  keeperOnly('마스터 기록');
  return withLock(20000, () => {                              // 잠글 때 설정을 새로 읽는다
    const rv = getConf('resetVer') || '0', gen = getConf('kbGen') || '0';
    if (deps && deps.rv != null && String(deps.rv) !== rv) return null;
    if (deps && deps.gen != null && String(deps.gen) !== gen) return null;
    const id = 'g' + Utilities.getUuid().replace(/-/g, '').slice(0, 10);
    const s = ensureSheet(SH.KLOG);
    s.getRange(s.getLastRow() + 1, 1, 1, 9).setNumberFormat('@').setValues([[id, now(), rv, enc(String(session || '')), String(kind), enc(String(title || '').slice(0, 100)),
      enc(JSON.stringify(input == null ? null : input).slice(0, 20000)), enc(JSON.stringify(result == null ? null : result).slice(0, 45000)),
      deps && deps.gen != null ? gen : '']]);
    return id;
  });
}
// 지금 회의록·지금 시나리오 자료에 딸린 기록만 돌려준다 (지운 뒤에 예전 결과가 다시 보이지 않게)
function klogRows() {
  keeperOnly('마스터 기록');
  const s = ensureSheet(SH.KLOG), last = s.getLastRow();
  if (last < 2) return [];
  const rv = getConf('resetVer') || '0', gen = getConf('kbGen') || '0', from = Math.max(2, last - 399);
  return s.getRange(from, 1, last - from + 1, 9).getValues()
    .filter(r => r[0] && String(r[2]) === rv && (String(r[8] || '') === '' || String(r[8]) === gen)).map(r => {
      const j = x => { try { return JSON.parse(decS(x)); } catch (e) { return null; } };
      return { id: String(r[0]), at: String(r[1]), session: decS(r[3]), kind: String(r[4]), title: decS(r[5]), input: j(r[6]), result: j(r[7]) };
    });
}
// 시상식 후보 기록을 화면용으로 정리한다. 공개 기록만으로 만든 후보(mode:'public')만 '공개용 후보'로 다룬다.
// 예전 버전이 만든 후보(진상을 함께 보냈을 수 있음)는 legacy로 표시만 하고, 공개·견주기에는 쓰지 못하게 한다.
const AWARD_PUBLIC = ['id', 'category', 'player', 'character', 'title', 'text', 'ev'];
function awardsView(l, notesBy) {
  const pub = !!(l.input && l.input.mode === 'public');
  const hs = (l.result && Array.isArray(l.result.highlights)) ? l.result.highlights : [];
  const note = pub ? (notesBy[l.id] || null) : null;
  return {
    id: l.id, at: l.at, session: l.session, legacy: !pub, legacyTruth: !pub && !!(l.input && l.input.useTruth),
    highlights: hs.map(h => { const o = pickF(h || {}, AWARD_PUBLIC); if (!pub && h && h.kNote) o.kNote = String(h.kNote); return o; }),
    dropped: (l.result && Array.isArray(l.result.dropped)) ? l.result.dropped.slice(0, 8).map(x => ({ title: String(x.title || ''), why: String(x.why || '') })) : [],
    notes: note ? note.notes : null, notesAt: note ? note.at : ''
  };
}
function kData() {
  const kb = kbRead(), eff = ksrcEffective(ksrcAll(false)), logs = klogRows();
  const lastN = (kind, n) => logs.filter(l => l.kind === kind).slice(-n).reverse();
  const done = new Set(kb.done);
  const rollS = ensureSheet(SH.ROLLS);
  const notesBy = {};
  logs.forEach(l => { if (l.kind === 'awardsNote' && l.input && l.input.draftId && l.result) notesBy[String(l.input.draftId)] = { at: l.at, notes: l.result.notes || {} }; });
  return {
    ok: true, kb, sources: ksrcList(kb, eff), pending: eff.filter(r => !done.has(r.id)).length, chunks: eff.length,
    board: lastN('board', 1)[0] || null, recaps: lastN('recap', 6), awardsLogs: lastN('awards', 6).map(l => awardsView(l, notesBy)), feedbacks: lastN('feedback', 6),
    npcLog: lastN('npc', 12), rollLog: lastN('roll', 12),
    recap: confJson('recap', null), awards: confJson('awards', null),
    rollsTotal: Math.max(0, rollS.getLastRow() - 1), sessions: sessionList().sessions, session: getConf('session'),
    keeperName: getConf('keeperName') || '', resetVer: getConf('resetVer') || '0', kbGen: getConf('kbGen') || '0',
    weak: keeperWeak(), code: CODE_VER
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
    .map(r => ({ from: String(r[1]), to: String(r[2]), text: decS(r[3]) }))
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
function sessOf(v) { return /^\d{1,5}$/.test(String(v == null ? '' : v)) ? String(v) : String(getConf('session') || '1'); }     // 세션 번호는 숫자만 (아니면 지금 세션)
function txt(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 600); }
function arr(v, n, len) { return (Array.isArray(v) ? v : (v ? [v] : [])).map(x => txt(x, len || 300)).filter(Boolean).slice(0, n || 8); }

/* ───────────── NPC 반응 제안 ───────────── */
function kNpc(b) {
  const rv = getConf('resetVer') || '0', gen = getConf('kbGen') || '0';
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
    '너는 TRPG 마스터(게임 마스터)의 진행을 돕는 비공개 조수다. 마스터가 NPC를 연기할 수 있게 그 NPC의 반응을 제안하라. ' +
    '규칙: ① NPC는 자기가 아는 것만 말한다. 진상이나 다른 NPC의 비밀 가운데 이 NPC가 모르는 것은 대사에 넣지 마라. ' +
    '② NPC가 숨기는 것은 판정 결과가 충분히 좋거나 상황이 그럴 만할 때만 조금 드러내라. 판정이 실패면 둘러대게 하라. ' +
    '③ 이 NPC가 이전에 한 말(주장)과 어긋나지 않게 하라. 어긋날 수밖에 없으면 warn에 적어라. ' +
    '④ 자료에 없는 사실을 새로 지어내지 마라. 자료가 부족하면 warn에 "자료에 없음"이라고 적고 무난한 반응을 제안하라. ' +
    '⑤ 대사는 한국어 구어체로 짧게, 마스터가 바로 소리 내어 읽을 수 있게 써라. JSON 하나만 출력하라.';
  const user =
    '## NPC 이름\n' + name + '\n\n' +
    '## 이 NPC의 비공개 설정 (마스터 전용)\n' + (kn ? JSON.stringify(pickF(kn, KB_FIELDS.npcs)) : '(정리본에 없음)') + '\n\n' +
    '## 관계있는 비공개 자료 (마스터 전용)\n' + (rel.length ? rel.join('\n') : '(없음)') + '\n\n' +
    (b.full ? '## 사건의 진상 전체 (마스터 전용, 이 NPC가 모르는 부분은 대사에 쓰지 말 것)\n' + (kb.truth || '(없음)') + '\n\n' : '') +
    '## 플레이어가 이 NPC에 대해 아는 것 (공개 기록)\n' + (pub ? JSON.stringify(pickF(pub, ['name', 'affil', 'age', 'traits', 'said', 'relation'])) : '(아직 기록 없음)') + '\n\n' +
    '## 공개 기록에 남은 NPC들의 주장 (이 가운데 이 NPC가 한 말이 있으면 그것과 어긋나지 않게)\n' + (claims.length ? claims.join('\n') : '(없음)') + '\n\n' +
    '## 방금까지의 대화 (받아쓰기)\n' + (recentTalk(30) || '(없음)') + '\n\n' +
    '## 지금 상황\n' + (place ? '장소: ' + place + '\n' : '') + situation + '\n' +
    (skill || level ? '판정: ' + (skill || '(기술 미지정)') + ' → ' + (level || '(결과 미지정)') + '\n' : '') + '\n' +
    '## 출력 형식\n{"lines":["대사 후보 1","대사 후보 2","대사 후보 3"],"expression":"표정·몸짓·목소리","inner":"속마음 (마스터만 봄)",' +
    '"reveal":"이번에 드러내도 되는 정보 (없으면 빈칸)","hide":"계속 숨겨야 하는 것 (없으면 빈칸)","consistency":"이전 주장과 맞는지 한 문장","warn":"주의할 점 (없으면 빈칸)"}';
  const res = parseJson(claude(system, user, 1500));
  const result = { lines: arr(res.lines, 4, 400), expression: txt(res.expression), inner: txt(res.inner), reveal: txt(res.reveal), hide: txt(res.hide), consistency: txt(res.consistency), warn: txt(res.warn) };
  // used: 실제로 AI에 보낸 마스터 자료의 범위 (화면에 그대로 보여 준다)
  const used = { inKb: !!kn, related: rel.length, full: !!b.full };
  if (!klogAdd('npc', getConf('session'), name, { npc: name, place, situation, skill, level, full: !!b.full }, result, { rv, gen })) return staleOut();
  return { ok: true, result, used };
}

/* ───────────── 판정 결과 보조 ───────────── */
// 원문에서 기술 이름이 나오는 대목을 찾아 앞뒤를 잘라 보여 준다 (AI 없이, 원문 글자 그대로)
// page: 그 대목이 있던 PDF의 쪽 번호. 올릴 때 쪽 표시가 남은 자료에서만 알 수 있고, 모르면 null (짐작해서 채우지 않는다)
function ksrcFind(skill, place, max) {
  skill = String(skill || '').trim(); place = String(place || '').trim();
  if (skill.length < 2) return [];
  const found = [], strip = t => t.replace(new RegExp(PAGE_MARK.source, 'g'), ' ').replace(/^[^⟦⟧]{0,10}⟧/, '').replace(/⟦[^⟦⟧]{0,10}$/, '').trim();
  ksrcEffective(ksrcAll(true)).forEach(r => {
    let i = -1, n = 0;
    while ((i = r.text.indexOf(skill, i + 1)) >= 0 && n < 3) {
      const a = Math.max(0, i - 220), z = Math.min(r.text.length, i + skill.length + 380);
      const ex = r.text.slice(a, z);
      const near = place.length >= 2 && ex.indexOf(place) >= 0, inPart = place.length >= 2 && r.text.indexOf(place) >= 0;
      found.push({ source: r.source, part: ordLabel(r.ord), page: pageAt(r.text, i), text: (a > 0 ? '…' : '') + strip(ex) + (z < r.text.length ? '…' : ''),
        place: near ? 'near' : (inPart ? 'part' : ''), score: near ? 2 : (inPart ? 1 : 0) });
      i += 300; n++;
    }
  });
  return found.sort((x, y) => y.score - x.score).slice(0, max || 3).map(f => ({ source: f.source, part: f.part, page: f.page, text: f.text, place: f.place }));
}
/* 판정 보조. 돌려주는 것은 세 종류이고 화면에서 서로 다르게 표시한다.
 *  written  = AI가 시나리오를 읽고 만든 정리본의 판정 항목 (원문 그대로가 아니다. 마스터가 고친 항목은 locked)
 *  excerpts = 원문에서 글자 그대로 잘라 온 대목 (파일 이름·쪽 번호와 함께)
 *  ai       = 지금 새로 만든 AI 제안 (b.ai가 참일 때만 AI를 한 번 부른다. 아니면 AI 호출 0번)
 * 진상 전체는 b.ai와 b.full을 모두 켰을 때만 AI에 보낸다. */
function kRoll(b) {
  const rv = getConf('resetVer') || '0', gen = getConf('kbGen') || '0';
  const skill = txt(b.skill, 40), place = txt(b.place, 60), memo = txt(b.text, 1000), level = LEVELS.indexOf(b.level) >= 0 ? b.level : '';
  if (!skill) return { ok: false, error: '기술 이름을 적어 주세요' };
  const kb = kbRead();
  const norm = x => String(x || '').replace(/\s+/g, '');
  const sk = norm(skill), pl = norm(place);
  const bySkill = kb.rolls.filter(r => { const s = norm(r.skill); return s && (s.indexOf(sk) >= 0 || sk.indexOf(s) >= 0); });
  const here = pl ? bySkill.filter(r => { const w = norm(r.where); return w && (w.indexOf(pl) >= 0 || pl.indexOf(w) >= 0); }) : bySkill;
  const otherPlace = !here.length && !!pl && bySkill.length > 0;       // 이 장소의 판정은 없고, 다른 장소의 같은 기술만 있다
  const written = (here.length ? here : bySkill).map(r => Object.assign({ otherPlace, locked: !!r.locked }, pickF(r, ['id'].concat(KB_FIELDS.rolls))));
  const excerpts = ksrcFind(skill, place, 3);
  const wantAi = !!b.ai, full = wantAi && !!b.full;
  let ai = null, related = 0;
  if (wantAi) {
    const rel = kbRelated(kb, [place, memo, skill].join(' '), [place], null, 5000);
    related = rel.length;
    const res = parseJson(claude(
      '너는 TRPG 마스터(게임 마스터)의 진행을 돕는 비공개 조수다. 판정 결과에 따라 플레이어에게 무엇을 줄지 제안하라. ' +
      '규칙: ① 시나리오에 적힌 판정 결과가 있으면 그것을 그대로 따르고 basis를 "scenario"로 하라. 없을 때만 자료와 어긋나지 않는 선에서 제안하고 basis를 "ai"로 하라. ' +
      '다른 장소의 판정이라고 표시된 것은 참고만 하고, 이 장소의 결과로 그대로 옮기지 마라(그때는 basis를 "ai"로 하라). ' +
      '② 자료에 없는 단서나 사실을 새로 만들지 마라. ③ 이야기 진행에 꼭 필요한 단서는 실패해도 다른 길(대가를 치르거나 시간이 더 걸리는 방식)이 있게 alt에 적어라. ' +
      '④ 플레이어에게 읽어 줄 묘사는 flavor에 한두 문장으로 써라. JSON 하나만 출력하라.',
      '## 판정\n기술: ' + skill + '\n결과: ' + (level || '(미지정)') + (place ? '\n장소: ' + place : '') + (memo ? '\n상황: ' + memo : '') + '\n\n' +
      '## 시나리오에 적힌 판정 (마스터 전용 정리본' + (otherPlace ? ', 주의: 아래는 모두 다른 장소의 판정이다' : '') + ')\n' + (written.length ? JSON.stringify(written.map(w => pickF(w, KB_FIELDS.rolls))) : '(정리본에 없음)') + '\n\n' +
      '## 원문에서 찾은 대목 (마스터 전용)\n' + (excerpts.length ? excerpts.map(e => e.text).join('\n---\n') : '(없음)') + '\n\n' +
      '## 관계있는 비공개 자료 (마스터 전용)\n' + (rel.length ? rel.join('\n') : '(없음)') + '\n\n' +
      (full ? '## 사건의 진상 전체 (마스터 전용)\n' + (kb.truth || '(없음)') + '\n\n' : '') +
      '## 방금까지의 대화 (받아쓰기)\n' + (recentTalk(20) || '(없음)') + '\n\n' +
      '## 출력 형식\n{"basis":"scenario 또는 ai","give":"이 결과에서 줄 정보","hold":"아직 주지 말 것 (없으면 빈칸)","flavor":"읽어 줄 묘사 한두 문장","alt":"실패했을 때의 다른 길 (해당 없으면 빈칸)"}', 1200));
    ai = { basis: (res.basis === 'scenario' && !otherPlace) ? 'scenario' : 'ai', give: txt(res.give, 800), hold: txt(res.hold), flavor: txt(res.flavor), alt: txt(res.alt) };
  }
  // sent: 실제로 AI에 보낸 것 (AI를 부르지 않았으면 아무것도 보내지 않았다)
  const sent = { ai: wantAi, full, written: wantAi ? written.length : 0, excerpts: wantAi ? excerpts.length : 0, related };
  const id = klogAdd('roll', getConf('session'), skill + (level ? ' · ' + level : ''), { skill, level, place, text: memo, ai: wantAi, full }, { written: written.length, excerpts: excerpts.length, ai }, { rv, gen });
  if (!id) return staleOut();
  return { ok: true, written, excerpts, ai, level, otherPlace, sent };
}

/* ───────────── 진행 현황판 ───────────── */
/* full이 참일 때만 '사건의 진상 전체'를 AI에 보낸다.
 * 꺼져 있어도 단서 목록과 NPC의 비밀·거짓말은 보낸다 (그것 없이는 현황판을 만들 수 없다). 무엇을 보냈는지는 sent로 돌려줘서 화면에 보여 준다. */
function kBoard(full) {
  const rv = getConf('resetVer') || '0', gen = getConf('kbGen') || '0';
  const kb = kbRead(), notes = readNotes() || emptyNotes();
  if (!kb.clues.length && !kb.truth) return { ok: false, error: '먼저 시나리오 자료를 올려서 정리본을 만들어 주세요' };
  const sums = sheet(SH.SUM).getDataRange().getValues().slice(1).slice(-8).map(r => '[세션 ' + r[0] + ' ' + String(r[1]).slice(11, 16) + ']\n' + decS(r[3])).join('\n\n');
  const npcs = kb.npcs.map(n => pickF(n, ['name', 'secret', 'lies'])).filter(n => n.secret || n.lies);
  const res = parseJson(claude(
    '너는 TRPG 마스터(게임 마스터)만 보는 진행 현황판을 만드는 조수다. 마스터만 아는 시나리오 자료와, 플레이어들이 지금까지 알아낸 공개 기록을 비교하라. ' +
    '공개 기록에 실제로 있는 내용만 "found"로 판단하고 짐작하지 마라. 주어진 자료만으로 판단할 수 없는 것은 적지 마라. 짧게 써라. JSON 하나만 출력하라.',
    (full ? '## 사건의 진상 (마스터 전용)\n' + (kb.truth || '(없음)') + '\n\n' : '') +
    '## 단서 목록 (마스터 전용)\n' + JSON.stringify(kb.clues.map(c => pickF(c, ['id', 'text', 'where', 'how', 'core']))) + '\n\n' +
    '## NPC의 비밀과 거짓말 (마스터 전용)\n' + JSON.stringify(npcs) + '\n\n' +
    '## 공개 기록: 누적 줄거리\n' + (storyText() || '(없음)') + '\n\n' +
    '## 공개 기록: 플레이어 쪽에 정리된 단서\n' + JSON.stringify((notes.clues || []).map(c => pickF(c, ['text', 'kind', 'status']))) + '\n\n' +
    '## 공개 기록: 최근 요약\n' + (sums || '(없음)') + '\n\n' +
    '## 출력 형식\n{"clues":[{"id":"단서 id","status":"found|partial|unfound","note":"공개 기록의 어떤 내용과 맞는지, 또는 무엇이 빠졌는지 (40자 이내)"}],' +
    '"wrong":[{"text":"플레이어가 잘못 짚고 있는 추측","why":"실제와 어떻게 다른지"}],' +
    '"lies":[{"npc":"이름","claim":"공개 기록에 남은 그 NPC의 주장","verdict":"거짓|참|일부만 참|불명","truth":"실제는 (30자 이내)"}],' +
    '"hints":["진행이 막혔을 때 자연스럽게 줄 수 있는 힌트 (최대 3개)"],"next":"지금 마스터가 챙기면 좋은 것 한두 문장"}\n' +
    '단서 목록의 모든 id에 대해 status를 출력하라. wrong과 lies는 공개 기록에 근거가 있는 것만 적어라.', 3500));
  const ids = new Set(kb.clues.map(c => c.id));
  const result = {
    clues: (Array.isArray(res.clues) ? res.clues : []).filter(c => c && ids.has(c.id)).map(c => ({ id: c.id, status: ['found', 'partial', 'unfound'].indexOf(c.status) >= 0 ? c.status : 'unfound', note: txt(c.note, 200) })),
    wrong: (Array.isArray(res.wrong) ? res.wrong : []).slice(0, 8).map(w => ({ text: txt(w && w.text, 300), why: txt(w && w.why, 300) })).filter(w => w.text),
    lies: (Array.isArray(res.lies) ? res.lies : []).slice(0, 15).map(l => ({ npc: txt(l && l.npc, 60), claim: txt(l && l.claim, 300), verdict: txt(l && l.verdict, 20), truth: txt(l && l.truth, 200) })).filter(l => l.claim),
    hints: arr(res.hints, 5, 300), next: txt(res.next, 500),
    basis: { processedId: Number(getConf('processedId') || 0), total: totalLines() },
    sent: { truth: !!full, clues: kb.clues.length, npcs: npcs.length }
  };
  if (!klogAdd('board', getConf('session'), '현황판', { full: !!full }, result, { rv, gen })) return staleOut();
  return { ok: true, board: result };
}
// 마스터가 직접 "찾음/아직"을 표시 (AI 판단보다 우선해서 보여 준다)
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
  session = sessOf(session);
  const sums = sessionSummaries(session, 30000);
  if (!sums.count) return { ok: false, error: '세션 ' + session + '의 요약이 아직 없어요. 먼저 "지금 바로 정리"를 눌러 주세요' };
  // publicAi 안이라 마스터 자료를 읽을 수 없다 → 이 카드에는 진상이 들어갈 수 없다
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
  const draftId = klogAdd('recap', session, '시작 카드', { mode: 'public' }, card, { rv });      // 회의록만 읽었으니 초기화번호만 건다
  if (!draftId) return staleOut('회의록');
  return { ok: true, card, session, draftId, rv };
}
/* 공개: 서버가 정한 칸(cleanCard)만 저장한다. 화면이 보낸 객체나 AI 답을 통째로 저장하지 않는다.
 * rv·draftId는 초안을 만들 때 받은 값이다. 서버가 "그 초안이 지금 회의록에서 만든 것인지"를 확인하고,
 * 초안을 만든 뒤 회의록을 지웠으면(다른 탭에서 지운 것 포함) 공개하지 않는다. */
function kRecapPublish(card, rv, draftId) {
  const c = cleanCard(card);
  if (!c.lastScene && !c.learned.length && !c.plans.length) return { ok: false, error: '카드 내용이 비어 있어요' };
  return withLock(20000, () => {
    const d = draftCheck('recap', rv, draftId);
    if (d.error) return d;
    setJson('recap', Object.assign({ session: d.log.session, at: now() }, c));
    bump('sumVer');
    return { ok: true, session: d.log.session };
  });
}
// 초안 확인 (잠금 안에서 부른다): 초기화번호가 지금과 같고, 그 초안이 지금 기록에 남아 있어야 한다
function draftCheck(kind, rv, draftId) {
  const stale = { ok: false, stale: true, error: '이 초안은 지금 회의록에서 만든 것이 아니에요 (초안을 만든 뒤 회의록을 지웠거나 오래된 초안이에요). 새로 만들어 주세요' };
  if (String(rv == null ? '' : rv) !== (getConf('resetVer') || '0')) return stale;
  const log = klogRows().find(l => l.id === String(draftId || '') && l.kind === kind);
  return log ? { log } : stale;
}

/* ───────────── 세션 통계 (AI 없이 계산) ───────────── */
function numOf(v) { const m = /-?\d+/.exec(String(v == null ? '' : v)); return m ? Number(m[0]) : null; }
function charDeltas(session) {
  const s = ensureSheet(SH.CSNAP), last = s.getLastRow();
  if (last < 2) return [];
  const by = {}, order = [];
  s.getRange(2, 1, last - 1, 9).getValues().forEach(raw => {
    const r = raw.map(x => (typeof x === 'string' ? dec(x) : x));
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
  return s.getRange(2, 1, last - 1, 8).getValues().map(r => ({ session: String(r[1]), name: decS(r[2]).trim(), skill: decS(r[3]).trim(), target: numOf(r[4]), value: numOf(r[5]), level: String(r[6]), text: decS(r[7]).trim() }));
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
      if (keeper && prev.name === keeper && l.name !== keeper && gap <= 20000) p.replies++;     // 마스터 말을 바로 받아친 횟수
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
    .filter(r => String(r[0]) === session && /잡담 위주/.test(decS(r[3]))).map(r => ({ from: String(r[1]), to: String(r[2]) }));
  return Object.assign(base, {
    from: lines[0].time, to: lines[lines.length - 1].time, lines: lines.length,
    minutes: Math.round(span / 60000), activeMinutes: Math.round((span - quiet) / 60000),
    total, keeperShare: total ? Math.round(kChars / total * 1000) / 10 : 0, people,
    buckets: { start: lines[0].time, step: 10, data: buckets }, gaps, idle
  });
}
function statsText(st) {
  if (st.empty) return '(대화 없음)';
  return '전체 ' + st.lines + '줄, ' + st.minutes + '분 (쉬는 시간 뺀 ' + st.activeMinutes + '분). 마스터(' + (st.keeper || '미지정') + ') 발언 비율 ' + st.keeperShare + '%.\n' +
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
    name: txt(r && r.name, 60), skill: txt(r && r.skill, 60), target: numOf(r && r.target), value: numOf(r && r.value),
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
      const rows = add.map((r, i) => [String(start + i + 1), session, enc(r.name), enc(r.skill), r.target == null ? '' : enc(String(r.target)), r.value == null ? '' : enc(String(r.value)), r.level, enc(r.text)]);
      s.getRange(s.getLastRow() + 1, 1, rows.length, 8).setNumberFormat('@').setValues(rows);
    }
    return { ok: true, added: add.length, total: start + add.length, session };
  });
}

/* ───────────── 시상식 ─────────────
 * 두 단계로 나뉜다. 두 단계의 AI 호출은 서로 다른 호출이고, 진상은 둘째 호출에만 들어간다.
 *  ① kAwards        : 공개 기록(세션 요약·캐릭터 이름)만 읽어 후보를 만든다. publicAi 안에서 돌아서 마스터 자료를 읽으면 오류가 난다.
 *                      → 공개될 수 있는 글(상 이름·받는 사람·설명)은 진상을 모르는 AI가 쓴다. 후보마다 바뀌지 않는 id를 붙인다.
 *  ② kAwardsCompare : 마스터가 누를 때만. 이미 만든 후보와 진상을 보내서 후보별 '마스터 메모'만 받는다.
 *                      서버는 답에서 notes(후보 id → 메모)만 꺼내 따로 저장한다. 답에 다른 칸이 있어도 버리므로
 *                      후보의 상 이름·받는 사람·설명은 바뀌지 않는다. 실패해도 ①의 후보는 그대로 남고 ②만 다시 할 수 있다. */
// 글 속의 근거 발언 번호: (#12), (#12, #15), (#12, 15)
function evIds(text) {
  const out = []; const re = /#(\d+)((?:\s*[,，·]\s*#?\d+)*)/g; let m;
  while ((m = re.exec(String(text || '')))) { out.push(Number(m[1])); (m[2].match(/\d+/g) || []).forEach(x => out.push(Number(x))); }
  return Array.from(new Set(out));
}
// 번호가 지금 회의록에 실제로 있고, 고른 세션의 발언인지 확인한다.  { ok:[...], none:[없는 번호], other:[다른 회차 번호] }
function evCheck(ids, session, rows) {
  const r = { ok: [], none: [], other: [] };
  ids.forEach(n => {
    const l = n > 0 ? rows[n - 1] : null;
    if (!l || l.id !== n) r.none.push(n); else if (l.session !== String(session)) r.other.push(n); else r.ok.push(n);
  });
  return r;
}
function kAwards(session) {
  const rv = getConf('resetVer') || '0';
  session = sessOf(session);
  const res = publicAi(() => {
    const sums = sessionSummaries(session, 40000);
    if (!sums.count) return null;
    return parseJson(claude(
      '너는 TRPG 세션이 끝난 뒤 여는 "시상식"의 후보를 뽑는 조수다. 세션 요약을 읽고 플레이어의 활약 장면을 찾아라. ' +
      '규칙: ① 요약에 실제로 있는 일만 쓰고, text 끝에 근거 발언 번호 (#번호)를 반드시 붙여라. 근거가 없으면 후보에서 빼라. ' +
      '② 말을 많이 한 사람이 유리하지 않게, 결정적인 한마디나 행동을 찾아라. 플레이어마다 한 장면 이상 찾으려고 노력하되 없으면 지어내지 마라. ' +
      '③ title과 text는 플레이어 모두에게 공개된다. 요약에 없는 일을 짐작해서 쓰지 마라. ' +
      '④ 놀리거나 깎아내리는 상은 만들지 마라. JSON 하나만 출력하라.',
      '## 플레이어 = 캐릭터\n' + (charsText() || '(연결된 캐릭터 없음: 요약에 나온 이름을 그대로 써라)') + '\n\n' +
      '## 세션 ' + session + ' 요약\n' + sums.text + '\n\n' +
      '## 출력 형식\n{"highlights":[{"category":"핵심 단서 발견|결정적 추리|위기를 넘긴 행동|정보를 끌어낸 대화|명장면","player":"플레이어 이름","character":"캐릭터 이름",' +
      '"title":"상 이름 (재치 있게, 14자 이내)","text":"무슨 일이 있었는지 한두 문장 (#번호)"}]} (최대 8개)', 2500));
  });
  if (!res) return { ok: false, error: '세션 ' + session + '의 요약이 아직 없어요' };
  // 근거 번호 검증: "#숫자가 있다"가 아니라, 그 번호의 발언이 지금 회의록에 실제로 있고 이 세션에 속해야 인정한다.
  // 없는 번호나 다른 회차 번호가 하나라도 섞인 후보, 근거가 하나도 없는 후보는 뺀다. 뺀 이유는 dropped로 알려 준다. 통과한 번호는 ev에 저장한다.
  const lineRows = allLineRows(), highlights = [], dropped = [];
  (Array.isArray(res.highlights) ? res.highlights : []).slice(0, 8).forEach(h => {
    const o = { id: 'a' + Utilities.getUuid().replace(/-/g, '').slice(0, 8),
      category: txt(h && h.category, 30), player: txt(h && h.player, 40), character: txt(h && h.character, 40), title: txt(h && h.title, 40), text: txt(h && h.text, 400) };
    if (!o.text) return;
    const ids = evIds(o.text).slice(0, 12), chk = evCheck(ids, session, lineRows), name = o.title || o.player || '(이름 없음)';
    if (!ids.length) { dropped.push({ title: name, why: '근거 발언 번호가 없어요' }); return; }
    if (chk.none.length || chk.other.length) {
      dropped.push({ title: name, why: (chk.none.length ? '회의록에 없는 번호 ' + chk.none.map(n => '#' + n).join(' ') : '') + (chk.none.length && chk.other.length ? ' · ' : '') + (chk.other.length ? '다른 회차의 번호 ' + chk.other.map(n => '#' + n).join(' ') : '') });
      return;
    }
    o.ev = chk.ok;
    highlights.push(o);
  });
  const draftId = klogAdd('awards', session, '시상식 후보', { mode: 'public' }, { highlights, dropped }, { rv });
  if (!draftId) return staleOut('회의록');
  return { ok: true, draftId, highlights, dropped, session, rv };
}
function kAwardsCompare(draftId) {
  const rv = getConf('resetVer') || '0', gen = getConf('kbGen') || '0';
  const d = klogRows().find(l => l.id === String(draftId || '') && l.kind === 'awards');
  if (!d) return { ok: false, stale: true, error: '견줄 후보를 찾지 못했어요 (회의록을 지웠거나 오래된 후보예요). 후보를 다시 받아 주세요' };
  if (!d.input || d.input.mode !== 'public') return { ok: false, error: '예전 방식으로 만든 후보라서 견줄 수 없어요. 후보를 다시 받아 주세요' };
  const cands = ((d.result && d.result.highlights) || []).map(h => pickF(h, ['id', 'player', 'character', 'title', 'text']));
  if (!cands.length) return { ok: false, error: '견줄 후보가 없어요' };
  const kb = kbRead();
  if (!kb.truth && !kb.clues.length) return { ok: false, error: '견줄 시나리오 자료가 없어요. 먼저 시나리오 자료를 올려 주세요' };
  const res = parseJson(claude(
    '너는 TRPG 마스터(게임 마스터)만 보는 메모를 쓰는 조수다. 이미 정해진 시상식 후보 하나하나를 마스터 전용 시나리오 자료와 견줘서, ' +
    '그 장면이 실제 진상에 얼마나 다가갔는지(맞았는지, 일부만 맞았는지, 헛짚었는지)를 마스터만 보는 메모로 써라. ' +
    '후보의 상 이름·받는 사람·설명은 이미 확정됐고 바꿀 수 없다. 메모만 출력하라. JSON 하나만 출력하라.',
    '## 시상식 후보 (확정, 바꿀 수 없음)\n' + JSON.stringify(cands) + '\n\n' +
    '## 사건의 진상 (마스터 전용)\n' + (kb.truth || '(없음)') + '\n\n' +
    '## 핵심 단서 (마스터 전용)\n' + JSON.stringify(kb.clues.filter(c => c.core).map(c => pickF(c, ['text', 'where']))) + '\n\n' +
    '## 출력 형식\n{"notes":[{"id":"후보 id","kNote":"마스터만 보는 메모 (120자 이내, 견줄 내용이 없으면 빈칸)"}]}', 1500));
  const ids = new Set(cands.map(c => c.id)), notes = {};
  (Array.isArray(res.notes) ? res.notes : []).forEach(n => { if (n && ids.has(String(n.id)) && txt(n.kNote, 400)) notes[String(n.id)] = txt(n.kNote, 400); });   // notes 말고는 아무것도 쓰지 않는다
  if (!klogAdd('awardsNote', d.session, '시상식 마스터 메모', { draftId: d.id }, { notes }, { rv, gen })) return staleOut();
  return { ok: true, draftId: d.id, notes };
}
/* 공개: 항목마다 상 이름·받는 사람·설명 세 칸만 저장한다 (마스터 메모는 받지도 저장하지도 않는다).
 * AI 후보에서 고른 항목(id가 있는 항목)이 하나라도 있으면, 그 후보 묶음(draftId)이 지금 회의록에서 '공개 기록만으로' 만든 것인지 서버가 확인한다.
 * rv는 화면이 후보·통계를 받았을 때의 초기화번호다. 그 뒤에 회의록을 지웠으면 공개하지 않는다. */
function kAwardsPublish(session, items, rv, draftId) {
  const src = (Array.isArray(items) ? items : []).slice(0, 12);
  const list = src.map(x => ({ title: txt(x && x.title, 40), winner: txt(x && x.winner, 60), text: txt(x && x.text, 400) })).filter(x => x.title && x.winner);
  if (!list.length) return { ok: false, error: '공개할 항목을 하나 이상 골라 주세요' };
  const aiIds = src.map(x => String((x && x.id) || '')).filter(Boolean);
  return withLock(20000, () => {
    const stale = { ok: false, stale: true, error: '이 후보·통계는 지금 회의록에서 만든 것이 아니에요 (그 뒤에 회의록을 지웠어요). 다시 불러온 뒤 공개해 주세요' };
    if (String(rv == null ? '' : rv) !== (getConf('resetVer') || '0')) return stale;
    let sess = /^\d{1,5}$/.test(String(session || '')) ? String(session) : (getConf('session') || '1');
    if (aiIds.length) {
      const d = draftCheck('awards', rv, draftId);
      if (d.error) return d;
      if (!d.log.input || d.log.input.mode !== 'public') return { ok: false, error: '예전 방식(진상을 함께 보낸 AI 호출)으로 만든 후보는 공개할 수 없어요. "AI 활약 장면 후보 받기"로 다시 받아 주세요' };
      const have = new Set(((d.log.result && d.log.result.highlights) || []).map(h => h.id));
      if (aiIds.some(id => !have.has(id))) return { ok: false, error: '고른 항목이 이 후보 묶음에 없어요. 화면을 새로 고친 뒤 다시 골라 주세요' };
      sess = d.log.session;
      const rows = allLineRows();          // 후보에 저장된 근거 번호가 지금도 이 세션의 발언인지 다시 확인한다
      const badEv = ((d.log.result && d.log.result.highlights) || []).filter(h => aiIds.indexOf(h.id) >= 0).filter(h => !Array.isArray(h.ev) || !h.ev.length || evCheck(h.ev, sess, rows).ok.length !== h.ev.length);
      if (badEv.length) return { ok: false, error: '근거 발언을 확인할 수 없는 후보가 있어요 (' + badEv.map(h => h.title || h.id).join(', ') + '). 후보를 다시 받아 주세요' };
    }
    setJson('awards', { session: sess, at: now(), items: list });
    bump('sumVer');
    return { ok: true, count: list.length };
  });
}

/* ───────────── 마스터링 피드백 (마스터만 봄) ─────────────
 * full이 참일 때만 '사건의 진상 전체'를 AI에 보낸다. 꺼져 있으면 핵심 단서와 장면 제목만 보낸다. 보낸 범위는 sent로 돌려준다. */
function kFeedback(session, full) {
  const rv = getConf('resetVer') || '0', gen = getConf('kbGen') || '0';
  session = sessOf(session);
  const sums = sessionSummaries(session, 40000);
  if (!sums.count) return { ok: false, error: '세션 ' + session + '의 요약이 아직 없어요' };
  const st = sessionStats(session), kb = kbRead();
  const core = kb.clues.filter(c => c.core).map(c => pickF(c, ['text', 'where', 'how'])), scenes = kb.scenes.map(s => s.title);
  const res = parseJson(claude(
    '너는 TRPG 마스터(게임 마스터)가 자기 진행을 돌아보는 것을 돕는 조수다. 이 피드백은 마스터만 본다. ' +
    '규칙: ① 마스터의 진행(정보 전달, 속도 조절, 플레이어에게 기회를 나눠 주는 방식)만 다루고 플레이어 개인을 평가하지 마라. ' +
    '② 모든 항목은 요약에 있는 구체적인 장면을 근거로 하고 text 끝에 (#번호)를 붙여라. 근거 없는 말이나 "몰입감이 좋았다" 같은 두루뭉술한 말은 쓰지 마라. ' +
    '③ 받아쓰기 기록이라 목소리·분위기·연기는 알 수 없다. 그런 평가는 하지 마라. ' +
    '④ 아쉬운 점에는 다음에 해 볼 구체적인 방법(tip)을 붙여라. 듣기 좋은 말보다 쓸모 있는 말을 하라. JSON 하나만 출력하라.',
    '## 숫자 (받아쓰기에서 계산)\n' + statsText(st) + '\n\n' +
    '## 시나리오 자료 (마스터 전용)\n' + (full ? '진상: ' + (kb.truth || '(없음)') + '\n' : '') + '핵심 단서: ' + JSON.stringify(core) + '\n장면 흐름: ' + JSON.stringify(scenes) + '\n\n' +
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
    spotlight: txt(res.spotlight, 500), next: arr(res.next, 3, 300),
    sent: { truth: !!full, clues: core.length, scenes: scenes.length }
  };
  if (!klogAdd('feedback', session, '피드백', { full: !!full }, result, { rv, gen })) return staleOut();
  return { ok: true, feedback: result, stats: st, session, rv };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * 자가 점검 (Apps Script 편집기에서 직접 실행: 함수 목록에서 selfTest 를 고르고 ▶ 실행)
 *
 * selfTest()   실제 구글 시트에서 아래를 확인하고 결과를 실행 로그에 PASS/FAIL로 적는다. AI는 부르지 않는다.
 *               임시 시트('자가점검_…')를 하나 만들어 쓰고 끝나면 지운다. 기존 기록은 건드리지 않는다.
 *                · "=1+1" 같은 글이 수식으로 바뀌지 않고 글자 그대로 저장되는지 (setValues·setValue·appendRow 세 길 모두)
 *                · 날짜·숫자처럼 보이는 글("1/2", "0012")이 바뀌지 않는지
 *                · 긴 글을 여러 칸에 나눠 쓰고 다시 읽었을 때 똑같은지
 *                · 잠금, 캐시, 시트 구성, 5분 자동 정리 트리거, 비밀번호 설정
 * selfTestAi() Claude와 Deepgram에 아주 짧게 한 번씩 연결해 본다 (Claude 호출 1번: 몇 원 수준).
 * 비밀번호·API 키의 값은 로그에 적지 않는다.
 * ═══════════════════════════════════════════════════════════════════════════ */
function selfTest() {
  const ss = SpreadsheetApp.getActive(), log = [];
  let fails = 0;
  const check = (label, pass, extra) => { if (!pass) fails++; log.push((pass ? 'PASS' : 'FAIL') + ' · ' + label + (extra ? ' · ' + extra : '')); };
  const s = ss.insertSheet('자가점검_' + Date.now());
  try {
    // 1) 수식처럼 보이는 글, 숫자·날짜처럼 보이는 글
    const samples = ['=1+1', '+1+1', '-1+1', '@SUM(1,2)', '=IMPORTDATA("https://example.com/x")', '- 줄표로 시작하는 요약 (#1)', '- IMPORTDATA("https://example.com/x")', '-',
      '1/2', '0012', '2026-01-02', '12:30', 'TRUE', '1e5', '50%', '§표시로 시작하는 글', "'작은따옴표로 시작", ' =앞에 빈칸', '철수', '=철수'];
    const rng = s.getRange(1, 1, samples.length, 1);
    rng.setNumberFormat('@').setValues(samples.map(x => [enc(x)]));
    SpreadsheetApp.flush();
    const back = rng.getValues(), fm = rng.getFormulas();
    samples.forEach((x, i) => {
      const v = back[i][0], good = fm[i][0] === '' && typeof v === 'string' && dec(v) === x;
      check('글자 그대로 저장 (여러 칸 쓰기): ' + JSON.stringify(x), good, good ? '' : (fm[i][0] ? '수식으로 바뀜' : '읽은 값 ' + JSON.stringify(v)));
    });
    // 2) 한 칸 쓰기, 줄 덧붙이기
    const one = s.getRange(1, 3);
    one.setNumberFormat('@').setValue(enc('=2+2'));
    s.appendRow([enc('=3+3'), enc('+4+4'), enc('-5+5'), enc('@x')]);
    SpreadsheetApp.flush();
    check('글자 그대로 저장 (한 칸 쓰기)', one.getFormula() === '' && dec(String(one.getValue())) === '=2+2');
    const lr = s.getLastRow(), ar = s.getRange(lr, 1, 1, 4);
    check('글자 그대로 저장 (줄 덧붙이기)', ar.getFormulas()[0].every(f => f === '') && ar.getValues()[0].map(v => dec(String(v))).join('|') === '=3+3|+4+4|-5+5|@x');
    // 3) 글자 형식을 지정하지 않은 칸에서도 § 표시만으로 수식이 되지 않는지
    const plain = s.getRange(2, 5, 3, 1);
    plain.setValues([[enc('=6+6')], [enc('+7+7')], [enc('-8+8')]]);
    SpreadsheetApp.flush();
    check('형식을 지정하지 않은 칸에서도 수식이 되지 않음', plain.getFormulas().every(r => r[0] === '') && plain.getValues().map(r => dec(String(r[0]))).join('|') === '=6+6|+7+7|-8+8');
    // 4) 긴 글 나눠 쓰기
    const big = JSON.stringify({ a: '='.repeat(NOTE_CHUNK + 10), b: '가'.repeat(NOTE_CHUNK), c: ['=x', '+y', '-z'] });
    const parts = toCells(big).map(x => [x]);
    const br = s.getRange(1, 7, parts.length, 1);
    br.setNumberFormat('@').setValues(parts);
    SpreadsheetApp.flush();
    check('긴 글을 ' + parts.length + '칸에 나눠 쓰고 다시 읽기', fromCells(br.getValues().map(r => r[0])) === big && br.getFormulas().every(r => r[0] === ''));
    // 5) 잠금 (겹쳐 잡아도 멈추지 않는지), 캐시
    let nested = false;
    try { nested = withLock(5000, () => withLock(5000, () => true)); } catch (e) {}
    check('잠금 겹쳐 잡기', nested === true);
    let cacheOk = false;
    try { const c = roomCache(); c.put('selftest', '1', 30); cacheOk = c.get('selftest') === '1'; c.remove('selftest'); } catch (e) {}
    check('캐시 쓰기·읽기', cacheOk);
    // 6) 설정 칸: 수식처럼 보이는 값을 쓰고 다시 읽기 (끝나면 그 줄을 지운다)
    let confOk = false;
    try {
      confOk = withLock(10000, () => {
        setConf('selftest', '=1+1'); SpreadsheetApp.flush(); confLoad(true);
        const c = _conf.selftest, good = getConf('selftest') === '=1+1' && confSheet().getRange(c.row, 2).getFormula() === '';
        confSheet().deleteRow(c.row); confLoad(true);
        return good;
      });
    } catch (e) {}
    check('설정 칸에 수식처럼 보이는 값 쓰고 읽기', confOk);
  } catch (e) {
    check('점검 도중 오류', false, String(e && e.message || e));
  } finally {
    try { ss.deleteSheet(s); } catch (e) { log.push('참고 · 임시 시트를 지우지 못했어요. 직접 지워 주세요: ' + s.getName()); }
  }
  // 7) 시트 구성, 트리거, 비밀번호 (값은 적지 않는다)
  const need = [SH.CONF, SH.LINES, SH.SUM, SH.NOTES, SH.CHAR, SH.IMG, SH.STAGE].concat(Object.keys(HEADERS));
  const missing = need.filter(n => !ss.getSheetByName(n));
  check('필요한 시트가 모두 있음', !missing.length, missing.length ? '없음: ' + missing.join(', ') + ' → setup을 실행해 주세요' : '');
  Object.keys(HEADERS).forEach(n => {
    const sh = ss.getSheetByName(n); if (!sh) return;
    const h = sh.getRange(1, 1, 1, HEADERS[n].length).getValues()[0];
    check("'" + n + "' 시트 머리글 " + HEADERS[n].length + '칸', HEADERS[n].every((t, i) => String(h[i]) === t), '다르면 setup을 다시 실행해 주세요');
  });
  let trig = 0;
  try { trig = ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'tick').length; } catch (e) {}
  check('5분 자동 정리 트리거 1개', trig === 1, trig === 1 ? '' : '지금 ' + trig + '개 → setup을 실행해 주세요');
  const pw = pwWarnings();
  check('비밀번호 설정', !pw.filter(w => !/10자/.test(w)).length, pw.join(' / '));
  if (pw.some(w => /10자/.test(w))) log.push('참고 · ' + pw.filter(w => /10자/.test(w))[0]);
  log.push(fails ? '결과: FAIL ' + fails + '건. 위 FAIL 줄을 확인해 주세요.' : '결과: 모두 PASS');
  Logger.log(log.join('\n'));
  return { ok: !fails, fails, log };
}
function selfTestAi() {
  const log = [];
  const t0 = Date.now();
  try { const a = claude('시키는 말만 그대로 출력하라.', '"확인"이라고만 답하라.', 20); log.push('PASS · Claude 연결 (' + MODEL + ') · ' + (Date.now() - t0) + 'ms · 답 길이 ' + String(a).length + '자'); }
  catch (e) { log.push('FAIL · Claude 연결 · ' + String(e && e.message || e)); }
  if (MODEL_LIGHT !== MODEL) {
    try { claude('시키는 말만 그대로 출력하라.', '"확인"이라고만 답하라.', 20, MODEL_LIGHT); log.push('PASS · 정리용 모델 연결 (' + MODEL_LIGHT + ')'); }
    catch (e) { log.push('FAIL · 정리용 모델 연결 (' + MODEL_LIGHT + ') · ' + String(e && e.message || e) + ' · Code.gs의 MODEL_LIGHT 줄을 MODEL 과 같게 바꾸면 소네트로 정리해요'); }
  }
  try { const d = deepgramToken(); log.push((d.ok ? 'PASS' : 'FAIL') + ' · Deepgram 임시 토큰 발급' + (d.ok ? '' : ' · ' + d.error)); }
  catch (e) { log.push('FAIL · Deepgram 연결 · ' + String(e && e.message || e)); }
  Logger.log(log.join('\n'));
  return log;
}
