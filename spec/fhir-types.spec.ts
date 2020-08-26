import { isBundle } from '../src/fhir-types';

describe('isBundle()', () => {
  it('returns false if given a non-bundle', () => {
    expect(isBundle(null)).toBeFalse();
    expect(isBundle(undefined)).toBeFalse();
    expect(isBundle(true)).toBeFalse();
    expect(isBundle('a string')).toBeFalse();
    expect(isBundle(3.14159)).toBeFalse();
  });
  it('returns false on an almost-bundle', () => {
    expect(isBundle({resourceType:'notabundle', type: 'collection', entry: []})).toBeFalse();
    expect(isBundle({resourceType:'Bundle', type: 'searchset', entry: []})).toBeFalse();
    expect(isBundle({resourceType:'Bundle', type: 'collection', entry: 'oops'})).toBeFalse();
  });
});
