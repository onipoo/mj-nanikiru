// 向聴数計算エンジン
// 牌の内部表現: 長さ34の配列 counts[i] = その牌の枚数
//   0-8   : 1m-9m (萬子)
//   9-17  : 1p-9p (筒子)
//   18-26 : 1s-9s (索子)
//   27-33 : 東 南 西 北 白 發 中

// 么九牌のインデックス（国士無双用）
const TERMINALS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

// --- 通常形（4面子1雀頭）の向聴数 -------------------------------------
//
// 順子は同じ色の中でしか作れないので、色ごとの分解は互いに影響しない。
// そこで色ごとに「何面子・何搭子まで取れるか」を求めてキャッシュし、
// あとで組み合わせる。同じ色の並びは何度も出てくるためよく効く。

// 面子は最大4、搭子は最大5（4面子＋雀頭）まで数えれば足りる
const MAX_MELDS = 4;
const MAX_PARTIALS = 5;

// 色ごとの分解結果のキャッシュ。キーは牌の並びを5進数にしたもの
const _suitCache = new Map();

// 分解の途中経過を書き込む先
let _table;

// 搭子（対子・両面・嵌張）を取れるだけ取る
function _suitPartials(c, len, allowRun, i, melds, partials, hasPair) {
  if (partials >= MAX_PARTIALS - melds) {
    _table[melds][partials] |= hasPair ? 2 : 1;
    return;
  }
  while (i < len && c[i] === 0) i++;
  if (i >= len) {
    _table[melds][partials] |= hasPair ? 2 : 1;
    return;
  }
  // 対子
  if (c[i] >= 2) {
    c[i] -= 2;
    _suitPartials(c, len, allowRun, i, melds, partials + 1, true);
    c[i] += 2;
  }
  if (allowRun) {
    // 両面・辺張
    if (i + 1 < len && c[i + 1] > 0) {
      c[i]--; c[i + 1]--;
      _suitPartials(c, len, allowRun, i, melds, partials + 1, hasPair);
      c[i]++; c[i + 1]++;
    }
    // 嵌張
    if (i + 2 < len && c[i + 2] > 0) {
      c[i]--; c[i + 2]--;
      _suitPartials(c, len, allowRun, i, melds, partials + 1, hasPair);
      c[i]++; c[i + 2]++;
    }
  }
  // この牌からは搭子を作らない
  _suitPartials(c, len, allowRun, i + 1, melds, partials, hasPair);
}

// 面子（刻子・順子）を取れるだけ取る
function _suitMelds(c, len, allowRun, i, melds) {
  while (i < len && c[i] === 0) i++;
  if (i >= len || melds === MAX_MELDS) {
    _suitPartials(c, len, allowRun, 0, melds, 0, false);
    return;
  }
  // 刻子
  if (c[i] >= 3) {
    c[i] -= 3;
    _suitMelds(c, len, allowRun, i, melds + 1);
    c[i] += 3;
  }
  // 順子
  if (allowRun && i + 2 < len && c[i + 1] > 0 && c[i + 2] > 0) {
    c[i]--; c[i + 1]--; c[i + 2]--;
    _suitMelds(c, len, allowRun, i, melds + 1);
    c[i]++; c[i + 1]++; c[i + 2]++;
  }
  // この牌からは面子を作らない
  _suitMelds(c, len, allowRun, i + 1, melds);
}

// 1色分の分解結果を返す
// table[m][p] のビット: 1 = 対子なしで到達できる、2 = 対子ありで到達できる
function analyzeSuit(counts, start, len, allowRun) {
  // 牌の並びを5進数にしてキーにする
  let key = allowRun ? 1 : 0;
  for (let i = 0; i < len; i++) key = key * 5 + counts[start + i];
  const hit = _suitCache.get(key);
  if (hit !== undefined) return hit;

  const table = [];
  for (let m = 0; m <= MAX_MELDS; m++) table.push(new Array(MAX_PARTIALS + 1).fill(0));

  const work = counts.slice(start, start + len);
  const prev = _table;
  _table = table;
  _suitMelds(work, len, allowRun, 0, 0);
  _table = prev;

  _suitCache.set(key, table);
  return table;
}

// 通常形の向聴数（和了は -1）
function normalShanten(counts) {
  const suits = [
    analyzeSuit(counts, 0, 9, true),
    analyzeSuit(counts, 9, 9, true),
    analyzeSuit(counts, 18, 9, true),
    analyzeSuit(counts, 27, 7, false),
  ];

  // 色ごとの結果を順に組み合わせる
  // cur[m][p] のビットは analyzeSuit と同じ意味
  let cur = [];
  for (let m = 0; m <= MAX_MELDS; m++) cur.push(new Array(MAX_PARTIALS + 1).fill(0));
  cur[0][0] = 1;

  for (const table of suits) {
    const next = [];
    for (let m = 0; m <= MAX_MELDS; m++) next.push(new Array(MAX_PARTIALS + 1).fill(0));
    for (let m = 0; m <= MAX_MELDS; m++) {
      for (let p = 0; p + m <= MAX_PARTIALS; p++) {
        const flag = cur[m][p];
        if (flag === 0) continue;
        for (let m2 = 0; m2 + m <= MAX_MELDS; m2++) {
          for (let p2 = 0; p2 + p + m + m2 <= MAX_PARTIALS; p2++) {
            const f2 = table[m2][p2];
            if (f2 === 0) continue;
            // 対子ありは、どちらか一方にでも対子があれば立つ
            let bits = 0;
            if ((flag & 1) && (f2 & 1)) bits |= 1;
            if ((flag & 2) || (f2 & 2)) {
              if ((flag & 3) && (f2 & 3)) bits |= 2;
            }
            next[m + m2][p + p2] |= bits;
          }
        }
      }
    }
    cur = next;
  }

  let best = 8;
  for (let m = 0; m <= MAX_MELDS; m++) {
    for (let p = 0; p + m <= MAX_PARTIALS; p++) {
      const flag = cur[m][p];
      if (flag === 0) continue;
      let s = 8 - 2 * m - p;
      // 5ブロック使い切って雀頭が無い場合は1つ無駄になる
      if (m + p === MAX_PARTIALS && !(flag & 2)) s += 1;
      if (s < best) best = s;
    }
  }
  return best;
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
