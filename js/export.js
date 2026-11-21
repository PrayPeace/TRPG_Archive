/* TRPG Archive · 내보내기 (txt · docx · hwpx)
 * 모든 js 파일은 index.html 아래에서 순서대로 읽고 이름(함수·변수)을 함께 쓴다. */
'use strict';
/* ── ⬇ 내보내기: txt · 워드(.docx) · 한글(.hwpx) ──
 * 파일은 이 브라우저 안에서 만든다 (서버를 거치지 않음). 한글 파일 뼈대는 export/hwpx/ (python-hwpx의 Skeleton.hwpx, Apache-2.0). */
const xmlEsc = t => String(t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const noEv = t => String(t || '').replace(/\s*\((#\d+(?:\s*[,，·]\s*#?\d+)*)\)/g, '');
function crc32(u8){
  let t = crc32.t; if (!t) { t = crc32.t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } }
  let x = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) x = t[(x ^ u8[i]) & 255] ^ (x >>> 8); return (x ^ 0xFFFFFFFF) >>> 0;
}
// 압축하지 않는(STORE) ZIP. 첫 파일이 그대로 맨 앞에 온다 (한글 파일은 mimetype이 맨 앞·무압축이어야 함)
function zipStore(files, type){
  const te = new TextEncoder(), parts = [], cent = []; let off = 0;
  files.forEach(f => {
    const nm = te.encode(f.name), d = typeof f.data === 'string' ? te.encode(f.data) : new Uint8Array(f.data), crc = crc32(d);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, d.length, true); h.setUint32(22, d.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, d);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, d.length, true); c.setUint32(24, d.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cent.push(new Uint8Array(c.buffer), nm);
    off += 30 + nm.length + d.length;
  });
  const cs = cent.reduce((a, b) => a + b.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cs, true); e.setUint32(16, off, true);
  return new Blob(parts.concat(cent, [new Uint8Array(e.buffer)]), { type: type || 'application/zip' });
}
function saveBlob(blob, name){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}
// 문서 = [{t:'h1'|'h2'|'h3'|'p', text}]
function docToTxt(doc){
  return doc.map(b => b.t === 'h1' ? '■ ' + b.text + '\n' + '='.repeat(30) : b.t === 'h2' ? '\n■ ' + b.text : b.t === 'h3' ? '\n[' + b.text + ']' : b.text).join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
function docToDocx(doc){
  const F = '<w:rFonts w:ascii="Malgun Gothic" w:hAnsi="Malgun Gothic" w:eastAsia="맑은 고딕" w:cs="Malgun Gothic"/>';
  const sz = { h1: 32, h2: 26, h3: 22, p: 21 }, after = { h1: 200, h2: 120, h3: 60, p: 60 }, before = { h1: 0, h2: 280, h3: 160, p: 0 };
  const paras = doc.flatMap(b => String(b.text).split('\n').map(line => '<w:p><w:pPr><w:spacing w:before="' + before[b.t] + '" w:after="' + after[b.t] + '" w:line="300" w:lineRule="auto"/></w:pPr><w:r><w:rPr>' + F +
    (b.t !== 'p' ? '<w:b/>' : '') + (b.t === 'h1' ? '<w:color w:val="2E4A7A"/>' : '') + '<w:sz w:val="' + sz[b.t] + '"/><w:szCs w:val="' + sz[b.t] + '"/></w:rPr><w:t xml:space="preserve">' + xmlEsc(line) + '</w:t></w:r></w:p>')).join('');
  const docXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' + paras +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="851" w:footer="992" w:gutter="0"/></w:sectPr></w:body></w:document>';
  return zipStore([
    { name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
    { name: 'word/document.xml', data: docXml }
  ], 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
}
const HWPX_FILES = ['mimetype', 'version.xml', 'Contents/header.xml', 'Contents/section0.xml', 'Contents/content.hpf', 'settings.xml', 'META-INF/container.xml', 'META-INF/container.rdf', 'META-INF/manifest.xml', 'Preview/PrvImage.png'];
async function docToHwpx(doc, title){
  const base = new URL('export/hwpx/', location.href).href;
  const got = {};
  await Promise.all(HWPX_FILES.map(async f => { const r = await fetch(base + f); if (!r.ok) throw new Error('한글 파일 뼈대(' + f + ')를 받지 못했어요'); got[f] = await r.arrayBuffer(); }));
  const td = new TextDecoder();
  let sec = td.decode(got['Contents/section0.xml']);
  const cp = { h1: 7, h2: 8, h3: 6, p: 0 };
  const lines = doc.flatMap(b => String(b.text).split('\n').map(line => ({ cp: cp[b.t], line })));
  const first = lines.shift() || { cp: 0, line: '' };
  const run = l => '<hp:run charPrIDRef="' + l.cp + '">' + (l.line ? '<hp:t>' + xmlEsc(l.line) + '</hp:t>' : '<hp:t/>') + '</hp:run>';
  // 첫 문단(쪽 설정이 들어 있음)의 빈 글자 칸에 첫 줄을 넣고, 나머지는 문단으로 덧붙인다
  sec = sec.replace('<hp:run charPrIDRef="0"><hp:t/></hp:run>', run(first)).replace(/<hp:linesegarray>.*?<\/hp:linesegarray>/, '');
  let id = 1;
  sec = sec.replace('</hs:sec>', lines.map(l => '<hp:p id="' + (id++) + '" paraPrIDRef="0" styleIDRef="0" pageBreak="0" columnBreak="0" merged="0">' + run(l) + '</hp:p>').join('') + '</hs:sec>');
  const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const hpf = td.decode(got['Contents/content.hpf']).replace('<opf:title/>', '<opf:title>' + xmlEsc(title) + '</opf:title>').replace(/(name="(?:CreatedDate|ModifiedDate)" content="text">)[^<]*/g, '$1' + now);
  const prv = doc.map(b => b.text).join('\r\n').slice(0, 1000);
  const files = HWPX_FILES.map(f => ({ name: f, data: f === 'Contents/section0.xml' ? sec : f === 'Contents/content.hpf' ? hpf : got[f] }));
  files.splice(files.length - 1, 0, { name: 'Preview/PrvText.txt', data: prv });
  return zipStore(files, 'application/hwp+zip');
}
async function buildExport(o){
  const d = data; const doc = [];
  const title = (d.roomTitle || $('roomName').textContent || 'TRPG') + ' 기록';
  doc.push({ t: 'h1', text: title }, { t: 'p', text: (RULEUI.name || '') + ' · 내보낸 때 ' + new Date().toLocaleString('ko-KR') });
  const sessOk = s => o.sess === 'all' || String(s) === String(o.sess);
  if (o.story && d.story) { doc.push({ t: 'h2', text: '누적 줄거리' }); String(d.story).split('\n').filter(x => x.trim()).forEach(x => doc.push({ t: 'p', text: x })); }
  if (o.sums) {
    let cur = null;
    sortSums(d.summaries).filter(s => sessOk(s.session) && !/^\s*-?\s*\(잡담 위주, 진행 없음\)\s*$/.test(s.text)).forEach(s => {
      if (s.session !== cur) { cur = s.session; doc.push({ t: 'h2', text: '세션 ' + cur + ' 요약' }); }
      doc.push({ t: 'h3', text: String(s.from).slice(11, 16) + ' ~ ' + String(s.to).slice(11, 16) });
      String(s.text).split('\n').forEach(ln => { const mh = /^\s*【(.+?)】\s*$/.exec(ln); if (mh) doc.push({ t: 'p', text: '📍 ' + mh[1] }); else if (ln.trim()) doc.push({ t: 'p', text: noEv(ln) }); });
    });
  }
  if (o.bm) { const b = bmList().filter(x => !x.session || sessOk(x.session)); if (b.length) { doc.push({ t: 'h2', text: '📌 북마크' }); b.forEach(x => doc.push({ t: 'p', text: '· ' + noEv(x.text) + (x.by ? ' (' + x.by + ')' : '') })); } }
  if (o.next && nextSt.data && (nextSt.data.items || []).length) { doc.push({ t: 'h2', text: '🧭 다음 할 일' }); nextSt.data.items.forEach(x => doc.push({ t: 'p', text: '[' + x.kind + '] ' + x.title + (x.why ? ' — ' + x.why : '') })); }
  if (o.notes) {
    const n = d.notes || {};
    const sec = (h, list, f) => { if ((list || []).length) { doc.push({ t: 'h2', text: h }); list.forEach(x => doc.push({ t: 'p', text: f(x) })); } };
    sec('장소', n.places, x => '· ' + x.name + (x.desc ? ': ' + x.desc : '') + (x.found ? ' / ' + x.found : ''));
    sec('NPC', n.npcs, x => '· ' + x.name + (x.affil ? ' (' + x.affil + ')' : '') + (x.traits ? ': ' + x.traits : '') + (x.relation ? ' / ' + x.relation : ''));
    sec(RULEUI.pc || '탐사자', n.pcs, x => '· ' + x.name + (x.player ? ' (' + x.player + ')' : '') + (x.traits ? ': ' + x.traits : ''));
    sec('단서', n.clues, x => '· [' + (x.status || '미해결') + '] ' + x.text);
  }
  if (o.log) {
    const list = o.sess === 'all' ? ((await api('sessions')).sessions || []).map(x => x.session) : [o.sess];
    for (const ss of list) {
      const r = await api('sessionLines', { session: ss }); if (!r.ok) throw new Error(r.error || '회의록을 받지 못했어요');
      doc.push({ t: 'h2', text: '세션 ' + ss + ' 회의록 (' + r.lines.length + '줄)' });
      linesToText(r.lines).replace(/^■ 세션 \d+\n/, '').split('\n').filter(x => x.trim()).forEach(x => doc.push({ t: 'p', text: x }));
    }
  }
  return { doc, title };
}
$('exportBtn').onclick = async () => {
  if (!data) return;
  let sessions = [];
  try { const r = await api('sessions'); sessions = (r.sessions || []).map(x => x.session); } catch (_) {}
  if (!sessions.length) sessions = [...new Set((data.summaries || []).map(s => s.session))];
  const m = $('modalBody'); m.innerHTML = '';
  m.append(el('h3', '', '⬇ 내보내기'), el('div', 'note', '고른 내용을 파일로 받아요. 이 기기에 바로 저장돼요.'));
  m.append(el('label', '', '세션'));
  const ss = el('select'); [['all', '모든 세션']].concat(sessions.slice().reverse().map(x => [x, '세션 ' + x])).forEach(([v, t]) => { const op = el('option', '', t); op.value = v; ss.append(op); });
  if (sessions.length) ss.value = String(sessions[sessions.length - 1]); m.append(ss);
  m.append(el('label', '', '넣을 내용'));
  const ck = (k, t, on) => { const l = el('label'); l.style.cssText = 'display:flex;gap:8px;align-items:center;font-weight:500;margin:4px 0'; const i = el('input'); i.type = 'checkbox'; i.checked = on; i.style.width = 'auto'; i.dataset.k = k; l.append(i, t); m.append(l); return i; };
  const boxes = [ck('story', '누적 줄거리', true), ck('sums', '요약 (장소별 문단)', true), ck('bm', '📌 북마크', true), ck('next', '🧭 다음 할 일 (받아 둔 추천)', !!nextSt.data), ck('notes', '장소 · NPC · 탐사자 · 단서 정리', false), ck('log', '회의록 전문 (길어요)', false)];
  m.append(el('label', '', '파일 형식'));
  const row = el('div', 'row'); row.style.flexWrap = 'wrap'; m.append(row);
  const msg = el('div', 'note'); msg.style.marginTop = '8px'; m.append(msg);
  const go = async (fmt, b) => {
    const o = { sess: ss.value }; boxes.forEach(i => o[i.dataset.k] = i.checked);
    if (!boxes.some(i => i.checked)) { msg.textContent = '넣을 내용을 하나 이상 골라 주세요'; return; }
    [...row.children].forEach(x => x.disabled = true); msg.textContent = '파일을 만드는 중…';
    try {
      const { doc, title } = await buildExport(o);
      const fname = (title + (o.sess === 'all' ? '' : ' 세션' + o.sess)).replace(/[\\/:*?"<>|]/g, '_');
      if (fmt === 'txt') saveBlob(new Blob(['﻿' + docToTxt(doc)], { type: 'text/plain;charset=utf-8' }), fname + '.txt');
      else if (fmt === 'docx') saveBlob(docToDocx(doc), fname + '.docx');
      else saveBlob(await docToHwpx(doc, title), fname + '.hwpx');
      msg.textContent = '✔ 받았어요 (' + fname + '.' + fmt + ')';
    } catch (e) { msg.textContent = '만들지 못했어요: ' + (e.message || e); }
    [...row.children].forEach(x => x.disabled = false);
  };
  [['txt', '텍스트 (.txt)'], ['docx', '워드 (.docx)'], ['hwpx', '한글 (.hwpx)']].forEach(([f, t]) => { const b = el('button', f === 'hwpx' ? 'pri' : '', t); b.onclick = () => go(f, b); row.append(b); });
  const x = el('button', '', '닫기'); x.onclick = closeModal; x.style.marginTop = '12px'; m.append(x);
  $('modal').classList.remove('hide');
};
$('fixGo').onclick = async () => {
  const t = $('fixTxt').value.trim(); if (!t) { $('fixMsg').textContent = '정정할 내용을 적어 주세요'; return; }
  $('fixGo').disabled = true; $('fixMsg').textContent = 'AI가 고치는 중… (20~40초)';
  try { const r = await post({ action: 'correct', text: t, name: cfg.name }); $('fixMsg').textContent = r.ok ? '✔ ' + r.reply : r.error; if (r.ok) { $('fixTxt').value = ''; refreshData(); } }
  catch (e) { $('fixMsg').textContent = '실패: ' + e.message; }
  $('fixGo').disabled = false;
};

