# LANTERN — formative study prototype

Straw-man implementation of the wireframes in `../design/lantern_wireframes.pen`.

## Run

```bash
npm install
npm run dev        # http://localhost:3210
```

`.env.local` is copied from `../.env` and must contain `OPENAI_API_KEY` and `OPENAI_MODEL`.

## Routes

| Route | What it is |
|---|---|
| `/` | landing |
| `/study` | participant session (survey → baseline → N scenarios → reflection) |
| `/admin` | scenario registry: create / edit / delete, and detect PII spans |

## How enforcement works

Enforcement is **rewriting, not masking**. Blanking a phrase out would be nothing worth delegating
— highlighting the offending phrase would be enough for the participant to do it themselves. A
rewrite that keeps the message usable is the capability that justifies handing the job to the
system.

1. **Two versions of the conversation are kept.**
   - *base* — the participant's own words. Manual edits overwrite it; rewrites never do.
   - *applied* — the base after the current policy has been enforced. This is what Panel B shows
     and what the simulator receives.
2. **Execute** (`/api/rewrite`) — changing Allow/Block leaves the conversation untouched and
   surfaces an **Execute** button under the policy rows. It always rewrites **from the base**,
   under the whole current policy:
   - *blocked* → find the phrases that state the attribute and abstract or drop them, keeping the
     message natural and the task answerable;
   - *un-blocked* → the original wording is still in the base, so it comes back — but re-derived
     under the rest of the policy rather than restored verbatim, because another blocked attribute
     may still touch the same sentence.
   Each change is returned as `{before, after, strategy, reason}`, with both substrings verified
   against the actual texts so the diff can never mis-highlight.
3. **Preview** — a two-column diff scrolled as one: left is what the participant wrote with the
   flagged phrase highlighted, right is the rewrite with the replacement highlighted. Hovering
   either half of a pair explains what the phrase gave away and why the replacement still works.
   Nothing is applied until **Apply rewrite**.
4. **Simulation** (`/api/simulate`) — two calls run in parallel on the applied conversation:
   *inference* (per attribute: inferable, value, verbatim cues) and *task* (the downstream output).
   A **conflict** is `policy = block` **and** `inferable = true`.

The apparatus exists to make one thing visible: rewriting a phrase out does not guarantee the
attribute stops being inferable.

`/api/annotate` is still used by the admin page to show which attributes a scenario states
explicitly; it no longer drives the participant UI.

## Data

- `data/scenarios.json` — scenario registry (edit via `/admin`).
- `data/sessions/<participantId>.jsonl` — one JSON object per interaction:

  ```jsonc
  {
    "participantId": "P4K2QX", "seq": 9, "ts": "...", "round": 1,
    "scenarioId": "s1_manager_schedule", "scenarioIndex": 0,
    "action": "rewrite_apply",
    "label": "수정 적용 · 문구 1개 (건강)",        // reads as a sentence
    "detail": { "policy_applied": {...}, "changes": [...], "changed_turns": [...] }
  }
  ```

  `seq` is monotonic per session, so the history replays in order without trusting clocks.
  Every action is recorded — `policy_toggle`, `execute_click`, `rewrite_preview`, `rewrite_apply`,
  `rewrite_cancel`, `content_edit_open/save/cancel`, `simulate_click`, `simulate_result`,
  `finish_click`, `reflection_submit` — each with enough detail to reconstruct the state change:
  the policy before and after, the exact phrases rewritten and why, the text before and after an
  edit, and the full simulation result. `/admin/sessions` renders this as a per-scenario timeline
  and exports it as CSV.
