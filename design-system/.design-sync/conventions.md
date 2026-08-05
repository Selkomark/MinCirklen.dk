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

## Styling idiom: semantic CSS custom properties

No utility classes, no style props — every component reads `var(--token-name)` from tokens set on `:root` and overridden under `[data-theme="dark"]`. Compose new layout/spacing with these same tokens rather than hard-coded values:

| Purpose | Tokens |
|---|---|
| Surfaces | `--surface-app`, `--surface-raised`, `--surface-sunken`, `--surface-overlay` |
| Text | `--text-primary`, `--text-secondary`, `--text-on-accent` |
| Borders / focus | `--border-subtle`, `--border-strong`, `--focus-ring` |
| Calm / primary actions | `--accent-safe`, `--accent-safe-hover`, `--accent-safe-surface` |
| Informational | `--accent-info`, `--accent-info-surface` |
| Crisis / destructive **only** | `--signal-urgent`, `--signal-urgent-hover`, `--signal-urgent-surface` |
| Type | `--font-family-base`, `--font-size-{xs,sm,md,lg,xl,2xl}`, `--font-weight-{regular,medium,bold}`, `--line-height-{tight,base}` |
| Spacing (4px scale) | `--space-1` (4px) … `--space-8` (64px) |
| Radius | `--radius-{sm,md,lg,full}` |
| Shadow | `--shadow-{sm,md,lg}` |
| Motion | `--duration-{fast,base}`, `--easing-standard` (zeroed under `prefers-reduced-motion`) |

**The safe/urgent split is a product rule, not just a color choice**: this is a peer-support platform, so `urgent`/`signal-urgent` is reserved *exclusively* for crisis messaging, leaving/reporting a session, and destructive actions — never for generic emphasis. Default interactive state is `safe`. `neutral`/`info` badge and alert variants exist for everything else.

## Where the truth lives

Read `styles.css` (the full token + component-CSS import closure) and each component's own `.prompt.md` before styling — they're the shipped source, not a summary of it.

## Components

`Button` (`safe|secondary|ghost|urgent`), `IconButton` (icon-only, same safe/urgent split, always needs a `label` for a11y), `Card` (surface container, `padded` toggle), `Badge` (`neutral|safe|info|urgent` status pill), `Alert` (`info|safe|urgent`, optional `icon`), `Avatar` (`label` + `size`, `anonymous` swaps to a neutral "?" — use `anonymous` by default for peer participants unless a real display name is explicit product intent), `TextField` (`label` + optional `hint`).
