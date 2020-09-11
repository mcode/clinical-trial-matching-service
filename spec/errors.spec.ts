import HttpError, { isHttpError, restrictToHttpErrors, ClientError, ServerError } from '../src/errors';

describe('isHttpError()', () => {
  it('returns false for null', () => {
    expect(isHttpError(null)).toBeFalse();
  });
  it('returns false for non-objects', () => {
    expect(isHttpError(undefined)).toBeFalse();
    expect(isHttpError(3.14159)).toBeFalse();
    expect(isHttpError('a string')).toBeFalse();
  });
  it('returns true for objects that are almost valid even if the code is out of range', () => {
    expect(isHttpError({ message: 'A message', httpStatus: 3000 })).toBeTrue();
  });
});

describe('HttpError', () => {
  it('handles out of range HTTP values', () => {
    expect(new HttpError('message', 1024).httpStatus).toEqual(500);
  });

  it('sets the message', () => {
    expect(new HttpError('Message').message).toEqual('Message');
  });

  it('handles decimal HTTP stats codes', () => {
    expect(new HttpError('Decimal Status', 403.25).httpStatus).toEqual(403);
  });
});

describe('ClientError', () => {
  it('defaults to 400', () => {
    expect(new ClientError('message').httpStatus).toEqual(400);
  });

  it('does not allow 500 codes', () => {
    expect(new ClientError('message', 500).httpStatus).toEqual(400);
  });

  it('handles decimal HTTP stats codes', () => {
    expect(new ClientError('Decimal Status', 401.25).httpStatus).toEqual(401);
  });
});

describe('ServerError', () => {
  it('defaults to 500', () => {
    expect(new ServerError('message').httpStatus).toEqual(500);
  });

  it('does not allow 400 codes', () => {
    expect(new ServerError('message', 404).httpStatus).toEqual(500);
  });

  it('handles decimal HTTP stats codes', () => {
    expect(new ServerError('Decimal Status', 503.25).httpStatus).toEqual(503);
  });
});

describe('restrictToHttpErrors()', () => {
  it('handles NaN', () => {
    expect(restrictToHttpErrors(Number.NaN)).toEqual(500);
  });
  it('passes valid codes through', () => {
    expect(restrictToHttpErrors(400)).toEqual(400);
    expect(restrictToHttpErrors(500)).toEqual(500);
    expect(restrictToHttpErrors(599)).toEqual(599);
  });
  it('truncates decimals', () => {
    expect(restrictToHttpErrors(400.12)).toEqual(400);
    expect(restrictToHttpErrors(599.9999)).toEqual(599);
  });
});
