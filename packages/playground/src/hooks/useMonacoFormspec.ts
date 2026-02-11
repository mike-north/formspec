import { useEffect, useRef, useCallback } from "react";
import type { Monaco } from "@monaco-editor/react";
import type * as monaco from "monaco-editor";

/**
 * Type definitions content for FormSpec packages.
 * These are loaded at runtime from the copied .d.ts files.
 */
interface TypeDefinitions {
  core: string;
  dsl: string;
  build: string;
}

let typeDefsCache: TypeDefinitions | null = null;
let typeDefsPromise: Promise<TypeDefinitions> | null = null;

/**
 * Loads the FormSpec type definitions from the public directory.
 */
async function loadTypeDefinitions(): Promise<TypeDefinitions> {
  if (typeDefsCache) {
    return typeDefsCache;
  }

  if (typeDefsPromise) {
    return typeDefsPromise;
  }

  typeDefsPromise = (async () => {
    const basePath = import.meta.env.BASE_URL;
    const [core, dsl, build] = await Promise.all([
      fetch(`${basePath}types/core.d.ts`).then((r) =>
        r.ok ? r.text() : Promise.reject(new Error(`Failed to load core.d.ts: ${String(r.status)}`)),
      ),
      fetch(`${basePath}types/dsl.d.ts`).then((r) =>
        r.ok ? r.text() : Promise.reject(new Error(`Failed to load dsl.d.ts: ${String(r.status)}`)),
      ),
      fetch(`${basePath}types/build.d.ts`).then((r) =>
        r.ok ? r.text() : Promise.reject(new Error(`Failed to load build.d.ts: ${String(r.status)}`)),
      ),
    ]);

    typeDefsCache = { core, dsl, build };
    return typeDefsCache;
  })();

  return typeDefsPromise;
}

/**
 * Fallback type definitions when fetch fails (e.g., in development).
 */
const FALLBACK_TYPES = {
  core: `
declare module "@formspec/core" {
  export interface FormSpec<E extends readonly FormElement[]> {
    readonly elements: E;
  }
  export type FormElement = AnyField | Group<readonly FormElement[]> | Conditional<string, unknown, readonly FormElement[]>;
  export interface AnyField {
    readonly _type: "field";
    readonly _field: string;
    readonly name: string;
    readonly label?: string;
    readonly required?: boolean;
  }
  export interface Group<E extends readonly FormElement[]> {
    readonly _type: "group";
    readonly label: string;
    readonly elements: E;
  }
  export interface Conditional<F extends string, V, E extends readonly FormElement[]> {
    readonly _type: "conditional";
    readonly field: F;
    readonly value: V;
    readonly elements: E;
  }
}
`,
  dsl: `
declare module "@formspec/dsl" {
  import type { FormElement, FormSpec } from "@formspec/core";

  export function formspec<E extends readonly FormElement[]>(...elements: E): FormSpec<E>;
  export function group<E extends readonly FormElement[]>(label: string, ...elements: E): import("@formspec/core").Group<E>;
  export function when<F extends string, V, E extends readonly FormElement[]>(condition: { field: F; value: V }, ...elements: E): import("@formspec/core").Conditional<F, V, E>;
  export function is<F extends string, V>(field: F, value: V): { field: F; value: V };

  export const field: {
    text(name: string, options?: { label?: string; required?: boolean }): import("@formspec/core").AnyField;
    number(name: string, options?: { label?: string; required?: boolean; min?: number; max?: number }): import("@formspec/core").AnyField;
    boolean(name: string, options?: { label?: string; required?: boolean }): import("@formspec/core").AnyField;
    enum<T extends readonly string[]>(name: string, options: T, config?: { label?: string; required?: boolean }): import("@formspec/core").AnyField;
    array<N extends string, Items extends readonly FormElement[]>(name: N, ...items: Items): import("@formspec/core").AnyField;
    arrayWithConfig<N extends string, Items extends readonly FormElement[]>(name: N, config: { label?: string; minItems?: number; maxItems?: number }, ...items: Items): import("@formspec/core").AnyField;
    object<N extends string, Properties extends readonly FormElement[]>(name: N, ...properties: Properties): import("@formspec/core").AnyField;
    objectWithConfig<N extends string, Properties extends readonly FormElement[]>(name: N, config: { label?: string; required?: boolean }, ...properties: Properties): import("@formspec/core").AnyField;
    dynamicEnum(name: string, source: string, config?: { label?: string; params?: readonly string[] }): import("@formspec/core").AnyField;
  };
}
`,
  build: `
declare module "@formspec/build" {
  import type { FormSpec, FormElement } from "@formspec/core";

  export interface JSONSchema7 {
    $schema?: string;
    type?: string;
    properties?: Record<string, JSONSchema7>;
    required?: readonly string[];
    [key: string]: unknown;
  }

  export interface UISchema {
    type: string;
    elements: readonly unknown[];
  }

  export interface BuildResult {
    jsonSchema: JSONSchema7;
    uiSchema: UISchema;
  }

  export function buildFormSchemas<E extends readonly FormElement[]>(form: FormSpec<E>): BuildResult;
  export function generateJsonSchema<E extends readonly FormElement[]>(form: FormSpec<E>): JSONSchema7;
  export function generateUiSchema<E extends readonly FormElement[]>(form: FormSpec<E>): UISchema;
}
`,
};

export interface UseMonacoFormspecOptions {
  /** Called when type definitions are loaded */
  onTypesLoaded?: () => void;
  /** Called if type definitions fail to load */
  onTypesError?: (error: Error) => void;
}

/**
 * Hook that configures Monaco editor with FormSpec type definitions.
 *
 * @param monaco - The Monaco instance from @monaco-editor/react
 * @param options - Configuration options
 */
export function useMonacoFormspec(
  monaco: Monaco | null,
  options: UseMonacoFormspecOptions = {},
): void {
  const { onTypesLoaded, onTypesError } = options;
  const disposablesRef = useRef<monaco.IDisposable[]>([]);

  const setupMonaco = useCallback(
    async (monacoInstance: Monaco) => {
      // Clean up previous disposables
      disposablesRef.current.forEach((d) => { d.dispose(); });
      disposablesRef.current = [];

      // Configure TypeScript compiler options
      monacoInstance.languages.typescript.typescriptDefaults.setCompilerOptions({
        target: monacoInstance.languages.typescript.ScriptTarget.ES2020,
        module: monacoInstance.languages.typescript.ModuleKind.ESNext,
        moduleResolution: monacoInstance.languages.typescript.ModuleResolutionKind.NodeJs,
        strict: false,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        jsx: monacoInstance.languages.typescript.JsxEmit.React,
        allowNonTsExtensions: true,
      });

      // Enable validation
      monacoInstance.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });

      // Load and register type definitions
      let types: TypeDefinitions;
      try {
        types = await loadTypeDefinitions();
        onTypesLoaded?.();
      } catch (error) {
        console.warn("Failed to load type definitions, using fallback:", error);
        types = FALLBACK_TYPES;
        onTypesError?.(error instanceof Error ? error : new Error(String(error)));
      }

      // Register type definitions as extra libs
      const libs = [
        {
          content: types.core,
          filePath: "file:///node_modules/@formspec/core/index.d.ts",
        },
        {
          content: types.dsl,
          filePath: "file:///node_modules/@formspec/dsl/index.d.ts",
        },
        {
          content: types.build,
          filePath: "file:///node_modules/@formspec/build/index.d.ts",
        },
      ];

      for (const lib of libs) {
        const disposable = monacoInstance.languages.typescript.typescriptDefaults.addExtraLib(
          lib.content,
          lib.filePath,
        );
        disposablesRef.current.push(disposable);
      }
    },
    [onTypesLoaded, onTypesError],
  );

  useEffect(() => {
    if (monaco) {
      void setupMonaco(monaco);
    }

    return () => {
      disposablesRef.current.forEach((d) => { d.dispose(); });
      disposablesRef.current = [];
    };
  }, [monaco, setupMonaco]);
}
