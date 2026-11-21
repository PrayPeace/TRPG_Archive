// 배포 도구: 키 네 줄 보존, 방 버전 고정, 운영·연습 방 목록 분리, 버전 설명에서 판 읽기
const { ok, done } = require('./lib.js');
const fs = require('fs'), path = require('path');
const { merge } = require('../tools/engine-merge.js'), { pin, libState } = require('../tools/pin-room.js');
const R = require('../tools/release.js');
const repo = fs.readFileSync(path.join(__dirname, '..', 'Code.gs'), 'utf8');
const eng = repo.replace(/^const CLAUDE_KEY .*$/m, "const CLAUDE_KEY   = 'sk-real-1';").replace(/^const KEEPER_PW .*$/m, "const KEEPER_PW = 'real';").replace(/CODE_VER = '[^']+'/, "CODE_VER = 'OLD'");
const m = merge(eng, repo);
ok('엔진의 키 줄은 그대로', m.includes("sk-real-") && m.includes("const KEEPER_PW = 'real';") && !m.includes('여기에_클로드_API_키'));
ok('나머지는 저장소 판', !m.includes("CODE_VER = 'OLD'") && m.length > repo.length - 200);
let stop = ''; try { merge(eng.replace(/^const ROOM_PW .*$/m, ''), repo); } catch (e) { stop = e.message; }
ok('키 줄을 못 찾으면 멈춤', /ROOM_PW/.test(stop));
const man = { dependencies: { libraries: [{ userSymbol: 'TRPG', libraryId: 'X', version: '0', developmentMode: true }] } };
const p = pin(JSON.parse(JSON.stringify(man)), '7');
ok('방을 버전 7에 고정(개발 모드 끔)', p.lib.version === '7' && p.lib.developmentMode === false);
const A = '1'.repeat(30), B = '2'.repeat(30), C = '3'.repeat(30), D = '4'.repeat(30);
let sep = ''; try { R.checkSeparate(R.parseRooms(A + ':' + B), R.parseRooms(A + ':' + D)); } catch (e) { sep = e.message; }
ok('연습 방 목록에 운영 방이 있으면 멈춤', /운영 방/.test(sep));
let ok2 = true; try { R.checkSeparate(R.parseRooms(A + ':' + B), R.parseRooms(C + ':' + D)); } catch (e) { ok2 = false; }
ok('나뉘어 있으면 통과', ok2);
const v = R.parseVersions('~ 2 Versions ~\n5 - 운영 2026-11-21.23 abc1234\n4 - 손으로 만든 버전');
ok('버전 설명에서 엔진 판 읽기 (워크플로가 만든 버전만)', R.verOfDesc(v['5']) === '2026-11-21.23' && !R.verOfDesc(v['4']));
ok('바꾸기 전 상태를 돌려줌 (HEAD였음)', p.before === 'head' && libState(man).dev === true && libState(p.manifest).dev === false);
ok('버전 7 → 9: 바꾸기 전은 7', pin(JSON.parse(JSON.stringify(p.manifest)), '9').before === '7');
/* 가짜 clasp: 방마다 HEAD 매니페스트, 방 프로젝트 버전들(만들 때의 매니페스트를 그대로 담음), 웹 앱 배포가 가리키는 버전.
 * 엔진 라이브러리 버전 → 엔진 판(LIBV). /exec는 "배포된 방 버전의 매니페스트"가 가리키는 엔진 판으로 답한다. fail = { stage: 'push'|'version'|'deploy'|'exec', room, when(ver) } */
const ENG = 'E'.repeat(30);
function fakeClasp(LIBV, headVer) {
  const man = (v) => ({ dependencies: { libraries: [{ userSymbol: 'TRPG', libraryId: ENG, version: v === 'head' ? '0' : String(v), developmentMode: v === 'head' }] } });
  const R0 = new Map(), calls = [];
  const cl = {
    fail: null, calls, sleep: async () => {},
    add(room, lib) { R0.set(room.sid, { did: room.did, head: man(lib), vers: { 1: man(lib) }, dep: 1, next: 2 }); },
    st(room) { const r = R0.get(room.sid), l = libState(r.head); return (l.dev ? 'head' : l.version) + '@' + r.dep; },
    boom(stage, room) { if (cl.fail && cl.fail.stage === stage && cl.fail.room === room.sid && !cl.fail.done) { if (cl.fail.once) cl.fail.done = true; throw new Error('가짜 clasp: ' + stage + ' 실패'); } },
    async manifest(room) { return JSON.parse(JSON.stringify(R0.get(room.sid).head)); },
    async manifestAt(room, v) { return JSON.parse(JSON.stringify(R0.get(room.sid).vers[v])); },
    async pushManifest(room, m) { calls.push('push'); cl.boom('push', room); R0.get(room.sid).head = JSON.parse(JSON.stringify(m)); cl.boom('afterPush', room); },
    async version(room) { calls.push('version'); cl.boom('version', room); const r = R0.get(room.sid), n = r.next++; r.vers[n] = JSON.parse(JSON.stringify(r.head)); return String(n); },
    async deploy(room, v) { calls.push('deploy'); cl.boom('deploy', room); const r = R0.get(room.sid); if (!r.vers[v]) throw new Error('없는 방 버전'); r.dep = Number(v); cl.boom('afterDeploy', room); },
    async deployments(room) { return [{ id: 'X'.repeat(30), ver: 'HEAD' }, { id: R0.get(room.sid).did, ver: String(R0.get(room.sid).dep) }]; },
    async exec(room) { const r = R0.get(room.sid), l = libState(r.vers[r.dep]); const ver = l.dev ? headVer : LIBV[l.version]; if (cl.fail && cl.fail.stage === 'exec' && cl.fail.room === room.sid && ver === cl.fail.ver) return { ok: true, json: true, ver: '틀린판' }; return { ok: true, json: true, ver: ver || '', tick: null }; }
  };
  return cl;
}
(async () => {
  const rooms = R.parseRooms([A + ':' + B, B + ':' + C, C + ':' + D].join('\n'));
  const LIBV = { 4: '2026-11-21.22', 5: '2026-11-21.23', 9: '2026-11-21.25' };
  const mk = (libs) => { const cl = fakeClasp(LIBV, '2026-11-21.25'); rooms.forEach((r, i) => cl.add(r, libs[i])); const saved = [];
    const io = { log() {}, save: s => saved.push(R.stateLine(s)), snapshot: (room, n) => R.snapshot(room, n, cl), pinRoom: (room, ver, n) => R.pinRoom(room, ver, n, cl), restore: (room, st, n) => R.restoreRoom(room, st, n, cl),
      verify: (room, expect, n) => R.verifyRoom(room, expect, n, cl, { tries: 2, wait: 0 }), verifyBack: (room, st, n, expect) => R.verifyRoom(room, st.exec, n, cl, st.exec ? { tries: 2, wait: 0 } : { tries: 2, wait: 0, not: expect }) };
    return { cl, io, saved, all: () => rooms.map(r => cl.st(r)).join(' ') }; };
  const BEFORE = '5@1 5@1 4@1';
  const T = rooms.map(R.roomTag), LINE0 = T[0] + '=5@1!2026-11-21.23,' + T[1] + '=5@1!2026-11-21.23,' + T[2] + '=4@1!2026-11-21.22';
  // 문제없으면 세 방 모두 새 버전, 되돌림표는 바꾸기 전에 남는다
  let t = mk(['5', '5', '4']); await R.switchAll(rooms, '9', LIBV[9], t.io);
  ok('문제없으면 세 방 모두 새 버전 (웹 앱은 새 방 버전)', t.all() === '9@2 9@2 9@2' && t.saved[0] === LINE0, t.all() + ' / ' + t.saved[0]);
  // 4차 검토에서 재현된 결함: 방을 바꾼 "뒤에" pinRoom이 실패하면 그 방이 되돌려지지 않았다
  for (const [stage, label] of [['afterPush', 'push 뒤 (HEAD 매니페스트만 바뀜)'], ['version', '방 버전 만들기'], ['deploy', '웹 앱 배포'], ['afterDeploy', '배포 뒤 (모두 바뀐 다음 오류)']]) {
    for (const k of [0, 1, 2]) {
      t = mk(['5', '5', '4']); t.cl.fail = { stage, room: rooms[k].sid, once: true };
      let err = null; try { await R.switchAll(rooms, '9', LIBV[9], t.io); } catch (e) { err = e; }
      ok(label + '에서 방 ' + (k + 1) + ' 실패: 손댄 방 ' + (k + 1) + '개(실패한 방 포함) 모두 바꾸기 전으로', err && t.all() === BEFORE && err.back.length === k + 1 && !err.stuck.length, t.all() + ' / ' + (err && err.message.slice(0, 90)));
    }
  }
  // 둘째 방의 /exec가 틀린 판으로 답함 → 세 방 모두 되돌리고, 되돌린 뒤 /exec가 바꾸기 전 판인지 확인
  t = mk(['5', '5', '4']); t.cl.fail = { stage: 'exec', room: rooms[1].sid, ver: LIBV[9] };
  let e1 = null; try { await R.switchAll(rooms, '9', LIBV[9], t.io); } catch (e) { e1 = e; }
  ok('/exec 판이 틀리면 세 방 모두 되돌리고 되돌린 판을 확인', e1 && t.all() === BEFORE && e1.back.length === 3 && /\/exec 2026-11-21\.23 확인/.test(e1.back[0]) && /\/exec 2026-11-21\.22 확인/.test(e1.back[2]), e1 && e1.message.slice(0, 200));
  // 되돌리는 것마저 실패하면: 못 되돌린 방과 되돌림표를 오류에 적는다
  t = mk(['5', '5', '4']); t.cl.fail = { stage: 'deploy', room: rooms[1].sid };
  let e2 = null; try { await R.switchAll(rooms, '9', LIBV[9], t.io); } catch (e) { e2 = e; }
  ok('되돌리기도 실패하면 그 방과 되돌림표를 알림', e2 && e2.stuck.length === 1 && /방 2/.test(e2.stuck[0]) && e2.message.indexOf(LINE0) >= 0 && t.cl.st(rooms[0]) === '5@1', e2 && e2.message.slice(-160));
  // 바꾸기 전 상태를 못 읽으면 (배포ID가 틀림) 아무 방도 바꾸지 않는다
  t = mk(['5', '5', '4']); const wrong = rooms.slice(); wrong[2] = { sid: rooms[2].sid, did: 'Z'.repeat(30) };
  let e3 = null; try { await R.switchAll(wrong, '9', LIBV[9], t.io); } catch (e) { e3 = e; }
  ok('바꾸기 전 상태를 못 읽으면 아무것도 바꾸지 않음', e3 && e3.untouched && t.all() === BEFORE && !t.cl.calls.length, e3 && e3.message);
  // HEAD였던 방: 되돌리면 다시 HEAD, 웹 앱도 예전 방 버전
  t = mk(['head', '5', '4']); t.cl.fail = { stage: 'version', room: rooms[2].sid, once: true };
  let e4 = null; try { await R.switchAll(rooms, '9', LIBV[9], t.io); } catch (e) { e4 = e; }
  ok('HEAD였던 방은 HEAD로 되돌림', e4 && t.all() === 'head@1 5@1 4@1');
  // 되돌림표만으로 되돌리기 (실행이 강제로 끝난 뒤 mode=restore)
  t = mk(['5', '5', '4']); await R.switchAll(rooms, '9', LIBV[9], t.io);
  const rio = (t, extra) => Object.assign({ log() {}, snapshot: (room, n) => R.snapshot(room, n, t.cl), restore: (room, st, n) => R.restoreRoom(room, st, n, t.cl), verify: (room, expect, n) => R.verifyRoom(room, expect, n, t.cl, { tries: 2, wait: 0 }) }, extra || {});
  const tryR = async (rs, line, io) => { try { return { res: await R.restoreAll(rs, line, io) }; } catch (e) { return { err: e }; } };
  let rr = await tryR(rooms, t.saved[0], rio(t));
  ok('되돌림표 한 줄로 세 방을 바꾸기 전 상태로, 되돌린 뒤 /exec가 되돌림표에 적힌 판인지 확인', rr.res && rr.res.done.length === 3 && t.all() === BEFORE && (await t.cl.exec(rooms[0])).ver === LIBV[5] && /\/exec 2026-11-21\.23 확인/.test(rr.res.done[0]), JSON.stringify(rr.res || rr.err.message).slice(0, 200));
  ok('되돌림표에 방 번호가 아니라 방 식별값을 적음 (스크립트ID·배포ID는 들어가지 않음)', /^r[0-9a-f]{8}=5@1!/.test(t.saved[0]) && t.saved[0].indexOf(A) < 0 && t.saved[0].indexOf(B) < 0 && new Set(T).size === 3, t.saved[0]);
  // 5차 검토: 되돌림표를 만든 뒤 방 목록의 순서가 바뀌면 다른 방을 되돌릴 수 있었다 → 식별값으로 찾으므로 순서가 바뀌어도 같은 방
  t = mk(['5', '5', '4']); await R.switchAll(rooms, '9', LIBV[9], t.io);
  const swapped = [rooms[2], rooms[0], rooms[1]];
  rr = await tryR(swapped, t.saved[0], rio(t));
  ok('방 목록의 순서가 바뀌어도 방마다 제 상태로 되돌림 (셋째 방은 라이브러리 4, 나머지는 5)', rr.res && t.all() === BEFORE, t.all());
  // 목록이 달라졌으면 아무 방도 바꾸지 않는다
  const untouched = async (label, rs, line, re) => { const tt = mk(['5', '5', '4']); await R.switchAll(rooms, '9', LIBV[9], tt.io); const n0 = tt.cl.calls.length; const x = await tryR(rs, line === undefined ? tt.saved[0] : line(tt.saved[0]), rio(tt)); ok(label, !!x.err && re.test(x.err.message) && tt.all() === '9@2 9@2 9@2' && tt.cl.calls.length === n0, (x.err ? x.err.message.slice(0, 110) : '오류 없음') + ' / ' + tt.all()); };
  await untouched('방 목록에서 방이 하나 빠졌으면 아무 방도 바꾸지 않고 멈춤', rooms.slice(0, 2), undefined, /지금 방 목록에 없어요/);
  await untouched('방 목록에 방이 하나 늘었으면 아무 방도 바꾸지 않고 멈춤', rooms.concat(R.parseRooms(D + ':' + A)), undefined, /되돌림표에 없어요/);
  await untouched('다른 목록(연습 방 되돌림표를 운영 방에)이면 멈춤', R.parseRooms([D + ':' + A, D.replace(/.$/, 'q') + ':' + B, D.replace(/.$/, 'w') + ':' + C].join('\n')), undefined, /지금 방 목록에 없어요/);
  await untouched('예전 형식(방 번호) 되돌림표는 쓰지 않음', rooms, () => '1=5@1,2=5@1,3=4@1', /예전 형식/);
  await untouched('같은 방이 두 번 들어 있으면 멈춤', rooms, l => l + ',' + l.split(',')[0], /두 번/);
  await untouched('없는 방 식별값이면 멈춤', rooms, l => l.replace(/^r[0-9a-f]{8}/, 'r00000000'), /지금 방 목록에 없어요/);
  await untouched('형식이 틀리면 멈춤', rooms, () => T[0] + '=7', /형식/);
  await untouched('빈 되돌림표는 멈춤', rooms, () => '', /비어/);
  // 지금 상태를 못 읽는 방이 하나라도 있으면 아무 방도 되돌리지 않는다
  t = mk(['5', '5', '4']); await R.switchAll(rooms, '9', LIBV[9], t.io); let n0 = t.cl.calls.length;
  rr = await tryR(rooms, t.saved[0], rio(t, { snapshot: (room, n) => { if (n === 3) throw new Error('가짜: 읽기 실패'); return R.snapshot(room, n, t.cl); } }));
  ok('지금 상태를 못 읽으면 아무 방도 되돌리지 않음', rr.err && rr.err.untouched && t.all() === '9@2 9@2 9@2' && t.cl.calls.length === n0, rr.err && rr.err.message);
  // 이미 되돌림표의 상태인 방은 건드리지 않는다 (같은 되돌림표로 다시 돌려도 안전)
  t = mk(['5', '5', '4']); await R.switchAll(rooms, '9', LIBV[9], t.io); await R.restoreAll(rooms, t.saved[0], rio(t)); n0 = t.cl.calls.length;
  rr = await tryR(rooms, t.saved[0], rio(t));
  ok('이미 그 상태인 방은 건드리지 않음 (다시 돌려도 안전)', rr.res && rr.res.same.length === 3 && !rr.res.done.length && t.cl.calls.length === n0, JSON.stringify(rr.res && rr.res.same).slice(0, 120));
  // 되돌리기가 한 방에서 실패: 나머지는 되돌리고, 실패한 방을 알림. 같은 표로 다시 돌리면 남은 방만 되돌림
  t = mk(['5', '5', '4']); await R.switchAll(rooms, '9', LIBV[9], t.io); t.cl.fail = { stage: 'deploy', room: rooms[1].sid, once: true };
  rr = await tryR(rooms, t.saved[0], rio(t));
  ok('되돌리기가 한 방에서 실패하면 나머지 두 방은 되돌리고 실패한 방을 알림', rr.err && rr.err.stuck.length === 1 && /방 2/.test(rr.err.stuck[0]) && rr.err.done.length === 2 && t.cl.st(rooms[0]) === '5@1' && t.cl.st(rooms[2]) === '4@1', rr.err && rr.err.message.slice(0, 160));
  rr = await tryR(rooms, t.saved[0], rio(t));
  ok('같은 되돌림표로 다시 돌리면 남은 방만 되돌림', rr.res && rr.res.done.length === 1 && rr.res.same.length === 2 && t.all() === BEFORE, t.all());
  // 되돌린 뒤 /exec가 되돌림표에 적힌 판이 아니면 실패로 알림
  t = mk(['5', '5', '4']); await R.switchAll(rooms, '9', LIBV[9], t.io); t.cl.fail = { stage: 'exec', room: rooms[0].sid, ver: LIBV[5] };
  rr = await tryR(rooms, t.saved[0], rio(t));
  ok('되돌린 뒤 /exec 판이 되돌림표와 다르면 그 방을 실패로 알림', rr.err && rr.err.stuck.length === 1 && /방 1/.test(rr.err.stuck[0]) && /틀린판/.test(rr.err.stuck[0]), rr.err && rr.err.message.slice(0, 160));
  // 자동 정리가 돈 판: /exec가 알려 주면 적고, 다르면 5분 뒤 확인하라고 적음
  t = mk(['5', '5', '4']); await R.switchAll(rooms, '9', LIBV[9], t.io);
  rr = await tryR(rooms, t.saved[0], rio(t, { verify: async (room, expect, n) => Object.assign(await R.verifyRoom(room, expect, n, t.cl, { tries: 2, wait: 0 }), { tick: { ver: LIBV[9], at: Date.now() } }) }));
  ok('되돌린 뒤 자동 정리가 마지막으로 돈 판을 적고, 다르면 5분 뒤 확인하라고 알림', rr.res && /마지막 자동 정리 2026-11-21\.25 \(다음 자동 정리가 돌면 2026-11-21\.23/.test(rr.res.done[0]), rr.res && rr.res.done[0]);
  // 엔진 주소로 직접 도는 방: 있거나 알 수 없으면 멈춤 (경고만 하고 넘어가지 않음)
  const H = o => R.checkHosted(o);
  ok('hosted: 직접 도는 방이 있으면 멈춤', H({ given: true, execs: [{ ok: true, json: true, hosted: 2 }] }).stop.length === 1);
  ok('hosted: ALLOW_HOSTED_ROOMS=yes면 알리고 계속', (x => !x.stop.length && x.warn.length === 1)(H({ given: true, allow: true, execs: [{ ok: true, json: true, hosted: 2 }] })));
  ok('hosted: 없다고 답하면 통과', (x => !x.stop.length && !x.warn.length)(H({ given: true, execs: [{ ok: true, json: true, hosted: 0 }] })));
  ok('hosted: 엔진 웹 앱이 답하지 않으면 멈춤 (확인 못 함)', H({ given: true, execs: [{ ok: false, json: false }] }).stop.length === 1);
  ok('hosted: 비밀값이 없어도 엔진의 배포를 불러 봐서 웹 앱이 있고 방이 있으면 멈춤', H({ listed: true, execs: [{ ok: false, json: false }, { ok: true, json: true, hosted: 1 }] }).stop.length === 1);
  ok('hosted: 웹 앱으로 답하는 배포가 없으면 통과', (x => !x.stop.length && x.info.length === 1)(H({ listed: true, execs: [{ ok: false, json: false }] })));
  ok('hosted: 배포 목록도 못 읽으면 멈춤', H({ listed: false, execs: [] }).stop.length === 1);
  ok('hosted: 예전 판 엔진(방 수를 답하지 못함)은 미확인으로 알리고 계속 (새 판이 올라가야 확인할 수 있으므로)', (x => !x.stop.length && /미확인/.test(x.warn[0]))(H({ given: true, execs: [{ ok: true, json: true, ver: '2026-11-21.24' }] })));
  // pin 모드: 웹 앱이 답하기만 하면 통과하던 문제. 판 번호가 "틀리게" 오면 실패, 판 번호를 모르는 옛 판일 때만 번호 없는 응답을 받아들임
  const one = { sid: A, did: B };
  const vr = (x, opt) => R.verifyRoom(one, '2026-11-21.25', 1, { exec: async () => x, sleep: async () => {} }, Object.assign({ tries: 2, wait: 0 }, opt)).then(() => 'ok', e => 'fail');
  ok('판 번호가 틀리면 (HTTP 200이어도) 실패', await vr({ ok: true, json: true, ver: '2026-11-21.24' }, { loose: true }) === 'fail');
  ok('판 번호를 답할 줄 아는 판인데 번호가 없으면 실패', await vr({ ok: true, json: true, ver: '' }, {}) === 'fail');
  ok('옛 판(번호를 모름)이고 번호 없는 JSON 응답이면 미확인으로 통과', await vr({ ok: true, json: true, ver: '' }, { loose: true }) === 'ok');
  ok('JSON이 아닌 응답(로그인 화면 등)은 옛 판이어도 실패', await vr({ ok: false, json: false, ver: '' }, { loose: true }) === 'fail');
  // check: 빈 목록·틀린 목록·HEAD를 통과시키지 않는다
  const S = (o) => Object.assign({ n: 1, lib: { dev: false, version: '5' }, libraryId: ENG, deployVer: '3', deployedLib: { dev: false, version: '5' }, exec: '2026-11-21.23', execOk: true, tick: null }, o);
  ok('check: 운영 방 목록이 비면 멈춤', R.checkProd([], ENG).stop.length === 1);
  ok('check: 모두 고정이면 통과', !R.checkProd([S({})], ENG).stop.length && !R.checkProd([S({})], ENG).warn.length);
  ok('check: 자동 정리(HEAD 매니페스트)가 HEAD면 멈춤', /자동 정리/.test(R.checkProd([S({ lib: { dev: true, version: '0' } })], ENG).stop.join()));
  ok('check: 매니페스트는 고정인데 웹 앱(배포된 방 버전)이 HEAD면 멈춤', /웹 앱\(방 버전 3\)이 개발 모드/.test(R.checkProd([S({ deployedLib: { dev: true, version: '0' } })], ENG).stop.join()));
  ok('check: 배포된 버전의 설정을 못 읽으면 통과시키지 않음', R.checkProd([S({ deployedLib: null })], ENG).stop.length === 1);
  ok('check: 다른 엔진을 가리키는 방이면 멈춤', /다른 스크립트/.test(R.checkProd([S({ libraryId: 'OTHER' })], ENG).stop.join()));
  ok('check: /exec가 답하지 않으면 멈춤', R.checkProd([S({ execOk: false, exec: '' })], ENG).stop.length === 1);
  ok('check: 웹 앱과 자동 정리의 버전·판이 다르면 알림', R.checkProd([S({ lib: { dev: false, version: '6' }, tick: { at: 1, ver: '2026-11-21.24' } })], ENG).warn.length === 2);
  let dup = ''; try { R.checkSeparate(R.parseRooms(A + ':' + B + '\n' + A + ':' + C), []); } catch (e) { dup = e.message; }
  ok('check: 같은 방이 두 번 들어 있으면 멈춤', /두 번/.test(dup));
  ok('배포 목록 읽기 (@HEAD와 @버전)', JSON.stringify(R.parseDeployments('2 Deployments.\n- ' + B + ' @HEAD \n- ' + C + ' @12 - TRPG 라이브러리 7')) === JSON.stringify([{ id: B, ver: 'HEAD' }, { id: C, ver: '12' }]));
  // drill: 지금 판과 같은 판으로 "되돌리는" 것은 연습이 아니다
  ok('판 번호를 답하는 판: .23부터 (옛 .2, .22는 못 답함)', !R.answersVer('2026-11-21.2') && !R.answersVer('2026-11-21.22') && R.answersVer('2026-11-21.23') && R.answersVer('2026-11-21.26') && R.answersVer('2026-11-22.1') && !R.answersVer('2026-11-20.30'));
  ok('옛 판(.2)으로 되돌릴 때: 판 번호 없는 응답은 통과, 다른 판 번호가 오면 실패', await vr({ ok: true, json: true }, { loose: !R.answersVer('2026-11-21.2') }) === 'ok' && await vr({ ok: true, json: true, ver: '2026-11-21.26' }, { loose: !R.answersVer('2026-11-21.2') }) === 'fail');
  ok('drill: 지금 판과 다른 판 가운데 가장 새 버전으로 되돌아감', JSON.stringify(R.pickPrev({ 9: '운영 2026-11-21.25 abc', 8: '운영 2026-11-21.25 pin', 7: '운영 2026-11-21.24 x', 5: '운영 2026-11-21.23 y', 6: '손으로' }, '2026-11-21.25')) === JSON.stringify({ num: '7', ver: '2026-11-21.24' }));
  ok('drill: 같은 판뿐이면 되돌아갈 곳 없음', R.pickPrev({ 9: '운영 2026-11-21.25 abc', 8: '운영 2026-11-21.25 pin' }, '2026-11-21.25') === null);
  const L = [{ id: 1, name: '가', text: '안녕', uid: 'u1', session: '1', time: '2026-11-21 10:00:00' }, { id: 2, name: '나', text: '열쇠', uid: 'u2', session: '1', time: '2026-11-21 10:00:05' }];
  const ch = (o) => [L[0], Object.assign({}, L[1], o)];
  ok('되돌리기 비교: 모두 같으면 통과 (뒤에 새 말이 붙어도)', R.diffLines(L, L.concat([{ id: 3, name: '다', text: '새 말', uid: 'u3', session: '1', time: 'x' }])).length === 0);
  ok('되돌리기 비교: 원문이 달라지거나 없어지면 잡음', R.diffLines(L, ch({ text: '열쇄' })).length === 1 && R.diffLines(L, [L[0]]).length === 1);
  ok('되돌리기 비교: 발언ID·회차·시각이 달라져도 잡음', /발언ID/.test(R.diffLines(L, ch({ uid: 'zz' }))[0]) && /회차/.test(R.diffLines(L, ch({ session: '2' }))[0]) && /시각/.test(R.diffLines(L, ch({ time: '2026-11-21 10:09:00' }))[0]));
  ok('되돌리기 비교: 예전 서버가 주지 않는 항목은 건너뜀', R.diffLines(L, [{ id: 1, name: '가', text: '안녕' }, { id: 2, name: '나', text: '열쇠' }]).length === 0);
  done();
})();
