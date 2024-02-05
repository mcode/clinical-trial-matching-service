import { ResearchStudy } from 'fhir/r4';
import * as ctg from '../src/clinicaltrialsgov';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as nock from 'nock';
import * as sqlite from 'sqlite';
import * as sqlite3 from 'sqlite3';

// Trial missing summary, inclusion/exclusion criteria, phase and study type
import { createClinicalStudy } from './support/clinicalstudy-factory';
import { createResearchStudy, createSearchSetEntry } from './support/researchstudy-factory';
import { PagedStudies, Study } from '../src/ctg-api';
import { SearchBundleEntry } from '../src/searchset';

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

describe('.parseNCTNumber', () => {
  it('parses valid numbers', () => {
    expect(ctg.parseNCTNumber('NCT12345678')).toEqual(12345678);
    expect(ctg.parseNCTNumber('NCT00000000')).toEqual(0);
  });
  it('rejects invalid numbers', () => {
    expect(ctg.parseNCTNumber('NCT1234567')).toBeUndefined();
    expect(ctg.parseNCTNumber('NCT123456789')).toBeUndefined();
    expect(ctg.parseNCTNumber('blatantly wrong')).toBeUndefined();
    expect(ctg.parseNCTNumber('')).toBeUndefined();
  });
});

describe('.formatNCTNumber', () => {
  it('formats valid numbers', () => {
    expect(ctg.formatNCTNumber(12345678)).toEqual('NCT12345678');
    expect(ctg.formatNCTNumber(1)).toEqual('NCT00000001');
  });
  it('rejects invalid numbers', () => {
    expect(() => ctg.formatNCTNumber(-1)).toThrow();
    expect(() => ctg.formatNCTNumber(100000000)).toThrow();
  });
});

describe('.parseStudyJson', () => {
  let loggerSpy: jasmine.Spy<(message: string, ...rest: unknown[]) => void>;
  let study: Study | null | undefined;
  beforeEach(() => {
    loggerSpy = jasmine.createSpy('log');
    study = undefined;
  });

  const makeTests = (testData: string, loggerShouldBeCalled: boolean) => {
    it('without a logger', () => {
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
  };

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

async function createMemorySqliteDB(): Promise<sqlite.Database> {
  return await sqlite.open({ filename: ':memory:', driver: sqlite3.Database });
}

/**
 * Creates a ClinicalTrialsGovService that stores data in an in-memory database.
 * @param options options object - if not given, sends a set of options that disables the clean timer
 * @returns
 */
function createMemoryCTGovService(options?: ctg.ClinicalTrialsGovServiceOptions): ctg.ClinicalTrialsGovService {
  return new ctg.ClinicalTrialsGovService(':memory:', options ?? { cleanInterval: 0 });
}

async function insertTestStudy(db: sqlite.Database, nctId: string | number, study?: Study | null): Promise<void> {
  const id = typeof nctId === 'string' ? ctg.parseNCTNumber(nctId) : nctId;
  if (id === undefined) {
    throw new Error(`Internal test error: invalid NCT ID ${nctId}`);
  }
  await db.run(
    'INSERT INTO ctgov_studies (nct_id, study_json, created_at) VALUES (?, ?, ?)',
    id,
    study ? JSON.stringify(study) : study === null ? null : '{"dummyData":true}',
    new Date().valueOf()
  );
}

describe('ClinicalTrialsGovService', () => {
  describe('constructor', () => {
    it('can set a custom logger', () => {
      const customLogger = (): void => {
        // Do nothing
      };
      const instance = createMemoryCTGovService({ log: customLogger });
      expect(instance['log']).toEqual(customLogger);
    });
    it('sets defaults', () => {
      const service = new ctg.ClinicalTrialsGovService(':memory:');
      expect(service.log).not.toBeNull();
      expect(service.expirationTimeout).toEqual(60 * 60 * 1000);
      expect(service.cleanupInterval).toEqual(60 * 60 * 1000);
    });
    it('sets options', () => {
      const service = new ctg.ClinicalTrialsGovService(':memory:', {
        expireAfter: 24 * 60 * 60 * 1000,
        cleanInterval: 0
      });
      expect(service.log).not.toBeNull();
      expect(service.expirationTimeout).toEqual(24 * 60 * 60 * 1000);
      expect(service.cleanupInterval).toEqual(0);
    });
  });

  describe('#maxTrialsPerRequest', () => {
    let service: ctg.ClinicalTrialsGovService;
    beforeEach(() => {
      service = createMemoryCTGovService();
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
      service = createMemoryCTGovService();
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
      service = createMemoryCTGovService();
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
    describe('starts a timer', () => {
      const realTimeout = setTimeout;
      let testService: ctg.ClinicalTrialsGovService;
      let removeExpiredCacheEntries: jasmine.Spy<() => Promise<void>>;
      beforeEach(() => {
        jasmine.clock().install();
        testService = createMemoryCTGovService({ cleanInterval: 60000 });
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
      const testService = createMemoryCTGovService({ cleanInterval: 0 });
      const spy = jasmine.createSpy('setCleanupTimeout');
      await testService.init();
      expect(spy).not.toHaveBeenCalled();
    });

    it('initializes the database tables', async () => {
      const db = await createMemorySqliteDB();
      await ctg.ClinicalTrialsGovService.create(db);
      const tableNames = await db.all<{ name: string }[]>('SELECT name FROM sqlite_schema');
      expect(tableNames).toContain({ name: 'migrations' });
      expect(tableNames).toContain({ name: 'ctgov_studies' });
    });

    it('disallows double calls', async () => {
      const testService = createMemoryCTGovService();
      await testService.init();
      await expectAsync(testService.init()).toBeRejected();
    });

    it('raises an exception on an invalid state', async () => {
      const testService = createMemoryCTGovService();
      // The constructor shouldn't allow this but for typing reasons it needs to be checked anyway
      testService['cacheDBPath'] = null;
      await expectAsync(testService.init()).toBeRejected();
    });

    describe('migrations', () => {
      let db: sqlite.Database;
      let service: ctg.ClinicalTrialsGovService;

      beforeEach(async () => {
        db = await createMemorySqliteDB();
        service = new ctg.ClinicalTrialsGovService(db, { cleanInterval: 0 });
      });

      it("doesn't rerun an already run migration", async () => {
        const migration = jasmine.createSpy('up').and.callFake(() => Promise.resolve());
        const migrations = {
          init: { up: migration }
        };
        await service['migrateDB'](db, migrations);
        expect(migration).toHaveBeenCalledTimes(1);
        await service['migrateDB'](db, migrations);
        expect(migration).toHaveBeenCalledTimes(1);
      });

      it('rolls back on a failed migration', async () => {
        const migration = jasmine.createSpy('up').and.callFake(async (db: sqlite.Database): Promise<void> => {
          // Create a test table
          await db.run('CREATE TABLE test (id INTEGER PRIMARY KEY)');
          throw new Error('Test error');
        });
        const migrations = {
          init: { up: migration }
        };
        await expectAsync(service['migrateDB'](db, migrations)).toBeRejected();
        // Make sure the test table doesn't exist
        expect(await db.get<{ name: string }>("SELECT name FROM sqlite_schema WHERE name='test'")).toBeUndefined();
      });
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
      const testService = createMemoryCTGovService({ cleanInterval: 60000 });
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

    it('closes the database if it opened it', async () => {
      const testService = createMemoryCTGovService();
      await testService.init();
      // Need to spy on the private db field
      const db = testService['cacheDB'];
      expect(db).not.toBeNull();
      if (db != null) {
        const closeSpy = spyOn(db, 'close').and.callThrough();
        await testService.destroy();
        expect(closeSpy).toHaveBeenCalled();
      }
    });

    it('does not close the database if passed a DB to use', async () => {
      const db = await createMemorySqliteDB();
      const closeSpy = spyOn(db, 'close').and.callThrough();
      const testService = new ctg.ClinicalTrialsGovService(db, { cleanInterval: 0 });
      await testService.init();
      await testService.destroy();
      expect(closeSpy).not.toHaveBeenCalled();
    });

    it('does nothing if never started', async () => {
      const testService = createMemoryCTGovService({ cleanInterval: 60000 });
      await testService.destroy();
      // There's nothing to really test other than to ensure it worked
    });
  });

  describe('#getDB', () => {
    // This is an internal private method intended to ensure that methods can't be invoked without the cache being ready
    let service: ctg.ClinicalTrialsGovService;
    beforeEach(() => {
      service = createMemoryCTGovService();
    });

    it('throws an exception if called before init()', () => {
      expect(() => service['getDB']()).toThrow();
    });

    it('throws an exception if called after destroy()', async () => {
      await service.init();
      await service.destroy();
      expect(() => service['getDB']()).toThrow();
    });
  });

  describe('#findCacheMisses', () => {
    let db: sqlite.Database;
    let service: ctg.ClinicalTrialsGovService;
    beforeEach(async () => {
      db = await createMemorySqliteDB();
      service = await ctg.ClinicalTrialsGovService.create(db, { cleanInterval: 0 });
    });

    it('returns a list of IDs with existing IDs removed', async () => {
      // First, insert dummy entries
      await insertTestStudy(db, 1);
      await insertTestStudy(db, 3);
      expect(await service.findCacheMisses(['NCT00000001', 'NCT00000002', 'NCT00000003'])).toEqual(['NCT00000002']);
    });

    it('ignores invalid IDs', async () => {
      expect(await service.findCacheMisses(['invalid'])).toEqual([]);
    });
  });

  describe('#updateResearchStudies', () => {
    let service: ctg.ClinicalTrialsGovService;
    let downloadTrialsSpy: jasmine.Spy;

    beforeEach(async () => {
      // The service is never initialized
      service = createMemoryCTGovService();
      await service.init();
      // TypeScript won't allow us to install spies the "proper" way on private methods
      service['downloadTrials'] = downloadTrialsSpy = jasmine.createSpy('downloadTrials').and.callFake(() => {
        return Promise.resolve(true);
      });
    });

    // These tests basically are only to ensure that all trials are properly visited when given.
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

  describe('#updateSearchSetEntries', () => {
    let service: ctg.ClinicalTrialsGovService;
    let downloadTrialsSpy: jasmine.Spy;

    beforeEach(async () => {
      // The service is never initialized
      service = createMemoryCTGovService();
      await service.init();
      // TypeScript won't allow us to install spies the "proper" way on private methods
      service['downloadTrials'] = downloadTrialsSpy = jasmine.createSpy('downloadTrials').and.callFake(() => {
        return Promise.resolve(true);
      });
    });

        // These tests basically are only to ensure that all trials are properly visited when given.
    it('updates all the given studies', () => {
          // Our test studies contain the same NCT ID twice to make sure that works as expected, as well as a NCT ID that
          // download spy will return null for to indicate a failure.
          const testSearchSetEntries: SearchBundleEntry[] = [
            createSearchSetEntry('dupe1', 'NCT00000001'),
            createSearchSetEntry('missing', 'NCT00000002'),
            createSearchSetEntry('dupe2', 'NCT00000001'),
            createSearchSetEntry('singleton', 'NCT00000003', 0.5),

          ]

          const testStudy = createClinicalStudy();
          const updateSpy = spyOn(service, 'updateResearchStudy');
          const getTrialSpy = jasmine.createSpy('getCachedClinicalStudy').and.callFake((nctId: string) => {
            return Promise.resolve(nctId === 'NCT00000002' ? null : testStudy);
          });

          service.getCachedClinicalStudy = getTrialSpy;
          return expectAsync(
            service.updateSearchSetEntries(testSearchSetEntries).then(() => {
              expect(downloadTrialsSpy).toHaveBeenCalledOnceWith(['NCT00000001', 'NCT00000002', 'NCT00000003']);
              // Update should have been called three times: twice for the NCT00000001 studies, and once for the NCT00000003 study
              expect(updateSpy).toHaveBeenCalledWith(testSearchSetEntries[0].resource as ResearchStudy, testStudy);
              expect(updateSpy).not.toHaveBeenCalledWith(testSearchSetEntries[1].resource as ResearchStudy, testStudy);
              expect(updateSpy).toHaveBeenCalledWith(testSearchSetEntries[2].resource as ResearchStudy, testStudy);
              expect(updateSpy).toHaveBeenCalledWith(testSearchSetEntries[3].resource as ResearchStudy, testStudy);
            })
          ).toBeResolved();
    });

    it('does nothing if no studies have NCT IDs', () => {
      return expectAsync(
        service.updateSearchSetEntries([ {resource: { resourceType: 'ResearchStudy', status: 'active' }, search: { mode: 'match', score: 0 }}]).then(() => {
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

      const testSearchSetEntries: SearchBundleEntry[] = [
        createSearchSetEntry('test1', 'NCT00000001'),
        createSearchSetEntry('test2', 'NCT00000002'),
        createSearchSetEntry('test3', 'NCT00000003'),
        createSearchSetEntry('test4', 'NCT00000004', 0.5),

      ]
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

  // this functionality is currently unimplemented - this test exists solely to "cover" the method
  describe('#removeExpiredCacheEntries', () => {
    it('does nothing', async () => {
      const service = createMemoryCTGovService();
      await service.removeExpiredCacheEntries();
    });
  });

  describe('#downloadTrials', () => {
    let scope: nock.Scope;
    let interceptor: nock.Interceptor;
    let db: sqlite.Database;
    let downloader: ctg.ClinicalTrialsGovService;
    const nctIDs = ['NCT00000001', 'NCT00000002', 'NCT00000003'];
    beforeEach(async () => {
      scope = nock('https://clinicaltrials.gov');
      interceptor = scope.get(`/api/v2/studies?filter.ids=${nctIDs.join(',')}&pageSize=128`);
      // Create the test DB as this needs to poke into it
      db = await createMemorySqliteDB();
      // Initialize the downloaded
      downloader = await ctg.ClinicalTrialsGovService.create(db, { cleanInterval: 0 });
    });

    afterEach(async () => {
      await downloader.destroy();
      scope.done();
    });

    it('handles failures from https.get', async () => {
      interceptor.replyWithError('Test error');
      expect(await downloader['downloadTrials'](nctIDs)).toBeFalse();
    });

    it('handles failure responses from the server', async () => {
      interceptor.reply(404, 'Unknown');
      expect(await downloader['downloadTrials'](nctIDs))
        .withContext('downloader indicates failure')
        .toBeFalse();
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
      await insertTestStudy(db, 2);
      expect(await downloader['downloadTrials'](nctIDs)).toBeTrue();

      // Should have created the two missing items which should be resolved
      for (const nctId of nctIDs) {
        const result = await db.get<{ study_json: string }>(
          'SELECT study_json FROM ctgov_studies WHERE nct_id=?',
          ctg.parseNCTNumber(nctId)
        );
        expect(result?.study_json).toEqual(
          `{"protocolSection":{"identificationModule":{"nctId":${JSON.stringify(nctId)}}}}`
        );
      }
    });

    it('rolls back on failure from addCacheEntry', async () => {
      // Bunch of setup for this
      const testNCT = 'NCT00000001';
      const study = createClinicalStudy(testNCT);
      // Mock out the tryFetchStudies method
      downloader['tryFetchStudies'] = async () => [study];
      // Make addCacheEntry throw an exception
      downloader['addCacheEntry'] = async () => {
        throw new Error('test error');
      };
      expect(await downloader['downloadTrials']([testNCT])).toBeFalse();
      expect(await db.get<{ nct_id: number }>('SELECT nct_id FROM ctgov_studies WHERE nct_id=1')).toBeUndefined();
    });

    describe('multiple simultaneous calls', () => {
      const realTimeout = setTimeout;
      beforeEach(() => {
        jasmine.clock().install();
      });
      afterEach(() => {
        jasmine.clock().uninstall();
      });
      // Essentially, let internal promises resolve
      function tickEventLoop(): Promise<void> {
        return new Promise((resolve) => {
          realTimeout(resolve, 1);
        });
      }
      it('waits for the first to complete', async () => {
        // This is kind of a weird set of tests since it involves ensuring things
        // happen in a very specific order.
        // First, mock out the db's "run" method to just resolve immediately
        spyOn(db, 'run').and.callFake(() => Promise.resolve({} as sqlite.ISqlite.RunResult));
        // Mock tryFetchStudies to always return a test study after a brief
        // timeout
        const fetchStudiesSpy = (downloader['tryFetchStudies'] = jasmine
          .createSpy('tryFetchStudies')
          .and.callFake((ids: string[]) => {
            return new Promise<Study[]>((resolve) => {
              setTimeout(() => {
                resolve(ids.map(createClinicalStudy));
              }, 1);
            });
          }));
        // Mock out addCacheEntry to again resolve after a specific timeout
        const addCacheEntrySpy = (downloader['addCacheEntry'] = jasmine.createSpy('addCacheEntry').and.callFake(() => {
          return new Promise<void>((resolve) => {
            setTimeout(resolve, 1);
          });
        }));
        let firstPromiseResolved = false;
        const firstPromise = downloader['downloadTrials'](['NCT00000001']).then(() => {
          firstPromiseResolved = true;
        });
        expect(fetchStudiesSpy).toHaveBeenCalledTimes(1);
        // First promise will not have resolved yet, it's waiting on the mock tryFetchStudies
        // Tick forward
        jasmine.clock().tick(1);
        // Allow promises to resolve
        await tickEventLoop();
        expect(firstPromiseResolved).toBeFalse();
        expect(addCacheEntrySpy).toHaveBeenCalledTimes(1);
        // OK, so at this point, the first should have resolved tryFetchStudies, created the lock, and moved on to
        // waiting to insert the one cache entry. Start the second promise now
        let secondPromiseResolved = false;
        const secondPromise = downloader['downloadTrials'](['NCT00000002']).then(() => {
          secondPromiseResolved = true;
        });
        expect(downloader['_downloadTrialsLock']).not.toBeNull();
        expect(fetchStudiesSpy).toHaveBeenCalledTimes(2);
        expect(addCacheEntrySpy).toHaveBeenCalledTimes(1);
        jasmine.clock().tick(1);
        await tickEventLoop();
        // First promise should now resolve, having had a chance to finish
        expect(firstPromiseResolved).toBeTrue();
        // Second promise should now be waiting on addCacheEntry
        expect(secondPromiseResolved).toBeFalse();
        jasmine.clock().tick(1);
        await tickEventLoop();
        expect(fetchStudiesSpy).toHaveBeenCalledTimes(2);
        expect(addCacheEntrySpy).toHaveBeenCalledTimes(2);
        // And finally just ensure everything cleans up properly
        await Promise.all([firstPromise, secondPromise]);
      });
    });
  });

  describe('#getCachedClinicalStudy', () => {
    let db: sqlite.Database;
    let service: ctg.ClinicalTrialsGovService;
    beforeEach(async () => {
      db = await createMemorySqliteDB();
      service = await ctg.ClinicalTrialsGovService.create(db, { cleanInterval: 0 });
    });
    it('handles an invalid NCT ID', async () => {
      expect(await service.getCachedClinicalStudy('not an NCT')).toBeNull();
    });

    it('loads the appropriate cache entry', async () => {
      const study = createClinicalStudy();
      await insertTestStudy(db, 1234, study);
      expect(await service.getCachedClinicalStudy('NCT00001234')).toEqual(study);
    });

    it('returns null on cached failure', async () => {
      // This currently can't happen as failed trials aren't currently marked as failed but...
      await insertTestStudy(db, 7357, null);
      expect(await service.getCachedClinicalStudy('NCT00007357')).toBeNull();
    });
  });

  describe('#ensureTrialsAvailable()', () => {
    // Most of these tests just pass through to downloadTrials
    let service: ctg.ClinicalTrialsGovService;
    let downloadTrials: jasmine.Spy<(ids: string[]) => Promise<boolean>>;
    beforeEach(async () => {
      service = createMemoryCTGovService();
      await service.init();
      // Can't directly spy on within TypeScript because downloadTrials is protected
      const spy = jasmine.createSpy<(ids: string[]) => Promise<boolean>>('downloadTrials');
      // Jam it in
      service['downloadTrials'] = spy;
      downloadTrials = spy;
      downloadTrials.and.callFake(() => Promise.resolve(true));
    });

    it('excludes invalid NCT numbers in an array of strings', async () => {
      await service.ensureTrialsAvailable(['NCT00000001', 'NCT00000012', 'invalid', 'NCT01234567']);
      expect(downloadTrials).toHaveBeenCalledOnceWith(['NCT00000001', 'NCT00000012', 'NCT01234567']);
    });

    it('pulls NCT numbers out of given ResearchStudy objects', async () => {
      await service.ensureTrialsAvailable([
        createResearchStudy('test1', 'NCT00000001'),
        createResearchStudy('test2', 'NCT12345678'),
        createResearchStudy('no-nct')
      ]);
      expect(downloadTrials).toHaveBeenCalledOnceWith(['NCT00000001', 'NCT12345678']);
    });
  });

  describe('#addCacheEntry', () => {
    // addCacheEntry is responsible for saving a single Study object to the cache
    let db: sqlite.Database;
    let service: ctg.ClinicalTrialsGovService;

    beforeEach(async () => {
      db = await createMemorySqliteDB();
      service = await ctg.ClinicalTrialsGovService.create(db, { cleanInterval: 0 });
    });

    it('does not write an invalid cache entry', async () => {
      const dbRunSpy = spyOn(db, 'run').and.callThrough();
      // Everything in the object is optional
      await service['addCacheEntry'](db, {});
      expect(dbRunSpy).not.toHaveBeenCalled();
      // For completeness sake:
      await service['addCacheEntry'](db, { protocolSection: {} });
      expect(dbRunSpy).not.toHaveBeenCalled();
      await service['addCacheEntry'](db, { protocolSection: { identificationModule: {} } });
      expect(dbRunSpy).not.toHaveBeenCalled();
      // Invalid type
      await service['addCacheEntry'](db, {
        protocolSection: { identificationModule: { nctId: 12 as unknown as string } }
      });
      expect(dbRunSpy).not.toHaveBeenCalled();
      // Invalid ID
      await service['addCacheEntry'](db, { protocolSection: { identificationModule: { nctId: 'not an NCT id' } } });
      expect(dbRunSpy).not.toHaveBeenCalled();
    });

    it('inserts a new cache entry', async () => {
      const study = createClinicalStudy('NCT12345678');
      await service['addCacheEntry'](db, study);
      // Explicitly pull from the database
      const result = await db.get<{ study_json: string }>(
        'SELECT study_json FROM ctgov_studies WHERE nct_id = 12345678'
      );
      expect(result?.study_json).toEqual(JSON.stringify(study));
    });

    it('upserts if the entry already exists', async () => {
      // Insert invalid entry
      await db.run(
        'INSERT INTO ctgov_studies (nct_id, study_json, created_at) VALUES (?, ?, ?)',
        12345678,
        null,
        new Date().valueOf()
      );
      const study = createClinicalStudy('NCT12345678');
      await service['addCacheEntry'](db, study);
      // Explicitly pull from the database
      const result = await db.get<{ study_json: string }>(
        'SELECT study_json FROM ctgov_studies WHERE nct_id = 12345678'
      );
      expect(result?.study_json).toEqual(JSON.stringify(study));
    });
  });

  describe('#updateResearchStudy', () => {
    it('forwards to updateResearchStudyWithClinicalStudy', () => {
      const service = createMemoryCTGovService();
      const testResearchStudy = createResearchStudy('test');
      const testClinicalStudy = createClinicalStudy();
      service.updateResearchStudy(testResearchStudy, testClinicalStudy);
      // There's no really good way to verify this worked. For now, it not blowing up is good enough.
    });
  });
});
