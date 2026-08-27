// 打牌ごとの受け入れ計算と問題生成

// 牌のインデックス → 表記（"1m" など。画像ファイル名にも使う）
const TILE_NAMES = (() => {
  const names = [];
  for (const s of ['m', 'p', 's']) for (let n = 1; n <= 9; n++) names.push(n + s);
  for (let n = 1; n <= 7; n++) names.push(n + 'z');
  return names;
})();

// 牌のインデックス → 日本語名
const TILE_LABELS = (() => {
  const labels = [];
  for (const s of ['萬', '筒', '索']) for (let n = 1; n <= 9; n++) labels.push(n + s);
  return labels.concat(['東', '南', '西', '北', '白', '發', '中']);
})();

// "123m456p11z" 形式 → 34要素の枚数配列
function parseHand(str) {
  const c = new Array(34).fill(0);
  const base = { m: 0, p: 9, s: 18, z: 27 };
  let buf = [];
  for (const ch of str) {
    if (ch >= '0' && ch <= '9') buf.push(+ch);
    else if (base[ch] !== undefined) {
      for (const n of buf) c[base[ch] + (n === 0 ? 4 : n - 1)]++;
      buf = [];
    }
  }
  return c;
}

// 34要素の枚数配列 → 牌インデックスの配列（ソート済み）
function toTileList(counts) {
  const list = [];
  for (let i = 0; i < 34; i++) for (let k = 0; k < counts[i]; k++) list.push(i);
  return list;
}

// 孤立牌の数を数える
// 孤立牌 = 1枚しかなく、数牌なら前後2つ以内に仲間がいない牌
// これが残っている手牌は「浮いた牌を切るだけ」の自明な問題になるため出題しない
function isolatedCount(counts) {
  let n = 0;
  for (let i = 0; i < 34; i++) {
    if (counts[i] !== 1) continue;
    if (i >= 27) { n++; continue; } // 字牌の1枚は常に孤立
    const r = i % 9;
    let near = false;
    for (let d = -2; d <= 2; d++) {
      if (d === 0 || r + d < 0 || r + d > 8) continue;
      if (counts[i + d] > 0) { near = true; break; }
    }
    if (!near) n++;
  }
  return n;
}

// ある13枚の手牌について、向聴数が進む牌とその枚数を求める
// visible: 場に見えている枚数（ここでは自分の手牌14枚）
function ukeire(counts13, baseShanten, visible) {
  const tiles = [];
  let total = 0;
  for (let i = 0; i < 34; i++) {
    if (counts13[i] >= 4) continue; // 4枚使い切っている牌は引けない
    counts13[i]++;
    const s = shanten(counts13);
    counts13[i]--;
    if (s < baseShanten) {
      const left = 4 - visible[i];
      if (left > 0) {
        tiles.push(i);
        total += left;
      }
    }
  }
  return { tiles, total };
}

// 14枚の手牌を解析し、打牌候補ごとの向聴数・受け入れを返す
// 「向聴数が小さい順 → 受け入れ枚数が多い順」でソート
function analyzeHand(counts14) {
  const visible = counts14; // 自分の手牌以外は見えていない前提
  const results = [];
  for (let d = 0; d < 34; d++) {
    if (counts14[d] === 0) continue;
    counts14[d]--;
    const s = shanten(counts14);
    const uke = ukeire(counts14, s, visible);
    counts14[d]++;
    results.push({ discard: d, shanten: s, tiles: uke.tiles, count: uke.total });
  }
  results.sort((a, b) => a.shanten - b.shanten || b.count - a.count);
  return results;
}

// --- 配牌の生成 -------------------------------------------------------

// 山からランダムに14枚配る。
// nearRate の確率で「すでに持っている牌の近く」を引くため、
// 値を上げるほど整った（向聴数の少ない）手牌になる
function dealHand(nearRate) {
  const counts = new Array(34).fill(0);
  const rest = new Array(34).fill(4); // 各牌の残り枚数

  function drawRandom() {
    let total = 0;
    for (let i = 0; i < 34; i++) total += rest[i];
    let r = (Math.random() * total) | 0;
    for (let i = 0; i < 34; i++) {
      r -= rest[i];
      if (r < 0) return i;
    }
    return 33;
  }

  function drawNear() {
    // 手牌にある牌とその前後2つを候補にする（字牌は同じ牌のみ）
    const cand = [];
    for (let i = 0; i < 34; i++) {
      if (counts[i] === 0) continue;
      if (i >= 27) {
        // 字牌は対子までしか伸ばさない（実戦であまり出ない形を避ける）
        if (rest[i] > 0 && counts[i] < 2) cand.push(i);
        continue;
      }
      const r = i % 9;
      for (let d = -2; d <= 2; d++) {
        if (r + d < 0 || r + d > 8) continue;
        // 同じ牌を4枚まで集めない
        if (rest[i + d] > 0 && counts[i + d] < 3) cand.push(i + d);
      }
    }
    if (cand.length === 0) return drawRandom();
    return cand[(Math.random() * cand.length) | 0];
  }

  for (let k = 0; k < 14; k++) {
    const i = k === 0 || Math.random() >= nearRate ? drawRandom() : drawNear();
    counts[i]++;
    rest[i]--;
  }
  return counts;
}

// 向聴数ごとの nearRate
// 向聴数は手牌の繋がり具合でほぼ決まるため、目標ごとに最も出やすい値を使う
const SHANTEN_NEAR_RATE = { 0: 0.65, 1: 0.45, 2: 0.10, 3: 0.00 };
const SHANTEN_LIST = [0, 1, 2, 3];

// 条件に合う手牌を探す
// target : 目標の向聴数
// gapOk  : 正解と次善手の受け入れ枚数の差を受け取り、採用するかを返す関数
function searchHand(target, gapOk, maxAttempts) {
  const nearRate = SHANTEN_NEAR_RATE[target];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const hand = dealHand(nearRate);

    // 安価なチェックで先に弾き、重い解析の回数を減らす
    if (isolatedCount(hand) !== 0) continue;
    if (hand.some((n) => n >= 4)) continue; // 同じ牌4枚使いは実戦的でないので除外
    if (shanten(hand) !== target) continue;

    const results = analyzeHand(hand);
    const best = results[0];
    if (best.shanten !== target) continue;

    // 最善手と同評価（向聴数・受け入れ枚数が同じ）の打牌はすべて正解とする
    const answers = results.filter(
      (r) => r.shanten === best.shanten && r.count === best.count
    );
    if (answers.length > 2) continue; // どれを切っても同じ手は出題しない

    const rest = results.filter(
      (r) => !(r.shanten === best.shanten && r.count === best.count)
    );
    if (rest.length === 0) continue;
    const second = rest[0];
    // 次善手が向聴戻しの手牌は「正解以外を切ると向聴が戻る」実質一択なので出題しない
    if (second.shanten !== best.shanten) continue;
    if (!gapOk(best.count - second.count)) continue;

    return { hand, results, answers: answers.map((r) => r.discard), shanten: best.shanten };
  }
  return null;
}

// 出題に適した問題を生成する
// targetShanten : 向聴数の指定。null なら 0〜3 からランダムに選ぶ
// gapRange      : 正解と次善手の受け入れ枚数の差の範囲 { min, max }
// 見つからなければ null を返す
function generateProblem(targetShanten = null, gapRange = { min: 2, max: 6 }) {
  const fixed = targetShanten !== null && SHANTEN_NEAR_RATE[targetShanten] !== undefined;
  const target = fixed ? targetShanten : SHANTEN_LIST[(Math.random() * SHANTEN_LIST.length) | 0];

  // 差が大きい手牌ほど数が少ないので、範囲内を探すだけだと差の小さい問題ばかりになる。
  // まず狙った差ちょうどを探し、見つからなければ順に条件を緩める
  const want = gapRange.min + ((Math.random() * (gapRange.max - gapRange.min + 1)) | 0);
  return (
    searchHand(target, (g) => g === want, 6000) ||
    searchHand(target, (g) => g >= gapRange.min && g <= gapRange.max, 20000) ||
    // 範囲が狭いと見つからないことがあるので、最後は上限を外して必ず出題する
    searchHand(target, (g) => g >= gapRange.min, 20000)
  );
}

if (typeof module !== 'undefined' && module.exports) {
  global.shanten = require('./shanten.js').shanten;
  module.exports = {
    TILE_NAMES, TILE_LABELS, SHANTEN_NEAR_RATE, parseHand, toTileList,
    isolatedCount, ukeire, analyzeHand, dealHand, searchHand, generateProblem,
  };
}
