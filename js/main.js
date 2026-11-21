/* TRPG Archive · 시작
 * 모든 js 파일은 index.html 아래에서 순서대로 읽고 이름(함수·변수)을 함께 쓴다. */
'use strict';
/* 입장 화면의 '저장된 방' 버튼 (방 목록 함수가 room.js에 있어서 여기서 만든다) */
(function(){ const box = $('jRooms'); const a = roomsGet(); if (!a.length) return; box.append(el('span', 'note', '저장된 방:'));
  a.forEach(r => { const b = el('button', '', r.name); b.onclick = () => { $('jUrl').value = r.url; $('jPw').value = r.pw || ''; if ($('jName').value.trim()) $('jGo').click(); else $('jName').focus(); }; box.append(b); }); })();

/* ── 시작 ── */
function start(){
  SS.set('t_in', cfg.url);
  $('join').classList.add('hide'); $('app').classList.remove('hide');
  { const c0 = thCached(cfg.url), r0 = (roomsGet().find(x => scriptUrl(x.url) === scriptUrl(cfg.url)) || {}); applyTheme((c0 && c0.rule) || r0.rule || 'etc', c0 && c0.t);
    if (SS.get('t_enter')) { SS.del('t_enter'); roomIntro(r0.name || ''); } }
  $('meName').textContent = cfg.name; $('sName').value = cfg.name; $('meDot').style.background = colorOf(cfg.name);
  if (!navigator.mediaDevices || !window.MediaRecorder) { micState('err', '받아쓰기 불가'); $('micInfo').textContent = '이 브라우저는 받아쓰기를 못 해요 (PC 크롬 권장)'; $('micBtn').disabled = true; }
  renderWho([]); drawSwatches();
  loadQueue(); otherRooms(); flush();
  pollOnce();
  keeperResume();
}
// 사이트에 들어오면 폰 화면 로비부터. 같은 탭에서 방에 있다가 새로고침한 경우만 그 방으로 바로 돌아간다
if (!HUB_FROM_LINK && cfg.url && cfg.pw && cfg.name && SS.get('t_in') === cfg.url) start();
else lobbyShow(false);
