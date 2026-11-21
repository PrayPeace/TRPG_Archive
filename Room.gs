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
function selfTestCore(){ return TRPG.selfTestCore(); }   // 비용·마스터 격리·요약 건너뛰기 규칙 점검 (AI 호출 없음)
function selfTestAi()  { return TRPG.selfTestAi(); }     // Claude·Deepgram 연결 점검
function lockProbe()   { return TRPG.lockProbe(40); }   // (PC 시험) 쓰기 잠금을 40초 잡기: 그동안 엔진 주소로 한 말이 기다리면 같은 잠금
// (선택) 엔진 하나로 돌리기: 이 방을 엔진에 등록하고, 이 방의 5분 트리거는 끈다(엔진의 tickAll이 대신 돈다).
// 실행 기록에 나오는 새 주소(엔진주소?room=…)를 로비에 넣으면 된다. 예전 주소도 그대로 열린다.
function hostThisRoom() {
  const r = TRPG.hostRoom(SpreadsheetApp.getActive().getId());
  if (r && r.ok) ScriptApp.getProjectTriggers().forEach(t => { const h = t.getHandlerFunction(); if (h === 'tick' || h === 'tickMore') ScriptApp.deleteTrigger(t); });
  return r;
}
// 엔진 방식을 그만두고 예전처럼 이 방이 직접 돌게 되돌린다
function unhostThisRoom() { TRPG.unhostRoom(SpreadsheetApp.getActive().getId()); TRPG.fixTrigger(); }
