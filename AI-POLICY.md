# AI policy

Read this before you start.

## AI assistants are allowed

You may use any AI assistant, for anything: brainstorming, drafting, arithmetic, code, review,
prose. We use them too. We are not testing whether you can work without one.

We are testing whether the reasoning in your submission is **yours** and whether it is **specific
to the numbers in these prompts**. A generic answer scores badly whether a person or a model wrote
it.

## Disclosure is mandatory

Every use of an AI assistant goes into `DECISION-JOURNAL.md`, in the AI usage log. For each use,
record four things.

1. What you asked. The substance of the prompt, not the exact keystrokes.
2. What came back, in one or two lines.
3. What you kept, what you changed and what you discarded.
4. Why. This is the part we read most closely.

A single line such as "used an assistant to draft the API section, kept the endpoint list, rewrote
the error model because the draft returned 200 on a failed write" is exactly right. It costs you
nothing and it earns credit for judgement.

## What happens if you do not disclose

**Undisclosed use that is later evident is a failed submission.** We do not run a detector and we
do not treat a hunch as proof. Evidence looks like this:

- Figures or constraints in your answer that do not appear in these prompts.
- A design decision you cannot defend or reproduce in the debrief.
- A frontend whose types contradict the API contract you wrote.
- A journal that appears in one commit at the end.

Any one of those becomes a question in the debrief. You will get the chance to answer it. If the
answer is "an assistant produced that and I did not record it", the submission fails on the
disclosure rule, not on the quality of the work.

Disclosed AI use never costs you a mark. Undisclosed AI use ends the process.

## Commit as you go

Commit in small steps as the work progresses. The commit history shows us how the design moved,
which is a large part of what we are buying.

**A single squashed commit is a red flag.** So is a history where the whole design lands in one
commit and then only typos change. Neither is an automatic fail, and both become debrief
questions that you will have to answer without notes.

Commit your dead ends too. A reverted approach with a message explaining why you reverted it is
worth more to us than a clean history.

## The debrief

A **45 minute debrief is mandatory**. It is not a formality and it carries real weight in the
decision.

In it you will:

- explain your major decisions **without notes**, including the alternatives you rejected;
- reproduce at least one capacity calculation live;
- take live changes to the constraints and say how your design responds;
- walk us through your frontend code and explain the state handling.

The debrief can move any score up or down. A candidate who defends a modest design well beats a
candidate who submits a polished document they cannot explain.

## The short version

Use AI. Say so. Own the reasoning. Be ready to defend it out loud.
