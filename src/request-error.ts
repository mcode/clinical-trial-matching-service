/**
 * Simply marks an error as a request error: the client request was bad. May
 * specify a different HTTP status error. Any error outside the 400 range will
 * be translated to 400.
 */
export default class RequestError extends Error {
  private _httpStatus: number;
  constructor(message: string, httpStatus = 400) {
    super(message);
    if (httpStatus < 400 || httpStatus >= 500) {
      httpStatus = 400;
    }
    this._httpStatus = Math.floor(httpStatus);
  }

  get httpStatus(): number {
    return this._httpStatus;
  }
}
