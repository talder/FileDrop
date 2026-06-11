import type { RetryPolicy } from "./types";

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  enabled: false,
  maxAttempts: 3,
  backoffSeconds: 5,
  deadLetterSubdirectory: "_dead-letter",
};

export function normalizeRetryPolicy(input?: Partial<RetryPolicy> | null): RetryPolicy {
  const enabled = !!input?.enabled;
  const maxAttempts = Math.min(Math.max(Math.floor(Number(input?.maxAttempts) || DEFAULT_RETRY_POLICY.maxAttempts), 1), 10);
  const backoffSeconds = Math.min(Math.max(Math.floor(Number(input?.backoffSeconds) || DEFAULT_RETRY_POLICY.backoffSeconds), 0), 300);
  const deadLetterSubdirectory = (input?.deadLetterSubdirectory || DEFAULT_RETRY_POLICY.deadLetterSubdirectory || "_dead-letter").trim();

  return {
    enabled,
    maxAttempts,
    backoffSeconds,
    deadLetterSubdirectory,
  };
}

export async function runWithRetries<T>(
  policy: RetryPolicy | undefined,
  task: (attempt: number) => Promise<T>,
): Promise<{ value: T; attempts: number }> {
  const normalized = normalizeRetryPolicy(policy);
  const attempts = normalized.enabled ? normalized.maxAttempts : 1;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const value = await task(attempt);
      return { value, attempts: attempt };
    } catch (error) {
      lastError = error as Error;
      if (attempt >= attempts) break;
      const waitMs = normalized.backoffSeconds * 1000 * attempt;
      if (waitMs > 0) await sleep(waitMs);
    }
  }

  throw lastError || new Error("retry attempts exhausted");
}

export async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}
