import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { nodePolyfills } from "vite-plugin-node-polyfills";

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

  // Node.js built-in modules that need polyfills
  const nodeBuiltins = new Set([
    "path",
    "node:path",
    "fs",
    "node:fs",
    "os",
    "node:os",
    "crypto",
    "node:crypto",
    "util",
    "node:util",
    "events",
    "node:events",
  ]);

  return {
    name: "stub-node-packages",
    enforce: "pre", // Run before other plugins
    resolveId(source) {
      if (nodePackages.has(source)) {
        return { id: `\0virtual:${source}`, moduleSideEffects: false };
      }
      // Stub Node.js built-in modules with polyfills
      if (nodeBuiltins.has(source)) {
        return { id: `\0virtual:${source}`, moduleSideEffects: false };
      }
      return null;
    },
    load(id) {
      if (id.startsWith("\0virtual:")) {
        const moduleName = id.replace("\0virtual:", "").replace("node:", "");
        
        // Return stub for @eslint/eslintrc with minimal implementation
        if (moduleName === "@eslint/eslintrc") {
          return `
// Stub for @eslint/eslintrc - not used in browser
export class IgnorePattern {
  constructor() {}
  ignores(path) { return false; }
}
export default { IgnorePattern };
          `;
        }
        
        // Return polyfills for specific Node.js modules - these are handled by vite-plugin-node-polyfills now
        // Return an empty module for other packages
        return "export default {};";
      }
      return null;
    },
  };
}

/**
 * Vite plugin to inject process polyfill into the HTML.
 * This ensures process.env is available before any modules load.
 */
function injectProcessPolyfill(): Plugin {
  return {
    name: "inject-process-polyfill",
    transformIndexHtml(html) {
      // Inject minimal process polyfill at the start of <head>
      // The vite-plugin-node-polyfills handles the full polyfill in modules,
      // but we need this early injection to ensure process.env exists before module loading
      const polyfillScript = `<script>
// Minimal process polyfill for early module initialization
if (typeof window.process === 'undefined') {
  window.process = { env: {} };
}
</script>
`;
      return html.replace("<head>", "<head>" + polyfillScript);
    },
  };
}

export default defineConfig({
  plugins: [
    injectProcessPolyfill(),
    nodePolyfills({
      // Enable polyfills for specific Node.js built-in modules
      include: ["path", "process", "os", "util", "events"],
      // Enable globals injection
      globals: {
        process: true,
      },
    }),
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
