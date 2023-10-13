import { ClinicalTrialsGovAPI, isPagedStudies, DEFAULT_ENDPOINT, Study } from '../src/clinicaltrialsgov-api';
import { createClinicalStudy } from './support/clinicalstudy-factory';
import * as nock from 'nock';

describe('.isPagedStudes', () => {
  it('rejects invalid objects', () => {
    expect(isPagedStudies(undefined)).toBeFalse();
    expect(isPagedStudies(null)).toBeFalse();
    expect(isPagedStudies({})).toBeFalse();
    expect(isPagedStudies({ studies: true })).toBeFalse();
    expect(isPagedStudies({ studies: ['invalid'] })).toBeFalse();
  });
});

describe('ClinicalTrialsGovAPI', () => {
  describe('constructor', () => {
    it('sets defaults with no arguments', () => {
      const instance = new ClinicalTrialsGovAPI();
      expect(instance['_endpoint']).toEqual(DEFAULT_ENDPOINT);
      expect(typeof instance['_log']).toEqual('function');
    });

    it('uses the defaults if given an empty option element', () => {
      const instance = new ClinicalTrialsGovAPI({});
      expect(instance['_endpoint']).toEqual(DEFAULT_ENDPOINT);
      expect(typeof instance['_log']).toEqual('function');
    });
  });

  describe('#fetchStudies', () => {
    let scope: nock.Scope;
    let interceptor: nock.Interceptor;
    let api: ClinicalTrialsGovAPI;

    beforeEach(() => {
      scope = nock('https://clinicaltrials.gov');
      interceptor = scope.get('/api/v2/studies?filter.ids=NCT12345678');
      api = new ClinicalTrialsGovAPI({ endpoint: 'https://clinicaltrials.gov/api/v2' });
    });

    afterEach(() => {
      scope.done();
    });

    it('raises an error if the result does not return JSON', async () => {
      interceptor.reply(200, "something that isn't JSON");
      await expectAsync(api.fetchStudies(['NCT12345678'])).toBeRejected();
    });

    it("raises an error if given a JSON response it doesn't understand", async () => {
      interceptor.reply(200, '{"nothing":"valid"}', { 'Content-Type': 'application/json' });
      await expectAsync(api.fetchStudies(['NCT12345678'])).toBeRejectedWithError(
        'Server returned a success response, but the result could not be parsed.'
      );
    });

    it('raises an error on server errors', async () => {
      interceptor.reply(500, 'Server on fire');
      await expectAsync(api.fetchStudies(['NCT12345678'])).toBeRejected();
    });

    it('returns studies', async () => {
      const testStudy = createClinicalStudy('NCT12345678');
      interceptor.reply(200, JSON.stringify({ studies: [testStudy] }), { 'Content-Type': 'application/json' });
      const studies = await api.fetchStudies(['NCT12345678']);
      expect(studies).toEqual([testStudy]);
    });

    it('merges studies together into a single result', async () => {
      const testStudyPage1: Study[] = [createClinicalStudy('NCT00000001'), createClinicalStudy('NCT00000002')];
      const testStudyPage2: Study[] = [createClinicalStudy('NCT00000003'), createClinicalStudy('NCT00000004')];
      // Default interceptor doesn't work for this
      nock.removeInterceptor(interceptor);
      scope.get('/api/v2/studies?filter.ids=NCT00000001,NCT00000002,NCT00000003,NCT00000004&pageSize=2').reply(
        200,
        JSON.stringify({
          studies: testStudyPage1,
          nextPageToken: 'asampletoken'
        })
      );
      scope
        .get(
          '/api/v2/studies?filter.ids=NCT00000001,NCT00000002,NCT00000003,NCT00000004&pageSize=2&pageToken=asampletoken'
        )
        .reply(
          200,
          JSON.stringify({
            studies: testStudyPage2
          })
        );
      const studies = await api.fetchStudies(['NCT00000001', 'NCT00000002', 'NCT00000003', 'NCT00000004'], 2);
      expect(studies).toEqual(testStudyPage1.concat(testStudyPage2));
    });
  });
});
