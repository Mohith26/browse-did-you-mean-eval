// A copy of browse 0.11.3's suggestCommand (src/lib/command-suggestions.ts)
// with two optional changes, so they can be measured separately:
//   osa:     count an adjacent transposition ("opne") as 1 edit, not 2
//   short:   allow 0 edits for 1-2 letter tokens and 1 edit for 3-4 letter
//            tokens (the original allows max(2, floor(len / 3)) for all)
//   aliases: a few extra synonym aliases (see EXTRA_ALIASES)
import { distance as levenshtein } from "fastest-levenshtein";
import { aliasSuggestions } from "browse/dist/lib/command-suggestions.js";

export const EXTRA_ALIASES = new Map([
  ["quit", "stop"], ["exit", "stop"], ["close", "stop"],
  ["refresh", "reload"], ["evaluate", "eval"], ["js", "eval"],
  ["tabs", "tab:list"], ["hover", "mouse:hover"], ["scroll", "mouse:scroll"],
]);

const safeTokenPattern = /^[A-Za-z][A-Za-z0-9_-]*$/;

function osa(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

export function makeSuggester({ osa: useOsa = false, short = false, aliases = false } = {}) {
  const dist = useOsa ? osa : levenshtein;
  const allAliases = aliases ? new Map([...aliasSuggestions, ...EXTRA_ALIASES]) : aliasSuggestions;
  const threshold = (t) => {
    if (short && t.length <= 2) return 0;
    if (short && t.length <= 4) return 1;
    return Math.max(2, Math.floor(t.length / 3));
  };
  const prefixDistance = (tokens, commandId) => {
    const segments = commandId.split(":");
    if (segments.length !== tokens.length) return null;
    let total = 0;
    for (let i = 0; i < tokens.length; i++) {
      const d = dist(tokens[i], segments[i]);
      if (d > threshold(tokens[i])) return null;
      total += d;
    }
    return total > 5 ? null : total;
  };
  return function suggest(id, commandIds) {
    const tokens = [];
    for (const token of id.split(":")) {
      if (tokens.length >= 4 || !safeTokenPattern.test(token)) break;
      tokens.push(token.toLowerCase());
    }
    if (tokens.length === 0) return { attempted: "", suggestion: null };
    for (let n = tokens.length; n >= 1; n--) {
      const attempted = tokens.slice(0, n).join(":");
      const alias = allAliases.get(attempted);
      if (alias) return { attempted, suggestion: alias };
    }
    let best;
    for (let n = tokens.length; n >= 1; n--) {
      const prefix = tokens.slice(0, n);
      for (const commandId of commandIds) {
        const d = prefixDistance(prefix, commandId);
        if (d !== null && (!best || d < best.distance)) best = { attempted: prefix.join(":"), suggestion: commandId, distance: d };
      }
    }
    return best ? { attempted: best.attempted, suggestion: best.suggestion } : { attempted: tokens[0], suggestion: null };
  };
}
