import { useState, useMemo, useEffect } from "react";
import { JsonForms } from "@jsonforms/react";
import {
  materialRenderers,
  materialCells,
} from "@jsonforms/material-renderers";
import type { JsonSchema, UISchemaElement } from "@jsonforms/core";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import type { JSONSchema7, UISchema } from "@formspec/build/browser";

export interface PreviewProps {
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

export function Preview({ jsonSchema, uiSchema }: PreviewProps): React.ReactElement {
  const [formData, setFormData] = useState<Record<string, unknown>>({});
  const [tab, setTab] = useState(0);

  // Reset form data when schema changes significantly
  const schemaKey = useMemo(() => {
    if (!jsonSchema) return "";
    return JSON.stringify(Object.keys(jsonSchema.properties ?? {}));
  }, [jsonSchema]);

  // Reset data when schema properties change
  useEffect(() => {
    setFormData({});
  }, [schemaKey]);

  const handleChange = ({ data }: { data: unknown }) => {
    setFormData(data as Record<string, unknown>);
  };

  // Remove $schema property as JSON Forms' AJV doesn't have draft-07 meta-schema loaded
  const cleanedSchema = useMemo(() => {
    if (!jsonSchema) return null;
    const { $schema: _, ...rest } = jsonSchema as Record<string, unknown>;
    return rest;
  }, [jsonSchema]);

  if (!cleanedSchema || !uiSchema) {
    return (
      <Box
        sx={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "text.secondary",
        }}
      >
        <Typography variant="body2">
          Write FormSpec code to see the live preview
        </Typography>
      </Box>
    );
  }

  const dataJson = JSON.stringify(formData, null, 2);

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
          <Tab label="Form Preview" />
          <Tab label="Form Data" />
        </Tabs>
      </Box>

      <TabPanel value={tab} index={0}>
        <Box
          sx={{
            backgroundColor: "background.paper",
            borderRadius: 1,
            p: 3,
            minHeight: 200,
            "& .MuiFormControl-root": {
              mb: 2,
            },
            "& .MuiInputLabel-root": {
              color: "text.secondary",
            },
            "& .MuiOutlinedInput-root": {
              backgroundColor: "background.default",
            },
          }}
        >
          <JsonForms
            schema={cleanedSchema as unknown as JsonSchema}
            uischema={uiSchema as unknown as UISchemaElement}
            data={formData}
            renderers={materialRenderers}
            cells={materialCells}
            onChange={handleChange}
          />
        </Box>
      </TabPanel>

      <TabPanel value={tab} index={1}>
        <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1 }}>
            Current Form State
          </Typography>
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
            }}
          >
            <code>{dataJson}</code>
          </Box>
        </Box>
      </TabPanel>
    </Box>
  );
}

export default Preview;
