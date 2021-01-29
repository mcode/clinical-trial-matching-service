// Important: mockfs has to be imported first
import mockfs from 'mock-fs';

import { getContainedResource, ResearchStudy as ResearchStudyObj } from '../src/research-study';
import { Address, Location, ResearchStudy, ContainedResource } from '../src/fhir-types';
import * as ctg from '../src/clinicaltrialsgov';
import fs from 'fs';
import stream from 'stream';
import path from 'path';
import nock from 'nock';
// Trial missing summary, inclusion/exclusion criteria, phase and study type
import trialMissing from './data/resource.json';
import trialFilled from './data/complete_study.json';
import { ClinicalStudy, StatusEnum } from '../src/clinicalstudy';
import { createClinicalStudy } from './support/clinicalstudy-factory';
import { createResearchStudy } from './support/researchstudy-factory';

function specFilePath(specFilePath: string): string {
  return path.join(__dirname, '../../spec/data', specFilePath);
}

describe('.isTrialBackup', () => {
  it('rejects null', () => {
    expect(ctg.isTrialBackup(null)).toBeFalse();
  });
  it('rejects non-objects', () => {
    expect(ctg.isTrialBackup('string')).toBeFalse();
    expect(ctg.isTrialBackup(1)).toBeFalse();
    expect(ctg.isTrialBackup(undefined)).toBeFalse();
    expect(ctg.isTrialBackup(true)).toBeFalse();
  });
});

describe('.isValidNCTNumber', () => {
  it('accepts valid numbers', () => {
    expect(ctg.isValidNCTNumber('NCT12345678')).toBeTrue();
    expect(ctg.isValidNCTNumber('NCT00000000')).toBeTrue();
  });
  it('rejects invalid numbers', () => {
    expect(ctg.isValidNCTNumber('NCT1234567')).toBeFalse();
    expect(ctg.isValidNCTNumber('NCT123456789')).toBeFalse();
    expect(ctg.isValidNCTNumber('blatantly wrong')).toBeFalse();
    expect(ctg.isValidNCTNumber('')).toBeFalse();
  });
});

describe('.findNCTNumber', () => {
  it('finds an NCT number with the proper coding system', () => {
    expect(
      ctg.findNCTNumber({
        resourceType: 'ResearchStudy',
        identifier: [
          {
            system: 'other',
            value: 'ignoreme'
          },
          {
            system: ctg.CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
            value: 'test'
          }
        ]
      })
    ).toEqual('test');
  });
  it('finds an NCT number based on regexp', () => {
    expect(
      ctg.findNCTNumber({
        resourceType: 'ResearchStudy',
        identifier: [
          {
            system: 'other',
            value: 'ignoreme'
          },
          {
            system: 'invalidsystem',
            value: 'NCT12345678'
          }
        ]
      })
    ).toEqual('NCT12345678');
  });
  it('returns null with no valid NCT number', () => {
    expect(
      ctg.findNCTNumber({
        resourceType: 'ResearchStudy',
        identifier: [
          {
            system: 'other',
            value: 'ignoreme'
          },
          {
            system: 'invalid',
            value: 'alsoignored'
          }
        ]
      })
    ).toBeNull();
  });
  it('returns null with no identifier', () => {
    expect(
      ctg.findNCTNumber({
        resourceType: 'ResearchStudy',
        identifier: []
      })
    ).toBeNull();
    expect(ctg.findNCTNumber({ resourceType: 'ResearchStudy' })).toBeNull();
  });
});

describe('findNCTNumbers', () => {
  it('builds a map', () => {
    const studies: ResearchStudy[] = [
      createResearchStudy('no-NCTID'),
      createResearchStudy('dupe1', 'NCT00000001'),
      createResearchStudy('singleton', 'NCT12345678'),
      createResearchStudy('dupe2', 'NCT00000001'),
      createResearchStudy('dupe3', 'NCT00000001')
    ];
    const map = ctg.findNCTNumbers(studies);
    expect(map.size).toEqual(2);
    expect(map.get('NCT12345678')).toEqual(studies[2]);
    expect(map.get('NCT00000001')).toEqual([studies[1], studies[3], studies[4]]);
  });
});

describe('parseClinicalTrialXML', () => {
  it("rejects if given valid XML that's not a clinical study", () => {
    return expectAsync(ctg.parseClinicalTrialXML('<?xml version="1.0"?><root><child/></root>')).toBeRejectedWithError(
      'Unable to parse trial as valid clinical study XML'
    );
  });
});

describe('ClinicalTrialsGovService', () => {
  // The data dir path
  const dataDirPath = 'ctg-cache';
  let study: ResearchStudy, nctID: ctg.NCTNumber, nctIds: ctg.NCTNumber[];
  beforeAll(() => {
    study = trialMissing.entry[0].resource as ResearchStudy;
    const maybeNctID = ctg.findNCTNumber(study);
    if (maybeNctID === null) {
      // This indicates a failure in test cases
      throw new Error('ResearchStudy has no NCT number');
    } else {
      nctID = maybeNctID;
      nctIds = [ nctID ];
    }
    // Create our mock FS
    mockfs({
      'ctg-cache/data/NCT02513394.xml': mockfs.load(specFilePath('NCT02513394.xml')),
      'existing-file': 'Existing stub',
      'ctg-cache-empty': { /* An empty virtual directory */ }
    });
  });

  afterAll(() => {
    mockfs.restore();
  });

  it('can set a custom logger', () => {
    const customLogger = (): void => {
      // Do nothing
    };
    const instance = new ctg.ClinicalTrialsGovService(dataDirPath, { log: customLogger });
    expect(instance['log']).toEqual(customLogger);
  });

  describe('#maxTrialsPerRequest', () => {
    let service: ctg.ClinicalTrialsGovService;
    beforeEach(() => {
      // The service is never initialized so the temp directory isn't created
      service = new ctg.ClinicalTrialsGovService(dataDirPath);
    });
    it('does not allow values less than 1 to be set', () => {
      // First, set it to a known value - this also makes sure get works
      service.maxTrialsPerRequest = 10;
      expect(service.maxTrialsPerRequest).toEqual(10);
      service.maxTrialsPerRequest = -1;
      expect(service.maxTrialsPerRequest).toEqual(10);
      service.maxTrialsPerRequest = 0;
      expect(service.maxTrialsPerRequest).toEqual(10);
      service.maxTrialsPerRequest = 0.5;
      expect(service.maxTrialsPerRequest).toEqual(10);
    });
    it('rounds down if given fractions', () => {
      service.maxTrialsPerRequest = 12.5;
      expect(service.maxTrialsPerRequest).toEqual(12);
    });
  });

  describe('#init', () => {
    it('restores cache entries in an existing directory', () => {
      const testService = new ctg.ClinicalTrialsGovService(dataDirPath);
      return expectAsync(testService.init()).toBeResolved().then(async () => {
        // Make sure the virtual cache entry exists
        expect(testService['cache'].has(nctID)).toBeTrue();
      });
    });

    it('handles the directory already existing but not being a directory', () => {
      const testService = new ctg.ClinicalTrialsGovService('existing-file');
      return expectAsync(testService.init()).toBeRejected();
    });

    it("creates the directory if it doesn't exist", () => {
      const testService = new ctg.ClinicalTrialsGovService('new-ctg-cache');
      return expectAsync(testService.init()).toBeResolved().then(() => {
        // Make sure the mocked directory exists - because this is being mocked,
        // just use sync fs functions
        expect(() => {
          fs.readdirSync('new-ctg-cache');
        }).not.toThrow();
      });
    });

    it('handles the directory creation failing', () => {
      // because we don't override promisify, we need to "delete" the type data
      const testService = new ctg.ClinicalTrialsGovService(dataDirPath);
      (spyOn(fs, 'mkdir') as jasmine.Spy).and.callFake((path, callback) => {
        expect(path).toEqual(dataDirPath);
        callback(new Error('Simulated error'));
      });
      return expectAsync(testService.init()).toBeRejected();
    });
  });

  describe('#updateResearchStudies', () => {
    let service: ctg.ClinicalTrialsGovService;
    let downloadTrialsSpy: jasmine.Spy;

    beforeEach(() => {
      // The service is never initialized
      service = new ctg.ClinicalTrialsGovService(dataDirPath);
      // TypeScript won't allow us to install spies the "proper" way on private methods
      service['downloadTrials'] = downloadTrialsSpy = jasmine.createSpy('downloadTrials').and.callFake(() => {
        return Promise.resolve('ignored');
      });
    });

    // These tests basically are only to ensure that all trials are properly visisted when given.
    it('updates all the given studies', () => {
      // Our test studies contain the same NCT ID twice to make sure that works as expected, as well as a NCT ID that
      // download spy will return null for to indicate a failure.
      const testStudies: ResearchStudy[] = [
        createResearchStudy('dupe1', 'NCT00000001'),
        createResearchStudy('missing', 'NCT00000002'),
        createResearchStudy('dupe2', 'NCT00000001'),
        createResearchStudy('singleton', 'NCT00000003')
      ];
      const testStudy = createClinicalStudy();
      const updateSpy = spyOn(service, 'updateResearchStudy').and.returnValue();
      const getTrialSpy = jasmine.createSpy('getCachedClinicalStudy').and.callFake((nctId: string) => {
        return Promise.resolve(nctId === 'NCT00000002' ? null : testStudy);
      });
      service.getCachedClinicalStudy = getTrialSpy;
      return expectAsync(
        service.updateResearchStudies(testStudies).then(() => {
          expect(downloadTrialsSpy).toHaveBeenCalledOnceWith(['NCT00000001', 'NCT00000002', 'NCT00000003']);
          // Update should have been called three times: twice for the NCT00000001 studies, and once for the NCT00000003 study
          expect(updateSpy).toHaveBeenCalledWith(testStudies[0], testStudy);
          expect(updateSpy).not.toHaveBeenCalledWith(testStudies[1], testStudy);
          expect(updateSpy).toHaveBeenCalledWith(testStudies[2], testStudy);
          expect(updateSpy).toHaveBeenCalledWith(testStudies[3], testStudy);
        })
      ).toBeResolved();
    });

    it('does nothing if no studies have NCT IDs', () => {
      return expectAsync(
        service.updateResearchStudies([{ resourceType: 'ResearchStudy' }]).then(() => {
          expect(downloadTrialsSpy).not.toHaveBeenCalled();
        })
      ).toBeResolved();
    });

    it('handles splitting requests', () => {
      // Basically, drop the limit to be very low, and make sure we get two calls
      service.maxTrialsPerRequest = 2;
      const testStudies: ResearchStudy[] = [
        createResearchStudy('test1', 'NCT00000001'),
        createResearchStudy('test2', 'NCT00000002'),
        createResearchStudy('test3', 'NCT00000003'),
        createResearchStudy('test4', 'NCT00000004')
      ];
      const testStudy = createClinicalStudy();
      spyOn(service, 'updateResearchStudy').and.returnValue();
      const getTrialSpy = jasmine.createSpy('getCachedClinicalStudy').and.callFake(() => {
        return Promise.resolve(testStudy);
      });
      service.getCachedClinicalStudy = getTrialSpy;
      return expectAsync(
        service.updateResearchStudies(testStudies).then(() => {
          expect(downloadTrialsSpy.calls.count()).toEqual(2);
          expect(downloadTrialsSpy.calls.argsFor(0)).toEqual([['NCT00000001', 'NCT00000002']]);
          expect(downloadTrialsSpy.calls.argsFor(1)).toEqual([['NCT00000003', 'NCT00000004']]);
        })
      ).toBeResolved();
    });
  });

  describe('#downloadTrials', () => {
    let downloader: ctg.ClinicalTrialsGovService;
    beforeEach(() => {
      return ctg.createClinicalTrialsGovService(dataDirPath).then((service) => {
        downloader = service;
      });
    });

    it('handles failures from https.get', () => {
      nock('https://clinicaltrials.gov')
        .get('/ct2/download_studies?term=' + nctIds.join('+OR+'))
        .replyWithError('Test error');
      return expectAsync(downloader['downloadTrials'](nctIds)).toBeRejectedWithError('Test error');
    });

    it('handles failure responses from the server', () => {
      const scope = nock('https://clinicaltrials.gov')
        .get('/ct2/download_studies?term=' + nctIds.join('+OR+'))
        .reply(404, 'Unknown');
      return expectAsync(
        downloader['downloadTrials'](nctIds).finally(() => {
          expect(scope.isDone()).toBeTrue();
        })
      ).toBeRejected();
    });

    it('extracts a ZIP', () => {
      const scope = nock('https://clinicaltrials.gov')
        .get('/ct2/download_studies?term=' + nctIds.join('+OR+'))
        .reply(200, 'Unimportant', {
          'Content-type': 'application/zip'
        });
      const spy = jasmine.createSpy('extractResults').and.callFake((): Promise<void> => {
        return Promise.resolve();
      });
      // Jam the spy in (method is protected, that's why it can't be created directly)
      downloader['extractResults'] = spy;
      return expectAsync(
        downloader['downloadTrials'](nctIds).finally(() => {
          // Just check that it was called
          expect(spy).toHaveBeenCalledTimes(1);
          expect(scope.isDone()).toBeTrue();
        })
      ).toBeResolved();
    });
  });

  describe('#extractResults', () => {
    let downloader: ctg.ClinicalTrialsGovService;
    beforeEach(() => {
      return ctg.createClinicalTrialsGovService(dataDirPath).then((service) => {
        downloader = service;
      });
    });

    it('handles the extract failing', () => {
      // For now, just give it a file that does not exist
      return expectAsync(
        downloader['extractResults'](fs.createReadStream(specFilePath('does_not_exists.file')))
      ).toBeRejected();
    });

    it('handles an invalid ZIP', () => {
      // For now, give it a JSON file to extract
      return expectAsync(downloader['extractResults'](fs.createReadStream(specFilePath('resource.json')))).toBeRejected();
    });

    it('handles deleting the temporary ZIP failing', () => {
      // Spy on the unlink method
      (spyOn(fs, 'unlink') as jasmine.Spy).and.callFake((_path: string, callback: fs.NoParamCallback) => {
        callback(new Error('Simulated error'));
      });
      // Don't actually do anything
      downloader['extractZip'] = jasmine.createSpy('extractZip').and.callFake(() => {
        return Promise.resolve();
      });
      return expectAsync(downloader['extractResults'](stream.Readable.from('Test'))).toBeResolved();
    });
  });

  describe('#getCachedClinicalStudy', () => {
    let downloader: ctg.ClinicalTrialsGovService;
    beforeEach(() => {
      return ctg.createClinicalTrialsGovService(dataDirPath).then((service) => {
        downloader = service;
      });
    });
    it('handles a file that does not exist', () => {
      // Intentionally call private method (this is a test after all)
      return expectAsync(downloader.getCachedClinicalStudy('this is an invalid id')).toBeResolvedTo(null);
    });

    it('invokes the load method of the cache entry', () => {
      // Force in a "fake" cache entry
      const entry = new ctg.CacheEntry('test', {});
      const study = createClinicalStudy();
      const spy = spyOn(entry, 'load').and.callFake(() => {
        return Promise.resolve(study);
      });
      downloader['cache'].set('test', entry);
      return expectAsync(downloader.getCachedClinicalStudy('test')).toBeResolvedTo(study).then(() => {
        // Make sure the spy was called once (with no arguments)
        expect(spy).toHaveBeenCalledOnceWith();
      });
    });
  });

  describe('#updateResearchStudy', () => {
    it('forwards to updateResearchStudyWithClinicalStudy', () => {
      const service = new ctg.ClinicalTrialsGovService(dataDirPath);
      const testResearchStudy = createResearchStudy('test');
      const testClinicalStudy = createClinicalStudy();
      service.updateResearchStudy(testResearchStudy, testClinicalStudy);
      // There's no really good way to verify this worked. For now, it not blowing up is good enough.
    });
  });

  describe('filling out a partial trial', () => {
    // Use the downloader to load the fixture data
    let downloader: ctg.ClinicalTrialsGovService;
    let updatedTrial: ResearchStudy;
    let clinicalStudy: ClinicalStudy;
    beforeAll(async function () {
      downloader = new ctg.ClinicalTrialsGovService(dataDirPath);
      await downloader.init();
      // Cache should have been restored on init
      const maybeStudy = await downloader.getCachedClinicalStudy(nctID);
      if (maybeStudy === null) {
        throw new Error('Unable to open study');
      } else {
        clinicalStudy = maybeStudy;
      }
      // Note this mutates study, which doesn't actually matter at present.
      updatedTrial = ctg.updateResearchStudyWithClinicalStudy(study, clinicalStudy);
    });

    it('fills in inclusion criteria', () => {
      expect(updatedTrial.enrollment).toBeDefined();
      if (updatedTrial.enrollment) {
        // Prove enrollment exists to TypeScript
        expect(updatedTrial.enrollment.length).toBeGreaterThan(0);
        expect(updatedTrial.enrollment[0].display).toBeDefined();
      }
    });

    it('fills in phase', () => {
      expect(updatedTrial.phase).toBeDefined();
      if (updatedTrial.phase) expect(updatedTrial.phase.text).toBe('Phase 3');
    });

    it('fills in study type', () => {
      expect(updatedTrial.category).toBeDefined();
      if (updatedTrial.category) {
        expect(updatedTrial.category.length).toBeGreaterThan(0);
        expect(updatedTrial.category[0].text).toBe('Interventional');
      }
    });

    it('fills in description', () => {
      expect(updatedTrial.description).toBeDefined();
    });

    it('fills out the status', () => {
      const actual = ctg.updateResearchStudyWithClinicalStudy(
        { resourceType: 'ResearchStudy' },
        {
          overall_status: ['Available']
        }
      );
      expect(actual.status).toEqual('completed');
    });

    it('leaves status alone if unavailable', () => {
      const actual = ctg.updateResearchStudyWithClinicalStudy(
        { resourceType: 'ResearchStudy' },
        {
          // Lie about types
          overall_status: [('something invalid' as unknown) as StatusEnum]
        }
      );
      // It shouldn't have changed it, because it can't
      expect(actual.status).toBeUndefined();
    });

    it('fills out conditions', () => {
      const actual = ctg.updateResearchStudyWithClinicalStudy(
        { resourceType: 'ResearchStudy' },
        {
          condition: ['Condition 1', 'Condition 2']
        }
      );
      expect(actual.condition).toBeDefined();
      if (actual.condition) {
        expect(actual.condition.length).toEqual(2);
        expect(actual.condition[0].text).toEqual('Condition 1');
        expect(actual.condition[1].text).toEqual('Condition 2');
      }
    });

    it('does not overwrite site data', () => {
      const researchStudy = new ResearchStudyObj('id');
      const location = researchStudy.addSite('Example');
      const result = ctg.updateResearchStudyWithClinicalStudy(researchStudy, {
        location: [
          {
            // Everything here is technically optional
            facility: [
              {
                name: ['Facility ']
              }
            ]
          }
        ]
      });
      expect(result.site).toBeDefined();
      const sites = result.site;
      if (sites) {
        expect(sites.length).toEqual(1);
        if (sites[0]) {
          expect(sites[0].reference).toEqual('#' + location.id);
          if (location.id) {
            const actualLocation = getContainedResource(result, location.id);
            expect(actualLocation).not.toBeNull();
            if (actualLocation) {
              expect(actualLocation.resourceType).toEqual('Location');
              expect((actualLocation as Location).name).toEqual('Example');
            }
          } else {
            fail('location.id not defined');
          }
        } else {
          fail('sites[0] undefined');
        }
      }
    });

    it('does not alter a filled out trial', () => {
      // Clone the trial in the dumbest but also most sensible way
      const exampleStudy: ResearchStudy = JSON.parse(JSON.stringify(trialFilled));
      ctg.updateResearchStudyWithClinicalStudy(exampleStudy, clinicalStudy);
      // Nothing should have changed
      expect(exampleStudy).toEqual(trialFilled as ResearchStudy);
    });

    function expectTelecom(location: Location, type: 'phone' | 'email', expectedValue: string | null) {
      // Look through the telecoms
      // If the expected value is null, telecom must be defined, otherwise it
      // may be empty
      if (expectedValue !== null) expect(location.telecom).toBeDefined();
      if (location.telecom) {
        // If we're expecting a telecom we're expecting it to appear exactly once
        let found = 0;
        for (const telecom of location.telecom) {
          if (telecom.system === type) {
            found++;
            if (found > 1) {
              fail(`Found an extra ${type}`);
            }
            if (expectedValue === null) {
              // If null, it wasn't expected at all
              fail(`Expected no ${type}, but one was found`);
            } else {
              expect(telecom.use).toEqual('work');
              expect(telecom.value).toEqual(expectedValue);
            }
          }
        }
        if (expectedValue !== null && found === 0) {
          fail(`Expected one ${type}, not found`);
        }
      }
    }

    function expectLocation(
      resource: ContainedResource,
      expectedName?: string,
      expectedPhone?: string,
      expectedEmail?: string,
      expectedAddress?: Address
    ) {
      if (resource.resourceType === 'Location') {
        const location = resource as Location;
        if (expectedName) {
          expect(location.name).toEqual(expectedName);
        } else {
          expect(location.name).not.toBeDefined();
        }
        expectTelecom(location, 'phone', expectedPhone || null);
        expectTelecom(location, 'email', expectedEmail || null);
        if (expectedAddress) {
          expect(location.address).toBeDefined();
          expect(location.address).toEqual(expectedAddress);
        } else {
          expect(location.address).not.toBeDefined();
        }
      } else {
        fail(`Expected Location, got ${resource.resourceType}`);
      }
    }

    it('fills out sites as expected', () => {
      const result = ctg.updateResearchStudyWithClinicalStudy(
        { resourceType: 'ResearchStudy' },
        {
          location: [
            // Everything in location is optional, so this is valid:
            {},
            {
              // Everything in facility is valid, so this is also valid
              facility: [{}]
            },
            {
              facility: [{ name: ['Only Email'] }],
              contact: [{ email: ['email@example.com'] }]
            },
            {
              facility: [{ name: ['Only Phone'] }],
              contact: [{ phone: ['781-555-0100'] }]
            },
            {
              facility: [{ name: ['Phone and Email'] }],
              contact: [
                {
                  email: ['hasemail@example.com'],
                  phone: ['781-555-0101']
                }
              ]
            },
            {
              facility: [
                {
                  name: ['Only Address'],
                  address: [{ city: ['Bedford'], state: ['MA'], country: ['US'], zip: ['01730'] }]
                }
              ]
            }
          ]
        }
      );
      // Sites should be filled out
      expect(result.site).toBeDefined();
      if (result.site) {
        expect(result.site.length).toEqual(6);
      }
      // Make sure each individual site was created properly - they will be contained resources and should be in order
      expect(result.contained).toBeDefined();
      if (result.contained) {
        // Both 0 and 1 should be empty
        expectLocation(result.contained[0]);
        expectLocation(result.contained[1]);
        expectLocation(result.contained[2], 'Only Email', undefined, 'email@example.com');
        expectLocation(result.contained[3], 'Only Phone', '781-555-0100');
        expectLocation(result.contained[4], 'Phone and Email', '781-555-0101', 'hasemail@example.com');
        expectLocation(result.contained[5], 'Only Address', undefined, undefined, {
          use: 'work',
          city: 'Bedford',
          state: 'MA',
          postalCode: '01730',
          country: 'US'
        });
      }
    });

    function expectEmptyResearchStudy(researchStudy: ResearchStudy): void {
      // Technically this is just checking fields updateResearchStudyWithClinicalStudy may change
      expect(researchStudy.contained).not.toBeDefined('contained');
      expect(researchStudy.enrollment).not.toBeDefined('enrollment');
      expect(researchStudy.description).not.toBeDefined('description');
      expect(researchStudy.phase).not.toBeDefined('phase');
      expect(researchStudy.category).not.toBeDefined('category');
      expect(researchStudy.status).not.toBeDefined('status');
      expect(researchStudy.condition).not.toBeDefined('condition');
      expect(researchStudy.site).not.toBeDefined('site');
    }

    it("handles XML with missing data (doesn't crash)", () => {
      let researchStudy: ResearchStudy;
      // This is technically invalid, the XML is entirely missing
      researchStudy = ctg.updateResearchStudyWithClinicalStudy(new ResearchStudyObj('id'), {});
      // Expect nothing to have changed
      expectEmptyResearchStudy(researchStudy);
      // Some partial XML
      researchStudy = ctg.updateResearchStudyWithClinicalStudy(new ResearchStudyObj('id'), {
        eligibility: [
          {
            gender: ['All'],
            minimum_age: ['18 Years'],
            maximum_age: ['N/A']
          }
        ]
      });
      expectEmptyResearchStudy(researchStudy);
    });
  });
});
