// ── SPARK ROUND SIMULATION ────────────────────────────────────────
// Picks round content and simulates the other player for the demo.
// syncScore is the real formula from docs/DATING_PLAN.md and moves server-side later.
import { WYR_OPTIONS, COMPAT_QUESTIONS, GUESS_ME } from "../data/content.js";

// Deterministic RNG so a given profile + question always "answers" the same way
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function rng(seed) {
  let a = hash(seed);
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const sample = (arr, n, used) => {
  const pool = arr.map((item, i) => ({ item, i })).filter(({ i }) => !used.has(i));
  const src = pool.length >= n ? pool : arr.map((item, i) => ({ item, i }));
  const out = [];
  while (out.length < n) {
    const pick = src.splice(Math.floor(Math.random() * src.length), 1)[0];
    out.push(pick);
  }
  return out;
};

// used: { wyr:Set, gm:Set, compat:Set } of indexes already shown this session
export function buildRound(used) {
  const wyr = sample(WYR_OPTIONS, 3, used.wyr);
  const gm = sample(GUESS_ME, 2, used.gm);
  const compat = sample(COMPAT_QUESTIONS, 6, used.compat);
  wyr.forEach(x => used.wyr.add(x.i)); gm.forEach(x => used.gm.add(x.i)); compat.forEach(x => used.compat.add(x.i));
  return { wyr: wyr.map(x => ({ ...x.item, key: `wyr${x.i}` })), gm: gm.map(x => ({ ...x.item, key: `gm${x.i}` })), compat: compat.map(x => ({ ...x.item, key: `c${x.i}` })) };
}

// Simulated answers, generated after the player answers so affinity can shape agreement
export function simulateOpponent(profile, round, mine) {
  const r = key => rng(`${profile.id}:${key}`);
  const wyr = round.wyr.map((item, i) => {
    const agree = r(item.key)() < profile.affinity;
    return agree ? mine.wyr[i] : (mine.wyr[i] === "a" ? "b" : "a");
  });
  const gm = round.gm.map((item, i) => {
    const g = r(item.key);
    const answer = Math.floor(g() * item.options.length);
    const guessRight = g() < profile.affinity * 0.85;
    const myAnswer = mine.gmAnswer[i];
    const wrong = (myAnswer + 1 + Math.floor(g() * (item.options.length - 1))) % item.options.length;
    return { answer, guess: guessRight ? myAnswer : wrong };
  });
  const compat = round.compat.map((item, i) => {
    const g = r(item.key);
    const roll = g();
    const diff = roll < profile.affinity ? (g() < 0.6 ? 0 : 1) : 2 + Math.floor(g() * 2);
    const dir = g() < 0.5 ? -1 : 1;
    let v = mine.compat[i] + dir * diff;
    if (v < 1 || v > 5) v = mine.compat[i] - dir * diff;
    return Math.min(5, Math.max(1, v));
  });
  return { wyr, gm, compat };
}

export function syncScore(round, mine, theirs) {
  const n = round.compat.length;
  const compatScore = Math.round(100 - round.compat.reduce((acc, _, i) => acc + Math.abs(mine.compat[i] - theirs.compat[i]), 0) / n * 20);
  const wyrPct = Math.round(round.wyr.filter((_, i) => mine.wyr[i] === theirs.wyr[i]).length / round.wyr.length * 100);
  const guesses = round.gm.flatMap((_, i) => [mine.gmGuess[i] === theirs.gm[i].answer, theirs.gm[i].guess === mine.gmAnswer[i]]);
  const guessPct = Math.round(guesses.filter(Boolean).length / guesses.length * 100);
  const sync = Math.round(0.5 * compatScore + 0.3 * wyrPct + 0.2 * guessPct);
  return { sync, compatScore, wyrPct, guessPct };
}

// The other player's private decision: "match" | "more" | "pass"
export function opponentDecision(profile, sync, roundNo) {
  const g = rng(`${profile.id}:decide:${roundNo}`)();
  if (sync >= 62 || (sync >= 52 && g < profile.affinity)) return "match";
  if (sync >= 42 && roundNo < 3) return "more";
  return "pass";
}

// Resolves both private choices, following the rules in the plan
export function resolve(mineChoice, theirChoice, roundNo) {
  if (mineChoice === "pass" || theirChoice === "pass") return "closed";
  if (mineChoice === "match" && theirChoice === "match") return "matched";
  return roundNo < 3 ? "next" : "closed";
}
