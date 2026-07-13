import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import PageDecor from './PageDecor'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

/**
 * Wraps ErrorBoundary so it can consume the router location hook.
 * Resets the error boundary on every route change so a stale error
 * from a previous page doesn't persist.
 */
export function ErrorBoundary({ children, fallback }: Props) {
  const location = useLocation()
  return <ErrorBoundaryImpl locationKey={location.key} fallback={fallback}>{children}</ErrorBoundaryImpl>
}

interface ImplProps extends Props {
  locationKey: string
}

class ErrorBoundaryImpl extends Component<ImplProps, State> {
  constructor(props: ImplProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidUpdate(prevProps: ImplProps) {
    if (prevProps.locationKey !== this.props.locationKey) {
      // Clear error state when navigating to a new page
      this.setState({ hasError: false, error: null })
    }
  }

  handleRetry = () => {
    // Hard reload: fetch fresh index.html with correct chunk hashes
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      // Static bilingual text on purpose: this screen must render even when
      // the app (including the language provider) has crashed.
      return (
        <div className="relative flex flex-col items-center justify-center p-8 gap-4 text-center min-h-[60vh] overflow-hidden">
          <PageDecor variant="sparse" />
          <img src="/icons/error-plant.svg" alt="" className="relative w-20 h-20" />
          <div className="relative max-w-xs">
            <p className="m-0 text-text-muted text-sm">
              Pagina kon niet geladen worden. Dit gebeurt soms na een update.
            </p>
            <p className="m-0 mt-1 text-text-muted/70 text-xs italic" lang="en">
              The page could not load. This sometimes happens after an update.
            </p>
          </div>
          <p className="relative text-xs text-text-muted/50 font-mono max-w-xs truncate">
            {this.state.error?.message ?? 'Unknown error'}
          </p>
          <button
            onClick={this.handleRetry}
            className="relative px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Opnieuw proberen · Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
