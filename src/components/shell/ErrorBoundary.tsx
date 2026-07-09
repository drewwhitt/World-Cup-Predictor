import { Component, type ErrorInfo, type ReactNode } from "react";
import s from "./ErrorBoundary.module.css";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Catches render/lifecycle errors anywhere in the wrapped tree and shows a
 * branded, recoverable message instead of React's default behavior of
 * unmounting the whole app to a blank white screen. Without this, any
 * single bad Supabase response or edge-case null in one view would take
 * down the entire page for a non-technical visitor with no explanation
 * and no way to recover short of guessing to hit refresh.
 *
 * App.tsx keys this boundary by the active tab, so switching tabs after a
 * crash remounts it fresh rather than staying stuck in an errored state.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged for the admin's own devtools console during the beta window;
    // intentionally not sent anywhere else since there's no error-tracking
    // service wired up yet.
    console.error("Veridex view crashed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className={s.wrap}>
          <div className={s.eyebrow}>Veridex</div>
          <h2 className={s.heading}>Something went wrong loading this page.</h2>
          <p className={s.body}>
            This section hit an unexpected error. Refreshing usually fixes it — the rest of the
            model isn't affected.
          </p>
          <button className={s.button} onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}