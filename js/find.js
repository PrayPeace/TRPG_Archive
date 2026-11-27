/* ── 🔍 찾기 (Ctrl+K · ⌘K · 탭 줄의 🔍): NPC·장소·단서·탐사자·핸드아웃·캐릭터·요약·북마크·회의록·탭 이름을 한 칸에서 찾는다 ──
 * 초성으로도 찾는다: "ㅎㅆ" → 한씨, "ㄷㄷㅈㄱ" → 등대지기, "한ㄱ" → 한기자. 띄어쓰기·대소문자는 무시한다.
 * 찾는 자료는 모두 공개 자료(data·회의록)다. 마스터 전용 자료(시나리오 자료·진상·비밀 NPC)는 마스터로 로그인해 있어도 넣지 않는다. */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
function findCho(ch){ const c = ch.charCodeAt(0); return c >= 0xAC00 && c <= 0xD7A3 ? CHO[Math.floor((c - 0xAC00) / 588)] : ch; }
function findNorm(s){ return String(s || '').toLowerCase().replace(/\s+/g, ''); }
const isCho = ch => CHO.indexOf(ch) >= 0;
/* 글 t 안에서 q가 처음 맞는 자리 (없으면 -1). q의 초성 글자는 t 글자의 초성과, 나머지는 글자 그대로 맞춘다 */
function findAt(t, q){
  if (!q) return -1;
  if (!/[ㄱ-ㅎ]/.test(q)) return t.indexOf(q);
  const n = t.length - q.length;
  for (let i = 0; i <= n; i++) {
    let k = 0;
    for (; k < q.length; k++) { const a = t[i + k], b = q[k]; if (a !== b && !(isCho(b) && findCho(a) === b)) break; }
    if (k === q.length) return i;
  }
  return -1;
}
/* 점수: 제목이 q로 시작 > 제목에 있음 > 다른 이름에 있음 > 본문에 있음. 같으면 짧은 제목 먼저 */
function findScore(it, q){
  const tt = it._t || (it._t = findNorm(it.title)), ta = it._a || (it._a = findNorm(it.aka)), tb = it._b || (it._b = findNorm(it.body));
  let p = findAt(tt, q);
  if (p === 0) return 1000 - tt.length + it.w;
  if (p > 0) return 800 - p + it.w;
  if (ta && findAt(ta, q) >= 0) return 700 + it.w;
  p = tb ? findAt(tb, q) : -1;
  if (p >= 0) return 300 + it.w - Math.min(p, 200) / 10;
  return -1;
}
const FIND_TABS = [['log', '회의록'], ['sum', '요약'], ['next', '다음 할 일'], ['notes', '장소 · NPC · 탐사자 · 단서'], ['chars', '캐릭터'], ['imgs', '이미지'], ['set', '설정']];
/* 찾을 목록 만들기. 공개 자료만: data(요약·정리·캐릭터·북마크·이미지 제목)와 이 화면이 받은 회의록 줄 */
function findIndex(){
  const out = [], d = (typeof data !== 'undefined' && data) || {};
  FIND_TABS.forEach(([t, name]) => out.push({ kind: '탭', icon: '↪', title: name, w: 5, go: () => showTab(t) }));
  const notes = d.notes || {};
  SEC_ORDER.forEach(sec => {
    const def = SEC[sec];
    (notes[sec] || []).forEach(it => {
      const title = String(it[def.key] || '').slice(0, 90); if (!title) return;
      const body = [it.affil, it.player, it.said, it.traits, it.relation, it.desc, it.found, sec === 'clues' ? '' : it.text, it.status].filter(Boolean).join(' ');
      out.push({ kind: def.title, icon: def.icon, title, aka: it.aka || '', body, sub: sec === 'clues' ? (it.status || '') : (it.affil || it.player || ''), w: 40, go: () => { showTab('notes'); openDetail(sec, it.id); } });
    });
  });
  (d.characters || []).forEach(c => {
    const title = c.name || c.tab || ''; if (!title) return;
    out.push({ kind: '캐릭터', icon: '🎭', title, body: [c.occupation, c.player, c.tab].filter(Boolean).join(' '), sub: c.player ? '플레이어 ' + c.player : '', w: 35, go: () => showTab('chars') });
  });
  const strip = t => String(t || '').replace(/\s*\(#[^)]*\)/g, '').trim();
  (d.summaries || []).forEach(s => {
    String(s.text || '').split('\n').map(strip).filter(x => x && x.length > 2 && !/잡담 위주, 진행 없음/.test(x)).forEach(line => {
      out.push({ kind: '요약', icon: '🗒', title: line.slice(0, 120), body: '', sub: '세션 ' + s.session + ' · ' + String(s.from || '').slice(11, 16), w: 10, go: () => findGoSum(line, s.session) });
    });
  });
  (d.bookmarks || []).forEach(b => out.push({ kind: '북마크', icon: '📌', title: strip(b.text).slice(0, 120), body: b.by || '', sub: '세션 ' + (b.session || '?') + (b.by ? ' · ' + b.by : ''), w: 20, go: () => findGoSum(strip(b.text), b.session) }));
  (d.images || []).forEach(im => { if (im.title || im.description) out.push({ kind: '이미지', icon: '🖼', title: im.title || '이미지', body: im.description || im.text || '', sub: im.session ? '세션 ' + im.session : '', w: 8, go: () => showTab('imgs') }); });
  (typeof allLines !== 'undefined' ? allLines : []).forEach(l => {
    if (/^※ 받아쓰기 끊김/.test(l.text || '')) return;
    out.push({ kind: '회의록', icon: '💬', title: (l.name ? l.name + ': ' : '') + String(l.text || '').slice(0, 140), body: '', sub: '세션 ' + l.session + ' · ' + String(l.time || '').slice(11, 16), w: 0, id: l.id, go: () => findGoLine(l.id) });
  });
  return out;
}
function findMark(node){ if (!node) return; node.scrollIntoView({ block: 'center' }); node.classList.add('fhit'); setTimeout(() => node.classList.remove('fhit'), 2600); }
function findGoLine(id){ showTab('log'); setTimeout(() => findMark(document.querySelector('#log span[data-id="' + id + '"]')), 30); }
function findGoSum(line, sess){
  showTab('sum');
  setTimeout(() => {
    const key = findNorm(line).slice(0, 40);
    const hit = [...document.querySelectorAll('#sums .tl-t, #bmBox *')].find(n => findNorm(n.textContent).indexOf(key) >= 0);
    if (!hit) return;
    const dt = hit.closest('details'); if (dt) dt.open = true;
    findMark(hit.closest('.tl-item') || hit);
  }, 30);
}
/* 찾은 결과: 점수 순, 종류마다 너무 많이 나오지 않게 (회의록은 최근 것 먼저 12개까지) */
function findSearch(q, idx){
  q = findNorm(q); if (!q) return [];
  const per = {}, cap = { '회의록': 12, '요약': 10 }, hits = [];
  idx.forEach((it, i) => { const s = findScore(it, q); if (s >= 0) hits.push({ it, s: s + (it.kind === '회의록' ? i / 1e6 : 0) }); });
  hits.sort((a, b) => b.s - a.s);
  return hits.filter(h => { const k = h.it.kind; per[k] = (per[k] || 0) + 1; return per[k] <= (cap[k] || 20); }).slice(0, 40).map(h => h.it);
}
let findSt = { idx: null, sel: 0, res: [] };
function findOpen(){
  if (!$('app') || $('app').classList.contains('hide')) return;
  let w = $('finder');
  if (!w) {
    w = el('div', 'finder hide'); w.id = 'finder'; w.setAttribute('role', 'dialog'); w.setAttribute('aria-label', '찾기');
    const box = el('div', 'fbox');
    const inp = el('input'); inp.id = 'findIn'; inp.placeholder = '이름·단서·요약·대화 찾기 (초성도 돼요: ㅎㅆ → 한씨)'; inp.autocomplete = 'off'; inp.setAttribute('aria-label', '찾을 말');
    const list = el('div', 'flist'); list.id = 'findList'; list.setAttribute('role', 'listbox');
    const foot = el('div', 'note', '↑↓로 고르고 Enter로 열어요 · Esc 닫기 · 회의록은 이 화면이 불러온 대화에서만 찾아요');
    box.append(inp, list, foot); w.append(box);
    w.onclick = e => { if (e.target === w) findClose(); };
    inp.oninput = () => { findSt.sel = 0; findDraw(); };
    inp.onkeydown = e => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = findSt.res.length; if (n) { findSt.sel = (findSt.sel + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; findDraw(true); } }
      else if (e.key === 'Enter') { e.preventDefault(); findPick(findSt.sel); }
      else if (e.key === 'Escape') { e.preventDefault(); findClose(); }
    };
    document.body.append(w);
  }
  findSt.idx = findIndex(); findSt.sel = 0;
  w.classList.remove('hide');
  const inp = $('findIn'); inp.value = ''; findDraw(); setTimeout(() => inp.focus(), 0);
}
function findClose(){ const w = $('finder'); if (w) w.classList.add('hide'); }
function findPick(i){ const it = findSt.res[i]; if (!it) return; findClose(); try { it.go(); } catch (e) { toast('열지 못했어요'); } }
function findDraw(keepScroll){
  const list = $('findList'), q = $('findIn').value; list.innerHTML = '';
  findSt.res = q.trim() ? findSearch(q, findSt.idx || []) : [];
  if (!q.trim()) { list.append(el('div', 'fempty', 'NPC 이름, 단서 낱말, 요약에 나온 말을 적어 보세요. 초성만 적어도 돼요.')); return; }
  if (!findSt.res.length) { list.append(el('div', 'fempty', '찾은 것이 없어요')); return; }
  findSt.res.forEach((it, i) => {
    const r = el('div', 'fitem' + (i === findSt.sel ? ' on' : '')); r.setAttribute('role', 'option'); r.setAttribute('aria-selected', i === findSt.sel ? 'true' : 'false');
    r.append(el('span', 'fic', it.icon), el('span', 'ftt', it.title), el('span', 'fkd', it.kind + (it.sub ? ' · ' + it.sub : '')));
    r.onmousemove = () => { if (findSt.sel !== i) { findSt.sel = i; [...list.children].forEach((c, k) => c.classList.toggle('on', k === i)); } };
    r.onclick = () => findPick(i);
    list.append(r);
  });
  if (keepScroll) { const on = list.children[findSt.sel]; if (on) on.scrollIntoView({ block: 'nearest' }); }
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) {
    if (!$('app') || $('app').classList.contains('hide')) return;
    e.preventDefault(); const w = $('finder'); if (w && !w.classList.contains('hide')) findClose(); else findOpen();
  }
});
if ($('findBtn')) $('findBtn').onclick = findOpen;
