export const apiError = (status: number, code: string, message: string, details?: unknown) =>
  Object.assign(new Error(message), { status, code, details });

export const isApiError = (
  error: unknown,
): error is Error & {
  status: number;
  code: string;
  details?: unknown;
} => error instanceof Error && "status" in error && "code" in error;
