/* 가상 캠페인 10세션 + 정답표 (AI 품질 측정·떡밥 레이더 시험용).
 * 모두 지어낸 자료다. 실제 세션 기록·친구 닉네임은 들어 있지 않다.
 * 시나리오(가짜): "안개 등대의 마을" · 크툴루의 부름 · 10세션. 등장: 키퍼, 철수(박형사), 영희(한기자), 민수(최교수)
 * 씨앗(seed)을 정해 두고 만들기 때문에 누가 언제 돌려도 같은 대본이 나온다.
 *
 * 만드는 것
 *   sessions[s] = [{ uid, name, text }] : 세션별 대본 (줄 수는 세션마다 30줄 안팎)
 *   notes       = 정리 AI가 만들었을 법한 NPC·단서 정리 (근거 줄 src = 발언ID). 떡밥 레이더 시험에 그대로 넣는다
 *   key         = 정답표
 *     key.perSession[s] = { npcs: 나온 NPC, found: 새로 나온 단서, solved: 풀린 단서, rolls: 판정, traps: 사건으로 적으면 안 되는 말 }
 *     key.radar = { npc: 레이더에 떠야 하는 NPC, clue: 떠야 하는 단서, notNpc / notClue: 뜨면 안 되는 것 (이유와 함께) }
 * 정답표는 대본을 만든 같은 설계표(PLAN)에서 나오므로 대본과 어긋나지 않는다. */
const K = '키퍼', A = '철수', B = '영희', C = '민수';
const PCS = { [A]: '박형사', [B]: '한기자', [C]: '최교수' };

// NPC: id, 이름, 다른 이름, 나오는 세션
const NPCS = [
  { id: 'np1', name: '등대지기 한씨', aka: '한씨', in: [1, 2, 3] },            // 3세션 뒤로 사라짐 → 레이더 (7세션째)
  { id: 'np2', name: '오말순 선장', aka: '오선장', in: [1, 4, 9] },            // 9세션에 다시 나옴 → 안 뜸
  { id: 'np3', name: '어부 김돌', aka: '김돌', in: [2, 6] },                   // 6세션 뒤로 안 나옴 → 레이더 (4세션째)
  { id: 'np4', name: '박영감 촌장', aka: '촌장', in: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },   // 매번 나옴 → 안 뜸
  { id: 'np5', name: '엘레나 수녀', aka: '엘레나', in: [8] },                  // 2세션 전 → 기준(3세션)에 못 미침 → 안 뜸
  { id: 'np6', name: '소녀 미오', aka: '미오', in: [5, 7, 10] }               // 지금 세션에 나옴 → 안 뜸
];
// 단서: id, 내용, 나온 세션, 다시 언급된 세션, 풀린 세션
const CLUES = [
  { id: 'cl1', text: '등대 계단에 젖은 맨발 발자국', found: 1, touch: [], solved: 4, re: '발자국' },
  { id: 'cl2', text: '선장의 항해일지에서 찢겨 나간 마지막 장', found: 2, touch: [], solved: 0, re: '항해일지' },        // 레이더 (8세션째)
  { id: 'cl3', text: '밤마다 혼자 울리는 교회 종', found: 3, touch: [9], solved: 0, re: '교회 종' },                          // 9세션에 다시 언급 → 1세션째 → 안 뜸
  { id: 'cl4', text: '바닷물에 젖은 오래된 은화', found: 5, touch: [], solved: 0, re: '은화' },                           // 레이더 (5세션째)
  { id: 'cl5', text: '지도에 그려진 붉은 원', found: 9, touch: [], solved: 0, re: '붉은 원' },                             // 1세션째 → 안 뜸
  { id: 'cl6', text: '미오가 부르는 노래의 가사', found: 6, touch: [], solved: 8, re: '노래' },                           // 풀림 → 안 뜸
  { id: 'cl7', text: '해식 동굴 벽의 물고기 머리 문양', found: 7, touch: [], solved: 0, re: '문양' }                      // 레이더 (3세션째)
];
// 세션마다 장면, 판정, 함정(농담·가정·게임 밖 잡담)
const PLAN = {
  1: { scene: '마을 선착장', rolls: [[A, '관찰력', 23, true]], trap: [B, '(웃음) 그냥 배 타고 도망가자 ㅋㅋ', '도망'] },
  2: { scene: '촌장의 집', rolls: [[B, '심리학', 81, false]], trap: [C, '만약에 촌장이 범인이면 어떡하지?', '촌장이 범인'] },
  3: { scene: '등대 꼭대기', rolls: [[C, '듣기', 12, true], [A, '근력', 77, false]], trap: [A, '다음 주는 토요일에 할까요?', '토요일'] },
  4: { scene: '선장의 배', rolls: [[B, '설득', 30, true]], trap: [B, '배를 불태우면 어떨까 ㅋㅋ 농담이에요', '불태'] },
  5: { scene: '해변 모래톱', rolls: [[C, '관찰력', 44, true]], trap: [C, '아 잠깐 택배 왔다 금방 올게요', '택배'] },
  6: { scene: '어시장', rolls: [[A, '심리학', 90, false], [B, '흥정', 25, true]], trap: [A, '만약에 김돌이 거짓말하는 거라면?', '김돌이 거짓말'] },
  7: { scene: '해식 동굴 입구', rolls: [[C, '고고학', 18, true]], trap: [B, '동굴 들어가면 다 죽는 거 아니에요 ㅋㅋ', '다 죽'] },
  8: { scene: '마을 교회', rolls: [[B, '도서관 이용', 66, false]], trap: [C, '저 물 좀 마시고 올게요', '물 좀'] },
  9: { scene: '교회 종탑', rolls: [[A, '관찰력', 9, true], [C, '오컬트', 58, false]], trap: [A, '만약에 종을 떼어 내면?', '종을 떼'] },
  10: { scene: '등대 아래 바위', rolls: [[B, '듣기', 33, true]], trap: [C, '오늘 치킨 시켜 먹을까요', '치킨'] }
};
const N = 10;

// 씨앗이 정해진 난수 (mulberry32)
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// 이름이 들어가지 않는 잡담·진행 줄 (NPC 이름이 섞이면 레이더 정답이 흐려지므로 넣지 않는다)
const FILLER = [
  [A, '박형사는 주변을 둘러봅니다.'], [B, '한기자는 수첩에 적어 둡니다.'], [C, '최교수는 안경을 고쳐 씁니다.'],
  [K, '바람이 차갑게 불어옵니다.'], [K, '안개가 조금 더 짙어집니다.'], [A, '일단 같이 움직이죠.'],
  [B, '지금 몇 시쯤이에요?'], [K, '해가 거의 졌습니다.'], [C, '여기 좀 수상한데요.'], [A, '조심해서 가 봅시다.'],
  [B, '다들 손전등 있죠?'], [K, '파도 소리가 크게 들립니다.'], [C, '기록해 둔 걸 다시 읽어 봅니다.'], [A, '총은 아직 꺼내지 않습니다.']
];

function build(seed) {
  const r = rng(seed == null ? 20261127 : seed), sessions = {}, uidOf = {}; let n = 0;
  const pick = a => a[Math.floor(r() * a.length)];
  const jo = (w, a, b) => { const c = w.charCodeAt(w.length - 1); return w + ((c >= 0xAC00 && c <= 0xD7A3 && (c - 0xAC00) % 28) ? a : b); };   // 받침에 맞는 조사
  for (let s = 1; s <= N; s++) {
    const p = PLAN[s], L = [];
    const say = (name, text, tag) => { n++; const uid = 'cp' + s + '_' + n; L.push({ uid, name, text }); if (tag) (uidOf[tag] = uidOf[tag] || []).push({ s, uid }); };
    const fill = k => { for (let i = 0; i < k; i++) { const f = pick(FILLER); say(f[0], f[1]); } };
    say(K, s === 1 ? '여러분은 안개 낀 바닷가 마을에 도착했습니다. 첫 장면은 ' + p.scene + '입니다.' : '지난번에 이어서, 이번 장면은 ' + p.scene + '입니다.');
    fill(3);
    NPCS.filter(x => x.in.includes(s)).forEach(x => {
      say(K, jo(x.name, '이', '가') + ' 나타나 말을 겁니다. "' + ['이 마을엔 밤에 나다니지 마시오.', '바다가 요즘 이상해요.', '난 아무것도 모르오.', '도와주실 수 있나요?'][Math.floor(r() * 4)] + '"', 'npc:' + x.id);
      fill(1);
      say(pick([A, B, C]), x.aka + '에게 더 물어봅니다.', 'npc:' + x.id);
      fill(1);
    });
    p.rolls.forEach(([who, skill, v, okR]) => {
      say(who, PCS[who] + '는 ' + skill + ' 굴릴게요.');
      say(K, PCS[who] + ' ' + skill + ' 판정, ' + v + '. ' + (okR ? '성공입니다.' : '실패입니다.'));
    });
    CLUES.forEach(c => {
      if (c.found === s) say(K, '여러분은 ' + jo(c.text, '을', '를') + ' 발견합니다.', 'clue:' + c.id);
      if (c.touch.includes(s)) say(pick([A, B, C]), '아까 그 ' + c.text + ' 말인데요, 아직 뭔지 모르겠어요.', 'clue:' + c.id);
      if (c.solved === s) say(K, c.text + '의 정체가 밝혀졌습니다. 이 단서는 풀렸습니다.', 'clue:' + c.id);
    });
    fill(2);
    say(p.trap[0], p.trap[1]);
    fill(Math.floor(r() * 4) + 3);
    say(K, '오늘은 여기까지 하겠습니다.');
    sessions[s] = L;
  }
  // 정리 AI가 만들었을 법한 정리 (근거 줄 = 그 항목이 나온 발언ID, 최근 8개)
  const srcOf = tag => (uidOf[tag] || []).map(x => x.uid).slice(-8);
  const notes = { places: [], pcs: [], handouts: [], deleted: {},
    npcs: NPCS.map(x => ({ id: x.id, name: x.name, aka: x.aka, src: srcOf('npc:' + x.id) })),
    clues: CLUES.map(c => ({ id: c.id, text: c.text, status: c.solved ? '해결' : '미해결', kind: '확인', src: srcOf('clue:' + c.id) })) };
  // 정답표
  const perSession = {};
  for (let s = 1; s <= N; s++) {
    const p = PLAN[s];
    perSession[s] = {
      scene: p.scene,
      npcs: NPCS.filter(x => x.in.includes(s)).map(x => x.name),
      found: CLUES.filter(c => c.found === s).map(c => ({ id: c.id, re: c.re })),
      solved: CLUES.filter(c => c.solved === s).map(c => ({ id: c.id, re: c.re })),
      rolls: p.rolls.map(([who, skill, , okR]) => ({ pc: PCS[who], skill, result: okR ? '성공' : '실패' })),
      traps: [{ re: p.trap[2], why: '농담·가정·게임 밖 잡담: 사건으로 적으면 안 됨' }]
    };
  }
  const lastIn = x => Math.max.apply(null, x.in), lastC = c => Math.max.apply(null, [c.found].concat(c.touch));
  const radar = {
    npc: NPCS.filter(x => N - lastIn(x) >= 3).map(x => ({ id: x.id, gap: N - lastIn(x) })),
    notNpc: NPCS.filter(x => N - lastIn(x) < 3).map(x => ({ id: x.id, why: '마지막으로 나온 세션 ' + lastIn(x) })),
    clue: CLUES.filter(c => !c.solved && N - lastC(c) >= 2).map(c => ({ id: c.id, gap: N - lastC(c) })),
    notClue: CLUES.filter(c => c.solved || N - lastC(c) < 2).map(c => ({ id: c.id, why: c.solved ? '세션 ' + c.solved + '에서 풀림' : '마지막 언급 세션 ' + lastC(c) }))
  };
  return { sessions, notes, key: { perSession, radar }, N };
}
module.exports = { build, NPCS, CLUES, PLAN, PCS };
if (require.main === module) {
  const c = build(), tot = Object.values(c.sessions).reduce((a, l) => a + l.length, 0);
  console.log('세션 ' + c.N + '개, 대본 ' + tot + '줄');
  console.log('레이더 정답: NPC ' + c.key.radar.npc.map(x => x.id + '(' + x.gap + ')').join(', ') + ' / 단서 ' + c.key.radar.clue.map(x => x.id + '(' + x.gap + ')').join(', '));
}
