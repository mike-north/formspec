import { useState, useMemo } from "react";
import Box from "@mui/material/Box";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CheckIcon from "@mui/icons-material/Check";
import type { JSONSchema7, UISchema } from "@formspec/build/browser";

export interface OutputProps {
  jsonSchema: JSONSchema7 | null;
  uiSchema: UISchema | null;
}

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps): React.ReactElement | null {
  if (value !== index) return null;
  return (
    <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
      {children}
    </Box>
  );
}

function JsonViewer({ data, label }: { data: unknown; label: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);

  const jsonString = useMemo(() => {
    if (data === null) return "// No schema generated yet";
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return "// Error serializing schema";
    }
  }, [data]);

  const handleCopy = () => {
    if (data === null) return;
    navigator.clipboard.writeText(jsonString).then(
      () => {
        setCopied(true);
        setTimeout(() => { setCopied(false); }, 2000);
      },
      (error: unknown) => {
        console.error("Failed to copy:", error);
      }
    );
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Typography variant="caption" color="text.secondary">
          {label}
        </Typography>
        <Tooltip title={copied ? "Copied!" : "Copy to clipboard"}>
          <span>
            <IconButton
              size="small"
              onClick={handleCopy}
              disabled={data === null}
              sx={{ color: copied ? "success.main" : "text.secondary" }}
            >
              {copied ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Box
        component="pre"
        sx={{
          flex: 1,
          overflow: "auto",
          m: 0,
          p: 2,
          backgroundColor: "background.paper",
          borderRadius: 1,
          fontSize: 13,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          lineHeight: 1.5,
          color: data === null ? "text.secondary" : "text.primary",
          "& .string": { color: "#a5d6ff" },
          "& .number": { color: "#79c0ff" },
          "& .boolean": { color: "#ff7b72" },
          "& .null": { color: "#8b949e" },
          "& .key": { color: "#d2a8ff" },
        }}
      >
        <code
          dangerouslySetInnerHTML={{
            __html: syntaxHighlight(jsonString),
          }}
        />
      </Box>
    </Box>
  );
}

/**
 * Simple JSON syntax highlighting.
 */
function syntaxHighlight(json: string): string {
  // Escape HTML first
  const escaped = json
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Apply syntax highlighting
  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = "number";
      if (match.startsWith('"')) {
        if (match.endsWith(":")) {
          cls = "key";
          // Remove the colon from the span, add it back outside
          return `<span class="${cls}">${match.slice(0, -1)}</span>:`;
        } else {
          cls = "string";
        }
      } else if (/true|false/.test(match)) {
        cls = "boolean";
      } else if (match.includes('null')) {
        cls = "null";
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

export function Output({ jsonSchema, uiSchema }: OutputProps): React.ReactElement {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tab}
          onChange={(_, newValue: number) => { setTab(newValue); }}
          variant="fullWidth"
          sx={{
            minHeight: 40,
            "& .MuiTab-root": {
              minHeight: 40,
              fontSize: 13,
              textTransform: "none",
            },
          }}
        >
          <Tab label="JSON Schema" />
          <Tab label="UI Schema" />
        </Tabs>
      </Box>
      <TabPanel value={tab} index={0}>
        <JsonViewer data={jsonSchema} label="Generated JSON Schema (Draft-07)" />
      </TabPanel>
      <TabPanel value={tab} index={1}>
        <JsonViewer data={uiSchema} label="Generated JSON Forms UI Schema" />
      </TabPanel>
    </Box>
  );
}

export default Output;
