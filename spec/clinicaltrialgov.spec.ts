import { ResearchStudy as ResearchStudyObj } from './../src/research-study';
import { ResearchStudy } from '../src/fhir-types';
import * as ctg from '../src/clinicaltrialgov';
import fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import nock from 'nock';
// Trial missing summary, inclusion/exclusion criteria, phase and study type
import trialMissing from './data/resource.json';
import trialFilled from './data/complete_study.json';

function specFilePath(specFilePath: string): string {
  return path.join(__dirname, '../../spec/data', specFilePath);
}

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
        // This spy exists more to suppress output than anything else
        const spy = spyOn(console, 'error');
        callback(new Error('unexpected error'));
        expect(spy).toHaveBeenCalled();
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

    it('handles failures from https.get', () => {
      const spy = spyOn(downloader, 'getURL').and.callFake(() => { throw new Error('Test error') });
      return expectAsync(downloader.downloadTrials(nctIds).finally(() => {
        expect(spy).toHaveBeenCalled();
      })).toBeRejectedWithError('Test error');
    });

    it('handles failure responses from the server', () => {
      const scope = nock('https://clinicaltrials.gov')
        .get('/ct2/download_studies?term=' + nctIds.join('+OR+'))
        .reply(404, 'Unknown');
      return expectAsync(downloader.downloadTrials(nctIds).finally(() => {
        expect(scope.isDone()).toBeTrue();
      })).toBeRejected();
    });

    it('extracts a ZIP', () => {
      const scope = nock('https://clinicaltrials.gov')
        .get('/ct2/download_studies?term=' + nctIds.join('+OR+'))
        .replyWithFile(200, specFilePath('search_result.zip'), {
          'Content-type': 'application/zip'
        });
      return expectAsync(downloader.downloadTrials(nctIds).finally(() => {
        expect(scope.isDone()).toBeTrue();
      })).toBeResolved();
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
      return expectAsync(downloader.extractResults(fs.createReadStream(specFilePath('does_not_exists.file')))).toBeRejected();
    });

    it('handles an invalid ZIP', () => {
      // For now, give it a JSON file to extract
      return expectAsync(downloader.extractResults(fs.createReadStream(specFilePath('resource.json')))).toBeRejected();
    });
  });

  describe('filling out a partial trial', () => {
    let downloader: ctg.ClinicalTrialGovService;
    let updatedTrial: ResearchStudy;
    beforeAll(async function () {
      downloader = new ctg.ClinicalTrialGovService(tempDataDirPath);
      // "Import" the trial
      await downloader.extractResults(fs.createReadStream(specFilePath('search_result.zip')));
      // Note this mutates study, which doesn't actually matter at present.
      updatedTrial = downloader.updateTrial(study);
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

    it('returns same object on empty study', () => {
      const empty = new ResearchStudyObj(2);
      const backup_service = new ctg.ClinicalTrialGovService(tempDataDirPath);
      expect(backup_service.updateTrial(empty)).toBe(empty);
    });

    it('returns on filled out study', () => {
      const study_filled = trialFilled as ResearchStudy;
      const backup_service = new ctg.ClinicalTrialGovService(tempDataDirPath);
      expect(backup_service.updateTrial(study_filled)).toBeDefined();
    });
  });

  // afterAll(function (done) {
  //   // Clean up temp directory
  //   fs.rmdir(tempDataDirPath, { recursive: true }, (err) => {
  //     if (err) {
  //       console.log(err);
  //     }
  //   });
  //   done();
  // });
});
