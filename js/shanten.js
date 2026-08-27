// 向聴数計算エンジン
// 牌の内部表現: 長さ34の配列 counts[i] = その牌の枚数
//   0-8   : 1m-9m (萬子)
//   9-17  : 1p-9p (筒子)
//   18-26 : 1s-9s (索子)
//   27-33 : 東 南 西 北 白 發 中

// 么九牌のインデックス（国士無双用）
const TERMINALS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

// --- 通常形（4面子1雀頭）の向聴数 -------------------------------------

let _best; // 探索中の最小値を保持する作業用変数

// 面子・搭子の分解結果を向聴数に変換する
function _evaluate(melds, partials, hasPair) {
  let s = 8 - 2 * melds - partials;
  // 5ブロック使い切って雀頭が無い場合は1つ無駄になる
  if (melds + partials === 5 && !hasPair) s += 1;
  if (s < _best) _best = s;
}

// 搭子（対子・両面・嵌張）を取れるだけ取る探索
function _searchPartials(c, i, melds, partials, hasPair) {
  if (melds + partials >= 5) {
    _evaluate(melds, partials, hasPair);
    return;
  }
  while (i <= 33 && c[i] === 0) i++;
  if (i > 33) {
    _evaluate(melds, partials, hasPair);
    return;
  }
  // 対子
  if (c[i] >= 2) {
    c[i] -= 2;
    _searchPartials(c, i, melds, partials + 1, true);
    c[i] += 2;
  }
  // 数牌のみ：両面／辺張
  if (i < 27 && i % 9 <= 7 && c[i + 1] > 0) {
    c[i]--; c[i + 1]--;
    _searchPartials(c, i, melds, partials + 1, hasPair);
    c[i]++; c[i + 1]++;
  }
  // 数牌のみ：嵌張
  if (i < 27 && i % 9 <= 6 && c[i + 2] > 0) {
    c[i]--; c[i + 2]--;
    _searchPartials(c, i, melds, partials + 1, hasPair);
    c[i]++; c[i + 2]++;
  }
  // この牌からは搭子を作らない
  _searchPartials(c, i + 1, melds, partials, hasPair);
}

// 面子（刻子・順子）を取れるだけ取る探索
function _searchMelds(c, i, melds) {
  while (i <= 33 && c[i] === 0) i++;
  if (i > 33 || melds === 4) {
    _searchPartials(c, 0, melds, 0, false);
    return;
  }
  // 刻子
  if (c[i] >= 3) {
    c[i] -= 3;
    _searchMelds(c, i, melds + 1);
    c[i] += 3;
  }
  // 順子（数牌のみ）
  if (i < 27 && i % 9 <= 6 && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    _searchMelds(c, i, melds + 1);
    c[i]++; c[i + 1]++; c[i + 2]++;
  }
  // この牌からは面子を作らない
  _searchMelds(c, i + 1, melds);
}

// 通常形の向聴数（和了は -1）
function normalShanten(counts) {
  const c = counts.slice();
  _best = 8;
  _searchMelds(c, 0, 0);
  return _best;
}

// --- 七対子 -----------------------------------------------------------

function chiitoiShanten(counts) {
  let pairs = 0;
  let kinds = 0;
  for (let i = 0; i < 34; i++) {
    if (counts[i] >= 2) pairs++;
    if (counts[i] >= 1) kinds++;
  }
  let s = 6 - pairs;
  // 種類が7未満だと足りない分だけ余計にかかる
  if (kinds < 7) s += 7 - kinds;
  return s;
}

// --- 国士無双 ---------------------------------------------------------

function kokushiShanten(counts) {
  let kinds = 0;
  let hasPair = 0;
  for (const i of TERMINALS) {
    if (counts[i] >= 1) kinds++;
    if (counts[i] >= 2) hasPair = 1;
  }
  return 13 - kinds - hasPair;
}

// --- 総合 -------------------------------------------------------------

// 手牌の向聴数（副露なしの門前手のみ対応）
function shanten(counts) {
  return Math.min(
    normalShanten(counts),
    chiitoiShanten(counts),
    kokushiShanten(counts)
  );
}

// Node（テスト）とブラウザの両方から使えるようにする
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { shanten, normalShanten, chiitoiShanten, kokushiShanten };
}
