import { useRef, useCallback, useState, useEffect } from "react";
import MonacoEditor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";
import { useMonacoFormspec } from "../../hooks/useMonacoFormspec";
import type { DiagnosticMessage } from "../../lib/compiler";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";

export interface EditorProps {
  /** The current code value */
  value: string;
  /** Called when the code changes */
  onChange: (value: string) => void;
  /** Compilation errors to show as markers */
  errors?: DiagnosticMessage[];
  /** Monaco instance for external configuration */
  onMonacoMount?: (monaco: Monaco) => void;
}

export function Editor({
  value,
  onChange,
  errors = [],
  onMonacoMount,
}: EditorProps): React.ReactElement {
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  // Configure Monaco with FormSpec types (re-runs when monacoInstance changes)
  useMonacoFormspec(monacoInstance);

  // Update error markers when errors change
  const updateMarkers = useCallback(() => {
    if (!monacoInstance || !editorRef.current) return;

    const model = editorRef.current.getModel();
    if (!model) return;

    const markers: monaco.editor.IMarkerData[] = errors.map((error) => ({
      severity: monacoInstance.MarkerSeverity.Error,
      message: error.message,
      startLineNumber: error.line ?? 1,
      startColumn: error.column ?? 1,
      endLineNumber: error.line ?? 1,
      endColumn: error.column ? error.column + 1 : model.getLineMaxColumn(error.line ?? 1),
    }));

    monacoInstance.editor.setModelMarkers(model, "formspec", markers);
  }, [errors, monacoInstance]);

  const handleEditorMount: OnMount = useCallback(
    (editor, monacoInst) => {
      setMonacoInstance(monacoInst);
      editorRef.current = editor;
      onMonacoMount?.(monacoInst);
    },
    [onMonacoMount],
  );

  const handleChange = useCallback(
    (newValue: string | undefined) => {
      onChange(newValue ?? "");
    },
    [onChange],
  );

  // Update markers when errors change
  useEffect(() => {
    if (monacoInstance && editorRef.current) {
      updateMarkers();
    }
  }, [monacoInstance, updateMarkers]);

  return (
    <Box
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        "& .monaco-editor": {
          borderRadius: 1,
        },
      }}
    >
      <MonacoEditor
        height="100%"
        language="typescript"
        theme="vs-dark"
        value={value}
        onChange={handleChange}
        onMount={handleEditorMount}
        loading={
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <CircularProgress size={32} />
          </Box>
        }
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontLigatures: true,
          lineNumbers: "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: "line",
          cursorBlinking: "smooth",
          smoothScrolling: true,
        }}
      />
    </Box>
  );
}

export default Editor;
