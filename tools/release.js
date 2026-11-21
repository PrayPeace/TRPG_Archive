/* 운영 전환·되돌리기·되돌리기 연습 (GitHub Actions에서 clasp로 실행).
 *   node tools/release.js check              (엔진 코드를 바꾸기 전에) 방 목록이 나뉘어 있는지, 운영 방이 개발 모드(HEAD)가 아닌지 확인. 아니면 멈춘다
 *   node tools/release.js pin                엔진 코드는 그대로 두고, 지금 엔진 코드로 라이브러리 버전을 만들어 대상 방을 거기에 고정 (처음 한 번: 운영 방을 HEAD에서 떼어 낸다)
 *   node tools/release.js promote            지금 엔진 코드로 라이브러리 새 버전 → 대상 방들을 그 버전에 고정 → 각 방 웹 앱을 새로 배포 → /exec 응답 판 확인
 *   node tools/release.js rollback <버전>     대상 방들을 예전 라이브러리 버전에 고정 → 배포 → /exec 응답 판 확인
 *   node tools/release.js drill              (연습 방 전용) 승격 → 말 하나 → 되돌리기 → 말 하나 → 다시 승격, 매번 /exec 판과 모든 발언의 번호·원문이 그대로인지 확인
 * 환경 변수: TARGET=prod|practice, ENGINE_SCRIPT_ID, PROD_ROOMS, PRACTICE_ROOMS(각 줄/쉼표마다 "스크립트ID:배포ID"), PRACTICE_PW(연습 방 비밀번호, drill용), CODE_VER, GITHUB_SHA
 * 운영 방과 연습 방 목록이 겹치면 아무것도 하지 않고 멈춘다. drill은 운영 방에는 절대 돌지 않는다.
 * 여러 방을 차례로 바꾸다 하나라도 실패하면, 이미 바꾼 방을 모두 바꾸기 전 버전으로 되돌린 뒤 멈춘다 (방마다 판이 갈리지 않게). */
const cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
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
function verOfDesc(desc) { const m = /(\d{4}-\d{2}-\d{2}\.\d+)/.exec(String(desc || '')); return m ? m[1] : ''; }
function checkSeparate(prod, practice) {
  const p = new Set(prod.map(r => r.sid)), q = new Set(prod.map(r => r.did));
  const bad = practice.filter(r => p.has(r.sid) || q.has(r.did));
  if (bad.length) throw new Error('연습 방 목록에 운영 방이 들어 있어요 (' + bad.length + '개). 두 목록을 완전히 나눠 주세요');
}
/* 방들을 ver로 바꾸고 판을 확인한다. io = { pinRoom(room, ver, n) → {before}, verify(room, expect, n), log }.
 * 중간에 실패하면 이미 바꾼 방(실패한 방 포함)을 바꾸기 전 버전으로 되돌리고, 무엇을 되돌렸는지 적은 오류를 던진다. */
async function switchAll(rooms, ver, expect, io) {
  const changed = [];
  try {
    for (let i = 0; i < rooms.length; i++) {
      const slot = { i, before: null }; changed.push(slot);
      const r = await io.pinRoom(rooms[i], ver, i + 1); slot.before = r.before;
      io.log('방 ' + (i + 1) + ': 라이브러리 ' + (r.before === 'head' ? 'HEAD' : r.before) + ' → ' + ver);
    }
    for (let i = 0; i < rooms.length; i++) await io.verify(rooms[i], expect, i + 1);
  } catch (e) {
    const back = [], stuck = [];
    for (const c of changed) {
      if (c.before == null || String(c.before) === String(ver)) continue;       // 바꾸기 전에 실패했거나 원래 그 버전
      try { await io.pinRoom(rooms[c.i], c.before, c.i + 1); back.push('방 ' + (c.i + 1) + ' → ' + (c.before === 'head' ? 'HEAD' : '버전 ' + c.before)); }
      catch (e2) { stuck.push('방 ' + (c.i + 1) + ' (' + String(e2.message).slice(0, 80) + ')'); }
    }
    const err = new Error(e.message + ' · 되돌림: ' + (back.join(', ') || '없음') + (stuck.length ? ' · ⚠ 되돌리지 못함: ' + stuck.join(', ') + ' (이 방은 손으로 확인해 주세요)' : ''));
    err.back = back; err.stuck = stuck; throw err;
  }
}
// 되돌리기 전후 비교: 앞에서 본 모든 발언이 번호·이름·원문 그대로 남아 있어야 한다
function diffLines(before, after) {
  const m = new Map(after.map(l => [Number(l.id), l])); const bad = [];
  before.forEach(l => { const x = m.get(Number(l.id)); if (!x) bad.push('#' + l.id + ' 없어짐'); else if (x.text !== l.text || x.name !== l.name) bad.push('#' + l.id + ' 내용이 달라짐'); });
  return bad;
}
module.exports = { parseRooms, parseVersions, verOfDesc, checkSeparate, switchAll, diffLines };

if (require.main !== module) return;

const sh = (cmd, cwd) => cp.execSync(cmd, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
const sleep = ms => new Promise(r => setTimeout(r, ms));
function proj(id) { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-')); fs.writeFileSync(path.join(d, '.clasp.json'), JSON.stringify({ scriptId: id, rootDir: '.', fileExtension: 'gs' })); return d; }
function engineVersion(desc) {
  const d = proj(process.env.ENGINE_SCRIPT_ID);
  const out = sh('clasp version ' + JSON.stringify(desc), d); console.log(out.trim());
  const m = /(\d+)\s*\.?\s*$/.exec(out.trim()); if (!m) throw new Error('새 버전 번호를 읽지 못했어요');
  return m[1];
}
function engineVersions() { return parseVersions(sh('clasp versions', proj(process.env.ENGINE_SCRIPT_ID))); }
function pinRoom(room, ver, n) {
  const d = proj(room.sid);
  sh('clasp pull', d);
  const f = path.join(d, 'appsscript.json'), m = JSON.parse(fs.readFileSync(f, 'utf8'));
  const r = pin(m, ver); fs.writeFileSync(f, JSON.stringify(r.manifest, null, 2));
  sh('clasp push --force', d);
  const vo = sh('clasp version ' + JSON.stringify('TRPG ' + ver), d); const rv = (/(\d+)\s*\.?\s*$/.exec(vo.trim()) || [])[1];
  if (!rv) throw new Error('방 ' + n + ': 방 프로젝트 버전 번호를 읽지 못했어요');
  sh('clasp deploy -i ' + room.did + ' -V ' + rv + ' -d ' + JSON.stringify('TRPG 라이브러리 ' + ver), d);
  return { before: r.before, roomVer: rv };
}
function roomState(room) { const d = proj(room.sid); sh('clasp pull', d); return libState(JSON.parse(fs.readFileSync(path.join(d, 'appsscript.json'), 'utf8'))); }
function engineCodeVer() { const d = proj(process.env.ENGINE_SCRIPT_ID); sh('clasp pull', d); const f = fs.readdirSync(d).find(x => /^Code\.(gs|js)$/.test(x)); const m = f && /CODE_VER = '([^']+)'/.exec(fs.readFileSync(path.join(d, f), 'utf8')); return m ? m[1] : ''; }
const execUrl = room => 'https://script.google.com/macros/s/' + room.did + '/exec';
async function verify(room, expect, n) {
  let got = '';
  for (let i = 0; i < 8; i++) {
    try { const j = await (await fetch(execUrl(room) + '?action=ver&_=' + Date.now(), { redirect: 'follow' })).json(); got = j && j.ver || ''; } catch (e) { got = '응답 없음'; }
    if (got === expect) { console.log('방 ' + n + ': /exec 응답 판 ' + got + ' ✔'); return; }
    await sleep(10000);
  }
  throw new Error('방 ' + n + ': /exec 응답 판이 ' + (got || '?') + ' (기대 ' + expect + ')');
}
async function postJ(room, body) { return (await fetch(execUrl(room), { method: 'POST', body: JSON.stringify(body), redirect: 'follow' })).json(); }
// 대화 전체를 번호순으로 읽는다 (1,000줄씩)
async function allLines(room, pw) {
  const out = []; let before = 0;
  for (let k = 0; k < 200; k++) {
    const r = await postJ(room, { action: 'history', pw, before, limit: 1000 }); if (!r.ok) throw new Error('연습 방 대화를 읽지 못했어요: ' + (r.error || ''));
    const ls = r.lines || []; if (!ls.length) break; out.unshift(...ls.map(l => ({ id: l.id, name: l.name, text: l.text }))); before = Number(ls[0].id); if (!r.hasMore) break;
  }
  return out;
}
async function say(room, pw, uid) { const r = await postJ(room, { action: 'lines', pw, items: [{ uid, name: '배포연습', text: '배포 연습 ' + uid, t: new Date().toISOString() }] }); if (!r.ok || !(r.saved || []).includes(uid)) throw new Error('연습 방에 말을 저장하지 못했어요: ' + (r.error || ((r.dup || []).includes(uid) ? '같은 발언ID가 이미 있어요' : ''))); }

(async () => {
  const mode = process.argv[2], arg = process.argv[3];
  const prod = parseRooms(process.env.PROD_ROOMS), practice = parseRooms(process.env.PRACTICE_ROOMS);
  checkSeparate(prod, practice);
  if (mode === 'check') {
    // 엔진 코드를 바꾸면 개발 모드(HEAD)인 방에 바로 적용된다. 운영 방이 HEAD면 시험도 안 된 코드가 운영에 들어가므로 여기서 멈춘다
    const dev = []; prod.forEach((r, i) => { const st = roomState(r); if (!st) throw new Error('운영 방 ' + (i + 1) + ': 라이브러리 TRPG가 없어요'); if (st.dev) dev.push(i + 1); else console.log('운영 방 ' + (i + 1) + ': 버전 ' + st.version + '에 고정됨 ✔'); });
    if (dev.length) throw new Error('운영 방 ' + dev.join(', ') + '번이 개발 모드(HEAD)예요. 엔진 코드를 바꾸기 전에 mode=pin, target=prod를 먼저 돌려 지금 버전에 고정해 주세요');
    console.log('확인 끝: 방 목록이 나뉘어 있고, 운영 방 ' + prod.length + '개는 모두 버전에 고정돼 있어요'); return;
  }
  const target = mode === 'drill' ? 'practice' : (process.env.TARGET || 'prod');
  const rooms = target === 'practice' ? practice : prod;
  if (!rooms.length) throw new Error((target === 'practice' ? 'PRACTICE_ROOMS' : 'PROD_ROOMS') + ' 비밀값에 방이 없어요');
  const sha = String(process.env.GITHUB_SHA || '').slice(0, 7), cur = process.env.CODE_VER;
  const io = { pinRoom: async (room, ver, n) => pinRoom(room, ver, n), verify, log: m => console.log(m) };
  const all = (ver, expect) => switchAll(rooms, ver, expect, io);
  if (mode === 'promote') {
    const v = engineVersion('운영 ' + cur + ' ' + sha); console.log('엔진 라이브러리 버전 ' + v + ' = ' + cur);
    await all(v, cur);
  } else if (mode === 'pin') {
    // 엔진 코드는 건드리지 않는다. 지금 엔진에 있는 코드 그대로 버전을 만들고 거기에 고정 → 그 뒤 엔진 코드를 바꿔도 이 방은 그대로
    const live = engineCodeVer(); if (!live) throw new Error('엔진의 지금 판(CODE_VER)을 읽지 못했어요');
    const v = engineVersion('운영 ' + live + ' pin'); console.log('엔진 라이브러리 버전 ' + v + ' = 지금 엔진 코드(' + live + ')');
    io.verify = async (room, expect, n) => {      // 예전 판은 판 번호를 답하지 못한다: 그때는 웹 앱이 답하는지만 본다
      try { await verify(room, expect, n); } catch (e) { const r = await fetch(execUrl(room) + '?action=ver&_=' + Date.now(), { redirect: 'follow' }); if (!r.ok) throw e; console.log('방 ' + n + ': 웹 앱 응답 있음 (이 판은 판 번호를 답하지 않아 번호 확인은 건너뜀)'); }
    };
    await all(v, live);
  } else if (mode === 'rollback') {
    if (!/^\d+$/.test(String(arg || ''))) throw new Error('되돌릴 버전 번호를 넣어 주세요');
    const expect = verOfDesc(engineVersions()[arg]);
    if (!expect) throw new Error('버전 ' + arg + '의 엔진 판을 알 수 없어요 (이 워크플로로 만든 버전만 되돌릴 수 있어요)');
    await all(arg, expect);
  } else if (mode === 'drill') {
    const pw = process.env.PRACTICE_PW; if (!pw) throw new Error('drill에는 PRACTICE_PW(연습 방 비밀번호)가 필요해요');
    const vs = engineVersions(), prevNum = Object.keys(vs).filter(k => verOfDesc(vs[k])).map(Number).sort((a, b) => b - a)[0];
    const v = engineVersion('운영 ' + cur + ' ' + sha);
    if (!prevNum) throw new Error('되돌아갈 예전 운영 버전이 없어요. 운영 전환(promote)을 한 번 한 뒤에 연습해 주세요');
    const prevVer = verOfDesc(vs[prevNum]), room = rooms[0], run = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);    // 돌릴 때마다 새 발언ID (같은 커밋으로 다시 돌려도 겹치지 않게)
    const same = (a, b, what) => { const bad = diffLines(a, b); if (bad.length) throw new Error(what + ': 발언 ' + bad.length + '개가 달라졌어요 (' + bad.slice(0, 5).join(', ') + ')'); if (b.length !== a.length + 1) throw new Error(what + ': 줄 수가 ' + a.length + ' → ' + b.length + ' (기대 ' + (a.length + 1) + ')'); };
    const l0 = await allLines(room, pw);
    await all(v, cur); await say(room, pw, 'drill-' + run + '-a');
    await all(String(prevNum), prevVer); const l1 = await allLines(room, pw); same(l0, l1, '되돌린 뒤'); await say(room, pw, 'drill-' + run + '-b');
    await all(v, cur); const l2 = await allLines(room, pw); same(l1, l2, '다시 승격한 뒤');
    console.log('연습: 시작 ' + l0.length + '줄 → 승격 후 말 1 → 되돌린 뒤 ' + l1.length + '줄 → 말 1 → 다시 승격 ' + l2.length + '줄. 앞선 발언 ' + l1.length + '개의 번호·이름·원문 모두 그대로');
    console.log('되돌리기 연습 합격: 버전 ' + v + '(' + cur + ') ↔ ' + prevNum + '(' + prevVer + ') 오가며 대화 유지');
  } else throw new Error('모드는 check / pin / promote / rollback / drill');
})().catch(e => { console.error('::error::' + e.message); process.exit(1); });
