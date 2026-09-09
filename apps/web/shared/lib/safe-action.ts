import "server-only";
import { ZodError, ZodType } from "zod";

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Higher-order function that wraps an action handler with uniform error handling.
 */
export function withSafeAction<TArgs extends any[], TReturn>(
  actionName: string,
  handler: (...args: TArgs) => Promise<TReturn>
): (...args: TArgs) => Promise<ActionResult<TReturn>> {
  return async (...args: TArgs): Promise<ActionResult<TReturn>> => {
    try {
      const data = await handler(...args);
      return { success: true, data };
    } catch (err: unknown) {
      if (err instanceof ZodError) {
        const errorMsg = err.issues?.[0]?.message || "Validation failed.";
        return {
          success: false,
          error: errorMsg,
        };
      }
      console.error(`[${actionName}] Error:`, err);
      return {
        success: false,
        error: err instanceof Error ? err.message : `Failed to execute ${actionName}.`,
      };
    }
  };
}

/**
 * Helper to parse and validate FormData using a Zod schema.
 */
export function parseFormData<T>(schema: ZodType<T>, formData: FormData): T {
  const raw: Record<string, unknown> = {};
  formData.forEach((value, key) => {
    if (typeof value === "string") {
      raw[key] = value.trim();
    } else {
      raw[key] = value;
    }
  });
  return schema.parse(raw);
}
