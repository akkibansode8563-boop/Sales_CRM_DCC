import React from 'react'

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    console.error('App render error:', error, errorInfo)
    try {
      localStorage.setItem('dcc_last_render_error', JSON.stringify({
        message: error?.message || 'Unknown render error',
        stack: error?.stack || '',
        componentStack: errorInfo?.componentStack || '',
        capturedAt: new Date().toISOString(),
      }))
    } catch {}
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
    if (typeof window !== 'undefined') {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#F5F7FB',
        padding: 24,
      }}>
        <div style={{
          width: '100%',
          maxWidth: 420,
          background: '#FFFFFF',
          border: '1px solid #E5E7EB',
          borderRadius: 18,
          padding: 28,
          boxShadow: '0 20px 45px rgba(15, 23, 42, 0.08)',
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: '#FEF2F2',
            color: '#DC2626',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            marginBottom: 16,
          }}>
            !
          </div>
          <h2 style={{ margin: '0 0 8px', fontSize: '1.2rem', color: '#111827' }}>
            Something went wrong
          </h2>
          <p style={{ margin: '0 0 18px', color: '#6B7280', lineHeight: 1.5 }}>
            The page hit an unexpected error. Reloading usually fixes it, and this screen prevents a blank white page.
          </p>
          <button
            type="button"
            onClick={this.handleRetry}
            style={{
              border: 'none',
              background: '#2563EB',
              color: '#FFFFFF',
              borderRadius: 10,
              padding: '11px 16px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Reload App
          </button>
        </div>
      </div>
    )
  }
}

export default AppErrorBoundary
