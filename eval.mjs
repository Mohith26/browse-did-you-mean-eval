// Measures browse's did-you-mean suggestions for unknown commands.
// Usage: npm install && node eval.mjs
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { suggestCommand } from "browse/dist/lib/command-suggestions.js";
import { makeSuggester } from "./proposed.mjs";

const require = createRequire(import.meta.url);
const manifest = require("browse/oclif.manifest.json");
const pkg = require("browse/package.json");
const commands = Object.values(manifest.commands).filter((c) => !c.hidden);
const ids = commands.map((c) => c.id);
const known = new Set([...ids, ...commands.flatMap((c) => c.aliases ?? [])]);

// 1. Synthetic typos: every single deletion, adjacent swap, and QWERTY-neighbor
// substitution of each segment (3+ letters) of every visible command id.
const rows = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const neighbors = {};
rows.forEach((row, r) => [...row].forEach((ch, c) => {
  const n = new Set();
  for (const [dr, dc] of [[0, -1], [0, 1], [-1, 0], [-1, 1], [1, -1], [1, 0]]) {
    const ch2 = rows[r + dr]?.[c + dc];
    if (ch2) n.add(ch2);
  }
  neighbors[ch] = [...n];
}));
function typos(word) {
  const out = new Set();
  for (let i = 0; i < word.length; i++) out.add(word.slice(0, i) + word.slice(i + 1));
  for (let i = 0; i + 1 < word.length; i++) out.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
  for (let i = 0; i < word.length; i++) for (const n of neighbors[word[i]] ?? []) out.add(word.slice(0, i) + n + word.slice(i + 1));
  out.delete(word);
  return [...out].filter((t) => /^[a-z][a-z0-9_-]*$/.test(t));
}
const typoCases = [];
for (const id of ids) {
  const segs = id.split(":");
  segs.forEach((seg, i) => {
    if (seg.length < 3) return;
    for (const t of typos(seg)) {
      const attempt = [...segs.slice(0, i), t, ...segs.slice(i + 1)].join(":");
      if (!known.has(attempt)) typoCases.push({ attempt, expected: id });
    }
  });
}

// 2. Hand-labeled guesses from other browser tools' vocabulary.
const guesses = Object.entries(JSON.parse(readFileSync(new URL("./guesses.json", import.meta.url))))
  .filter(([k]) => !k.startsWith("_"));

const variants = {
  "browse 0.11.3 (current)": suggestCommand,
  "+ transposition = 1 edit": makeSuggester({ osa: true }),
  "+ tighter short-token limits": makeSuggester({ osa: true, short: true }),
  "+ extra aliases": makeSuggester({ osa: true, short: true, aliases: true }),
};

const pct = (n, d) => `${((100 * n) / d).toFixed(1)}%`;
console.log(`browse ${pkg.version}: ${ids.length} visible commands, ${typoCases.length} typo cases, ${guesses.length} labeled guesses\n`);
console.log("variant                         | typo: right | typo: wrong cmd | typo: none | guesses right | guesses wrong cmd");
for (const [name, suggest] of Object.entries(variants)) {
  let right = 0, wrong = 0, none = 0;
  for (const { attempt, expected } of typoCases) {
    const s = suggest(attempt + ":https://example.com", ids).suggestion;
    if (s === expected) right++; else if (s) wrong++; else none++;
  }
  let gRight = 0; const gWrong = [];
  for (const [g, exp] of guesses) {
    const s = suggest(g, ids).suggestion;
    if ((s === null && exp.length === 0) || exp.includes(s)) gRight++;
    else if (s) gWrong.push(`${g}->${s.replaceAll(":", " ")}`);
  }
  console.log(`${name.padEnd(31)} | ${pct(right, typoCases.length).padStart(11)} | ${pct(wrong, typoCases.length).padStart(15)} | ${pct(none, typoCases.length).padStart(10)} | ${`${gRight}/${guesses.length}`.padStart(13)} | ${gWrong.length}${gWrong.length ? ": " + gWrong.join(", ") : ""}`);
}

if (process.argv.includes("--misses")) {
  for (const { attempt, expected } of typoCases) {
    const s = suggestCommand(attempt + ":https://example.com", ids).suggestion;
    if (s !== expected) console.log(`${attempt.replaceAll(":", " ")} -> ${s ? s.replaceAll(":", " ") : "(none)"} (meant ${expected.replaceAll(":", " ")})`);
  }
}
