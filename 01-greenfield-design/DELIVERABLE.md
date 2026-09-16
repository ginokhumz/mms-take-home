# Problem 1 deliverable: Chirp

Fill in every section. Keep a section short if you have little to say, but do not delete it. If
you deliberately skipped something, write one line saying so and why.

Length is not marked. A tight 2,000 words beats a padded 8,000.

---

## 1. Use cases and scope

State the use cases you are designing for, in priority order. State what you excluded and why.
State the assumptions you are making that the prompt did not settle.

---

## 2. Capacity estimation

Show the arithmetic. Every figure gets its working.

Cover at least:

- Write rate in posts per second, average and peak. State the peak multiplier you assume.
- Fanout writes per second at the average fanout.
- The skew case: what one post from an account with over 1 million followers costs, and what that
  does to your write path.
- Storage per month: post bodies, images, edit history, materialised timelines, search index.
  Treat each separately and state the assumptions behind each.
- **Your read-to-write ratio, stated explicitly**, and the read load in requests per second that
  follows from it. Say how you chose the ratio and cross-check it against per-user behaviour.
- Egress bandwidth for images, and what it implies for caching.

If two constraints in the prompt do not reconcile arithmetically, show the calculation that proves
it and state the reading you adopt.

---

## 3. High-level design and diagram

One diagram, in a Mermaid fenced code block, showing components and the direction of data flow.
Then prose that walks the write path and the read path.

The diagram and the prose must agree. So must the diagram and section 4.

```mermaid
graph LR
  Client --> Placeholder[Replace this diagram]
```

---

## 4. Core components

One subsection per component. For each: its responsibility, what it stores or caches, how it
scales, and what happens when it is unavailable.

---

## 5. API contract

Cover all of the following.

### 5.1 Endpoints

Method, path, request body, response body, status codes. Cover at least: publish a post, read a
home timeline, read a single post, edit a post, read a post's edit history, search, follow,
unfollow, delete an account.

### 5.2 Authentication and authorisation

The scheme, where the credential lives, its lifetime, and how you revoke it.

### 5.3 Pagination

The mechanism and why. State what happens when new posts arrive mid-page.

### 5.4 Idempotency

Which operations are idempotent, and how a client retries a publish safely.

### 5.5 Error model

The shape of an error response. The status codes you use, and what each means in your system.
Distinguish retryable from terminal.

**Your frontend in `frontend/` must implement this contract. Write it so you can code against it.**

---

## 6. Data model

Entities, fields, keys, indexes and relationships. State your partitioning or sharding key for
each store and justify it against the access patterns in section 5.

Say explicitly how you store: the post, the edit history, the materialised timeline (if you use
one), the follow graph, and the search document.

---

## 7. Scaling and bottlenecks

Name the first component that breaks as load grows, and at what load. Then the second, and the
third. For each, say what you do about it.

---

## 8. Failure modes and reliability

For each significant failure, state the effect a user sees and the recovery.

Cover at least: a fanout worker dies mid post, the search indexer falls behind, the image store
is unavailable on publish, a timeline cache node is lost, the primary datastore fails over, a
purge job fails halfway.

State your consistency model, per read path. Say where you accept staleness and for how long.

---

## 9. Security

Cover at least: authentication and session handling, authorisation on edit and delete, abuse and
rate limiting, image upload handling (content type, size, malicious payloads), output escaping
for post bodies, personal data and what deletion actually removes, and transport.

---

## 10. Deployment and observability

How the system is deployed and released. Then: the metrics that tell you it is healthy, the
alerts you would page on, and the traces or logs you would need to debug the worked trace in
section 12.

Name the service level objective for the home timeline read and for search freshness.

---

## 11. Decision records

**This section is heavily weighted.** Write one record for each of the five decisions below. Use
the template exactly.

For each record, "the numbers that forced it" must cite specific figures from `PROMPT.md` or from
your own section 2 arithmetic. A record that cites no number scores zero for that record.

### Template

> **Decision:** what you chose.
> **Alternative rejected:** one real alternative, described well enough that it is clear you
> considered it.
> **The numbers that forced it:** the specific figures that made the choice.
> **What this costs:** what you gave up, stated plainly.
> **What would change my mind:** the observation or measurement that would make you switch.

### The five decisions

1. **Fanout strategy.** Write-time fanout, read-time merge, or a hybrid.
2. **Edit propagation.** What happens to timelines and caches when a post is edited inside the
   15 minute window.
3. **Search freshness.** How a post becomes searchable within 5 seconds.
4. **Deletion purge.** How an account deletion removes that user's posts from every timeline
   within 24 hours.
5. **Image handling.** Upload, storage, resizing, delivery and lifecycle.

---

## 12. Worked trace

**This section is heavily weighted.** Walk this exact scenario end to end.

> An account with 3 million followers edits a post 10 minutes after publishing it, while one of
> its followers is part way through paginating their home timeline.

Requirements:

- Invent identifiers and keep them consistent throughout: user identifiers, post identifiers,
  cursor values, revision numbers.
- Number the steps.
- After each step, state the resulting state at each component you named in section 4.
- Show the actual request and response payloads at each API call, matching section 5.
- State what the paginating follower sees, and whether they can see the post twice, zero times,
  or in two different versions.
- Name every point at which the system is inconsistent, and for how long.

The trace must agree with your diagram, your data model and your API contract. A disagreement
between them is the single most common reason this section loses marks.

---

## 13. Self-critique

**This section is heavily weighted.** Name the three weakest parts of your design.

For each one:

- What is weak, stated without hedging.
- Why you accepted it.
- **The specific test, experiment or measurement that would expose it.** Name the load, the
  metric and the threshold at which you would say the design has failed.

"It might not scale" is not a critique. "The purge job is untested above 5 million timeline
entries per account, and a load test at 5 billion entries would show whether the 24 hour target
holds" is.

---

## 14. Trade-offs and what you would do with more time

What you traded away deliberately. What you would build next, in order, and why that order.
