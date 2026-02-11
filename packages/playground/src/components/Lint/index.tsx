import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import ErrorIcon from "@mui/icons-material/Error";
import WarningIcon from "@mui/icons-material/Warning";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import type { DiagnosticMessage } from "../../lib/compiler";

export interface LintProps {
  errors: DiagnosticMessage[];
  isCompiling?: boolean;
}

export function Lint({ errors, isCompiling }: LintProps): React.ReactElement {
  const hasErrors = errors.some((e) => e.severity === "error");

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>
          Diagnostics
        </Typography>
        {isCompiling ? (
          <Typography variant="caption" color="text.secondary">
            Compiling...
          </Typography>
        ) : errors.length === 0 ? (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <CheckCircleIcon sx={{ fontSize: 16, color: "success.main" }} />
            <Typography variant="caption" color="success.main">
              No issues
            </Typography>
          </Box>
        ) : (
          <Typography
            variant="caption"
            color={hasErrors ? "error.main" : "warning.main"}
          >
            {errors.length} {errors.length === 1 ? "issue" : "issues"}
          </Typography>
        )}
      </Box>

      <Box sx={{ flex: 1, overflow: "auto" }}>
        {errors.length === 0 ? (
          <Box
            sx={{
              p: 3,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "text.secondary",
              height: "100%",
            }}
          >
            <CheckCircleIcon sx={{ fontSize: 48, color: "success.main", mb: 1, opacity: 0.5 }} />
            <Typography variant="body2">
              Your FormSpec code is valid
            </Typography>
          </Box>
        ) : (
          <List dense sx={{ py: 0 }}>
            {errors.map((error, index) => (
              <ListItem
                key={index}
                sx={{
                  borderBottom: 1,
                  borderColor: "divider",
                  alignItems: "flex-start",
                  py: 1.5,
                }}
              >
                <ListItemIcon sx={{ minWidth: 32, mt: 0.25 }}>
                  {error.severity === "error" ? (
                    <ErrorIcon sx={{ fontSize: 18, color: "error.main" }} />
                  ) : (
                    <WarningIcon sx={{ fontSize: 18, color: "warning.main" }} />
                  )}
                </ListItemIcon>
                <ListItemText
                  primary={
                    <Typography
                      variant="body2"
                      sx={{
                        fontFamily: '"JetBrains Mono", monospace',
                        fontSize: 12,
                        wordBreak: "break-word",
                      }}
                    >
                      {error.message}
                    </Typography>
                  }
                  secondary={
                    error.line !== undefined && (
                      <Typography variant="caption" color="text.secondary">
                        Line {error.line}
                        {error.column !== undefined && `, Column ${String(error.column)}`}
                      </Typography>
                    )
                  }
                />
              </ListItem>
            ))}
          </List>
        )}
      </Box>
    </Box>
  );
}

export default Lint;
