import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center p-8 gap-4 text-center min-h-[60vh]">
          <div className="text-4xl">🌱</div>
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
