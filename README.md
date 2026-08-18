# hcs-us-prototype

Prototype for the **LANTERN** formative study — a sandbox where a user inspects what an AI can
infer from their own conversation, revises either their attribute-level policy or their own words,
and observes the resulting privacy and downstream-task consequences.

```
design/lantern_wireframes.pen   wireframes (Pencil / pen.dev)
lantern-app/                    running prototype (Next.js + OpenAI)
```

## Running the prototype

```bash
cd lantern-app
npm install
cp .env.example .env.local     # add your OPENAI_API_KEY
npm run dev                    # http://localhost:3210
```

| Route | Purpose |
|---|---|
| `/study` | participant session |
| `/admin/scenarios` | register / edit scenarios |
| `/admin/sessions` | survey responses and revision-event logs |

See [`lantern-app/README.md`](lantern-app/README.md) for how the masking and simulation pipeline
works.

## Not in this repository

The study design specification, the weekly-meeting slides, the reference corpora under `etc/`, and
all participant session logs are deliberately excluded — see `.gitignore`.
