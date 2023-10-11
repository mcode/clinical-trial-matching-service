import { ClinicalTrialsGovAPI, isPagedStudies, DEFAULT_ENDPOINT} from "../src/clinicaltrialsgov-api";

describe('.isPagedStudes', () => {
  it('rejects invalid objects', () => {
    expect(isPagedStudies(undefined)).toBeFalse();
    expect(isPagedStudies(null)).toBeFalse();
    expect(isPagedStudies({})).toBeFalse();
    expect(isPagedStudies({ studies: true })).toBeFalse();
    expect(isPagedStudies({ studies: [ 'invalid' ]})).toBeFalse();
  });
});

describe('ClinicalTrialsGovAPI', () => {
  describe('constructor', () => {
    it('sets defaults with no arguments', () => {
      const instance = new ClinicalTrialsGovAPI();
      expect(instance['_endpoint']).toEqual(DEFAULT_ENDPOINT);
      expect(typeof instance['_log']).toEqual('function');
    });
  });

  describe('#fetchStudies', () => {
    it('raises an error if the result does not return JSON', () => {});
  });
});
