import { Component, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'

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
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center min-h-[60vh]">
          <img src="/icons/error-plant.svg" alt="" className="w-20 h-20" />
          <p className="text-text-muted text-sm max-w-xs">
            Pagina kon niet geladen worden. Dit gebeurt soms na een update.
          </p>
          <p className="text-xs text-text-muted/50 font-mono max-w-xs truncate">
            {this.state.error?.message ?? 'Unknown error'}
          </p>
          <button
            onClick={this.handleRetry}
            className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Opnieuw proberen
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
