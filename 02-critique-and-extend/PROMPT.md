# Problem 2: critique and extend "Snippet"

Time guide: about 4 hours for both parts.

Read `EXISTING-DESIGN.md` first, in full.

That document describes a service that has run in production for three years. It was written by
the team that built it. It is not a trick document and it is not deliberately broken. It is a
normal design document of the kind you will be handed in your first week anywhere. It contains
real problems, in the places where real documents contain them.

---

# Part A: the weakness register

Produce a **ranked** register of the weaknesses in the existing design. Ranked means ordered by
your judgement of what matters most, with the ordering justified.

## Every entry carries five fields

| Field | What it must contain |
|-------|----------------------|
| **Issue** | What is wrong, in one sentence |
| **Evidence** | A concrete reproduction or a calculation **against this system's numbers** |
| **Impact** | What a user, an operator or the business actually experiences |
| **Severity** | High, medium or low, **with the justification for that level** |
| **Fix** | The change you would make, specific enough to hand to an engineer |

## What "evidence" means

Evidence is a calculation using the figures in section 3 of `EXISTING-DESIGN.md`, or a concrete
step-by-step reproduction. Two examples of the shape we want, on issues we have not listed:

- "At the stated ingest rate the table holds N rows by year 3. The query in section 7 has no
  predicate that the index can serve, so each run reads all N rows. At M bytes per row that is
  X GB of I/O per run, and the job runs hourly, so Y GB per day."
- "The identifier space is 62^7. After N links, the probability that a new insert collides is
  N divided by 62^7, which is 1 in Z. At the stated write rate that is C collisions in the final
  month, and section 5 has no collision handling, so the outcome is ..."

You do not have to use those two. They are there to fix the standard.

**A generic entry with no numbers scores at most 1 out of 4.** "Add rate limiting" is a generic
entry. "The write endpoint has no rate limit, so one client at 100 requests per second is 25
times the entire service write rate and fills the object store at ... " is not.

## Two additional questions

Answer both. They are marked separately from the register.

1. **Which single weakness would you fix first, and why?** Not the most severe one necessarily.
   Argue the ordering: risk, cost, blast radius, what it unblocks.
2. **Name one thing the existing design gets right that a naive redesign would break.** Be
   specific about the naive redesign you have in mind and about what it would cost.

## How Part A is marked

- How many genuine problems you find without prompting.
- Whether each carries real arithmetic.
- Whether your ranking is defensible, not whether it matches ours.
- The quality of the fixes.

We are not looking for a fixed list and you do not need to find everything. A short register of
six well-evidenced entries beats a list of twenty assertions.

---

# Part B: extend the design

Extend Snippet with the five capabilities below. Produce a design, not a wish list.

### 1. User accounts and authentication

Registration, login, credential storage, session or token handling, and what happens to the
existing anonymous snippets when accounts arrive.

### 2. Private snippets with access control

A snippet may be private to its owner, or shared with named users. Design the access model, the
enforcement point, and how it interacts with the caching in section 6 of the existing design.

### 3. Rate limiting and abuse protection

For anonymous users and for authenticated users. State the limits, the algorithm, where the
counter lives, and what a limited client receives.

### 4. An API v2 contract

Endpoints, authentication, pagination, idempotency and an error model. Say how v1 and v2 coexist
and how v1 is eventually retired.

### 5. Correct expiry at scale

Expiry that is correct and affordable at the year-3 row count. State the data change, the query,
the index and the job shape. Include what happens to cached copies of an expired snippet.

## Decision records

**Write a decision record for each of the five extensions.** Use the same template as Problem 1:

> **Decision:** what you chose.
> **Alternative rejected:** one real alternative.
> **The numbers that forced it:** specific figures from `EXISTING-DESIGN.md` or from your own
> Part A arithmetic.
> **What this costs:** what you gave up.
> **What would change my mind:** the observation that would make you switch.

A record that cites no number scores zero for that record.

## Migration

Finish Part B with a short migration section. The service is live and has 360 million existing
links. Say how you get from the current design to your extended one without a period where
existing links stop working.

---

Fill in `DELIVERABLE.md`.
