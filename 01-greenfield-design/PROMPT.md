# Problem 1: design "Chirp"

Time guide: about 5 hours for this document. The frontend in `frontend/SPEC.md` is a further
3 to 4 hours.

## The brief

Design **Chirp**, a public microblog. A user writes a short post. Followers of that user see the
post in their home timeline. Anyone can search the public post corpus.

You are designing the system from a blank page. Choose the shape, the storage, the components and
the contracts. Justify each choice against the numbers below.

## Constraints

These numbers are the assessment. Use them exactly. Do not substitute figures from any other
system you have read about.

| Constraint | Value |
|------------|-------|
| Active users | 20 million |
| New posts | 50 million per day |
| Average fanout | 50 followers per post |
| Follower skew | The top 0.1% of accounts each exceed 1 million followers |
| Post body | Up to 500 characters |
| Attachment | One optional image, at most 2 MB |
| Edit window | A post stays editable for 15 minutes after publication |
| Edit history | The edit history of a post is viewable |
| Search freshness | Search reflects a new post within 5 seconds of publication |
| Account deletion | Deleting an account purges that user's posts from every timeline within 24 hours |

**You must state a read-to-write ratio assumption explicitly.** The prompt does not give you one.
Choose a value, write it in the capacity section, and derive your read load from it. State how you
arrived at the value. A cross-check against plausible per-user behaviour earns credit.

Every other number you need is yours to assume. State each assumption where you use it.

## Scope

In scope:

- Publishing a post, with or without an image.
- The home timeline: the posts of the accounts a user follows.
- The public search corpus.
- Editing a post inside the 15 minute window, and reading the edit history.
- Following and unfollowing an account.
- Deleting an account and the purge that follows.

Out of scope, so do not design them:

- Direct messages, notifications, trending topics, advertising, recommendation ranking.
- The follow graph's own storage design beyond what your timeline design needs from it.
- Moderation policy. Note where a moderation hook belongs, then move on.

## What to produce

Fill in `DELIVERABLE.md`. It lists the required sections. Three of those sections carry
disproportionate weight, so read them now:

- **Decision records** for five named decisions. Each one must cite the specific numbers from
  this prompt that drove the choice.
- **A worked trace** of one concrete scenario, end to end, with invented but consistent
  identifiers.
- **A self-critique** naming the three weakest parts of your own design.

A design document that covers every section competently but writes those three generically will
not pass. A design document with a rough scaling section and three excellent originality sections
may.

## How this is marked

- Arithmetic that is shown, not asserted.
- Decisions that name the number that forced them.
- Internal consistency. The diagram, the API contract, the data model and the worked trace must
  describe the same system.
- Honest treatment of what your design does badly.

## A note on the numbers

Read the constraint table carefully before you start. If two figures in it appear to pull against
each other, say so in the deliverable, state the reading you adopt and design against that
reading. Noticing a tension in the requirements is a senior behaviour and we mark it as one.
Silently picking one figure and ignoring the other is not.
