import RequestError from '../src/request-error';

describe('RequestError', () => {
  it('handles out of range HTTP values', () => {
    expect(new RequestError('message', 1024).httpStatus).toEqual(400);
  });

  it('sets the message', () => {
    expect(new RequestError('Message').message).toEqual('Message');
  });

  it('handles decimal HTTP stats codes', () => {
    expect(new RequestError('Decimal Status', 403.25).httpStatus).toEqual(403);
  });
});
