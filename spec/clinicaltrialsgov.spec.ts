import { ResearchStudy } from 'fhir/r4';
import * as ctg from '../src/clinicaltrialsgov';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as nock from 'nock';
import { Volume } from 'memfs';

// Trial missing summary, inclusion/exclusion criteria, phase and study type
import * as trialMissing from './data/resource.json';
import { createClinicalStudy } from './support/clinicalstudy-factory';
import { createResearchStudy } from './support/researchstudy-factory';
import { PagedStudies, Study } from '../src/ctg-api';

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

describe('.parseStudyJson', () => {
  let loggerSpy: jasmine.Spy<(message: string, ...rest: unknown[])=>void>;
  let study: Study | null | undefined;
  beforeEach(() => {
    loggerSpy = jasmine.createSpy('log');
    study = undefined;
  });

  const makeTests = (testData: string, loggerShouldBeCalled: boolean) => {
    it ('without a logger', () => {
      study = ctg.parseStudyJson(testData);
    });

    it('with a logger', () => {
      study = ctg.parseStudyJson(testData, loggerSpy);
      if (loggerShouldBeCalled) {
        expect(loggerSpy).toHaveBeenCalled();
      } else {
        expect(loggerSpy).not.toHaveBeenCalled();
      }
    });
  }

  describe('parses valid study JSON', () => {
    const testJsonString = fs.readFileSync(specFilePath('NCT02513394.json'), 'utf8');

    afterEach(() => {
      expect(study).toBeDefined();
      expect(study).not.toBeNull();
    });

    makeTests(testJsonString, false);
  });

  describe('handles invalid contents', () => {
    afterEach(() => {
      expect(study).toBeDefined();
      expect(study).toBeNull();
    });

    describe('(not JSON)', () => {
      makeTests('this is not JSON', true);
    });
    describe('(JSON is "null")', () => {
      makeTests('null', false);
    });
    describe('(JSON is not an object)', () => {
      makeTests('[{}]', true);
    });
  });
});

describe('.findNCTNumber', () => {
  it('finds an NCT number with the proper coding system', () => {
    expect(
      ctg.findNCTNumber({
        resourceType: 'ResearchStudy',
        status: 'active',
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
        status: 'active',
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
        status: 'active',
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
        status: 'active',
        identifier: []
      })
    ).toBeNull();
    expect(ctg.findNCTNumber({ resourceType: 'ResearchStudy', status: 'active' })).toBeNull();
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

describe('parseStudyJson', () => {
  it('rejects invalid JSON', () => {
    expect(ctg.parseStudyJson('true')).toBeNull();
  });
  it('logs failures', () => {
    const log = jasmine.createSpy('log');
    expect(ctg.parseStudyJson('not valid JSON', log)).toBeNull();
    expect(log).toHaveBeenCalled();
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
      if (createdAt) createdAt.setMonth(5);
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
  let study: ResearchStudy;
  // Create our mock FS
  const cacheVol = Volume.fromNestedJSON({
    '/ctg-cache/data/NCT02513394.json': fs.readFileSync(specFilePath('NCT02513394.json'), { encoding: 'utf8' }),
    '/existing-file': 'Existing stub',
    '/ctg-cache-multi/data': {
      'NCT00000001.json': 'Test File 1',
      'NCT00000002.json': 'Test File 2',
      'NCT00000003.json': 'Test File 3',
      // Junk files: files that should be skipped on init
      '.json': 'not really a JSON file, but a dot file called "json"',
      'invalid.json': 'not an NCT',
      'NCT1.json': 'not a valid NCT'
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
    }
    // Create an empty directory
    cacheVol.mkdirSync('/ctg-cache-empty');
    // Update mtimes for files
    // Mock file that was created 1 minute after cache was created
    let time = new Date(cacheStartTime.getTime() + 60 * 1000);
    cacheVol.utimesSync('/ctg-cache-multi/data/NCT00000001.json', time, time);
    // Mock file that was created 1.5 minutes after cache was created
    time = new Date(cacheStartTime.getTime() + 90 * 1000);
    cacheVol.utimesSync('/ctg-cache-multi/data/NCT00000002.json', time, time);
    // Mock file that was created 2 minutes after cache was created
    time = new Date(cacheStartTime.getTime() + 2 * 60 * 1000);
    cacheVol.utimesSync('/ctg-cache-multi/data/NCT00000003.json', time, time);
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
        service.updateResearchStudies([{ resourceType: 'ResearchStudy', status: 'active' }]).then(() => {
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
    beforeEach(async () => {
      scope = nock('https://clinicaltrials.gov');
      interceptor = scope.get(`/api/v2/studies?filter.ids=${nctIDs.join(',')}&pageSize=128`);
      // Need to intercept the writeFile method
      spyOn(cacheFS, 'writeFile').and.callFake((_file, _data, _options, callback) => {
        // For these, always pretend it succeeded
        callback(null);
      });
      downloader = await ctg.createClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS });
    });

    afterEach(() => {
      scope.done();
    });

    it('handles failures from https.get', async () => {
      interceptor.replyWithError('Test error');
      expect(await downloader['downloadTrials'](nctIDs)).toBeFalse();
    });

    it('handles failure responses from the server', async () => {
      interceptor.reply(404, 'Unknown');
      // Pretend the middle entry exists
      downloader['cache'].set(nctIDs[1], new ctg.CacheEntry(downloader, nctIDs[1] + '.json', {}));
      expect(await downloader['downloadTrials'](nctIDs)).withContext('downloader indicates failure').toBeFalse();
      // Check to make sure the new cache entries do not still exist - the failure should remove them, but not the
      // non-pending one
      expect(downloader['cache'].has(nctIDs[0])).withContext('cache entry 0').toBeFalse();
      expect(downloader['cache'].has(nctIDs[1])).withContext('cache entry 1').toBeTrue();
      expect(downloader['cache'].has(nctIDs[2])).withContext('cache entry 2').toBeFalse();
    });

    it('creates cache entries', async () => {
      interceptor.reply(
        200,
        JSON.stringify({
          studies: nctIDs.map<Study>((id) => ({
            protocolSection: {
              identificationModule: {
                nctId: id
              }
            }
          }))
        } as PagedStudies),
        { 'Content-type': 'application/json' }
      );
      // For this test, create an existing cache entry for one of the IDs
      downloader['cache'].set(nctIDs[1], new ctg.CacheEntry(downloader, nctIDs[1] + '.xml', {}));
      expect(await downloader['downloadTrials'](nctIDs)).toBeTrue();

      // Should have created the two missing items which should be resolved
      let entry = downloader['cache'].get(nctIDs[0]);
      expect(entry?.pending).toBeFalse();
      entry = downloader['cache'].get(nctIDs[1]);
      expect(entry?.pending).toBeFalse();
      entry = downloader['cache'].get(nctIDs[2]);
      expect(entry?.pending).toBeFalse();
    });

    it('invalidates cache entries that were not found in the results', async () => {
      interceptor.reply(
        200,
        JSON.stringify({
          // Only include NCT ID 1
          studies: [
            {
              protocolSection: {
                identificationModule: {
                  nctId: nctIDs[1]
                }
              }
            }
          ]
        } as PagedStudies),
        { 'Content-type': 'application/json' }
      );
      expect(await downloader['downloadTrials'](nctIDs)).toBeTrue();
      // The failed NCT IDs should be removed at this point
      expect(downloader['cache'].has(nctIDs[0])).toBeFalse();
      expect(downloader['cache'].has(nctIDs[1])).toBeTrue();
      expect(downloader['cache'].has(nctIDs[2])).toBeFalse();
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
    let downloadTrials: jasmine.Spy<(ids: string[]) => Promise<boolean>>;
    beforeEach(() => {
      service = new ctg.ClinicalTrialsGovService(dataDirPath, { fs: cacheFS });
      // Can't directly spy on within TypeScript because downloadTrials is protected
      const spy = jasmine.createSpy<(ids: string[]) => Promise<boolean>>('downloadTrials');
      // Jam it in
      service['downloadTrials'] = spy;
      downloadTrials = spy;
      downloadTrials.and.callFake(() => Promise.resolve(true));
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

  describe('#addCacheEntry', () => {
    // addCacheEntry is responsible for saving a single Study object to a file
    // There is a matrix of three entry states (existing pending, exists non-pending, does not exist) and two stream
    // cases (succeeds, fails) that needs to be handled.
    let service: ctg.ClinicalTrialsGovService;
    // Error to use
    let writeError: Error | null;
    let writeFileSpy: jasmine.Spy;
    const mockNctNumber = 'NCT12345678';
    const testStudy: Study = { protocolSection: { identificationModule: { nctId: mockNctNumber } } };

    beforeEach(() => {
      service = new ctg.ClinicalTrialsGovService(dataDirPath, { cleanInterval: 0, fs: cacheFS });

      writeError = null;
      writeFileSpy = spyOn(cacheFS, 'writeFile').and.callFake((file, data, options, callback) => {
        // Just need to invoke the callback to pretend this has completed.
        callback(writeError);
      });
    });

    const makeTests = function () {
      it('handles an error', async () => {
        writeError = new Error('Test error');
        await expectAsync(service['addCacheEntry'](testStudy)).toBeRejected();
      });

      it('handles writing the entry', async () => {
        writeError = null;
        await service['addCacheEntry'](testStudy);
        expect(writeFileSpy).toHaveBeenCalled();
      });
    };

    it('with no entry resolves without writing anything', async () => {
      // Make sure that nothing happens when doing this
      await service['addCacheEntry'](testStudy);
      expect(writeFileSpy).not.toHaveBeenCalled();
    });

    it('with a missing NCT number resolves without writing anything', async () => {
      // Everything in the object is optional
      await service['addCacheEntry']({});
      expect(writeFileSpy).not.toHaveBeenCalled();
      // For completeness sake:
      await service['addCacheEntry']({ protocolSection: {} });
      expect(writeFileSpy).not.toHaveBeenCalled();
      await service['addCacheEntry']({ protocolSection: { identificationModule: {} } });
      expect(writeFileSpy).not.toHaveBeenCalled();
      // And finally assume something invalid was sent
      await service['addCacheEntry']({ protocolSection: { identificationModule: { nctId: 12 as unknown as string } } });
      expect(writeFileSpy).not.toHaveBeenCalled();
    });

    describe('with an existing pending entry', () => {
      let entry: ctg.CacheEntry;
      let readySpy: jasmine.Spy;
      beforeEach(() => {
        entry = new ctg.CacheEntry(service, mockNctNumber + '.json', { pending: true });
        // Add the entry
        service['cache'].set(mockNctNumber, entry);
        // We want to see if ready is invoked but also have it work as expected
        readySpy = spyOn(entry, 'ready').and.callThrough();
      });
      afterEach(() => {
        if (writeError != null) {
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
        if (writeError != null) {
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
});
