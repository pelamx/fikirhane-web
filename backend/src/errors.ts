/** An error that is safe to show to API clients. `code` is stable and machine-readable; the frontend localizes it. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;
  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new ApiError(400, code, message, details);
export const unauthorized = () => new ApiError(401, 'unauthenticated', 'Sign in to continue.');
export const forbidden = (message = 'You do not have permission for this action.') => new ApiError(403, 'forbidden', message);
export const notFound = (what: string) => new ApiError(404, 'not_found', `${what} not found.`);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
export const unprocessable = (code: string, message: string) => new ApiError(422, code, message);

interface PgError { code?: string; constraint_name?: string; message?: string; where?: string; routine?: string }

/** Maps PostgreSQL errors raised by constraints and guard triggers onto ApiErrors. Returns null for unknown errors. */
export function fromPgError(err: unknown): ApiError | null {
  const pg = err as PgError;
  if (!pg || typeof pg.code !== 'string') return null;
  if (pg.code === '23505') return conflict('duplicate', 'This record already exists.');
  if (pg.code === '23503') return unprocessable('invalid_reference', 'A referenced record does not exist.');
  // Guard triggers raise with readable messages (routine exec_stmt_raise); plain CHECK constraint names stay internal.
  const raised = pg.routine === 'exec_stmt_raise';
  if (pg.code === '23514' || pg.code === '23P01') return unprocessable('rule_violation', raised && pg.message ? pg.message : 'The data violates a business rule.');
  if (pg.code === '23001') return conflict('not_allowed', raised && pg.message ? pg.message : 'This change is not allowed.');
  if (pg.code === '22P02' || pg.code === '22007' || pg.code === '22008') return badRequest('invalid_input', 'A value has an invalid format.');
  return null;
}
