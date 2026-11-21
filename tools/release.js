/* 운영 전환·되돌리기·되돌리기 연습 (GitHub Actions에서 clasp로 실행).
 *   node tools/release.js check              (엔진 코드를 바꾸기 전에) 방 목록이 나뉘어 있는지, 운영 방 목록이 비어 있거나 틀리지 않은지,
 *                                            운영 방의 웹 앱(배포된 버전)과 자동 정리(HEAD 매니페스트)가 모두 라이브러리 버전에 고정돼 있는지 확인. 아니면 멈춘다
 *   node tools/release.js pin                엔진 코드는 그대로 두고, 지금 엔진 코드로 라이브러리 버전을 만들어 대상 방을 거기에 고정 (처음 한 번: 운영 방을 HEAD에서 떼어 낸다)
 *   node tools/release.js promote            지금 엔진 코드로 라이브러리 새 버전 → 대상 방들을 그 버전에 고정 → 각 방 웹 앱을 새로 배포 → /exec 응답 판 확인
 *   node tools/release.js rollback <버전>     대상 방들을 예전 라이브러리 버전에 고정 → 배포 → /exec 응답 판 확인
 *   node tools/release.js restore <되돌림표>   중간에 끊긴 실행이 남긴 "되돌림표"(기록에 찍힌 한 줄)대로 대상 방을 바꾸기 전 상태로 되돌린다
 *   node tools/release.js drill              (연습 방 전용) 승격 → 말 하나 → 되돌리기 → 말 하나 → 다시 승격, 매번 /exec 판과 모든 발언(번호·발언ID·이름·시각·회차·원문)이 그대로인지 확인
 * 환경 변수: TARGET=prod|practice, ENGINE_SCRIPT_ID, PROD_ROOMS, PRACTICE_ROOMS(각 줄/쉼표마다 "스크립트ID:배포ID"), PRACTICE_PW(연습 방 비밀번호, drill용),
 *            ENGINE_DEPLOY_ID(선택: 엔진 웹 앱 배포ID. 없으면 엔진의 배포를 하나씩 불러 보고 찾는다), ALLOW_HOSTED_ROOMS(yes면 엔진 주소로 직접 도는 방이 있어도 계속), CODE_VER, GITHUB_SHA, STATE_FILE(되돌림표를 적을 파일)
 *
 * 방 하나의 상태는 세 가지다. 셋을 따로 적어 두고 따로 되돌린다.
 *   ① HEAD 매니페스트의 라이브러리 (lib): 방의 자동 정리(트리거)가 쓰는 엔진 버전
 *   ② 웹 앱 배포가 가리키는 방 프로젝트 버전 (deployVer): /exec가 실제로 도는 코드. 그 버전 안의 매니페스트(deployedLib)가 웹 앱이 쓰는 엔진 버전
 *   ③ /exec?action=ver 응답 (exec): 실제로 답하는 엔진 판
 * 바꾸기 전에 모든 대상 방의 ①②③을 먼저 적고(되돌림표), 그다음에 바꾼다. 어느 단계에서 실패하든 손댄 방(실패한 방 포함)을 ①②로 되돌리고 ③을 다시 확인한다.
 * 운영 방과 연습 방 목록이 겹치면 아무것도 하지 않고 멈춘다. drill은 운영 방에는 절대 돌지 않는다. 시트 기록은 어떤 모드도 건드리지 않는다. */
const crypto = require('crypto'), cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const { pin, libState } = require('./pin-room.js');
function parseRooms(s) {
  return String(s || '').split(/[\n,;]+/).map(x => x.trim()).filter(Boolean).map(x => {
    const m = /^([-\w]{20,}):([-\w]{20,})$/.exec(x);
    if (!m) throw new Error('방 목록 형식이 "스크립트ID:배포ID"가 아니에요: ' + x.slice(0, 12) + '…');
    return { sid: m[1], did: m[2] };
  });
}
function parseVersions(out) {
  const map = {};
  String(out).split('\n').forEach(l => { const m = /^\s*(\d+)\s*-\s*(.*)$/.exec(l); if (m) map[m[1]] = m[2].trim(); });
  return map;
}
// clasp deployments 출력: "- <배포ID> @<버전|HEAD> - 설명"
function parseDeployments(out) {
  const a = [];
  String(out).split('\n').forEach(l => { const m = /^\s*-\s+([-\w]{20,})\s+@(\S+)/.exec(l); if (m) a.push({ id: m[1], ver: m[2] }); });
  return a;
}
function verOfDesc(desc) { const m = /(\d{4}-\d{2}-\d{2}\.\d+)/.exec(String(desc || '')); return m ? m[1] : ''; }
function checkSeparate(prod, practice) {
  const p = new Set(prod.map(r => r.sid)), q = new Set(prod.map(r => r.did));
  const bad = practice.filter(r => p.has(r.sid) || q.has(r.did));
  if (bad.length) throw new Error('연습 방 목록에 운영 방이 들어 있어요 (' + bad.length + '개). 두 목록을 완전히 나눠 주세요');
  const dupe = (list, what) => { const s = new Set(), d = new Set(); list.forEach(r => { if (s.has(r.sid) || d.has(r.did)) throw new Error(what + ' 목록에 같은 방이 두 번 들어 있어요'); s.add(r.sid); d.add(r.did); }); };
  dupe(prod, '운영 방'); dupe(practice, '연습 방');
}
const libTxt = l => !l ? '?' : l.dev ? 'HEAD' : '버전 ' + l.version;
/* 방 식별값: 스크립트ID:배포ID를 한 방향으로 줄인 9글자 (r + 16진수 8자). 기록에 남아도 원래 ID를 알 수 없고, 방 목록의 순서가 바뀌어도 같은 방은 같은 값이다. */
function roomTag(room) { return 'r' + crypto.createHash('sha256').update(room.sid + ':' + room.did).digest('hex').slice(0, 8); }
/* 되돌림표 한 줄: "r3fa1b2c4=7@12!2026-11-21.25,r9c0d1e2f=head@9"  (방 식별값=라이브러리@방 프로젝트 버전!바꾸기 전 /exec 판).
 * 방 번호(목록에서 몇 번째)가 아니라 방 식별값으로 적는다: 되돌림표를 만든 뒤 방 목록의 순서가 바뀌거나 방이 빠져도 다른 방을 건드리지 않게. */
function stateLine(states) { return states.map(s => (s.tag || '?') + '=' + (s.lib.dev ? 'head' : s.lib.version) + '@' + s.deployVer + (s.exec ? '!' + s.exec : '')).join(','); }
/* 되돌림표를 지금 방 목록(rooms)에 맞춰 읽는다. 하나라도 어긋나면 오류를 던진다 (부르는 쪽은 그때 아무 방도 바꾸지 않는다):
 * 형식이 틀림 · 예전 형식(방 번호) · 같은 방이 두 번 · 지금 목록에 없는 방 · 지금 목록에는 있는데 되돌림표에 없는 방(목록이 달라짐) · 지금 목록에 같은 방이 두 번 */
function parseState(str, rooms) {
  const parts = String(str || '').split(/[,\s]+/).filter(Boolean);
  if (!parts.length) throw new Error('되돌림표가 비어 있어요');
  if (!Array.isArray(rooms)) throw new Error('되돌림표를 읽으려면 지금 방 목록이 필요해요');
  const tags = rooms.map(roomTag);
  if (new Set(tags).size !== tags.length) throw new Error('지금 방 목록에 같은 방이 두 번 들어 있어요');
  const seen = new Set();
  const out = parts.map(x => {
    if (/^\d+=/.test(x)) throw new Error('예전 형식(방 번호)의 되돌림표예요: ' + x.slice(0, 20) + ' · 방 번호만으로는 어느 방인지 확인할 수 없어서 쓰지 않아요. 방마다 mode=rollback이나 손으로 되돌려 주세요');
    const m = /^(r[0-9a-f]{8})=(head|\d+)@(\d+)(?:!(\d{4}-\d{2}-\d{2}\.\d+))?$/.exec(x); if (!m) throw new Error('되돌림표 형식이 "방식별값=라이브러리@방버전"이 아니에요: ' + x.slice(0, 24));
    if (seen.has(m[1])) throw new Error('되돌림표에 같은 방(' + m[1] + ')이 두 번 들어 있어요'); seen.add(m[1]);
    const i = tags.indexOf(m[1]); if (i < 0) throw new Error('되돌림표의 방 ' + m[1] + '이 지금 방 목록에 없어요 (되돌림표를 만든 뒤 방 목록이 바뀌었거나 target이 달라요). 아무 방도 바꾸지 않았어요');
    return { n: i + 1, i, tag: m[1], lib: m[2] === 'head' ? { dev: true, version: '' } : { dev: false, version: m[2] }, deployVer: m[3], exec: m[4] || '', restored: true };
  });
  const miss = tags.filter(t => !seen.has(t));
  if (miss.length) throw new Error('지금 방 목록의 방 ' + miss.length + '개(' + miss.join(', ') + ')가 되돌림표에 없어요 (되돌림표를 만든 뒤 방 목록이 바뀜). 아무 방도 바꾸지 않았어요');
  return out;
}
const sameState = (now, st) => String(now.deployVer) === String(st.deployVer) && !!now.lib.dev === !!st.lib.dev && (st.lib.dev || String(now.lib.version) === String(st.lib.version));
/* 되돌림표대로 되돌린다. io = { snapshot(room, n), restore(room, st, n), verify(room, expect, n), log }.
 * ① 되돌림표를 지금 방 목록과 맞춰 본다 (어긋나면 아무 방도 안 바꿈) ② 모든 대상 방의 지금 상태를 읽는다 (하나라도 못 읽으면 아무 방도 안 바꿈)
 * ③ 이미 그 상태인 방은 건드리지 않는다 ④ 방마다 되돌리고 → 상태를 다시 읽어 되돌림표와 같은지 → /exec가 되돌림표에 적힌 판으로 답하는지 확인
 * 한 방이 실패해도 나머지 방은 계속 되돌린다 (되돌리기는 방마다 따로라서). 끝에 방별 결과를 돌려주고, 실패가 있으면 그 목록을 담은 오류를 던진다. */
async function restoreAll(rooms, str, io) {
  const want = parseState(str, rooms), before = [];
  try { for (const st of want) before.push(await io.snapshot(rooms[st.i], st.n)); }
  catch (e) { const err = new Error(e.message + ' · 지금 상태를 읽지 못해서 아무 방도 되돌리지 않았어요'); err.untouched = true; throw err; }
  for (let k = 0; k < want.length; k++) if (before[k].tag && before[k].tag !== want[k].tag) { const err = new Error('방 ' + want[k].n + ': 읽어 온 방이 되돌림표의 방과 달라요 · 아무 방도 되돌리지 않았어요'); err.untouched = true; throw err; }
  const done = [], same = [], stuck = [];
  for (let k = 0; k < want.length; k++) {
    const st = want[k], room = rooms[st.i], who = '방 ' + st.n + '(' + st.tag + ')';
    try {
      let changed = false;
      if (sameState(before[k], st)) io.log(who + ': 이미 되돌림표의 상태예요 (라이브러리 ' + libTxt(st.lib) + ', 방 버전 ' + st.deployVer + '). 바꾸지 않아요');
      else { changed = true; await io.restore(room, st, st.n); const after = await io.snapshot(room, st.n); if (!sameState(after, st)) throw new Error('되돌린 뒤 상태(라이브러리 ' + libTxt(after.lib) + ', 방 버전 ' + after.deployVer + ')가 되돌림표와 달라요'); }
      const x = await io.verify(room, st.exec, st.n);                 // st.exec가 비어 있으면(예전 판이 판 번호를 답하지 못했음) 답하는지만 본다
      const tick = x && x.tick && x.tick.ver ? x.tick.ver : '';
      (changed ? done : same).push(who + ' → 라이브러리 ' + libTxt(st.lib) + ', 방 버전 ' + st.deployVer + ' · /exec ' + (st.exec ? st.exec + ' 확인' : '답함 (판 번호는 되돌림표에 없어 확인 못 함)') +
        (tick ? ' · 마지막 자동 정리 ' + tick + (st.exec && tick !== st.exec ? ' (다음 자동 정리가 돌면 ' + st.exec + '로 바뀌어야 해요: 5분 뒤 진단에서 확인)' : '') : ' · 자동 정리가 돈 판은 아직 모름 (5분 뒤 진단에서 확인)'));
    } catch (e) { stuck.push(who + ' (' + String(e.message).slice(0, 140) + ')'); }
  }
  const res = { done, same, stuck };
  if (stuck.length) { const err = new Error('되돌리지 못한 방 ' + stuck.length + '개: ' + stuck.join(', ') + ' · 되돌린 방: ' + (done.join(', ') || '없음') + ' · 같은 되돌림표로 mode=restore를 다시 돌려도 돼요 (이미 되돌린 방은 건드리지 않아요)'); Object.assign(err, res); throw err; }
  return res;
}
/* 엔진 주소(?room=)로 직접 도는 방이 있는지. 그런 방은 엔진 HEAD 코드로 바로 돌아서 라이브러리 버전 고정으로 지킬 수 없다 → 있으면(또는 있는지 알 수 없으면) 엔진을 바꾸지 않는다.
 * o = { listed: 엔진 프로젝트의 배포 목록을 읽었는지, given: ENGINE_DEPLOY_ID를 받았는지, execs: 엔진 배포들의 /exec?action=ver 응답(웹 앱으로 답한 것만 json:true), allow: ALLOW_HOSTED_ROOMS가 yes인지 } */
function checkHosted(o) {
  const stop = [], warn = [], info = [], web = (o.execs || []).filter(x => x && x.json);
  if (!o.given && !o.listed) stop.push('엔진 프로젝트의 배포 목록을 읽지 못해서 엔진 주소로 직접 도는 방이 있는지 확인할 수 없어요');
  else if (o.given && !web.length) stop.push('엔진 웹 앱(ENGINE_DEPLOY_ID)이 답하지 않아서 엔진 주소로 직접 도는 방이 있는지 확인하지 못했어요');
  else if (!web.length) info.push('엔진 프로젝트에 웹 앱으로 답하는 배포가 없어요 (엔진 주소로 직접 도는 방 없음)');
  else {
    const n = Math.max.apply(null, web.map(x => Number(x.hosted) || 0)), unknown = web.some(x => x.hosted == null);
    if (n > 0) (o.allow ? warn : stop).push('엔진 주소로 직접 도는 방(?room=)이 ' + n + '개 있어요. 이 방들은 엔진 HEAD 코드로 바로 돌아서, 엔진을 바꾸면 시험 전의 코드가 그 방에 곧바로 적용돼요' + (o.allow ? ' (ALLOW_HOSTED_ROOMS=yes라서 계속해요)' : '. 그 방을 라이브러리 방식으로 되돌리거나(unhostThisRoom), 그 방들이 모두 연습 방이면 저장소 변수 ALLOW_HOSTED_ROOMS를 yes로 두세요'));
    else if (unknown) warn.push('엔진 웹 앱이 예전 판이라 직접 도는 방의 수를 답하지 못해요 (미확인). 이번에 엔진이 새 판이 되면 다음 실행부터 확인돼요');
    else info.push('엔진 주소로 직접 도는 방: 없음');
  }
  return { stop, warn, info };
}

/* 방 하나의 지금 상태를 읽는다 (아무것도 바꾸지 않음). cl = clasp·웹 요청을 하는 낮은 층 (시험에서는 가짜를 넣는다) */
async function snapshot(room, n, cl) {
  const man = await cl.manifest(room), lib = libState(man);
  if (!lib) throw new Error('방 ' + n + ': 라이브러리 TRPG가 없어요');
  const dep = (await cl.deployments(room)).find(d => d.id === room.did);
  if (!dep) throw new Error('방 ' + n + ': 방 목록의 배포ID가 이 방 프로젝트의 배포 목록에 없어요 (스크립트ID와 배포ID 짝을 확인해 주세요)');
  if (!/^\d+$/.test(String(dep.ver))) throw new Error('방 ' + n + ': 배포가 버전이 아니라 ' + dep.ver + '를 가리켜요. 웹 앱 /exec 배포ID를 넣어 주세요');
  let deployedLib = null; try { deployedLib = libState(await cl.manifestAt(room, dep.ver)); } catch (e) { deployedLib = null; }
  const x = await cl.exec(room);
  return { n, tag: roomTag(room), lib: { dev: lib.dev, version: lib.version }, libraryId: lib.libraryId || '', deployVer: String(dep.ver), deployedLib, exec: x.ver || '', execOk: !!x.ok, tick: x.tick || null, hosted: x.hosted };
}
/* 방 하나를 라이브러리 ver로: HEAD 매니페스트 고정 → 올리기 → 방 프로젝트 새 버전 → 웹 앱 배포를 그 버전으로 */
async function pinRoom(room, ver, n, cl) {
  const man = await cl.manifest(room); pin(man, ver);
  await cl.pushManifest(room, man);
  const rv = await cl.version(room, 'TRPG ' + ver);
  if (!/^\d+$/.test(String(rv))) throw new Error('방 ' + n + ': 방 프로젝트 버전 번호를 읽지 못했어요');
  await cl.deploy(room, rv, 'TRPG 라이브러리 ' + ver);
  return { roomVer: String(rv) };
}
/* 방 하나를 적어 둔 상태로: HEAD 매니페스트의 라이브러리를 되돌려 올리고, 웹 앱 배포를 바꾸기 전 방 프로젝트 버전으로 되돌린다 (새 버전을 만들지 않는다) */
async function restoreRoom(room, st, n, cl) {
  const man = await cl.manifest(room); pin(man, st.lib.dev ? 'head' : st.lib.version);
  await cl.pushManifest(room, man);
  await cl.deploy(room, st.deployVer, '되돌림: 방 버전 ' + st.deployVer);
}
/* /exec가 expect 판으로 답하는지. loose = 그 판이 판 번호를 답하지 못하는 옛 코드일 때만 참: 그때는 "ver가 없는 JSON 응답"이어야 통과 (다른 판 번호가 오면 실패) */
async function verifyRoom(room, expect, n, cl, opt) {
  opt = opt || {}; const tries = opt.tries || 8; let got = '', x = null;
  for (let i = 0; i < tries; i++) {
    x = await cl.exec(room); got = x.ver || (x.ok ? '(판 번호 없음)' : '응답 없음');
    if (expect && x.ver === expect) return x;
    if (!expect && opt.not && x.ok && x.ver !== opt.not) return x;                     // 바꾸기 전 판을 모를 때: 적어도 새 판이 아니어야 한다
    if (opt.loose && x.json && !x.ver) return Object.assign({ loose: true }, x);
    if (i < tries - 1) await cl.sleep(opt.wait == null ? 10000 : opt.wait);
  }
  throw new Error('방 ' + n + ': /exec 응답 판이 ' + (got || '?') + ' (기대 ' + (expect || (opt.not + '이 아닌 판')) + ')');
}
/* 방들을 ver로 바꾸고 판을 확인한다.
 * io = { snapshot(room, n), save(states), pinRoom(room, ver, n), verify(room, expect, n), restore(room, state, n), verifyBack(room, state, n, ver/expect), log }.
 * ① 모든 방의 바꾸기 전 상태를 먼저 읽는다 (하나라도 못 읽으면 아무것도 바꾸지 않고 멈춤) ② 되돌림표를 남긴다 ③ 바꾼다 ④ 확인한다.
 * ③④에서 실패하면 손댄 방을 모두(바꾸다 실패한 방 포함) 적어 둔 상태로 되돌리고 /exec를 다시 확인한 뒤, 무엇을 되돌렸는지 적은 오류를 던진다. */
async function switchAll(rooms, ver, expect, io) {
  const states = [];
  try { for (let i = 0; i < rooms.length; i++) states.push(await io.snapshot(rooms[i], i + 1)); }
  catch (e) { const err = new Error(e.message + ' · 바꾸기 전 상태를 읽지 못해서 아무 방도 바꾸지 않았어요'); err.back = []; err.stuck = []; err.untouched = true; throw err; }
  if (io.save) await io.save(states);
  const touched = [];
  try {
    for (let i = 0; i < rooms.length; i++) {
      touched.push(i);                                   // 이 방에 손대기 시작 (여기서 실패해도 되돌림 대상)
      await io.pinRoom(rooms[i], ver, i + 1);
      io.log('방 ' + (i + 1) + ': 라이브러리 ' + libTxt(states[i].lib) + ' → 버전 ' + ver + ' (웹 앱은 방 버전 ' + states[i].deployVer + '에서 새 버전으로)');
    }
    for (let i = 0; i < rooms.length; i++) await io.verify(rooms[i], expect, i + 1);
    return states;
  } catch (e) {
    const back = [], stuck = [];
    for (const i of touched) {
      const st = states[i], what = '방 ' + (i + 1) + ' → 라이브러리 ' + libTxt(st.lib) + ', 웹 앱 방 버전 ' + st.deployVer;
      try { await io.restore(rooms[i], st, i + 1); if (io.verifyBack) await io.verifyBack(rooms[i], st, i + 1, expect); back.push(what + (st.exec ? ' (/exec ' + st.exec + ' 확인)' : '')); }
      catch (e2) { stuck.push('방 ' + (i + 1) + ' (' + String(e2.message).slice(0, 100) + ')'); }
    }
    const err = new Error(e.message + ' · 되돌림: ' + (back.join(', ') || '없음') + (stuck.length ? ' · ⚠ 되돌리지 못함: ' + stuck.join(', ') + ' (되돌림표 ' + stateLine(states) + ' 로 mode=restore를 돌리거나 손으로 확인해 주세요)' : ''));
    err.back = back; err.stuck = stuck; err.states = states; throw err;
  }
}
// 되돌리기 전후 비교: 앞에서 본 모든 발언이 번호·발언ID·이름·시각·회차·원문 그대로 남아 있어야 한다 (예전 서버가 주지 않는 항목은 양쪽에 다 있을 때만 비교)
function diffLines(before, after) {
  const m = new Map(after.map(l => [Number(l.id), l])); const bad = [];
  const F = [['text', '원문'], ['name', '이름'], ['uid', '발언ID'], ['session', '회차'], ['time', '시각']];
  before.forEach(l => {
    const x = m.get(Number(l.id)); if (!x) { bad.push('#' + l.id + ' 없어짐'); return; }
    const d = F.filter(f => l[f[0]] != null && x[f[0]] != null && String(l[f[0]]) !== String(x[f[0]])).map(f => f[1]);
    if (d.length) bad.push('#' + l.id + ' ' + d.join('·') + '이 달라짐');
  });
  return bad;
}
/* 운영 방 확인 (엔진 코드를 바꾸기 전). states = 운영 방들의 snapshot. 문제 목록(멈춤)과 알림 목록을 돌려준다 */
function checkProd(states, engineId) {
  const stop = [], warn = [];
  if (!states.length) stop.push('PROD_ROOMS(운영 방 목록)가 비어 있어요. 운영 방이 HEAD인지 확인할 수 없으니 엔진을 바꾸지 않아요');
  states.forEach(s => {
    const who = '운영 방 ' + s.n;
    if (engineId && s.libraryId && s.libraryId !== engineId) stop.push(who + ': 라이브러리 TRPG가 이 엔진(ENGINE_SCRIPT_ID)이 아닌 다른 스크립트를 가리켜요');
    if (s.lib.dev) stop.push(who + ': 자동 정리(HEAD 매니페스트)가 개발 모드(HEAD)예요');
    if (!s.deployedLib) stop.push(who + ': 웹 앱이 도는 방 버전 ' + s.deployVer + '의 라이브러리 설정을 읽지 못했어요 (HEAD가 아니라고 확인할 수 없음)');
    else if (s.deployedLib.dev) stop.push(who + ': 웹 앱(방 버전 ' + s.deployVer + ')이 개발 모드(HEAD)예요');
    else if (!s.lib.dev && s.deployedLib.version !== s.lib.version) warn.push(who + ': 웹 앱은 라이브러리 버전 ' + s.deployedLib.version + ', 자동 정리는 버전 ' + s.lib.version + '로 서로 달라요');
    if (!s.execOk) stop.push(who + ': 웹 앱 /exec가 답하지 않아요 (배포ID가 맞는지 확인해 주세요)');
    if (s.tick && s.tick.ver && s.exec && s.tick.ver !== s.exec) warn.push(who + ': 웹 앱은 ' + s.exec + ', 마지막 자동 정리는 ' + s.tick.ver + ' 판으로 돌았어요');
  });
  return { stop, warn };
}
// drill이 되돌아갈 버전: 이 워크플로가 만든 버전 가운데 지금 판(cur)과 "다른" 판 중 가장 새것 (같은 판으로 되돌리는 것은 연습이 아니다)
/* 이 판의 엔진 코드가 /exec?action=ver에 판 번호를 답할 줄 아는지. 답하는 기능은 2026-11-21.23에 들어왔다.
 * 그보다 옛 판으로 되돌릴 때(rollback·drill)는 "판 번호 없는 JSON 응답"을 그 판으로 받아들인다 (다른 판 번호가 오면 여전히 실패) */
const VER_FROM = [2026, 11, 21, 23];
function answersVer(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})\.(\d+)$/.exec(String(v || '')); if (!m) return true;
  const a = m.slice(1).map(Number);
  for (let i = 0; i < 4; i++) if (a[i] !== VER_FROM[i]) return a[i] > VER_FROM[i];
  return true;
}
function pickPrev(versions, cur) {
  const ks = Object.keys(versions).filter(k => { const v = verOfDesc(versions[k]); return v && v !== cur; }).map(Number).sort((a, b) => b - a);
  return ks.length ? { num: String(ks[0]), ver: verOfDesc(versions[ks[0]]) } : null;
}
module.exports = { parseRooms, parseVersions, parseDeployments, verOfDesc, checkSeparate, switchAll, diffLines, snapshot, pinRoom, restoreRoom, verifyRoom, stateLine, parseState, checkProd, pickPrev, roomTag, restoreAll, checkHosted, answersVer };

if (require.main !== module) return;

const sh = (cmd, cwd) => cp.execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function proj(id) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-')); fs.writeFileSync(path.join(d, '.clasp.json'), JSON.stringify({ scriptId: id, rootDir: '.', fileExtension: 'gs' })); return d; }
const execUrl = room => 'https://script.google.com/macros/s/' + room.did + '/exec';
const lastNum = out => (/(\d+)\s*\.?\s*$/.exec(String(out).trim()) || [])[1];
// 실제 clasp·웹 요청 (낮은 층). 방마다 한 번 받은 폴더를 다시 쓴다
const dirs = new Map();
const dirOf = room => { if (!dirs.has(room.sid)) dirs.set(room.sid, proj(room.sid)); return dirs.get(room.sid); };
const cl = {
  sleep,
  manifest(room) { const d = dirOf(room); sh('clasp pull', d); return JSON.parse(fs.readFileSync(path.join(d, 'appsscript.json'), 'utf8')); },
  manifestAt(room, ver) { const d = proj(room.sid); sh('clasp pull --versionNumber ' + Number(ver), d); return JSON.parse(fs.readFileSync(path.join(d, 'appsscript.json'), 'utf8')); },
  pushManifest(room, man) { const d = dirOf(room); fs.writeFileSync(path.join(d, 'appsscript.json'), JSON.stringify(man, null, 2)); sh('clasp push --force', d); },
  version(room, desc) { return lastNum(sh('clasp version ' + JSON.stringify(desc), dirOf(room))); },
  deploy(room, ver, desc) { sh('clasp deploy -i ' + room.did + ' -V ' + Number(ver) + ' -d ' + JSON.stringify(desc), dirOf(room)); },
  deployments(room) { return parseDeployments(sh('clasp deployments', dirOf(room))); },
  async exec(room) {
    try {
      const r = await fetch(execUrl(room) + '?action=ver&_=' + Date.now(), { redirect: 'follow' }); const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
      return { ok: r.ok && !!j, json: !!j, ver: j && typeof j.ver === 'string' ? j.ver : '', tick: j && j.tick || null, hosted: j && j.hosted };
    } catch (e) { return { ok: false, json: false, ver: '' }; }
  }
};
function engineVersion(desc) {
  const out = sh('clasp version ' + JSON.stringify(desc), proj(process.env.ENGINE_SCRIPT_ID)); console.log(out.trim());
  const v = lastNum(out); if (!v) throw new Error('새 버전 번호를 읽지 못했어요');
  return v;
}
function engineVersions() { return parseVersions(sh('clasp versions', proj(process.env.ENGINE_SCRIPT_ID))); }
function engineCode() { const d = proj(process.env.ENGINE_SCRIPT_ID); sh('clasp pull', d); const f = fs.readdirSync(d).find(x => /^Code\.(gs|js)$/.test(x)); return f ? fs.readFileSync(path.join(d, f), 'utf8') : ''; }
async function postJ(room, body) { return (await fetch(execUrl(room), { method: 'POST', body: JSON.stringify(body), redirect: 'follow' })).json(); }
// 대화 전체를 번호순으로 읽는다 (1,000줄씩)
async function allLines(room, pw) {
  const out = []; let before = 0;
  for (let k = 0; k < 200; k++) {
    const r = await postJ(room, { action: 'history', pw, before, limit: 1000 }); if (!r.ok) throw new Error('연습 방 대화를 읽지 못했어요: ' + (r.error || ''));
    const ls = r.lines || []; if (!ls.length) break; out.unshift(...ls.map(l => ({ id: l.id, name: l.name, text: l.text, uid: l.uid, session: l.session, time: l.time }))); before = Number(ls[0].id); if (!r.hasMore) break;
  }
  return out;
}
async function say(room, pw, uid) { const r = await postJ(room, { action: 'lines', pw, items: [{ uid, name: '배포연습', text: '배포 연습 ' + uid, t: new Date().toISOString() }] }); if (!r.ok || !(r.saved || []).includes(uid)) throw new Error('연습 방에 말을 저장하지 못했어요: ' + (r.error || ((r.dup || []).includes(uid) ? '같은 발언ID가 이미 있어요' : ''))); }
const stateTxt = s => '방 ' + s.n + ': 자동 정리 라이브러리 ' + libTxt(s.lib) + ' · 웹 앱 방 버전 ' + s.deployVer + ' (라이브러리 ' + libTxt(s.deployedLib) + ') · /exec ' + (s.exec || (s.execOk ? '판 번호 없음' : '응답 없음')) +
  (s.tick && s.tick.ver ? ' · 마지막 자동 정리 ' + s.tick.ver + ' (' + Math.round((Date.now() - s.tick.at) / 60000) + '분 전)' : '');

(async () => {
  const mode = process.argv[2], arg = process.argv[3];
  const prod = parseRooms(process.env.PROD_ROOMS), practice = parseRooms(process.env.PRACTICE_ROOMS);
  checkSeparate(prod, practice);
  if (mode === 'check') {
    // 엔진 코드를 바꾸면 개발 모드(HEAD)인 방에 바로 적용된다. 운영 방이 HEAD면 시험도 안 된 코드가 운영에 들어가므로 여기서 멈춘다
    const states = []; for (let i = 0; i < prod.length; i++) { const s = await snapshot(prod[i], i + 1, cl); states.push(s); console.log('운영 ' + stateTxt(s)); }
    const r = checkProd(states, process.env.ENGINE_SCRIPT_ID);
    r.warn.forEach(w => console.log('::warning::' + w));
    // 엔진 주소(?room=)로 직접 도는 방은 라이브러리 버전 고정으로 지킬 수 없다 → 있거나, 있는지 알 수 없으면 엔진을 바꾸지 않는다
    const eid = process.env.ENGINE_DEPLOY_ID, ho = { given: !!eid, listed: false, execs: [], allow: /^(yes|1|true)$/i.test(process.env.ALLOW_HOSTED_ROOMS || '') };
    if (eid) ho.execs.push(await cl.exec({ did: eid }));
    else {                                               // 비밀값이 없으면 엔진 프로젝트의 버전 배포를 하나씩 불러 본다 (웹 앱이면 JSON으로 답한다. 라이브러리 배포는 답하지 않는다)
      let deps = null; try { deps = cl.deployments({ sid: process.env.ENGINE_SCRIPT_ID }).filter(d => /^\d+$/.test(String(d.ver))); } catch (e) { deps = null; }
      if (deps) { ho.listed = true; for (const d of deps.slice(0, 20)) ho.execs.push(await cl.exec({ did: d.id })); }
    }
    const h = checkHosted(ho);
    h.info.forEach(m => console.log(m)); h.warn.forEach(w => console.log('::warning::' + w)); r.stop.push(...h.stop);
    if (r.stop.length) throw new Error(r.stop.join(' / ') + ' · 엔진 코드를 바꾸지 않았어요. 운영 방이 HEAD면 mode=pin, target=prod를 먼저 돌려 주세요');
    console.log('확인 끝: 방 목록이 나뉘어 있고, 운영 방 ' + prod.length + '개는 웹 앱과 자동 정리 모두 버전에 고정돼 있어요'); return;
  }
  const target = mode === 'drill' ? 'practice' : (process.env.TARGET || 'prod');
  const rooms = target === 'practice' ? practice : prod;
  if (!rooms.length) throw new Error((target === 'practice' ? 'PRACTICE_ROOMS' : 'PROD_ROOMS') + ' 비밀값에 방이 없어요');
  const sha = String(process.env.GITHUB_SHA || '').slice(0, 7), cur = process.env.CODE_VER;
  const save = states => {
    states.forEach(s => console.log('바꾸기 전 ' + stateTxt(s)));
    const line = stateLine(states);
    console.log('되돌림표 (' + target + '): ' + line + '   ← 이 실행이 중간에 끊기면 mode=restore, target=' + target + ', version 칸에 이 줄을 넣어 되돌려요');
    if (process.env.STATE_FILE) fs.appendFileSync(process.env.STATE_FILE, JSON.stringify({ at: new Date().toISOString(), mode, target, line, states: states.map(s => ({ n: s.n, lib: s.lib, deployVer: s.deployVer, deployedLib: s.deployedLib, exec: s.exec, tick: s.tick })) }) + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '되돌림표 (' + target + ', ' + mode + '): `' + line + '`\n\n');
  };
  const io = {
    log: m => console.log(m), save,
    snapshot: (room, n) => snapshot(room, n, cl),
    pinRoom: (room, ver, n) => pinRoom(room, ver, n, cl),
    verify: async (room, expect, n) => { const x = await verifyRoom(room, expect, n, cl, { loose: !answersVer(expect) }); if (x.loose) return console.log('방 ' + n + ': 웹 앱이 답함. ' + expect + ' 판은 판 번호를 답하지 못해서 번호는 확인하지 못했어요 (미확인)'); console.log('방 ' + n + ': /exec 응답 판 ' + x.ver + ' ✔' + (x.tick && x.tick.ver && x.tick.ver !== x.ver ? ' (자동 정리는 아직 ' + x.tick.ver + ' 판으로 돌았음: 5분 뒤 진단에서 다시 확인)' : '')); },
    restore: (room, st, n) => restoreRoom(room, st, n, cl),
    verifyBack: async (room, st, n, expect) => { await verifyRoom(room, st.exec, n, cl, st.exec ? {} : { not: expect }); }
  };
  const all = (ver, expect) => switchAll(rooms, ver, expect, io);
  if (mode === 'promote') {
    const v = engineVersion('운영 ' + cur + ' ' + sha); console.log('엔진 라이브러리 버전 ' + v + ' = ' + cur);
    await all(v, cur);
  } else if (mode === 'pin') {
    // 엔진 코드는 건드리지 않는다. 지금 엔진에 있는 코드 그대로 버전을 만들고 거기에 고정 → 그 뒤 엔진 코드를 바꿔도 이 방은 그대로
    const code = engineCode(), live = (/CODE_VER = '([^']+)'/.exec(code) || [])[1]; if (!live) throw new Error('엔진의 지금 판(CODE_VER)을 읽지 못했어요');
    const answers = /action === 'ver'/.test(code);         // 지금 엔진 코드가 판 번호를 답할 줄 아는지 (모르는 옛 판일 때만 "판 번호 없는 응답"을 받아들인다)
    const v = engineVersion('운영 ' + live + ' pin'); console.log('엔진 라이브러리 버전 ' + v + ' = 지금 엔진 코드(' + live + ')' + (answers ? '' : ' · 이 판은 판 번호를 답하지 못해요'));
    io.verify = async (room, expect, n) => {
      const x = await verifyRoom(room, expect, n, cl, { loose: !answers });
      console.log(x.loose ? '방 ' + n + ': 웹 앱이 답함. 이 엔진 판은 판 번호를 답하지 못해서 번호는 확인하지 못했어요 (미확인)' : '방 ' + n + ': /exec 응답 판 ' + x.ver + ' ✔');
    };
    await all(v, live);
  } else if (mode === 'rollback') {
    if (!/^\d+$/.test(String(arg || ''))) throw new Error('되돌릴 버전 번호를 넣어 주세요');
    const expect = verOfDesc(engineVersions()[arg]);
    if (!expect) throw new Error('버전 ' + arg + '의 엔진 판을 알 수 없어요 (이 워크플로로 만든 버전만 되돌릴 수 있어요)');
    await all(arg, expect);
  } else if (mode === 'restore') {
    // 끊긴 실행의 되돌림표대로. 되돌림표의 방 식별값이 지금 방 목록과 다르면 아무 방도 바꾸지 않고 멈춘다
    if (!arg) throw new Error('되돌림표를 version 칸에 넣어 주세요 (기록의 "되돌림표 (…): " 뒤의 한 줄)');
    const res = await restoreAll(rooms, arg, {
      log: m => console.log(m),
      snapshot: async (room, n) => { const x = await snapshot(room, n, cl); console.log('지금 ' + stateTxt(x)); return x; },
      restore: (room, st, n) => restoreRoom(room, st, n, cl),
      verify: (room, expect, n) => expect ? verifyRoom(room, expect, n, cl) : cl.exec(room).then(x => { if (!x.ok) throw new Error('방 ' + n + ': 되돌린 뒤 웹 앱이 답하지 않아요'); return x; })
    });
    res.same.forEach(m => console.log('그대로: ' + m)); res.done.forEach(m => console.log('되돌림: ' + m));
    console.log('되돌림표대로 끝: 되돌린 방 ' + res.done.length + '개, 이미 그 상태라 그대로 둔 방 ' + res.same.length + '개');
  } else if (mode === 'drill') {
    const pw = process.env.PRACTICE_PW; if (!pw) throw new Error('drill에는 PRACTICE_PW(연습 방 비밀번호)가 필요해요');
    const prev = pickPrev(engineVersions(), cur);
    if (!prev) throw new Error('되돌아갈 "다른 판"의 운영 버전이 없어요 (지금 판 ' + cur + '과 같은 판뿐). 예전 판을 promote한 적이 있어야 연습할 수 있어요');
    const v = engineVersion('운영 ' + cur + ' ' + sha);
    const room = rooms[0], run = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);    // 돌릴 때마다 새 발언ID (같은 커밋으로 다시 돌려도 겹치지 않게)
    const same = (a, b, what) => { const bad = diffLines(a, b); if (bad.length) throw new Error(what + ': 발언 ' + bad.length + '개가 달라졌어요 (' + bad.slice(0, 5).join(', ') + ')'); if (b.length !== a.length + 1) throw new Error(what + ': 줄 수가 ' + a.length + ' → ' + b.length + ' (기대 ' + (a.length + 1) + ')'); };
    const l0 = await allLines(room, pw);
    await all(v, cur); await say(room, pw, 'drill-' + run + '-a');
    await all(prev.num, prev.ver); const l1 = await allLines(room, pw); same(l0, l1, '되돌린 뒤'); await say(room, pw, 'drill-' + run + '-b');
    await all(v, cur); const l2 = await allLines(room, pw); same(l1, l2, '다시 승격한 뒤');
    console.log('연습: 시작 ' + l0.length + '줄 → 승격 후 말 1 → 되돌린 뒤 ' + l1.length + '줄 → 말 1 → 다시 승격 ' + l2.length + '줄. 앞선 발언 ' + l1.length + '개의 번호·발언ID·이름·시각·회차·원문 모두 그대로');
    console.log('되돌리기 연습 합격: 버전 ' + v + '(' + cur + ') ↔ ' + prev.num + '(' + prev.ver + ') 서로 다른 판을 오가며 대화 유지');
  } else throw new Error('모드는 check / pin / promote / rollback / restore / drill');
})().catch(e => { console.error('::error::' + e.message); process.exit(1); });
