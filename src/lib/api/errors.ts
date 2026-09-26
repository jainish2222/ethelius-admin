export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: Record<string, unknown>) => new ApiError(400, msg, details);
export const unauthorized = (msg = "Sign in to continue.") => new ApiError(401, msg);
export const forbidden = (msg = "You do not have permission to do that.") => new ApiError(403, msg);
export const notFound = (what = "Record") => new ApiError(404, `${what} not found.`);
export const conflict = (msg: string) => new ApiError(409, msg);
export const unprocessable = (msg: string, details?: Record<string, unknown>) => new ApiError(422, msg, details);
export const tooMany = (msg: string) => new ApiError(429, msg);
