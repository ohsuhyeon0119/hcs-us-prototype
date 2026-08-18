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

## How the simulation works

1. **Annotation** (`/api/annotate`) — the model marks the minimal literal phrases in each USER
   turn that disclose one of the six attributes. Each span is verified to be an exact substring
   before it is stored, so masking can never corrupt the transcript.
2. **Masking** (`src/lib/mask.ts`, pure) — pressing **Block** masks that attribute's spans in the
   content panel. Letters become `*`, spaces and punctuation are preserved, so the shape of the
   original text stays visible. Hovering a masked span shows the original.
3. **Simulation** (`/api/simulate`) — the masked transcript is what the model receives. Two calls
   run in parallel on it:
   - *inference*: per attribute, is it inferable, what value, which verbatim cues;
   - *task*: the downstream output, written only from what survived masking.
   A **conflict** is `policy = block` **and** `inferable = true`.

This is the point of the apparatus: masking the words does not always remove the inference.

## Data

- `data/scenarios.json` — scenario registry (edit via `/admin`).
- `data/sessions/<participantId>.jsonl` — one JSON object per event. Revision events carry
  `target_attribute`, `direction` (tighten/loosen), `edit_type` (policy/content), `before_state`,
  `after_state`, `round`, and `preceding_simulation`, matching spec §24.
