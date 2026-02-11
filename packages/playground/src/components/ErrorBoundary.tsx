/**
 * React Error Boundary component for gracefully handling runtime errors.
 *
 * Wraps child components and catches JavaScript errors anywhere in the child
 * component tree, displaying a fallback UI instead of crashing the whole app.
 *
 * @example
 * ```tsx
 * <ErrorBoundary fallbackTitle="Preview Error">
 *   <FormPreview schema={schema} />
 * </ErrorBoundary>
 * ```
 */
import { Component, type ReactNode, type ErrorInfo } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import RefreshIcon from "@mui/icons-material/Refresh";

/** Props for the ErrorBoundary component. */
interface Props {
  /** Child components to render when no error has occurred. */
  children: ReactNode;
  /** Custom title to display when an error occurs. */
  fallbackTitle?: string;
}

/** Internal state for tracking error status. */
interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary that catches errors in child components and displays
 * a user-friendly error message with recovery options.
 */
export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  public override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Box
          sx={{
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            p: 4,
            textAlign: "center",
          }}
        >
          <Typography variant="h6" color="error" sx={{ mb: 2 }}>
            {this.props.fallbackTitle ?? "Something went wrong"}
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{
              mb: 3,
              maxWidth: 400,
              fontFamily: "monospace",
              fontSize: 12,
              p: 2,
              backgroundColor: "background.paper",
              borderRadius: 1,
              overflow: "auto",
              maxHeight: 150,
            }}
          >
            {this.state.error?.message}
          </Typography>
          <Box sx={{ display: "flex", gap: 2 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={this.handleReset}
            >
              Try Again
            </Button>
            <Button
              variant="contained"
              size="small"
              startIcon={<RefreshIcon />}
              onClick={this.handleReload}
            >
              Reload Page
            </Button>
          </Box>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
