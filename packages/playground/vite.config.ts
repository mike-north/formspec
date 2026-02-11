import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

/**
 * Vite plugin to stub Node.js-specific packages that are optionally imported
 * by ESLint but not needed in the browser.
 */
function stubNodePackages(): Plugin {
  // Packages that should be stubbed with empty modules
  const nodePackages = new Set([
    "@humanfs/node",
    "@eslint/eslintrc", // The non-universal version
  ]);

  return {
    name: "stub-node-packages",
    enforce: "pre", // Run before other plugins
    resolveId(source) {
      if (nodePackages.has(source)) {
        return { id: `\0virtual:${source}`, moduleSideEffects: false };
      }
      return null;
    },
    load(id) {
      if (id.startsWith("\0virtual:")) {
        // Return an empty module - these features aren't used in browser
        return "export default {};";
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    stubNodePackages(),
    react(),
    viteStaticCopy({
      targets: [
        // Copy rolled-up .d.ts files for Monaco autocomplete
        { src: "../core/dist/core.d.ts", dest: "types" },
        { src: "../dsl/dist/dsl.d.ts", dest: "types" },
        { src: "../build/dist/build.d.ts", dest: "types" },
      ],
    }),
  ],
  // Base path for GitHub Pages (mike-north/formspec)
  base: "/formspec/",
  // Optimize dependencies to resolve browser-specific entry points
  optimizeDeps: {
    include: ["eslint/universal"],
    exclude: ["@humanfs/node"],
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split Monaco editor into its own chunk (it's large)
          "monaco-editor": ["monaco-editor"],
          // Split MUI into its own chunk
          "mui": ["@mui/material", "@mui/icons-material", "@emotion/react", "@emotion/styled"],
          // Split JSON Forms into its own chunk
          "jsonforms": ["@jsonforms/core", "@jsonforms/react", "@jsonforms/material-renderers"],
        },
      },
    },
  },
});
