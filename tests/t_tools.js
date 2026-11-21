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
(async () => {
  // 운영 방 3개를 버전 9로 바꾸다가 둘째 방 확인에서 실패 → 세 방 모두 바꾸기 전 버전으로
  const rooms = R.parseRooms([A + ':' + B, B + ':' + C, C + ':' + D].join('\n')), state = { 0: '5', 1: '5', 2: '4' }, log = [];
  const io = { log: m => log.push(m), pinRoom: async (room, ver) => { const i = rooms.indexOf(room), before = state[i]; state[i] = String(ver); return { before }; }, verify: async (room, expect, n) => { if (n === 2) throw new Error('방 2: /exec 응답 판이 다름'); } };
  let err = null; try { await R.switchAll(rooms, '9', 'X', io); } catch (e) { err = e; }
  ok('일부만 배포된 채 실패하면 모든 방을 바꾸기 전 버전으로 되돌림', err && state[0] === '5' && state[1] === '5' && state[2] === '4' && err.back.length === 3 && !err.stuck.length, err && err.message);
  // 셋째 방을 바꾸는 중에 실패 → 앞의 두 방만 되돌림
  const st2 = { 0: '5', 1: '5', 2: '4' };
  const io2 = { log() {}, pinRoom: async (room, ver) => { const i = rooms.indexOf(room); if (i === 2 && String(ver) === '9') throw new Error('방 3: clasp 실패'); const before = st2[i]; st2[i] = String(ver); return { before }; }, verify: async () => {} };
  let e2 = null; try { await R.switchAll(rooms, '9', 'X', io2); } catch (e) { e2 = e; }
  ok('바꾸는 중에 실패해도 이미 바꾼 방을 되돌림', e2 && st2[0] === '5' && st2[1] === '5' && st2[2] === '4' && e2.back.length === 2);
  const st3 = { 0: '5' }; await R.switchAll(rooms.slice(0, 1), '9', 'X', { log() {}, pinRoom: async (room, ver) => { const before = st3[0]; st3[0] = String(ver); return { before }; }, verify: async () => {} });
  ok('문제없으면 새 버전 그대로', st3[0] === '9');
  const L = [{ id: 1, name: '가', text: '안녕' }, { id: 2, name: '나', text: '열쇠' }];
  ok('되돌리기 비교: 번호·이름·원문이 같으면 통과', R.diffLines(L, L.concat([{ id: 3, name: '다', text: '새 말' }])).length === 0);
  ok('되돌리기 비교: 원문이 달라지거나 없어지면 잡음', R.diffLines(L, [{ id: 1, name: '가', text: '안녕' }, { id: 2, name: '나', text: '열쇄' }]).length === 1 && R.diffLines(L, [L[0]]).length === 1);
  done();
})();
