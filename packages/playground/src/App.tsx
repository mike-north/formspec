import { useState, useCallback, useEffect } from "react";
import { Allotment } from "allotment";
import "allotment/dist/style.css";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import Drawer from "@mui/material/Drawer";
import GitHubIcon from "@mui/icons-material/GitHub";
import CodeIcon from "@mui/icons-material/Code";
import SettingsIcon from "@mui/icons-material/Settings";
import CloseIcon from "@mui/icons-material/Close";

import Editor from "./components/Editor";
import Output from "./components/Output";
import Preview from "./components/Preview";
import Lint from "./components/Lint";
import Constraints, { type ConstraintsConfig, DEFAULT_CONSTRAINTS } from "./components/Constraints";
import ErrorBoundary from "./components/ErrorBoundary";
import { useFormspecCompilation } from "./hooks/useFormspecCompilation";
import { examples, defaultExample } from "./lib/examples";

const STORAGE_KEY_CODE = "formspec-playground-code";
const STORAGE_KEY_CONSTRAINTS = "formspec-playground-constraints";

function App(): React.ReactElement {
  // Load initial state from localStorage
  const [code, setCode] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_CODE);
      if (saved) return saved;
    }
    return defaultExample.code;
  });

  const [constraints, setConstraints] = useState<ConstraintsConfig>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY_CONSTRAINTS);
      if (saved) {
        try {
          return JSON.parse(saved) as ConstraintsConfig;
        } catch {
          // ignore
        }
      }
    }
    return DEFAULT_CONSTRAINTS;
  });

  const [showConstraints, setShowConstraints] = useState(false);

  // Example menu
  const [exampleAnchor, setExampleAnchor] = useState<null | HTMLElement>(null);

  // Compile FormSpec with constraint validation
  const { isCompiling, jsonSchema, uiSchema, errors } = useFormspecCompilation(code, {
    constraints,
  });

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CODE, code);
  }, [code]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_CONSTRAINTS, JSON.stringify(constraints));
  }, [constraints]);

  const handleExampleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setExampleAnchor(event.currentTarget);
  }, []);

  const handleExampleClose = useCallback(() => {
    setExampleAnchor(null);
  }, []);

  const handleExampleSelect = useCallback((exampleCode: string) => {
    setCode(exampleCode);
    setExampleAnchor(null);
  }, []);

  const handleToggleConstraints = useCallback(() => {
    setShowConstraints((prev) => !prev);
  }, []);

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <AppBar position="static" color="transparent" elevation={0} sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Toolbar variant="dense" sx={{ minHeight: 48 }}>
          <Typography
            variant="h6"
            sx={{
              fontWeight: 600,
              fontSize: 16,
              background: "linear-gradient(135deg, #60a5fa 0%, #a78bfa 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            FormSpec Playground
          </Typography>

          <Box sx={{ flex: 1 }} />

          <Tooltip title="Load Example">
            <IconButton size="small" onClick={handleExampleClick} sx={{ mr: 1 }}>
              <CodeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={exampleAnchor}
            open={Boolean(exampleAnchor)}
            onClose={handleExampleClose}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            transformOrigin={{ vertical: "top", horizontal: "right" }}
          >
            {examples.map((example) => (
              <MenuItem
                key={example.name}
                onClick={() => { handleExampleSelect(example.code); }}
                sx={{ minWidth: 240 }}
              >
                <ListItemText
                  primary={example.name}
                  secondary={example.description}
                  slotProps={{
                    primary: { variant: "body2" },
                    secondary: { variant: "caption" },
                  }}
                />
              </MenuItem>
            ))}
          </Menu>

          <Tooltip title="Constraints">
            <IconButton
              size="small"
              onClick={handleToggleConstraints}
              sx={{ mr: 1, color: showConstraints ? "primary.main" : "text.secondary" }}
            >
              <SettingsIcon fontSize="small" />
            </IconButton>
          </Tooltip>

          <Tooltip title="View on GitHub">
            <IconButton
              size="small"
              component="a"
              href="https://github.com/mike-north/formspec"
              target="_blank"
              rel="noopener noreferrer"
            >
              <GitHubIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Box sx={{ flex: 1, overflow: "hidden" }}>
        <ErrorBoundary fallbackTitle="Error rendering playground">
        <Allotment>
          {/* Left Panel - Editor + Lint */}
          <Allotment.Pane minSize={300} preferredSize="40%">
            <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
              <Allotment vertical>
                <Allotment.Pane minSize={200} preferredSize="75%">
                  <Box sx={{ height: "100%", p: 1 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        display: "block",
                        px: 1,
                        py: 0.5,
                        color: "text.secondary",
                        fontWeight: 500,
                      }}
                    >
                      FormSpec Code
                    </Typography>
                    <Box sx={{ height: "calc(100% - 24px)" }}>
                      <Editor value={code} onChange={setCode} errors={errors} />
                    </Box>
                  </Box>
                </Allotment.Pane>
                <Allotment.Pane minSize={100} preferredSize="25%">
                  <Lint errors={errors} isCompiling={isCompiling} />
                </Allotment.Pane>
              </Allotment>
            </Box>
          </Allotment.Pane>

          {/* Middle Panel - Schema Output */}
          <Allotment.Pane minSize={250} preferredSize="30%">
            <Box sx={{ height: "100%", p: 1 }}>
              <Output jsonSchema={jsonSchema} uiSchema={uiSchema} />
            </Box>
          </Allotment.Pane>

          {/* Right Panel - Preview */}
          <Allotment.Pane minSize={250} preferredSize="30%">
            <Box sx={{ height: "100%", p: 1 }}>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  px: 1,
                  py: 0.5,
                  color: "text.secondary",
                  fontWeight: 500,
                }}
              >
                Live Form Preview
              </Typography>
              <Box sx={{ height: "calc(100% - 24px)" }}>
                <Preview jsonSchema={jsonSchema} uiSchema={uiSchema} />
              </Box>
            </Box>
          </Allotment.Pane>
        </Allotment>
        </ErrorBoundary>
      </Box>

      {/* Constraints Drawer */}
      <Drawer
        anchor="right"
        open={showConstraints}
        onClose={handleToggleConstraints}
        slotProps={{
          paper: {
            sx: {
              width: 360,
              backgroundColor: "background.default",
            },
          },
        }}
      >
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              p: 2,
              borderBottom: 1,
              borderColor: "divider",
            }}
          >
            <Typography variant="subtitle1" fontWeight={600}>
              Constraints Configuration
            </Typography>
            <IconButton size="small" onClick={handleToggleConstraints}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
            <Constraints config={constraints} onChange={setConstraints} />
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}

export default App;
