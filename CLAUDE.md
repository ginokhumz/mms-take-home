# CLAUDE.md — working context for this take-home

Orientation file for anyone (human or assistant) picking this repo up cold. Source of truth is
always the prompt files; this is a map, not a replacement.

---

## Ground rules that apply to both sections

These come from [README.md](README.md) and [AI-POLICY.md](AI-POLICY.md) and override any habit
to the contrary.

1. **Use the exact numbers in each prompt.** Never substitute figures from a similar system you
   have read about elsewhere. Every capacity claim is checked against the prompt's table.
2. **Every scale claim shows its arithmetic.** A conclusion with no working scores as an opinion.
3. **AI use is allowed but disclosure is mandatory.** Every assistant interaction goes in
   [DECISION-JOURNAL.md](DECISION-JOURNAL.md) with four fields: what was asked, what came back,
   what was kept/changed/discarded, and why. Undisclosed use that is later evident is a *failed
   submission*. Write the journal entry at the time, not at the end — "a journal that appears in
   one commit at the end" is listed as evidence of non-disclosure.
4. **Commit in small steps, as you go.** A single squashed commit is a red flag. Commit dead ends
   too, with a message explaining the revert. Do not squash history on submission.
   **Never run `git commit` unsolicited.** Finish the work, stage nothing, and ask — proposing the
   commit message. The commits are the audit trail the debrief reads, so the wording and the
   boundaries between commits are mine to approve. This applies even when a task obviously ends in
   a commit.
5. **The reasoning must be defensible without notes.** A mandatory 45-minute debrief follows:
   explain decisions and rejected alternatives from memory, reproduce a capacity calculation live,
   absorb live constraint changes, and walk through the frontend code. This is the practical limit
   on how much an assistant should write versus check — anything unexplainable out loud is a
   liability regardless of how good it reads.
6. **Diagrams are Mermaid fenced blocks** inside the Markdown. Drawing quality is not marked;
   agreement between diagram and prose is.
7. **Explicit assumptions never lose marks. Silent ones can.** If something is ambiguous and
   nobody is reachable, write the assumption into the deliverable and continue.
8. Do not polish. Rough edges with sharp reasoning beat tidy restatement of the prompt.

### Time budget (guide, ~12–13h total)

| Piece | Guide |
|-------|-------|
| 01 design document | ~5 h |
| 01b TypeScript frontend | 3–4 h |
| 02 critique and extend | ~4 h |
| Decision journal | ongoing |

If you run over, stop and write down what you cut. Report honest wall-clock per piece; an overrun
costs nothing.

---

# Section 01 — Greenfield design: "Chirp"

**Files:** [PROMPT.md](01-greenfield-design/PROMPT.md) ·
[DELIVERABLE.md](01-greenfield-design/DELIVERABLE.md) ·
[frontend/SPEC.md](01-greenfield-design/frontend/SPEC.md)

Design a public microblog from a blank page: a user writes a short post, followers see it in a
home timeline, anyone can search the public corpus. Then build a TypeScript home-timeline
frontend that consumes *the API contract you wrote*.

## The constraint table (use these exactly)

| Constraint | Value |
|------------|-------|
| Active users | 20 million |
| New posts | 50 million per day |
| Average fanout | 50 followers per post |
| Follower skew | Top 0.1% of accounts each exceed 1 million followers |
| Post body | Up to 500 characters |
| Attachment | One optional image, ≤ 2 MB |
| Edit window | Editable for 15 minutes after publication |
| Edit history | Viewable |
| Search freshness | New post searchable within 5 seconds |
| Account deletion | Purges that user's posts from every timeline within 24 hours |

**Read-to-write ratio is deliberately not given.** You must state one explicitly in the capacity
section, derive read load from it, say how you arrived at it, and cross-check it against plausible
per-user behaviour. That cross-check earns credit.

**The prompt hints that two figures may pull against each other** ("if two figures appear to pull
against each other, say so"). Do this arithmetic yourself — the average-fanout figure and the
skew figure are the obvious pair to test against the active-user count. Noticing and naming a
tension is marked as senior behaviour; silently picking one figure and ignoring the other is not.

## Scope

**In:** publishing (with/without image), home timeline, public search corpus, editing inside the
15-minute window plus reading edit history, follow/unfollow, account deletion and purge.

**Out (do not design):** DMs, notifications, trending, ads, recommendation ranking; the follow
graph's own storage beyond what the timeline needs; moderation policy (note where the hook belongs
and move on).

## Deliverable shape

14 sections in `DELIVERABLE.md`. Fill every one; keep a section short rather than deleting it.
Length is not marked — a tight 2,000 words beats a padded 8,000.

**Three sections carry disproportionate weight.** The prompt is blunt: a document that covers
everything competently but writes these three generically *will not pass*; one with a rough
scaling section and three excellent originality sections *may*.

- **§11 Decision records** — five named decisions: fanout strategy, edit propagation, search
  freshness, deletion purge, image handling. Template is fixed (Decision / Alternative rejected /
  The numbers that forced it / What this costs / What would change my mind). **A record citing no
  number scores zero.**
- **§12 Worked trace** — one exact scenario: an account with 3 million followers edits a post
  10 minutes after publishing, while a follower is part-way through paginating their timeline.
  Numbered steps, invented-but-consistent identifiers, component state after each step, real
  request/response payloads matching §5, and an explicit answer to whether the paginating follower
  sees the post twice, zero times, or in two versions. Name every inconsistency window and its
  duration.
- **§13 Self-critique** — the three weakest parts, unhedged, each with the *specific* test that
  would expose it: named load, named metric, named failure threshold.

Consistency is the other big lever: the diagram (§3), components (§4), API contract (§5), data
model (§6) and worked trace (§12) must all describe the same system. Disagreement between them is
called out as the most common way to lose marks.

## Section 01b — the frontend

Build it **after** writing the API contract in §5. Highest-weighted criterion is contract
consistency: if the code and the document disagree, both lose marks.

- TypeScript with `strict: true`; any framework or none; `npm install` && `npm run dev` on a clean
  checkout; state the Node version; commit the lockfile.
- Mock server or fixture layer implementing *your* contract, with a way to force a failure without
  editing code (query param, env var, or a button).
- Four behaviours: cursor pagination ("load more"), loading/empty/error states (error rendered
  from *your* error model, not a generic string), optimistic post creation with rollback on
  failure, and an edited indicator consistent with your edit-history design.
- Out of scope: styling polish, auth UI, real backend, image upload. Tests welcome, not required —
  if you write none, say so in the README.
- `frontend/README.md` is required: install/run + Node version, structure and why, **which part of
  the contract each module implements**, how to trigger the error path, what you cut and what's
  next.

Debrief will ask: why this state approach, what happens when the optimistic write races "load
more", and what changes if the contract gains a field. Have answers.

## Useful tools and skills for Section 01

| Tool / skill | Use it for |
|---|---|
| `Bash` + `python3 -c` | **The highest-value tool here.** Every capacity figure needs shown arithmetic. Compute in the shell, paste the working into §2 — it prevents the classic error of asserting a number the multiplication does not support. Also use it to test the fanout/skew tension. |
| `Plan` agent | Structuring the design before writing: component boundaries, which store holds what, where the §3–§6 consistency risks are. Ask it to design, not to write prose. |
| `WebSearch` / `WebFetch` | Reference material is explicitly allowed and needs no citation. Good for checking real technology characteristics (e.g. a store's actual write throughput or index-refresh behaviour) so named technologies are defensible in the debrief. |
| `run` skill | Launching the frontend dev server and confirming the timeline, pagination, error path and optimistic rollback actually work in a browser — not just that they compile. |
| `code-review` skill | Pass over the frontend before committing: state-handling edges, pagination boundaries, `any` leaking through `strict`. Use `--fix` only if you read the findings. |
| `security-review` skill | Light pass on the frontend diff; §9 of the deliverable also wants output escaping and upload handling reasoned about. |
| `Read` / `Edit` | Keeping §5 (contract) and the frontend types in sync — re-read the contract before touching types, and edit the contract rather than drifting the code. |
| `general-purpose` agent | A cold consistency audit: hand it §3, §4, §5, §6 and §12 and ask where they contradict each other. A fresh reader catches drift that you no longer see. |

**Avoid:** `Artifact` for the deliverables. Everything is marked in-repo as Markdown with Mermaid;
publishing a page adds nothing and splits the source of truth.

---

# Section 02 — Critique and extend: "Snippet"

**Files:** [PROMPT.md](02-critique-and-extend/PROMPT.md) ·
[EXISTING-DESIGN.md](02-critique-and-extend/EXISTING-DESIGN.md) ·
[DELIVERABLE.md](02-critique-and-extend/DELIVERABLE.md)

Read `EXISTING-DESIGN.md` in full first. It is a normal design document for a service that has run
in production for three years — not a trick, not deliberately broken. It contains real problems in
the places real documents contain them.

## Snippet's numbers (from §3 of the existing design)

| Figure | Value |
|--------|-------|
| New snippets | 10 million per month |
| Reads | 100 million per month |
| Read-to-write ratio | 10 : 1 |
| Average snippet size | 1 KB |
| Maximum snippet size | Not enforced |
| Retention | 3 years of history for analytics |
| Links created over 3 years | 360 million |
| Derived | ~4 writes/sec, ~40 reads/sec average; team sizes for 10× peak |

All Part A evidence must be arithmetic against *these* figures, or a concrete step-by-step
reproduction.

## Part A — the weakness register

Ranked by your judgement of what matters most, with the ordering justified. Every entry carries
five fields: **Issue** (one sentence), **Evidence** (calculation against this system's numbers or
a reproduction), **Impact** (what a user, operator or the business experiences), **Severity**
(high/med/low *with justification*), **Fix** (specific enough to hand to an engineer).

**A generic entry with no numbers scores at most 1 out of 4.** "Add rate limiting" is generic.
Six well-evidenced entries beat twenty assertions. You are not expected to find everything.

Plus two separately-marked questions:
- **A.3** Which single weakness to fix *first* — not necessarily the most severe. Argue risk,
  cost, blast radius, what it unblocks.
- **A.4** One thing the design gets *right* that a naive redesign would break. Name the specific
  naive redesign and what it would cost.

Areas of the document that reward arithmetic (find your own; this is where to point the
calculator, not a list of answers): the short-link generation scheme in §5, the expiry query in
§7, the read-path behaviour in §6 including the missing-row response and the cache headers, the
analytics write on the request path, indefinite log retention in §8, and the single-primary write
path in §9.

## Part B — extend the design

Five capabilities, designed not listed: (1) accounts and authentication, including what happens to
existing anonymous snippets; (2) private snippets with access control — state the **enforcement
point** and how it interacts with the cache in §6 of the existing design; (3) rate limiting for
anonymous *and* authenticated users — limits as numbers, algorithm, where the counter lives, what
a limited client receives; (4) an API v2 contract with auth, pagination, idempotency and an error
model, plus v1/v2 coexistence and v1 retirement; (5) correct expiry at the year-3 row count —
data change, query, index, job shape, and what happens to cached copies.

**Five decision records**, same template as Section 01, each citing figures from
`EXISTING-DESIGN.md` or from your own Part A arithmetic. **No number = zero for that record.**

**B.8 Migration** closes it: 360 million live links, no window in which an existing link stops
working. Order of steps, and the rollback for each.

## Useful tools and skills for Section 02

| Tool / skill | Use it for |
|---|---|
| `Bash` + `python3 -c` | Again the core tool. Every register entry lives or dies on its evidence field: row counts at year 3, bytes of I/O per expiry run, collision probability over 360M inserts, log-store growth at 100M reads/month. Compute, then paste the working. |
| `general-purpose` agent | An **independent critique pass**: hand it `EXISTING-DESIGN.md` cold and ask for problems with arithmetic, then compare against your own list. Use it to check coverage after you have formed your own view — running it first anchors you to its answers, which is exactly what the debrief will expose. |
| `Plan` agent | Part B's shape, especially the interaction between private snippets and the existing cache, and the migration ordering for 360M live links. |
| `WebSearch` / `WebFetch` | Grounding named choices — password hashing parameters, token-bucket vs sliding-window behaviour, partitioned-table expiry patterns — so Part B names real technologies with real characteristics. |
| `Read` | Re-read `EXISTING-DESIGN.md` §§5–9 before each register entry. The evidence field must quote this system's actual behaviour, and it is easy to critique a remembered version instead of the written one. |
| `AskUserQuestion` | Ambiguity in Part B scope. Though note the prompt's own guidance: if you cannot reach them, write the assumption into the deliverable and carry on. |

**Avoid:** `code-review` and `security-review` — Section 02 produces no code. Reason about security
in prose in B.2–B.4 instead.

---

## Submission checklist

- [ ] `01-greenfield-design/DELIVERABLE.md` — all 14 sections, §§11/12/13 specific and consistent
- [ ] `01-greenfield-design/frontend/` — runs clean, `strict: true`, implements your own contract,
      with its `README.md`
- [ ] `02-critique-and-extend/DELIVERABLE.md` — ranked register with arithmetic, five decision
      records, migration plan
- [ ] `DECISION-JOURNAL.md` — written throughout, with the AI usage log complete
- [ ] Git history — small commits, honest messages, dead ends included, not squashed
- [ ] Wall-clock time per piece reported
- [ ] Working on a branch; pushed to a private host with read access, or sent as a `git bundle`
