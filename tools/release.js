/* 운영 전환·되돌리기·되돌리기 연습 (GitHub Actions에서 clasp로 실행).
 *   node tools/release.js promote            지금 엔진 코드로 라이브러리 새 버전 → 대상 방들을 그 버전에 고정 → 각 방 웹 앱을 새로 배포 → /exec 응답 판 확인
 *   node tools/release.js rollback <버전>     대상 방들을 예전 라이브러리 버전에 고정 → 배포 → /exec 응답 판 확인
 *   node tools/release.js drill              (연습 방 전용) 승격 → 말 하나 → 되돌리기 → 말 하나 → 다시 승격, 매번 /exec 판과 대화 줄 수 확인
 * 환경 변수: TARGET=prod|practice, ENGINE_SCRIPT_ID, PROD_ROOMS, PRACTICE_ROOMS(각 줄/쉼표마다 "스크립트ID:배포ID"), PRACTICE_PW(연습 방 비밀번호, drill용), CODE_VER, GITHUB_SHA
 * 운영 방과 연습 방 목록이 겹치면 아무것도 하지 않고 멈춘다. drill은 운영 방에는 절대 돌지 않는다. */
const cp = require('child_process'), fs = require('fs'), path = require('path'), os = require('os');
const { pin } = require('./pin-room.js');

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
module.exports = { parseRooms, parseVersions, verOfDesc, checkSeparate };

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
async function lineCount(room, pw) { const r = await postJ(room, { action: 'sessions', pw }); if (!r.ok) throw new Error('연습 방 줄 수를 읽지 못했어요: ' + (r.error || '')); return (r.sessions || []).reduce((a, s) => a + Number(s.count || 0), 0); }
async function say(room, pw, uid) { const r = await postJ(room, { action: 'lines', pw, items: [{ uid, name: '배포연습', text: '배포 연습 ' + uid, t: new Date().toISOString() }] }); if (!r.ok || !(r.saved || []).concat(r.dup || []).includes(uid)) throw new Error('연습 방에 말을 저장하지 못했어요: ' + (r.error || '')); }

(async () => {
  const mode = process.argv[2], arg = process.argv[3];
  const prod = parseRooms(process.env.PROD_ROOMS), practice = parseRooms(process.env.PRACTICE_ROOMS);
  checkSeparate(prod, practice);
  const target = mode === 'drill' ? 'practice' : (process.env.TARGET || 'prod');
  const rooms = target === 'practice' ? practice : prod;
  if (!rooms.length) throw new Error((target === 'practice' ? 'PRACTICE_ROOMS' : 'PROD_ROOMS') + ' 비밀값에 방이 없어요');
  const sha = String(process.env.GITHUB_SHA || '').slice(0, 7), cur = process.env.CODE_VER;
  const all = async (ver, expect) => { for (let i = 0; i < rooms.length; i++) { const r = pinRoom(rooms[i], ver, i + 1); console.log('방 ' + (i + 1) + ': 라이브러리 ' + r.before + ' → ' + ver + ' (방 배포 버전 ' + r.roomVer + ')'); } for (let i = 0; i < rooms.length; i++) await verify(rooms[i], expect, i + 1); };
  if (mode === 'promote') {
    const v = engineVersion('운영 ' + cur + ' ' + sha); console.log('엔진 라이브러리 버전 ' + v + ' = ' + cur);
    await all(v, cur);
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
    const prevVer = verOfDesc(vs[prevNum]), room = rooms[0], run = sha || String(Date.now());
    const n0 = await lineCount(room, pw);
    await all(v, cur); await say(room, pw, 'drill-' + run + '-a');
    await all(String(prevNum), prevVer); const n1 = await lineCount(room, pw); await say(room, pw, 'drill-' + run + '-b');
    await all(v, cur); const n2 = await lineCount(room, pw);
    console.log('연습: 시작 ' + n0 + '줄 → 승격 후 말 1 → 되돌린 뒤 ' + n1 + '줄 → 말 1 → 다시 승격 ' + n2 + '줄');
    if (n1 < n0 + 1 || n2 < n0 + 2) throw new Error('되돌리기 중에 대화가 줄었어요');
    console.log('되돌리기 연습 합격: 버전 ' + v + '(' + cur + ') ↔ ' + prevNum + '(' + prevVer + ') 오가며 대화 유지');
  } else throw new Error('모드는 promote / rollback / drill');
})().catch(e => { console.error('::error::' + e.message); process.exit(1); });
