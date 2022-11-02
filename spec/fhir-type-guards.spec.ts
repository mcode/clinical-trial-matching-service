import { isBundle, isResearchStudy } from '../src/fhir-type-guards';

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
    expect(isBundle({resourceType:'Bundle', type: 'collection', entry: 'oops'})).toBeFalse();
  });
  it('returns true on a SearchSet (is a bundle type)', () => {
    expect(isBundle({resourceType:'Bundle', type: 'searchset', entry: []})).toBeTrue();
  });
});

describe('isResearchStudy()', () => {
  it('returns false if given a non-Researchstudy', () => {
    expect(isResearchStudy(null)).toBeFalse();
    expect(isResearchStudy(undefined)).toBeFalse();
    expect(isResearchStudy(true)).toBeFalse();
    expect(isResearchStudy('a string')).toBeFalse();
    expect(isResearchStudy(2.71828)).toBeFalse();
  });
  it('returns true on an empty ResearchStudy', () => {
    expect(isResearchStudy({resourceType:'ResearchStudy'})).toBeTrue();
  });
});
