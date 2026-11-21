// 배포 도구: 키 네 줄 보존, 방 버전 고정, 운영·연습 방 목록 분리, 버전 설명에서 판 읽기
const { ok, done } = require('./lib.js');
const fs = require('fs'), path = require('path');
const { merge } = require('../tools/engine-merge.js'), { pin } = require('../tools/pin-room.js');
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
done();
