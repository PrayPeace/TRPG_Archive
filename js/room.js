/* TRPG Archive · 방 화면: 회의록 · 이름 형광펜 · 참여자 · 요약/정리 표시 · 방 목록 · 단서 · 북마크 · 다음 할 일 · 방 테마
 * 모든 js 파일은 index.html 아래에서 순서대로 읽고 이름(함수·변수)을 함께 쓴다. */
'use strict';
/* ── 회의록 ──
 * 줄은 시각 순으로 정렬해서 보여 준다 (사람마다 4초씩 묶어 보내므로 도착 순서와 말한 순서가 다를 수 있음).
 * 같은 사람이 20초 안에 이어서 말한 줄은 한 문단으로 묶고, 다른 사람이 끼어들면 나눈다.
 * 묶어도 줄마다 번호·시각은 그대로 남아 있다 (마우스를 올리면 보임). */
let lastId = 0, allLines = [], lineIds = new Set(), lastActivity = Date.now(), minLoaded = 0, hasOlder = false;
const GAP_MS = 20000;
const tms = t => { const d = Date.parse(String(t).replace(' ', 'T') + '+09:00'); return isNaN(d) ? 0 : d; };
const cmpLine = (a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : a.id - b.id);
function addLogLines(lines, opts){
  opts = opts || {};
  let added = 0;
  lines.forEach(l => { if (lineIds.has(l.id)) return; lineIds.add(l.id); allLines.push(l); added++; if (!minLoaded || l.id < minLoaded) minLoaded = l.id; });
  if (!added) return;
  if (!opts.quiet) lastActivity = Date.now();
  const prevLast = allLines.length > added ? logTail : null;
  allLines.sort(cmpLine);
  // 흔한 경우(새 줄이 모두 맨 뒤에 붙음)는 전체를 다시 그리지 않고 끝에만 붙인다 (긴 캠페인에서도 가볍게)
  const fresh = allLines.slice(-added);
  if (!opts.keepTop && prevLast && $('log').childElementCount && cmpLine(fresh[0], prevLast) > 0 && fresh.every(l => lines.indexOf(l) >= 0)) appendLog(fresh);
  else renderLog(opts.keepTop);
}
let logTail = null;      // 화면에 마지막으로 그린 줄
function lineSpan(l){ const sp = el('span'); sp.dataset.id = l.id; sp.title = '#' + l.id + ' · ' + String(l.time).slice(11, 19); sp.append(linkify(l.text)); return sp; }
function groupEl(g, mineOnly){
  const d = el('div', 'line'); d.dataset.name = g.name;
  if (mineOnly && g.name !== cfg.name) d.classList.add('hide');
  d.append(el('span', 't', String(g.lines[0].time).slice(11, 19)));
  const body = el('div', 'tx');
  const n = el('span', 'n', g.name); n.dataset.who = g.name; n.style.color = colorOf(g.name); body.append(n);
  g.lines.forEach((l, i) => { if (i) body.append(' '); body.append(lineSpan(l)); });
  d.append(body); d._last = g.lines[g.lines.length - 1]; return d;
}
function appendLog(fresh){
  const box = $('log'), atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80, mineOnly = $('onlyMine').checked;
  fresh.forEach(l => {
    const lastEl = box.lastElementChild, prev = logTail;
    if (prev && l.session === prev.session && lastEl && lastEl.classList.contains('line') && lastEl.dataset.name === l.name && lastEl._last && tms(l.time) - tms(lastEl._last.time) <= GAP_MS) {
      const body = lastEl.querySelector('.tx'); body.append(' ', lineSpan(l)); lastEl._last = l;
    } else {
      if (!prev || l.session !== prev.session) box.append(el('div', 'shdr', '세션 ' + l.session));
      box.append(groupEl({ name: l.name, session: l.session, lines: [l] }, mineOnly));
    }
    logTail = l;
  });
  if (atBottom) box.scrollTop = box.scrollHeight;
}
function groupLines(list){
  const out = []; let g = null, sess = null;
  list.forEach(l => {
    if (l.session !== sess) { sess = l.session; out.push({ hdr: l.session }); g = null; }
    if (g && g.name === l.name && tms(l.time) - tms(g.lines[g.lines.length - 1].time) <= GAP_MS) g.lines.push(l);
    else { g = { name: l.name, session: l.session, lines: [l] }; out.push(g); }
  });
  return out;
}
function renderLog(keepTop){
  const box = $('log');
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const oldH = box.scrollHeight, oldTop = box.scrollTop;
  const mineOnly = $('onlyMine').checked;
  box.innerHTML = '';
  if (hasOlder) { const mb = el('button', 'more', '▲ 이전 대화 더 보기'); mb.id = 'moreBtn'; mb.onclick = loadOlder; box.append(mb); }
  const frag = document.createDocumentFragment();
  groupLines(allLines).forEach(g => {
    if (g.hdr != null) { frag.append(el('div', 'shdr', '세션 ' + g.hdr)); return; }
    frag.append(groupEl(g, mineOnly));
  });
  box.append(frag); logTail = allLines[allLines.length - 1] || null;
  if (keepTop) box.scrollTop = box.scrollHeight - oldH + oldTop;
  else if (atBottom) box.scrollTop = box.scrollHeight;
  else box.scrollTop = oldTop;
}
async function loadOlder(){
  const b = $('moreBtn'); if (b) { b.disabled = true; b.textContent = '불러오는 중…'; }
  try {
    const r = await api('history', { before: minLoaded, limit: 300 });
    if (!r.ok) throw new Error(r.error);
    hasOlder = r.hasMore;
    if (r.lines.length) addLogLines(r.lines, { quiet: true, keepTop: true }); else renderLog(true);
  } catch (e) { toast('이전 대화를 못 불러왔어요: ' + e.message); if (b) { b.disabled = false; b.textContent = '▲ 이전 대화 더 보기'; } }
}
function resetLog(){ allLines = []; lineIds = new Set(); lastId = 0; minLoaded = 0; hasOlder = false; logTail = null; $('log').innerHTML = ''; }
$('onlyMine').onchange = () => { const m = $('onlyMine').checked; [...$('log').querySelectorAll('.line')].forEach(d => d.classList.toggle('hide', m && d.dataset.name !== cfg.name)); };
async function copyText(btn, text){
  const label = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = '복사됨'; setTimeout(() => btn.textContent = label, 1500); return true; }
  catch(_) { showCopyBox(text); return false; }
}
// 브라우저가 자동 복사를 막으면 글 상자를 띄워서 직접 복사하게 한다
function showCopyBox(text){
  const m = $('modalBody'); m.className = 'm'; m.innerHTML = '';
  m.append(el('h3', '', '복사하기'), el('div', 'note', '아래 글을 전체 선택(Ctrl+A) 후 복사(Ctrl+C) 하세요.'));
  const ta = el('textarea'); ta.rows = 14; ta.value = text; ta.readOnly = true; ta.style.marginTop = '10px'; m.append(ta);
  const row = el('div', 'row'); row.style.marginTop = '10px';
  const cb = el('button', 'pri', '복사'); cb.onclick = () => { ta.select(); try { document.execCommand('copy'); cb.textContent = '복사됨'; } catch(_) {} };
  const x = el('button', '', '닫기'); x.onclick = closeModal; row.append(cb, x); m.append(row);
  $('modal').classList.remove('hide'); ta.focus(); ta.select();
}
function linesToText(lines){
  return groupLines(lines.slice().sort(cmpLine)).map(g => g.hdr != null ? '\n■ 세션 ' + g.hdr : '[' + String(g.lines[0].time).slice(11, 19) + '] ' + g.name + ': ' + g.lines.map(l => l.text).join(' ')).join('\n').trim();
}
async function loadSessions(){
  try {
    const r = await api('sessions'); if (!r.ok) return;
    const sel = $('sessSel'), keep = sel.value; sel.innerHTML = '';
    if (!r.sessions.length) { const o = el('option', '', '아직 대화 없음'); o.value = ''; sel.append(o); return; }
    r.sessions.slice().reverse().forEach(x => { const o = el('option', '', '세션 ' + x.session + ' (' + x.count + '줄)'); o.value = x.session; sel.append(o); });
    if (keep && [...sel.options].some(o => o.value === keep)) sel.value = keep;
  } catch(_) {}
}
$('sessSel').onfocus = loadSessions;
$('copySess').onclick = async () => {
  const b = $('copySess'), sess = $('sessSel').value;
  if (!sess) { await loadSessions(); if (!$('sessSel').value) { toast('복사할 세션이 없어요'); return; } }
  const label = '선택한 세션 전체 복사'; b.disabled = true; b.textContent = '서버에서 받는 중…';
  try {
    const r = await api('sessionLines', { session: $('sessSel').value });
    if (!r.ok) throw new Error(r.error);
    b.textContent = label;
    await copyText(b, '■ 세션 ' + r.session + ' 전체 회의록 (' + r.lines.length + '줄)\n' + linesToText(r.lines).replace(/^■ 세션 \d+\n/, ''));
  } catch (e) { toast('세션을 못 받아 왔어요: ' + e.message); b.textContent = label; }
  b.disabled = false;
};

/* ── 이름 자동 링크 (형광펜) ──
 * 정리 목록의 이름뿐 아니라 흔한 변형도 잡는다.
 *  - 띄어쓰기·"의" 무시: "이니드 캐링턴의 장미 정원" = "이니드캐링턴 장미정원"
 *  - 장소: 뒤쪽 이름("장미 정원", "호텔"), 끝이 호텔·저택 같은 말이면 앞부분("보든 암스")도
 *  - 인물: 이름 조각("루시", "프레이저"), 괄호 속 다른 표기("알프레드 해켓(헤켓)" → "헤켓", "알프레드 헤켓")
 *  - 정리 항목의 "다른 이름"(aka, AI가 채우거나 직접 적음)
 *  - 발음이 헷갈리는 모음은 같게 본다: ㅐ=ㅔ, ㅒ=ㅖ, ㅙ=ㅚ=ㅞ (세 글자 이상이면 ㅓ=ㅡ도: 브라이든=브라이던)
 *  - 312호 같은 방 번호는 장소 색으로 칠한다 (같은 번호의 장소 항목이 있으면 그걸 연다)
 *  두 대상이 같은 조각을 가지면 그 조각은 쓰지 않는다. */
let linkRe = null, linkMap = {}, linkRooms = {};
const LK_TITLES = new Set(['박사','교수','씨','부인','경','선생','선생님','신부','목사','경감','형사','의사','집사','양','군','님','미스','미스터','부장','사장','회장','교수님','경위','경사','반장','기자','변호사','주인','아저씨','아줌마','할머니','할아버지','아가씨','도련님']);
const LK_PLACE_END = new Set(['호텔','저택','집','병원','교회','성당','도서관','정원','서재','카페','식당','은행','경찰서','학교','대학','대학교','공원','묘지','항구','역','마을','농장','상점','가게','사무실','연구소','박물관','극장','바','클럽','여관','아파트','빌딩','별장','오두막','숲','호수','다리','광장','창고','지하실','다락방','방','홀','관','당','원','소','점']);
const ROOM_RE = /\d{1,4}\s*호(?:실)?(?![선기차])/;
// 모음 묶음: 같은 묶음이면 같은 글자로 본다
const VG = { 1: 'a', 5: 'a', 3: 'b', 7: 'b', 10: 'c', 11: 'c', 15: 'c', 4: 'd', 18: 'd' };
const VG_SET = { a: [1, 5], b: [3, 7], c: [10, 11, 15], d: [4, 18] };
function lkCanon(ch){
  const c = ch.charCodeAt(0) - 0xAC00; if (c < 0 || c > 11171) return ch;
  const v = Math.floor((c % 588) / 28), g = VG[v]; if (!g) return ch;
  return String.fromCharCode(0xAC00 + Math.floor(c / 588) * 588 + VG_SET[g][0] * 28 + (c % 28));
}
const lkKey = t => [...String(t).replace(/\s+|의/g, '')].map(lkCanon).join('');
function lkChar(ch, loose){
  const c = ch.charCodeAt(0) - 0xAC00;
  if (c >= 0 && c <= 11171) {
    const v = Math.floor((c % 588) / 28), g = VG[v];
    if (g && (g !== 'd' || loose)) return '[' + VG_SET[g].map(x => String.fromCharCode(0xAC00 + Math.floor(c / 588) * 588 + x * 28 + (c % 28))).join('') + ']';
  }
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function lkPattern(alias){
  const loose = alias.replace(/\s/g, '').length >= 3;
  const w = alias.split(/\s+/).filter(Boolean).map((x, i, a) => [...(i < a.length - 1 ? x.replace(/의$/, '') : x)].map(ch => lkChar(ch, loose)).join(''));
  return w.join('(?:\\s*의)?\\s*');
}
// 이름 하나 → [정식 이름, 변형들]
function lkAliases(sec, raw, aka){
  const out = new Set();
  // 탐사자 이름이 "프레이피스 = 루시 프레이저"처럼 적혀 있으면 오른쪽(캐릭터)이 이름, 왼쪽(플레이어)은 다른 이름
  if (sec === 'pcs') { const mm = /^(.+?)\s*(?:=|→|->|:)\s*(.+)$/.exec(String(raw)); if (mm) { raw = mm[2]; aka = [aka, mm[1]].filter(Boolean).join(', '); } }
  const paren = []; const nm = String(raw).replace(/[(（\[]([^)）\]]*)[)）\]]/g, (_, x) => { paren.push(x.trim()); return ' '; }).replace(/\s+/g, ' ').trim();
  if (nm.length >= 2) out.add(nm);
  const w = nm.split(' ').filter(Boolean);
  paren.forEach(x => x.split(/[,，/]/).map(y => y.trim()).filter(y => y.length >= 2 && !/^[A-Za-z .'-]+$/.test(y)).forEach(y => {
    out.add(y); if (w.length >= 2 && y.split(' ').length === 1) out.add(w.slice(0, -1).concat([y]).join(' '));
  }));
  if (sec === 'places') {
    for (let i = 1; i < w.length; i++) { const tail = w.slice(i).join(' ').replace(/^.*의\s+/, ''); if (tail.replace(/\s/g, '').length >= 2) out.add(tail); }
    if (w.length >= 2 && LK_PLACE_END.has(w[w.length - 1])) { const head = w.slice(0, -1).join(' ').replace(/의$/, ''); if (head.replace(/\s/g, '').length >= 2) out.add(head); }
  }
  // 인물 이름 조각. "루시의 상관"의 "루시"처럼 '~의'로 끝나는 말은 다른 사람을 가리키는 꾸밈말이라 조각으로 쓰지 않는다
  if ((sec === 'npcs' || sec === 'pcs') && w.length >= 2) w.forEach(x => { if (/의$/.test(x)) return; if (x.length >= 2 && !LK_TITLES.has(x)) out.add(x); });
  String(aka || '').split(/[,，、\n]+/).map(x => x.trim()).filter(x => x.length >= 2 && x.length <= 30).forEach(x => {
    out.add(x);
    if (sec === 'npcs' || sec === 'pcs') x.split(/\s+/).forEach(y => { if (/의$/.test(y)) return; if (y.length >= 2 && !LK_TITLES.has(y)) out.add(y); });     // 다른 이름이 "루시 프레이저"면 "루시", "프레이저"도
  });
  return { name: nm, list: [...out] };
}
// 캐릭터 탭(캐릭터시트)의 탐사자 이름도 탐사자로 잇는다: 정리의 탐사자 항목과 플레이어·이름이 맞으면 그 항목의 다른 이름으로, 없으면 캐릭터 카드로
function withChars(n, chars){
  const pcs = ((n && n.pcs) || []).map(x => Object.assign({}, x));
  (chars || []).forEach(ch => {
    const nm = String(ch.name || '').trim(); if (nm.length < 2) return;
    const hit = pcs.find(x => (ch.player && (x.player === ch.player || x.name === ch.player)) || lkKey(x.name || '') === lkKey(nm));
    if (hit) { if (lkKey(hit.name || '') !== lkKey(nm)) hit.aka = [hit.aka, nm].filter(Boolean).join(', '); }
    else pcs.push({ id: 'char:' + (ch.tab || nm), name: nm });
  });
  return Object.assign({}, n || {}, { pcs });
}
function buildLinks(n){
  linkMap = {}; linkRooms = {};
  const full = {}, part = {};
  // 탐사자를 먼저 본다: 같은 사람이 NPC 목록에도 잘못 들어가 있으면 탐사자(초록)가 이긴다
  [['pcs','name'],['npcs','name'],['places','name'],['handouts','title']].forEach(([sec, k]) => (n && n[sec] || []).forEach(it => {
    const raw = String(it[k] || '').trim(); if (raw.length < 2) return;
    const ref = { sec, id: it.id };
    // 방 번호가 든 장소("보든 암스 호텔 312호")는 번호로만 잇는다 → 글에서는 "보든 암스 호텔"(호텔)과 "312호"(방)가 따로 칠해진다
    if (sec === 'places') { const rm = ROOM_RE.exec(raw); if (rm) { const rk = rm[0].replace(/\s/g, ''); if (!linkRooms[rk]) linkRooms[rk] = ref; return; } }
    const al = lkAliases(sec, raw, sec === 'handouts' ? '' : it.aka);
    if (al.name.length >= 2 && !full[lkKey(al.name)]) full[lkKey(al.name)] = { ref, alias: al.name };
    al.list.forEach(a => { const key = lkKey(a); if (key === lkKey(al.name)) return; (part[key] = part[key] || []).push({ ref, alias: a, who: lkKey(al.name) }); });
  }));
  const pats = [];
  Object.keys(full).forEach(key => { linkMap[key] = full[key].ref; pats.push(full[key].alias); });
  Object.keys(part).forEach(key => {
    if (full[key]) {                                                             // 다른 대상의 정식 이름이면 그쪽이 이긴다
      // 단, NPC 목록에 "루시"처럼 탐사자 이름 조각만 따로 들어가 있으면(잘못 정리된 것) 탐사자로 본다
      const pc = part[key].filter(x => x.ref.sec === 'pcs');
      if (full[key].ref.sec === 'npcs' && pc.length && new Set(pc.map(x => x.who)).size === 1) linkMap[key] = pc[0].ref;
      return;
    }
    // 서로 다른 대상이 같은 조각을 가지면 애매해서 뺀다. 같은 이름이 탐사자·NPC 양쪽에 있는 경우(같은 사람)는 앞의 것(탐사자)으로
    // 여러 대상에 걸치면: 탐사자가 한 사람뿐이면 탐사자로(주인공 이름이 우선), 아니면 애매해서 뺀다
    let cand = part[key];
    if (new Set(cand.map(x => x.who)).size > 1) { const pc = cand.filter(x => x.ref.sec === 'pcs'); if (pc.length && new Set(pc.map(x => x.who)).size === 1) cand = pc; else return; }
    linkMap[key] = cand[0].ref; pats.push(cand[0].alias);
  });
  const sorted = pats.sort((a, b) => lkKey(b).length - lkKey(a).length).map(lkPattern);
  sorted.push(ROOM_RE.source);                                                   // 방 번호는 맨 마지막 (이름에 들어 있으면 이름이 먼저 잡힌다)
  linkRe = new RegExp('(' + sorted.join('|') + ')', 'g');
}
// 글자 안의 NPC·장소 이름을 형광펜으로 칠하고 눌러서 열 수 있게 만든다 (장소 파랑, NPC 노랑, 탐사자 초록, 핸드아웃 보라)
function linkify(text){
  const frag = document.createDocumentFragment(); text = String(text == null ? '' : text);
  if (!linkRe) { frag.append(text); return frag; }
  let last = 0; linkRe.lastIndex = 0; let m;
  while ((m = linkRe.exec(text))) {
    let ref = linkMap[lkKey(m[0])];
    if (!ref && ROOM_RE.test(m[0])) {                                            // 방 번호: 장소 색만 칠하고, 같은 번호의 장소가 있으면 연결
      ref = linkRooms[m[0].replace(/\s/g, '')] || { sec: 'places', id: null };
    }
    if (!ref) continue;
    if (m.index > last) frag.append(text.slice(last, m.index));
    const a = el('span', 'lk k-' + ref.sec, m[0]);
    if (ref.id && String(ref.id).indexOf('char:') === 0) a.onclick = e => { e.stopPropagation(); showTab('chars'); };
    else if (ref.id) a.onclick = e => { e.stopPropagation(); openDetail(ref.sec, ref.id); };
    else { a.style.cursor = 'default'; a.title = '장소 목록에 아직 없는 방이에요'; }
    if (a.onclick) { a.tabIndex = 0; a.setAttribute('role', 'button'); }      // 키보드로도 열 수 있게 (Enter·Space)
    frag.append(a); last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}
function redrawLog(){ renderLog(); }

/* ── 참여자 ── */
let keeperName = '';
function renderWho(list){
  const box = $('whoList'); box.innerHTML = '';
  const me = (list || []).find(p => p.name === cfg.name);
  const items = (list || []).slice().sort((a, b) => (b.online - a.online) || (a.name === keeperName ? -1 : b.name === keeperName ? 1 : a.name.localeCompare(b.name)));
  if (!me) items.unshift({ name: cfg.name, online: true, mic: micStatus });
  items.forEach(p => {
    const w = el('div', 'who' + (p.online ? '' : ' off'));
    const d = el('span', 'dot'); d.dataset.whodot = p.name; d.style.background = colorOf(p.name);
    const nm = el('div', 'nm'); const t = el('span', '', p.name); t.dataset.who = p.name; t.style.color = colorOf(p.name); nm.append(t);
    if (p.name === keeperName) nm.append(el('span', 'badge', '마스터'));
    if (p.name === cfg.name) nm.append(el('span', 'note', ' (나)'));
    const st = el('span', 'st', !p.online ? '접속 끊김' : p.mic === 'on' ? '🎙 받아쓰는 중' : p.mic === 'conn' ? '… 연결 중' : p.mic === 'err' ? '⚠ 오류' : '🔇 꺼 둠');
    w.append(d, nm, st); box.append(w);
  });
  try { checkAlerts(list); } catch(_) {}
}

/* ── 자료 표시 ── */
let data = null, ver = {};
let RULEUI = { key: 'coc', name: '크툴루의 부름', pc: '탐사자', en: 'INVESTIGATOR' };
/* ── 방 목록: 이 기기에 저장한 방들 [{name,url,pw}] ── */
function roomsGet(){ try { const a = JSON.parse(S.get('t_rooms') || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; } }
function roomsSet(a){ S.set('t_rooms', JSON.stringify(a.slice(0, 20))); }
function roomRemember(name){
  if (!cfg.url) return;
  const a = roomsGet(), i = a.findIndex(x => scriptUrl(x.url) === cfg.url);
  if (i >= 0) { if (name && !a[i].named) a[i].name = name; a[i].pw = cfg.pw; }
  else a.unshift({ name: name || '방 ' + (a.length + 1), url: cfg.url, pw: cfg.pw });
  roomsSet(a); renderRooms();
}
function renderRooms(){
  const box = $('roomList'); if (!box) return; box.innerHTML = '';
  const a = roomsGet();
  if (!a.length) { box.append(el('div', 'note', '아직 저장된 방이 없어요')); return; }
  a.forEach((r, i) => {
    const cur = scriptUrl(r.url) === cfg.url;
    const row = el('div', 'row'); row.style.cssText = 'padding:6px 8px;border:1px solid var(--line);border-radius:8px;margin-bottom:5px;background:var(--bg2)';
    row.append(el('b', '', (cur ? '🏠 ' : '') + r.name), el('span', 'grow'));
    if (cur) row.append(el('span', 'note', '지금 방'));
    else { const go = el('button', 'pri', '이 방으로'); go.onclick = () => switchRoom(r); row.append(go); }
    const rn = el('button', '', '이름'); rn.onclick = () => { const v = prompt('방 이름', r.name); if (v && v.trim()) { const b = roomsGet(); b[i].name = v.trim().slice(0, 40); b[i].named = true; roomsSet(b); renderRooms(); if (cur) $('roomName').textContent = b[i].name; } };
    row.append(rn);
    if (!cur) { const rm = el('button', '', '빼기'); rm.onclick = () => { if (!confirm('"' + r.name + '"을 이 기기의 목록에서 뺄까요? (방과 기록은 지워지지 않아요)')) return; const b = roomsGet(); b.splice(i, 1); roomsSet(b); renderRooms(); }; row.append(rm); }
    box.append(row);
  });
}
async function switchRoom(r){
  if (queue.length && !confirm('아직 저장 안 된 말이 ' + queue.length + '줄 있어요. 이 기기에 남겨 두고 옮길까요? (이 방에 다시 오면 보내요)')) return;
  stopAll('user');
  try { navigator.sendBeacon && navigator.sendBeacon(cfg.url, new Blob([JSON.stringify({ action: 'bye', pw: cfg.pw, pt: ptFor(cfg.url), name: cfg.name })], { type: 'text/plain' })); } catch(_) {}
  if (cfg.kt) { try { await Promise.race([post({ action: 'klogout', kt: cfg.kt }), sleep(2000)]); } catch(_) {} }
  SS.del('t_kt'); S.del('t_kt'); S.del('t_colorSent');
  S.set('t_url', r.url); S.set('t_pw', r.pw || ''); SS.set('t_in', scriptUrl(r.url)); SS.set('t_enter', '1');
  location.reload();
}
function applyRule(r){
  if (!r || !r.pc) return;
  RULEUI = r;
  if (SEC.pcs) { SEC.pcs.title = r.pc; SEC.pcs.kind = r.en || 'CHARACTER'; }
  const tb = document.querySelector('[data-t="notes"]'); if (tb) tb.textContent = '장소 · NPC · ' + r.pc + ' · 단서';
  const sel = $('kRule');
  if (sel) { if (!sel.options.length) (r.list || []).forEach(o => { const op = document.createElement('option'); op.value = o.key; op.textContent = o.name; sel.append(op); }); if (document.activeElement !== sel) sel.value = r.key; }
  const ns = $('nrRule'); if (ns && !ns.options.length) { (r.list || []).forEach(o => { const op = document.createElement('option'); op.value = o.key; op.textContent = o.name; ns.append(op); }); ns.value = r.key; }
}
const SEC = {
  npcs:    { title: 'NPC', icon: '👤', kind: 'NPC', key: 'name', photo: true,
             fields: [{ key: 'name', label: '이름' }, { key: 'aka', label: '다른 이름 (쉼표로: 이름만·성만·별명·다르게 들린 표기. 요약에서 이 말도 색칠돼요)' }, { key: 'affil', label: '소속·직업' }, { key: 'age', label: '나이' },
                      { key: 'said', label: '인상적인 대사', type: 'area', rows: 3 }, { key: 'traits', label: '특징 (쉼표로 구분하면 태그로 보여요)', type: 'area', rows: 3 }, { key: 'relation', label: '탐사자들과의 관계' }] },
  pcs:     { title: '탐사자', icon: '🧭', kind: 'INVESTIGATOR', key: 'name', photo: true,
             fields: [{ key: 'name', label: '캐릭터 이름' }, { key: 'aka', label: '다른 이름 (쉼표로: 이름만·성만·별명)' }, { key: 'player', label: '플레이어' },
                      { key: 'said', label: '인상적인 발언', type: 'area', rows: 3 }, { key: 'traits', label: '특징 (쉼표로 구분하면 태그로 보여요)', type: 'area', rows: 3 }, { key: 'relation', label: '동료·NPC와의 관계' }] },
  places:  { title: '장소', icon: '📍', kind: 'PLACE', key: 'name', photo: true,
             fields: [{ key: 'name', label: '장소 이름' }, { key: 'aka', label: '다른 이름 (쉼표로: 줄임말 등. 예: 호텔, 보든 암스)' }, { key: 'desc', label: '설명', type: 'area' }, { key: 'found', label: '발견한 것·일어난 일', type: 'area' }] },
  clues:   { title: '단서 · 정보', icon: '🔎', kind: 'CLUE', key: 'text',
             fields: [{ key: 'text', label: '내용', type: 'area' }, { key: 'status', label: '상태', type: 'select', options: ['미해결', '해결'] },
                      { key: 'kind', label: '종류 (확인=묘사·판정으로 확인된 사실 · 주장=NPC가 한 말 · 추측=탐사자의 추리)', type: 'select', options: ['', '확인', '주장', '추측'] }] },
  handouts:{ title: '핸드아웃', icon: '📜', kind: 'HANDOUT', key: 'title',
             fields: [{ key: 'title', label: '제목' }, { key: 'text', label: '내용', type: 'area', rows: 6 }] }
};
const SEC_ORDER = ['npcs', 'pcs', 'places', 'clues', 'handouts'];
function findItem(sec, id){ return data && data.notes && (data.notes[sec] || []).find(x => x.id === id); }
function splitTags(t){ return String(t || '').split(/[,，·\n/]+/).map(x => x.trim()).filter(Boolean); }

function editNote(sec, item){
  const def = SEC[sec];
  const extra = [], ref = {};
  if (item && item.id) {
    const del = el('button', 'danger', '삭제'); del.dataset.label = '삭제';
    twoStep(del, async () => { const r = await post({ action: 'noteDelete', sec, id: item.id }); if (r.ok) { closeModal(); refreshData(); toast('지웠어요. AI도 다시 만들지 않아요'); } else toast(r.error); });
    extra.push(del);
  }
  // "AI에게 맡기기": 지금 창에 적은 내용(저장하지 않았어도)을 그대로 저장하고, AI가 대화를 읽고 보강하게 한다. 실패해도 창과 입력은 그대로 남는다.
  const ai = el('button', '', item && item.locked ? 'AI에게 다시 맡기기' : 'AI에게 맡기기'); const aiLabel = ai.textContent;
  ai.title = '입력한 내용을 저장하고, AI가 이 이름이 나온 대화를 읽어 비어 있는 칸을 채우고 고쳐요 (AI가 바꾼 칸은 🔒이 풀린 채로 남아요)';
  ai.onclick = async () => {
    const v = ref.read ? ref.read() : {};
    if (!v[def.key]) { toast(def.fields[0].label + '을(를) 먼저 적어 주세요'); return; }
    ai.disabled = true; ai.textContent = '저장하고 AI가 대화를 읽는 중… (최대 1~2분)';
    const ac = window.AbortController ? new AbortController() : null, to = setTimeout(() => ac && ac.abort(), 170000);
    let r;
    try { r = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ action: 'noteHandoff', pw: cfg.pw, pt: ptFor(cfg.url), sec, item: Object.assign({}, item || {}, v, { id: item && item.id }) }), signal: ac ? ac.signal : undefined }).then(x => x.json()); }
    catch (e) { r = { ok: false, error: e.name === 'AbortError' ? '서버 응답이 오래 걸려요. 입력은 이 창에 그대로 있어요. 잠시 뒤 새로고침해서 저장됐는지 확인해 주세요' : '연결이 끊겼어요. 입력은 이 창에 그대로 있으니 다시 눌러 주세요' }; }
    clearTimeout(to);
    if (r && r.ok) { closeModal(); refreshData(); toast(r.message || '저장했어요'); }
    else { ai.disabled = false; ai.textContent = aiLabel; toast((r && r.error) || '실패했어요 (입력은 그대로 있어요)'); }
  };
  extra.push(ai);
  openForm((item ? '고치기 · ' : '추가 · ') + def.title, def.fields, item || {}, v => {
    if (!v[def.key]) return { ok: false, error: def.fields[0].label + '을(를) 적어 주세요' };
    return post({ action: 'noteSave', sec, item: Object.assign({}, item || {}, v, { id: item && item.id }) });
  }, { extra, ref, hint: '[저장]하면 🔒 사람이 확정한 항목이 되어 AI가 바꾸지 않아요. [AI에게 맡기기]는 적은 내용을 저장한 뒤 AI가 대화를 읽고 보강해요 (적은 내용은 지워지지 않아요).' });
}

// 사진 고르기: 올라온 이미지 중에서 고르거나 새로 올리기
function pickPhoto(sec, item){
  const m = $('modalBody'); m.className = 'm'; m.innerHTML = '';
  m.append(el('h3', '', '사진 정하기 · ' + (item.name || item.title || '')));
  m.append(el('div', 'note', '이미지 탭에 올라온 사진 중에서 고르거나, 새 사진을 올려요.'));
  const g = el('div', 'pgrid'); g.style.margin = '12px 0';
  ((data && data.images) || []).slice().reverse().forEach(im => {
    const b = el('button', 'pcard'); const box = el('div', 'im'); const i = el('img'); i.src = im.url; box.append(i); b.append(box);
    const tx = el('div', 'tx'); tx.append(el('b', '', im.title || '이미지')); b.append(tx);
    b.onclick = async () => { const r = await post({ action: 'noteSave', sec, item: Object.assign({}, item, { img: im.url }) }); if (r.ok) { closeModal(); await refreshData(); openDetail(sec, item.id); } else toast(r.error); };
    g.append(b);
  });
  if (!g.children.length) g.append(el('div', 'empty', '아직 올라온 이미지가 없어요'));
  m.append(g);
  const row = el('div', 'row');
  const fi = el('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.className = 'grow';
  const up = el('button', 'pri', '새 사진 올리기'); const msg = el('span', 'note');
  up.onclick = async () => { const f = fi.files[0]; if (!f) { msg.textContent = '사진을 골라 주세요'; return; } up.disabled = true; msg.textContent = '올리는 중…';
    try { const d64 = await shrink(f, 900, 0.88); const r = await post({ action: 'noteImage', sec, id: item.id, data: d64 }); if (r.ok) { closeModal(); await refreshData(); openDetail(sec, item.id); } else { msg.textContent = r.error; up.disabled = false; } }
    catch (e) { msg.textContent = '실패: ' + e.message; up.disabled = false; } };
  const none = el('button', '', '사진 빼기');
  none.onclick = async () => { const r = await post({ action: 'noteSave', sec, item: Object.assign({}, item, { img: '' }) }); if (r.ok) { closeModal(); await refreshData(); openDetail(sec, item.id); } };
  const cancel = el('button', '', '닫기'); cancel.onclick = closeModal;
  row.append(fi, up, none, cancel, msg); m.append(row);
  $('modal').classList.remove('hide');
}

// 이세카이 인물 창처럼: 왼쪽 큰 사진, 오른쪽 이름·대사·표·태그
function openDetail(sec, id){
  const it = findItem(sec, id); if (!it) { toast('항목을 찾지 못했어요'); return; }
  const def = SEC[sec];
  const m = $('modalBody'); m.className = 'm wide'; m.innerHTML = '';
  const dv = el('div', 'dv');
  if (def.photo) {
    const im = el('div', 'im');
    if (it.img) { const i = el('img'); i.src = it.img; i.alt = it.name || ''; i.onclick = () => { $('lbImg').src = it.img.replace(/sz=w\d+/, 'sz=w2400'); $('lightbox').classList.remove('hide'); }; i.style.cursor = 'zoom-in'; im.append(i); }
    else im.append(el('div', 'ph0', (it.name || '?').slice(0, 1)));
    const pb = el('button', '', it.img ? '사진 바꾸기' : '사진 넣기'); pb.style.cssText = 'position:absolute;bottom:10px;left:10px;font-size:12px;background:rgba(0,0,0,.6)';
    pb.onclick = () => pickPhoto(sec, it); im.append(pb);
    dv.append(im);
  } else dv.style.gridTemplateColumns = '1fr';
  const bd = el('div', 'bd');
  bd.append(el('div', 'kind', '✦ ' + def.kind + (it.locked ? ' · 🔒 사람이 확정함' : '')));
  bd.append(el('h2', '', it[def.key] || ''));
  if (sec === 'npcs' || sec === 'pcs') {
    const sub = (sec === 'pcs' ? [it.player && '플레이어 ' + it.player] : [it.affil, it.age && (String(it.age).match(/세|살/) ? it.age : it.age + '세')]).filter(Boolean).join(' · ');
    if (sub) bd.append(el('div', 'sub', sub));
    if (it.said) { const q = el('div', 'quote'); q.append(linkify(it.said)); bd.append(q); }
    const kv = el('dl', 'kv');
    if (it.relation) { kv.append(el('dt', '', '관계')); const dd = el('dd'); dd.append(linkify(it.relation)); kv.append(dd); }
    const tags = splitTags(it.traits);
    if (tags.length) { kv.append(el('dt', '', '특징')); const dd = el('dd'); const tg = el('div', 'tags'); tags.forEach(t => tg.append(el('span', 'tg', t))); dd.append(tg); kv.append(dd); }
    if (kv.children.length) bd.append(kv);
  } else if (sec === 'places') {
    const kv = el('dl', 'kv');
    [['설명', it.desc], ['발견', it.found]].forEach(([k, v]) => { if (v) { kv.append(el('dt', '', k)); const dd = el('dd'); dd.append(linkify(v)); kv.append(dd); } });
    bd.append(kv);
    // 이 장소가 나오는 NPC
    const who = ((data.notes && data.notes.npcs) || []).filter(n => [n.relation, n.traits, n.said, n.affil].join(' ').includes(it.name));
    if (who.length) { bd.append(el('div', 'kind', '관련 NPC')); const tg = el('div', 'tags'); tg.style.marginTop = '8px'; who.forEach(n => { const t = el('span', 'tg lk', n.name); t.onclick = () => openDetail('npcs', n.id); tg.append(t); }); bd.append(tg); }
  } else if (sec === 'clues') {
    bd.append(el('span', 'tag' + (it.status === '해결' ? ' ok' : ''), it.status || '미해결'));
    if (it.kind) bd.append(el('span', 'kd ' + it.kind, it.kind));
    const t = el('div', 'tl-t'); t.style.marginTop = '12px'; t.append(linkify(it.text)); bd.append(t);
  } else {
    const t = el('div', 'quote'); t.append(linkify(it.text)); bd.append(t);
  }
  // 근거 발언: 새로 정리된 항목은 발언ID가 붙어 있고, 예전 항목은 없을 수 있다
  const src = Array.isArray(it.src) ? it.src : [];
  if (src.length) { const eb2 = el('button', '', '📎 근거 발언 ' + src.length + '개 보기'); eb2.style.marginTop = '12px'; eb2.onclick = () => showEvidence({ uids: src.join(',') }, it[def.key]); bd.append(eb2); }
  else if (sec !== 'handouts') bd.append(el('div', 'note', '근거 발언 기록 없음 (사람이 추가했거나 이전 버전에서 정리된 항목)'));
  if (it.editedAt) bd.append(el('div', 'note', '마지막 수정 ' + String(it.editedAt).slice(5, 16)));
  const row = el('div', 'row'); row.style.marginTop = '18px';
  const eb = el('button', 'pri', '✎ 고치기'); eb.onclick = () => { m.className = 'm'; editNote(sec, it); };
  const cb = el('button', '', '닫기'); cb.onclick = closeModal;
  row.append(eb, cb); bd.append(row);
  dv.append(bd); m.append(dv);
  const x = el('button', 'xbtn', '✕'); x.onclick = closeModal; m.style.position = 'relative'; m.append(x);
  $('modal').classList.remove('hide');
}

// 검색창 + 분류 칩
let nFilter = 'all', nQuery = '';
function matchQ(it){
  if (!nQuery) return true;
  const hay = Object.keys(it).filter(k => k !== 'id' && typeof it[k] === 'string').map(k => it[k]).join('\n').toLowerCase();
  return nQuery.split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}
// ── 단서 보기: 수백 개가 쌓여도 찾을 수 있게 (상태·종류·인물/장소로 좁히고, 30개씩 보여 줌)
let cStat = 'all', cKind = 'all', cSort = 'new', cName = '', cShow = 30;
const CLUE_PAGE = 30;
function hl(text, words){
  const f = document.createDocumentFragment(); const t = String(text || '');
  if (!words.length) { f.append(t); return f; }
  const re = new RegExp('(' + words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  t.split(re).forEach((part, i) => { if (i % 2) { const m = document.createElement('mark'); m.textContent = part; f.append(m); } else if (part) f.append(part); });
  return f;
}
function renderClueSec(box, n){
  const all = (n.clues || []);
  const full = nFilter === 'clues' || nFilter === 'open' || nFilter === 'locked' || !!nQuery;     // 전체 보기에서는 요약만
  const words = nQuery ? nQuery.split(/\s+/).filter(Boolean) : [];
  const nameCnt = {};
  ['npcs', 'pcs', 'places'].forEach(sec => (n[sec] || []).forEach(x => { const nm = String(x.name || '').trim(); if (nm.length >= 2) nameCnt[nm] = all.filter(c => String(c.text || '').includes(nm)).length; }));
  let arr = all.filter(matchQ);
  if (nFilter === 'locked') arr = arr.filter(x => x.locked);
  const stat = nFilter === 'open' ? 'open' : (full ? cStat : 'open');
  if (stat === 'open') arr = arr.filter(c => c.status !== '해결'); else if (stat === 'done') arr = arr.filter(c => c.status === '해결');
  if (full && cKind !== 'all') arr = arr.filter(c => (c.kind || '') === (cKind === 'none' ? '' : cKind));
  if (full && cName) arr = arr.filter(c => String(c.text || '').includes(cName));
  const order = new Map(all.map((c, i) => [c.id, i]));
  arr = arr.slice().sort((a, b) => cSort === 'old' ? order.get(a.id) - order.get(b.id) : order.get(b.id) - order.get(a.id));
  const sec = el('div', 'sec');
  const h = el('div', 'sec-h'); h.append(el('h3', '', SEC.clues.icon + ' ' + SEC.clues.title), el('span', 'cnt', arr.length + '개' + (arr.length !== all.length ? ' / 전체 ' + all.length + '개' : '')), el('span', 'grow'));
  const add = el('button', '', '+ 추가'); add.onclick = () => editNote('clues', null); h.append(add); sec.append(h);
  if (full) {
    const bar = el('div', 'cbar'); bar.append(el('span', 'lbl', '상태'));
    [['open', '미해결'], ['done', '해결'], ['all', '전부']].forEach(([k, lb]) => { if (nFilter === 'open' && k !== 'open') return; const b = el('button', 'fchip' + (stat === k ? ' act' : ''), lb); b.onclick = () => { cStat = k; cShow = CLUE_PAGE; renderNotes(data.notes); }; bar.append(b); });
    bar.append(el('span', 'lbl', '종류'));
    [['all', '전부'], ['확인', '확인'], ['주장', '주장'], ['추측', '추측'], ['none', '미분류']].forEach(([k, lb]) => { const b = el('button', 'fchip' + (cKind === k ? ' act' : ''), lb); b.onclick = () => { cKind = k; cShow = CLUE_PAGE; renderNotes(data.notes); }; bar.append(b); });
    const so = el('select'); [['new', '최신순'], ['old', '오래된순']].forEach(([k, lb]) => { const o = el('option', '', lb); o.value = k; so.append(o); }); so.value = cSort; so.onchange = () => { cSort = so.value; renderNotes(data.notes); };
    bar.append(el('span', 'grow'), so); sec.append(bar);
    const top = Object.keys(nameCnt).filter(k => nameCnt[k] >= 2).sort((a, b) => nameCnt[b] - nameCnt[a]).slice(0, 14);
    if (top.length) {
      const nb = el('div', 'cnames'); nb.append(el('span', 'lbl', '인물·장소'));
      const mk = (k, lb, c) => { const b = el('button', 'fchip' + (cName === k ? ' act' : ''), lb); if (c != null) b.append(el('b', '', c)); b.onclick = () => { cName = k; cShow = CLUE_PAGE; renderNotes(data.notes); }; nb.append(b); };
      mk('', '전부'); top.forEach(k => mk(k, k, nameCnt[k])); sec.append(nb);
    }
  }
  if (!arr.length) { sec.append(el('div', 'empty', all.length ? '조건에 맞는 단서가 없어요. 위의 상태·종류·인물 선택을 바꿔 보세요' : '아직 없어요')); box.append(sec); return; }
  const lim = full ? cShow : 8;
  arr.slice(0, lim).forEach(it => {
    const r = el('div', 'crow' + (it.status === '해결' ? ' done' : '')); r.onclick = () => openDetail('clues', it.id);
    const t = el('div', 'ct'); t.append(hl(it.text || '', words));
    const m = el('div', 'cm'); if (it.kind) m.append(el('span', 'kd ' + it.kind, it.kind)); m.append(el('span', 'tag' + (it.status === '해결' ? ' ok' : ''), it.status || '미해결')); if (it.locked) m.append(el('span', '', '🔒'));
    r.append(t, m); sec.append(r);
  });
  if (arr.length > lim) {
    const mo = el('div', 'cmore');
    if (full) {
      const b1 = el('button', '', '더 보기 (남은 ' + (arr.length - lim) + '개)'); b1.onclick = () => { cShow += CLUE_PAGE; renderNotes(data.notes); };
      const b2 = el('button', '', '전부 펼치기'); b2.onclick = () => { cShow = 100000; renderNotes(data.notes); }; mo.append(b1, b2);
    } else { const b = el('button', 'pri', '단서 ' + arr.length + '개 전부 보기 →'); b.onclick = () => { nFilter = 'clues'; cStat = 'open'; renderNotes(data.notes); }; mo.append(b); }
    sec.append(mo);
  }
  box.append(sec);
}
function renderNotes(n){
  n = n || {};
  const root = $('notesBox');
  // 검색창은 한 번만 만들고 그대로 둔다 (한글 입력이 끊기지 않게)
  if (!$('nQ')) {
    root.innerHTML = '';
    const bar = el('div', 'filters');
    const q = el('input'); q.id = 'nQ'; q.placeholder = '🔍 이름·내용 검색 (띄어쓰기로 여러 단어)';
    q.oninput = () => { nQuery = q.value.trim().toLowerCase(); cShow = CLUE_PAGE; renderNotes(data && data.notes); };
    const chipsBox = el('div', 'row'); chipsBox.id = 'nChips';
    bar.append(q, chipsBox); root.append(bar);
    const res = el('div'); res.id = 'nRes'; root.append(res);
  }
  const fl = $('nChips'); fl.innerHTML = '';
  const box = $('nRes'); box.innerHTML = '';
  const all = SEC_ORDER.reduce((a, s) => a + (n[s] || []).length, 0);
  const chips = [['all', '전체', all]].concat(SEC_ORDER.map(s => [s, SEC[s].title, (n[s] || []).length]))
    .concat([['open', '미해결 단서', (n.clues || []).filter(c => c.status !== '해결').length], ['locked', '🔒 확정', SEC_ORDER.reduce((a, s) => a + (n[s] || []).filter(x => x.locked).length, 0)]]);
  chips.forEach(([k, lb, c]) => { const b = el('button', 'fchip' + (nFilter === k ? ' act' : ''), lb); b.append(el('b', '', c)); b.onclick = () => { nFilter = k; renderNotes(data.notes); }; fl.append(b); });

  SEC_ORDER.forEach(sec => {
    if (!(nFilter === 'all' || nFilter === sec || nFilter === 'locked' || (nFilter === 'open' && sec === 'clues'))) return;
    const def = SEC[sec];
    if (sec === 'clues') { if (nQuery && !(n.clues || []).some(matchQ)) return; renderClueSec(box, n); return; }
    let arr = (n[sec] || []).filter(matchQ);
    if (nFilter === 'locked') arr = arr.filter(x => x.locked);
    if (nFilter === 'open') arr = arr.filter(x => x.status !== '해결');
    if ((nFilter === 'locked' || nQuery) && !arr.length) return;
    const s = el('div', 'sec');
    const h = el('div', 'sec-h'); h.append(el('h3', '', def.icon + ' ' + def.title), el('span', 'cnt', arr.length + '개'), el('span', 'grow'));
    if (sec === 'pcs') {
      const gb = el('button', '', '✨ 특징 만들기'); gb.title = RULEUI.pc + ' 각자의 발언을 AI가 읽고 성격·말투·습관을 정리해요 (플레이어마다 AI 1번)';
      gb.onclick = async () => { gb.disabled = true; gb.textContent = 'AI가 읽는 중…'; let r; try { r = await post({ action: 'pcBuild' }); } catch (e) { r = { ok: false, error: '연결이 끊겼어요. 잠시 뒤 다시 눌러 주세요' }; } gb.disabled = false; gb.textContent = '✨ 특징 만들기'; toast(r.ok ? r.message : (r.error || '실패했어요')); refreshData(); };
      h.append(gb);
    }
    const add = el('button', '', '+ 추가'); add.onclick = () => editNote(sec, null); h.append(add);
    s.append(h);
    if (!arr.length) { s.append(el('div', 'empty', '아직 없어요')); box.append(s); return; }
    if (def.photo) {
      const g = el('div', 'pgrid');
      arr.forEach(it => {
        const c = el('button', 'pcard' + (sec === 'places' ? ' place' : ''));
        const im = el('div', 'im');
        if (it.img) { const i = el('img'); i.src = it.img; i.loading = 'lazy'; i.alt = ''; im.append(i); } else im.append(el('div', 'ph0', (it.name || '?').slice(0, 1)));
        if (it.locked) im.append(el('span', 'lockb', '🔒'));
        c.append(im);
        const tx = el('div', 'tx'); tx.append(el('b', '', it.name || ''));
        tx.append(el('span', '', sec === 'npcs' ? ([it.affil, it.relation].filter(Boolean).join(' · ') || splitTags(it.traits).slice(0, 2).join(' · ') || ' ') : sec === 'pcs' ? ([it.player && '🎮 ' + it.player, splitTags(it.traits).slice(0, 2).join(' · ')].filter(Boolean).join(' · ') || ' ') : (it.desc || ' ')));
        c.append(tx);
        c.onclick = () => openDetail(sec, it.id);
        g.append(c);
      });
      s.append(g);
    } else {
      const g = el('div', sec === 'clues' ? '' : 'grid');
      arr.forEach(it => {
        const c = el('div', 'card'); c.style.cursor = 'pointer'; if (sec === 'clues') c.style.marginBottom = '8px';
        c.onclick = () => openDetail(sec, it.id);
        if (sec === 'clues') {
          const t = el('div', 'ttl'); t.style.fontWeight = '500'; t.style.fontSize = '14.5px'; t.append(linkify(it.text || ''));
          t.append(el('span', 'tag' + (it.status === '해결' ? ' ok' : ''), it.status || '미해결'));
          if (it.kind) t.append(el('span', 'kd ' + it.kind, it.kind));
          c.append(t);
        } else {
          c.append(el('div', 'ttl', it.title || ''));
          const v = el('div', ''); v.style.cssText = 'white-space:pre-wrap;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden'; v.textContent = it.text || ''; c.append(v);
        }
        if (it.locked) c.append(el('div', 'lock', '🔒 사람이 확정함'));
        g.append(c);
      });
      s.append(g);
    }
    box.append(s);
  });
  if (!box.querySelector('.sec')) box.append(el('div', 'empty', '찾는 항목이 없어요'));
}
function parseStat(v){
  const m = String(v || '').match(/(\d+)\s*\/\s*(\d+)/);
  if (m) return { cur: +m[1], max: +m[2], text: m[1] + ' / ' + m[2] };
  const n = String(v || '').match(/\d+/); return n ? { cur: +n[0], max: 0, text: n[0] } : null;
}
function bar(label, v, color){
  const p = parseStat(v); if (!p) return null;
  const b = el('div', 'bar'); const lb = el('div', 'lb'); lb.append(el('span', '', label), el('span', '', p.text)); b.append(lb);
  const tr = el('div', 'tr'); const fl = el('div', 'fl'); fl.style.background = color;
  fl.style.width = (p.max ? Math.max(0, Math.min(100, p.cur / p.max * 100)) : 100) + '%'; tr.append(fl); b.append(tr);
  return b;
}
function shrink(file, max, q){
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res(c.toDataURL('image/jpeg', q || 0.85).split(',')[1]); };
    img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}
function renderChars(list, target, preview){
  const box = target || $('chars'); box.innerHTML = '';
  if (!list.length && !preview) { box.append(el('div', 'empty', '마스터가 설정에서 캐릭터시트를 연결하면 여기에 캐릭터 카드가 나와요.')); return; }
  list.forEach(ch => {
    const c = el('div', 'idc');
    const top = el('div', 'idc-top'); top.append(el('span', '', (RULEUI.en || 'CHARACTER') + ' · ' + RULEUI.pc + ' 신분증'), el('span', '', ch.tab || '')); c.append(top);
    const body = el('div', 'idc-body');
    const pic = el('div', 'pic');
    if (ch.portrait) { const im = el('img'); im.src = ch.portrait; im.alt = ch.name || ''; im.onerror = () => { im.remove(); pic.prepend(el('div', 'ph0', (ch.name || ch.tab || '?').slice(0, 1))); }; pic.append(im); }
    else pic.append(el('div', 'ph0', (ch.name || ch.tab || '?').slice(0, 1)));
    const up = el('button', '', '사진 바꾸기'); const fi = el('input'); fi.type = 'file'; fi.accept = 'image/*'; fi.style.display = 'none';
    up.onclick = () => fi.click();
    fi.onchange = async () => { const f = fi.files[0]; if (!f) return; up.textContent = '올리는 중…';
      try { const d64 = await shrink(f, 700, 0.88); const r = await post({ action: 'portrait', tab: ch.tab, data: d64 }); toast(r.ok ? '사진을 바꿨어요' : r.error); if (r.ok) refreshData(); }
      catch (e) { toast('실패: ' + e.message); } up.textContent = '사진 바꾸기'; };
    if (!preview) pic.append(up, fi);
    body.append(pic);
    const info = el('div');
    info.append(el('div', 'nm', ch.name || ch.tab));
    info.append(el('div', 'sub', [ch.occupation, ch.age && (ch.age + '세'), ch.gender].filter(Boolean).join(' · ') || ' '));
    [bar('체력 HP', ch.hp, '#e0605a'), bar('마력 MP', ch.mp, '#5b8cff'), bar('이성 SAN', ch.san, '#a07cf0'), bar('행운', ch.luck, '#d6a84e')].forEach(b => b && info.append(b));
    body.append(info); c.append(body);
    if (ch.stats && ch.stats.length) { const st = el('div', 'stats'); ch.stats.slice(0, 9).forEach(s => { const x = el('div', 'stat'); x.append(el('b', '', s.value), el('span', '', s.name)); st.append(x); }); c.append(st); }
    if (ch.skills && ch.skills.length) { const sk = el('div', 'skills'); ch.skills.forEach(s => { const x = el('span', 'skill', s.name); x.append(el('b', '', s.value)); sk.append(x); }); c.append(sk); }
    const foot = el('div', 'idc-foot');
    const pl = el('div', 'idc-pl'); const d = el('span', 'dot'); d.dataset.whodot = ch.player; d.style.background = colorOf(ch.player || '');
    const pn = el('span', '', 'PL ' + (ch.player || '?')); pn.dataset.who = ch.player; pn.style.color = colorOf(ch.player || ''); pl.append(d, pn); foot.append(pl);
    // 대화에서 정리된 탐사자 특징·관계 (정리 탭의 카드와 같은 내용)
    const pc = !preview && data && data.notes && (data.notes.pcs || []).find(x => (ch.name && String(x.name || '').trim() === String(ch.name).trim()) || (ch.player && String(x.player || '').trim() === String(ch.player).trim()));
    if (pc && (pc.traits || pc.relation || pc.said)) {
      const tb = el('div', 'idc-pc'); tb.style.cssText = 'padding:8px 14px;border-top:1px solid var(--line);font-size:13px;line-height:1.55;cursor:pointer'; tb.title = '정리 탭의 카드 열기'; tb.onclick = () => openDetail('pcs', pc.id);
      if (pc.traits) { const tg = el('div', 'tags'); splitTags(pc.traits).slice(0, 8).forEach(t => tg.append(el('span', 'tg', t))); tb.append(tg); }
      if (pc.relation) tb.append(el('div', '', '🤝 ' + pc.relation));
      if (pc.said) tb.append(el('div', 'note', '💬 ' + pc.said));
      c.append(tb);
    }
    if (ch.items) foot.append(el('div', '', '🎒 ' + ch.items));
    if (ch.memo) foot.append(el('div', '', '📝 ' + ch.memo));
    c.append(foot); box.append(c);
  });
}
// 근거 원문 창: 해당 줄은 밝게, 앞뒤 줄은 흐리게
async function showEvidence(q, title, onOpen){
  const m = $('modalBody'); m.className = 'm'; m.innerHTML = '';
  m.append(el('h3', '', '📎 근거 발언'), el('div', 'note', title ? String(title).slice(0, 80) : ''));
  const box = el('div'); box.style.marginTop = '12px'; box.append(el('div', 'note', '불러오는 중…')); m.append(box);
  const row = el('div', 'row'); row.style.marginTop = '14px'; const x = el('button', '', '닫기'); x.onclick = closeModal; row.append(x); m.append(row);
  $('modal').classList.remove('hide');
  try {
    const r = await api('evidence', Object.assign({ ctx: 2, rv: (data && data.v && data.v.resetVer) || '' }, q));
    if (!r.ok) throw new Error(r.error);
    box.innerHTML = '';
    if (q.session) box.append(el('div', 'note', '세션 ' + q.session + '의 발언만 보여요'));
    if (onOpen) onOpen(r);
    if (!r.lines.length) box.append(el('div', 'empty', '원문을 찾지 못했어요. 회의록이 지워졌거나 이전 버전에서 만든 기록이에요.'));
    let prevId = 0;
    r.lines.forEach(l => {
      if (prevId && l.id !== prevId + 1) box.append(el('div', 'note', '⋯'));
      prevId = l.id;
      const d = el('div', 'evl' + (l.focus ? ' f' : ''));
      d.append(el('span', 't', String(l.time).slice(11, 19) + '\n#' + l.id));
      const b = el('div'); const n = el('b', '', l.name + '  '); n.style.color = colorOf(l.name); b.append(n, l.text); d.append(b); box.append(d);
    });
    if ((r.missing || []).length) box.append(el('div', 'note kerr', '찾지 못한 근거: ' + r.missing.join(', ') + (q.session ? ' (없는 번호이거나 다른 회차의 발언이에요)' : '')));
  } catch (e) { box.innerHTML = ''; box.append(el('div', 'empty', '불러오기 실패: ' + e.message)); }
}
// 요약 줄 끝의 (#12, #15)를 눌러 볼 수 있는 근거 표시로 바꾼다
function sumText(text){
  const frag = document.createDocumentFragment(); text = String(text || '');
  const re = /\s*\((#\d+(?:\s*[,，·]\s*#?\d+)*)\)/g; let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(linkify(text.slice(last, m.index)));
    const ids = (m[1].match(/\d+/g) || []);
    const b = el('span', 'ev', '📎' + ids.length); b.title = '근거 발언 ' + ids.map(i => '#' + i).join(', ');
    const at = m.index, label = text.slice(text.lastIndexOf('\n', at) + 1, at);
    b.onclick = () => showEvidence({ ids: ids.join(',') }, label);
    frag.append(b); last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(linkify(text.slice(last)));
  return frag;
}
// 요약 한 덩어리를 장소 문단으로 보여 준다: 【장소】 줄은 문단 제목, 그 아래 줄들이 그 문단. (예전 요약처럼 제목이 없으면 줄만 나란히)
function sumBlock(text, sid){
  const frag = document.createDocumentFragment(); let para = null;
  String(text || '').split('\n').forEach(ln => {
    const mh = /^\s*【(.+?)】\s*$/.exec(ln);
    if (mh) { para = el('div', 'sp'); const h = el('div', 'sph', '📍 '); h.append(linkify(mh[1])); para.append(h); frag.append(para); return; }
    if (!ln.trim()) return;
    const d = el('div', 'spl');
    if (sid) bmLine(d, sid, ln.trim());
    d.append(sumText(ln)); (para || frag).append(d);
  });
  return frag;
}
/* ── 📌 북마크: 요약 줄마다 누구나 표시. 모두에게 보이고, "다음 할 일" 추천에서 우선 고려된다 ── */
let bmEls = new Map();
const bmList = () => (data && data.bookmarks) || [];
const bmFind = (sid, text) => bmList().find(x => Number(x.sid) === Number(sid) && x.text === text);
function bmLine(d, sid, raw){
  bmEls.set(sid + '\n' + raw, d);
  const on = !!bmFind(sid, raw); if (on) d.classList.add('bm');
  const b = el('button', 'bmb', '📌'); b.title = on ? '북마크 빼기' : '북마크 (중요한 장면 표시)';
  b.onclick = e => { e.stopPropagation(); bmToggle(sid, raw); };
  d.append(b);
}
async function bmToggle(sid, raw){
  const on = !bmFind(sid, raw);
  const d = bmEls.get(sid + '\n' + raw); if (d) d.classList.toggle('bm', on);
  if (data) { data.bookmarks = on ? bmList().concat([{ sid, text: raw, by: cfg.name, at: '', session: '' }]) : bmList().filter(x => !(Number(x.sid) === Number(sid) && x.text === raw)); renderBm(); }
  try {
    const r = await post({ action: 'bookmark', sid, text: raw, on, name: cfg.name });
    if (!r.ok) throw new Error(r.error);
    if (data) { data.bookmarks = r.bookmarks; renderBm(); }
    toast(on ? '📌 북마크했어요' : '북마크를 뺐어요');
  } catch (e) { toast('북마크를 저장하지 못했어요: ' + e.message); refreshData(); }
}
function bmJump(x){
  const d = bmEls.get(x.sid + '\n' + x.text);
  if (!d) { toast('그 요약이 고쳐져서 원래 줄을 찾지 못했어요'); return; }
  const dt = d.closest('details'); if (dt) dt.open = true;
  d.scrollIntoView({ behavior: 'smooth', block: 'center' }); d.classList.remove('flash'); void d.offsetWidth; d.classList.add('flash');
}
function renderBm(){
  const box = $('bmBox'); if (!box) return; box.innerHTML = '';
  const list = bmList().slice().reverse(); if (!list.length) return;
  const dt = document.createElement('details'); dt.className = 'bmbox'; dt.open = list.length <= 6 || box.dataset.open === '1';
  dt.ontoggle = () => { box.dataset.open = dt.open ? '1' : ''; };
  const sm = document.createElement('summary'); sm.textContent = '📌 북마크 ' + list.length + '개'; dt.append(sm);
  list.forEach(x => {
    const r = el('div', 'bmi'); const t = el('div', 'grow'); t.append(linkify(String(x.text).replace(/\s*\((#\d+(?:\s*[,，·]\s*#?\d+)*)\)/g, '')));
    const meta = el('div', 'note', [x.session ? '세션 ' + x.session : '', x.by, String(x.at || '').slice(11, 16)].filter(Boolean).join(' · ')); t.append(meta);
    const rm = el('button', 'icon', '✕'); rm.title = '북마크 빼기'; rm.onclick = e => { e.stopPropagation(); bmToggle(x.sid, x.text); };
    r.append(el('span', '', '📌'), t, rm); r.onclick = () => bmJump(x); dt.append(r);
  });
  box.append(dt);
}
/* ── 🧭 다음 할 일 ── */
let nextSt = { loading: false, data: null };
async function nextOpen(force){
  if (nextSt.loading) return;
  const st = $('nextSt'), go = $('nextGo');
  nextSt.loading = true; go.disabled = true;
  st.textContent = nextSt.data && !force ? '새 기록이 있는지 확인하는 중…' : 'AI가 기록을 읽고 추천을 만드는 중… (10~30초)';
  try {
    const r = await post({ action: 'nextSteps', force: !!force });
    if (!r.ok) throw new Error(r.error || '실패');
    if (r.empty) { nextSt.data = null; nextDraw(null); st.textContent = ''; }
    else {
      if (r.next) { nextSt.data = r.next; nextDraw(r.next); }
      st.textContent = r.busy ? '다른 사람이 새 추천을 만드는 중이에요. 잠시 뒤 [다시 추천]을 눌러 주세요' + (r.next ? ' (아래는 이전 추천)' : '')
        : r.next ? String(r.next.at || '').slice(11, 16) + ' 기준 추천' + (r.wait ? ' · 방금 만들었어요 (1분 뒤 다시 받을 수 있어요)' : '') : '';
    }
  } catch (e) { st.textContent = '추천을 만들지 못했어요: ' + e.message; }
  nextSt.loading = false; go.disabled = false;
}
function nextDraw(o){
  const box = $('nextBox'); box.innerHTML = '';
  if (!o || !(o.items || []).length) { box.append(el('div', 'empty', '아직 추천할 만큼 기록이 없어요. 세션이 진행되고 요약이 생기면 추천해 드려요.')); return; }
  o.items.forEach(x => {
    const it = el('div', 'nxi' + (x.prio === 1 ? ' p1' : ''));
    const k = el('span', 'nxk nk-' + x.kind, x.kind);
    const body = el('div', 'grow'); const b = el('b'); b.append(linkify(x.title)); body.append(b);
    if (x.why) { const w = el('div', 'why'); w.append(linkify(x.why)); body.append(w); }
    it.append(k, body); box.append(it);
  });
}
$('nextGo').onclick = () => nextOpen(true);
const sortSums = list => list.slice().sort((a, b) => (Number(a.session) - Number(b.session)) || (a.from < b.from ? -1 : a.from > b.from ? 1 : a.id - b.id));
function renderSums(d){
  bmEls = new Map();
  if ($('lgPc')) $('lgPc').textContent = RULEUI.pc || '탐사자';
  $('story').innerHTML = ''; $('story').append(linkify(d.story || '(아직 없어요)'));
  const box = $('sums'); box.innerHTML = '';
  if (!d.summaries.length) { box.append(el('div', 'empty', '아직 정리된 요약이 없어요. 대화가 쌓이면 5분 안에 생겨요. 급하면 [지금 요약]을 눌러 주세요.')); }
  // 세션별로 묶는다. 잡담뿐인 구간은 연달아 있으면 한 줄로 합쳐 보이고, 이전 세션은 접어 둔다 (가장 나중 세션만 펼침)
  const isIdle = t => /^\s*-?\s*\(잡담 위주, 진행 없음\)\s*$/.test(String(t || ''));
  const groups = []; sortSums(d.summaries).forEach(s => { let g = groups[groups.length - 1]; if (!g || g.session !== s.session) { g = { session: s.session, rows: [] }; groups.push(g); } g.rows.push(s); });
  groups.forEach((g, gi) => {
    const last = gi === groups.length - 1;
    const tl = el('div', 'tl');
    let run = null;
    const flush = () => { if (!run) return; const it = el('div', 'tl-item idle'); const h = el('div', 'tl-h'); h.append(el('span', '', String(run.from).slice(11, 16) + ' ~ ' + String(run.to).slice(11, 16)));
      const tt = el('div', 'tl-t'); tt.textContent = '잡담 위주 · 진행 없음' + (run.n > 1 ? ' (' + run.n + '구간 통합)' : ''); tt.style.opacity = '.6'; it.append(h, tt); tl.append(it); run = null; };
    g.rows.forEach(s => {
      if (isIdle(s.text)) { if (!run) run = { from: s.from, to: s.to, n: 0 }; run.n++; if (String(s.to) > String(run.to)) run.to = s.to; return; }
      flush();
      const it = el('div', 'tl-item');
      const h = el('div', 'tl-h'); h.append(el('span', '', String(s.from).slice(11, 16) + ' ~ ' + String(s.to).slice(11, 16)));
      const eb = el('button', 'icon', '✎'); eb.title = '고치기';
      eb.onclick = () => openForm('요약 고치기', [{ key: 'text', label: '요약 (끝의 (#번호)는 근거 표시예요)', type: 'area', rows: 10 }], { text: s.text }, v => post({ action: 'sumSave', id: s.id, text: v.text, rv: d.v.resetVer }));
      const tt = el('div', 'tl-t'); tt.append(sumBlock(s.text, s.id)); h.append(eb); it.append(h, tt); tl.append(it);
    });
    flush();
    if (last) { box.append(el('div', 'sess', '세션 ' + g.session), tl); }
    else { const dt = document.createElement('details'); dt.className = 'pastsess'; const sm = document.createElement('summary'); sm.className = 'sess'; sm.textContent = '세션 ' + g.session + ' (이전 세션 · ' + g.rows.filter(x => !isIdle(x.text)).length + '개 구간) — 눌러서 펼치기'; sm.style.cursor = 'pointer'; dt.append(sm, tl); box.append(dt); }
  });
  renderBm();
  const m = $('memos'); m.innerHTML = '';
  if ((d.corrections || []).length) { m.append(el('div', '', '기억하고 있는 정정 메모')); d.corrections.slice(-8).forEach(c => m.append(el('div', '', '· ' + c.text))); }
}
// 요약 상태: 아직 없음 / 대기 중 / 정리 중(게이지) / 완료 / 실패 를 구분해서 보여 준다
let sumAnim = { run: false, pct: 0, next: 0, shown: 0 }, sumTimer = null, sumWasRun = false, sumDoneUntil = 0, sumDoneMsg = '', lastSumV = null;
function sumTick(){
  const i = document.querySelector('#sumState .pbar i'), pp = document.querySelector('#sumState .pp');
  if (!i || !sumAnim.run) return;
  const cap = Math.max(sumAnim.pct, sumAnim.next - 1);      // 다음 확인 지점 바로 앞까지만 천천히 차오른다 (실제 값은 서버가 알려 줄 때마다 맞춘다)
  if (sumAnim.shown < sumAnim.pct) sumAnim.shown = sumAnim.pct;
  else if (sumAnim.shown < cap) sumAnim.shown += (cap - sumAnim.shown) * 0.05 + 0.03;
  i.style.width = Math.min(99, sumAnim.shown) + '%'; if (pp) pp.textContent = Math.floor(Math.min(99, sumAnim.shown)) + '%';
}
function sumShell(box, mode){
  if (box.dataset.mode === mode) return;
  box.dataset.mode = mode; box.className = 'sumst ' + (mode === 'run' ? 'run' : 'done'); box.innerHTML = '';
  const pl = el('div', 'pl'); pl.append(el('span', 'pt'), el('span', 'pp')); const pb = el('div', 'pbar'); pb.append(el('i'));
  box.append(pl, el('div', 'pd'), pb); sumAnim.shown = 0;
}
function sumRunView(box, job){
  const pr = job.prog || null;
  const kindLbl = job.kind === 'correct' ? 'AI가 정정을 처리하는 중' : job.kind === 'notes' ? 'NPC·장소·단서 데이터 업데이트 중' : '회의록 요약 중';
  sumShell(box, 'run');
  box.querySelector('.pt').textContent = '🌀 ' + (pr ? pr.label : kindLbl) + '…';
  box.querySelector('.pd').textContent = pr && pr.detail ? pr.detail : '';
  const pb = box.querySelector('.pbar'), i = pb.querySelector('i'), pp = box.querySelector('.pp');
  pb.classList.toggle('ind', !pr);
  if (pr) {
    sumAnim.pct = pr.pct; sumAnim.next = pr.next; sumAnim.run = true;
    const w = Math.min(99, Math.max(sumAnim.shown, pr.pct)); sumAnim.shown = w; i.style.width = w + '%'; pp.textContent = Math.floor(w) + '%';
    if (!sumTimer) sumTimer = setInterval(sumTick, 500);
  } else { sumAnim.run = false; i.style.width = ''; pp.textContent = ''; }
}
function renderSumState(v){
  if (!v) return;
  lastSumV = v.job ? Object.assign({}, v, { job: null }) : v;      // 다시 그릴 때 쓸 값은 '일 없음' 기준 (끝난 뒤 갱신용)
  const box = $('sumState'), dot = $('sumDot');
  const left = Math.max(0, (v.total || 0) - (v.processedId || 0));
  const hasSum = !!(data && data.summaries && data.summaries.length);
  const t = s => String(s || '').slice(11, 16);
  let cls = '', txt = '', col = '';
  if (v.job) { sumWasRun = true; sumRunView(box, v.job); dot.classList.remove('hide'); dot.style.background = 'var(--gold)'; return; }
  if (sumWasRun) {                                           // 방금 끝났다면 잠깐 100%로 보여 준다 (실패면 아래의 빨간 안내가 대신 뜬다)
    sumWasRun = false;
    if (!(v.proc && v.proc.ok === false)) { sumDoneUntil = Date.now() + 3500; setTimeout(() => { if (lastSumV) renderSumState(lastSumV); }, 3600); }
  }
  if (sumTimer) { clearInterval(sumTimer); sumTimer = null; } sumAnim.run = false;
  if (Date.now() < sumDoneUntil) {
    sumShell(box, 'done'); box.querySelector('.pt').textContent = '✔ 정리가 끝났어요'; box.querySelector('.pp').textContent = '100%';
    box.querySelector('.pd').textContent = sumDoneMsg || (v.proc && v.proc.message) || ''; box.querySelector('.pbar i').style.width = '100%'; return;
  }
  box.dataset.mode = '';
  if (v.proc && v.proc.ok === false) { cls = 'err'; col = 'var(--red)'; txt = '⚠ ' + t(v.proc.at) + ' 요약 실패: ' + v.proc.error + ' · 요약 대기 ' + left + '줄 (다음 자동 정리 때 같은 구간부터 다시 시도)'; }
  else if (left > 0) { col = 'var(--gold)'; txt = '⏳ 요약 대기 ' + left + '줄' + (v.nq ? ' · NPC·장소·단서 정리 대기 ' + v.nq + '건' : '') + ' · 5분마다 자동으로 정리돼요 (급하면 [지금 요약])' + (v.proc && v.proc.at ? ' (마지막 정리 ' + t(v.proc.at) + ')' : ''); }
  else if (v.nq > 0) { col = 'var(--gold)'; txt = '✔ 요약은 최신 · NPC·장소·단서 정리 ' + v.nq + '건 대기 중 (곧 이어서 정리해요)' + (v.proc && v.proc.at ? ' (마지막 정리 ' + t(v.proc.at) + ')' : ''); }
  else if (!hasSum) txt = '아직 요약할 대화가 없어요';
  else txt = '✔ 최신 상태' + (v.proc && v.proc.at ? ' (마지막 정리 ' + t(v.proc.at) + ')' : '');
  if (v.proc && v.proc.warn && v.proc.ok !== false) txt += ' · ⚠ ' + v.proc.warn;
  box.className = 'sumst ' + cls; box.textContent = txt;
  dot.classList.toggle('hide', !col); dot.style.background = col;
}
function renderImgs(list){
  const box = $('imgs'); box.innerHTML = '';
  if (!list.length) box.append(el('div', 'empty', '아직 올라온 이미지가 없어요.'));
  list.slice().reverse().forEach(im => {
    const c = el('div', 'card');
    c.append(el('div', 'ttl', im.title || '이미지'));
    c.append(el('div', 'note', String(im.time).slice(5, 16) + ' · 세션 ' + im.session));
    const img = el('img'); img.src = im.url; img.loading = 'lazy'; img.alt = im.title || '';
    img.onclick = () => { $('lbImg').src = im.url.replace(/sz=w\d+/, 'sz=w2400'); $('lightbox').classList.remove('hide'); };
    c.append(img);
    if (im.text) { c.append(el('div', 'k', '글자')); const t = el('div', '', im.text); t.style.whiteSpace = 'pre-wrap'; c.append(t); }
    if (im.description) { c.append(el('div', 'k', '설명')); c.append(el('div', '', im.description)); }
    box.append(c);
  });
}
$('lightbox').onclick = () => $('lightbox').classList.add('hide');


/* ── 방 테마 ── 룰마다 기본 테마, 마스터가 고른 값(설정 탭 theme)이 있으면 그게 우선 */
const TH_OF_RULE = { coc: 'coc', triangle: 'ta', unlimited: 'uw', shinobi: 'sg', etc: 'etc' };
const TH_NM = { coc: '— 수사 기록 —', ta: 'AGENCY OS · 근무지', uw: 'UNLIMITED WORLD', sg: '忍 · 시노비가미', etc: 'TRPG ARCHIVE' };
let TH = { key: 'etc', t: {} };
function thKey(rule, t){ return (t && t.preset) || TH_OF_RULE[rule] || 'etc'; }
function thCache(url, rule, t){ try { S.set('t_th:' + scriptUrl(url), JSON.stringify({ rule, t: t || {} })); } catch(_) {} }
function thCached(url){ try { return JSON.parse(S.get('t_th:' + scriptUrl(url)) || 'null'); } catch(_) { return null; } }
function thInk(hex){ const n = parseInt(hex.slice(1), 16), r = n >> 16, g = n >> 8 & 255, b = n & 255; return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#0b0c0f' : '#fff'; }
function applyTheme(rule, t){
  t = t || {}; const key = thKey(rule, t), root = document.documentElement;
  TH = { key, t, rule };
  root.dataset.theme = key;
  let ac = $('thAccCss'); if (!ac) { ac = document.createElement('style'); ac.id = 'thAccCss'; document.head.append(ac); }
  ac.textContent = t.accent ? 'html:not(.lob)[data-theme]{--gold:' + t.accent + ';--gold2:' + t.accent + ';--ink:' + thInk(t.accent) + '}' : '';
  if (key === 'coc' && !$('thFont')) { const l = document.createElement('link'); l.id = 'thFont'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@600;800&display=swap'; document.head.append(l); }
  const bg = $('rBg'); bg.classList.remove('hide');
  bg.querySelector('.rb-img').style.backgroundImage = t.bg ? 'url("' + t.bg.replace(/"/g, '') + '")' : '';
  bg.querySelector('.rb-dim').style.opacity = t.bg ? (t.dim || 75) / 100 : 0;
  const mc = document.querySelector('meta[name="theme-color"]'); if (mc) mc.content = getComputedStyle(root).getPropertyValue('--bg').trim() || '#0e1014';
}
function roomIntro(name){
  if ($('rIntro') || TH.t.intro === false) return;
  const k = TH.key, o = el('div'); o.id = 'rIntro';
  const c = el('div', 'ri-c');
  if (k === 'coc') { o.append(el('div', 'ri-glow')); c.append(el('div', 'ri-flame')); }
  if (k === 'ta') { o.append(el('div', 'ri-band'), el('div', 'ri-band b2')); }
  if (k === 'uw') c.append(el('div', 'ri-line'));
  if (k === 'sg') { const sv = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); sv.setAttribute('viewBox', '0 0 120 120'); sv.setAttribute('class', 'ri-enso'); sv.innerHTML = '<circle cx="60" cy="60" r="50"/>'; c.append(sv); }
  if (k === 'etc') { const i = el('img', 'ri-d20'); i.src = 'icon.png?v=2'; i.alt = ''; c.append(i); }
  c.append(el('div', 'ri-k', TH_NM[k] || ''), el('div', 'ri-nm', name || '방'), el('div', 'ri-r', RULE_NM[TH.rule] || ''));
  if (k === 'ta') c.append(el('div', 'ri-stamp', '출근 기록 완료'));
  o.append(c); document.body.append(o);
  const born = Date.now(); let gone = false;
  const end = () => { if (gone) return; gone = true; o.classList.add('out'); setTimeout(() => o.remove(), 480); };
  o.onclick = () => { if (Date.now() - born > 300) end(); };
  setTimeout(end, 1900);
}
function thForm(){
  const t = TH.t || {};
  $('thPreset').value = t.preset || ''; $('thAccOn').checked = !!t.accent; if (t.accent) $('thAcc').value = t.accent;
  $('thBg').value = t.bg || ''; $('thDim').value = t.dim || 75; $('thIntro').checked = t.intro !== false;
}
function thRead(){ return { preset: $('thPreset').value, accent: $('thAccOn').checked ? $('thAcc').value : '', bg: $('thBg').value.trim(), dim: +$('thDim').value, intro: $('thIntro').checked }; }
$('thPrev').onclick = () => { const t = thRead(); applyTheme(TH.rule, t); const keep = TH.t.intro; TH.t.intro = true; $('rIntro') && $('rIntro').remove(); roomIntro($('roomName').textContent); TH.t.intro = keep; $('thOut').textContent = '미리 보기는 이 화면에만 보여요. 모두에게 보이려면 테마 저장을 눌러 주세요'; };
$('thAcc').oninput = () => { $('thAccOn').checked = true; };
$('thSave').onclick = async () => {
  $('thSave').disabled = true; $('thOut').textContent = '저장 중…';
  const r = await kpost({ action: 'setTheme', theme: thRead() }); $('thSave').disabled = false;
  $('thOut').textContent = r.ok ? r.message : (r.error || '저장하지 못했어요');
  if (r.ok) { applyTheme(TH.rule, r.theme); thCache(cfg.url, TH.rule, r.theme); refreshData(); }
};

function renderAll(d){
  data = d; colorMap = d.colors || {}; keeperName = d.keeperName || ''; applyRule(d.rule);
  { const nf = Number(d.notesFail || 0); $('kNfRow').classList.toggle('hide', !nf); $('kNfTxt').textContent = '⚠ NPC·장소·단서 정리 중 실패해서 보관된 작업 ' + nf + '건 (원문은 그대로 있어요)'; }
  if (d.rule && d.rule.key) { const thNew = JSON.stringify(d.theme || {}); if (TH.rule !== d.rule.key || JSON.stringify(TH.t) !== thNew) { applyTheme(d.rule.key, d.theme); if (document.activeElement && !document.activeElement.id.startsWith('th')) thForm(); } thCache(cfg.url, d.rule.key, d.theme); }
  if (d.roomTitle != null) { const nm0 = (roomsGet().find(x => scriptUrl(x.url) === cfg.url) || {}); $('roomName').textContent = nm0.named ? nm0.name : (d.roomTitle || nm0.name || '방'); if (!nm0.url) roomRemember(d.roomTitle); else if (!nm0.named && d.roomTitle && nm0.name !== d.roomTitle) roomRemember(d.roomTitle); }
  renderRooms();
  $('sessPill').textContent = '세션 ' + d.v.session;
  const oldRe = linkRe ? linkRe.source : ''; buildLinks(withChars(d.notes, d.characters));
  if ((linkRe ? linkRe.source : '') !== oldRe) redrawLog();
  renderSums(d); renderPubCards(d); renderSumState(d.v); renderNotes(d.notes); renderChars(d.characters || []); renderImgs(d.images || []);
  if (document.activeElement !== $('gloss')) $('gloss').value = d.glossary || '';
  if (document.activeElement !== $('kName') && !$('kName').value) $('kName').value = d.keeperName || '';
  if (!$('kCharUrl').value) $('kCharUrl').value = d.charUrl || '';
  if (!$('kMap').children.length && (d.charMap || []).length) drawMap(d.charMap.map(m => m.tab), d.charMap);
  drawSwatches(); recolor();
  // 처음 들어왔는데 내 색이 저장 안 돼 있으면 기본색을 저장
  if (!colorMap[cfg.name] && !S.get('t_colorSent')) { S.set('t_colorSent', '1'); post({ action: 'color', name: cfg.name, color: hashColor(cfg.name) }); }
}
async function refreshData(){
  try {
    const d = await api('data');
    if (!d.ok) throw new Error(d.error);
    ver = d.v; renderAll(d); $('dataPill').classList.add('hide');
  } catch (e) { const p = $('dataPill'); p.classList.remove('hide'); p.lastChild.textContent = '자료 불러오기 실패 · 재시도'; p.title = String(e.message || e); }
}

$('storyEdit').onclick = e => { e.preventDefault(); e.stopPropagation();
  openForm('누적 줄거리 고치기', [{ key: 'text', label: '누적 줄거리 (AI가 다음 요약 때 이걸 바탕으로 이어 써요)', type: 'area', rows: 14 }], { text: data ? data.story : '' }, v => post({ action: 'storySave', text: v.text })); };
$('sumNow').onclick = async () => {
  const b = $('sumNow'); b.disabled = true; const t0 = b.textContent; b.textContent = '요약 중…';
  renderSumState(Object.assign({}, lastSumV || {}, { job: { kind: 'summary', at: Date.now(), prog: { label: '요약을 시작하는 중', detail: '', pct: 1, next: 8 } } }));     // 누르자마자 게이지가 보이게
  try {
    const r = await post({ action: 'process' });
    if (r.ok) { sumDoneMsg = r.message || ''; sumDoneUntil = Date.now() + 3500; setTimeout(() => { if (lastSumV) renderSumState(lastSumV); }, 3600); }
    toast(r.ok ? r.message : (r.busy ? r.error : '요약 실패: ' + r.error));
  } catch (e) { toast('응답을 못 받았어요 (' + e.message + '). 요약 탭 상태줄에서 결과를 확인해 주세요'); }
  b.disabled = false; b.textContent = t0;
  if (Date.now() >= sumDoneUntil) { sumWasRun = false; if (lastSumV) renderSumState(lastSumV); }       // 실패·바쁨이면 '끝났어요'를 띄우지 않고 원래 상태줄로
  refreshData();
};
$('copySum').onclick = () => {
  if (!data) return;
  let cur = null; const out = ['■ 누적 줄거리\n' + (data.story || '')];
  data.summaries.forEach(s => { if (s.session !== cur) { cur = s.session; out.push('\n■ 세션 ' + cur); } out.push('(' + String(s.from).slice(11,16) + '~' + String(s.to).slice(11,16) + ')\n' + s.text); });
  copyText($('copySum'), out.join('\n').trim());
};
