import { getContainedResource, ResearchStudy as ResearchStudyObj } from '../src/research-study';
import { Address, Location, ResearchStudy, ContainedResource } from '../src/fhir-types';
import * as ctg from '../src/clinicaltrialsgov';
import fs from 'fs';
import stream from 'stream';
import path from 'path';
import { EventEmitter } from 'events';
import yauzl from 'yauzl';
import nock from 'nock';
import { Volume } from 'memfs';

// Trial missing summary, inclusion/exclusion criteria, phase and study type
import trialMissing from './data/resource.json';
import trialFilled from './data/complete_study.json';
import { ClinicalStudy, StatusEnum } from '../src/clinicalstudy';
import { createClinicalStudy } from './support/clinicalstudy-factory';
import { createResearchStudy } from './support/researchstudy-factory';
import { PlanDefinition } from '../dist/fhir-types';

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
  it('logs failures', () => {
    const log = jasmine.createSpy('log');
    return expectAsync(ctg.parseClinicalTrialXML('<?xml version="1.0"?><root><child/></root>', log))
      .toBeRejectedWithError('Unable to parse trial as valid clinical study XML')
      .then(() => {
        expect(log).toHaveBeenCalled();
      });
  });
});

describe('CacheEntry', () => {
  // Constant start time
  const startTime = new Date(2021, 0, 21, 12, 0, 0, 0);
  // Create a dummy service
  const service = new ctg.ClinicalTrialsGovService('/invalid', { cleanInterval: 0 });
  describe('createdAt', () => {
    beforeAll(() => {
      jasmine.clock().install();
      jasmine.clock().mockDate(startTime);
    });
    afterAll(() => {
      jasmine.clock().uninstall();
    });
    it('sets the created at time', () => {
      const entry = new ctg.CacheEntry(service, 'test', {});
      expect(entry.createdAt).toEqual(startTime);
    });
    it('clones the created at time', () => {
      const entry = new ctg.CacheEntry(service, 'test', {});
      const createdAt = entry.createdAt;
      expect(createdAt).toBeDefined();
      if (createdAt)
        createdAt.setMonth(5);
      expect(entry.createdAt).toEqual(startTime);
    });
  });
  describe('lastAccess', () => {
    beforeAll(() => {
      jasmine.clock().install();
    });
    beforeEach(() => {
      // Reset the clock
      jasmine.clock().mockDate(startTime);
    });
    afterAll(() => {
      jasmine.clock().uninstall();
    });
    it('sets the last access time', () => {
      const entry = new ctg.CacheEntry(service, 'test', {});
      expect(entry.lastAccess).toEqual(startTime);
    });
    it('clones the last access time', () => {
      const entry = new ctg.CacheEntry(service, 'test', {});
      entry.lastAccess.setMonth(5);
      expect(entry.lastAccess).toEqual(startTime);
    });
    it('updates the last access time if accessed', () => {
      const entry = new ctg.CacheEntry(service, 'test', {});
      // This spy exists to prevent an attempt from actually reading the file
      spyOn(entry, 'readFile').and.callFake(() => {
        return Promise.resolve(createClinicalStudy());
      });
      // Move forward a minute
      jasmine.clock().tick(60000);
      const promise = entry.load();
      // Last access should now be a minute after the start time
      expect(entry.lastAccess).toEqual(new Date(2021, 0, 21, 12, 1, 0, 0));
      return expectAsync(promise).toBeResolved();
    });
    describe('#lastAccessBefore', () => {
      it('determines if a date is before the last access time', () => {
        const entry = new ctg.CacheEntry(service, 'test', {});
        expect(entry.lastAccessedBefore(new Date(2021, 0, 21, 11, 59, 59, 999))).toBeFalse();
        // Exactly the same time is not before
        expect(entry.lastAccessedBefore(startTime)).toBeFalse();
        expect(entry.lastAccessedBefore(new Date(2021, 0, 21, 12, 0, 0, 1))).toBeTrue();
      });
    });
  });
  describe('pending', () => {
    it('resolves a load once pending resolves', () => {
      // This test is kind of weird, but first, create an entry in the pending state:
      const entry = new ctg.CacheEntry(service, 'pending', { pending: true });
      const spy = spyOn(entry, 'readFile').and.callFake(() => Promise.resolve(createClinicalStudy()));
      // Now, attempt to load it. This should do nothing as the entry is pending.
      let shouldBeResolved = false;
      const promise = entry.load();
      promise.then(() => {
        // Check if we should be resolved at this point
        expect(shouldBeResolved).toBeTrue();
        if (shouldBeResolved) {
          // If it should be resolved, it should have called readFile
          expect(spy).toHaveBeenCalledOnceWith();
        }
      });
      // Set a timeout to happen "on next event loop" that marks the cache entry as ready
      setTimeout(() => {
        // Make sure the spy has not been called - yet.
        expect(spy).not.toHaveBeenCalled();
        // Set the resolved flag to true
        shouldBeResolved = true;
        // And mark the entry ready, which should trigger the promise resolving
        entry.ready();
        // And then mark it as ready again, which should NOT trigger a second resolve
        entry.ready();
      }, 0);
      // And now return that original Promise, expecting it to eventually resolve successfully
      return expectAsync(promise).toBeResolved();
    });
  });
  describe('#readFile()', () => {
    it('rejects with an error if it fails', () => {
      const readFileSpy = spyOn(fs, 'readFile') as unknown as jasmine.Spy<
        (path: string, options: { encoding?: string }, callback: (err?: Error, data?: Buffer) => void) => void
      >;
      readFileSpy.and.callFake((path, options, callback) => {
        callback(new Error('Simulated error'));
      });
      const testEntry = new ctg.CacheEntry(service, 'test', {});
      return expectAsync(testEntry.readFile()).toBeRejectedWithError('Simulated error');
    });
    it('resolves to null if the file is empty', () => {
      const readFileSpy = spyOn(fs, 'readFile') as unknown as jasmine.Spy<
        (path: string, options: { encoding?: string }, callback: (err?: Error, data?: Buffer) => void) => void
      >;
      readFileSpy.and.callFake((path, options, callback) => {
        callback(undefined, Buffer.alloc(0));
      });
      const testEntry = new ctg.CacheEntry(service, 'test', {});
      return expectAsync(testEntry.readFile()).toBeResolvedTo(null);
    });
  });
  describe('#remove()', () => {
    let entry: ctg.CacheEntry;
    let unlinkSpy: jasmine.Spy<(path: string, callback: (err?: Error) => void) => void>;
    beforeEach(() => {
      entry = new ctg.CacheEntry(service, 'NCT12345678.xml', {});
      unlinkSpy = spyOn(fs, 'unlink') as unknown as jasmine.Spy<
        (path: string, callback: (err?: Error) => void) => void
      >;
    });

    it('deletes the underlying file', () => {
      unlinkSpy.and.callFake((path, callback) => {
        // Immediately invoke the callback
        callback();
      });
      return expectAsync(entry.remove())
        .toBeResolved()
        .then(() => {
          expect(unlinkSpy).toHaveBeenCalledTimes(1);
          expect(unlinkSpy.calls.first().args[0]).toEqual('NCT12345678.xml');
        });
    });

    it('rejects if an error occurs', () => {
      unlinkSpy.and.callFake((path, callback) => {
        // Immediately invoke the callback
        callback(new Error('Simulated unlink error'));
      });
      return expectAsync(entry.remove()).toBeRejectedWithError('Simulated unlink error');
    });
  });
});

describe('ClinicalTrialsGovService', () => {
  // The data dir path
  const dataDirPath = '/ctg-cache';
  // Virtual directory that has more than one entry (with known times)
  const multipleEntriesDataDir = '/ctg-cache-multi';
  // The date used for when the cache was first created, 2021-02-01T12:00:00.000 (picked arbitrarily)
  const cacheStartTime = new Date(2021, 1, 1, 12, 0, 0, 0);
  let study: ResearchStudy, nctID: ctg.NCTNumber;
  // Create our mock FS
  const cacheVol = Volume.fromNestedJSON({
    '/ctg-cache/data/NCT02513394.xml': fs.readFileSync(specFilePath('NCT02513394.xml'), { encoding: 'utf8' }),
    '/existing-file': 'Existing stub',
    '/ctg-cache-multi/data': {
      'NCT00000001.xml': 'Test File 1',
      'NCT00000002.xml': 'Test File 2',
      'NCT00000003.xml': 'Test File 3',
      // Junk files: files that should be skipped on init
      '.xml': 'not really an XML file, but a dot file called "xml"',
      'invalid.xml': 'not an NCT',
      'NCT1.xml': 'not a valid NCT'
    }
  });
  // Force the type to FileSystem since the memfs types are wrong (well, too loose, compared to the proper types)
  const cacheFS: ctg.FileSystem = cacheVol as ctg.FileSystem;
  beforeAll(() => {
    study = trialMissing.entry[0].resource as ResearchStudy;
    const maybeNctID = ctg.findNCTNumber(study);
    if (maybeNctID === null) {
      // This indicates a failure in test cases
      throw new Error('ResearchStudy has no NCT number');
    } else {
      nctID = maybeNctID;
    }
    // Create an empty directory
    cacheVol.mkdirSync('/ctg-cache-empty');
    // Update mtimes for files
    // Mock file that was created 1 minute after cache was created
    let time = new Date(cacheStartTime.getTime() + 60 * 1000);
    cacheVol.utimesSync('/ctg-cache-multi/data/NCT00000001.xml', time, time);
    // Mock file that was created 1.5 minutes after cache was created
    time = new Date(cacheStartTime.getTime() + 90 * 1000);
    cacheVol.utimesSync('/ctg-cache-multi/data/NCT00000002.xml', time, time);
    // Mock file that was created 2 minutes after cache was created
    time = new Date(cacheStartTime.getTime() + 2 * 60 * 1000);
    cacheVol.utimesSync('/ctg-cache-multi/data/NCT00000003.xml', time, time);
  });

  it('can set a custom logger', () => {
    const customLogger = (): void => {
      // Do nothing
    };
    const instance = new ctg.ClinicalTrialsGovService(dataDirPath, { log: customLogger, fs: cacheFS });
    expect(instance['log']).toEqual(customLogger);
  });

  describe('#maxTrialsPerRequest', () => {
    let service: ctg.ClinicalTrialsGovService;
    beforeEach(() => {
      // The service is never initialized so the temp directory isn't created
      service = new ctg.ClinicalTrialsGovService(dataDirPath, { fs: cacheFS });
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

  describe('#expirationTimeout', () => {
    let service: ctg.ClinicalTrialsGovService;
    beforeEach(() => {
      service = new ctg.ClinicalTrialsGovService(dataDirPath, { fs: cacheFS });
    });
    it('ensures the value is at least 1000', () => {
      service.expirationTimeout = 5;
      expect(service.expirationTimeout).toEqual(1000);
      service.expirationTimeout = -100;
      expect(service.expirationTimeout).toEqual(1000);
      service.expirationTimeout = 1500;
      expect(service.expirationTimeout).toEqual(1500);
    });
  });

  describe('#cleanupInterval', () => {
    let service: ctg.ClinicalTrialsGovService;
    beforeEach(() => {
      service = new ctg.ClinicalTrialsGovService(dataDirPath, { fs: cacheFS });
    });
    it('caps the value to 2^31', () => {
      // This is too large: it exceeds 2^31
      service.cleanupInterval = 3000000000;
      expect(service.cleanupInterval).toEqual(0x7fffffff);
    });
    it('treats Infinity as 0', () => {
      service.cleanupInterval = Infinity;
      expect(service.cleanupInterval).toEqual(0);
    });
    it('ensures a minimum of 60000', () => {
      service.cleanupInterval = 5;
      expect(service.cleanupInterval).toEqual(60000);
      // Unless explicitly 0 which means "disable"
      service.cleanupInterval = 0;
      expect(service.cleanupInterval).toEqual(0);
      // Negative is clamped to 0
      service.cleanupInterval = -100;
      expect(service.cleanupInterval).toEqual(0);
    });
  });

  describe('#init', () => {
    it('restores cache entries in an existing directory', () => {
      const testService = new ctg.ClinicalTrialsGovService(multipleEntriesDataDir, { cleanInterval: 0, fs: cacheFS });
      return expectAsync(testService.init())
        .toBeResolved()
        .then(() => {
          // Restored cache should have only one key in it as it should have
          // ignored the two invalid file names
          expect(Array.from(testService['cache'].keys()).sort()).toEqual(['NCT00000001', 'NCT00000002', 'NCT00000003']);
          // Make sure the cache entries were created properly with the stats
          function expectDate(key: string, date: Date): void {
            const entry = testService['cache'].get(key);
            expect(entry).toBeDefined();
            if (entry) {
              // Must have the entry to check it
              expect(entry.lastAccess).toEqual(date);
            }
          }
          expectDate('NCT00000001', new Date(2021, 1, 1, 12, 1, 0, 0));
          expectDate('NCT00000002', new Date(2021, 1, 1, 12, 1, 30, 0));
          expectDate('NCT00000003', new Date(2021, 1, 1, 12, 2, 0, 0));
        });
    });

    it('handles the directory already existing but not being a directory', () => {
      const testService = new ctg.ClinicalTrialsGovService('existing-file', { cleanInterval: 0, fs: cacheFS });
      return expectAsync(testService.init()).toBeRejected();
    });

    it('creates the data directory if the cache directory exists but is empty', () => {
      const testService = new ctg.ClinicalTrialsGovService('/ctg-cache-empty', { cleanInterval: 0, fs: cacheFS });
      return expectAsync(testService.init())
        .toBeResolved()
        .then(() => {
          // Make sure the mocked directory exists - because this is being mocked,
          // just use sync fs functions
          expect(() => {
            cacheVol.readdirSync('/ctg-cache-empty/data');
          }).not.toThrow();
        });
    });

    it("creates the directory if it doesn't exist", () => {
      const testService = new ctg.ClinicalTrialsGovService('/new-ctg-cache', { cleanInterval: 0, fs: cacheFS });
      return expectAsync(testService.init())
        .toBeResolved()
        .then(() => {
          // Make sure the mocked directory exists - because this is being mocked,
          // just use sync fs functions
          expect(() => {
            cacheVol.readdirSync('/new-ctg-cache');
          }).not.toThrow();
        });
    });

    it('handles the directory creation failing', () => {
      // because we don't override promisify, we need to "delete" the type data
      const testService = new ctg.ClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS });
      (spyOn(cacheFS, 'mkdir') as jasmine.Spy).and.callFake((path, callback) => {
        expect(path).toEqual(dataDirPath);
        callback(new Error('Simulated error'));
      });
      return expectAsync(testService.init()).toBeRejectedWithError('Simulated error');
    });

    it('rejects if the directory cannot be read', () => {
      const testService = new ctg.ClinicalTrialsGovService(dataDirPath, { fs: cacheFS });
      (spyOn(cacheFS, 'readdir') as jasmine.Spy).and.callFake((path, callback) => {
        callback(new Error('Simulated error'));
      });
      return expectAsync(testService.init()).toBeRejectedWithError('Simulated error');
    });

    it('rejects if a single file load fails', () => {
      // FIXME (maybe): it's unclear to me if this is correct behavior - maybe the file should be skipped?
      (spyOn(cacheFS, 'stat') as jasmine.Spy).and.callFake(
        (filename, callback: (err?: Error, stats?: fs.Stats) => void) => {
          callback(new Error('Simulated error'));
        }
      );
      const testService = new ctg.ClinicalTrialsGovService(dataDirPath, { fs: cacheFS });
      return expectAsync(testService.init()).toBeRejectedWithError('Simulated error');
    });

    it('can have no options', () => {
      expect(() => new ctg.ClinicalTrialsGovService(dataDirPath)).not.toThrowError();
    });

    describe('starts a timer', () => {
      const realTimeout = setTimeout;
      let testService: ctg.ClinicalTrialsGovService;
      let removeExpiredCacheEntries: jasmine.Spy<() => Promise<void>>;
      beforeEach(() => {
        jasmine.clock().install();
        testService = new ctg.ClinicalTrialsGovService(dataDirPath, { cleanInterval: 60000, fs: cacheFS });
        removeExpiredCacheEntries = spyOn(testService, 'removeExpiredCacheEntries');
      });
      afterEach(() => {
        jasmine.clock().uninstall();
      });

      // The body of the two tests are identical, the only difference is if the underlying Promise resolves or rejects
      function expectAsyncTimerToBeRecreated(): PromiseLike<void> {
        return expectAsync(testService.init())
          .toBeResolved()
          .then(() => {
            expect(removeExpiredCacheEntries).not.toHaveBeenCalled();
            // Fake the clock moving forward
            jasmine.clock().tick(60000);
            expect(removeExpiredCacheEntries).toHaveBeenCalledTimes(1);
            // We need to let the event loop tick to process the Promise
            return new Promise<void>((resolve) => {
              realTimeout(() => {
                jasmine.clock().tick(60000);
                expect(removeExpiredCacheEntries).toHaveBeenCalledTimes(2);
                resolve();
              }, 0);
            });
          });
      }

      it('that resets itself', () => {
        // For this test, resolve
        removeExpiredCacheEntries.and.callFake(() => {
          return Promise.resolve();
        });
        return expectAsyncTimerToBeRecreated();
      });

      it('that resets itself even if the expiration fails', () => {
        // For this test, always reject
        removeExpiredCacheEntries.and.callFake(() => {
          return Promise.reject(new Error('Simulated error'));
        });
        return expectAsyncTimerToBeRecreated();
      });
    });

    it('does not start a timer if the interval is set to 0', async () => {
      const testService = new ctg.ClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS });
      const spy = jasmine.createSpy('setCleanupTimeout');
      await testService.init();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  describe('#destroy', () => {
    beforeEach(() => {
      jasmine.clock().install();
    });
    afterEach(() => {
      jasmine.clock().uninstall();
    });

    it('stops the timer', async () => {
      const testService = new ctg.ClinicalTrialsGovService(dataDirPath, { cleanInterval: 60000, fs: cacheFS });
      // This spy should never be invoked but provide the fake implementation so that if it is, the tests won't hang
      const removeExpiredCacheEntries = spyOn(testService, 'removeExpiredCacheEntries').and.callFake(() => {
        return Promise.resolve();
      });
      await testService.init();
      // The timer should now be set
      expect(testService['cleanupTimeout']).not.toEqual(null);
      await testService.destroy();
      expect(removeExpiredCacheEntries).not.toHaveBeenCalled();
      expect(testService['cleanupTimeout']).toEqual(null);
    });

    it('does nothing if never started', () => {
      const testService = new ctg.ClinicalTrialsGovService(dataDirPath, { cleanInterval: 60000, fs: cacheFS });
      return expectAsync(testService.destroy()).toBeResolved();
    });
  });

  describe('#updateResearchStudies', () => {
    let service: ctg.ClinicalTrialsGovService;
    let downloadTrialsSpy: jasmine.Spy;

    beforeEach(() => {
      // The service is never initialized
      service = new ctg.ClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS });
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
      const updateSpy = spyOn(service, 'updateResearchStudy');
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
      spyOn(service, 'updateResearchStudy');
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

  describe('#removeExpiredCacheEntries', () => {
    let service: ctg.ClinicalTrialsGovService;
    let entry1: ctg.CacheEntry, entry2: ctg.CacheEntry, entry3: ctg.CacheEntry;
    beforeEach(() => {
      // These tests all involve mucking with time.
      jasmine.clock().install();
      // Set the start date to the cache start time
      jasmine.clock().mockDate(cacheStartTime);
      return ctg
        .createClinicalTrialsGovService(multipleEntriesDataDir, { expireAfter: 60000, fs: cacheFS })
        .then((newService) => {
          service = newService;
          // "Steal" the cache to grab entries for spying purposes
          const cache = service['cache'];
          function safeGet(key: string): ctg.CacheEntry {
            const result = cache.get(key);
            if (result) {
              return result;
            } else {
              throw new Error('Missing cache entry for ' + key + ' (bailing before tests will fail)');
            }
          }
          entry1 = safeGet('NCT00000001');
          entry2 = safeGet('NCT00000002');
          entry3 = safeGet('NCT00000003');
        });
    });
    afterEach(() => {
      // Stop playing with time
      jasmine.clock().uninstall();
    });

    function spyOnRemove(entry: ctg.CacheEntry): jasmine.Spy<() => Promise<void>> {
      // Need to include a default implementation or this will never work
      const spy = spyOn(entry, 'remove').and.callFake(() => Promise.resolve());
      spy.and.identity = entry.filename + '.remove';
      return spy;
    }

    it('removes entries when they expire', async () => {
      // Create the spies on the remove methods
      const removeSpy1 = spyOnRemove(entry1),
        removeSpy2 = spyOnRemove(entry2),
        removeSpy3 = spyOnRemove(entry3);
      const cache = service['cache'];
      await service.removeExpiredCacheEntries();
      // None of the spies should have been removed (technically we're "back in time" before the entires were created)
      expect(removeSpy1).not.toHaveBeenCalled();
      expect(removeSpy2).not.toHaveBeenCalled();
      expect(removeSpy3).not.toHaveBeenCalled();
      // Advance to the point where the first entry should be removed
      jasmine.clock().tick(2 * 60 * 1000 + 1);
      await service.removeExpiredCacheEntries();
      expect(removeSpy1).toHaveBeenCalledTimes(1);
      expect(removeSpy2).not.toHaveBeenCalled();
      expect(removeSpy3).not.toHaveBeenCalled();
      // Make sure the entry was actually removed
      expect(cache.has('NCT00000001')).toBeFalse();
      // And that the others weren't
      expect(cache.has('NCT00000002')).toBeTrue();
      expect(cache.has('NCT00000003')).toBeTrue();
      // And tick forward to where everything should be cleared
      jasmine.clock().tick(5 * 60 * 1000);
      await service.removeExpiredCacheEntries();
      expect(removeSpy1).toHaveBeenCalledTimes(1);
      expect(removeSpy2).toHaveBeenCalledTimes(1);
      expect(removeSpy3).toHaveBeenCalledTimes(1);
      // Cache should now be empty
      expect(cache.size).toEqual(0);
    });
  });

  describe('#downloadTrials', () => {
    let scope: nock.Scope;
    let interceptor: nock.Interceptor;
    let downloader: ctg.ClinicalTrialsGovService;
    const nctIDs = ['NCT00000001', 'NCT00000002', 'NCT00000003'];
    beforeEach(() => {
      scope = nock('https://clinicaltrials.gov');
      interceptor = scope.get('/ct2/download_studies?term=' + nctIDs.join('+OR+'));
      return ctg.createClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS }).then((service) => {
        downloader = service;
      });
    });

    it('handles failures from https.get', () => {
      interceptor.replyWithError('Test error');
      return expectAsync(downloader['downloadTrials'](nctIDs)).toBeRejectedWithError('Test error');
    });

    it('handles failure responses from the server', () => {
      interceptor.reply(404, 'Unknown');
      // Pretend the middle entry exists
      downloader['cache'].set(nctIDs[1], new ctg.CacheEntry(downloader, nctIDs[1] + '.xml', {}));
      return expectAsync(
        downloader['downloadTrials'](nctIDs).finally(() => {
          expect(scope.isDone()).toBeTrue();
        })
      )
        .toBeRejected()
        .then(() => {
          // Check to make sure the new cache entries do not still exist - the failure should remove them, but not the
          // non-pending one
          expect(downloader['cache'].has(nctIDs[0])).toBeFalse();
          expect(downloader['cache'].has(nctIDs[2])).toBeFalse();
        });
    });

    it('creates cache entries', () => {
      interceptor.reply(200, 'Unimportant', { 'Content-type': 'application/zip' });
      // For this test, create an existing cache entry for one of the IDs
      downloader['cache'].set(nctIDs[1], new ctg.CacheEntry(downloader, nctIDs[1] + '.xml', {}));
      // Also mock the extraction process so it thinks everything is fine
      downloader['extractResults'] = () => {
        // Grab cache entries for our NCTs and say they've been resolved
        for (const id of nctIDs) {
          const entry = downloader['cache'].get(id);
          expect(entry).toBeDefined();
          if (entry) {
            // Indicate that the entry is found
            entry.found();
          }
        }
        // Only mark entry 1 ready
        const entry = downloader['cache'].get(nctIDs[1]);
        if (entry) {
          entry.ready();
        }
        return Promise.resolve();
      };
      return expectAsync(downloader['downloadTrials'](nctIDs))
        .toBeResolved()
        .then(() => {
          // Should have created the two missing items which should still be pending as we mocked the extract process
          let entry = downloader['cache'].get(nctIDs[0]);
          expect(entry && entry.pending).toBeTrue();
          entry = downloader['cache'].get(nctIDs[1]);
          expect(entry && !entry.pending).toBeTrue();
          entry = downloader['cache'].get(nctIDs[2]);
          expect(entry && entry.pending).toBeTrue();
        });
    });

    it('extracts a ZIP', () => {
      interceptor.reply(200, 'Unimportant', {
        'Content-type': 'application/zip'
      });
      const spy = jasmine.createSpy('extractResults').and.callFake((): Promise<void> => {
        // Grab cache entries for our NCTs and say they've been resolved
        for (const id of nctIDs) {
          const entry = downloader['cache'].get(id);
          expect(entry).toBeDefined();
          if (entry) {
            entry.found();
            entry.ready();
          }
        }
        return Promise.resolve();
      });
      // Jam the spy in (method is protected, that's why it can't be created directly)
      downloader['extractResults'] = spy;
      return expectAsync(
        downloader['downloadTrials'](nctIDs).finally(() => {
          // Just check that it was called
          expect(spy).toHaveBeenCalledTimes(1);
          expect(scope.isDone()).toBeTrue();
        })
      ).toBeResolved();
    });

    it('invalidates cache entries that were not found in the downloaded ZIP', () => {
      // This is kind of complicated, but basically, we need to have it "create" the entries for the NCT IDs, but then
      // have extractResults "not create" some of the entries.
      interceptor.reply(200, 'Unimportant', {
        'Content-type': 'application/zip'
      });
      const spy = jasmine.createSpy('extractResults').and.callFake((): Promise<void> => {
        // For this test, we only mark one OK
        const entry = downloader['cache'].get(nctIDs[1]);
        expect(entry).toBeDefined();
        if (entry) {
          entry.found();
          entry.ready();
        }
        return Promise.resolve();
      });
      // Jam the spy in (method is protected, that's why it can't be created directly)
      downloader['extractResults'] = spy;
      return expectAsync(downloader['downloadTrials'](nctIDs)).toBeResolved().then(() => {
        // The failed NCT IDs should be removed at this point
        expect(downloader['cache'].has(nctIDs[0])).toBeFalse();
        expect(downloader['cache'].has(nctIDs[1])).toBeTrue();
        expect(downloader['cache'].has(nctIDs[2])).toBeFalse();
      });
    });
  });

  describe('#extractResults', () => {
    let downloader: ctg.ClinicalTrialsGovService;
    beforeEach(() => {
      return ctg.createClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS }).then((service) => {
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
      return expectAsync(
        downloader['extractResults'](fs.createReadStream(specFilePath('resource.json')))
      ).toBeRejected();
    });

    it('deletes the temporary ZIP', () => {
      // Spy on the unlink method
      const unlink = (spyOn(cacheFS, 'unlink') as jasmine.Spy).and.callFake(
        (_path: string, callback: fs.NoParamCallback) => {
          callback(null);
        }
      );
      // Don't actually do anything
      downloader['extractZip'] = jasmine.createSpy('extractZip').and.callFake(() => {
        return Promise.resolve();
      });
      return expectAsync(downloader['extractResults'](stream.Readable.from('Test')))
        .toBeResolved()
        .then(() => {
          expect(unlink).toHaveBeenCalledTimes(1);
        });
    });

    it('handles deleting the temporary ZIP failing', () => {
      // Spy on the unlink method
      (spyOn(cacheFS, 'unlink') as jasmine.Spy).and.callFake((_path: string, callback: fs.NoParamCallback) => {
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
      return ctg.createClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS }).then((service) => {
        downloader = service;
      });
    });
    it('handles a file that does not exist', () => {
      // Intentionally call private method (this is a test after all)
      return expectAsync(downloader.getCachedClinicalStudy('this is an invalid id')).toBeResolvedTo(null);
    });

    it('invokes the load method of the cache entry', () => {
      // Force in a "fake" cache entry
      const entry = new ctg.CacheEntry(downloader, 'test', {});
      const study = createClinicalStudy();
      const spy = spyOn(entry, 'load').and.callFake(() => {
        return Promise.resolve(study);
      });
      downloader['cache'].set('test', entry);
      return expectAsync(downloader.getCachedClinicalStudy('test'))
        .toBeResolvedTo(study)
        .then(() => {
          // Make sure the spy was called once
          expect(spy).toHaveBeenCalledOnceWith();
        });
    });
  });

  describe('#ensureTrialsAvailable()', () => {
    // Most of these tests just pass through to downloadTrials
    let service: ctg.ClinicalTrialsGovService;
    let downloadTrials: jasmine.Spy<(ids: string[]) => Promise<void>>;
    beforeEach(() => {
      service = new ctg.ClinicalTrialsGovService(dataDirPath, { fs: cacheFS });
      // Can't directly spy on within TypeScript because downloadTrials is protected
      const spy = jasmine.createSpy<(ids: string[]) => Promise<void>>('downloadTrials');
      // Jam it in
      service['downloadTrials'] = spy;
      downloadTrials = spy;
      downloadTrials.and.callFake(() => Promise.resolve());
    });

    it('excludes invalid NCT numbers in an array of strings', () => {
      return expectAsync(service.ensureTrialsAvailable(['NCT00000001', 'NCT00000012', 'invalid', 'NCT01234567']))
        .toBeResolved()
        .then(() => {
          expect(downloadTrials).toHaveBeenCalledOnceWith(['NCT00000001', 'NCT00000012', 'NCT01234567']);
        });
    });

    it('pulls NCT numbers out of given ResearchStudy objects', () => {
      return expectAsync(
        service.ensureTrialsAvailable([
          createResearchStudy('test1', 'NCT00000001'),
          createResearchStudy('test2', 'NCT12345678'),
          createResearchStudy('no-nct')
        ])
      )
        .toBeResolved()
        .then(() => {
          expect(downloadTrials).toHaveBeenCalledOnceWith(['NCT00000001', 'NCT12345678']);
        });
    });
  });

  describe('#extractZip', () => {
    // For this set of tests, we don't want to *really* do any unzipping, so we set up a bunch of mocks on Yauzl to
    // simulate the process.
    let openSpy: jasmine.Spy<{
      (path: string, options: yauzl.Options, callback?: (err?: Error, zipfile?: yauzl.ZipFile) => void): void;
    }>;
    let service: ctg.ClinicalTrialsGovService;
    beforeEach(() => {
      openSpy = spyOn(yauzl, 'open');
      service = new ctg.ClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS });
    });

    it('rejects on error', () => {
      openSpy.and.callFake((path, options, callback) => {
        if (callback) callback(new Error('Simulated error'));
      });
      return expectAsync(service['extractZip']('test.zip')).toBeRejectedWithError('Simulated error');
    });

    it('rejects if called with nothing', () => {
      // This should never really happen, but make sure it's handled if it does
      openSpy.and.callFake((path, options, callback) => {
        if (callback) callback();
      });
      return expectAsync(service['extractZip']('test.zip')).toBeRejected();
    });

    describe('with a ZIP', () => {
      // This sub-group of tasks requires a mock ZIP file
      let mockZipFile: yauzl.ZipFile;
      beforeEach(() => {
        const mockObj = new EventEmitter();
        // This is a partial implementation to avoid actual file system access
        mockZipFile = mockObj as unknown as yauzl.ZipFile;
        mockZipFile.close = () => {
          /* no-op */
        };
      });

      it('rejects on error', () => {
        // Simulate error on first readEntry
        mockZipFile.readEntry = () => {
          mockZipFile.emit('error', new Error('Simulated error'));
        };
        openSpy.and.callFake((path, options, callback) => {
          if (callback) {
            callback(undefined, mockZipFile);
          }
        });
        return expectAsync(service['extractZip']('test.zip')).toBeRejectedWithError('Simulated error');
      });

      describe('with an entry', () => {
        let entry: yauzl.Entry;
        let entries: yauzl.Entry[];
        let currentIndex: number;
        // To make the test easier, this is the method called with the callback
        let openReadStream: (callback: (err?: Error, stream?: stream.Readable) => void) => void;
        const mockNctNumber: ctg.NCTNumber = 'NCT12345678';

        beforeEach(() => {
          // Each test requires a test entry although the exact details vary
          // This is an intentionally incomplete entry.
          const mockEntry = {
            comment: '',
            compressedSize: 4,
            fileName: mockNctNumber + '.xml',
            fileNameLength: mockNctNumber.length + 4,
            uncompressedSize: 4
          };

          // This is intentionally not a full mock implementation
          entry = mockEntry as unknown as yauzl.Entry;
          entries = [entry];
          currentIndex = 0;
          // Also need to install a fake openReadStream
          mockZipFile.openReadStream = (
            entry: yauzl.Entry,
            callbackOrOptions: yauzl.ZipFileOptions | ((err?: Error, stream?: stream.Readable) => void),
            callbackOrNothing?: (err?: Error, stream?: stream.Readable) => void
          ) => {
            // Don't actually care about the options
            let callback: (err?: Error, stream?: stream.Readable) => void;
            if (callbackOrNothing) {
              callback = callbackOrNothing;
            } else if (typeof callbackOrOptions === 'function') {
              callback = callbackOrOptions;
            } else {
              // invalid, unclear how this is handled, but throw an error
              throw new Error('missing callback');
            }
            openReadStream(callback);
          };
          // By default, make it so that openReadStream returns a stream that reads the string "test"
          openReadStream = (callback) => {
            callback(
              undefined,
              new stream.Readable({
                read: function () {
                  this.push(Buffer.from('test', 'utf-8'));
                }
              })
            );
          };

          // All these require an openSpy that forwards our mock ZIP file
          openSpy.and.callFake((path, options, callback) => {
            if (callback) {
              callback(undefined, mockZipFile);
            }
          });

          // Fake read entry implementation
          mockZipFile.readEntry = () => {
            if (currentIndex < entries.length) {
              const e = entries[currentIndex];
              currentIndex++;
              mockZipFile.emit('entry', e);
            } else {
              mockZipFile.emit('end');
            }
          };
        });

        describe('skips entries with', () => {
          let openReadStreamSpy: jasmine.Spy<{
            (
              entry: yauzl.Entry,
              options: yauzl.ZipFileOptions,
              callback: (err?: Error, stream?: stream.Readable) => void
            ): void;
            (entry: yauzl.Entry, callback: (err?: Error, stream?: stream.Readable) => void): void;
          }>;
          beforeEach(() => {
            openReadStreamSpy = spyOn(mockZipFile, 'openReadStream');
            // Should this somehow be called, have it invoke the already stubbed test method to ensure that the tests don't hang
            openReadStreamSpy.and.callThrough();
          });

          function expectEntrySkipped(): PromiseLike<void> {
            return expectAsync(service['extractZip']('test.zip'))
              .toBeResolved()
              .then(() => {
                expect(openReadStreamSpy).not.toHaveBeenCalled();
              });
          }

          it('excessively large entry', () => {
            entry.uncompressedSize = service.maxAllowedEntrySize + 1;
            return expectEntrySkipped();
          });

          it('no extension', () => {
            entry.fileName = 'invalid';
            return expectEntrySkipped();
          });

          it('an invalid extension', () => {
            entry.fileName = 'NCT12345678.txt';
            return expectEntrySkipped();
          });

          it('the filename ".xml"', () => {
            entry.fileName = '.xml';
            return expectEntrySkipped();
          });

          it('an invalid NCT number', () => {
            entry.fileName = 'NCT incorrect.xml';
            return expectEntrySkipped();
          });
        });

        describe('extracting an entry', () => {
          let addCacheEntrySpy: jasmine.Spy;
          beforeEach(() => {
            // Allow the any here so we can install the spy on a private method - there's no other way around this
            // without really messy code
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            addCacheEntrySpy = spyOn<any>(service, 'addCacheEntry');
          });

          it('adds to cache on success', () => {
            addCacheEntrySpy.and.callFake(() => {
              // We need to return a promise that resolves or the entire thing won't resolve
              return Promise.resolve();
            });
            return expectAsync(service['extractZip']('test.zip'))
              .toBeResolved()
              .then(() => {
                expect(addCacheEntrySpy).toHaveBeenCalled();
                // Make sure it was called with the correct NCT ID
                expect(addCacheEntrySpy.calls.first().args[0]).toEqual(mockNctNumber);
              });
          });

          it('handles the parse failing', () => {
            addCacheEntrySpy.and.callFake(() => {
              return Promise.reject(new Error('Simulated parse failure'));
            });
            // This should still resolve successfully - parse failures are logged but otherwise skipped
            return expectAsync(service['extractZip']('test.zip'))
              .toBeResolved()
              .then(() => {
                expect(addCacheEntrySpy).toHaveBeenCalled();
                // Make sure it was called with the correct NCT ID
                expect(addCacheEntrySpy.calls.first().args[0]).toEqual(mockNctNumber);
              });
          });
        });

        it('handles an entry failing to extract', () => {
          openReadStream = (callback) => {
            callback(new Error('Simulated error'));
          };
          return expectAsync(service['extractZip']('test.zip')).toBeResolved();
        });

        it('handles the callback being invoked incorrectly', () => {
          // Invoking the callback with nothing should never happen, but if it does, expect it to resolve anyway
          openReadStream = (callback) => {
            callback();
          };
          return expectAsync(service['extractZip']('test.zip')).toBeResolved();
        });
      });
    });
  });

  describe('#addCacheEntry', () => {
    // addCacheEntry is responsible for taking a stream of data and writing it to a single file.
    let service: ctg.ClinicalTrialsGovService;
    let mockEntryStream: stream.Readable;
    let mockFileStream: stream.Writable;
    const mockNctNumber: ctg.NCTNumber = 'NCT12345678';

    beforeEach(() => {
      service = new ctg.ClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS });
      // The mock entry stream is a "real" stream
      // It has to be capable of reading a single chunk
      let chunk: Buffer | null = Buffer.from('Test', 'utf-8');
      mockEntryStream = new stream.Readable({
        // Note that this cannot be an arrow function because this must be the stream
        read: function () {
          this.push(chunk);
          // Pushing null indicates end of stream - so set the chunk to null so the next read ends the stream
          chunk = null;
        }
      });
      mockFileStream = new stream.Writable({
        write: function (chunk, encoding, callback) {
          // Must invoke the callback or things will freeze
          callback();
        },
        final: function (callback) {
          callback();
        }
      });
      spyOn(cacheFS, 'createWriteStream').and.callFake(() => {
        // Pretend this is a file stream for TypeScript - it doesn't really matter
        return mockFileStream as unknown as fs.WriteStream;
      });
    });

    // There is a matrix of three entry states (existing pending, exists non-pending, does not exist) and two stream
    // cases (succeeds, fails) that needs to be handled.

    // So to deal with that, create a function that creates the tests, and a flag indicating which test was running
    let errorTest = false;

    const makeTests = function () {
      it('handles an error', () => {
        errorTest = true;
        // Replace the write method with one that will throw a mock error
        mockFileStream._write = (chunk, encoding, callback) => {
          callback(new Error('Simulated I/O error'));
        };
        return expectAsync(service['addCacheEntry'](mockNctNumber, mockEntryStream)).toBeRejected();
      });

      it('handles writing the entry', () => {
        errorTest = false;
        return expectAsync(service['addCacheEntry'](mockNctNumber, mockEntryStream)).toBeResolved();
      });
    };

    describe('with no entry', () => {
      // Nothing to do here
      makeTests();
    });

    describe('with an existing pending entry', () => {
      let entry: ctg.CacheEntry;
      let readySpy: jasmine.Spy;
      beforeEach(() => {
        entry = new ctg.CacheEntry(service, mockNctNumber + '.xml', { pending: true });
        // Add the entry
        service['cache'].set(mockNctNumber, entry);
        // We want to see if ready is invoked but also have it work as expected
        readySpy = spyOn(entry, 'ready').and.callThrough();
      });
      afterEach(() => {
        if (errorTest) {
          // Expect the cache entry to have been removed
          expect(service['cache'].has(mockNctNumber)).toBeFalse();
          // Ready should not have been called in this case
          expect(readySpy).not.toHaveBeenCalled();
        } else {
          // Otherwise, expect the entry to be ready
          expect(readySpy).toHaveBeenCalled();
        }
      });

      // And make the tests
      makeTests();
    });

    describe('with an existing non-pending entry', () => {
      let entry: ctg.CacheEntry;
      let readySpy: jasmine.Spy;
      beforeEach(() => {
        entry = new ctg.CacheEntry(service, mockNctNumber + '.xml', {});
        // Add the entry
        service['cache'].set(mockNctNumber, entry);
        // In this case we just want to know if ready was not invoked as it shouldn't be
        readySpy = spyOn(entry, 'ready').and.callThrough();
      });
      afterEach(() => {
        if (errorTest) {
          // Expect the cache entry to remain - it's assumed the existing entry is still OK (this may be false?)
          expect(service['cache'].has(mockNctNumber)).toBeTrue();
        }
        // In either case, ready should not have been called
        expect(readySpy).not.toHaveBeenCalled();
      });

      // And make the tests
      makeTests();
    });
  });

  describe('#updateResearchStudy', () => {
    it('forwards to updateResearchStudyWithClinicalStudy', () => {
      const service = new ctg.ClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS });
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
      downloader = new ctg.ClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS });
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

    it('fills in categories', () => {
      expect(updatedTrial.category).toBeDefined();
      if (updatedTrial.category) {
        expect(updatedTrial.category.length).toEqual(5);
        const categories = updatedTrial.category.map((item) => item.text);
        expect(categories).toHaveSize(5);
        expect(categories).toEqual(
          jasmine.arrayContaining([
            'Study Type: Interventional',
            'Intervention Model: Parallel Assignment',
            'Primary Purpose: Treatment',
            'Masking: None (Open Label)',
            'Allocation: Randomized'
          ])
        );
      }
    });

    it('does not overwrite existing categories', () => {
      const researchStudy = new ResearchStudyObj('id');
      researchStudy.category = [{ text: 'Study Type: Example' }];

      ctg.updateResearchStudyWithClinicalStudy(researchStudy, {
        study_type: ['Interventional'],
        study_design_info: [
          {
            intervention_model: ['Parallel Assignment'],
            primary_purpose: ['Treatment'],
            masking: ['None (Open Label)'],
            allocation: ['Randomized'],
            time_perspective: ['Example'],
            observational_model: ['Something']
          }
        ]
      });

      expect(researchStudy.category).toBeDefined();
      if (researchStudy.category) {
        expect(researchStudy.category).toHaveSize(7);
        const categories = researchStudy.category.map((item) => item.text);
        expect(categories).toHaveSize(7);
        expect(categories).toEqual(
          jasmine.arrayContaining([
            'Study Type: Example',
            'Intervention Model: Parallel Assignment',
            'Primary Purpose: Treatment',
            'Masking: None (Open Label)',
            'Allocation: Randomized',
            'Time Perspective: Example',
            'Observation Model: Something'
          ])
        );
      }
    });

    it('will retain old categories if not part of standard study design', () => {
      const researchStudy = new ResearchStudyObj('id');
      // Empty category but there is an object there for the sake of this test.
      researchStudy.category = [{}];

      ctg.updateResearchStudyWithClinicalStudy(researchStudy, {
        study_type: ['Interventional']
      });

      expect(researchStudy.category).toBeDefined();
      if (researchStudy.category) {
        expect(researchStudy.category).toHaveSize(2);
      }
    });

    it('fills in arms', () => {
      expect(updatedTrial.arm).toBeDefined();
      if (updatedTrial.arm) {
        expect(updatedTrial.arm).toHaveSize(2);
        expect(updatedTrial.arm).toEqual(
          jasmine.arrayContaining([
            jasmine.objectContaining({
              name: 'Arm A',
              type: {
                coding: jasmine.arrayContaining([{ code: 'Experimental', display: 'Experimental' }]),
                text: 'Experimental'
              },
              description:
                'Palbociclib at a dose of 125 mg orally once daily, Day 1 to Day 21 followed by 7 days off treatment in a 28-day cycle for a total duration of 2 years, in addition to standard adjuvant endocrine therapy for a duration of at least 5 years.'
            }),
            jasmine.objectContaining({
              name: 'Arm B',
              type: { coding: jasmine.arrayContaining([{ code: 'Other', display: 'Other' }]), text: 'Other' },
              description: 'Standard adjuvant endocrine therapy for a duration of at least 5 years.'
            })
          ])
        );
      }
    });

    it('fills in protocol with interventions and arm references', () => {
      expect(updatedTrial.protocol).toBeDefined();
      if (updatedTrial.protocol) {
        expect(updatedTrial.protocol).toHaveSize(3);
        const references: PlanDefinition[] = [];
        for (const plan of updatedTrial.protocol) {
          if (plan.reference && plan.reference.length > 1) {
            const intervention: PlanDefinition = getContainedResource(
              updatedTrial,
              plan.reference.substring(1)
            ) as PlanDefinition;
            if (intervention) references.push(intervention);
          } else {
            fail('PlanDefinition not defined for intervention');
          }
        }

        try {
          const titles = references.map((item) => item.title);
          const types = references.map((item) => (item.type ? item.type.text : null));
          const subjects = references.map((item) =>
            item.subjectCodeableConcept ? item.subjectCodeableConcept.text : null
          );

          expect(titles).toEqual(
            jasmine.arrayContaining([
              'Palbociclib',
              'Standard Adjuvant Endocrine Therapy',
              'Standard Adjuvant Endocrine Therapy'
            ])
          );
          expect(types).toEqual(jasmine.arrayContaining(['Drug', 'Drug', 'Drug']));
          expect(subjects).toEqual(jasmine.arrayContaining(['Arm A', 'Arm A', 'Arm B']));
        } catch (err) {
          fail(err);
        }
      }
    });

    it('fills in interventions even without arms', () => {
      const researchStudy = new ResearchStudyObj('id');
      const result = ctg.updateResearchStudyWithClinicalStudy(researchStudy, {
        intervention: [
          {
            intervention_type: ['Behavioral'],
            intervention_name: ['Name'],
            description: ['Description'],
            other_name: ['Other name']
          }
        ]
      });

      expect(result.protocol).toBeDefined();
      expect(result.protocol).toHaveSize(1);

      if (result.protocol && result.protocol.length > 0) {
        if (result.protocol[0].reference && result.protocol[0].reference.length > 1) {
          const intervention: PlanDefinition = getContainedResource(
            result,
            result.protocol[0].reference.substring(1)
          ) as PlanDefinition;
          expect(intervention).toEqual(
            jasmine.objectContaining({
              resourceType: 'PlanDefinition',
              status: 'unknown',
              description: 'Description',
              title: 'Name',
              subtitle: 'Other name',
              type: { text: 'Behavioral' }
            })
          );
        }
      }
    });

    it('fills in interventions with description and subtitle', () => {
      const researchStudy = new ResearchStudyObj('id');
      const result = ctg.updateResearchStudyWithClinicalStudy(researchStudy, {
        intervention: [
          {
            intervention_type: ['Behavioral'],
            intervention_name: ['Name'],
            description: ['Description'],
            other_name: ['Other name'],
            arm_group_label: ['Arm']
          }
        ]
      });

      expect(result.protocol).toBeDefined();
      expect(result.protocol).toHaveSize(1);

      if (result.protocol && result.protocol.length > 0) {
        if (result.protocol[0].reference && result.protocol[0].reference.length > 1) {
          const intervention: PlanDefinition = getContainedResource(
            result,
            result.protocol[0].reference.substring(1)
          ) as PlanDefinition;
          expect(intervention).toEqual(
            jasmine.objectContaining({
              resourceType: 'PlanDefinition',
              status: 'unknown',
              description: 'Description',
              title: 'Name',
              subtitle: 'Other name',
              type: { text: 'Behavioral' },
              subjectCodeableConcept: { text: 'Arm' }
            })
          );
        }
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
          overall_status: ['something invalid' as unknown as StatusEnum]
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

    it('fills in contact', () => {
      const researchStudy = new ResearchStudyObj('id');
      const result = ctg.updateResearchStudyWithClinicalStudy(researchStudy, {
        overall_contact: [
          {
            first_name: ['First'],
            middle_name: ['Middle'],
            last_name: ['Last'],
            degrees: ['MD'],
            phone: ['1112223333'],
            email: ['email@example.com']
          }
        ],
        overall_contact_backup: [
          {
            first_name: ['First2'],
            middle_name: ['Middle2'],
            last_name: ['Last2'],
            degrees: ['DO'],
            phone: ['1234567890'],
            email: ['email2@example.com']
          }
        ]
      });

      expect(result.contact).toBeDefined();
      if (result.contact) {
        expect(result.contact).toHaveSize(2);
        expect(result.contact).toEqual(
          jasmine.arrayContaining([
            jasmine.objectContaining({
              name: 'First Middle Last, MD',
              telecom: [
                { system: 'email', value: 'email@example.com', use: 'work' },
                { system: 'phone', value: '1112223333', use: 'work' }
              ]
            }),
            jasmine.objectContaining({
              name: 'First2 Middle2 Last2, DO',
              telecom: [
                { system: 'email', value: 'email2@example.com', use: 'work' },
                { system: 'phone', value: '1234567890', use: 'work' }
              ]
            })
          ])
        );
      }
    });

    it('fills in contacts even with missing information', () => {
      const researchStudy = new ResearchStudyObj('id');
      const result = ctg.updateResearchStudyWithClinicalStudy(researchStudy, {
        overall_contact: [
          {
            first_name: ['First'],
            last_name: ['Last'],
            email: ['email@example.com']
          }
        ],
        overall_contact_backup: [
          {
            middle_name: ['Middle2'],
            degrees: ['DO'],
            phone: ['1234567890']
          }
        ]
      });

      expect(result.contact).toBeDefined();
      if (result.contact) {
        expect(result.contact).toHaveSize(2);
        expect(result.contact).toEqual(
          jasmine.arrayContaining([
            jasmine.objectContaining({
              name: 'First Last',
              telecom: [{ system: 'email', value: 'email@example.com', use: 'work' }]
            }),
            jasmine.objectContaining({
              name: ' Middle2, DO',
              telecom: [{ system: 'phone', value: '1234567890', use: 'work' }]
            })
          ])
        );
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
