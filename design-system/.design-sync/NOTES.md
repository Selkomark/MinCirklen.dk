# Sync notes

- No Storybook in this repo — confirmed with the user on the first sync. Package shape (`shape: "package"`) is intentional; don't re-detect.
- `Nunito Sans` (variable font, latin subset only) was downloaded from Google Fonts and committed at `src/tokens/fonts/nunito-sans/` — imported via `src/tokens/typography.css`, so it flows through the library's own build (Vite inlines it as a base64 data URI in `dist/style.css`). This is why `[FONT_MISSING]` never needed `cfg.extraFonts`: the font is genuinely part of the shipped bundle, not a sync-only side channel.
  - Only the `latin` unicode-range subset was kept (covers Danish æ/ø/å — all ≤ U+00FF). If the product ever needs Cyrillic/Greek/Vietnamese-extended text, more subsets must be downloaded and added the same way.
- Fixed during this sync: the base typographic reset (`body { font-family: var(--font-family-base); ... }`) originally lived only in the demo app's `src/index.css`, never in the library entry (`src/index.ts`) — so the shipped package never actually set a base font, and un-classed text (headings, paragraphs) silently fell back to the browser serif default. Moved into `src/tokens/base.css`, imported from `tokens/index.css`, so both the library build and the demo app get it. Caught by the absolute-rubric grading pass (Card preview showed serif body text) — this is exactly the kind of bug that grading is for.
- `ThemeProvider` is deliberately left on the floor card (not authored) — it's a non-visual context wrapper, not a standalone renderable. This is intentional, not a gap; leave as floor card on future re-syncs unless the user asks for a themed composition example.
- This is a from-scratch v0 design system (8 exports total, 7 authored + ThemeProvider). Expect components to be added frequently — re-syncs should be run whenever new components land in `src/components/`.

## Known render warns

None — render check and grading are both fully clean (0 bad, 0 thin, 0 variantsIdentical, 0 pendingGrade).

## Re-sync risks

- The authored previews (`.design-sync/previews/*.tsx`) use realistic but static demo copy (e.g. "Anonymous participant", "Weekly circle"). If component props are renamed or behavior changes, these previews won't auto-update — re-check them against the fresh `.d.ts` on any prop-shape change.
- The Nunito Sans font file was sourced manually (not via an automated pipeline). If the product later needs additional weights, italics, or language subsets, that's a manual re-download from Google Fonts' CSS2 API, same process as this sync.
- No `docsDir`/`docsMap` is configured — every `.prompt.md` is synthesized from the `.d.ts` + authored preview, not from real component documentation (none exists yet in this repo).
