// 上級モード：和了までの速さ（平均和了巡目）で打牌を評価する
//
// 受け入れ枚数は「次の1手が進むか」しか見ない。
// こちらは「あと何巡で和了できるか」を見るため、
//   ・受け入れが狭くても聴牌したときの待ちが広い打牌
//   ・聴牌を崩して受け入れを広げる打牌（向聴戻し）
// が正解になることがある。

// 見えていない牌の総数（136枚 - 自分の手牌14枚）
const UNSEEN = 122;

// 和了できない手牌に与える大きな値（比較のときに必ず最下位になる）
const NEVER = 9999;

// 待ちがこの枚数以上なら、待ち変えを調べない（実測で効果がほぼないため）
const UPGRADE_SKIP_WAIT = 8;

// 残りの巡目。この巡のうちに和了できる確率で打牌を比べる
const TURNS = 12;

// 手牌13枚を文字列にしてメモ化のキーにする
function handKey(counts13) {
  return String.fromCharCode.apply(null, counts13);
}

// 同じ手牌を何度も調べるのでメモ化する。1問ごとに clearSpeedCache() で捨てる
let _waitCache = new Map();
let _routeCache = new Map();
let _tenpaiCache = new Map();
let _shantenCache = new Map();

function clearSpeedCache() {
  _waitCache.clear();
  _routeCache.clear();
  _tenpaiCache.clear();
  _shantenCache.clear();
}

// 向聴数の計算が全体のボトルネックなので、ここでもメモ化する
function sh(counts) {
  const k = handKey(counts);
  let v = _shantenCache.get(k);
  if (v === undefined) {
    v = shanten(counts);
    _shantenCache.set(k, v);
  }
  return v;
}

// 手牌に関係する牌（手牌にある牌と、数牌ならその前後2つ）に印を付ける。
// 和了牌も待ち変えの牌も必ずこの範囲に入るので、探索をここに絞れる
function nearbyTiles(counts13) {
  const flag = new Array(34).fill(false);
  for (let i = 0; i < 34; i++) {
    if (counts13[i] === 0) continue;
    if (i >= 27) { flag[i] = true; continue; }
    const r = i % 9;
    for (let d = -2; d <= 2; d++) {
      if (r + d < 0 || r + d > 8) continue;
      flag[i + d] = true;
    }
  }
  return flag;
}

// 聴牌している13枚の和了牌の枚数を数える
function winningTiles(counts13, remain) {
  const k = handKey(counts13);
  const hit = _waitCache.get(k);
  if (hit !== undefined) return hit;
  const v = countWinningTiles(counts13, remain);
  _waitCache.set(k, v);
  return v;
}

function countWinningTiles(counts13, remain) {
  let total = 0;
  const near = nearbyTiles(counts13);
  for (let i = 0; i < 34; i++) {
    if (!near[i]) continue;
    if (counts13[i] >= 4 || remain[i] <= 0) continue;
    counts13[i]++;
    const s = sh(counts13);
    counts13[i]--;
    if (s < 0) total += remain[i];
  }
  return total;
}

// 聴牌13枚から、引くと「より広い聴牌」に変えられる牌を列挙する
// W は現在の待ち枚数
function upgradeRoutes(counts13, remain, W) {
  // 引いた牌をそのまま切って、代わりに手牌の浮き牌を切る形も待ち変えになる。
  // その場合どの牌を引いても結果は同じなので、手牌と無関係な牌は1回だけ調べて使い回す
  const near = nearbyTiles(counts13);
  let genericWait = -1;

  function bestAfterDraw(i) {
    counts13[i]++;
    if (sh(counts13) < 0) { counts13[i]--; return -1; } // 和了牌は対象外
    let best = W;
    for (let d = 0; d < 34; d++) {
      if (counts13[d] === 0 || d === i) continue;
      counts13[d]--;
      if (sh(counts13) === 0) {
        const w = winningTiles(counts13, remain);
        if (w > best) best = w;
      }
      counts13[d]++;
    }
    counts13[i]--;
    return best;
  }

  const routes = [];
  for (let i = 0; i < 34; i++) {
    if (counts13[i] >= 4 || remain[i] <= 0) continue;
    let best;
    if (near[i]) {
      best = bestAfterDraw(i);
    } else {
      if (genericWait < 0) genericWait = bestAfterDraw(i);
      best = genericWait;
    }
    if (best > W) routes.push({ count: remain[i], wait: best });
  }
  return routes;
}

// 聴牌13枚の形を、待ち枚数と待ち変えの情報にまとめる
//   W     : いまの待ち枚数
//   C     : 引くと待ちが広がる牌の枚数
//   wider : 待ち変えしたあとの待ち枚数（枚数で重み付けした平均）
function tenpaiInfo(counts13, remain) {
  const k = handKey(counts13);
  const hit = _tenpaiCache.get(k);
  if (hit !== undefined) return hit;

  const W = winningTiles(counts13, remain);
  let info;
  if (W === 0) {
    info = { W: 0, C: 0, wider: 0 };
  } else if (W >= UPGRADE_SKIP_WAIT) {
    // 待ちが広い形は待ち変えの余地がほぼないので調べない
    info = { W, C: 0, wider: 0 };
  } else {
    const ups = upgradeRoutes(counts13, remain, W);
    let C = 0;
    let sum = 0;
    for (const r of ups) { C += r.count; sum += r.wait * r.count; }
    info = { W, C, wider: C > 0 ? sum / C : 0 };
  }
  _tenpaiCache.set(k, info);
  return info;
}

// 聴牌形が、残り n 巡のうちに和了する確率
// 待ち変えは1回だけ見込む（変えたあとは広い待ちで和了を待つ）
function tenpaiRate(info, n, unseen) {
  if (info.W <= 0 || n <= 0) return 0;
  if (info.C === 0) return hitProb(info.W, unseen, n);

  // 和了牌か待ち変え牌のどちらかを、i巡目に初めて引く
  const dist = firstHitDistribution(info.W + info.C, unseen, n);
  const winShare = info.W / (info.W + info.C);
  let total = 0;
  for (let i = 1; i <= n; i++) {
    if (dist[i] === 0) continue;
    total += dist[i] * winShare;                              // その巡に和了
    total += dist[i] * (1 - winShare) * hitProb(info.wider, unseen - i, n - i); // 待ち変えして和了
  }
  return total;
}

// 1シャンテンの13枚について、聴牌に向かう牌と、そのときの最大待ち枚数を求める
function tenpaiRoutes(counts13, remain) {
  const k = handKey(counts13);
  const hit = _routeCache.get(k);
  if (hit !== undefined) return hit;
  const v = findTenpaiRoutes(counts13, remain);
  _routeCache.set(k, v);
  return v;
}

function findTenpaiRoutes(counts13, remain) {
  const routes = [];
  const near = nearbyTiles(counts13);
  for (let i = 0; i < 34; i++) {
    if (!near[i]) continue;
    if (counts13[i] >= 4 || remain[i] <= 0) continue;
    counts13[i]++;
    if (sh(counts13) !== 0) {
      counts13[i]--;
      continue;
    }
    // 待ちが最も広くなる打牌を先に絞る（安い判定）
    let bestWait = 0;
    const candidates = [];
    for (let d = 0; d < 34; d++) {
      if (counts13[d] === 0) continue;
      counts13[d]--;
      if (sh(counts13) === 0) {
        const w = winningTiles(counts13, remain);
        if (w > bestWait) { bestWait = w; candidates.length = 0; candidates.push(d); }
        else if (w === bestWait && w > 0) candidates.push(d);
      }
      counts13[d]++;
    }
    // 同じ待ち枚数なら、待ち変えの余地がある形のほうがよい
    let best = null;
    for (const d of candidates) {
      counts13[d]--;
      const info = tenpaiInfo(counts13, remain);
      if (!best || info.C > best.C) best = info;
      counts13[d]++;
    }
    counts13[i]--;
    if (best && best.W > 0) {
      routes.push({ tile: i, count: remain[i], wait: bestWait, info: best });
    }
  }
  return routes;
}

// R枚の山に当たりが W枚あるとき、初めて当たりを引くまでの平均ツモ回数。
// 非復元抽出なので (R+1)/(W+1) で厳密に求まる（参考値として表示に使う）
function expectedDraws(W, R) {
  if (W <= 0) return NEVER;
  return (R + 1) / (W + 1);
}

// R枚の山に当たりが W枚あるとき、n巡のうちに1枚以上引く確率
function hitProb(W, R, n) {
  if (W <= 0 || n <= 0) return 0;
  let miss = 1;
  for (let k = 0; k < n; k++) {
    const left = R - W - k;
    if (left < 0) return 1;
    miss *= left / (R - k);
  }
  return 1 - miss;
}

// i巡目に初めて当たりを引く確率を i = 1..n について返す
function firstHitDistribution(W, R, n) {
  const p = new Array(n + 1).fill(0);
  if (W <= 0) return p;
  let miss = 1;
  for (let i = 1; i <= n; i++) {
    const left = R - (i - 1);
    if (left <= 0) break;
    p[i] = miss * (W / left);
    if (left - W <= 0) break;
    miss *= (left - W) / left;
  }
  return p;
}

// 13枚の手牌が、残り turns 巡のうちに和了する確率とその内訳を返す
// 2シャンテン以遠は計算量の都合で null（評価対象外）
//   rate     : 残り turns 巡で和了できる確率
//   toTenpai : 聴牌までの平均ツモ回数（すでに聴牌なら 0）
//   intake   : 聴牌に向かう牌の枚数（すでに聴牌なら null）
//   wait     : 聴牌したときの待ち枚数（1シャンテンなら平均）
function evaluateHand(counts13, remain, turns) {
  const s = sh(counts13);
  if (s < 0) return { rate: 1, toTenpai: 0, intake: null, wait: null };
  if (s === 0) {
    const info = tenpaiInfo(counts13, remain);
    return {
      rate: tenpaiRate(info, turns, UNSEEN),
      toTenpai: 0,
      intake: null,
      wait: info.W,
    };
  }
  if (s > 1) return null;

  // 1シャンテン：i巡目に聴牌し、残りの巡で和了する
  const routes = tenpaiRoutes(counts13, remain);
  if (routes.length === 0) return { rate: 0, toTenpai: NEVER, intake: 0, wait: 0 };

  let hit = 0;
  for (const r of routes) hit += r.count;
  let avgWait = 0;
  for (const r of routes) avgWait += (r.count / hit) * r.wait;

  const tenpaiAt = firstHitDistribution(hit, UNSEEN, turns);
  let rate = 0;
  for (let i = 1; i <= turns; i++) {
    if (tenpaiAt[i] === 0) continue;
    for (const r of routes) {
      rate += tenpaiAt[i] * (r.count / hit) * tenpaiRate(r.info, turns - i, UNSEEN - i);
    }
  }
  return { rate, toTenpai: expectedDraws(hit, UNSEEN), intake: hit, wait: avgWait };
}

// 14枚の手牌を解析し、打牌ごとの平均和了巡目を返す
// 「平均和了巡目が小さい順」でソート（＝速い順）
function analyzeSpeed(counts14, turns = TURNS) {
  clearSpeedCache(); // remain は手牌ごとに変わるので使い回さない
  const remain = new Array(34);
  for (let i = 0; i < 34; i++) remain[i] = 4 - counts14[i];

  const results = [];
  for (let d = 0; d < 34; d++) {
    if (counts14[d] === 0) continue;
    counts14[d]--;
    const s = sh(counts14);
    const info = evaluateHand(counts14, remain, turns);
    counts14[d]++;
    results.push({ discard: d, shanten: s, rate: info ? info.rate : null, info });
  }
  // 評価対象外（null）は末尾に置く。和了率が高い順
  results.sort((a, b) => {
    if (a.rate === null && b.rate === null) return a.shanten - b.shanten;
    if (a.rate === null) return 1;
    if (b.rate === null) return -1;
    return b.rate - a.rate || a.shanten - b.shanten;
  });
  return results;
}

// 聴牌を保つ打牌のうち、待ちが最も広いときの枚数を返す（聴牌でなければ -1）
// 向聴戻しが有効なのは、この値が小さいときだけなので絞り込みに使う
function bestTenpaiWait(counts14, remain) {
  let best = -1;
  for (let d = 0; d < 34; d++) {
    if (counts14[d] === 0) continue;
    counts14[d]--;
    if (sh(counts14) === 0) {
      const w = winningTiles(counts14, remain);
      if (w > best) best = w;
    }
    counts14[d]++;
  }
  return best;
}

// 上級モードの問題を作る
// targetShanten : 0（聴牌）または 1
// 受け入れ枚数で選ぶ手と、和了の速さで選ぶ手が食い違う手牌を優先して返す
function generateSpeedProblem(targetShanten, options = {}) {
  const minDiff = options.minDiff ?? 0.02; // 正解と次善手の和了率の差
  const maxTries = options.maxTries ?? 4000;
  const turns = options.turns ?? TURNS;
  const nearRate = targetShanten === 0 ? 0.65 : 0.45;

  let fallback = null;
  for (let i = 0; i < maxTries; i++) {
    const hand = dealHand(nearRate);

    // 安い判定で先に弾く
    if (hand.some((n) => n >= 4)) continue;
    if (isolatedCount(hand) !== 0) continue;
    if (sh(hand) !== targetShanten) continue;

    const remain = new Array(34);
    for (let k = 0; k < 34; k++) remain[k] = 4 - hand[k];

    // 聴牌の問題では、待ちが広い手牌は向聴戻しの余地がないので飛ばす
    if (targetShanten === 0) {
      clearSpeedCache();
      if (bestTenpaiWait(hand, remain) > 5) continue;
    }

    const speed = analyzeSpeed(hand, turns);
    const best = speed[0];
    if (best.rate === null || best.rate <= 0) continue;

    // 和了率が同じ打牌はすべて正解にする
    const answers = speed
      .filter((r) => r.rate !== null && Math.abs(r.rate - best.rate) < 1e-9)
      .map((r) => r.discard);
    if (answers.length > 2) continue;

    // 正解と次善手に、はっきり分かる差があること
    const second = speed.find((r) => r.rate !== null && !answers.includes(r.discard));
    if (!second || best.rate - second.rate < minDiff) continue;

    const results = analyzeHand(hand);
    const problem = { hand, results, speed, answers, shanten: targetShanten };
    if (!fallback) fallback = problem;

    // 受け入れ枚数で選ぶ手と違えば、上級モードらしい問題になる
    const ukBest = results[0];
    const ukAnswers = results
      .filter((r) => r.shanten === ukBest.shanten && r.count === ukBest.count)
      .map((r) => r.discard);
    if (!ukAnswers.includes(best.discard)) return problem;
  }
  return fallback;
}

if (typeof module !== 'undefined' && module.exports) {
  global.shanten = require('./shanten.js').shanten;
  const analyze = require('./analyze.js');
  global.dealHand = analyze.dealHand;
  global.isolatedCount = analyze.isolatedCount;
  global.analyzeHand = analyze.analyzeHand;
  module.exports = {
    UNSEEN, NEVER, TURNS, UPGRADE_SKIP_WAIT, winningTiles, tenpaiRoutes,
    firstHitDistribution, hitProb, clearSpeedCache, expectedDraws,
    evaluateHand, analyzeSpeed, bestTenpaiWait,
    upgradeRoutes, tenpaiInfo, tenpaiRate, generateSpeedProblem,
  };
}
