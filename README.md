# Senior developer take-home: system design

Welcome, and thank you for the time you are about to spend on this.

This pack holds two design problems and one small frontend build. It is written for a senior
engineer. We care far more about how you reason under a fixed set of numbers than about how much
you produce.

## What you receive

| Path | Contents |
|------|----------|
| `01-greenfield-design/PROMPT.md` | Problem 1. Design "Chirp", a microblog, from a blank page |
| `01-greenfield-design/DELIVERABLE.md` | The skeleton you fill in for Problem 1 |
| `01-greenfield-design/frontend/SPEC.md` | Problem 1b. A small TypeScript frontend for your own API |
| `02-critique-and-extend/EXISTING-DESIGN.md` | An existing design for "Snippet", a snippet-sharing service |
| `02-critique-and-extend/PROMPT.md` | Problem 2. Critique that design, then extend it |
| `02-critique-and-extend/DELIVERABLE.md` | The skeleton you fill in for Problem 2 |
| `AI-POLICY.md` | The rules on AI assistants. Read this before you start |
| `DECISION-JOURNAL.md` | Your journal template. It is marked |
| `ATTRIBUTION.md` | Credit for the upstream material this pack is based on |

## Time budget

We designed the pack for one weekend. The guide below is what we expect a strong answer to cost.

| Piece | Guide |
|-------|-------|
| Problem 1, the design document | about 5 hours |
| Problem 1b, the TypeScript frontend | 3 to 4 hours |
| Problem 2, critique and extend | about 4 hours |
| The decision journal | ongoing, written as you work |

Total is 12 to 13 hours. If you run over, stop and write down what you cut. We mark the judgement
in the cut, not the volume of the output.

Do not polish. A design document with rough edges and sharp reasoning beats a tidy document that
restates the prompt.

## Rules

1. **Use the exact numbers in each prompt.** Do not substitute figures you have seen elsewhere for
   a similar system. The numbers here are deliberately different, and every capacity claim you
   make is checked against them.
2. **Every claim about scale carries arithmetic.** Show the multiplication. A stated conclusion
   with no working scores as an opinion.
3. **AI assistants are allowed.** Disclosure is mandatory. Read `AI-POLICY.md`.
4. **Commit as you go.** The commit history is part of the submission.
5. **Write your journal while you work**, not at the end.
6. Any technology is allowed. Name real technologies where the choice matters, and say why.
7. You may use any reference material. You do not need to cite general reading.

## Deliverables

1. `01-greenfield-design/DELIVERABLE.md`, completed.
2. `01-greenfield-design/frontend/`, your working TypeScript application plus its `README.md`.
3. `02-critique-and-extend/DELIVERABLE.md`, completed.
4. `DECISION-JOURNAL.md`, completed as you worked.
5. The git history of this repository.

## Diagrams

Use Mermaid fenced code blocks inside the Markdown, so the diagram lives in the document and needs
no separate file. If you prefer to draw by hand, commit a photograph or an image and reference it.
We do not mark drawing quality. We mark whether the diagram and the prose agree.

## Submission format

1. Work inside this repository on a branch of your choosing.
2. Commit in small steps, with messages that say why you changed something.
3. When you finish, push the repository to a private host of your choice and give us read access,
   or send a `git bundle` of the full history. Do not squash the history.
4. Include nothing that needs a licence we do not hold.
5. Tell us the wall-clock time you spent on each piece. An honest overrun costs you nothing.

## The debrief

A 45 minute debrief follows the submission and it is mandatory. You explain your decisions without
notes, you take live changes to the constraints, and you walk us through your frontend code.
`AI-POLICY.md` states what that means for how you work.

## Questions

Ask. A question about an ambiguous requirement is a good signal, not a bad one. If you cannot
reach us, write the assumption into the deliverable and carry on. An explicit assumption never
loses marks. A silent one can.
