# Promising ideas

A durable record of product/feature ideas evaluated against `CHARTER.md`
and judged worth pursuing — as proposed, or in a narrower form — so a
good idea survives past the session it was floated in. Maintained by the
`idea-review` skill.

## 2026-09-05 — Structured self-reflection prompts for users

**Idea:** Narrower version of the "AI as investigative quasi-therapist"
idea in `REJECTED_IDEAS.md`. Instead of an AI silently profiling every
message a user sends and building a persistent psychological map, offer
a small set of static, clinician-reviewed reflection prompts a user can
optionally pull up themselves during or between sessions — the same
underlying goal (help someone articulate what they're actually
struggling with before a session, or between sessions) without any AI
investigation, no per-user profile, no persistent psychological data
stored anywhere.

**Verdict:** promising (narrower: fully static content, no AI
involvement, no persistent per-user data at all — the user pulls the
prompts up themselves, nothing is logged against their identity).

**Why:** Keeps the platform's actual differentiator (anonymous peer
support, deterministic safety handling per `CHARTER.md` §3) untouched —
this is just better self-serve content, not a new AI-driven decision
surface in the crisis-handling path. Sidesteps the GDPR Article 9 /
DPIA problem entirely since nothing is captured or stored — the user's
own reflection stays in their own head or notes, never touches the
platform's data model. Needs a clinician's input on the actual prompt
set before shipping (not something to write from general knowledge) and
a decision on where it surfaces in the UI — not yet scoped further than
this.
