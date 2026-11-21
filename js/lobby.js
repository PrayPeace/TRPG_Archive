/* TRPG Archive · 로비 (폰 화면) · 잠금 해제 컷인
 * 모든 js 파일은 index.html 아래에서 순서대로 읽고 이름(함수·변수)을 함께 쓴다. */
'use strict';
/* ── 로비 (폰 화면) ──
 * 사이트에 들어오면 언제나 이 화면부터 (같은 탭에서 새로고침한 경우만 방에 그대로 남는다).
 * 로비 방: 방 목록을 적어 두는 방 하나. 주소는 ① 링크의 #hub=스크립트ID ② 저장소의 lobby.json ③ 이 기기에 저장한 값 순서로 찾는다.
 * 플레이어: 방 아이콘 → 이름·방 비밀번호 → 입장.
 * 마스터: ⚙ 설정 → 마스터 비밀번호 → 방 개설(시트 복사)·주소 연결(새 배포 때)·이름 바꾸기·빼기·로비 링크 복사. */
const RULE_ICON = { coc: '🐙', triangle: '🔺', unlimited: '🌐', shinobi: '🥷', etc: '🎲' };
const RULE_AB = { coc: 'CoC', triangle: 'TA', unlimited: 'UW', shinobi: 'SG', etc: 'ETC' };
const RULE_NM = { coc: '크툴루의 부름', triangle: '트라이앵글 에이전시', unlimited: '언리미티드 월드', shinobi: '시노비가미', etc: '기타 TRPG' };
const HUB_FROM_LINK = hp.get('hub') || '';
if (HUB_FROM_LINK) { S.set('t_hub', HUB_FROM_LINK); history.replaceState(null, '', location.pathname + location.search); }
const L = { hub: '', fixed: false, rooms: [], title: '', timer: 0, fromApp: false, kt: '' };
/* 로비 마스터 토큰은 발급한 로비 주소와 함께 보관하고, 같은 로비에만 보낸다 (링크로 다른 로비를 열어도 새지 않게) */
function hubKtSave(kt){ L.kt = kt || ''; if (kt) SS.set('t_hubkt', JSON.stringify({ hub: L.hub, kt })); else SS.del('t_hubkt'); }
function hubKtLoad(){ try { const o = JSON.parse(SS.get('t_hubkt') || 'null'); L.kt = o && o.hub && o.hub === L.hub ? o.kt : ''; } catch (_) { L.kt = ''; } }
function scriptId(u){ const m = String(u || '').match(/\/macros\/s\/([A-Za-z0-9_\-]+)/); return m ? m[1] : ''; }
L.ready = (async () => {
  let def = '';
  try { const j = await (await fetch('lobby.json', { cache: 'no-store' })).json(); if (j && j.hub) def = scriptUrl(j.hub); } catch (_) {}
  if (HUB_FROM_LINK) { L.hub = scriptUrl(HUB_FROM_LINK); L.foreign = !!def && L.hub !== def; }
  else if (def) { L.hub = def; L.fixed = true; }
  else L.hub = scriptUrl(S.get('t_hub') || '');
  hubKtLoad();
})();
function lobbyLink(){ return location.origin + location.pathname + (L.fixed ? '' : '#hub=' + scriptId(L.hub)); }
const isHubKeeper = () => !!(L.hub && L.kt);
async function hubPost(b){
  const r = await (await fetch(L.hub, { method: 'POST', body: JSON.stringify(Object.assign({ kt: L.kt }, b)) })).json();
  if (r && r.kexp) hubKtSave('');
  return r;
}
function lTick(){
  const d = new Date(), hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  $('lClock').textContent = hm; $('lTime1').textContent = hm;
  $('lDate').textContent = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + '일월화수목금토'[d.getDay()] + ')';
}
function ruleIco(rule, size){
  const k = RULE_ICON[rule] ? rule : 'etc';
  const i = el('div', 'lb-ico lbr-' + k); i.append(RULE_ICON[k]);
  if (size !== 'sm') i.append(el('span', 'lb-ab', RULE_AB[k]));
  else { i.style.cssText = 'width:36px;height:36px;border-radius:10px;font-size:19px;flex:none'; }
  return i;
}
async function lobbyLoad(){
  $('lHomeNote').textContent = '';
  if (L.hub) {
    $('lHomeNote').textContent = '불러오는 중…';
    try {
      let r = null;
      if (L.kt) { r = await hubPost({ action: 'hubGet' }); if (!r.ok) r = null; }          // 마스터: 배포 대기 방과 시트 주소까지
      if (!r) r = await (await fetch(L.hub + '?action=hub')).json();
      if (!r.ok || !Array.isArray(r.rooms)) throw new Error(r.error || '');
      L.rooms = r.rooms; L.title = r.title || '';
      if (r.bat) L.bat = r.bat;
      $('lHomeNote').textContent = '';
    } catch (e) { L.rooms = []; $('lHomeNote').textContent = '방 목록을 못 불러왔어요'; }
  } else {
    L.title = '';
    L.rooms = roomsGet().map(x => ({ name: x.name, rule: x.rule || 'etc', url: scriptUrl(x.url), pw: x.pw, local: true }));
  }
  $('lHubName').textContent = L.title ? '· ' + L.title : ''; $('lHubLine').textContent = L.title ? '🎲 ' + L.title : '';
  batDraw(L.bat);
  lobbyDraw();
  credLoad(false);
}
/* 맨 위 상태 줄의 배터리 두 개: Claude(C)와 딥그램(D)의 남은 퍼센트. 누구나 보지만 금액은 마스터 위젯에서만 */
function batDraw(b){
  const w = $('lBat'); w.innerHTML = '';
  [['C', 'Claude API 남은 크레딧', b && b.c], ['D', 'Deepgram 받아쓰기 남은 잔액', b && b.d]].forEach(([k, t, v]) => {
    if (v == null) return;
    const s = el('span', 'lb-bat'); s.title = t + ' ' + v + '%';
    const box = el('span', 'lbb'), i = el('i', v < 20 ? 'lw-low' : v < 50 ? 'lw-mid' : ''); i.style.width = v + '%';
    box.append(i, el('b', '', String(v))); s.append(k, box); w.append(s);
  });
  w.onclick = e => { e.stopPropagation(); batInfo(); };
}
/* 배터리를 누르면: 누구나 보는 설명 */
function batInfo(){
  const b = L.bat || {};
  const mk = (k, v) => { const s = el('span', 'lb-bat'); const box = el('span', 'lbb'), i = el('i', v < 20 ? 'lw-low' : v < 50 ? 'lw-mid' : ''); i.style.width = (v || 0) + '%'; box.append(i, el('b', '', v == null ? '?' : String(v))); s.append(k, box); return s; };
  sheetOpen(s => {
    s.append(el('h3', '', '🔋 AI 배터리'));
    s.append(el('div', 'note', '이 프로그램이 쓰는 두 가지 AI 서비스의 남은 사용량이에요. 마스터가 충전해 둔 금액 중 몇 %가 남았는지 보여 줘요.'));
    const row = (k, v, name, what) => { const r = el('div', 'lb-bi'), t = el('div', 'grow'); t.append(el('b', '', name + (v == null ? ' · 아직 모름' : ' · ' + v + '% 남음')), el('div', 'note', what)); r.append(mk(k, v), t); s.append(r); };
    row('C', b.c, 'Claude', '요약, NPC·장소·단서 정리, 다음 할 일, 마스터 도구처럼 글을 읽고 정리하는 AI예요. 세션 중 자동 요약이 5분마다 조금씩 써요.');
    row('D', b.d, 'Deepgram', '말을 글자로 받아쓰는 AI예요. 마이크를 켜고 말하는 동안 시간만큼 써요.');
    const n = el('div', 'note'); n.style.marginTop = '12px';
    n.textContent = '초록은 넉넉, 노랑은 절반 아래, 빨강은 20% 아래예요. 0%가 되면 그 기능이 멈추니 빨강이 보이면 마스터에게 알려 주세요.';
    s.append(n);
  });
}
/* 남은 잔액 위젯 (마스터 로그인했을 때만): 딥그램은 실제 잔액, 클로드는 적어 둔 잔액 − 이 프로그램이 쓴 만큼 */
async function credLoad(force){
  const w = $('lCred');
  if (!isHubKeeper()) { w.classList.add('hide'); L.cred = null; return; }
  if (!L.cred) { w.classList.remove('hide'); w.innerHTML = ''; w.append(el('div', 'lw-h', '💳 남은 잔액 · 불러오는 중…')); }
  try {
    const r = await hubPost({ action: 'credits', force: !!force });
    if (!r || !r.ok) { if (!L.kt) { w.classList.add('hide'); return; } throw new Error(r && r.error || ''); }
    L.cred = r; credDraw(); credBat(r);
  } catch (e) { w.innerHTML = ''; w.append(el('div', 'lw-h', '💳 잔액을 불러오지 못했어요 (엔진 Code.gs가 최신 판인지 확인)')); }
}
function credBat(r){ const p = d => d && d.ok && d.top > 0 ? Math.max(0, Math.min(100, Math.round(d.left / d.top * 100))) : null; L.bat = { c: p(r.claude), d: p(r.deepgram) }; batDraw(L.bat); }
const usd = v => '$' + (Math.round(Number(v) * 100) / 100).toFixed(2);
function credRow(name, d, sub){
  const r = el('div', 'lw-r'), t = el('div', 'lw-t'); t.append(el('b', '', name));
  if (!d || !d.ok) { t.append(el('span', '', d && d.unset ? '잔액을 한 번 적어 주세요 (눌러서)' : '확인 안 됨')); r.append(t); if (d && d.error) r.append(el('div', 'lw-s', d.error)); return r; }
  const pct = d.top > 0 ? Math.max(0, Math.min(100, d.left / d.top * 100)) : 0;
  t.append(el('span', '', usd(d.left) + ' / ' + usd(d.top)), el('span', 'lw-p', Math.round(pct) + '%'));
  const bar = el('div', 'lw-bar'), i = el('i', pct < 20 ? 'lw-low' : pct < 50 ? 'lw-mid' : ''); i.style.width = pct.toFixed(1) + '%'; bar.append(i);
  r.append(t, bar); if (sub) r.append(el('div', 'lw-s', sub)); return r;
}
function credDraw(){
  const w = $('lCred'), c = L.cred; if (!c) return;
  w.innerHTML = ''; w.classList.remove('hide');
  const h = el('div', 'lw-h'); h.append(el('span', '', '💳 남은 잔액'), el('span', 'grow'), el('span', '', '눌러서 설정 ›')); w.append(h);
  const cl = c.claude || {};
  w.append(credRow('Claude', cl, cl.ok ? (String(cl.at).slice(5, 16).replace('-', '/') + '에 ' + usd(cl.base) + ' 적은 뒤 ' + usd(cl.spent) + ' 사용 (추정)') : ''));
  const dg = c.deepgram || {};
  w.append(credRow('Deepgram', dg, dg.ok ? '딥그램 실제 잔액 · 10분마다 새로 읽음' : ''));
  w.onclick = credForm;
}
function credForm(){
  const c = L.cred || {}, cl = c.claude || {}, dg = c.deepgram || {};
  sheetOpen(s => {
    s.append(el('h3', '', '💳 잔액 설정'));
    s.append(el('div', 'note', 'Claude는 API로 잔액을 알려 주지 않아요. console.anthropic.com → Billing에 보이는 잔액(Credit balance)을 적으면, 그 뒤로 이 프로그램이 쓴 만큼 빼서 보여 줘요. 다른 곳에서도 같은 키를 쓰면 어긋나니 가끔 다시 적어 주세요.'));
    const a = field(s, 'Claude 지금 잔액 ($)', 'text', '', cl.ok ? '지금 추정 ' + usd(cl.left) : '예: 23.40'); a.inputMode = 'decimal';
    const b = field(s, 'Claude 게이지 100% 기준 ($, 비우면 위 잔액)', 'text', cl.ok && cl.top !== cl.base ? cl.top : '', '예: 충전한 금액 50'); b.inputMode = 'decimal';
    s.append(el('div', 'note', 'Deepgram 잔액은 자동으로 읽어요. 100% 기준을 비우면 지금까지 본 가장 큰 잔액을 써요 (무료 크레딧이면 200).'));
    const d = field(s, 'Deepgram 게이지 100% 기준 ($)', 'text', dg.ok && !dg.auto ? dg.top : '', dg.ok ? '자동: ' + usd(dg.top) : '예: 200'); d.inputMode = 'decimal';
    const go = bigBtn(s, '저장하고 새로 읽기'), msg = lmsg(s);
    go.onclick = async () => {
      go.disabled = true; msg.ok('저장 중…');
      try {
        const body = { action: 'creditsSet', dgTop: d.value.trim() };
        if (a.value.trim()) { body.claude = a.value.trim(); body.claudeTop = b.value.trim(); }
        else if (b.value.trim()) body.claudeTop = b.value.trim();
        const r = await hubPost(body);
        if (!r.ok) { msg.err(r.error || '저장하지 못했어요'); go.disabled = false; return; }
        L.cred = r; credDraw(); credBat(r); sheetClose(); toast('잔액을 새로 읽었어요');
      } catch (e) { msg.err('로비 방에 연결하지 못했어요'); go.disabled = false; }
    };
  });
}
function lobbyDraw(){
  const g = $('lGrid'); g.innerHTML = '';
  L.rooms.forEach((r, i) => {
    const b = el('button', 'lb-app' + (r.url ? '' : ' lb-pend')); b.title = (RULE_NM[r.rule] || '') + ' · ' + r.name;
    b.append(ruleIco(r.rule), el('div', 'lb-lb', r.url ? r.name : r.name + '\n(배포 대기)'));
    if (r.url && cfg.url && scriptUrl(r.url) === cfg.url && cfg.pw) b.append(el('span', 'lb-cur'));
    b.onclick = () => r.url ? lobbyEnter(r) : connectForm(i);
    g.append(b);
  });
  const st = el('button', 'lb-app lb-add'); st.append(el('div', 'lb-ico lb-gear', '⚙'), el('div', 'lb-lb', '설정')); st.onclick = settingsOpen; g.append(st);
  if (!L.rooms.length) {
    const n = el('div', 'note'); n.style.cssText = 'grid-column:1/-1;color:#c9cfdb;text-align:center;margin-top:24px;line-height:1.7';
    n.textContent = L.hub ? '아직 개설된 방이 없어요. 마스터는 ⚙ 설정에서 방을 만들 수 있어요.' : '아직 로비가 연결되지 않았어요. 마스터는 ⚙ 설정에서 연결해 주세요.';
    g.append(n);
  }
  const d = $('lDock'); d.innerHTML = '';
  const btn = (t, f) => { const b = el('button', '', t); b.onclick = f; d.append(b); };
  if (L.fromApp) btn('← 지금 방으로', lobbyHide);
  btn('주소로 직접 입장', () => { lobbyHide(); showJoin(); });
}
/* 아래에서 올라오는 시트 */
function sheetOpen(build){
  const s = $('lSheet'); s.innerHTML = ''; s.scrollTop = 0;
  const x = el('button', 'lb-close', '✕'); x.title = '닫기'; x.onclick = sheetClose; s.append(x);
  build(s);
  $('lShade').classList.add('lb-on'); s.classList.add('lb-on');
  const f = s.querySelector('input'); if (f) setTimeout(() => { try { f.focus(); } catch (_) {} }, 280);
}
function sheetClose(){ $('lShade').classList.remove('lb-on'); $('lSheet').classList.remove('lb-on'); }
$('lShade').onclick = sheetClose;
function field(s, label, type, val, ph){ s.append(el('label', '', label)); const i = el('input'); if (type) i.type = type; if (val != null) i.value = val; if (ph) i.placeholder = ph; s.append(i); return i; }
function bigBtn(s, text, cls){ const b = el('button', cls || 'pri', text); b.style.cssText = 'width:100%;margin-top:14px;padding:12px'; s.append(b); return b; }
function lmsg(s){ const m = el('div', 'lb-lmsg'); s.append(m); return { el: m, err(t){ m.className = 'lb-lmsg'; m.textContent = t; }, ok(t){ m.className = 'lb-lmsg lb-ok'; m.textContent = t; } }; }
/* 플레이어: 방 들어가기 */
function lobbyEnter(r){
  const url = scriptUrl(r.url);
  if (L.fromApp && cfg.url === url && cfg.pw && cfg.name) { lobbyHide(); return; }      // 지금 방이면 그대로 돌아간다
  const saved = roomsGet().find(x => scriptUrl(x.url) === url);
  sheetOpen(s => {
    const h = el('h3'); h.append(ruleIco(r.rule, 'sm'), el('span', '', r.name)); s.append(h);
    s.append(el('div', 'note', (RULE_NM[r.rule] || '') + ' · 이름과 방 비밀번호를 넣고 들어가요'));
    const nm = field(s, '내 이름 (회의록에 붙는 이름)', '', cfg.name || S.get('t_name') || '', '예: 프레이피스');
    const pw = field(s, '방 비밀번호', 'password', r.pw || (saved && saved.pw) || '');
    const go = bigBtn(s, '입장'), msg = lmsg(s);
    const run = async () => {
      const name = nm.value.trim(), p = pw.value.trim();
      if (!name || !p) { msg.err('이름과 비밀번호를 넣어 주세요'); return; }
      go.disabled = true; msg.ok('확인 중…');
      try {
        const res = await readCall(url, p, 'ping');
        if (!res.ok) { msg.err(res.error || '비밀번호를 확인해 주세요'); go.disabled = false; return; }
        const a = roomsGet().filter(x => scriptUrl(x.url) !== url); a.unshift({ name: r.name, rule: res.rule || r.rule, url, pw: p }); roomsSet(a);
        S.set('t_name', name); SS.set('t_in', url); SS.set('t_enter', '1'); thCache(url, res.rule || r.rule, res.theme);
        if (cfg.url && cfg.url !== url && $('app') && !$('app').classList.contains('hide')) { await switchRoom({ url, pw: p }); return; }
        S.set('t_url', url); S.set('t_pw', p); location.reload();
      } catch (e) { msg.err('방에 연결하지 못했어요. 잠시 뒤 다시 해 주세요'); go.disabled = false; }
    };
    go.onclick = run; [nm, pw].forEach(i => i.onkeydown = e => { if (e.key === 'Enter') run(); });
  });
}
/* 마스터: ⚙ 설정 */
function settingsOpen(){
  if (!L.hub) return hubConnectForm();
  if (!L.kt) return hubLoginForm();
  settingsPanel();
}
function hubConnectForm(){
  sheetOpen(s => {
    s.append(el('h3', '', '⚙ 로비 연결'));
    s.append(el('div', 'note', '방 목록을 적어 둘 "로비 방"을 정해요. 늘 쓰는 방 하나의 웹 앱 주소를 넣어 주세요. 이 주소를 저장소의 lobby.json에 넣어 두면 누구든 사이트 주소만으로 이 로비를 봐요.'));
    const u = field(s, '로비 방 웹 앱 주소', '', '', 'https://script.google.com/macros/s/…/exec');
    const go = bigBtn(s, '연결'), msg = lmsg(s);
    go.onclick = async () => {
      const url = scriptUrl(u.value.trim()); if (!url) { msg.err('주소를 넣어 주세요'); return; }
      go.disabled = true; msg.ok('확인 중…');
      try {
        const r = await (await fetch(withQ(url, 'action=hub'))).json();
        if (!r.ok) throw new Error('이 방의 Code.gs가 예전 판이에요. 최신 Code.gs를 붙이고 새 버전으로 배포해 주세요');
        L.hub = url; S.set('t_hub', scriptId(url)); hubLoginForm();
      } catch (e) { msg.err(String(e.message || '').includes('Code.gs') ? e.message : '그 주소에 연결하지 못했어요. 웹 앱 주소가 맞는지 확인해 주세요'); go.disabled = false; }
    };
  });
}
function hubLoginForm(){
  sheetOpen(s => {
    s.append(el('h3', '', '⚙ 마스터 로그인'));
    s.append(el('div', 'note', '방 개설과 주소 연결은 마스터만 할 수 있어요. 로비 방의 마스터 비밀번호를 넣어 주세요.'));
    if (L.foreign) { const w = el('div', 'note', '⚠ 링크로 연 다른 로비예요 (주소 끝 …' + scriptId(L.hub).slice(-6) + '). 내 로비가 아니면 비밀번호를 넣지 마세요.'); w.style.color = 'var(--red)'; s.append(w); }
    const k = field(s, '마스터 비밀번호', 'password');
    const go = bigBtn(s, '로그인'), msg = lmsg(s);
    const run = async () => {
      if (!k.value) { msg.err('비밀번호를 넣어 주세요'); return; }
      go.disabled = true; msg.ok('확인 중…');
      try {
        const r = await hubPost({ action: 'hubLogin', kpw: k.value });
        if (!r.ok || !r.kt) { msg.err(r.error || '로그인하지 못했어요'); go.disabled = false; return; }
        hubKtSave(r.kt); await lobbyLoad(); settingsPanel();
      } catch (e) { msg.err('로비 방에 연결하지 못했어요. 로비 방의 Code.gs가 최신 판인지 확인해 주세요'); go.disabled = false; }
    };
    go.onclick = run; k.onkeydown = e => { if (e.key === 'Enter') run(); };
  });
}
async function hubSaveRooms(list){
  const r = await hubPost({ action: 'hubSave', rooms: list.map(x => ({ name: x.name, rule: x.rule, url: x.url || '', sheet: x.sheet || '' })) });
  if (!r.ok) { toast(r.error || '저장하지 못했어요'); if (!L.kt) hubLoginForm(); return false; }
  L.rooms = r.rooms; lobbyDraw(); return true;
}
function settingsPanel(){
  sheetOpen(s => {
    const h = el('h3', '', '⚙ 로비 설정'); s.append(h);
    s.append(el('div', 'note', (L.title ? '로비 방: ' + L.title + ' · ' : '') + '방을 누르면 주소 연결·이름·빼기를 할 수 있어요'));
    const row = el('div', 'row'); row.style.marginTop = '12px';
    const b1 = el('button', 'pri', '＋ 방 개설'); b1.onclick = newRoomForm;
    const b2 = el('button', '', '기존 방 추가'); b2.onclick = () => connectForm(-1);
    const b3 = el('button', '', '🔗 로비 링크 복사'); b3.onclick = async () => { try { await navigator.clipboard.writeText(lobbyLink()); toast('로비 링크를 복사했어요'); } catch (_) { prompt('이 링크를 복사해 보내 주세요', lobbyLink()); } };
    const b5 = el('button', '', '🔑 마스터 비밀번호'); b5.onclick = keeperPwForm;
    const b6 = el('button', '', '💳 잔액'); b6.onclick = credForm;
    const b4 = el('button', '', '로그아웃'); b4.onclick = () => { hubKtSave(''); sheetClose(); lobbyLoad(); };
    row.append(b1, b2, b3, b5, b6, b4); s.append(row);
    const list = el('div'); list.style.marginTop = '14px'; s.append(list);
    if (!L.rooms.length) list.append(el('div', 'note', '아직 방이 없어요. "＋ 방 개설"로 만들어 보세요.'));
    L.rooms.forEach((r, i) => {
      const w = el('div', 'lb-srow');
      const t = el('div', 'grow'); t.append(el('b', '', r.name), el('div', 'note', (RULE_AB[r.rule] || '') + ' · ' + (r.url ? '연결됨' : '배포 대기 (주소를 연결해 주세요)')));
      w.append(ruleIco(r.rule, 'sm'), t);
      const bt = el('div', 'row'); bt.style.gap = '4px';
      const mk = (txt, f) => { const b = el('button', '', txt); b.style.cssText = 'padding:6px 9px;font-size:12px'; b.onclick = f; bt.append(b); };
      mk(r.url ? '주소 바꾸기' : '주소 연결', () => connectForm(i));
      if (r.url) mk('🔑 비밀번호', () => roomPwForm(i));
      if (r.sheet) mk('시트', () => window.open(r.sheet, '_blank'));
      mk('이름', async () => { const v = prompt('방 이름 (로비에 보이는 이름)', r.name); if (v && v.trim()) { const a = L.rooms.slice(); a[i] = Object.assign({}, r, { name: v.trim().slice(0, 40) }); if (await hubSaveRooms(a)) settingsPanel(); } });
      mk('빼기', async () => { if (!confirm('"' + r.name + '"을 로비에서 뺄까요? (시트와 기록은 지워지지 않아요)')) return; if (await hubSaveRooms(L.rooms.filter((_, j) => j !== i))) settingsPanel(); });
      w.append(bt); list.append(w);
    });
  });
}
function newRoomForm(){
  sheetOpen(s => {
    s.append(el('h3', '', '＋ 방 개설'));
    s.append(el('div', 'note', '로비 방의 시트를 복사해 새 방 시트를 만들어요 (기록은 비우고, 키와 마스터 비밀번호는 그대로). 그다음 한 번만 배포하면 돼요.'));
    const nm = field(s, '방 이름', '', '', '예: 질긴 결속');
    s.append(el('label', '', '룰')); const sel = el('select'); Object.keys(RULE_NM).forEach(k => { const o = el('option', '', RULE_NM[k] + ' (' + RULE_AB[k] + ')'); o.value = k; sel.append(o); }); s.append(sel);
    const pw = field(s, '방 비밀번호 (플레이어들이 들어올 때 칠 비밀번호)', 'text');
    const go = bigBtn(s, '개설'), msg = lmsg(s);
    go.onclick = async () => {
      if (!nm.value.trim() || !pw.value.trim()) { msg.err('방 이름과 비밀번호를 넣어 주세요'); return; }
      go.disabled = true; go.textContent = '만드는 중… (10~30초)'; msg.ok('');
      try {
        const r = await hubPost({ action: 'hubNewRoom', name: nm.value.trim(), rule: sel.value, pw: pw.value.trim() });
        if (!r.ok) throw new Error(r.error || '만들지 못했어요');
        L.rooms = r.rooms; lobbyDraw();
        const idx = L.rooms.findIndex(x => x.sheet === r.url);
        deployGuide(idx, r.url, r.file || nm.value.trim());
      } catch (e) { msg.err(String(e.message || e).includes('fetch') ? '로비 방에 연결하지 못했어요' : String(e.message || e)); go.disabled = false; go.textContent = '개설'; }
    };
  });
}
/* 새 방을 웹 앱으로 배포해서 로비에 연결하는 순서 (방 개설 직후 안내, 주소 연결 화면의 "배포 방법"에서 같이 쓴다) */
function deploySteps(s, sheetUrl){
  const ol = el('ol'); ol.style.cssText = 'padding-left:20px;line-height:1.7;font-size:13.5px;margin:12px 0 0';
  const step = (title, sub) => { const li = el('li'); li.style.marginBottom = '8px'; li.append(el('b', '', title)); if (sub) { const d = el('div', 'note'); d.style.marginTop = '2px'; d.append(sub); li.append(d); } ol.append(li); return li; };
  const open = el('span');
  if (sheetUrl) { const a = el('a', '', '새 시트 열기'); a.href = sheetUrl; a.target = '_blank'; a.style.color = '#f0c873'; open.append(a, ' → '); }
  open.append('메뉴 확장 프로그램 → Apps Script');
  step('Apps Script 열기', open);
  step('연결 코드 확인 (고칠 것 없음)', 'Room.gs와 라이브러리 TRPG가 이미 복사돼 있어요. 맨 위 ROOM_PW_FIRST = \'\' 따옴표 안에 글자가 있으면 지우고 저장하세요. 이 방 비밀번호는 개설할 때 이미 들어갔어요.');
  step('setup 실행', '위쪽 함수 선택에서 setup → ▶ 실행. 처음이면 권한 창이 떠요: 권한 검토 → 내 계정 → "고급" → "(안전하지 않음)으로 이동" → 허용. 실행 로그에 "설치 완료"가 나오면 돼요.');
  step('웹 앱으로 새 배포', '오른쪽 위 배포 → 새 배포 → 유형 선택(⚙) → 웹 앱 → 다음 사용자 인증 정보로 실행: 나 · 액세스 권한이 있는 사용자: 모든 사용자 → 배포. 권한을 또 물으면 허용해 주세요.');
  step('웹 앱 주소 복사', '배포가 끝나면 나오는 "웹 앱" URL(https://script.google.com/macros/s/…/exec)을 복사해요. "라이브러리" URL이 아니라 웹 앱 URL이에요.');
  step('로비에 주소 연결', '아래 "주소 연결"을 눌러 붙여 넣고 저장하면 로비에 방이 나타나요. 플레이어는 그 방을 눌러 이름과 방 비밀번호만 넣으면 돼요.');
  s.append(ol);
  s.append(el('div', 'note', '※ 이 방은 한 번만 배포하면 돼요. 앞으로 업데이트는 엔진만 저장하면 자동으로 따라가요. 혹시 "새 배포"를 또 만들어 주소가 바뀌면, ⚙ 설정에서 그 방의 "주소 바꾸기"로 새 주소를 넣어 주세요.'));
}
function deployGuide(idx, sheetUrl, file){
  sheetOpen(s => {
    s.append(el('h3', '', '✔ 시트를 만들었어요'));
    s.append(el('div', 'note', '"' + file + '" · 아래 순서대로 한 번만 배포하면 방이 열려요.'));
    deploySteps(s, sheetUrl);
    const go = bigBtn(s, '주소 연결'); go.onclick = () => connectForm(idx);
    const later = bigBtn(s, '나중에 하기', 'lb-sec'); later.onclick = settingsPanel;
  });
}
/* 방 웹 앱 주소 연결 (i = -1 이면 기존 방을 새로 추가). 새 배포를 만들어 주소가 바뀌었을 때도 여기서 바꾼다 */
function connectForm(i){
  if (!isHubKeeper()) { toast('배포 대기 중인 방이에요. 마스터가 주소를 연결하면 들어갈 수 있어요'); return; }
  const r = i >= 0 ? L.rooms[i] : null;
  sheetOpen(s => {
    s.append(el('h3', '', r ? '🔗 ' + r.name + ' 주소 ' + (r.url ? '바꾸기' : '연결') : '기존 방 추가'));
    s.append(el('div', 'note', '그 방 시트의 Apps Script에서 배포 → 새 배포(또는 배포 관리)에 나오는 웹 앱 주소(…/exec)를 붙여 넣어요. 새 배포를 만들어 주소가 바뀌었을 때도 여기서 바꾸면 돼요.'));
    const u = field(s, '웹 앱 주소', '', r && r.url ? r.url : '', 'https://script.google.com/macros/s/…/exec');
    const nm = r ? null : field(s, '방 이름 (비우면 시트에서 읽어요)');
    const go = bigBtn(s, r ? '저장' : '추가'), msg = lmsg(s);
    const how = bigBtn(s, '배포 방법 보기', 'lb-sec'); how.onclick = () => deployGuide(i, r && r.sheet, r ? r.name : '방');
    go.onclick = async () => {
      let raw = u.value.trim(); const mm = raw.match(/#(.*)$/); if (mm) { const hh = new URLSearchParams(mm[1]); if (hh.get('s')) raw = hh.get('s'); }
      const url = scriptUrl(raw);
      if (!/^https:\/\/script\.google\.com\/(a\/[^\/]+\/)?macros\/s\/[A-Za-z0-9_\-]{10,}\/exec(\?room=[A-Za-z0-9_\-]{20,80})?$/.test(url)) { msg.err('…/exec 로 끝나는 웹 앱 주소를 넣어 주세요'); return; }
      go.disabled = true; msg.ok('그 방에 연결해 보는 중…');
      try {
        const res = await (await fetch(withQ(url, 'action=hub'))).json();
        if (!res || !('ok' in res)) throw new Error('x');
        const a = L.rooms.filter((x, j) => j !== i && scriptUrl(x.url) !== url);
        const item = Object.assign({}, r || {}, { url, name: (r && r.name) || (nm && nm.value.trim()) || res.title || '새 방', rule: res.rule || (r && r.rule) || 'etc' });
        if (i >= 0) a.splice(Math.min(i, a.length), 0, item); else a.push(item);
        if (await hubSaveRooms(a)) { toast(res.ok ? '연결했어요' : '연결했어요 (그 방의 Code.gs가 예전 판이면 최신으로 바꿔 주세요)'); settingsPanel(); }
        else { go.disabled = false; msg.err('저장하지 못했어요'); }
      } catch (e) { msg.err('그 주소에 연결하지 못했어요. 배포할 때 액세스를 "모든 사용자"로 했는지 확인해 주세요'); go.disabled = false; }
    };
  });
}
/* 비밀번호 바꾸기 (유출됐을 때). 방마다 시트가 따로라서, 이 화면이 방마다 마스터 로그인(hubLogin) → setPw를 차례로 보낸다.
 * 바뀐 값은 각 방 시트의 설정 탭에 들어가서 Code.gs를 다시 배포하지 않아도 바로 적용된다. */
async function roomCall(url, b){ return (await fetch(url, { method: 'POST', body: JSON.stringify(b) })).json(); }
async function roomSetPw(url, kpw, patch){
  let r;
  try { r = await roomCall(url, { action: 'hubLogin', kpw }); } catch (e) { return { ok: false, error: '연결하지 못했어요' }; }
  if (!r || !r.ok) {
    // 마스터 비밀번호를 바꾸다 중간에 끊겼으면, 이 방은 이미 새 비밀번호일 수 있다
    if (patch.keeper && r && !r.locked) { try { const r2 = await roomCall(url, { action: 'hubLogin', kpw: patch.keeper }); if (r2 && r2.ok) return { ok: true, already: true }; } catch (_) {} }
    return { ok: false, error: (r && r.error) || 'Code.gs가 예전 판이에요' };
  }
  let x;
  try { x = await roomCall(url, Object.assign({ action: 'setPw', kt: r.kt, kpw }, patch)); } catch (e) { return { ok: false, error: '연결하지 못했어요' }; }
  if (x && x.error === '알 수 없는 요청') return { ok: false, error: 'Code.gs가 예전 판이에요 (11-20.14 이상으로 바꿔 주세요)' };
  try { if (x && x.ok && !patch.keeper) roomCall(url, { action: 'klogout', kt: r.kt }); } catch (_) {}
  return x || { ok: false, error: '응답이 없어요' };
}
function rememberRoomPw(url, pw){        // 이 기기에 저장된 그 방 비밀번호도 새것으로
  url = scriptUrl(url);
  const a = roomsGet(); let hit = false;
  a.forEach(x => { if (scriptUrl(x.url) === url) { x.pw = pw; hit = true; } });
  if (hit) roomsSet(a);
  if (cfg.url === url) { cfg.pw = pw; S.set('t_pw', pw); }
}
function roomPwForm(i){
  const r = L.rooms[i]; if (!r || !r.url) return;
  sheetOpen(s => {
    s.append(el('h3', '', '🔑 ' + r.name + ' 방 비밀번호 바꾸기'));
    s.append(el('div', 'note', '바꾸면 예전 비밀번호로 들어와 있던 사람은 바로 막히고, 새 비밀번호로 다시 들어와야 해요. 새 비밀번호는 같이 하는 사람들에게만 따로 알려 주세요.'));
    const k = field(s, '지금 마스터 비밀번호 (확인용)', 'password');
    const n = field(s, '새 방 비밀번호 (4자 이상)', 'text');
    const go = bigBtn(s, '바꾸기'), msg = lmsg(s);
    go.onclick = async () => {
      const nv = n.value.trim();
      if (!k.value || !nv) { msg.err('두 칸을 모두 넣어 주세요'); return; }
      if (nv.length < 4) { msg.err('방 비밀번호는 4자 이상으로 정해 주세요'); return; }
      go.disabled = true; msg.ok('바꾸는 중…');
      const x = await roomSetPw(r.url, k.value, { room: nv });
      if (!x.ok) { msg.err(x.error || '바꾸지 못했어요'); go.disabled = false; return; }
      rememberRoomPw(r.url, nv);
      msg.ok('"' + r.name + '" 방 비밀번호를 바꿨어요');
      go.textContent = '닫기'; go.disabled = false; go.onclick = settingsPanel;
    };
  });
}
function keeperPwForm(){
  sheetOpen(s => {
    s.append(el('h3', '', '🔑 마스터 비밀번호 바꾸기'));
    s.append(el('div', 'note', '로비 방과 연결된 모든 방의 마스터 비밀번호를 한 번에 바꿔요. 모든 기기의 마스터 로그인이 끊기니, 새 비밀번호로 다시 로그인해 주세요. 바꾼 뒤에는 Code.gs 맨 위 KEEPER_PW를 고쳐도 소용없어요 (잊어버렸으면 그 방 시트 설정 탭의 keeperPwH 줄을 지우면 Code.gs의 값으로 돌아가요).'));
    const k = field(s, '지금 마스터 비밀번호', 'password');
    const n1 = field(s, '새 마스터 비밀번호 (8자 이상, 10자 이상 권장)', 'password');
    const n2 = field(s, '새 마스터 비밀번호 한 번 더', 'password');
    const go = bigBtn(s, '모든 방에서 바꾸기'), msg = lmsg(s);
    const res = el('div'); res.style.cssText = 'margin-top:10px;font-size:13px;line-height:1.7'; s.append(res);
    go.onclick = async () => {
      const nv = n1.value;
      if (!k.value || !nv) { msg.err('칸을 모두 넣어 주세요'); return; }
      if (nv !== n2.value) { msg.err('새 비밀번호 두 칸이 서로 달라요'); return; }
      if (nv.length < 8) { msg.err('마스터 비밀번호는 8자 이상으로 정해 주세요'); return; }
      if (/^\s|\s$/.test(nv)) { msg.err('앞뒤에 빈칸이 있으면 안 돼요'); return; }
      if (nv === k.value) { msg.err('지금 비밀번호와 같아요'); return; }
      go.disabled = true; msg.ok('바꾸는 중… (방마다 몇 초씩 걸려요)'); res.innerHTML = '';
      // 로비 방은 맨 마지막에 (먼저 바꾸면 이 화면의 로그인이 끊긴다)
      const seen = new Set([scriptUrl(L.hub)]);
      const targets = L.rooms.filter(r => r.url && !seen.has(scriptUrl(r.url)) && seen.add(scriptUrl(r.url))).map(r => ({ name: r.name, url: r.url }));
      targets.push({ name: '로비 방' + (L.title ? ' (' + L.title + ')' : ''), url: L.hub });
      let bad = 0;
      for (const t of targets) {
        const line = el('div', '', '… ' + t.name); res.append(line);
        const x = await roomSetPw(t.url, k.value, { keeper: nv });
        if (x.ok) line.textContent = '✔ ' + t.name + (x.already ? ' (이미 새 비밀번호였어요)' : '');
        else { bad++; line.textContent = '✖ ' + t.name + ': ' + (x.error || '바꾸지 못했어요'); line.style.color = '#ffb3ae'; }
      }
      if (bad) { msg.err(bad + '곳은 바꾸지 못했어요. 그 방의 Code.gs를 최신으로 바꾼 뒤 다시 눌러 주세요 (이미 바뀐 방은 그대로 넘어가요)'); go.disabled = false; return; }
      msg.ok('모든 방의 마스터 비밀번호를 바꿨어요. 새 비밀번호로 다시 로그인해 주세요');
      hubKtSave('');
      if (cfg.kt) { cfg.kt = ''; try { S.del('t_kt'); SS.del('t_kt'); } catch (_) {} }
      go.textContent = '다시 로그인'; go.disabled = false; go.onclick = hubLoginForm;
    };
  });
}
/* 잠금 해제: 감염 1.8초(깜빡임 없음) → 에이전시 인증 컷인, 모두 8초쯤 보여 주고 홈 화면으로 (누르면 건너뜀, 동작 줄이기 설정이면 생략) */
function lobbyBg(){
  const b = $('lBg'); if (!b || b.classList.contains('on')) return;
  if (!b.childElementCount) {
    let ln = ''; for (let i = 0; i < 9; i++) { const y = 196 - i * 11, a = 14 - i * 1.2; ln += `<path d="M30 ${y} C 80 ${y - a}, 110 ${y + a}, 140 ${y - a * .6} S 190 ${y + a * .8}, 230 ${y - a * .4}" fill="none" stroke="#ffd2c2" stroke-width="2.4" stroke-opacity="${(.9 - i * .08).toFixed(2)}"/>`; }
    const tri = `<svg viewBox="0 0 230 230"><defs><clipPath id="bgc"><path d="M115 18 L214 200 L16 200 Z"/></clipPath></defs><path d="M115 18 L214 200 L16 200 Z" fill="#e3222f"/><g clip-path="url(#bgc)">${ln}</g><path d="M115 18 L214 200 L16 200 Z" fill="none" stroke="#f4ece6" stroke-width="3"/></svg>`;
    b.innerHTML = `<div class="bg-band" style="top:22%;height:90px;background:#e3222f"></div><div class="bg-band" style="top:30%;height:14px;background:#f4ece6"></div><div class="bg-band" style="top:74%;height:120px;background:#000;opacity:.25"></div><div class="bg-dots"></div><div class="bg-tri2">${tri}</div><div class="bg-tri">${tri}</div><div class="bg-vig"></div>`;
  }
  b.classList.add('on'); $('lScreen').classList.add('agency');
}
function unlock(){
  const lk = $('lLock'); if (lk.classList.contains('lb-up') || $('lFx')) return;
  // 휴대폰 '애니메이션 줄이기' 설정이어도 재생한다(깜빡임 없는 연출이라서)
  const fx = el('div'); fx.id = 'lFx'; const timers = [], born = Date.now();
  ['ta_swirl.jpg?v=1', 'ta_logo.png?v=1', 'ta_ceo.webp?v=1'].forEach(u => { const i = new Image(); i.src = u; });     // 감염 장면 동안 미리 받아 둔다
  const later = (f, ms) => timers.push(setTimeout(f, ms));
  // 1) 감염: 잠금 화면이 천천히 붉게 어두워지고 경고 창이 뜬다 (광과민 배려: 깜빡임·빠른 떨림 없음)
  const p0 = el('div'); p0.append(el('div', 'fx-scan'));
  [[15, 40], [48, 70], [78, 50]].forEach(([t, h], i) => { const b = el('div', 'fx-bar'); b.style.cssText = `top:${t}%;height:${h}px;animation-delay:${-i * 2}s`; p0.append(b); });
  const warn = el('div', 'fx-warn'); warn.innerHTML = '<b>⚠ 시스템 경고</b>알 수 없는 프로그램이 이 기기를 점거하고 있습니다.<br>요청 권한: 마이크 · 기록 · 현실';
  const pg = el('span', 'pg'); warn.append(pg); p0.append(warn);
  fx.append(p0); $('lScreen').append(fx); lk.classList.add('fx-hack');
  let n = 0; const bar = () => { const k = Math.round(n / 10); pg.textContent = '에이전시OS 설치 중 ' + '▮'.repeat(k) + '▯'.repeat(10 - k) + ' ' + n + '%'; };
  bar(); const iv = setInterval(() => { n = Math.min(100, n + 3 + Math.floor(Math.random() * 6)); bar(); if (n >= 100) clearInterval(iv); }, 85);
  // 2) 컷인 + 3) 삼각두가 아래에서 천천히 다가온다
  const T0 = 1800;
  later(() => {
    lk.classList.remove('fx-hack'); p0.remove(); clearInterval(iv);
    const st = el('div', 'fx-stage');
    const word = el('div', 'fx-word'); '에이전시OS'.split('').forEach((c, i) => { const sp = el('span', '', c); sp.style.animationDelay = (.42 + i * .045) + 's'; word.append(sp); });
    const os = el('div', 'fx-os'); os.innerHTML = 'AGENCY OS v3.0<br>&gt; 요원 확인 중… <i style="animation-delay:.9s"><b>승인</b></i><br><i style="animation-delay:1.5s">&gt; 출근 기록 완료</i><br><i style="animation-delay:2.4s">&gt; 오늘도 지켜보고 있어요</i>';
    const logo = el('img', 'fx-logo'); logo.src = 'ta_logo.png?v=1'; logo.alt = '';
    const tag = el('div', 'fx-tag'); tag.append(el('b', '', '출근하세요.'), el('span', '', '세계를 구하세요.'));
    const guy = el('div', 'fx-guy'); guy.innerHTML = '<img src="ta_ceo.webp?v=1" alt="">';
    st.append(el('div', 'fx-sw'), el('div', 'fx-band b1'), el('div', 'fx-band b2'), el('div', 'fx-band b4'), os, logo, word, tag, guy, el('div', 'fx-vig'), el('div', 'fx-flash'));
    fx.append(st);
  }, T0);
  const done = () => { lk.classList.remove('fx-hack'); lk.classList.add('lb-up'); lobbyBg(); };
  later(done, T0 + 5750); later(() => fx.remove(), T0 + 6700);
  fx.onclick = e => { e.stopPropagation(); if (Date.now() - born < 1000) return;   // 휴대폰은 잠금을 푼 그 손가락의 click이 바로 컷인에 떨어지므로 처음 1초는 무시
    timers.forEach(clearTimeout); clearInterval(iv); done(); fx.classList.add('fx-skip'); setTimeout(() => fx.remove(), 300); };
}
(function(){
  const lk = $('lLock'); let y0 = null;
  lk.addEventListener('pointerdown', e => { y0 = e.clientY; });
  lk.addEventListener('pointerup', e => { if (y0 == null || y0 - e.clientY > 30 || Math.abs(y0 - e.clientY) < 8) unlock(); y0 = null; });
  document.addEventListener('keydown', e => { if (!$('lobby').classList.contains('hide') && !lk.classList.contains('lb-up') && (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp')) unlock(); });
})();
async function lobbyShow(fromApp){
  L.fromApp = !!fromApp; sheetClose(); document.documentElement.classList.add('lob');
  $('lobby').classList.remove('hide'); $('join').classList.add('hide');
  $('lLock').classList.toggle('lb-up', !!fromApp);          // 앱 안에서 열면 잠금 화면은 건너뛴다
  if (fromApp) lobbyBg();
  lTick(); clearInterval(L.timer); L.timer = setInterval(lTick, 10000);
  await L.ready;
  if (!L.kt && cfg.kt && cfg.url && cfg.url === L.hub) L.kt = cfg.kt;     // 로비 방에 마스터로 들어와 있으면 그 로그인을 그대로 쓴다
  lobbyLoad();
}
function lobbyHide(){ $('lobby').classList.add('hide'); document.documentElement.classList.remove('lob'); clearInterval(L.timer); }

