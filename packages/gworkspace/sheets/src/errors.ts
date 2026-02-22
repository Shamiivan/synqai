export type ErrorCode =
  | "auth"
  | "not_found"
  | "conflict"
  | "rate_limit"
  | "quota"
  | "invalid"
  | "unknown";

export interface ClassifiedError {
  code: ErrorCode;
  reason: string;
  message: string;
  retryable: boolean;
}

export function classifySheetsError(err: unknown): ClassifiedError {
  const e = err as any;
  const status: number | undefined = e?.code ?? e?.response?.status;
  const msg: string = e?.message ?? String(err);
  const reason: string = e?.errors?.[0]?.reason ?? "";

  if (status === 401 || status === 403) {
    if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded") {
      return { code: "quota", reason, message: "Google API quota exceeded. Try again later.", retryable: true };
    }
    return { code: "auth", reason: reason || "forbidden", message: "Authentication failed or access denied.", retryable: false };
  }

  if (status === 404) {
    return { code: "not_found", reason: "notFound", message: msg, retryable: false };
  }

  if (status === 409) {
    return { code: "conflict", reason: "conflict", message: msg, retryable: false };
  }

  if (status === 429) {
    return { code: "rate_limit", reason: "rateLimited", message: "Too many requests. Try again in a moment.", retryable: true };
  }

  if (status === 400) {
    return { code: "invalid", reason: reason || "badRequest", message: msg, retryable: false };
  }

  return { code: "unknown", reason: "unknown", message: msg, retryable: false };
}
