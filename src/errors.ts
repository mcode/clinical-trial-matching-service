/**
 * Interface for things that are HTTP errors. Anything that includes both a
 * message and an httpStatus field is considered an HTTP error.
 */
export interface HttpError {
  readonly httpStatus: number;
  readonly message: string;
}

export function isHttpError(o: unknown): o is HttpError {
  if (typeof o !== 'object' || o === null) {
    return false;
  }
  const oAsError = o as HttpError;
  return (
    'httpStatus' in oAsError &&
    'message' in oAsError &&
    typeof oAsError.httpStatus === 'number' &&
    typeof oAsError.message === 'string'
  );
}

/**
 * Checks to ensure a given code is a valid HTTP error code.
 * @param httpStatus the status to check
 * @param statusIfInvalid the value to return if invalid (note that this isn't checked for validity, if you set it to
 * something that's not a valid code it's returned as-is)
 */
export function restrictToHttpErrors(httpStatus: number, statusIfInvalid = 500): number {
  if (httpStatus >= 400 && httpStatus < 600) {
    return Math.floor(httpStatus);
  } else {
    return statusIfInvalid;
  }
}

/**
 * Marks an error as having a custom HTTP status error. Any valid HTTP status
 * code can be included. By default this uses 500 Internal Server Error.
 * <p>
 * If the error code used is outside the range [400,599] it will be converted to
 * 500.
 */
export class BasicHttpError extends Error {
  private _httpStatus: number;
  constructor(message: string, httpStatus = 500) {
    super(message);
    this._httpStatus = restrictToHttpErrors(httpStatus);
  }

  get httpStatus(): number {
    return this._httpStatus;
  }
}

export default BasicHttpError;

/**
 * Simply marks an error as an internal error: an error happened within the
 * server that should be reported to the client. This restricts the range of
 * valid HTTP codes to 500-599.
 */
export class ServerError extends BasicHttpError {
  constructor(message: string, httpStatus = 500) {
    if (httpStatus >= 500 && httpStatus < 600) {
      httpStatus = Math.floor(httpStatus);
    } else {
      httpStatus = 500;
    }
    super(message, httpStatus);
  }
}

/**
 * Simply marks an error as a request error: the client request was bad. May
 * specify a different HTTP status error. This defaults the HTTP code to 400 and
 * restricts the range of valid HTTP codes to 400-499.
 */
export class ClientError extends BasicHttpError {
  constructor(message: string, httpStatus = 400) {
    if (httpStatus >= 400 && httpStatus < 500) {
      httpStatus = Math.floor(httpStatus);
    } else {
      httpStatus = 400;
    }
    super(message, httpStatus);
  }
}
