/* TRPG Archive · 공통 도구 · 설정 · 서버 요청 · 색 · 입장 · 탭 · 창
 * 모든 js 파일은 index.html 아래에서 순서대로 읽고 이름(함수·변수)을 함께 쓴다. */
'use strict';
const $ = id => document.getElementById(id);
const S = {
  get(k){ try{ return localStorage.getItem(k); }catch(_){ return null; } },
  set(k,v){ try{ localStorage.setItem(k,v); }catch(_){} },
  del(k){ try{ localStorage.removeItem(k); }catch(_){} }
};
// 탭을 닫으면 사라지는 저장소 (마스터 로그인 토큰용)
const SS = {
  get(k){ try{ return sessionStorage.getItem(k); }catch(_){ return null; } },
  set(k,v){ try{ sessionStorage.setItem(k,v); }catch(_){} },
  del(k){ try{ sessionStorage.removeItem(k); }catch(_){} }
};
function el(tag, cls, text){ const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
let toastT = 0;
function toast(msg){ const t = $('toast'); t.textContent = msg; t.classList.remove('hide'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.add('hide'), 2600); }

/* ── 설정: 링크 #s=스크립트ID&p=방비번 ── */
const hp = new URLSearchParams(location.hash.slice(1));
if (hp.get('s')) S.set('t_url', hp.get('s'));
if (hp.get('p')) S.set('t_pw', hp.get('p'));
if (hp.get('s') || hp.get('p')) history.replaceState(null, '', location.pathname + location.search);
/* 웹 앱 주소를 한 모양으로 맞춘다. 엔진 하나로 여러 방을 돌리는 방식이면 주소 끝의 ?room=시트ID 를 남긴다(나머지 ?·# 뒤는 버림) */
function scriptUrl(v){
  v = (v || '').trim(); if (!v) return '';
  if (!v.startsWith('http')) return 'https://script.google.com/macros/s/' + v + '/exec';
  const rm = v.match(/[?&]room=([A-Za-z0-9_\-]{20,80})/);
  const base = v.replace(/[?#].*$/, '').replace(/\/(dev|exec)?\/?$/, '/exec').replace(/\/exec\/exec$/, '/exec');
  return rm ? base + '?room=' + rm[1] : base;
}
function withQ(url, q){ return url + (url.includes('?') ? '&' : '?') + q; }
// kt: 마스터 로그인 토큰. 기본은 이 탭에만(sessionStorage), "로그인 유지"를 켰을 때만 이 기기에(localStorage) 둔다. 마스터 비밀번호 자체는 저장하지 않는다.
const cfg = { url: scriptUrl(S.get('t_url')), pw: S.get('t_pw') || '', name: S.get('t_name') || '', kt: SS.get('t_kt') || S.get('t_kt') || '' };

/* ── 서버 ── */
/* 읽기 요청. 비밀번호가 주소에 남지 않게 POST 본문으로 보낸다.
 * 엔진이 아직 예전 판이면(답에 rp 표시가 없음) 이 화면에서는 예전처럼 GET 주소로 보낸다. */
let readPost = null;
/* 기기 토큰(pt): 비밀번호로 처음 들어오면 서버가 준다. 비밀번호를 여러 번 틀리는 공격으로 입장이 잠겨도 이 토큰이 있는 기기는 그대로 쓴다. 주소(GET)에는 싣지 않는다. */
function ptFor(url){ return (url && S.get('t_pt:' + url)) || ''; }
function ptKeep(url, r){ if (url && r && r.pt) { S.set('t_pt:' + url, r.pt); delete r.pt; } return r; }
/* 읽기 요청에는 기다리는 한도가 있다 (기본 60초, 새 말 확인 poll은 20초). 한도를 넘으면 끊고 오류로 돌려준다.
 * 예전에는 한도가 없어서, 응답 하나가 멈추면 그 화면은 새 말을 다시 묻지 않았다 (받아쓰기는 따로 보내서 계속 됐지만
 * 그 사람 화면에는 남의 말이 안 들어오고, 다른 사람 화면에는 '접속 끊김'이 떴다. 11-27 질긴 결속 세션 2) */
const READ_MS = { poll: 20000 };
async function fetchT(u, o, ms){
  const ac = window.AbortController ? new AbortController() : null, t = ac ? setTimeout(() => ac.abort(), ms) : 0;
  try { return await (await fetch(u, Object.assign({}, o, ac ? { signal: ac.signal } : {}))).json(); }
  catch (e) { if (e && e.name === 'AbortError') throw new Error('서버 응답이 ' + Math.round(ms / 1000) + '초 넘게 없음'); throw e; }
  finally { clearTimeout(t); }
}
async function readCall(url, pw, action, params){
  const p = { action, pw }; Object.entries(params || {}).forEach(([k, v]) => { p[k] = String(v); });
  const ms = READ_MS[action] || 60000;
  if (readPost !== false) {
    const pt = ptFor(url);
    const r = ptKeep(url, await fetchT(url, { method: 'POST', body: JSON.stringify(pt ? Object.assign({ pt }, p) : p) }, ms));
    if (r && r.rp) { readPost = true; delete r.rp; return r; }
    if (readPost === true) return r;
    readPost = false;
  }
  return fetchT(withQ(url, new URLSearchParams(p).toString()), {}, ms);
}
async function api(action, params){ return readCall(cfg.url, cfg.pw, action, params); }
async function post(body){
  body.pw = body.pw || cfg.pw;
  if (!body.pt) { const pt = ptFor(cfg.url); if (pt) body.pt = pt; }
  const r = await fetch(cfg.url, { method: 'POST', body: JSON.stringify(body) });
  return ptKeep(cfg.url, await r.json());
}
/* 마스터 요청. 보낸 뒤에 마스터를 잠갔거나 회의록이 초기화됐으면(K.epoch가 바뀜) 늦게 도착한 답은 쓰지 않는다.
 * 마스터 토큰은 요청 본문(POST)으로만 보낸다. 주소(GET)에는 싣지 않는다. */
async function kpost(b){
  const ep = K.epoch, kt = cfg.kt, guarded = /^k[A-Z]/.test(String(b.action || ''));
  const r = await post(Object.assign(b, { kt }));
  if (r && r.kexp) { if (cfg.kt === kt) keeperOff('마스터 로그인이 만료됐어요. 다시 로그인해 주세요'); return r; }
  if (guarded && ep !== K.epoch) return { ok: false, stale: true, late: true, error: '기다리는 사이에 회의록이 지워졌거나 마스터를 잠가서, 늦게 도착한 결과는 쓰지 않았어요' };
  return r;
}

/* ── 색 ── */
const PALETTE = ['#f0c873','#ff8a65','#f06292','#ba68c8','#7986cb','#4fc3f7','#4db6ac','#81c784','#dce775','#ffb74d','#a1887f','#e0e0e0'];
let colorMap = {};
function hashColor(name){ let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; }
const colorOf = name => colorMap[name] || hashColor(name);
function drawSwatches(){
  const box = $('swatches'); box.innerHTML = '';
  const mine = colorOf(cfg.name);
  if ($('hexIn') && document.activeElement !== $('hexIn')) { $('hexIn').value = mine; $('hexPick').value = /^#[0-9a-fA-F]{6}$/.test(mine) ? mine : '#f0c873'; }
  PALETTE.forEach(c => {
    const b = el('button', 'sw' + (c === mine ? ' sel' : '')); b.style.background = c; b.title = c;
    b.onclick = async () => {
      colorMap[cfg.name] = c; drawSwatches(); recolor();
      const r = await post({ action: 'color', name: cfg.name, color: c }); toast(r.ok ? '이름 색을 바꿨어요' : r.error);
    };
    box.append(b);
  });
}
function normHex(v){ v = String(v || '').trim().replace(/^#?/, '#'); if (/^#[0-9a-fA-F]{3}$/.test(v)) v = '#' + v.slice(1).split('').map(c => c + c).join(''); return /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : ''; }
async function applyHex(raw){
  const c = normHex(raw); if (!c) { $('hexMsg').textContent = '#과 영문·숫자 6자리로 적어 주세요 (예: #f0c873)'; $('hexMsg').className = 'note kerr'; return; }
  colorMap[cfg.name] = c; drawSwatches(); recolor(); $('hexMsg').className = 'note'; $('hexMsg').textContent = '저장 중…';
  const r = await post({ action: 'color', name: cfg.name, color: c }); $('hexMsg').textContent = r.ok ? '바꿨어요' : r.error; if (!r.ok) $('hexMsg').className = 'note kerr';
}
$('hexSet').onclick = () => applyHex($('hexIn').value);
$('hexIn').onkeydown = e => { if (e.key === 'Enter') applyHex($('hexIn').value); };
$('hexPick').oninput = () => { $('hexIn').value = $('hexPick').value; };
$('hexPick').onchange = () => applyHex($('hexPick').value);
function recolor(){
  document.querySelectorAll('[data-who]').forEach(e => { e.style.color = colorOf(e.dataset.who); });
  document.querySelectorAll('[data-whodot]').forEach(e => { e.style.background = colorOf(e.dataset.whodot); });
  $('meDot').style.background = colorOf(cfg.name);
}

/* ── 입장 ── */
function showJoin(msg){
  $('join').classList.remove('hide'); $('app').classList.add('hide');
  $('jName').value = cfg.name; $('jUrl').value = S.get('t_url') || ''; $('jPw').value = cfg.pw;
  if (msg) $('jMsg').textContent = msg;
}
$('jGo').onclick = async () => {
  const name = $('jName').value.trim(), url = scriptUrl($('jUrl').value), pw = $('jPw').value.trim();
  if (!name || !url || !pw) { $('jMsg').textContent = '세 칸을 모두 채워 주세요'; return; }
  $('jMsg').textContent = '확인 중…'; cfg.url = url; cfg.pw = pw;
  try {
    const r = await api('ping');
    if (!r.ok) { $('jMsg').textContent = r.error || '입장 실패'; return; }
    cfg.name = name; S.set('t_name', name); S.set('t_url', $('jUrl').value.trim()); S.set('t_pw', pw); roomRemember(r.title || '');
    resetLog(); live = {}; ver = {}; data = null; authBad = false;
    cfg.kt = ''; SS.del('t_kt'); S.del('t_kt');
    start();
  } catch (e) { $('jMsg').textContent = '방 주소에 연결하지 못했어요. 주소를 확인해 주세요.'; }
};

/* ── 탭 ── */
const TABS = ['log','sum','next','notes','chars','imgs','set','keeper'];
function showTab(t){
  [...$('tabs').children].forEach(x => x.classList.toggle('act', x.dataset.t === t));
  TABS.forEach(k => $('t-' + k).classList.toggle('hide', k !== t));
  if (t === 'keeper') kOpen();
  if (t === 'next') nextOpen();
}
$('tabs').onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.t) showTab(b.dataset.t); };

/* ── 창(모달) ── */
let modalOnClose = null;
function closeModal(){ $('modal').classList.add('hide'); $('modalBody').innerHTML = ''; $('modalBody').className = 'm'; $('modalBody').style.position = ''; const f = modalOnClose; modalOnClose = null; if (f) f(); }
$('modal').onclick = e => { if (e.target === $('modal')) closeModal(); };
/* 접근성: 창이 열리면 대화상자로 알리고 첫 입력칸에 초점, Escape로 닫기, 닫으면 연 버튼으로 초점을 돌려준다 */
(function(){
  const md = $('modal'); let opener = null, lastOut = null;
  document.addEventListener('focusin', e => { if (!md.contains(e.target)) lastOut = e.target; });
  md.setAttribute('role', 'dialog'); md.setAttribute('aria-modal', 'true');
  new MutationObserver(() => {
    const open = !md.classList.contains('hide');
    if (open && !opener) {
      opener = (document.activeElement && !md.contains(document.activeElement) ? document.activeElement : lastOut) || document.body;
      const h = $('modalBody').querySelector('h3'); if (h) { h.id = h.id || 'modalTitle'; md.setAttribute('aria-labelledby', h.id); }
      let n = 0; $('modalBody').querySelectorAll('label').forEach(lb => { const f = lb.nextElementSibling; if (!lb.htmlFor && f && /^(INPUT|TEXTAREA|SELECT)$/.test(f.tagName)) { f.id = f.id || 'mf' + (++n) + '_' + Date.now(); lb.htmlFor = f.id; } });   // 라벨과 칸 잇기
      let fine = false; try { fine = matchMedia('(pointer: fine)').matches; } catch (_) {}
      if (fine) setTimeout(() => { const f = $('modalBody').querySelector('input:not([type=hidden]),textarea,select,button'); if (f && !md.contains(document.activeElement)) f.focus(); }, 0);
    } else if (!open && opener) { const o = opener; opener = null; try { if (document.contains(o)) o.focus(); } catch (_) {} }
  }).observe(md, { attributes: true, attributeFilter: ['class'] });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !md.classList.contains('hide')) { closeModal(); return; }
    const t = e.target; if ((e.key === 'Enter' || e.key === ' ') && t && t.classList && t.classList.contains('lk') && t.onclick) { e.preventDefault(); t.click(); }
  });
})();
function openForm(title, fields, values, onSave, opts){
  const m = $('modalBody'); m.className = 'm'; m.innerHTML = '';
  m.append(el('h3', '', title));
  if (opts && opts.hint) m.append(el('div', 'note', opts.hint));
  const inputs = {};
  fields.forEach(f => {
    m.append(el('label', '', f.label));
    let i;
    if (f.type === 'area') { i = el('textarea'); i.rows = f.rows || 4; }
    else if (f.type === 'select') { i = el('select'); f.options.forEach(o => { const op = el('option', '', o || '미분류'); op.value = o; i.append(op); }); }
    else i = el('input');
    i.value = values && values[f.key] != null ? values[f.key] : (f.def || '');
    inputs[f.key] = i; m.append(i);
  });
  if (opts && opts.ref) opts.ref.read = () => { const v = {}; Object.keys(inputs).forEach(k => v[k] = inputs[k].value.trim()); return v; };
  const row = el('div', 'row'); row.style.marginTop = '16px';
  const save = el('button', 'pri', '저장'); const cancel = el('button', '', '취소');
  const msg = el('span', 'note');
  save.onclick = async () => {
    const v = {}; Object.keys(inputs).forEach(k => v[k] = inputs[k].value.trim());
    save.disabled = true; msg.textContent = '저장 중…';
    try { const r = await onSave(v); if (r && r.ok === false) { msg.textContent = r.error || '실패'; save.disabled = false; return; } closeModal(); if (opts && opts.after) opts.after(); else refreshData(); }
    catch (e) { msg.textContent = '실패: ' + e.message; save.disabled = false; }
  };
  cancel.onclick = closeModal;
  row.append(save, cancel);
  if (opts && opts.extra) opts.extra.forEach(b => row.append(b));
  row.append(msg); m.append(row);
  $('modal').classList.remove('hide');
  const first = m.querySelector('input,textarea'); if (first) first.focus();
}


/* 글자 크기 (이 기기에만 저장) */
(function(){
  const z = S.get('t_zoom') || '1'; document.documentElement.style.setProperty('--zoom', z);
  const sel = $('sZoom'); if (sel) { sel.value = z; sel.onchange = () => { S.set('t_zoom', sel.value); document.documentElement.style.setProperty('--zoom', sel.value); }; }
  const cost = document.querySelector('.cost'); if (cost) cost.onclick = () => cost.classList.toggle('open');      // 휴대폰: 한 줄로 접힌 안내를 눌러서 펼치기
})();
function srSay(t){ const r = $('srLive'); if (!r) return; r.textContent = ''; setTimeout(() => { r.textContent = t; }, 50); }   // 화면 낭독기에 알리기
/* 화면 오류를 방의 '오류기록' 탭으로 보낸다 (방에 들어와 있을 때만, 한 화면에서 5건까지) */
let errSent = 0;
function reportErr(msg){
  try {
    if (errSent >= 5 || !cfg.url || !cfg.pw || $('app').classList.contains('hide')) return; errSent++;
    const ver = typeof APP_VER !== 'undefined' ? APP_VER : '';
    fetch(cfg.url, { method: 'POST', body: JSON.stringify({ action: 'clientErr', pw: cfg.pw, pt: ptFor(cfg.url), name: cfg.name || '', ver, msg: String(msg).slice(0, 500) }) }).catch(() => {});
  } catch (_) {}
}
window.addEventListener('error', e => reportErr((e.message || '오류') + ' @ ' + String(e.filename || '').split('/').pop() + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', e => reportErr('Promise: ' + String(e.reason && (e.reason.stack || e.reason.message) || e.reason).slice(0, 400)));
