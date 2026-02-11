import { useState, useCallback } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import FormGroup from "@mui/material/FormGroup";
import FormControlLabel from "@mui/material/FormControlLabel";
import Checkbox from "@mui/material/Checkbox";
import TextField from "@mui/material/TextField";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

export interface ConstraintsConfig {
  fieldTypes: {
    text: boolean;
    number: boolean;
    boolean: boolean;
    enum: boolean;
    dynamicEnum: boolean;
    array: boolean;
    object: boolean;
    dynamicSchema: boolean;
  };
  layout: {
    group: boolean;
    when: boolean;
    maxNestingDepth: number;
  };
}

export interface ConstraintsProps {
  config: ConstraintsConfig;
  onChange: (config: ConstraintsConfig) => void;
}

const DEFAULT_CONSTRAINTS: ConstraintsConfig = {
  fieldTypes: {
    text: true,
    number: true,
    boolean: true,
    enum: true,
    dynamicEnum: true,
    array: true,
    object: true,
    dynamicSchema: true,
  },
  layout: {
    group: true,
    when: true,
    maxNestingDepth: 5,
  },
};

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

function TabPanel({ children, value, index }: TabPanelProps): React.ReactElement | null {
  if (value !== index) return null;
  return <Box sx={{ p: 2 }}>{children}</Box>;
}

export function Constraints({ config, onChange }: ConstraintsProps): React.ReactElement {
  const [tab, setTab] = useState(0);
  const [yamlValue, setYamlValue] = useState(() => constraintsToYaml(config));

  const handleFieldTypeChange = useCallback(
    (fieldType: keyof ConstraintsConfig["fieldTypes"]) => (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({
        ...config,
        fieldTypes: {
          ...config.fieldTypes,
          [fieldType]: event.target.checked,
        },
      });
    },
    [config, onChange],
  );

  const handleLayoutChange = useCallback(
    (layoutType: "group" | "when") => (event: React.ChangeEvent<HTMLInputElement>) => {
      onChange({
        ...config,
        layout: {
          ...config.layout,
          [layoutType]: event.target.checked,
        },
      });
    },
    [config, onChange],
  );

  const handleNestingDepthChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = parseInt(event.target.value, 10);
      if (!isNaN(value) && value >= 0) {
        onChange({
          ...config,
          layout: {
            ...config.layout,
            maxNestingDepth: value,
          },
        });
      }
    },
    [config, onChange],
  );

  const handleYamlChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setYamlValue(event.target.value);
      // Try to parse and update config
      try {
        const parsed = yamlToConstraints(event.target.value);
        if (parsed) {
          onChange(parsed);
        }
      } catch {
        // Invalid YAML, ignore
      }
    },
    [onChange],
  );

  // Sync YAML when tab changes to YAML
  const handleTabChange = (_: React.SyntheticEvent, newValue: number) => {
    if (newValue === 1) {
      setYamlValue(constraintsToYaml(config));
    }
    setTab(newValue);
  };

  return (
    <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <Box sx={{ borderBottom: 1, borderColor: "divider" }}>
        <Tabs
          value={tab}
          onChange={handleTabChange}
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
          <Tab label="Form" />
          <Tab label="YAML" />
        </Tabs>
      </Box>

      <Box sx={{ flex: 1, overflow: "auto" }}>
        <TabPanel value={tab} index={0}>
          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Field Types</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.fieldTypes.text}
                      onChange={handleFieldTypeChange("text")}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">text</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.fieldTypes.number}
                      onChange={handleFieldTypeChange("number")}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">number</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.fieldTypes.boolean}
                      onChange={handleFieldTypeChange("boolean")}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">boolean</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.fieldTypes.enum}
                      onChange={handleFieldTypeChange("enum")}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">enum</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.fieldTypes.dynamicEnum}
                      onChange={handleFieldTypeChange("dynamicEnum")}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">dynamicEnum</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.fieldTypes.array}
                      onChange={handleFieldTypeChange("array")}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">array</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.fieldTypes.object}
                      onChange={handleFieldTypeChange("object")}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">object</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.fieldTypes.dynamicSchema}
                      onChange={handleFieldTypeChange("dynamicSchema")}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">dynamicSchema</Typography>}
                />
              </FormGroup>
            </AccordionDetails>
          </Accordion>

          <Accordion defaultExpanded>
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Typography variant="subtitle2">Layout</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <FormGroup>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.layout.group}
                      onChange={handleLayoutChange("group")}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">group()</Typography>}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={config.layout.when}
                      onChange={handleLayoutChange("when")}
                      size="small"
                    />
                  }
                  label={<Typography variant="body2">when()</Typography>}
                />
              </FormGroup>
              <Box sx={{ mt: 2 }}>
                <TextField
                  label="Max Nesting Depth"
                  type="number"
                  size="small"
                  value={config.layout.maxNestingDepth}
                  onChange={handleNestingDepthChange}
                  slotProps={{ htmlInput: { min: 0, max: 10 } }}
                  fullWidth
                />
              </Box>
            </AccordionDetails>
          </Accordion>
        </TabPanel>

        <TabPanel value={tab} index={1}>
          <TextField
            multiline
            fullWidth
            minRows={15}
            maxRows={25}
            value={yamlValue}
            onChange={handleYamlChange}
            placeholder="# .formspec.yml constraints"
            sx={{
              "& .MuiInputBase-input": {
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 13,
              },
            }}
          />
        </TabPanel>
      </Box>
    </Box>
  );
}

/**
 * Convert constraints config to YAML string.
 */
function constraintsToYaml(config: ConstraintsConfig): string {
  const enabledFieldTypes = Object.entries(config.fieldTypes)
    .filter(([_, enabled]) => enabled)
    .map(([type]) => type);

  const disabledFieldTypes = Object.entries(config.fieldTypes)
    .filter(([_, enabled]) => !enabled)
    .map(([type]) => type);

  let yaml = "# FormSpec Constraints Configuration\n\n";
  yaml += "constraints:\n";
  yaml += "  fieldTypes:\n";

  if (disabledFieldTypes.length === 0) {
    yaml += "    # All field types allowed\n";
  } else {
    for (const type of enabledFieldTypes) {
      yaml += `    ${type}: allowed\n`;
    }
    for (const type of disabledFieldTypes) {
      yaml += `    ${type}: forbidden\n`;
    }
  }

  yaml += "\n  layout:\n";
  yaml += `    group: ${config.layout.group ? "allowed" : "forbidden"}\n`;
  yaml += `    when: ${config.layout.when ? "allowed" : "forbidden"}\n`;
  yaml += `    maxNestingDepth: ${String(config.layout.maxNestingDepth)}\n`;

  return yaml;
}

/**
 * Parse YAML string to constraints config.
 * Returns null if parsing fails.
 */
function yamlToConstraints(yaml: string): ConstraintsConfig | null {
  try {
    // Simple YAML parsing for our specific format
    const config: ConstraintsConfig = { ...DEFAULT_CONSTRAINTS };

    const lines = yaml.split("\n");
    let section = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || trimmed === "") continue;

      if (trimmed === "fieldTypes:") {
        section = "fieldTypes";
        continue;
      }
      if (trimmed === "layout:") {
        section = "layout";
        continue;
      }

      const match = /^(\w+):\s*(.+)$/.exec(trimmed);
      if (match) {
        const [, key, value] = match;
        if (section === "fieldTypes" && key && key in config.fieldTypes) {
          (config.fieldTypes as Record<string, boolean>)[key] = value !== "forbidden";
        }
        if (section === "layout" && key) {
          if (key === "maxNestingDepth") {
            const num = parseInt(value ?? "5", 10);
            if (!isNaN(num)) config.layout.maxNestingDepth = num;
          } else if (key === "group" || key === "when") {
            config.layout[key] = value !== "forbidden";
          }
        }
      }
    }

    return config;
  } catch {
    return null;
  }
}

export { DEFAULT_CONSTRAINTS };
export default Constraints;
