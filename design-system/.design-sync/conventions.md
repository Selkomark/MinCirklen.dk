## Setup

Import the stylesheet once at the app root — nothing is styled without it:

```jsx
import 'mincirklen-design-system/style.css'
import { ThemeProvider, Alert, Button } from 'mincirklen-design-system'

function App() {
  return (
    <ThemeProvider>
      <Alert variant="safe">You're in a moderated space.</Alert>
      <Button variant="safe">Join session</Button>
    </ThemeProvider>
  )
}
```

`ThemeProvider` sets `data-theme="light"|"dark"` on `<html>`, follows the OS `prefers-color-scheme` until the user picks explicitly (via `useTheme().toggleTheme()`), then persists that choice. Components render fine without it (light-theme tokens are the `:root` default) but dark mode and the toggle won't work — always wrap the app root in it regardless.

## Styling idiom: semantic CSS custom properties (+ utility classes for layout glue)

Every component reads `var(--token-name)` from tokens set on `:root` and overridden under `[data-theme="dark"]` — that's the only way component-level styling works; there are no style props on components. Compose new layout/spacing with these same tokens rather than hard-coded values:

| Purpose | Tokens |
|---|---|
| Surfaces | `--surface-app`, `--surface-raised`, `--surface-sunken`, `--surface-overlay` |
| Text | `--text-primary`, `--text-secondary`, `--text-on-accent` |
| Borders / focus | `--border-subtle`, `--border-strong`, `--focus-ring` |
| Calm / primary actions | `--accent-safe`, `--accent-safe-hover`, `--accent-safe-surface` |
| Informational | `--accent-info`, `--accent-info-surface` |
| Crisis / destructive **only** | `--signal-urgent`, `--signal-urgent-hover`, `--signal-urgent-surface` |
| Type | `--font-family-base`, `--font-size-{xs,sm,md,lg,xl,2xl,3xl,4xl}`, `--font-weight-{regular,medium,bold}`, `--line-height-{tight,base}` |
| Spacing (4px scale) | `--space-1` (4px) … `--space-8` (64px) |
| Radius | `--radius-{sm,md,lg,full}` |
| Shadow | `--shadow-{sm,md,lg}` |
| Motion | `--duration-{fast,base}`, `--easing-standard` (zeroed under `prefers-reduced-motion`) |

**The safe/urgent split is a product rule, not just a color choice**: this is a peer-support platform, so `urgent`/`signal-urgent` is reserved *exclusively* for crisis messaging, leaving/reporting a session, and destructive actions — never for generic emphasis. Default interactive state is `safe`. `neutral`/`info` badge and alert variants exist for everything else.

**Utility classes** (`ds-*` prefixed, plain CSS — for layout glue around components, e.g. in a landing page, never for styling a component's own internals): `ds-{m,p}{t,b,s,e,x,y}?-{0-8}` (margin/padding on the spacing scale), `ds-gap-{0-8}`, `ds-d-{flex,none,block,grid,...}`, `ds-flex-{row,column,...}`, `ds-justify-*` / `ds-items-*` (flex alignment), `ds-text-{start,center,end,truncate}`, `ds-bg-{safe,info,urgent,app,raised,sunken}` / `ds-text-{safe,info,urgent,primary,secondary}` (semantic color, never raw hex), `ds-rounded-{sm,md,lg,full}`, `ds-shadow-{sm,md,lg}`, `ds-border`/`ds-border-strong`.

## Where the truth lives

Read `styles.css` (the full token + component-CSS import closure) and each component's own `.prompt.md` before styling — they're the shipped source, not a summary of it.

## Components

`Button` (`safe|secondary|ghost|urgent`), `IconButton` (icon-only, same safe/urgent split, always needs a `label` for a11y), `Card` (surface container, `padded` toggle), `Badge` (`neutral|safe|info|urgent` status pill), `Alert` (`info|safe|urgent`, optional `icon`), `Avatar` (`label` + `size`, `anonymous` swaps to a neutral "?" — use `anonymous` by default for peer participants unless a real display name is explicit product intent), `TextField` (`label` + optional `hint`).

**Forms**: `Textarea`, `Checkbox`, `RadioGroup`+`Radio`, `Switch`, `Select`+`SelectItem`, `Calendar`, `DatePicker`, `ColorPicker`.

**Overlays**: `Modal`+`DialogTrigger` (wrap both in `DialogTrigger`; `Modal` takes `title` + children, function-children get a `close()` callback), `Tooltip`+`TooltipTrigger`, `Toast` (call `addToast(title, {variant})` anywhere; mount `<ToastRegionRoot/>` once at the app root).

**Navigation**: `Tabs`+`TabList`+`Tab`+`TabPanel`, `Accordion`+`AccordionItem`, `Menu`+`MenuItem`.

**Layout & typography**: `Container` (centers content, `fluid` to go full-width), `Row`+`Col` (12-column grid — `Col` takes `span`/`md`/`lg`, no span = equal-width), `Heading` (`level` 1-6), `Text` (`variant`: body/lead/muted/small), `Blockquote`, `List` (`ordered`/`unstyled`), `Table` (`striped`/`bordered`), `Figure` (`caption`).

**Marketing / landing-page blocks** — compose these with the primitives above rather than hand-rolling a section: `Section` (`tone`: app/raised/sunken, `spacing`: md/lg/xl — the base wrapper the rest build on), `Navbar` (`logo` + children links/actions), `Hero` (optional `media` for a split layout), `Feature` (`icon`+`title`+description, arrange in `Row`/`Col`), `Testimonial` (`quote`+`name`+`role`, `anonymous`), `Stat` (`value`+`label`), `CTASection` (accent-colored banner — use `Button variant="secondary"` or `"ghost"` for its actions, `"safe"` blends into the background), `PricingCard` (`features` string array, `highlighted` for the recommended plan), `Footer`+`FooterColumn`.

`CodeEditor` (self-hosted Monaco/VS Code editor) ships as a **separate package entry**, not from the main import: `import { CodeEditor } from 'mincirklen-design-system/code-editor'` + `import 'mincirklen-design-system/code-editor.css'`. Keep it out of the main bundle path — it pulls in a multi-MB TypeScript language service that unrelated components must never pay for.
