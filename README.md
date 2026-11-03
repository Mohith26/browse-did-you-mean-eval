# browse did-you-mean eval

The Browserbase `browse` CLI prints a suggestion when you type an unknown command
(`"browse opne" is not a browse command. Did you mean "browse open"?`). A lot of
`browse` traffic comes from coding agents, and agents tend to act on that hint, so I
wanted to know how often it points at the right command and how often it points at
the wrong one.

This repo runs the real `suggestCommand` from the published `browse@0.11.3` package
against the CLI's own command list (`oclif.manifest.json`). No browser or Browserbase
account is needed.

```
npm install
node eval.mjs            # summary table
node eval.mjs --misses   # every typo the current engine gets wrong
```

## What it tests

1. **Typos (5,659 cases).** Every single-character deletion, adjacent swap, and
   QWERTY-neighbor substitution of each 3+ letter segment of all 77 visible command
   ids, each followed by an argument (`browse opne https://example.com`), the way
   oclif hands it to the hook.
2. **Guesses (30 cases).** Words agents and people bring from other browser tools
   (`quit`, `refresh`, `hover`, `tabs`, `js`, ...). I labeled the intended command for
   each one by hand in `guesses.json`; `[]` means nothing in `browse` fits, so the
   right answer is no suggestion. These labels are my judgment.

## Results

| variant | typo: right | typo: wrong cmd | typo: none | guesses right | guesses with a wrong command |
|---|---|---|---|---|---|
| browse 0.11.3 (current) | 99.9% | 0.1% | 0.0% | 6/30 | 8: ls->is, list->is, js->is, pdf->cdp, quit->wait, exit->wait, kill->fill, snap->stop |
| + transposition = 1 edit | 100.0% | 0.0% | 0.0% | 6/30 | same 8 |
| + tighter short-token limits | 99.2% | 0.0% | 0.8% | 8/30 | 1: kill->fill |
| + extra aliases | 99.2% | 0.0% | 0.8% | 17/30 | 1: kill->fill |

What I take from it:

- Typos of real commands are handled very well. The only misses are 4 swapped-letter
  typos that land on a sibling: `browse cloud sessions losg` suggests `list` instead
  of `logs`, `functions secrets edtach` suggests `attach`, `puload` suggests `reload`.
  Levenshtein counts a swap as 2 edits; counting it as 1 (optimal string alignment
  distance) fixes all 4 with no regressions.
- The bigger problem is confident wrong answers for words that aren't commands.
  Every token gets at least 2 edits of slack, which is a lot for short words:
  `quit` and `exit` suggest `wait`, `kill` suggests `fill`, `list`/`ls`/`js` suggest
  `is`. An agent that follows "Did you mean browse fill?" after typing `kill` is worse
  off than one that gets no suggestion.
- Allowing 0 edits for 1-2 letter tokens and 1 edit for 3-4 letter tokens removes 7 of
  those 8 wrong suggestions. The cost is 0.8% of typos (48 cases) that now get no
  suggestion, mostly 2-letter leftovers of 3-letter commands like `gt` for `get` and
  `tb list`. That's a tradeoff, not a free win.
- Aliases are the only thing that helps the guesses much (6/30 to 17/30), since a word
  like `refresh` is too far from `reload` for any edit-distance threshold. The 9 extra
  aliases in `proposed.mjs` are my picks; they score well partly because I wrote the
  labels too, so treat that column as a sanity check, not a benchmark.

`proposed.mjs` is a copy of the 0.11.3 algorithm with each change behind a switch, so
the rows above can be compared one change at a time. The `cli.command_not_found`
telemetry the CLI already sends would be a much better source of real guesses than my
list.
