import { useState, useEffect, useCallback, useRef } from "react";
import { compileFormSpec, type CompileResult, type DiagnosticMessage } from "../lib/compiler";
import { lintFormSpec } from "../lib/linter";
import type { FormSpec, FormElement } from "@formspec/core";
import type { JSONSchema7, UISchema } from "@formspec/build/browser";
import type { ConstraintsConfig } from "../components/Constraints";
import { toConstraintConfig } from "../lib/constraintAdapter";

export interface UseFormspecCompilationOptions {
  /** Debounce delay in milliseconds (default: 500) */
  debounceMs?: number;
  /** Constraint configuration for validation (UI format) */
  constraints?: ConstraintsConfig;
}

export interface UseFormspecCompilationResult {
  /** Whether compilation is in progress */
  isCompiling: boolean;
  /** The compiled FormSpec object, if successful */
  formSpec: FormSpec<readonly FormElement[]> | null;
  /** The generated JSON Schema, if successful */
  jsonSchema: JSONSchema7 | null;
  /** The generated UI Schema, if successful */
  uiSchema: UISchema | null;
  /** Compilation errors, if any */
  errors: DiagnosticMessage[];
  /** Manually trigger recompilation */
  recompile: () => void;
}

/**
 * Hook that handles FormSpec compilation with debouncing.
 *
 * @param code - The TypeScript source code to compile
 * @param options - Compilation options
 */
export function useFormspecCompilation(
  code: string,
  options: UseFormspecCompilationOptions = {},
): UseFormspecCompilationResult {
  const { debounceMs = 500, constraints } = options;
  const [isCompiling, setIsCompiling] = useState(false);
  const [formSpec, setFormSpec] = useState<FormSpec<readonly FormElement[]> | null>(null);
  const [jsonSchema, setJsonSchema] = useState<JSONSchema7 | null>(null);
  const [uiSchema, setUiSchema] = useState<UISchema | null>(null);
  const [errors, setErrors] = useState<DiagnosticMessage[]>([]);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleCallbackRef = useRef<number | null>(null);
  const codeRef = useRef(code);
  const constraintsRef = useRef(constraints);
  codeRef.current = code;
  constraintsRef.current = constraints;

  const compile = useCallback(() => {
    // Cancel any pending requestIdleCallback to prevent race conditions
    if (idleCallbackRef.current !== null && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(idleCallbackRef.current);
      idleCallbackRef.current = null;
    }

    setIsCompiling(true);

    // Use requestIdleCallback or setTimeout for non-blocking compilation
    const doCompile = async () => {
      idleCallbackRef.current = null;
      const currentConstraints = constraintsRef.current;

      // First, run ESLint linting if constraints are configured
      let lintErrors: DiagnosticMessage[] = [];
      if (currentConstraints) {
        try {
          // Lazy import linter to avoid loading ESLint modules until needed
          const { lintFormSpec } = await import("../lib/linter");
          const lintMessages = lintFormSpec(codeRef.current, currentConstraints);
          lintErrors = lintMessages.map((msg): DiagnosticMessage => ({
            message: msg.message,
            line: msg.line,
            column: msg.column,
            severity: msg.severity,
          }));
        } catch (error) {
          // Linting failed (likely due to browser compatibility issues)
          // Log the error but don't block compilation
          console.warn("ESLint linting failed in browser:", error);
        }
      }

      // Then run compilation (TypeScript transpile + execute + schema generation)
      const constraintConfig = currentConstraints ? toConstraintConfig(currentConstraints) : undefined;
      const result: CompileResult = compileFormSpec(codeRef.current, {
        constraints: constraintConfig,
      });

      if (result.success) {
        setFormSpec(result.formSpec);
        setJsonSchema(result.jsonSchema);
        setUiSchema(result.uiSchema);
        // Show lint errors even if compilation succeeded
        setErrors(lintErrors);
      } else {
        // Combine lint errors with compilation errors
        setErrors([...lintErrors, ...result.errors]);
        // Keep previous successful results visible
      }

      setIsCompiling(false);
    };

    // Use requestIdleCallback if available, otherwise setTimeout
    if ("requestIdleCallback" in window) {
      idleCallbackRef.current = window.requestIdleCallback(doCompile, { timeout: 1000 });
    } else {
      setTimeout(doCompile, 0);
    }
  }, []);

  // Debounced compilation effect
  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      compile();
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (idleCallbackRef.current !== null && "cancelIdleCallback" in window) {
        window.cancelIdleCallback(idleCallbackRef.current);
      }
    };
  }, [code, constraints, debounceMs, compile]);

  // Initial compilation - we deliberately only run once on mount
  useEffect(() => {
    compile();
  }, [compile]);

  return {
    isCompiling,
    formSpec,
    jsonSchema,
    uiSchema,
    errors,
    recompile: compile,
  };
}
