import { Component } from "react";
import "../styles.css";
import Header from "../Header";
import Footer from "../Footer";
import { logError } from "../lib/logger";

// Catches any error thrown during render anywhere in the component tree
// below it (Header/Footer intentionally excluded so they still render
// even if the page content breaks). Logs the full cause via logError so
// it's visible in the browser console / Vercel logs, and shows a plain
// fallback instead of a blank white screen.
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    logError("_app.ErrorBoundary", error, {
      componentStack: info?.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-2xl px-5 py-16 text-center">
          <h1 className="font-display text-xl uppercase tracking-wide">
            Something broke.
          </h1>
          <p className="mt-2 font-mono text-xs text-grayText">
            The error's been logged. Try refreshing the page.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App({ Component: Page, pageProps }) {
  return (
    <>
      <Header />
      <main>
        <ErrorBoundary>
          <Page {...pageProps} />
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}
