import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Without this, any uncaught render error anywhere below (e.g. in the hex
// map) unmounts the entire React tree, which looks exactly like "everything
// disappears" — this catches it, shows what actually broke, and offers a way
// back in instead of a silent blank screen.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error("Canos Incognita crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-screen">
          <h2>Etwas ist schiefgelaufen</h2>
          <p className="error-detail">{this.state.error.message}</p>
          <button className="primary-button" onClick={() => window.location.reload()}>
            Neu laden
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
