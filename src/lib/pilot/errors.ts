export class ApiError extends Error {
  code: string;
  status: number;
  details?: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function errorEnvelope(err: unknown, requestId: string) {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          request_id: requestId,
          details: err.details,
        },
      },
    };
  }
  return {
    status: 500,
    body: {
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
        request_id: requestId,
      },
    },
  };
}
