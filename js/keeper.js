/* TRPG Archive · 마스터 도구와 마스터 전용 탭
 * 모든 js 파일은 index.html 아래에서 순서대로 읽고 이름(함수·변수)을 함께 쓴다. */
'use strict';
/* ── 마스터 ── */
function twoStep(btn, run){
  btn.onclick = async () => {
    if (btn.dataset.arm !== '1') { btn.dataset.arm = '1'; btn.textContent = '한 번 더 누르면 실행';
      setTimeout(() => { btn.dataset.arm = ''; btn.textContent = btn.dataset.label; }, 4000); return; }
    btn.dataset.arm = ''; btn.textContent = btn.dataset.label; btn.disabled = true;
    try { await run(); } finally { btn.disabled = false; }
  };
}
$('kCopyLink').onclick = () => copyText($('kCopyLink'), $('kLink').value);
async function keeperCall(body, busyText, okText){
  $('kOut').textContent = busyText; $('kOut').style.color = '';
  try {
    const r = await kpost(body);
    $('kOut').textContent = r.ok ? (okText ? okText(r) : (r.message || '완료')) : r.error;
    if (!r.ok || r.warning) $('kOut').style.color = '#ffb3ae';
    if (r.warning) $('kOut').textContent = (okText ? okText(r) : '') + ' ⚠ ' + r.warning;
  } catch (e) { $('kOut').textContent = '응답을 못 받았어요 (' + e.message + '). 요약 탭의 상태줄에서 결과를 확인해 주세요.'; $('kOut').style.color = '#ffb3ae'; }
  refreshData();
}
twoStep($('kSession'), () => keeperCall({ action: 'newSession' }, '이전 대화 정리 후 새 세션을 엽니다… (최대 3분)', r => { live.session = r.session; $('sessPill').textContent = '세션 ' + r.session; return '세션 ' + r.session + ' 시작'; }));
twoStep($('kClear'), () => keeperCall({ action: 'clearLog' }, '지우는 중…'));
twoStep($('kReset'), () => keeperCall({ action: 'resetAll' }, '초기화 중…'));
$('kDiag').onclick = async () => {
  const box = $('kDiagBox'); $('kDiag').disabled = true; box.textContent = '진단 중… (몇 초)';
  try {
    const r = await kpost({ action: 'diag' });
    if (!r.core) { box.textContent = r.error || '이 엔진은 아직 진단을 몰라요. 엔진에 새 Code.gs를 붙여 넣어 주세요'; return; }
    const i = r.info || {}, lt = i.lastTick;
    const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? '방금' : m + '분 전'; };
    const out = [(r.ok ? '✅ 핵심 규칙 모두 통과' : '❌ 핵심 규칙 실패 있음') + ' · 엔진 ' + r.ver + (r.ver !== APP_VER ? ' (화면 ' + APP_VER + '와 다름)' : ''),
      '대화 ' + i.lines + '줄 · 요약 끝난 곳 ' + i.processed + '줄' + (i.lines > i.processed ? ' (대기 ' + (i.lines - i.processed) + '줄)' : ''),
      '자동 정리 트리거 ' + (i.triggers < 0 ? '확인 불가' : i.triggers + '개' + (i.triggers === 1 ? '' : ' ⚠ setup 다시 실행 필요')),
      lt ? '마지막 자동 실행: ' + ago(lt.at) + ' · ' + (lt.what || '') + ' · ' + Math.round((lt.ms || 0) / 1000) + '초' : '마지막 자동 실행: 기록 없음 (6시간 안)',
      '정리 대기 ' + i.notesQ + '건 · 정리 실패 보관 ' + i.notesFail + '건'];
    if (i.pendingError) out.push('⚠ 요약이 막힌 이유: ' + i.pendingError);
    if (i.errors && i.errors.length) { out.push('최근 오류 (오류기록 탭 ' + i.errorRows + '줄):'); i.errors.forEach(e => out.push(' · ' + e[0].slice(5, 16) + ' ' + e[1] + ' — ' + e[3])); }
    (r.core || []).filter(x => /^FAIL/.test(x)).forEach(x => out.push(x));
    box.textContent = out.join('\n');
  } catch (e) { box.textContent = '진단 실패: ' + e.message; }
  finally { $('kDiag').disabled = false; }
};
$('kNfRetry').onclick = async () => { $('kNfRetry').disabled = true; const r = await kpost({ action: 'notesRetry' }); $('kNfRetry').disabled = false; $('kOut').textContent = r.ok ? r.message : r.error; refreshData(); };
$('kRuleSave').onclick = async () => { const r = await kpost({ action: 'setRule', rule: $('kRule').value }); $('kOut').textContent = r.ok ? r.message : r.error; refreshData(); };
function tokTable(title, list, tot){
  const w = el('div'); w.append(el('div', 'k', title));
  if (!list.length) { w.append(el('div', 'note', '아직 기록이 없어요')); return w; }
  const t = el('table', 'toktb'); const h = el('tr'); ['기능 · 모델', '횟수', '입력', '출력', '캐시 읽기'].forEach(x => h.append(el('th', '', x))); t.append(h);
  const f = n => Number(n || 0).toLocaleString();
  list.forEach(r => { const tr = el('tr'); [r.k, f(r.n), f(r.i), f(r.o), f(r.c)].forEach(x => tr.append(el('td', '', x))); t.append(tr); });
  const tr = el('tr', 'sum'); ['합계', f(tot[0]), f(tot[1]), f(tot[2]), f(tot[3])].forEach(x => tr.append(el('td', '', x))); t.append(tr);
  w.append(t); return w;
}
$('kTok').onclick = async () => {
  const b = $('kTok'), box = $('kTokBox'); b.disabled = true; b.textContent = '불러오는 중…';
  try {
    const r = await kpost({ action: 'tokenUsage' });
    box.innerHTML = '';
    if (!r.ok) box.append(el('div', 'note', r.error || '불러오지 못했어요'));
    else { box.append(tokTable('이번 세션 (세션 ' + r.session + ')', r.byS, r.tot.s), tokTable('최근 24시간', r.byD, r.tot.d)); box.append(el('div', 'note', '출력 토큰은 입력보다 값이 몇 배 비싸요. 캐시 읽기는 입력값의 1/10~1/20만 내요. 금액은 Anthropic 콘솔의 Usage·Cost 화면이 정확해요.')); }
  } catch (e) { box.textContent = '불러오지 못했어요 (' + e.message + ')'; }
  b.disabled = false; b.textContent = '불러오기';
};
$('roomPill').onclick = () => lobbyShow(true);
$('raGo').onclick = async () => {
  let raw = $('raUrl').value.trim(), pw = $('raPw').value.trim(), name = $('raName').value.trim();
  const m = raw.match(/#(.*)$/); if (m) { const h = new URLSearchParams(m[1]); if (h.get('s')) raw = h.get('s'); if (h.get('p') && !pw) pw = h.get('p'); }      // 초대 링크를 그대로 붙여 넣어도 된다
  const url = scriptUrl(raw);
  if (!url || !pw) { $('raMsg').textContent = '방 주소와 비밀번호를 채워 주세요'; return; }
  $('raMsg').textContent = '확인 중…';
  try {
    const r = await readCall(url, pw, 'ping');
    if (!r.ok) { $('raMsg').textContent = r.error || '들어갈 수 없는 방이에요 (비밀번호 확인)'; return; }
    const a = roomsGet().filter(x => scriptUrl(x.url) !== url);
    a.push({ name: name || r.title || ('방 ' + (a.length + 1)), named: !!name, url, pw }); roomsSet(a);
    $('raUrl').value = ''; $('raPw').value = ''; $('raName').value = '';
    $('raMsg').textContent = '✔ 추가했어요. 목록에서 "이 방으로"를 누르면 옮겨 가요'; renderRooms();
  } catch (e) { $('raMsg').textContent = '방 주소에 연결하지 못했어요. 웹 앱으로 배포했는지, 주소가 맞는지 확인해 주세요'; }
};
$('nrGo').onclick = async () => {
  const name = $('nrName').value.trim(); if (!name) { $('nrOut').textContent = '새 방 이름을 적어 주세요'; return; }
  const b = $('nrGo'); b.disabled = true; b.textContent = '만드는 중… (10~30초)'; $('nrOut').textContent = '';
  try {
    const r = await kpost({ action: 'newRoom', name, rule: $('nrRule').value });
    const o = $('nrOut'); o.innerHTML = '';
    if (!r.ok) o.textContent = r.error || '만들지 못했어요';
    else {
      o.append(el('div', '', '✔ ' + r.message));
      const steps = el('ol'); steps.style.cssText = 'margin:6px 0 0 18px;line-height:1.7';
      const a = el('a', '', '새 방 스프레드시트 열기'); a.href = r.url; a.target = '_blank'; a.rel = 'noopener';
      const li1 = el('li'); li1.append(a, ' → 메뉴 확장 프로그램 → Apps Script'); steps.append(li1);
      ['맨 위 4줄 확인: 키는 그대로 써도 되고, 방 비밀번호·키퍼 비밀번호는 새 멤버용으로 바꾸세요',
       '저장 후 함수 선택에서 setup ▶ 실행 (권한 허용). 룰은 "' + r.rule + '"로 정해져 있어요',
       '배포 → 새 배포 → 유형: 웹 앱 → 실행: 나 · 액세스: 모든 사용자 → 배포 → 웹 앱 주소 복사',
       '설정 탭 → 내 방 목록 → "+ 방 추가"에 그 주소와 새 방 비밀번호를 넣으면 끝 (새 멤버에게는 그 방의 초대 링크를 보내요)'].forEach(t => steps.append(el('li', '', t)));
      o.append(steps);
    }
  } catch (e) { $('nrOut').textContent = '응답을 못 받았어요 (' + e.message + '). 구글 드라이브에 "🎲TRPG Archive · ' + name + '" 같은 이름의 파일이 생겼는지 확인해 주세요'; }
  b.disabled = false; b.textContent = '새 방 만들기';
};
$('kNameSave').onclick = async () => { const r = await kpost({ action: 'keeperName', name: $('kName').value.trim() }); $('kOut').textContent = r.ok ? '마스터 이름 저장됨' : r.error; refreshData(); };
function drawMap(tabs, saved){
  const box = $('kMap'); box.innerHTML = '';
  tabs.forEach(t => {
    const s = (saved || []).find(m => m.tab === t);
    const row = el('div', 'row'); row.style.margin = '5px 0';
    const cb = el('input'); cb.type = 'checkbox'; cb.style.width = 'auto'; cb.checked = !!s; cb.dataset.tab = t;
    const nm = el('span', '', t); nm.style.minWidth = '130px'; nm.style.fontWeight = '600';
    const pl = el('input'); pl.placeholder = '플레이어 이름 (회의록 이름과 똑같이)'; pl.value = s ? s.player : ''; pl.className = 'grow';
    row.append(cb, nm, pl); box.append(row);
  });
  if (!tabs.length) box.append(el('div', 'note', '탭이 없어요'));
}
$('kTabs').onclick = async () => {
  $('kCharMsg').textContent = '탭 읽는 중…';
  const r = await kpost({ action: 'tabs', url: $('kCharUrl').value.trim() });
  if (!r.ok) { $('kCharMsg').textContent = r.error + ' (마스터 구글 계정이 열 수 있는 시트여야 해요)'; return; }
  const same = data && data.charUrl === $('kCharUrl').value.trim();
  drawMap(r.tabs, same ? data.charMap : []);
  $('kCharMsg').textContent = '캐릭터 탭에 체크하고 플레이어 이름을 적은 뒤 ' + (r.same ? '"플레이어에게 보일 카드 미리 보기" → 연결 저장' : '연결 저장') + (r.same ? ' · 이 주소는 이 앱의 저장용 시트라서, 앱이 쓰는 탭 ' + r.hidden + '개(설정·대화·키퍼자료 등)는 목록에서 뺐어요' : '') + ((r.blocked || []).length ? ' · 마스터 전용 내용이 섞일 수 있어 뺀 탭: ' + r.blocked.map(x => x.tab + ' (' + x.why + ')').join(' / ') : '');
};
function kCharMap(){ return [...$('kMap').querySelectorAll('.row')].map(r => { const i = r.querySelectorAll('input'); return i[0].checked ? { tab: i[0].dataset.tab, player: i[1].value.trim() } : null; }).filter(Boolean); }
$('kCharPrev').onclick = async () => {
  const map = kCharMap(), pb = $('kCharPrevBox'); pb.innerHTML = '';
  if (!map.length) { $('kCharMsg').textContent = '캐릭터 탭을 하나 이상 체크해 주세요'; return; }
  $('kCharMsg').textContent = '카드를 만들어 보는 중… (인원수 × 10초)'; $('kCharPrev').disabled = true;
  try {
    const r = await kpost({ action: 'charsPreview', url: $('kCharUrl').value.trim(), map });
    if (!r.ok) { $('kCharMsg').textContent = r.error; return; }
    $('kCharMsg').textContent = '미리 보기예요. 아직 저장·공개되지 않았어요. 내용을 확인한 뒤 "연결 저장"을 누르면 이 카드가 그대로 공개돼요 (30분 안에)';
    pb.append(el('div', 'kwarn', '아래 카드가 플레이어 모두에게 보이게 돼요. 마스터 전용 내용이 섞여 있지 않은지 확인하세요.'));
    r.items.forEach(it => {
      const dt = document.createElement('details'); dt.className = 'kcard';
      const sm = document.createElement('summary'); sm.textContent = it.tab + ' → ' + (it.player || '(플레이어 이름 없음)') + ' · AI에 보내는 글 ' + it.inputChars + '자 (눌러서 보기)'; dt.append(sm);
      const pre = el('div', 'note'); pre.style.whiteSpace = 'pre-wrap'; pre.textContent = it.input + (it.inputChars > it.input.length ? '\n⋯ (앞 ' + it.input.length + '자만 보여요)' : ''); dt.append(pre); pb.append(dt);
    });
    const cardBox = el('div', 'ids'); pb.append(cardBox);
    renderChars(r.items.map(it => Object.assign({}, it.card, { tab: it.tab, player: it.player })), cardBox, true);
  } catch (e) { $('kCharMsg').textContent = '미리 보기 실패: ' + e.message; }
  finally { $('kCharPrev').disabled = false; }
};
$('kCharSave').onclick = async () => {
  const map = kCharMap();
  if (!map.length) { $('kCharMsg').textContent = '캐릭터 탭을 하나 이상 체크해 주세요'; return; }
  $('kCharMsg').textContent = 'AI가 캐릭터시트를 읽는 중… (인원수 × 10초)';
  const r = await kpost({ action: 'chars', url: $('kCharUrl').value.trim(), map });
  $('kCharMsg').textContent = r.ok ? r.message : r.error; refreshData();
};
$('kCharRef').onclick = async () => { $('kCharMsg').textContent = '다시 읽는 중…'; const r = await kpost({ action: 'charsRefresh' }); $('kCharMsg').textContent = r.ok ? r.message : r.error; refreshData(); };
twoStep($('kCharOff'), async () => {
  $('kCharMsg').textContent = '연결 해제 중…'; const r = await kpost({ action: 'chars', url: '', map: [] });
  if (r.ok) { $('kCharUrl').value = ''; $('kMap').innerHTML = ''; } $('kCharMsg').textContent = r.ok ? r.message : r.error; refreshData();
});
$('kCharOff').dataset.label = '연결 해제';
$('imgGo').onclick = async () => {
  const f = $('imgFile').files[0]; if (!f) { $('imgMsg').textContent = '이미지를 골라 주세요'; return; }
  $('imgGo').disabled = true; $('imgMsg').textContent = '올리고 AI가 읽는 중… (20~40초)';
  try { const d64 = await shrink(f, 1568, 0.85); const r = await kpost({ action: 'image', data: d64, mime: 'image/jpeg', caption: $('imgCap').value.trim() });
    $('imgMsg').textContent = r.ok ? ('완료: ' + (r.title || '')) : r.error; if (r.ok) { $('imgFile').value = ''; $('imgCap').value = ''; refreshData(); } }
  catch (e) { $('imgMsg').textContent = '실패: ' + e.message; }
  $('imgGo').disabled = false;
};

/* ══════════════ 마스터 전용 탭 ══════════════
 * 이 탭의 내용은 마스터 로그인(12시간 토큰)이 있을 때만 서버에서 받아 온다.
 * 잠그면 받아 둔 자료와 화면을 모두 지운다. 받은 자료는 이 기기에 저장하지 않는다. */
/* K.epoch: 마스터를 잠그거나 회의록이 초기화될 때마다 1씩 오른다. 요청을 보낼 때의 값과 답이 왔을 때의 값이 다르면 그 답은 버린다.
 * K.rv / K.gen: 마지막으로 받은 회의록 번호(초기화번호)·시나리오 자료 번호. 바뀌면 그것으로 만든 화면 기억(초안·제안·통계)을 지운다. */
const K = { d: null, view: '', sess: '', digesting: false, stop: false, digestErr: '', epoch: 0, rv: null, gen: null,
  stats: {}, statsRv: {}, aw: {}, awMeta: {}, npcF: null, rollF: null, kbF: null, npcR: null, rollR: null, recapF: {}, ccf: null,
  boardFull: false, fbFull: false, upNote: '', uploading: false };
const APP_VER = '2026-11-21.21';            // 이 화면의 판. 서버(Code.gs)의 CODE_VER와 같아야 한다
const KVIEWS = [['board', '현황판'], ['npc', 'NPC 반응'], ['roll', '판정 보조'], ['kb', '시나리오 자료'], ['recap', '시작 카드'], ['awards', '시상식'], ['feedback', '피드백']];
const LEVELS = ['대성공', '극단적 성공', '어려운 성공', '성공', '실패', '대실패'];
const LEVEL_FIELD = { '대성공': 'extreme', '극단적 성공': 'extreme', '어려운 성공': 'hard', '성공': 'success', '실패': 'fail', '대실패': 'fumble' };
const SKILLS = ['관찰력', '듣기', '자료조사', '심리학', '설득', '말재주', '매혹', '위협', '은밀행동', '열쇠공', '손놀림', '추적', '응급처치', '의료', '정신분석', '오컬트', '역사', '회피', '근접전', '사격', '오르기', '도약', '수영', '이성', '행운', '지능', '교육'];
const KSEC = {
  npcs:   { title: 'NPC의 비밀', key: 'name', sub: x => [x.role, x.secret].filter(Boolean).join(' · '),
            fields: [{ key: 'name', label: '이름' }, { key: 'role', label: '겉으로 드러난 신분·역할' }, { key: 'secret', label: '숨기고 있는 것', type: 'area', rows: 3 }, { key: 'motive', label: '동기·목적', type: 'area', rows: 2 },
                     { key: 'lies', label: '플레이어에게 할 거짓말·둘러대는 말', type: 'area', rows: 2 }, { key: 'knows', label: '알고 있는 정보 (물으면 말해 줄 수 있는 것)', type: 'area', rows: 2 }, { key: 'attitude', label: '탐사자를 대하는 태도' }, { key: 'voice', label: '말투·버릇' }] },
  places: { title: '장소의 숨은 정보', key: 'name', sub: x => x.hidden,
            fields: [{ key: 'name', label: '장소' }, { key: 'hidden', label: '숨겨진 정보·위험·찾을 수 있는 것', type: 'area', rows: 4 }] },
  clues:  { title: '단서', key: 'text', sub: x => [x.where, x.how].filter(Boolean).join(' · '),
            fields: [{ key: 'text', label: '단서', type: 'area', rows: 2 }, { key: 'where', label: '어디서' }, { key: 'how', label: '어떻게 얻는지 (판정·행동)' }, { key: 'core', label: '진상에 다다르는 데 꼭 필요한 단서인가', type: 'select', options: ['예', '아니오'] }] },
  rolls:  { title: '판정별 정보', key: 'skill', sub: x => [x.where, x.success && '성공: ' + x.success].filter(Boolean).join(' · '),
            fields: [{ key: 'where', label: '어디서·무엇에' }, { key: 'skill', label: '기술' }, { key: 'success', label: '성공', type: 'area', rows: 2 }, { key: 'hard', label: '어려운 성공', type: 'area', rows: 2 },
                     { key: 'extreme', label: '극단적 성공·대성공', type: 'area', rows: 2 }, { key: 'fail', label: '실패', type: 'area', rows: 2 }, { key: 'fumble', label: '대실패', type: 'area', rows: 2 }] },
  scenes: { title: '장면 흐름', key: 'title', sub: x => x.summary,
            fields: [{ key: 'title', label: '장면' }, { key: 'summary', label: '내용', type: 'area', rows: 4 }] }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const uniq = a => a.filter((x, i) => x && a.indexOf(x) === i);

/* ── 로그인·잠금 ── */
function keeperShow(){
  $('kLock').classList.add('hide'); $('kMenu').classList.remove('hide'); $('imgUp').classList.remove('hide'); $('tabKeeper').classList.remove('hide');
  const id = /[?]room=/.test(cfg.url) ? null : (S.get('t_url') || '').match(/\/s\/([^/?#]+)/);      // 엔진 방식(?room=)이면 주소 전체를 싣는다
  $('kLink').value = location.origin + location.pathname + '#s=' + encodeURIComponent(id ? id[1] : (cfg.url || S.get('t_url') || '')) + '&p=' + encodeURIComponent(cfg.pw);
}
// 회의록(세션 기록)으로 만든 화면 기억을 지운다
function kForgetSession(){ K.stats = {}; K.statsRv = {}; K.aw = {}; K.awMeta = {}; K.recapF = {}; K.npcR = null; K.rollR = null; K.ccf = null; K.ccfMis = false; }
function keeperOff(msg){
  K.epoch++;                                                      // 이 뒤에 도착하는 마스터 답은 모두 버린다
  cfg.kt = ''; SS.del('t_kt'); S.del('t_kt'); S.del('t_kpw');
  kForgetSession();
  K.d = null; K.rv = null; K.gen = null; K.npcF = null; K.rollF = null; K.kbF = null; K.upNote = ''; K.digestErr = ''; K.stop = true;
  if (modalOnClose) closeModal();
  $('t-keeper').innerHTML = '';                                   // 받아 둔 마스터 자료를 화면에서도 지운다
  $('tabKeeper').classList.add('hide'); $('kMenu').classList.add('hide'); $('imgUp').classList.add('hide'); $('kLock').classList.remove('hide');
  $('kPw').value = ''; $('kMsg').textContent = msg || '';
  if (!$('t-keeper').classList.contains('hide')) showTab('set');
}
// 회의록이 초기화됐다 (이 탭에서 지웠든 다른 탭·다른 기기에서 지웠든): 그 회의록으로 만든 것을 버리고 새로 받는다
function keeperReset(){
  K.epoch++;
  kForgetSession();
  if (cfg.kt && K.d && $('kview')) kLoad();
}
async function keeperLogin(pw, remember){
  let r;
  try { r = await post({ action: 'klogin', kpw: pw }); } catch (e) { return '서버에 연결하지 못했어요'; }
  if (!r.ok) return (r.error || '마스터 비밀번호가 틀렸어요') + (r.left != null && r.left <= 5 ? ' · 앞으로 ' + r.left + '번 더 틀리면 10분 동안 잠겨요' : '');
  cfg.kt = r.kt; SS.set('t_kt', r.kt);
  if (remember) S.set('t_kt', r.kt); else S.del('t_kt');
  keeperShow();
  return r.weak ? '로그인했어요 · ⚠ 마스터 비밀번호가 10자보다 짧아요. 10자 이상으로 바꾸는 것을 권해요' : '';
}
async function keeperLock(all){
  const kt = cfg.kt;
  keeperOff('마스터를 잠갔어요');
  try { await post({ action: 'klogout', kt, all: !!all }); } catch (_) {}
}
$('kGo').onclick = async () => {
  const pw = $('kPw').value; if (!pw) return;
  $('kMsg').textContent = '확인 중…'; $('kGo').disabled = true;
  const err = await keeperLogin(pw, $('kRemember').checked);
  $('kGo').disabled = false; $('kPw').value = ''; $('kMsg').textContent = err; $('kOut').textContent = cfg.kt ? err : '';
};
$('kPw').onkeydown = e => { if (e.key === 'Enter') $('kGo').click(); };
$('kLock2').onclick = () => keeperLock(false);
async function keeperResume(){
  // 예전 버전이 이 기기에 저장해 둔 마스터 비밀번호는 지운다. 유효한 로그인이 없을 때만 로그인 요청에 한 번 쓰고, 그 뒤로는 어디에도 두지 않는다.
  const old = S.get('t_kpw'); S.del('t_kpw');
  if (cfg.kt) {
    try { const r = await post({ action: 'kping', kt: cfg.kt }); if (r.ok && r.keeper) { keeperShow(); return; } } catch (_) { return; }
    keeperOff('');
  }
  if (old) await keeperLogin(old, false);
}

/* ── 공통 부품 ── */
function kH(title, note){ const h = el('div', 'kh'); h.append(el('h3', '', title)); if (note) h.append(el('span', 'note', note)); return h; }
function kWrap(label, node, cls){ const w = el('div', cls || ''); w.append(el('label', '', label), node); return w; }
function kInput(val, ph, on, listId){ const i = el('input'); i.value = val || ''; if (ph) i.placeholder = ph; if (listId) i.setAttribute('list', listId); i.oninput = () => on(i.value); return i; }
function kArea(val, rows, ph, on){ const i = el('textarea'); i.rows = rows; i.value = val || ''; if (ph) i.placeholder = ph; i.oninput = () => on(i.value); return i; }
function kSelect(val, options, on){
  const s = el('select');
  options.forEach(o => { const v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; const op = el('option', '', l); op.value = v; s.append(op); });
  s.value = val == null ? '' : val; s.onchange = () => on(s.value); return s;
}
function kCheck(val, label, on){ const l = el('label'); l.style.cssText = 'display:flex;gap:8px;align-items:center;font-weight:500;margin:0'; const c = el('input'); c.type = 'checkbox'; c.style.width = 'auto'; c.checked = !!val; c.onchange = () => on(c.checked); l.append(c, label); return l; }
function kDatalist(id, items){ const d = el('datalist'); d.id = id; uniq(items).forEach(x => { const o = el('option'); o.value = x; d.append(o); }); return d; }
function kKV(parent, label, value, cls){ if (!value) return; parent.append(el('div', 'kk', label)); const v = el('div', 'kv2' + (cls ? ' ' + cls : ''), value); parent.append(v); return v; }
function kEmpty(text){ return el('div', 'empty', text); }
// 버튼을 잠그고 마스터 요청을 보낸다. 실패하면 msg 칸에 이유를 적는다.
// stale: 서버가 "기다리는 사이 기록이 지워져서 버렸다"고 한 답. 화면 기억에 넣지 않고, 지금 상태를 새로 받는다.
async function kDo(btn, busy, body, msg){
  const label = btn.textContent; btn.disabled = true; btn.textContent = busy;
  if (msg) { msg.textContent = ''; msg.className = 'note'; }
  let r;
  try { r = await kpost(body); } catch (e) { r = { ok: false, error: '응답을 받지 못했어요 (' + e.message + '). 서버에서는 끝났을 수도 있으니, 잠시 뒤 "새로 고침"을 눌러 확인한 다음 다시 시도해 주세요' }; }
  btn.disabled = false; btn.textContent = label;
  if (!r.ok && msg) { msg.textContent = r.error || '실패'; msg.className = 'note kerr'; }
  if (r.stale) { toast(r.error || '지워진 기록으로 만든 결과라서 버렸어요'); if (!r.late && cfg.kt) kLoad(); }
  return r;
}
function kSessSel(){
  const list = (K.d.sessions || []).map(x => x.session);
  if (list.indexOf(K.d.session) < 0) list.push(K.d.session);
  if (list.indexOf(K.sess) < 0) K.sess = K.d.session;
  return kSelect(K.sess, list.sort((a, b) => Number(b) - Number(a)).map(x => [x, '세션 ' + x]), v => { K.sess = v; kRender(); });
}
const charOf = player => { const c = ((data && data.characters) || []).find(x => x.player === player); return c ? (c.name || c.tab) : ''; };
const withChar = player => { const c = charOf(player); return c ? player + ' (' + c + ')' : player; };

/* ── 탭 열기·자료 받기 ── */
async function kLoad(){
  let r;
  try { r = await kpost({ action: 'kData' }); } catch (e) { toast('마스터 자료를 못 받아 왔어요: ' + e.message); return false; }
  if (!r.ok) { if (!r.kexp && !r.late) toast(r.error || '마스터 자료를 못 받아 왔어요'); return false; }
  // 다른 탭·다른 기기에서 지웠을 수도 있다: 번호가 바뀌었으면 그것으로 만든 화면 기억을 버린다
  if (K.rv != null && r.resetVer !== K.rv) kForgetSession();
  if (K.gen != null && r.kbGen !== K.gen) { K.npcR = null; K.rollR = null; }
  K.rv = r.resetVer; K.gen = r.kbGen;
  K.d = r; if (!K.sess) K.sess = r.session;
  if (!K.view) K.view = (r.kb.clues.length || r.kb.truth) ? 'board' : 'kb';
  kRender();
  return true;
}
async function kOpen(){
  const host = $('t-keeper');
  if (!host.firstChild) {
    host.append($('keeperTpl').content.cloneNode(true));
    $('kReload').onclick = () => kLoad();
    $('kLockBtn').onclick = () => keeperLock(false);
    $('kview').append(kEmpty('마스터 자료를 받아 오는 중…'));
  }
  await kLoad();
}
function kRender(){
  if (!K.d || !$('kview')) return;
  if ($('kWeak')) $('kWeak').classList.toggle('hide', !K.d.weak);
  if ($('kVer')) { const diff = K.d.code !== APP_VER; $('kVer').classList.toggle('hide', !diff); if (diff) $('kVer').textContent = '⚠ 화면과 서버의 판이 달라요 (화면 ' + APP_VER + ' / 서버 ' + (K.d.code || '예전 판') + '). Code.gs를 새 버전으로 다시 배포했는지, 이 페이지를 새로 고쳤는지 확인해 주세요. 판이 다르면 일부 마스터 기능이 동작하지 않을 수 있어요.'; }
  const nav = $('ktabs'); nav.innerHTML = '';
  KVIEWS.forEach(([k, label]) => { const b = el('button', K.view === k ? 'act' : '', label); b.dataset.k = k; b.onclick = () => { K.view = k; kRender(); }; nav.append(b); });
  const box = $('kview'); box.innerHTML = '';
  ({ board: kvBoard, npc: kvNpc, roll: kvRoll, kb: kvKb, recap: kvRecap, awards: kvAwards, feedback: kvFeedback })[K.view](box);
}

/* ── 현황판 ── */
function kvBoard(box){
  const kb = K.d.kb, log = K.d.board, b = log && log.result;
  if (!kb.clues.length && !kb.truth) {
    box.append(kEmpty('아직 시나리오 자료가 없어요. "시나리오 자료"에서 시나리오 PDF나 진상 문서를 올리면, 여기에 단서를 어디까지 찾았는지가 나와요.'));
    const go = el('button', 'pri', '시나리오 자료 올리러 가기'); go.onclick = () => { K.view = 'kb'; kRender(); }; box.append(go);
    return;
  }
  const top = el('div', 'row'); const btn = el('button', 'pri', '현황 갱신 (AI 호출 1번)'); const msg = el('span', 'note');
  top.append(btn, kCheck(K.boardFull, '진상 전체도 AI에 보내기 (토큰이 많이 들어요 · 한 번 쓰면 다시 꺼져요)', v => { K.boardFull = v; }), msg);
  btn.onclick = async () => { const r = await kDo(btn, 'AI가 비교하는 중…', { action: 'kBoard', full: K.boardFull }, msg); K.boardFull = false; if (r.ok) kLoad(); else kRender(); };
  box.append(top);
  const nNpc = kb.npcs.filter(n => n.secret || n.lies).length;
  box.append(el('div', 'ksent', 'AI에 보내는 자료: 단서 목록 ' + kb.clues.length + '개 · NPC의 비밀·거짓말 ' + nNpc + '명 · 공개 기록(누적 줄거리·플레이어 쪽 단서·최근 요약 8개). "사건의 진상" 글 전체는 위 칸을 켰을 때만 보내요. 끄면 "잘못 짚고 있는 것" 판단이 덜 정확할 수 있어요.'));
  if (b) box.append(el('div', 'ksent', '지금 보이는 현황: ' + String(log.at).slice(5, 16) + ' 갱신 · 요약된 ' + b.basis.processedId + '줄 기준' + (b.basis.total > b.basis.processedId ? ' (그때 요약 전 ' + (b.basis.total - b.basis.processedId) + '줄)' : '') +
    ' · 만들 때 보낸 것: ' + (b.sent ? '단서 ' + b.sent.clues + '개, NPC ' + b.sent.npcs + '명, 진상 전체 ' + (b.sent.truth ? '포함' : '미포함') : '예전 버전에서 만든 것이라 진상 전체가 포함됐어요')));
  else box.append(el('div', 'ksent', '아직 갱신한 적 없어요.'));
  if (b && b.next) { const q = el('div', 'quote'); q.textContent = '👉 ' + b.next; box.append(q); }

  const st = {}; ((b && b.clues) || []).forEach(c => { st[c.id] = c; });
  const stOf = c => c.mark || (st[c.id] ? st[c.id].status : 'none');
  const rank = { unfound: 0, partial: 1, none: 2, found: 3 };
  const clues = kb.clues.slice().sort((x, y) => (Number(!!y.core) - Number(!!x.core)) || (rank[stOf(x)] - rank[stOf(y)]));
  const core = clues.filter(c => c.core);
  box.append(kH('단서', '핵심 ' + core.length + '개 중 ' + core.filter(c => stOf(c) === 'found').length + '개 찾음 · 전체 ' + clues.length + '개'));
  if (!clues.length) box.append(kEmpty('정리본에 단서가 없어요'));
  const LBL = { found: '찾음', partial: '일부', unfound: '아직', none: '미확인' };
  clues.forEach(c => {
    const s = stOf(c), card = el('div', 'kcard');
    const head = el('div', 'row'); head.append(el('span', 'kst ' + s, LBL[s] + (c.mark ? ' ✎' : '')));
    if (c.core) head.append(el('span', 'tag', '핵심'));
    const t = el('b', 'ttl', c.text); t.style.flex = '1'; head.append(t);
    [['found', '찾음'], ['unfound', '아직'], ['', 'AI 판단대로']].forEach(([m, l]) => {
      const x = el('button', 'icon', l); if ((c.mark || '') === m) x.style.color = 'var(--gold2)';
      x.onclick = async () => { const r = await kpost({ action: 'kClueMark', id: c.id, mark: m, gen: K.gen }); if (r.ok) { c.mark = m; kRender(); } else { toast(r.error); if (r.stale && !r.late) kLoad(); } };
      head.append(x);
    });
    card.append(head);
    const sub = [c.where && '어디서: ' + c.where, c.how && '어떻게: ' + c.how].filter(Boolean).join(' · ');
    if (sub) card.append(el('div', 'note', sub));
    if (st[c.id] && st[c.id].note) card.append(el('div', 'note', 'AI: ' + st[c.id].note));
    box.append(card);
  });
  if (b && b.wrong.length) { box.append(kH('플레이어가 잘못 짚고 있는 것')); b.wrong.forEach(w => { const c = el('div', 'kcard'); c.append(el('div', '', w.text)); if (w.why) c.append(el('div', 'note', '실제: ' + w.why)); box.append(c); }); }
  if (b && b.lies.length) {
    box.append(kH('NPC의 주장과 실제', '공개 기록에 남은 주장을 마스터 자료와 견준 결과 (AI 판단)'));
    b.lies.forEach(l => { const c = el('div', 'kcard'); const h = el('div', 'row'); h.append(el('span', 'kst ' + (l.verdict === '거짓' ? 'unfound' : l.verdict === '참' ? 'found' : 'partial'), l.verdict || '불명'), el('b', '', l.npc)); c.append(h, el('div', '', l.claim)); if (l.truth) c.append(el('div', 'note', '실제: ' + l.truth)); box.append(c); });
  }
  if (b && b.hints.length) { box.append(kH('막혔을 때 줄 만한 힌트')); b.hints.forEach(h => box.append(el('div', 'kcard', '💡 ' + h))); }
  const claims = ((data && data.notes && data.notes.clues) || []).filter(c => c.kind === '주장');
  if (claims.length) { box.append(kH('플레이어 기록에 남은 NPC 주장', claims.length + '개 · AI 없이 그대로')); claims.slice(-12).forEach(c => box.append(el('div', 'kcard', c.text))); }
}

/* ── NPC 반응 ── */
function kvNpc(box){
  const kb = K.d.kb, f = K.npcF || (K.npcF = { npc: '', place: '', situation: '', skill: '', level: '', full: false });
  const pubN = ((data && data.notes && data.notes.npcs) || []).map(x => x.name), pubP = ((data && data.notes && data.notes.places) || []).map(x => x.name);
  box.append(kDatalist('klNpc', kb.npcs.map(x => x.name).concat(pubN)), kDatalist('klPlace', kb.places.map(x => x.name).concat(pubP)), kDatalist('klSkill', SKILLS.concat(kb.rolls.map(x => x.skill))));
  const g = el('div', 'kgrid'); const cardBox = el('div', 'wide');
  const drawCard = () => {
    cardBox.innerHTML = '';
    const n = kb.npcs.find(x => String(x.name).replace(/\s+/g, '') === f.npc.replace(/\s+/g, ''));
    if (!f.npc) return;
    const c = el('div', 'kcard sec');
    if (!n) { c.append(el('div', 'note', '"' + f.npc + '"은(는) 시나리오 정리본에 없는 NPC예요. 공개 기록과 방금 대화만 보고 제안해요.')); cardBox.append(c); return; }
    c.append(el('b', 'ttl', '🔒 ' + n.name + (n.role ? ' · ' + n.role : '')));
    kKV(c, '숨기는 것', n.secret); kKV(c, '동기', n.motive); kKV(c, '할 거짓말', n.lies); kKV(c, '아는 정보', n.knows); kKV(c, '태도', n.attitude); kKV(c, '말투', n.voice);
    cardBox.append(c);
  };
  g.append(kWrap('NPC', kInput(f.npc, '이름을 고르거나 적기', v => { f.npc = v.trim(); drawCard(); }, 'klNpc')),
    kWrap('장소 (선택)', kInput(f.place, '예: 서재', v => { f.place = v.trim(); }, 'klPlace')),
    kWrap('지금 상황 (플레이어가 무엇을 묻거나 했는지)', kArea(f.situation, 3, '예: 프레이피스가 그날 밤 어디 있었냐고 추궁한다', v => { f.situation = v; }), 'wide'),
    kWrap('판정 기술 (선택)', kInput(f.skill, '예: 심리학', v => { f.skill = v.trim(); }, 'klSkill')),
    kWrap('판정 결과 (선택)', kSelect(f.level, [['', '없음']].concat(LEVELS), v => { f.level = v; })));
  box.append(g);
  const row = el('div', 'row'); row.style.margin = '12px 0'; const btn = el('button', 'pri', '반응 제안 받기'); const msg = el('span', 'note');
  row.append(btn, kCheck(f.full, '진상 전체도 AI에 주기 (기본은 이 NPC·장소와 관계있는 부분만) (토큰이 많이 들어요 · 한 번 쓰면 다시 꺼져요)', v => { f.full = v; }), msg);
  btn.onclick = async () => {
    const r = await kDo(btn, 'AI가 생각하는 중… (10~30초)', { action: 'kNpc', npc: f.npc, place: f.place, situation: f.situation, skill: f.skill, level: f.level, full: f.full }, msg);
    f.full = false; if (!r.ok) kRender();
    if (r.ok) { K.npcR = { name: f.npc, result: r.result, used: r.used }; await kLoad(); }
  };
  box.append(row, el('div', 'ksent', 'AI 호출 1번. 보내는 자료: 이 NPC의 비공개 설정 · 이름이 겹치는 관계 자료(장소·단서·판정·다른 NPC) · 공개 기록의 NPC 주장 · 방금 대화 30줄. "사건의 진상" 글 전체는 위 칸을 켰을 때만 보내요.'), cardBox); drawCard();
  const out = el('div'); box.append(out);
  const show = (name, res, used, when) => {
    out.innerHTML = '';
    out.append(kH('제안 · ' + name, when ? String(when).slice(11, 16) + '에 받은 제안' : (used ? (used.inKb ? '정리본의 설정 사용' : '정리본에 없는 NPC') + ' · 관계있는 자료 ' + used.related + '개' + (used.full ? ' · 진상 전체 포함' : '') : '')));
    const c = el('div', 'kcard');
    if (res.warn) { const w = el('div', 'note kerr', '⚠ ' + res.warn); w.style.marginBottom = '6px'; c.append(w); }
    (res.lines || []).forEach(l => { const ln = el('div', 'kline'); ln.append(el('div', 'say', '“' + l + '”')); const cp = el('button', 'icon', '복사'); cp.onclick = () => copyText(cp, l); ln.append(cp); c.append(ln); });
    kKV(c, '표정·몸짓', res.expression); kKV(c, '속마음 (마스터만)', res.inner); kKV(c, '이번에 드러내도 되는 것', res.reveal); kKV(c, '계속 숨길 것', res.hide); kKV(c, '이전 주장과의 일관성', res.consistency);
    out.append(c);
  };
  if (K.npcR) show(K.npcR.name, K.npcR.result, K.npcR.used);
  if ((K.d.npcLog || []).length) {
    box.append(kH('지난 제안', '눌러서 다시 보기'));
    K.d.npcLog.forEach(l => { if (!l.result) return; const c = el('div', 'kcard pick'); c.append(el('b', '', l.title + '  '), el('span', 'note', String(l.at).slice(11, 16) + ' · ' + String((l.input && l.input.situation) || '').slice(0, 60))); c.onclick = () => { show(l.title, l.result, null, l.at); out.scrollIntoView({ block: 'nearest' }); }; box.append(c); });
  }
}

/* ── 판정 보조 ──
 * 화면에 나오는 것은 세 종류이고 서로 다른 딱지를 붙인다.
 *   [AI 정리본]  AI가 시나리오를 읽고 만든 정리 (원문 그대로가 아니다). 마스터가 고친 항목은 [마스터가 고침]
 *   [원문 그대로] 올린 자료에서 글자 그대로 잘라 온 대목 (파일 이름·쪽 번호 표시)
 *   [AI 제안]    지금 새로 만든 제안 ("AI 제안도 받기"를 눌렀을 때만) */
function kvRoll(box){
  const kb = K.d.kb, f = K.rollF || (K.rollF = { skill: '', level: '성공', place: '', text: '', full: false });
  const pubP = ((data && data.notes && data.notes.places) || []).map(x => x.name);
  box.append(kDatalist('klPlace2', kb.places.map(x => x.name).concat(pubP)), kDatalist('klSkill2', kb.rolls.map(x => x.skill).concat(SKILLS)));
  const g = el('div', 'kgrid');
  g.append(kWrap('기술', kInput(f.skill, '예: 자료조사', v => { f.skill = v.trim(); }, 'klSkill2')), kWrap('결과', kSelect(f.level, LEVELS, v => { f.level = v; })),
    kWrap('장소 (선택)', kInput(f.place, '예: 서재', v => { f.place = v.trim(); }, 'klPlace2')), kWrap('상황 메모 (선택, AI 제안에 쓰여요)', kInput(f.text, '예: 책장을 뒤진다', v => { f.text = v; })));
  box.append(g);
  const row = el('div', 'row'); row.style.margin = '12px 0 4px'; const b1 = el('button', 'pri', '시나리오에서 찾기 (AI 호출 0번)'); const b2 = el('button', '', 'AI 제안도 받기 (AI 호출 1번)'); const msg = el('span', 'note');
  const run = async (btn, ai) => { const r = await kDo(btn, ai ? 'AI가 생각하는 중…' : '찾는 중…', { action: 'kRoll', skill: f.skill, level: f.level, place: f.place, text: f.text, ai, full: ai && f.full }, msg); if (ai) f.full = false; if (r.ok) K.rollR = Object.assign({ skill: f.skill, place: f.place }, r); kRender(); };
  b1.onclick = () => run(b1, false); b2.onclick = () => run(b2, true);
  const fullCk = kCheck(f.full, 'AI 제안에 진상 전체 포함 (토큰이 많이 들어요 · 한 번 쓰면 다시 꺼져요)', v => { f.full = v; }); fullCk.id = 'kRollFull';
  row.append(b1, b2, fullCk, msg); box.append(row);
  box.append(el('div', 'ksent', '"시나리오에서 찾기"는 정리본과 올린 원문에서 찾기만 하고 AI에는 아무것도 보내지 않아요. "AI 제안도 받기"는 찾은 판정·원문 대목, 장소와 이름이 겹치는 관계 자료, 방금 대화 20줄을 보내요. "사건의 진상" 글 전체는 위 칸을 켰을 때만 함께 보내요.'));
  const r = K.rollR; if (!r) { box.append(el('div', 'note', '먼저 시나리오에 적힌 내용을 확인하고, 시나리오에 없을 때만 AI 제안을 참고하세요.')); return; }
  const srcTag = (cls, t) => el('span', 'ksrc ' + cls, t);

  // ① AI 정리본
  const h1 = kH('정리본의 판정 · ' + r.skill + (r.level ? ' · ' + r.level : ''), 'AI가 시나리오를 읽고 정리한 것이에요. 원문 그대로가 아니니 중요한 판정은 아래 원문도 확인하세요'); box.append(h1);
  if (r.otherPlace) {
    const places = uniq(r.written.map(w => w.where || '(장소가 적혀 있지 않음)'));
    const w = el('div', 'kwarn2'); w.id = 'kOtherPlace';
    w.append(el('b', '', '⚠ "' + r.place + '"에서 하는 ' + r.skill + ' 판정은 정리본에 없어요. '), '아래는 다른 장소의 같은 기술 판정이에요: ', el('b', '', places.join(', ')), '. 이 장소에 그대로 쓰지 마세요.');
    box.append(w);
  }
  if (!r.written.length) box.append(kEmpty('정리본에는 이 판정이 없어요.'));
  r.written.forEach(w => {
    const c = el('div', 'kcard'); const head = el('div');
    head.append(w.locked ? srcTag('hand', '마스터가 고침') : srcTag('digest', 'AI 정리본'));
    if (w.otherPlace) { const t = el('b', 'ttl kerr', '다른 장소: ' + (w.where || '(장소 미상)')); head.append(t, ' · ' + w.skill); }
    else head.append(el('b', 'ttl', (w.where ? w.where + ' · ' : '') + w.skill));
    c.append(head);
    const tb = el('table', 'rtable'); const hit = LEVEL_FIELD[r.level];
    [['success', '성공'], ['hard', '어려운 성공'], ['extreme', '극단적 성공·대성공'], ['fail', '실패'], ['fumble', '대실패']].forEach(([k, l]) => { if (!w[k]) return; const tr = el('tr', k === hit ? 'hit' : ''); tr.append(el('th', '', l), el('td', '', w[k])); tb.append(tr); });
    if (tb.children.length) c.append(tb); else c.append(el('div', 'note', '결과별 내용은 적혀 있지 않아요'));
    if (hit && !w[hit] && tb.children.length) c.append(el('div', 'note', '이 결과(' + r.level + ')에 해당하는 칸은 정리본에 없어요.'));
    box.append(c);
  });

  // ② 원문 그대로
  box.append(kH('원문 그대로', r.excerpts.length ? '올린 자료에서 "' + r.skill + '"이(가) 나오는 대목을 글자 그대로 잘라 온 것' : ''));
  if (!r.excerpts.length) box.append(kEmpty('올린 원문에 "' + r.skill + '"이(가) 나오는 곳이 없어요.'));
  r.excerpts.forEach(e => {
    const c = el('div', 'kcard'); const head = el('div', 'note');
    head.append(srcTag('raw', '원문 그대로'), '📄 ' + e.source + ' · ' + (e.page != null ? 'PDF의 ' + e.page + '번째 쪽' : '쪽 번호 정보 없음') + ' · 조각 ' + (e.part != null ? e.part : e.n));
    if (r.place) head.append(' · ' + (e.place === 'near' ? '"' + r.place + '"이(가) 같은 대목에 나옴' : e.place === 'part' ? '"' + r.place + '"은(는) 같은 조각의 다른 곳에만 나옴' : '⚠ "' + r.place + '"이(가) 근처에 없음 (다른 장소의 판정일 수 있어요)'));
    c.append(head); const t = el('div', 'kv2', e.text); c.append(t); box.append(c);
  });

  // ③ AI 제안
  if (r.ai) {
    box.append(kH('AI 제안', '방금 새로 만든 것이에요 (시나리오에 적힌 글이 아님)'));
    const c = el('div', 'kcard sec'); const head = el('div');
    head.append(srcTag('ai', 'AI 제안'), el('span', 'note', r.ai.basis === 'scenario' ? '위 정리본·원문의 판정 결과를 따라 정리했다고 AI가 표시함' : '시나리오에 해당 판정이 없어서 AI가 새로 제안함'));
    c.append(head);
    if (r.ai.basis !== 'scenario') { const w = el('div', 'note kerr', '⚠ 시나리오에 없어서 AI가 제안한 내용이에요. 그대로 쓰기 전에 진상과 맞는지 확인하세요.'); c.append(w); }
    kKV(c, '줄 정보', r.ai.give); kKV(c, '읽어 줄 묘사', r.ai.flavor); kKV(c, '아직 주지 말 것', r.ai.hold); kKV(c, '실패했을 때 다른 길', r.ai.alt);
    box.append(c);
  }
  if (r.sent) box.append(el('div', 'ksent', r.sent.ai ? '이 제안을 만들 때 AI에 보낸 것: 정리본 판정 ' + r.sent.written + '개 · 원문 대목 ' + r.sent.excerpts + '개 · 관계 자료 ' + r.sent.related + '개 · 진상 전체 ' + (r.sent.full ? '포함' : '미포함') : '이번에는 AI를 부르지 않았어요 (보낸 자료 없음).'));
}

/* ── 시나리오 자료 ── */
/* PDF 읽기 도구(pdf.js)는 PDF를 올릴 때만 불러온다.
 *  - 버전 4.10.38을 쓴다. 3.11.174는 조작된 PDF로 스크립트가 실행될 수 있는 결함(CVE-2024-4367, 4.2.67에서 고쳐짐) 범위에 있었다.
 *    5.6.83~6.2.107은 다른 결함(CVE-2026-16633) 범위라서 고르지 않았다.
 *  - 본체와 작업용 스크립트(같은 버전)를 해시(integrity)를 확인하며 받아서, 이 페이지 안의 주소(blob)로 실행한다. 파일이 바뀌어 있으면 실행되지 않는다.
 *  - 넓은 범위의 브라우저에서 돌도록 legacy 빌드를 쓴다. 글꼴 속 코드를 실행하는 기능은 끈다(isEvalSupported:false).
 *  - 한글 글자표(cmaps)와 기본 글꼴(standard_fonts)은 같은 버전 폴더에서 필요할 때 받는다 (실행되는 코드가 아니라 자료 파일). */
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/';
const PDFJS_SRI = 'sha384-z/XbAtvhBXJoK+yvYimnFuTCF6/2wTCDSIFD09/HtIfwFtvDKOMdAe5Z3wOChkmW';          // legacy/build/pdf.min.mjs
const PDFJS_WORKER_SRI = 'sha384-vbNBYP03jHFPlgtK4qSXtazEmGfmpTWlSsfq9OiU20MroW/Q9TbaEXiM7PpeWg+6';   // legacy/build/pdf.worker.min.mjs
let pdfReady = null;
function loadPdfJs(){
  return pdfReady || (pdfReady = (async () => {
    try {
      const grab = async (path, sri) => {
        let r;
        try { r = await fetch(PDFJS + path, { integrity: sri, mode: 'cors', credentials: 'omit' }); }
        catch (e) { throw new Error('PDF 읽기 도구를 불러오지 못했어요 (인터넷 연결을 확인해 주세요. 받은 파일이 정해 둔 것과 다를 때도 이 오류가 나요)'); }
        if (!r.ok) throw new Error('PDF 읽기 도구를 불러오지 못했어요 (' + r.status + ')');
        return URL.createObjectURL(new Blob([await r.arrayBuffer()], { type: 'text/javascript' }));
      };
      const urls = await Promise.all([grab('legacy/build/pdf.min.mjs', PDFJS_SRI), grab('legacy/build/pdf.worker.min.mjs', PDFJS_WORKER_SRI)]);
      const lib = await import(urls[0]);
      if (lib.version !== '4.10.38') throw new Error('PDF 읽기 도구의 버전이 예상과 달라요 (' + lib.version + ')');
      lib.GlobalWorkerOptions.workerSrc = urls[1];
      return lib;
    } catch (e) { pdfReady = null; throw e; }
  })());
}
/* PDF에서 글자를 뽑는다 (이 기기 안에서만 처리).
 * 쪽마다 따로 본다: 글자가 거의 없는데(빈칸 빼고 40자 미만) 그림이 있는 쪽 = "그림 쪽"(scan). 글자 쪽과 그림 쪽이 섞인 PDF도 쪽별로 나뉜다. */
async function pdfExtract(file, prog){
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer(), cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, standardFontDataUrl: PDFJS + 'standard_fonts/', isEvalSupported: false, enableXfa: false }).promise;
  const IMG = ['paintImageXObject', 'paintInlineImageXObject', 'paintImageXObjectRepeat', 'paintImageMaskXObject', 'paintJpegXObject'].map(k => lib.OPS[k]).filter(x => x != null);
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i), tc = await page.getTextContent();
    let s = '';
    tc.items.forEach(it => { if (typeof it.str !== 'string') return; s += it.str; if (it.hasEOL) s += '\n'; });
    s = s.replace(/[ \t]+\n/g, '\n').trim();
    const chars = s.replace(/\s/g, '').length;
    let image = false;
    if (chars < 40) { try { const ops = await page.getOperatorList(); image = ops.fnArray.some(fn => IMG.indexOf(fn) >= 0); } catch (e) { image = true; } }
    pages.push({ n: i, text: s, chars, scan: chars < 40 && image });
    prog('PDF 읽는 중 ' + i + '/' + doc.numPages + '쪽');
  }
  return { doc, pages };
}
async function pdfCanvas(doc, n, maxSide){
  const page = await doc.getPage(n), v0 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: Math.min(2, maxSide / Math.max(v0.width, v0.height)) });
  const cv = document.createElement('canvas'); cv.width = Math.round(vp.width); cv.height = Math.round(vp.height);
  await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  return cv;
}
// 고른 쪽만 그림으로 AI에게 보내 글자로 옮긴다 (쪽마다 AI 호출 1번). 중간에 멈추거나 실패해도 그때까지 읽은 쪽은 돌려준다.
async function pdfOcrPages(doc, nums, prog){
  const got = {}, failed = []; let calls = 0, error = '';
  for (let k = 0; k < nums.length; k++) {
    const n = nums[k];
    if (K.stop || !cfg.kt) { failed.push(...nums.slice(k)); error = '멈춤'; break; }
    prog('그림 쪽을 AI가 읽는 중 ' + (k + 1) + '/' + nums.length + ' (' + n + '쪽)');
    let r = null;
    try {
      const cv = await pdfCanvas(doc, n, 1500), data = cv.toDataURL('image/jpeg', 0.8).split(',')[1];
      for (let t = 0; t < 2; t++) {                        // 한 번은 다시 해 본다
        calls++;
        try { r = await kpost({ action: 'kOcr', data, mime: 'image/jpeg' }); } catch (e) { r = { ok: false, error: '응답을 받지 못했어요' }; }
        if (r.ok || r.kexp || r.stale) break;
        await sleep(3000);
      }
    } catch (e) { r = { ok: false, error: e.message }; }
    if (r && r.ok) { got[n] = r.text || ''; continue; }
    error = (r && r.error) || '읽기 실패';
    failed.push(...nums.slice(k)); break;                  // 같은 까닭으로 계속 실패할 테니 여기서 그친다 (읽은 쪽은 남긴다)
  }
  return { got, failed, calls, error };
}
const rangeText = a => { const out = []; let i = 0; while (i < a.length) { let j = i; while (j + 1 < a.length && a[j + 1] === a[j] + 1) j++; out.push(j > i ? a[i] + '~' + a[j] : String(a[i])); i = j + 1; } return out.join(', '); };
/* 그림 쪽을 어떻게 할지 묻는 창. 돌려주는 값: 읽을 쪽 번호 목록 / [] (그림 쪽은 빼고 글자만) / null (이 파일 건너뛰기) */
function kAskPages(name, r, cand){
  return new Promise(res => {
    const m = $('modalBody'); m.className = 'm'; m.innerHTML = '';
    const textN = r.pages.filter(p => !p.scan && p.chars > 0).length;
    m.append(el('h3', '', '그림으로 된 쪽이 있어요'));
    const info = el('div', 'note'); info.id = 'kPgInfo';
    info.textContent = '"' + name + '" · 전체 ' + r.pages.length + '쪽 가운데 글자를 뽑은 쪽 ' + textN + '쪽, 글자가 거의 없고 그림만 있는 쪽 ' + cand.length + '쪽 (' + rangeText(cand.map(p => p.n)) + '쪽).';
    m.append(info, el('div', 'note', '체크한 쪽만 AI가 그림으로 읽어요. 쪽마다 AI 호출이 1번씩 들고 그만큼 시간과 비용이 들어요. 체크하지 않은 그림 쪽은 올리지 않아요. 글자 쪽은 어느 쪽을 고르든 그대로 올려요.'));
    const grid = el('div', 'pgrid'), boxes = [];
    const go = el('button', 'pri'); go.id = 'kPgGo';
    const upd = () => { const n = boxes.filter(b => b.checked).length; go.textContent = '체크한 ' + n + '쪽을 AI로 읽고 올리기 (AI 호출 ' + n + '번)'; go.disabled = !n; };
    cand.forEach(p => {
      const l = el('label', 'pg'), cb = el('input'); cb.type = 'checkbox'; cb.checked = true; cb.dataset.n = p.n; cb.onchange = upd;
      const ph = el('canvas'); ph.width = 92; ph.height = 120; l.append(ph, cb, el('span', '', p.n + '쪽')); grid.append(l); boxes.push(cb);
      pdfCanvas(r.doc, p.n, 220).then(cv => { if (ph.isConnected) ph.replaceWith(cv); }).catch(() => {});
    });
    m.append(grid);
    const pick = el('div', 'row'); const all = el('button', 'icon', '모두 체크'), none = el('button', 'icon', '모두 풀기');
    all.onclick = () => { boxes.forEach(b => { b.checked = true; }); upd(); }; none.onclick = () => { boxes.forEach(b => { b.checked = false; }); upd(); };
    pick.append(all, none); m.append(pick);
    const row = el('div', 'row'); row.style.marginTop = '14px';
    const txt = el('button', '', '그림 쪽은 빼고 글자 쪽만 올리기 (AI 호출 0번)'); txt.id = 'kPgText';
    const skip = el('button', '', '이 파일 건너뛰기'); skip.id = 'kPgSkip';
    const done = v => { modalOnClose = null; closeModal(); res(v); };
    go.onclick = () => done(boxes.filter(b => b.checked).map(b => Number(b.dataset.n)));
    txt.onclick = () => done([]); skip.onclick = () => done(null);
    row.append(go, txt, skip); m.append(row); upd();
    modalOnClose = () => res(null);                        // 창 바깥을 눌러 닫으면 이 파일은 건너뛴다
    $('modal').classList.remove('hide');
  });
}
const PAGE_MARK = /⟦(\d+)쪽(?: 이어짐)?⟧/g;
// 문단 경계를 살려서 max 글자 이하 조각으로 나눈다. 조각이 쪽 중간에서 시작하면 앞에 ⟦N쪽 이어짐⟧을 붙여 쪽 번호를 잇는다.
function chunkText(text, max){
  const out = []; let cur = '';
  String(text).replace(/\r/g, '').split(/\n{2,}/).forEach(par => {
    par = par.trim(); if (!par) return;
    while (par.length > max) {
      let cut = par.lastIndexOf('\n', max); if (cut < max * 0.5) cut = par.lastIndexOf(' ', max); if (cut < max * 0.5) cut = max;
      if (cur) { out.push(cur); cur = ''; }
      out.push(par.slice(0, cut).trim()); par = par.slice(cut).trim();
    }
    if (!par) return;
    if (cur && cur.length + par.length + 2 > max) { out.push(cur); cur = ''; }
    cur += (cur ? '\n\n' : '') + par;
  });
  if (cur) out.push(cur);
  let last = null;
  return out.map(c => {
    const head = last != null && !/^⟦\d+쪽/.test(c) ? '⟦' + last + '쪽 이어짐⟧\n' : '';
    let m; const re = new RegExp(PAGE_MARK.source, 'g'); while ((m = re.exec(c))) last = m[1];
    return head + c;
  });
}
function kProg(text, err){ const p = $('kProgTxt'); if (p) { p.textContent = text; p.className = 'note' + (err ? ' kerr' : ''); } const bar = $('kProgBar'); if (bar && K.d && K.d.chunks) bar.style.width = Math.round((K.d.chunks - K.d.pending) / K.d.chunks * 100) + '%'; }
// 워드(.docx)에서 글자만 뽑는다 (이 기기에서. 외부 도구 없이 zip을 풀어 word/document.xml을 읽음)
async function docxText(file){
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let e = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('워드(docx) 파일 형식이 아니에요');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true), ent = null;
  const td = new TextDecoder();
  for (let k = 0; k < n && p + 46 <= buf.length; k++) {
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const name = td.decode(buf.subarray(p + 46, p + 46 + nl));
    if (name === 'word/document.xml') { ent = { method: dv.getUint16(p + 10, true), csize: dv.getUint32(p + 20, true), off: dv.getUint32(p + 42, true) }; break; }
    p += 46 + nl + xl + cl;
  }
  if (!ent) throw new Error('워드 본문을 찾지 못했어요');
  const st = ent.off + 30 + dv.getUint16(ent.off + 26, true) + dv.getUint16(ent.off + 28, true);
  const data = buf.subarray(st, st + ent.csize);
  let xb;
  if (ent.method === 0) xb = data;
  else if (ent.method === 8) xb = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  else throw new Error('지원하지 않는 압축 방식이에요');
  const doc = new DOMParser().parseFromString(td.decode(xb), 'application/xml');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main', out = [];
  [...doc.getElementsByTagNameNS(W, 'p')].forEach(pp => {
    let line = '';
    [...pp.getElementsByTagNameNS(W, '*')].forEach(x => { if (x.localName === 't') line += x.textContent; else if (x.localName === 'tab') line += '\t'; else if (x.localName === 'br' || x.localName === 'cr') line += '\n'; });
    out.push(line);
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
async function kUpload(fileInput){
  const f = K.kbF, files = [...fileInput.files], pasted = f.paste.trim(), label = f.source.trim(), docUrl = String(f.doc || '').trim();
  if (!files.length && !pasted && !docUrl) { kProg('파일을 고르거나, 구글 문서 링크를 넣거나, 글을 붙여 넣어 주세요', true); return; }
  K.stop = false; K.uploading = true; K.upNote = '';
  const jobs = [], notes = [], gen = K.gen; let ocrCalls = 0;      // gen: 올리기를 시작할 때의 자료 번호 (도중에 전체 지우기가 있었으면 서버가 받지 않는다)
  const stopBtn = $('kUpStop'); if (stopBtn) { stopBtn.classList.remove('hide'); stopBtn.disabled = false; stopBtn.textContent = '멈추기'; }
  try {
    if (pasted) jobs.push({ source: label || '붙여 넣은 글', text: pasted });
    if (docUrl) {
      kProg('구글 문서 읽는 중…');
      const r = await kpost({ action: 'kDocText', url: docUrl });
      if (!r.ok) { kProg(r.error || '구글 문서를 읽지 못했어요', true); if (!files.length && !pasted) return; notes.push('구글 문서: ' + (r.error || '읽지 못함')); }
      else jobs.push({ source: (!files.length && !pasted && label) ? label : (r.title || '구글 문서'), text: r.text });
    }
    for (const file of files) {
      let text;
      if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') {
        const r = await pdfExtract(file, kProg);
        const cand = r.pages.filter(p => p.scan); let got = {};
        if (cand.length) {
          kProg('"' + file.name + '": 그림 쪽 ' + cand.length + '쪽을 어떻게 할지 골라 주세요');
          const pick = await kAskPages(file.name, r, cand);
          if (pick === null) { notes.push('"' + file.name + '"은(는) 건너뛰었어요'); continue; }
          if (pick.length) {
            const o = await pdfOcrPages(r.doc, pick, kProg); got = o.got; ocrCalls += o.calls;
            if (o.failed.length) notes.push('"' + file.name + '": 그림 쪽 가운데 ' + rangeText(o.failed) + '쪽은 읽지 못해서 빠졌어요 (' + o.error + '). 글자 쪽과 이미 읽은 쪽은 올렸어요');
          }
          const left = cand.map(p => p.n).filter(n => pick.indexOf(n) < 0);
          if (left.length) notes.push('"' + file.name + '": 체크하지 않은 그림 쪽 ' + rangeText(left) + '쪽은 올리지 않았어요');
        }
        // 원래 쪽 순서대로 합친다. 쪽마다 ⟦N쪽⟧ 표시를 붙여서 나중에 원문 대목 옆에 쪽 번호를 보여 줄 수 있게 한다.
        text = r.pages.map(p => { const t = String(got[p.n] != null ? got[p.n] : p.text).trim(); return t ? '⟦' + p.n + '쪽⟧\n' + t : ''; }).filter(Boolean).join('\n\n');
        try { r.doc.destroy(); } catch (_) {}
        if (!text.trim()) { notes.push('"' + file.name + '"에서 올릴 글자가 없었어요'); continue; }
      } else if (/\.docx$/i.test(file.name)) {
        try { text = await docxText(file); } catch (e) { notes.push('"' + file.name + '"을(를) 읽지 못했어요 (' + e.message + ')'); continue; }
        if (!text.trim()) { notes.push('"' + file.name + '"에서 올릴 글자가 없었어요'); continue; }
      } else if (/\.(txt|md|text)$/i.test(file.name) || /^text\//.test(file.type)) text = await file.text();
      else { toast('"' + file.name + '"은(는) 읽을 수 없는 형식이에요. PDF·TXT로 바꾸거나 내용을 붙여 넣어 주세요'); notes.push('"' + file.name + '"은(는) 읽을 수 없는 형식이라 건너뛰었어요'); continue; }
      if (text.trim()) jobs.push({ source: files.length === 1 && label && !pasted ? label : file.name, text });
    }
    let added = 0;
    for (const job of jobs) {
      const parts = chunkText(job.text, 7000);
      for (let i = 0; i < parts.length; i += 6) {
        kProg('"' + job.source + '" 올리는 중 ' + Math.min(parts.length, i + 6) + '/' + parts.length + '조각');
        const r = await kpost({ action: 'kSrcAdd', source: job.source, parts: parts.slice(i, i + 6), gen });
        if (!r.ok) throw new Error(r.error || '올리기 실패');
        added += r.added;
      }
    }
    if (ocrCalls) notes.push('그림 쪽 읽기에 AI 호출 ' + ocrCalls + '번');
    K.upNote = notes.join(' · ');
    if (!added) { kProg('올릴 내용이 없었어요' + (K.upNote ? ' · ' + K.upNote : ''), true); return; }
    f.paste = ''; f.source = ''; f.doc = ''; fileInput.value = '';
    const stopped = K.stop;
    K.uploading = false;
    await kLoad();
    if (stopped) { K.digestErr = '멈췄어요. 올린 원문 ' + added + '조각은 남아 있어요. "남은 조각 이어서 정리"를 누르면 AI 정리를 시작해요'; kRender(); }
    else kDigestLoop();
  } catch (e) { kProg('실패: ' + e.message, true); }
  finally { K.uploading = false; if ($('kUpStop')) $('kUpStop').classList.add('hide'); }
}
/* 정리 안 된 조각이 없어질 때까지 한 조각씩 AI에게 맡긴다 (조각마다 AI 호출 1번, 답이 끊기면 조각을 나눠 더 부른다).
 * 창을 닫아도 원문은 남아 있어서 다음에 이어서 할 수 있다. 서버가 알려 준 실패 종류에 따라 기다리거나 멈춘다. */
async function kDigestLoop(){
  if (K.digesting) return;
  K.digesting = true; K.stop = false; K.digestErr = ''; let errs = 0, calls = 0, splits = 0, skipped = 0;
  kRender();
  while (!K.stop && cfg.kt) {
    kProg('AI가 읽고 정리하는 중… ' + (K.d.chunks - K.d.pending) + '/' + K.d.chunks + '조각 · 이번에 AI 호출 ' + calls + '번' + (splits ? ' (조각 나눔 ' + splits + '번)' : ''));
    let r;
    try { r = await kpost({ action: 'kDigest' }); } catch (e) { r = { ok: false, retry: true, wait: 3000, error: '응답을 받지 못했어요 (' + e.message + ')' }; }
    if (!r.ok) {
      if (r.kexp || r.late) break;
      if (r.stale) { K.digestErr = r.error; break; }
      calls++;
      if (r.split) { splits++; errs = 0; kProg(r.error, true); await sleep(800); continue; }
      if (r.retry && ++errs <= 4) { kProg(r.error + ' · ' + Math.round((r.wait || 1500) / 1000) + '초 뒤 다시 시도 (' + errs + '/4)', true); await sleep(r.wait || 1500); continue; }
      K.digestErr = (r.error || '정리 실패') + (r.retry ? ' · 여러 번 다시 해도 안 돼서 멈췄어요. 잠시 뒤 "남은 조각 이어서 정리"를 눌러 주세요' : ''); break;
    }
    if (r.ai) calls++;
    if (r.skipped) skipped++;
    errs = 0; K.d.pending = r.left; K.d.chunks = r.total;
    if (!r.left) break;
  }
  K.digesting = false;
  if (calls && !K.digestErr) K.upNote = (K.upNote ? K.upNote + ' · ' : '') + '정리에 AI 호출 ' + calls + '번' + (splits ? ' (답이 끊겨 조각을 ' + splits + '번 나눔)' : '') + (skipped ? ' · 정리 중 지워진 조각 ' + skipped + '개의 결과는 버림' : '');
  if (cfg.kt) await kLoad();
}
function kbEdit(sec, item){
  const def = KSEC[sec], extra = [];
  if (item && item.id) {
    const del = el('button', 'danger', '삭제'); del.dataset.label = '삭제';
    twoStep(del, async () => { const r = await kpost({ action: 'kKbDelete', sec, id: item.id, gen: K.gen }); if (r.ok) { closeModal(); kLoad(); } else toast(r.error); });
    extra.push(del);
    if (item.locked) { const un = el('button', '', 'AI가 보강해도 됨'); un.onclick = async () => { const r = await kpost({ action: 'kKbUnlock', sec, id: item.id, gen: K.gen }); if (r.ok) { closeModal(); kLoad(); } else toast(r.error); }; extra.push(un); }
  }
  const vals = Object.assign({}, item || {}); if (sec === 'clues') vals.core = item ? (item.core ? '예' : '아니오') : '예';
  openForm((item ? '고치기 · ' : '추가 · ') + def.title, def.fields, vals, v => kpost({ action: 'kKbSave', sec, item: Object.assign({}, v, { id: item && item.id }), gen: K.gen }),
    { extra, hint: '저장하면 🔒 마스터가 확정한 항목이 되어, 자료를 더 올려도 AI가 바꾸지 않아요.', after: () => kLoad() });
}
// ── 정리본 찾기: 검색 · 칸 고르기 · 정렬(묶기) · 핵심 단서만
function kbFindState(){ return K.kf || (K.kf = { q: '', sec: 'all', npc: 'order', clue: 'order' }); }
function kbPlaceOf(kb, txt){
  txt = String(txt || ''); let best = '';
  (kb.places || []).forEach(p => { const n = String(p.name || '').trim(); if (n.length >= 2 && txt.indexOf(n) >= 0 && n.length > best.length) best = n; });
  return best;
}
function kbPeopleOf(kb, txt){
  txt = String(txt || ''); const out = [];
  (kb.npcs || []).forEach(n => {
    const full = String(n.name || '').trim(); if (full.length < 2) return;
    const first = full.split(/\s+/)[0];
    if (txt.indexOf(full) >= 0 || (first.length >= 2 && txt.indexOf(first) >= 0)) out.push(full);
  });
  return out;
}
function kbSkillOf(kb, how){
  how = String(how || '').trim(); if (!how) return '방법 미상';
  let best = '';
  (kb.rolls || []).forEach(r => { const n = String(r.skill || '').trim(); if (n.length >= 2 && how.indexOf(n) >= 0 && n.length > best.length) best = n; });
  if (best) return best;
  const m = how.match(/([가-힣A-Za-z·]{2,12})\s*(?:판정|굴림|체크|롤|성공)/); if (m) return m[1];
  return how.length > 14 ? how.slice(0, 14) + '…' : how;
}
function kbList(cont){
  const kb = K.d.kb, st = kbFindState(); cont.innerHTML = '';
  const words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
  const hit = it => !words.length || (function(){ const h = Object.keys(it).filter(k => typeof it[k] === 'string' && k !== 'id').map(k => it[k]).join('\n').toLowerCase(); return words.every(w => h.includes(w)); })();
  const order = st.sec === 'core' ? ['clues'] : st.sec === 'all' ? ['npcs', 'clues', 'rolls', 'places', 'scenes'] : [st.sec];
  let shown = 0;
  order.forEach(sec => {
    const def = KSEC[sec]; let arr2 = (kb[sec] || []).filter(hit);
    if (sec === 'clues' && st.sec === 'core') arr2 = arr2.filter(c => c.core);
    const tot = (kb[sec] || []).length;
    if (words.length && !arr2.length && st.sec === 'all') return;
    const h = kH(sec === 'clues' && st.sec === 'core' ? '⭐ 핵심 단서' : def.title, arr2.length + '개' + (arr2.length !== tot ? ' / 전체 ' + tot + '개' : '')); h.append(el('span', 'grow'));
    const add = el('button', '', '+ 추가'); add.onclick = () => kbEdit(sec, null); h.append(add); cont.append(h);
    if (!arr2.length) { cont.append(kEmpty(tot ? '조건에 맞는 항목이 없어요' : '아직 없어요')); return; }
    // 묶기
    let groups = null;
    const nm = x => String(x[def.key] || '');
    if (sec === 'npcs' && st.npc !== 'order') {
      if (st.npc === 'name') arr2 = arr2.slice().sort((a, b) => nm(a).localeCompare(nm(b), 'ko'));
      else groups = arr2.map(x => [st.npc === 'place' ? (kbPlaceOf(kb, [x.role, x.knows, x.secret, x.attitude, x.motive].join(' ')) || '장소 미상') : (String(x.role || '').trim() || '역할 미상'), x]);
    }
    if (sec === 'clues' && st.clue !== 'order') {
      if (st.clue === 'name') arr2 = arr2.slice().sort((a, b) => nm(a).localeCompare(nm(b), 'ko'));
      else if (st.clue === 'time') arr2 = arr2.slice().sort((a, b) => (Number(a.seq) || 1e9) - (Number(b.seq) || 1e9));
      else if (st.clue === 'person') {                                    // 단서에 나오는 NPC마다 (두 사람이 나오면 두 곳에 다 보임)
        groups = [];
        arr2.forEach(x => { const ps = kbPeopleOf(kb, [x.text, x.where, x.how].join(' ')); (ps.length ? ps : ['인물 없음']).forEach(p => groups.push([p, x])); });
      }
      else groups = arr2.map(x => [st.clue === 'place' ? (kbPlaceOf(kb, x.where) || String(x.where || '').trim() || '장소 미상') : kbSkillOf(kb, x.how), x]);
    }
    const dragOn = !words.length && !groups && st.sec !== 'core' && !(sec === 'npcs' && st.npc !== 'order') && !(sec === 'clues' && st.clue !== 'order') && arr2.length > 1;
    const card = it => {
      if (sec === 'places') return placeCard(kb, it, words, dragOn);
      const c = el('div', 'kcard pick'); c.style.marginBottom = '0'; c.dataset.id = it.id;
      if (dragOn) addDrag(c, sec);
      const t = el('b', 'ttl'); t.append((it.locked ? '🔒 ' : ''), hlK(sec === 'rolls' ? (it.where ? it.where + ' · ' : '') + (it.skill || '') : it[def.key] || '', words)); c.append(t);
      if (sec === 'clues' && it.core) c.append(el('span', 'tag', '핵심'));
      if (sec === 'clues' && st.clue === 'time' && it.seq) c.prepend(el('span', 'tag', '#' + it.seq));
      const sub = def.sub(it); if (sub) { const sv = el('div', 'note'); sv.append(hlK(sub, words)); sv.style.cssText = 'display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden'; c.append(sv); }
      c.onclick = () => kbEdit(sec, it); return c;
    };
    if (groups) {
      const by = {}; groups.forEach(([g, x]) => { (by[g] = by[g] || []).push(x); });
      const miss = /(미상|없음)$/;
      Object.keys(by).sort((a, b) => (miss.test(a) - miss.test(b)) || a.localeCompare(b, 'ko')).forEach(g => {
        const gh = el('div', 'kgrp', g); gh.append(el('span', '', by[g].length + '개')); cont.append(gh);
        const grid = el('div', 'grid'); by[g].forEach(x => grid.append(card(x))); cont.append(grid);
      });
    } else { const grid = el('div', sec === 'places' ? 'kplaces' : 'grid'); grid.dataset.sec = sec; arr2.forEach(x => grid.append(card(x))); cont.append(grid); }
    if (arr2.length > 1 && !dragOn && !words.length && st.sec !== 'core') cont.append(el('div', 'note', '카드를 끌어서 순서를 바꾸려면 정렬을 "내가 정한 순서"로 두세요'));
    shown += arr2.length;
  });
  if (words.length && !shown && st.sec === 'all') cont.append(kEmpty('"' + st.q + '"이(가) 들어간 자료가 없어요'));
}
// 장소 카드: 숨은 정보 전체 + 이 장소의 단서·판정·NPC를 한 카드에
function placeCard(kb, it, words, dragOn){
  const name = String(it.name || '').trim();
  const c = el('div', 'kcard pick kplace'); c.dataset.id = it.id; c.onclick = () => kbEdit('places', it);
  if (dragOn) addDrag(c, 'places');
  const t = el('div', 'pname'); t.append((it.locked ? '🔒 ' : '') + '📍 ', hlK(name, words)); c.append(t);
  const hd = el('div', 'phid'); hd.append(hlK(it.hidden || '(숨은 정보 없음)', words)); c.append(hd);
  const inPlace = v => name.length >= 2 && String(v || '').indexOf(name) >= 0;
  const clues = (kb.clues || []).filter(x => inPlace(x.where) || kbPlaceOf(kb, x.where) === name);
  const rolls = (kb.rolls || []).filter(x => inPlace(x.where));
  const npcs = (kb.npcs || []).filter(x => [x.role, x.knows, x.secret, x.attitude, x.motive].some(inPlace));
  if (clues.length || rolls.length || npcs.length) {
    const lk = el('div', 'plk');
    const open = (sec, x) => ev => { ev.stopPropagation(); kbEdit(sec, x); };
    if (clues.length) { lk.append(el('span', 'k', '🔎 단서 ' + clues.length)); clues.slice().sort((a, b) => (!!b.core) - (!!a.core)).forEach(x => { const li = el('span', 'li', (x.core ? '⭐ ' : '· ') + x.text + (x.how ? '  (' + x.how + ')' : '')); li.onclick = open('clues', x); lk.append(li); }); }
    if (rolls.length) { const h = el('div'); h.style.marginTop = '6px'; h.append(el('span', 'k', '🎲 판정 ' + rolls.length)); lk.append(h); rolls.forEach(x => { const li = el('span', 'li', '· ' + (x.skill || '') + (x.success ? ' → ' + x.success : '')); li.onclick = open('rolls', x); lk.append(li); }); }
    if (npcs.length) { const h = el('div'); h.style.marginTop = '6px'; h.append(el('span', 'k', '👤 관련 NPC')); npcs.forEach(x => { const ch = el('span', 'chip2', x.name + (x.role ? ' · ' + x.role : '')); ch.onclick = open('npcs', x); h.append(ch); }); lk.append(h); }
    c.append(lk);
  }
  return c;
}
// 카드 끌어서 순서 바꾸기 (마우스·터치 모두). 손을 떼면 서버에 순서를 저장한다
function addDrag(card, sec){
  card.classList.add('has-drag');
  const hd = el('span', 'kdrag', '⠿'); hd.title = '끌어서 순서 바꾸기';
  hd.onclick = e => e.stopPropagation();
  hd.onpointerdown = e => {
    e.preventDefault(); e.stopPropagation();
    const grid = card.parentElement, before = [...grid.children].map(x => x.dataset.id).join(',');
    card.classList.add('dragging'); document.body.style.userSelect = 'none';      // 카드를 옮기면 손잡이의 포인터 붙잡기가 풀리므로 창 전체에서 듣는다
    const idx = n => [...grid.children].indexOf(n);
    const move = ev => {
      if (ev.clientY < 70) window.scrollBy(0, -14); else if (ev.clientY > innerHeight - 50) window.scrollBy(0, 14);
      const tgt = document.elementFromPoint(ev.clientX, ev.clientY), over = tgt && tgt.closest('.kcard');
      if (!over || over === card || over.parentElement !== grid) return;
      grid.insertBefore(card, idx(over) > idx(card) ? over.nextSibling : over);
    };
    const up = async () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      card.classList.remove('dragging'); document.body.style.userSelect = '';
      const ids = [...grid.children].map(x => x.dataset.id).filter(Boolean);
      if (ids.join(',') === before) return;
      const arr = K.d.kb[sec] || [], pos = {}; ids.forEach((id, i) => { pos[id] = i; });
      K.d.kb[sec] = arr.filter(x => pos[x.id] != null).sort((a, b) => pos[a.id] - pos[b.id]).concat(arr.filter(x => pos[x.id] == null));
      try { const r = await kpost({ action: 'kKbOrder', sec, ids, gen: K.gen }); toast(r.ok ? '순서를 저장했어요' : (r.error || '순서를 저장하지 못했어요')); if (!r.ok) kLoad(); }
      catch (err) { toast('순서를 저장하지 못했어요 (' + err.message + ')'); }
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };
  card.append(hd);
}
function hlK(text, words){
  const f = document.createDocumentFragment(); const t = String(text || '');
  if (!words.length) { f.append(t); return f; }
  const re = new RegExp('(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  t.split(re).forEach((part, i) => { if (i % 2) { const m = document.createElement('mark'); m.textContent = part; f.append(m); } else if (part) f.append(part); });
  return f;
}
function kbFind(box){
  const kb = K.d.kb, st = kbFindState();
  const wrap = el('div', 'kfind');
  const r1 = el('div', 'row');
  const q = el('input'); q.id = 'kbQ'; q.placeholder = '🔍 시나리오 자료 검색 (이름·내용 · 띄어쓰기로 여러 단어)'; q.value = st.q;
  const list = el('div'); list.id = 'kbList';
  q.oninput = () => { st.q = q.value.trim(); kbList(list); };
  r1.append(q); wrap.append(r1);
  const r2 = el('div', 'row'); r2.style.marginTop = '6px';
  const nCore = (kb.clues || []).filter(c => c.core).length;
  [['all', '전체'], ['npcs', 'NPC'], ['clues', '단서'], ['core', '⭐ 핵심 단서 ' + nCore], ['rolls', '판정'], ['places', '장소'], ['scenes', '장면']].forEach(([k, lb]) => {
    const b = el('button', 'fchip' + (st.sec === k ? ' act' : ''), lb); b.dataset.ksec = k;
    b.onclick = () => { st.sec = k; r2.querySelectorAll('.fchip').forEach(x => x.classList.toggle('act', x.dataset.ksec === k)); kbList(list); }; r2.append(b);
  });
  wrap.append(r2);
  const r3 = el('div', 'row'); r3.style.marginTop = '6px';
  const sel = (id, label, opts, val, on) => { const sl = el('select'); sl.id = id; opts.forEach(([v, t]) => { const o = el('option', '', t); o.value = v; sl.append(o); }); sl.value = val; sl.onchange = () => { on(sl.value); kbList(list); }; r3.append(el('span', 'lbl', label), sl); };
  sel('kbNpcSort', 'NPC 정렬', [['order', '내가 정한 순서 (끌어서 바꾸기)'], ['name', '가나다'], ['place', '장소별'], ['role', '직업·역할별']], st.npc, v => { st.npc = v; });
  sel('kbClueSort', '단서 정렬', [['order', '내가 정한 순서 (끌어서 바꾸기)'], ['time', '시간순 (원문에 나온 순서)'], ['name', '가나다'], ['place', '장소별'], ['person', '인물별'], ['skill', '기능(판정)별']], st.clue, v => { st.clue = v; });
  wrap.append(r3);
  const area = el('div'); area.append(wrap, list); box.append(area); kbList(list);      // 검색 막대는 목록을 보는 동안에만 위에 붙어 있다
}
function kvKb(box){
  const d = K.d, kb = d.kb, f = K.kbF || (K.kbF = { source: '', paste: '', truth: null, memo: null, doc: '' });
  const hasKb = ['npcs', 'clues', 'rolls', 'places', 'scenes'].some(k => (kb[k] || []).length);
  if (hasKb) { box.append(kH('시나리오 자료 찾기', '정리본(NPC·단서·판정·장소·장면)에서 찾기 · 누르면 고칠 수 있어요')); kbFind(box); }
  box.append(kH('자료 올리기', 'PDF·워드(DOCX)·TXT 파일, 구글 문서 링크, 붙여 넣은 글. 한글(HWP) 파일은 PDF로 저장해서 올려 주세요.'));
  const up = el('div', 'kcard');
  const fi = el('input'); fi.type = 'file'; fi.multiple = true; fi.accept = '.pdf,.docx,.txt,.md,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'; fi.id = 'kFile';
  const g = el('div', 'kgrid');
  const docIn = kInput(f.doc, 'https://docs.google.com/document/d/…', v => { f.doc = v; }); docIn.id = 'kDocUrl';
  g.append(kWrap('파일', fi), kWrap('자료 이름 (선택)', kInput(f.source, '예: 시나리오 본문, 진상 메모', v => { f.source = v; })),
    kWrap('또는 구글 문서 링크 (마스터 구글 계정으로 열 수 있는 문서)', docIn, 'wide'),
    kWrap('또는 글 붙여 넣기', kArea(f.paste, 4, '진상, NPC 설정, 직접 쓴 메모 등을 그대로 붙여 넣어도 돼요', v => { f.paste = v; }), 'wide'));
  up.append(g);
  const row = el('div', 'row'); row.style.marginTop = '10px';
  const ub = el('button', 'pri', '올리고 정리 시작'); ub.id = 'kUpBtn'; ub.disabled = K.digesting || K.uploading; ub.onclick = async () => { ub.disabled = true; await kUpload(fi); if ($('kUpBtn')) $('kUpBtn').disabled = K.digesting; };
  // 올리는 도중에 화면이 다시 그려져도 멈출 수 있게, 올리는 중이면 처음부터 보이게 그린다
  const us = el('button', K.uploading ? '' : 'hide', '멈추기'); us.id = 'kUpStop'; us.onclick = () => { K.stop = true; us.disabled = true; us.textContent = '지금 하던 쪽까지만 하고 멈춰요'; };
  row.append(ub, us);
  if (d.pending && !K.digesting) { const cont = el('button', '', '남은 ' + d.pending + '조각 이어서 정리'); cont.onclick = () => kDigestLoop(); row.append(cont); }
  if (K.digesting) { const stop = el('button', '', '멈추기'); stop.onclick = () => { K.stop = true; stop.disabled = true; stop.textContent = '이번 조각까지만 하고 멈춰요'; }; row.append(stop); }
  const pt = el('span', 'note'); pt.id = 'kProgTxt';
  pt.textContent = K.digestErr ? K.digestErr : d.chunks ? '원문 ' + d.chunks + '조각 중 ' + (d.chunks - d.pending) + '조각 정리됨' : '';
  if (K.digestErr) pt.className = 'note kerr';
  row.append(pt); up.append(row);
  if (d.chunks) { const bar = el('div', 'kbar'); const fill = el('i'); fill.id = 'kProgBar'; fill.style.width = Math.round((d.chunks - d.pending) / d.chunks * 100) + '%'; bar.append(fill); up.append(bar); }
  if (K.upNote) { const un = el('div', 'note', '지난번 올리기: ' + K.upNote); un.id = 'kUpNote'; un.style.marginTop = '6px'; up.append(un); }
  up.append(el('div', 'note', 'PDF는 이 기기에서 글자만 뽑아 보내고, 원문은 마스터 구글 시트의 "키퍼원문" 탭에만 저장돼요. AI가 한 조각(7,000자쯤)씩 읽어 아래 정리본을 채워요 (조각마다 AI 호출 1번). 글자가 없는 그림 쪽이 있으면 어느 쪽을 AI로 읽을지 먼저 물어봐요.'));
  box.append(up);
  if (d.sources.length) {
    d.sources.forEach(sx => {
      const c = el('div', 'kcard'); const r2 = el('div', 'row');
      r2.append(el('b', '', '📄 ' + sx.source), el('span', 'note', sx.chunks + '조각 · ' + sx.chars.toLocaleString() + '자' + (sx.pending ? ' · 정리 대기 ' + sx.pending : ' · 정리 끝')), el('span', 'grow'));
      const del = el('button', 'icon', '원문 지우기'); del.dataset.label = '원문 지우기';
      twoStep(del, async () => { const r = await kpost({ action: 'kSrcDel', source: sx.source }); toast(r.ok ? r.message : r.error); K.rollR = null; kLoad(); });
      r2.append(del); c.append(r2); box.append(c);
    });
  }

  box.append(kH('사건의 진상', 'AI가 조각마다 덧붙인 메모예요. 직접 고쳐도 돼요. 이 글 전체는 각 도구에서 "진상 전체" 칸을 켰을 때만 AI에 보내요.'));
  const ta = kArea(f.truth != null ? f.truth : kb.truth, 7, '시나리오의 진상·배경·흑막', v => { f.truth = v; });
  const tr = el('div', 'row'); tr.style.marginTop = '8px'; const ts = el('button', 'pri', '진상 저장'); const tp = el('button', '', 'AI로 다듬기 (겹치는 내용 합치기)'); const tm = el('span', 'note');
  ts.onclick = async () => { const r = await kDo(ts, '저장 중…', { action: 'kKbText', key: 'truth', text: ta.value, gen: K.gen }, tm); if (r.ok) { f.truth = null; tm.textContent = '저장됨'; kLoad(); } };
  tp.onclick = async () => { if (f.truth != null && f.truth !== kb.truth) { tm.textContent = '고친 내용을 먼저 저장해 주세요'; tm.className = 'note kerr'; return; } const r = await kDo(tp, 'AI가 다듬는 중…', { action: 'kTruthPolish' }, tm); if (r.ok) { f.truth = null; kLoad(); } };
  tr.append(ts, tp, tm); box.append(ta, tr);
  if (!hasKb) { box.append(kH('정리본', '자료를 올리면 AI가 채워요. 직접 추가해도 돼요')); kbFind(box); }      // 정리본이 비어 있으면 예전처럼 아래에 (직접 추가용)


  box.append(kH('마스터 용어집', '마스터만 보는 용어 풀이 (플레이어에게 공개되지 않고 AI에도 보내지 않아요)'));
  const ga = kArea(f.glossary != null ? f.glossary : kb.glossary, 4, '', v => { f.glossary = v; });
  const gr = el('div', 'row'); gr.style.marginTop = '8px'; const gs = el('button', '', '용어집 저장'); gs.id = 'kGlossSave'; const gm = el('span', 'note');
  gs.onclick = async () => { const r = await kDo(gs, '저장 중…', { action: 'kKbText', key: 'glossary', text: ga.value, gen: K.gen }, gm); if (r.ok) { f.glossary = null; gm.textContent = '저장됨'; } };
  gr.append(gs, gm); box.append(ga, gr);
  box.append(kH('마스터 메모', '자유롭게 적는 칸 (AI에 보내지 않아요)'));
  const ma = kArea(f.memo != null ? f.memo : kb.memo, 3, '', v => { f.memo = v; });
  const mr = el('div', 'row'); mr.style.marginTop = '8px'; const ms = el('button', '', '메모 저장'); const mm = el('span', 'note');
  ms.onclick = async () => { const r = await kDo(ms, '저장 중…', { action: 'kKbText', key: 'memo', text: ma.value, gen: K.gen }, mm); if (r.ok) { f.memo = null; mm.textContent = '저장됨'; } };
  mr.append(ms, mm); box.append(ma, mr);

  box.append(kH('지우기'));
  const clr = el('button', 'danger', '시나리오 자료 전체 지우기 (원문 + 정리본)'); clr.dataset.label = '시나리오 자료 전체 지우기 (원문 + 정리본)';
  twoStep(clr, async () => { K.stop = true; const r = await kpost({ action: 'kKbClear' }); toast(r.ok ? r.message : r.error); K.kbF = null; K.npcR = null; K.rollR = null; K.upNote = ''; kLoad(); });
  box.append(clr, el('div', 'note', '다른 시나리오를 시작할 때 누르세요. 회의록·요약은 설정의 "전체 초기화"에서 따로 지워요.'));
}

/* ── 다음 회차 시작 카드 ── */
const cardToForm = c => ({ lastScene: c.lastScene || '', learned: (c.learned || []).join('\n'), plans: (c.plans || []).join('\n'), open: (c.open || []).join('\n') });
const formToCard = f => { const ls = t => String(t || '').split('\n').map(x => x.replace(/^[-·•]\s*/, '').trim()).filter(Boolean); return { lastScene: f.lastScene.trim(), learned: ls(f.learned), plans: ls(f.plans), open: ls(f.open) }; };
const stripEv = t => String(t || '').replace(/\s*\(#\d+(?:\s*[,，·]\s*#?\d+)*\)/g, '').trim();
function recapCopyText(c){
  const sec = (t, a) => (a && a.length ? '\n' + t + '\n' + a.map(x => '- ' + stripEv(x)).join('\n') : '');
  return ('[지난 회차 · 세션 ' + c.session + ']\n마지막 장면: ' + stripEv(c.lastScene) + sec('우리가 알아낸 것', c.learned) + sec('우리가 하기로 한 일', c.plans) + sec('아직 갈린 의견·남은 의문', c.open)).trim();
}
function kvRecap(box){
  const d = K.d, pub = d.recap, sess = K.sess;
  const head = el('div', 'row'); const mk = el('button', 'pri', '카드 만들기 (AI 호출 1번)'); const msg = el('span', 'note');
  head.append(kSessSel(), mk, msg); box.append(head);
  box.append(el('div', 'note', '이 카드는 공개 기록(세션 요약, 플레이어 쪽 단서)만으로 만들어요. 시나리오 자료는 AI에 보내지 않으니 진상이 섞이지 않아요. 고친 뒤 "공개"를 누르면 모두의 요약 탭 맨 위에 보여요.'));
  // 초안: 서버에 남아 있는, 지금 회의록에서 만든 것. 공개할 때 서버가 이 초안이 지금 회의록의 것인지 확인한다.
  const draft = (d.recaps || []).find(l => l.session === sess && l.result);
  if (!K.recapF[sess]) K.recapF[sess] = cardToForm(pub && pub.session === sess ? pub : draft ? draft.result : {});
  const f = K.recapF[sess];
  mk.onclick = async () => { const r = await kDo(mk, 'AI가 정리하는 중… (10~30초)', { action: 'kRecap', session: sess }, msg); if (r.ok) { K.recapF[sess] = cardToForm(r.card); await kLoad(); } };
  const g = el('div', 'kgrid'); g.style.marginTop = '12px';
  g.append(kWrap('마지막 장면', kArea(f.lastScene, 2, '', v => { f.lastScene = v; }), 'wide'),
    kWrap('우리가 알아낸 것 (한 줄에 하나)', kArea(f.learned, 5, '', v => { f.learned = v; })),
    kWrap('우리가 하기로 한 일 (실제로 합의한 것만 · 없으면 비워 두기)', kArea(f.plans, 5, '', v => { f.plans = v; })),
    kWrap('아직 갈린 의견·남은 의문', kArea(f.open, 3, '', v => { f.open = v; }), 'wide'));
  box.append(g, el('div', 'note', '줄 끝의 (#번호)는 근거 발언 표시예요. 그대로 두면 플레이어가 📎를 눌러 원문을 볼 수 있어요.'));
  const row = el('div', 'row'); row.style.marginTop = '12px'; const pb = el('button', 'pri', '플레이어에게 공개'); pb.id = 'kRecapPub'; const cp = el('button', '', '디스코드용으로 복사'); const m2 = el('span', 'note');
  pb.disabled = !draft;
  // rv·draftId는 이 초안을 받아 온 때의 값이다 (누르는 순간에 새로 받아 붙이지 않는다) → 그 뒤 회의록이 지워졌으면 서버가 거절한다
  pb.onclick = async () => { const r = await kDo(pb, '공개 중…', { action: 'kRecapPublish', card: formToCard(f), rv: d.resetVer, draftId: draft.id }, m2); if (r.ok) { toast('공개했어요. 요약 탭 맨 위에 보여요'); await kLoad(); refreshData(); } };
  cp.onclick = () => copyText(cp, recapCopyText(Object.assign({ session: sess }, formToCard(f))));
  row.append(pb, cp);
  if (pub) { const off = el('button', '', '공개 취소'); off.onclick = async () => { const r = await kDo(off, '…', { action: 'kRecapOff' }, m2); if (r.ok) { await kLoad(); refreshData(); } }; row.append(off); }
  row.append(m2, el('span', 'note', pub ? '지금 공개 중: 세션 ' + pub.session + ' 카드 (' + String(pub.at).slice(5, 16) + ')' : '지금 공개된 카드 없음'));
  box.append(row);
  if (!draft) box.append(el('div', 'note', '공개하려면 먼저 "카드 만들기"로 이 세션의 초안을 만들어 주세요. 공개할 때 서버가 그 초안이 지금 회의록에서 만든 것인지 확인해요.'));
}

/* ── 통계 그림 (시상식·피드백 공용) ── */
function shareBars(box, st){
  const pls = st.people.filter(p => !p.keeper);
  pls.forEach(p => {
    const r = el('div', 'share'); const nm = el('div', 'nm', p.name); nm.style.color = colorOf(p.name);
    const tr = el('div', 'tr'); const fl = el('div', 'fl'); fl.style.width = p.share + '%'; fl.style.background = colorOf(p.name); tr.append(fl);
    r.append(nm, tr, el('div', 'note', p.share + '% · ' + p.lines + '줄')); box.append(r);
  });
  if (!pls.length) box.append(kEmpty('플레이어 발언이 없어요'));
}
async function kStatsLoad(btn, msg){
  const r = await kDo(btn, '계산 중…', { action: 'kStats', session: K.sess }, msg);
  if (r.ok) { K.stats[K.sess] = r.stats; K.statsRv[K.sess] = r.rv; K.aw[K.sess] = null; kRender(); }
}

/* ── 코코포리아 로그에서 판정만 고르기 (이 기기 안에서 처리) ── */
function rollLevel(s){
  if (/대실패|펌블|치명적|ファンブル|致命的失敗|fumble/i.test(s)) return '대실패';
  if (/실패|失敗|fail/i.test(s)) return '실패';
  if (/대성공|결정적|크리티컬|クリティカル|決定的成功|critical/i.test(s)) return '대성공';
  if (/극단|스페셜|イクストリーム|スペシャル|extreme|special/i.test(s)) return '극단적 성공';
  if (/어려운|ハード|hard/i.test(s)) return '어려운 성공';
  if (/성공|成功|success/i.test(s)) return '성공';
  return '';
}
function parseRoll(t){
  t = String(t).replace(/\s+/g, ' ').trim();
  const m = /\(\s*1[dD]100\s*<=\s*(\d+)\s*\)/.exec(t); if (!m) return null;
  const parts = t.slice(m.index + m[0].length).split(/\s*(?:＞|→|>)\s*/).map(x => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const level = rollLevel(parts[parts.length - 1]); if (!level) return null;
  let value = null; for (let i = parts.length - 2; i >= 0; i--) if (/^\d+$/.test(parts[i])) { value = +parts[i]; break; }
  const skill = t.slice(0, m.index).replace(/^\S*<=\s*\S+\s*/, '').replace(/[【】「」\[\]]/g, '').trim();
  return { skill: skill.slice(0, 40), target: +m[1], value, level, text: t.slice(0, 300) };
}
function parseCcfolia(html){
  const doc = new DOMParser().parseFromString(html, 'text/html'), out = [];
  doc.querySelectorAll('p').forEach(p => {
    const sp = [...p.children].filter(e => e.tagName === 'SPAN'); if (sp.length < 3) return;
    const body = sp[2].cloneNode(true); body.querySelectorAll('br').forEach(b => b.replaceWith(' '));
    const r = parseRoll(body.textContent); if (!r) return;
    out.push(Object.assign({ name: sp[1].textContent.trim() }, r));
  });
  // 로그 모양이 달라서 위 방식으로 하나도 못 찾았으면: "[탭] 이름 : 내용" 꼴의 가장 안쪽 덩어리에서 찾아본다
  if (!out.length) {
    [...doc.querySelectorAll('p,div,li,tr')].forEach(e => {
      if (e.querySelector('p,div,li,tr')) return;
      const t = e.textContent.replace(/\s+/g, ' ').trim();
      const m = /^(?:\[[^\]]*\]\s*)?(.{1,40}?)\s*[:：]\s*(.*\(\s*1[dD]100\s*<=\s*\d+\s*\).*)$/.exec(t); if (!m) return;
      const r = parseRoll(m[2]); if (r) out.push(Object.assign({ name: m[1].trim() }, r));
    });
  }
  return out;
}

/* ── 시상식 ── */
function statAwards(st){
  const out = [], pls = (st.people || []).filter(p => !p.keeper);
  const top = (arr2, key, min) => { const s = arr2.slice().sort((a, b) => b[key] - a[key]); return s.length && s[0][key] >= (min || 1) && (s.length < 2 || s[0][key] > s[1][key]) ? s[0] : null; };
  let w;
  if ((w = top(pls, 'chars'))) out.push({ title: '수다왕', winner: withChar(w.name), text: '발언 비중 ' + w.share + '% (' + w.lines + '줄)' });
  if ((w = top(pls, 'replies', 3))) out.push({ title: '티키타카상', winner: withChar(w.name), text: '마스터의 말을 가장 많이 바로 받아쳤어요 (' + w.replies + '번)' });
  if ((w = top(pls, 'questions', 3))) out.push({ title: '질문왕', winner: withChar(w.name), text: '질문 ' + w.questions + '번' });
  if ((w = top(pls, 'longest', 80))) out.push({ title: '최장 연설상', winner: withChar(w.name), text: '쉬지 않고 ' + w.longest + '자를 말했어요 (#' + w.longestId + ')' });
  const loss = (key, title, label) => { const c = (st.chars || []).filter(x => x[key] && x[key].diff < 0).sort((a, b) => a[key].diff - b[key].diff); if (c.length && (c.length < 2 || c[0][key].diff < c[1][key].diff)) out.push({ title, winner: (c[0].player ? c[0].player + ' (' + c[0].name + ')' : c[0].name), text: label + ' ' + c[0][key].from + ' → ' + c[0][key].to + ' (' + c[0][key].diff + ')' }); };
  loss('san', '이성 붕괴상', '이성'); loss('hp', '만신창이상', '체력');
  const rp = (st.rolls && st.rolls.people) || [];
  if ((w = top(rp, 'crit'))) out.push({ title: '행운의 여신상', winner: w.name, text: '대성공 ' + w.crit + '번 (판정 ' + w.n + '번 중)' });
  if ((w = top(rp, 'fumble'))) out.push({ title: '불운의 아이콘', winner: w.name, text: '대실패 ' + w.fumble + '번 (판정 ' + w.n + '번 중)' });
  const rated = rp.filter(p => p.n >= 3); if ((w = top(rated, 'rate'))) out.push({ title: '성공률 1위', winner: w.name, text: '판정 ' + w.n + '번 중 ' + w.ok + '번 성공 (' + w.rate + '%)' });
  if ((w = top(rp, 'n', 3))) out.push({ title: '주사위 노동자상', winner: w.name, text: '판정 ' + w.n + '번' });
  return out;
}
function kvAwards(box){
  const d = K.d, sess = K.sess, st = K.stats[sess];
  const head = el('div', 'row'); const calc = el('button', 'pri', st ? '다시 계산' : '통계 계산 (AI 없음)'); const msg = el('span', 'note');
  head.append(kSessSel(), calc, msg); box.append(head);
  calc.onclick = async () => { calc.disabled = true; msg.textContent = '캐릭터 수치 확인 중…'; try { await kpost({ action: 'charsRefresh', soft: true }); } catch (_) {} calc.disabled = false; kStatsLoad(calc, msg); };
  box.append(el('div', 'note', '세션이 끝난 뒤에 보세요. 여기서 고른 것만 "공개"를 눌렀을 때 모두의 요약 탭에 보여요. 말이 적은 사람을 놀리는 항목은 넣지 않았어요.'));

  // 코코포리아 판정 로그
  box.append(kH('판정 로그 (코코포리아)', '저장된 판정 ' + d.rollsTotal + '개 · 올리면 대성공·성공률 같은 항목이 생겨요'));
  const rc = el('div', 'kcard'); const rf = el('input'); rf.type = 'file'; rf.accept = '.html,.htm,text/html'; rf.id = 'kCcf'; const rmsg = el('div', 'note'); rmsg.style.marginTop = '6px';
  const rrow = el('div', 'row'); rrow.style.marginTop = '8px';
  const saveRolls = async (btn, mode) => {
    const r = await kDo(btn, '저장 중…', { action: 'kRollsSave', session: sess, rolls: K.ccf, mode }, rmsg);
    if (r.ok) { toast('판정 ' + r.added + '개를 세션 ' + r.session + ' 기록으로 저장했어요'); K.ccf = null; K.stats[sess] = null; await kLoad(); }
    else if (r.mismatch) { K.ccfMis = true; kRender(); }
  };
  rf.onchange = async () => {
    const file = rf.files[0]; if (!file) return;
    try { K.ccf = parseCcfolia(await file.text()); K.ccfMis = false; } catch (e) { K.ccf = null; rmsg.textContent = '파일을 읽지 못했어요: ' + e.message; return; }
    kRender();
  };
  rc.append(rf, el('div', 'note', '코코포리아 방 메뉴의 "로그 출력"으로 받은 HTML 파일을 고르세요. 파일은 이 기기에서 읽고, 1D100 판정 결과만 서버로 보내요.'));
  if (K.ccf) {
    if (!K.ccf.length) rc.append(el('div', 'note kerr', '이 파일에서 1D100 판정을 찾지 못했어요.'));
    else {
      const by = {}; K.ccf.forEach(x => { by[x.name] = (by[x.name] || 0) + 1; });
      rc.append(el('div', '', '판정 ' + K.ccf.length + '개를 찾았어요: ' + Object.keys(by).map(k => k + ' ' + by[k]).join(', ')));
      const prev = el('div', 'note'); prev.textContent = '예: ' + K.ccf.slice(-3).map(x => x.name + ' · ' + (x.skill || '판정') + ' · ' + x.value + ' → ' + x.level).join(' / '); rc.append(prev);
      if (!K.ccfMis) { const sv = el('button', 'pri', '새 판정을 세션 ' + sess + ' 기록으로 저장'); sv.onclick = () => saveRolls(sv, 'auto'); rrow.append(sv); }
      else {
        rmsg.textContent = '이 로그의 앞부분이 예전에 올린 기록과 달라요 (코코포리아 로그를 지웠거나 다른 방 로그일 수 있어요). 어떻게 할까요?'; rmsg.className = 'note kerr';
        const a = el('button', '', '이 파일 전체를 세션 ' + sess + ' 판정으로 추가'); a.onclick = () => saveRolls(a, 'append');
        const b = el('button', 'danger', '예전 기록을 지우고 이 파일로 교체 (전부 세션 ' + sess + ')'); b.onclick = () => saveRolls(b, 'replace');
        rrow.append(a, b);
      }
    }
  }
  rc.append(rrow, rmsg); box.append(rc);

  if (!st) { box.append(kEmpty('"통계 계산"을 누르면 발언 점유율과 시상 후보가 나와요.')); return; }
  if (st.empty) { box.append(kEmpty('세션 ' + sess + '에는 대화 기록이 없어요.')); }
  else {
    box.append(kH('발언 점유율', '플레이어끼리 비교 (글자 수 기준) · 마스터 발언은 전체의 ' + st.keeperShare + '%' + (st.keeper ? '' : ' · ⚠ 마스터 이름이 설정되지 않아 마스터도 플레이어로 계산됐어요')));
    shareBars(box, st);
  }

  /* 후보 목록 (통계 + AI)
   *  - AI 후보는 공개 기록만으로 만든다 (서버가 시나리오 자료를 읽지 못하게 막은 채로 AI를 부른다). 후보마다 바뀌지 않는 id가 있다.
   *  - "진상과 견줘 보기"는 따로 누를 때만, 별도의 AI 호출로 후보별 🔒 마스터 메모만 받아 온다. 후보의 상 이름·설명은 그 호출로 바뀌지 않는다.
   *  - 예전 버전이 만든 후보(진상을 함께 보냈을 수 있음)는 공개용으로 쓰지 않고 따로 보여 주기만 한다. */
  const logs = (d.awardsLogs || []).filter(l => l.session === sess);
  const aiLog = logs.find(l => !l.legacy), oldLog = aiLog ? null : logs.find(l => l.legacy);
  const notes = (aiLog && aiLog.notes) || null;
  if (!K.aw[sess]) {
    const list = statAwards(st).map(x => Object.assign({ on: false, src: '통계' }, x));
    ((aiLog && aiLog.highlights) || []).forEach(h => list.push({ on: false, id: h.id, ev: h.ev || [], seen: false, src: 'AI 후보 · ' + (h.category || '활약'), title: h.title || h.category, winner: h.player ? (h.character && h.character !== h.player ? h.player + ' (' + h.character + ')' : h.player) : h.character, text: h.text }));
    K.aw[sess] = list;
    K.awMeta[sess] = { rv: K.statsRv[sess] || d.resetVer, draftId: aiLog ? aiLog.id : '' };       // 이 목록을 만든 때의 초기화번호·후보 묶음
  }
  const list = K.aw[sess];
  const h2 = kH('시상 후보', '공개할 것만 체크하고, 이름과 설명은 마음대로 고치세요'); box.append(h2);
  const arow = el('div', 'row'); const ab = el('button', '', aiLog ? 'AI 활약 장면 후보 다시 받기 (AI 호출 1번)' : 'AI 활약 장면 후보 받기 (AI 호출 1번)'); ab.id = 'kAwGet'; const am = el('span', 'note');
  arow.append(ab, am);
  ab.onclick = async () => { const r = await kDo(ab, 'AI가 요약을 읽는 중…', { action: 'kAwards', session: sess }, am); if (r.ok) { K.aw[sess] = null; await kLoad(); } };
  box.append(arow, el('div', 'ksent', 'AI에 보내는 자료: 이 세션의 요약과 캐릭터 이름뿐이에요. 시나리오 자료(진상·NPC 비밀·원문)와 판정 기록은 보내지 않아요. 후보 생성에는 공개 기록만 사용해요.'));
  if (aiLog) {
    const crow = el('div', 'row'); crow.style.marginTop = '8px';
    const cb2 = el('button', '', notes ? '진상과 다시 견줘 보기 (AI 호출 1번 추가)' : '진상과 견줘 보기 (AI 호출 1번 추가)'); cb2.id = 'kAwCmp'; const cm = el('span', 'note'); cm.id = 'kAwCmpMsg';
    const hasKb = !!(d.kb.truth || d.kb.clues.length); cb2.disabled = !hasKb;
    cb2.onclick = async () => { const r = await kDo(cb2, 'AI가 견주는 중…', { action: 'kAwardsCompare', draftId: aiLog.id }, cm); if (r.ok) await kLoad(); else if (!r.stale) { cm.textContent = (r.error || '실패') + ' · 위 후보는 그대로 남아 있어요. 이 버튼만 다시 누르면 돼요'; cm.className = 'note kerr'; } };
    crow.append(cb2, cm); box.append(crow);
    box.append(el('div', 'ksent', hasKb ? '기본은 견주지 않아요. 누르면 AI를 한 번 더 불러서 위 후보와 시나리오 자료(진상·핵심 단서)를 함께 보내고, 후보마다 🔒 마스터 메모만 받아 와요. 후보의 상 이름·받는 사람·설명은 바뀌지 않고, 메모는 공개되지 않아요.' + (notes ? ' (마지막으로 견준 때: ' + String(aiLog.notesAt).slice(5, 16) + ')' : '') : '견줄 시나리오 자료가 아직 없어요.'));
  }
  if (oldLog) {
    const w = el('div', 'kwarn2'); w.id = 'kAwOld';
    w.append(el('b', '', '예전 버전에서 만든 후보가 남아 있어요' + (oldLog.legacyTruth ? ' (진상을 함께 보낸 AI 호출로 만든 것)' : '') + '. '), '이 후보는 공개용으로 쓰지 않아요. 위의 "AI 활약 장면 후보 받기"로 공개 기록만으로 다시 받아 주세요. 참고용으로만 아래에 보여 드려요.');
    (oldLog.highlights || []).forEach(h => { const x = el('div', 'note'); x.style.marginTop = '4px'; x.textContent = '· ' + [h.title, h.player, h.text].filter(Boolean).join(' · ') + (h.kNote ? '  🔒 ' + h.kNote : ''); w.append(x); });
    box.append(w);
  }
  if (aiLog && (aiLog.dropped || []).length) {
    const w = el('div', 'kwarn'); w.id = 'kAwDropped';
    w.append(el('b', '', '근거 번호를 확인할 수 없어서 뺀 후보 ' + aiLog.dropped.length + '개: '), aiLog.dropped.map(x => x.title + ' (' + x.why + ')').join(' / '));
    box.append(w);
  }
  if (!list.length) box.append(kEmpty('아직 후보가 없어요. 대화가 더 쌓이거나 AI 후보를 받아 보세요.'));
  const cnt = el('span', 'note');
  const upd = () => { const on = list.filter(x => x.on), ai = on.filter(x => x.id); cnt.textContent = '선택 ' + on.length + '개' + (ai.length ? ' · AI 후보 원문 확인 ' + ai.filter(x => x.seen).length + '/' + ai.length : ''); };
  list.forEach(a => {
    const r = el('div', 'aw'); const cb = el('input'); cb.type = 'checkbox'; cb.checked = a.on; cb.onchange = () => { a.on = cb.checked; upd(); };
    const f = el('div'); const g = el('div', 'f');
    g.append(kInput(a.title, '상 이름', v => { a.title = v; }), kInput(a.winner, '받는 사람', v => { a.winner = v; }));
    const tx = kInput(a.text, '설명', v => { a.text = v; }); tx.className = 'w'; g.append(tx); f.append(g);
    const meta = el('div', 'note'); meta.style.marginTop = '4px'; meta.append(a.src + ' ');
    if (a.id) {          // AI 후보: 서버가 실제 있고 이 세션에 속한다고 확인한 번호(a.ev)의 원문을 열어 볼 수 있다. 열어 본 후보는 ✓
      const mark = el('span', 'tag', a.seen ? '원문 확인함 ✓' : '원문 아직 안 봄'); mark.className = a.seen ? 'tag ok' : 'tag';
      const ev = el('span', 'ev', '📎 근거 원문 보기 ' + (a.ev || []).map(n => '#' + n).join(' '));
      ev.onclick = () => showEvidence({ ids: (a.ev || []).join(','), session: sess }, a.title + ' · ' + a.winner, rr => { if ((rr.lines || []).length) { a.seen = true; mark.textContent = '원문 확인함 ✓'; mark.className = 'tag ok'; upd(); } });
      meta.append(ev, mark);
      const typed = new Set(((String(a.text).match(/#(\d+)/g) || []).map(x => Number(x.slice(1)))));
      if ([...typed].some(n => (a.ev || []).indexOf(n) < 0)) meta.append(el('span', 'kerr', ' ⚠ 설명에 서버가 확인하지 않은 발언 번호가 있어요'));
    }
    f.append(meta);
    if (a.id && notes && notes[a.id]) { const kn = el('div', 'note knote', '🔒 마스터 메모 (공개되지 않음): ' + notes[a.id]); f.append(kn); }
    r.append(cb, f); box.append(r);
  });
  const prow = el('div', 'row'); prow.style.marginTop = '14px'; const pb = el('button', 'pri', '선택한 항목 공개'); pb.id = 'kAwPub'; const pm = el('span', 'note');
  pb.onclick = async () => {
    const meta = K.awMeta[sess] || {};
    // 보내는 것은 항목마다 id(어느 AI 후보인지)·상 이름·받는 사람·설명뿐이다. 마스터 메모는 보내지 않는다.
    const items = list.filter(x => x.on).map(x => ({ id: x.id || '', title: x.title, winner: x.winner, text: x.text }));
    const r = await kDo(pb, '공개 중…', { action: 'kAwardsPublish', session: sess, items, rv: meta.rv, draftId: meta.draftId }, pm);
    if (r.ok) { toast('시상식 ' + r.count + '개를 공개했어요. 요약 탭 맨 위에 보여요'); await kLoad(); refreshData(); }
  };
  prow.append(pb, cnt); upd();
  if (d.awards) { const off = el('button', '', '공개 취소'); off.onclick = async () => { const r = await kDo(off, '…', { action: 'kAwardsOff' }, pm); if (r.ok) { await kLoad(); refreshData(); } }; prow.append(off); }
  prow.append(pm, el('span', 'note', d.awards ? '지금 공개 중: 세션 ' + d.awards.session + ' 시상식 ' + d.awards.items.length + '개' : '지금 공개된 시상식 없음'));
  box.append(prow, el('div', 'note', '공개되는 것은 체크한 항목의 상 이름·받는 사람·설명 세 칸뿐이에요. 🔒 마스터 메모는 서버로 보내지도 저장되지도 않아요. 설명을 직접 고쳤다면 아직 밝혀지지 않은 진상이 비치지 않는지 한 번 읽어 보세요.'));
}

/* ── 마스터링 피드백 ── */
function kvFeedback(box){
  const d = K.d, sess = K.sess, st = K.stats[sess], log = (d.feedbacks || []).find(l => l.session === sess && l.result), fb = log && log.result;
  const head = el('div', 'row'); const calc = el('button', '', st ? '숫자 다시 계산' : '숫자만 보기 (AI 호출 0번)'); const ai = el('button', 'pri', 'AI 피드백 받기 (AI 호출 1번)'); const msg = el('span', 'note');
  head.append(kSessSel(), calc, ai, kCheck(K.fbFull, '진상 전체도 AI에 보내기 (토큰이 많이 들어요 · 한 번 쓰면 다시 꺼져요)', v => { K.fbFull = v; }), msg); box.append(head);
  calc.onclick = () => kStatsLoad(calc, msg);
  ai.onclick = async () => { const r = await kDo(ai, 'AI가 세션을 돌아보는 중…', { action: 'kFeedback', session: sess, full: K.fbFull }, msg); K.fbFull = false; if (!r.ok) kRender(); if (r.ok) { K.stats[sess] = r.stats; K.statsRv[sess] = r.rv; await kLoad(); } };
  box.append(el('div', 'ksent', 'AI에 보내는 자료: 숫자 통계 · 이 세션의 요약 · 정리본의 핵심 단서 ' + d.kb.clues.filter(c => c.core).length + '개 · 장면 제목 ' + d.kb.scenes.length + '개. "사건의 진상" 글 전체는 위 칸을 켰을 때만 보내요.' +
    (fb ? ' · 지금 보이는 피드백을 만들 때: ' + (fb.sent ? '진상 전체 ' + (fb.sent.truth ? '포함' : '미포함') : '예전 버전에서 만든 것이라 진상 전체가 포함됐어요') : '')));
  box.append(el('div', 'note', '마스터만 보는 화면이에요. 받아쓰기 글자만 보고 하는 분석이라 목소리·분위기는 반영되지 않아요. 숫자는 정확하고, AI 의견은 📎 근거를 눌러 확인하면서 참고하세요.'));
  if (st && !st.empty) {
    box.append(kH('숫자로 본 세션 ' + sess, st.lines + '줄 · ' + Math.floor(st.minutes / 60) + '시간 ' + (st.minutes % 60) + '분 (조용한 구간 뺀 ' + st.activeMinutes + '분)'));
    const c = el('div', 'kcard');
    c.append(el('div', '', '마스터 발언 비율 ' + st.keeperShare + '%' + (st.keeper ? ' (' + st.keeper + ')' : ' · ⚠ 설정에서 마스터 이름을 넣어야 정확해요')));
    const kbar = el('div', 'kbar'); const kf = el('i'); kf.style.width = st.keeperShare + '%'; kbar.append(kf); c.append(kbar);
    box.append(c);
    box.append(kH('플레이어별 비중', '스포트라이트가 고르게 갔는지'));
    shareBars(box, st);
    box.append(kH('시간대별 활동', '10분 단위 · 막대가 낮으면 조용했던 때'));
    const mx = Math.max(1, ...st.buckets.data.map(b => Object.keys(b).reduce((a, k) => a + b[k], 0)));
    const chart = el('div', 'act10');
    st.buckets.data.forEach((b, i) => {
      const col = el('div', 'col'); const tot = Object.keys(b).reduce((a, k) => a + b[k], 0);
      col.style.height = Math.max(2, Math.round(tot / mx * 100)) + '%';
      const t = new Date(Date.parse(String(st.buckets.start).replace(' ', 'T') + '+09:00') + i * 600000 + 9 * 3600000);
      col.title = String(t.getUTCHours()).padStart(2, '0') + ':' + String(t.getUTCMinutes()).padStart(2, '0') + ' · ' + Object.keys(b).map(k => k + ' ' + b[k] + '자').join(', ');
      Object.keys(b).sort((x, y) => b[y] - b[x]).forEach(k => { const seg = el('div'); seg.style.flex = String(b[k]); seg.style.background = colorOf(k); col.append(seg); });
      if (!tot) col.style.background = 'var(--bg2)';
      chart.append(col);
    });
    box.append(chart, el('div', 'note', String(st.from).slice(11, 16) + ' ~ ' + String(st.to).slice(11, 16) + ' · 색은 이름 색'));
    const g2 = el('div', 'kgrid'); g2.style.marginTop = '10px';
    const quiet = el('div', 'kcard'); quiet.append(el('b', '', '5분 넘게 조용했던 구간'), el('div', 'note', st.gaps.length ? st.gaps.map(x => x.from.slice(11, 16) + '~' + x.to.slice(11, 16) + ' (' + x.min + '분)').join(', ') : '없음'));
    const idle = el('div', 'kcard'); idle.append(el('b', '', '잡담 위주로 요약된 구간'), el('div', 'note', st.idle.length ? st.idle.map(x => x.from.slice(11, 16) + '~' + x.to.slice(11, 16)).join(', ') : '없음'));
    g2.append(quiet, idle); box.append(g2);
  } else if (st && st.empty) box.append(kEmpty('세션 ' + sess + '에는 대화 기록이 없어요.'));
  if (!fb) { if (!st) box.append(kEmpty('세션이 끝난 뒤 "AI 피드백 받기"를 누르세요. 숫자만 먼저 볼 수도 있어요.')); return; }
  const item = (x, cls) => { const c = el('div', 'kcard'); const t = el('div', ''); t.append(sumText(x.text)); c.append(t); if (x.tip) c.append(el('div', 'note', '👉 다음에: ' + x.tip)); return c; };
  box.append(kH('잘된 진행', String(log.at).slice(5, 16) + '에 받은 피드백'));
  if (!fb.good.length) box.append(kEmpty('근거를 댈 수 있는 항목이 없었어요')); fb.good.forEach(x => box.append(item(x)));
  box.append(kH('아쉬운 진행'));
  if (!fb.improve.length) box.append(kEmpty('근거를 댈 수 있는 항목이 없었어요')); fb.improve.forEach(x => box.append(item(x)));
  if (fb.spotlight) { box.append(kH('기회 나누기')); box.append(el('div', 'kcard', fb.spotlight)); }
  if (fb.scenes.length) {
    box.append(kH('장면별 시간'));
    const tb = el('table', 'rtable'); fb.scenes.forEach(s => { const tr = el('tr'); tr.append(el('th', '', (s.from || '') + (s.to ? '~' + s.to : '')), el('td', '', s.name), el('td', '', s.note)); tb.append(tr); }); box.append(tb);
  }
  if (fb.clues.length) {
    box.append(kH('핵심 단서 전달'));
    const tb = el('table', 'rtable'); fb.clues.forEach(s => { const tr = el('tr'); tr.append(el('th', '', s.status + (s.when ? ' ' + s.when : '')), el('td', '', s.clue)); tb.append(tr); }); box.append(tb);
  }
  if (fb.next.length) { box.append(kH('다음 회차에 해 볼 것')); fb.next.forEach(x => box.append(el('div', 'kcard', '· ' + x))); }
}

/* ── 마스터가 공개한 카드 (모두의 요약 탭 맨 위) ── */
function renderPubCards(d){
  const box = $('pubCards'); if (!box) return; box.innerHTML = '';
  const r = d.recap;
  if (r) {
    const c = el('div', 'pub'); const h = el('h3', '', '📌 지난 회차 · 세션 ' + r.session); h.append(el('span', 'grow'));
    const cp = el('button', 'icon', '복사'); cp.onclick = () => copyText(cp, recapCopyText(r)); h.append(cp); c.append(h);
    if (r.lastScene) { c.append(el('div', 'pk', '마지막 장면')); const t = el('div'); t.append(sumText(r.lastScene)); c.append(t); }
    [['우리가 알아낸 것', r.learned], ['우리가 하기로 한 일', r.plans], ['아직 갈린 의견·남은 의문', r.open]].forEach(([t, a]) => {
      if (!a || !a.length) return; c.append(el('div', 'pk', t)); const ul = el('ul'); a.forEach(x => { const li = el('li'); li.append(sumText(x)); ul.append(li); }); c.append(ul);
    });
    box.append(c);
  }
  const a = d.awards;
  if (a && a.items && a.items.length) {
    const c = el('div', 'pub'); c.append(el('h3', '', '🏆 시상식 · 세션 ' + a.session));
    const g = el('div', 'awg');
    a.items.forEach(x => { const k = el('div', 'awc'); k.append(el('div', 't', x.title), el('div', 'w', x.winner)); const t = el('div', 'note'); t.append(sumText(x.text)); k.append(t); g.append(k); });
    c.append(g); box.append(c);
  }
}


