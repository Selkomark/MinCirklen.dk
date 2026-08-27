import { Component, type ReactNode } from 'react'
import { ErrorPage } from './pages/ErrorPage'

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
      return <ErrorPage code={500} title="Something went wrong" message="An unexpected error occurred. Please try again." />
    }
    return this.props.children
  }
}
