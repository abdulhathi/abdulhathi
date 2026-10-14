// Errors the API expects to happen. Each one knows its HTTP status and a
// stable code that clients can rely on; the message is for humans.
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.status = status;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super(404, 'not_found', `${what} not found`);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'conflict', message);
  }
}

/** The request is well formed but breaks a business rule. */
export class RuleViolationError extends AppError {
  constructor(message: string) {
    super(422, 'rule_violation', message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'unauthorized', message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Too many attempts, try again later') {
    super(429, 'too_many_requests', message);
  }
}
