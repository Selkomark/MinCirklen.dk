import { Component, type ReactNode } from 'react'
import { ErrorPage } from './pages/ErrorPage'
import i18n from './i18n'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

// A class component, not a hook: React only supports catching a render
// crash in children via getDerivedStateFromError/componentDidCatch, which
// have no functional-component equivalent. This is the app's "5xx" —
// something broke unexpectedly, as opposed to a recoverable in-page
// failure (a failed fetch, a bad form submit), which pages already
// surface inline via Alert per the async-action-buttons pattern.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: unknown, info: { componentStack?: string | null }) {
    console.error('[ErrorBoundary] unexpected render error', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      // A class component, not `useTranslation` — reads the i18next
      // singleton directly. Every namespace (including "errors") is
      // preloaded eagerly at init (see i18n.ts's `ns: NAMESPACES`), so by
      // the time a real runtime crash can happen this is already resolved;
      // this doesn't need the hook's re-render-on-load subscription.
      return (
        <ErrorPage code={500} title={i18n.t('errors:boundary.title')} message={i18n.t('errors:boundary.message')} />
      )
    }
    return this.props.children
  }
}
