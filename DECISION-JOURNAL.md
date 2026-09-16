# Decision journal

Write in the first person. Write as you work, not at the end. Rough timestamps are fine, and
"about 40 minutes later" is a valid timestamp.

This file is marked. We read it for three things: how your understanding changed, what you tried
and abandoned, and how you used any AI assistant. See `AI-POLICY.md`.

Keep it honest. "I did not understand the deletion requirement for the first hour" is a good
entry. It tells us more than a tidy narrative does.

Delete these instructions and the example entry before you submit, or leave them. We do not mind.

---

## Time log

Fill this in at the end. Wall-clock hours, honestly.

| Piece | Hours |
|-------|-------|
| Problem 1, design document | |
| Problem 1b, frontend | |
| Problem 2, critique and extend | |
| Journal and admin | |
| **Total** | |

---

## Entries

### Your entries start here

**Wednesday, about 11:00** Read instructions and browsed the 2 problems. Created the repos and initial commits. 

**Wednesday, about 11:30** Started with Problem 1. Read through the documents to get understanding of what needs to be done and what is required.

**Wednesday, about 12:00** Initialized structure for AI agents that covers the whole project.

**Wednesday, about 21:00** Planned out the plan and capacity section

**Wednesday, about 21:30** Planned out the design and core components


---

## Changes of mind

List the decisions you reversed. One line each: what you first chose, what you moved to, and what
made you move.

| First choice | Moved to | What changed my mind |
|--------------|----------|----------------------|
| | | |

---

## Dead ends

List the approaches you tried and abandoned. We read this section closely. An empty section is a
weaker signal than a full one.

| Approach | Why I abandoned it |
|----------|--------------------|
| | |

---

## AI usage log

One row per use. Add rows as you go. If you used no AI assistant at all, write "none" and say so
in the debrief.

| When | What I asked | What came back | What I kept, changed or discarded, and why |
|------|--------------|----------------|--------------------------------------------|
| Wednesday 12:00 | Instructed Claude to write a context file from the instructions that will be used during developement | A claude file and settings file for permissions for the tools | Nothing yet. It looks solid, I'll update where I see it misbehaving |
| Wednesday (§1 drafting) | Asked Claude to expand on use cases and scope | Draft covering: prioritised use cases, exclusions with reasons, the fanout-vs-skew arithmetic (20,000 top accounts × 1M = 20B edges vs 20M × 50 = 1B), an adopted reading (follower counts include inactive registered accounts), and an assumptions table | Moved the arithmatic to section 2 because that is the best place for it, remove repetition |
| Wednesday (§3/§4 drafting) | Asked Claude to propose the high-level design diagram and the core components | Hybrid fanout (push under 100k followers, read-time merge above), Mermaid diagram, write/read path prose, and 13 component subsections each with store / scaling / unavailability. Grounding arithmetic computed in the shell: 579 posts/s avg, 1,736/s at 3× peak, 28,935 timeline writes/s, one 3M-follower post = 3M writes ≈ 104 s of the whole average fanout budget, 384 GB materialised timelines, ~405 TB/month images | Kept the hybrid and the 104 s figure — that number is the argument for it. Kept the decision that timeline entries store `(post_id, author_id)` only and never the body, because it makes §11.2 (edit propagation) and §11.4 (purge) nearly free. Still to check against myself: the 100,000-follower wide/narrow threshold is asserted, not derived — I need to justify it in §11.1 or move it. Peak multiplier of 3× is used here before §2 states it; §2 must state it or the two sections disagree |
| | | | |
---

## Assumptions I made

Every assumption you made that the prompt did not settle. One line each, with the value you chose.

| Assumption | Value I chose | Why |
|------------|---------------|-----|
| | | |

---

## What I would do with another day

Three to five lines. Be specific.
