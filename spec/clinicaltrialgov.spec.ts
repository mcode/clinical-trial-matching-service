import { getContainedResource, ResearchStudy as ResearchStudyObj } from './../src/research-study';
import { Address, Location, ResearchStudy, ContainedResource } from '../src/fhir-types';
import * as ctg from '../src/clinicaltrialgov';
import fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import nock from 'nock';
// Trial missing summary, inclusion/exclusion criteria, phase and study type
import trialMissing from './data/resource.json';
import trialFilled from './data/complete_study.json';
import { ClinicalStudy, StatusEnum } from '../src/clinicalstudy';

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

describe('parseClinicalTrialXML', () => {
  it("rejects if given valid XML that's not a clinical study", () => {
    return expectAsync(ctg.parseClinicalTrialXML('<?xml version="1.0"?><root><child/></root>')).toBeRejectedWithError(
      'Unable to parse trial as valid clinical study XML'
    );
  });
});

describe('ClinicalTrialGovService', () => {
  const study: ResearchStudy = trialMissing.entry[0].resource as ResearchStudy;
  const nctID = ctg.findNCTNumber(study);
  if (nctID === null) {
    // This indicates a failure in test cases
    throw new Error('ResearchStudy has no NCT number');
  }
  const nctIds = [nctID];
  const tempDataDirPath = path.join(os.tmpdir(), 'clinicaltrialgov_test');

  describe('#init', () => {
    let downloader: ctg.ClinicalTrialGovService;
    beforeEach(() => {
      downloader = new ctg.ClinicalTrialGovService(tempDataDirPath);
    });

    it('handles the directory already existing', () => {
      const dirSpy = jasmine.createSpyObj('fs.dir', ['close']);
      dirSpy.close.and.callFake((callback: () => void) => {
        callback();
      });
      // because we don't override promisify, we need to "delete" the type data
      (spyOn(fs, 'opendir') as jasmine.Spy).and.callFake((path, callback) => {
        expect(path).toEqual(tempDataDirPath);
        callback(undefined, dirSpy);
      });
      return expectAsync(downloader.init()).toBeResolved();
    });

    it('handles the directory already existing but not being a directory', () => {
      // because we don't override promisify, we need to "delete" the type data
      (spyOn(fs, 'opendir') as jasmine.Spy).and.callFake((path, callback) => {
        expect(path).toEqual(tempDataDirPath);
        const err: NodeJS.ErrnoException = new Error('Does not exist');
        err.code = 'ENOTDIR';
        callback(err);
      });
      return expectAsync(downloader.init()).toBeRejected();
    });

    it('handles the directory close failing', () => {
      const dirSpy = jasmine.createSpyObj('fs.dir', ['close']);
      dirSpy.close.and.callFake((callback: (err: Error) => void) => {
        callback(new Error('unexpected error'));
      });
      // because we don't override promisify, we need to "delete" the type data
      (spyOn(fs, 'opendir') as jasmine.Spy).and.callFake((path, callback) => {
        expect(path).toEqual(tempDataDirPath);
        callback(undefined, dirSpy);
      });
      // Should resolve anyway
      return expectAsync(downloader.init()).toBeResolved();
    });

    it("creates the directory if it doesn't exist", () => {
      // because we don't override promisify, we need to "delete" the type data
      (spyOn(fs, 'opendir') as jasmine.Spy).and.callFake((path, callback) => {
        expect(path).toEqual(tempDataDirPath);
        const err: NodeJS.ErrnoException = new Error('Does not exist');
        err.code = 'ENOENT';
        callback(err);
      });
      (spyOn(fs, 'mkdir') as jasmine.Spy).and.callFake((path, options, callback) => {
        expect(path).toEqual(tempDataDirPath);
        expect(options.recursive).toEqual(true);
        callback();
      });
      return expectAsync(downloader.init()).toBeResolved();
    });

    it('handles the directory creation failing', () => {
      // because we don't override promisify, we need to "delete" the type data
      (spyOn(fs, 'opendir') as jasmine.Spy).and.callFake((path, callback) => {
        expect(path).toEqual(tempDataDirPath);
        const err: NodeJS.ErrnoException = new Error('Does not exist');
        err.code = 'ENOENT';
        callback(err);
      });
      (spyOn(fs, 'mkdir') as jasmine.Spy).and.callFake((path, options, callback) => {
        expect(path).toEqual(tempDataDirPath);
        expect(options.recursive).toEqual(true);
        callback(new Error('test error'));
      });
      return expectAsync(downloader.init()).toBeRejected();
    });
  });

  describe('#downloadTrials', () => {
    let downloader: ctg.ClinicalTrialGovService;
    beforeEach(() => {
      return ctg.createClinicalTrialGovService(tempDataDirPath).then((service) => {
        downloader = service;
      });
    });

    xit('handles failures from https.get', () => {
      // FIXME: Use nock
      // const spy = spyOn(downloader, 'getURL').and.callFake(() => {
      //   throw new Error('Test error');
      // });
      // return expectAsync(
      //   downloader.downloadTrials(nctIds).finally(() => {
      //     expect(spy).toHaveBeenCalled();
      //   })
      // ).toBeRejectedWithError('Test error');
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
        .replyWithFile(200, specFilePath('search_result.zip'), {
          'Content-type': 'application/zip'
        });
      return expectAsync(
        downloader['downloadTrials'](nctIds).finally(() => {
          expect(scope.isDone()).toBeTrue();
        })
      ).toBeResolved();
    });
  });

  describe('#extractResults', () => {
    let downloader: ctg.ClinicalTrialGovService;
    beforeEach(() => {
      return ctg.createClinicalTrialGovService(tempDataDirPath).then((service) => {
        downloader = service;
      });
    });

    it('handles the extract failing', () => {
      // For now, just give it a file that does not exist
      return expectAsync(
        downloader.extractResults(fs.createReadStream(specFilePath('does_not_exists.file')))
      ).toBeRejected();
    });

    it('handles an invalid ZIP', () => {
      // For now, give it a JSON file to extract
      return expectAsync(downloader.extractResults(fs.createReadStream(specFilePath('resource.json')))).toBeRejected();
    });
  });

  describe('#getDownloadedTrial', () => {
    let downloader: ctg.ClinicalTrialGovService;
    beforeEach(() => {
      return ctg.createClinicalTrialGovService(tempDataDirPath).then((service) => {
        downloader = service;
      });
    });
    it('handles a file that does not exist', () => {
      // Intentionally call private method (this is a test after all)
      return expectAsync(downloader['getDownloadedTrial']('ignored', 'this is an invalid id')).toBeResolvedTo(null);
    });
  });

  describe('filling out a partial trial', () => {
    // Downloader is still required because the test data is within the test zip
    let downloader: ctg.ClinicalTrialGovService;
    let updatedTrial: ResearchStudy;
    let clinicalStudy: ClinicalStudy;
    beforeAll(async function () {
      downloader = new ctg.ClinicalTrialGovService(tempDataDirPath);
      await downloader.init();
      // "Import" the trial
      const tempDir = await downloader.extractResults(fs.createReadStream(specFilePath('search_result.zip')));
      const maybeStudy = await downloader['getDownloadedTrial'](tempDir, nctID);
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
              facility: [{ name: ['Only Address'], address: [{ city: ['Bedford'], state: ['MA'], country: ['US'], zip: ['01730'] }] }]
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

  afterAll(function (done) {
    // Clean up temp directory
    fs.rmdir(tempDataDirPath, { recursive: true }, (err) => {
      if (err) {
        console.log(err);
      }
    });
    done();
  });
});
