/****************************************************************
 * 🎲 TRPG Archive — 방 연결 코드 (라이브러리 방식)
 *
 * 실제 코드(Code.gs)는 "🎲TRPG Archive 엔진" 프로젝트 하나에만 있다.
 * 방 시트에는 이 짧은 코드만 두고, 라이브러리 TRPG(버전: HEAD 개발 모드)로 엔진을 불러 쓴다.
 * → 앞으로 업데이트는 엔진의 Code.gs만 바꿔 저장하면 모든 방(로비 포함)에 바로 적용된다. 방마다 붙이거나 다시 배포할 필요 없음.
 *
 * 처음 한 번만 (방마다):
 * 1) 이 시트의 Apps Script에서 원래 Code.gs 내용을 모두 지우고 이 코드를 붙인다.
 * 2) 왼쪽 "라이브러리 +" → 엔진의 스크립트 ID 붙여넣기 → 찾기 → 버전: HEAD(개발 모드) · ID: TRPG → 추가
 * 3) 아래 ROOM_PW_FIRST에 이 방의 비밀번호를 넣고(로비에서 개설했거나 🔑로 이미 바꿨으면 비워 두기) 저장
 * 4) 함수 선택에서 setup ▶ 실행 (권한 허용). 실행이 끝나면 ROOM_PW_FIRST는 다시 비워 둬도 된다.
 * 5) 배포 → 배포 관리 → 연필 → 버전: 새 버전 → 배포 (주소는 그대로)
 ****************************************************************/
const ROOM_PW_FIRST = '';   // 이 방 비밀번호 (setup 때 한 번 설정 탭에 들어간다. 비워 두면 건드리지 않음)

function doGet(e)    { return TRPG.doGet(e); }
function doPost(e)   { return TRPG.doPost(e); }
function tick()      { return TRPG.tick(); }
function tickMore()  { return TRPG.tickMore(); }
function setup()     { return TRPG.setup(ROOM_PW_FIRST); }
function fixTrigger(){ return TRPG.fixTrigger(); }
function selfTest()  { return TRPG.selfTest(); }
