# Problem 1b: the Chirp home timeline frontend

Time guide: 3 to 4 hours. Build this **after** you have written the API contract in
`../DELIVERABLE.md` section 5.

## The point of this exercise

This is not a generic frontend test. **The application must consume the API contract you wrote.**
That is what makes it yours and that is the first thing we check. If your code and your contract
disagree, both lose marks.

Build a home-timeline view for Chirp.

## Requirements

### Setup

- TypeScript, with `strict: true` in `tsconfig.json`.
- Any framework, or none. React, Vue, Svelte, Solid, Angular or plain DOM are all fine.
- `npm install` then `npm run dev` must work on a clean checkout. State the Node version you used.
- Commit your lockfile.

### The mock layer

- Ship a mock server or a fixture layer that implements **your** contract. A set of JSON fixtures,
  a request interceptor or a small Express or Hono mock are all acceptable.
- The mock must be able to produce a failure, so your error path is reachable without editing
  code. A query parameter, an environment variable or a button in the interface all count.

### Types

- Derive the API types from your contract. Hand-written interfaces are fine. A generated client is
  fine. Types that do not match the documented contract are the main way to lose marks here.

### Behaviour

1. **Cursor pagination.** A "load more" control that fetches the next page using the cursor
   mechanism from your contract.
2. **Loading, empty and error states.** The error state must render from **your error model**, not
   from a generic string.
3. **Optimistic post creation.** A new post appears immediately, then reconciles with the server
   response. On failure it rolls back and tells the user.
4. **The edited indicator.** A post that has been edited shows an indicator, consistent with the
   edit-history design you wrote in Problem 1.

### Out of scope

State these as out of scope and do not spend time on them:

- Styling polish. Plain and legible is enough.
- Authentication user interface. Assume a credential is present.
- A real backend.
- Image upload.
- Tests are welcome but not required. If you write none, say so in your README.

## What you commit

```
frontend/
  README.md          # required, see below
  package.json
  tsconfig.json
  src/...
```

### `frontend/README.md`

Required. Keep it short and cover:

- How to install and run it, and the Node version.
- The structure: what lives where, and why.
- **Which part of your API contract each module implements.**
- How to trigger the error path.
- What you cut, and what you would do next.

## How this is marked

| Weight | What we look at |
|--------|-----------------|
| Highest | Contract consistency. Does the code match the document you wrote? |
| High | State handling. Loading, empty, error, optimistic write, rollback, pagination edges |
| High | Type quality. Is `strict` genuinely on, and are the types honest, or is `any` doing the work? |
| Medium | Commit history. Small steps, readable messages |
| Medium | The README, and the honesty of the "what I cut" section |

We do not mark visual design.

## In the debrief

You will share your screen and walk us through this code. Expect to be asked why you chose a
state approach, what happens when the optimistic write and the "load more" race each other, and
what you would change if the contract gained a field.
