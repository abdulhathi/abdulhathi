type HttpErrorOptions = {
  details?: unknown; // extra information for the client, such as validation problems
  headers?: Record<string, string>; // extra response headers, such as Allow
};

/** An error that knows which HTTP status code it should become. */
export class HttpError extends Error {
  readonly status: number;
  readonly details: unknown;
  readonly headers: Record<string, string>;

  constructor(status: number, message: string, options: HttpErrorOptions = {}) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = options.details;
    this.headers = options.headers ?? {};
  }
}
