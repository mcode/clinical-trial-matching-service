/**
 * This file contains a backup system for finding necessary trial information if
 * your matching service does not provide it.
 *
 * The intended usages is essentially:
 *
 * Create the service:
 *
 * const ctgService = await createClinicalTrialsGovService('temp-data');
 *
 * Then, when ResearchStudy objects exist that need to be filled out, assuming
 * that studies is a ResearchStudy[]:
 *
 * await ctgService.updateResearchStudies(studies);
 *
 * This will fill out whatever can be filled out within the given studies.
 */

import { debuglog } from 'util';
import { ResearchStudy } from 'fhir/r4';
import { ClinicalTrialsGovAPI, Study } from './clinicaltrialsgov-api';
import { updateResearchStudyWithClinicalStudy } from './study-fhir-converter';
import * as sqlite from 'sqlite';
import * as sqlite3 from 'sqlite3';

/**
 * Logger type from the NodeJS utilities. (The TypeScript definitions for Node
 * don't bother naming this type.)
 */
type Logger = (message: string, ...param: unknown[]) => void;

/**
 * More for documentation purposes than anything else, this marks strings that are expected to be a valid NCT number.
 * (Generally they aren't checked to ensure they're valid, the methods involved will return nothing if they are not.)
 */
export type NCTNumber = string;

/**
 * The URL for the "system" field of identifiers that indicate the
 * ClinicalTrial.gov identifier, or NTC number, of a clinical trial.
 */
export const CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL = 'http://clinicaltrials.gov/';

/**
 * Checks to ensure that a given NCT number is valid. This checks to make sure
 * it matches the regular expression /^NCT[0-9]{8}$/.
 * @param nctNumber the NCT number to check
 */
export function isValidNCTNumber(nctNumber: string): boolean {
  return /^NCT[0-9]{8}$/.test(nctNumber);
}

export function parseNCTNumber(nctNumber: string): number | undefined {
  if (isValidNCTNumber(nctNumber)) {
    return parseInt(nctNumber.substring(3));
  } else {
    return undefined;
  }
}

export function formatNCTNumber(nctNumber: number): string {
  // Make sure the NCT number is an integer
  nctNumber = Math.floor(nctNumber);
  if (nctNumber < 0 || nctNumber > 99999999) {
    throw new Error(`Invalid NCT number ${nctNumber}`);
  }
  return `NCT${nctNumber.toFixed(0).padStart(8, '0')}`;
}

/**
 * Finds the NCT number specified for the given ResearchStudy, assuming there is
 * one. This requires an identifier on the given ResearchStudy that either
 * belongs to the coding system "http://clinicaltrials.gov/" or is a valid NCT
 * number as determined by #isValidNCTNumber.
 *
 * This will return the value of the first identifier belonging to the coding
 * system "http://clinicaltrials.gov/", and if there is no identifier, return
 * the first identifier value that is considered valid.
 *
 * @param study the research study
 * @returns the NCT number or null if none
 */
export function findNCTNumber(study: ResearchStudy): NCTNumber | null {
  if (study.identifier && Array.isArray(study.identifier) && study.identifier.length > 0) {
    for (const identifier of study.identifier) {
      if (identifier.system === CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL && typeof identifier.value === 'string')
        return identifier.value;
    }
    // Fallback: regexp match
    for (const identifier of study.identifier) {
      if (typeof identifier.value === 'string' && isValidNCTNumber(identifier.value)) return identifier.value;
    }
  }
  // Return null on failures
  return null;
}

/**
 * Finds all the NCT numbers within the given list of studies. Returns a map of
 * NCT numbers to the research studies they match. If multiple research studies
 * have the same NCT ID, then an array will be used to contain all matching
 * studies. (This should be very uncommon but is supported anyway.)
 * @param studies the NCT numbers found, if any
 */
export function findNCTNumbers(studies: ResearchStudy[]): Map<NCTNumber, ResearchStudy | Array<ResearchStudy>> {
  const result = new Map<NCTNumber, ResearchStudy | Array<ResearchStudy>>();
  for (const study of studies) {
    const nctId = findNCTNumber(study);
    if (nctId !== null) {
      const existing = result.get(nctId);
      if (existing === undefined) {
        result.set(nctId, study);
      } else {
        if (Array.isArray(existing)) {
          existing.push(study);
        } else {
          result.set(nctId, [existing, study]);
        }
      }
    }
  }
  return result;
}

/**
 * Attempts to parse the given string as a Study JSON object.
 * @param fileContents the contents of the file as a string
 * @param log an optional logger
 * @returns a promise that resolves to the parsed object or null if the study
 * could not be parsed
 */
export function parseStudyJson(fileContents: string, log?: Logger): Study | null {
  try {
    const json = JSON.parse(fileContents);
    if (typeof json === 'object' && !Array.isArray(json)) {
      // "null" is currently "valid" - a cached failure?
      return json as Study;
    } else {
      if (log) {
        log('Invalid JSON object for Study: %o', json);
      }
      return null;
    }
  } catch (ex) {
    if (log) {
      log('Unable to parse JSON object: %o', ex);
    }
    return null;
  }
}

// Currently this exists as a simple object with only one function but may be updated later
interface Migration {
  up: (db: sqlite.Database) => Promise<void>;
}

// Order matters in this
const MIGRATIONS: Record<string, Migration> = {
  init: {
    up: async (db: sqlite.Database): Promise<void> => {
      // Create the cache table
      await db.run(`CREATE TABLE ctgov_studies
        (
          nct_id INTEGER PRIMARY KEY,
          study_json TEXT,
          error_message TEXT,
          created_at NUMERIC NOT NULL
        )`);
    }
  }
};

export interface ClinicalTrialsGovServiceOptions {
  /**
   * The logging function to use to log debug information. If not set the default is `debuglog('ctgovservice')` from
   * the `util` module in Node.js.
   */
  log?: Logger;
  /**
   * Time in milliseconds to expire files after.
   */
  expireAfter?: number;
  /**
   * Interval in milliseconds to run periodic cache clean-ups. If set to 0 or infinity, never run cleanups.
   */
  cleanInterval?: number;
  /**
   * If given, rather than use the default Node.js file system, use the given override. Mainly used for tests but may
   * also be useful in instances where a "real" file system is unavailable.
   */
  fs?: FileSystem;
}

/**
 * System to fill in data on research studies based on the trial data from
 * https://clinicaltrials.gov/
 *
 * The current system works as follows:
 *
 * Call updateResearchStudies() with the ResearchStudy objects to update. It will locate all ResearchStudy objects that
 * contain an NCT ID. It will then:
 *
 * 1. Call downloadTrials() to download the ClinicalStudy data from clinicaltrials.gov. It starts an HTTPS request to
 *    download the trial results and, if successful, passes the response stream off to extractResults().
 * 2. extractResults() saves the stream its given to a temporary ZIP file and extracts that file to a temporary
 *    directory. Once the ZIP is extracted, it deletes the temporary ZIP. It then returns the directory where the files
 *    were extracted.
 * 3. With the path to the extracted ZIP, updateResearchStudies() can now use the downloaded trial data to update the
 *    trials.
 * 4. Before resolving, the temporary directory is deleted.
 *
 * A future version will likely change this to make it so that rather than immediately deleting the temporary trial
 * data, it's kept around in a least-recently-used cache and only deleted as the cache exceeds a given size. This will
 * add a few new public APIs to enable the retrieval of clinical study data by NCT ID. Right now, though, there is no
 * way to extract the clinical study data directly.
 */
export class ClinicalTrialsGovService {
  /**
   * Log used to log debug information. Either passed in at creation time or created via the Node.js util.debuglog
   * function. With the latter, activate by setting the NODE_DEBUG environment variable to "ctgovservice" (or include it
   * in a comma separated list of debugging modules to include).
   */
  readonly log: Logger;

  private _maxTrialsPerRequest = 128;
  /**
   * The maximum number of trials to attempt to download in a single request. Each NCT ID increases the URI size by
   * effectively 12 bytes: essentially each NCT ID becomes ',NCT12345678'. The request path "counts" as a header and
   * has to be smaller than maxHeaderSize given to the client. By default, this uses the default client, so the client
   * should be the default HTTPS client. In theory this would support around 500 per request, instead this defaults to
   * 128 which is a nice round number. (In binary, at least.)
   */
  get maxTrialsPerRequest(): number {
    return this._maxTrialsPerRequest;
  }

  set maxTrialsPerRequest(newValue: number) {
    // Basically, just make sure the new value is positive and an integer. Positive infinity is fine and remains
    // positive infinity: it means never split.
    if (newValue > 1) {
      this._maxTrialsPerRequest = Math.floor(newValue);
    }
  }

  private _expirationTimeout = 60 * 60 * 1000;

  /**
   * The expiration timeout, the time in milliseconds after a cache entry should be considered expired. The default
   * is 1 hour.
   */
  get expirationTimeout(): number {
    return this._expirationTimeout;
  }

  set expirationTimeout(value: number) {
    // Ensure it's at least 1000ms
    this._expirationTimeout = Math.max(value, 1000);
  }

  private _cleanupIntervalMillis = 60 * 60 * 1000;

  /**
   * The interval between cleanup sweeps. Set to 0 (or any negative value) or Infinity to disable periodic cleanup. Note
   * that the value is limited to the range 60000 (a minute)-2147483647 (the maximum value of a signed 32-bit integer)
   * as that maximum value is the maximum allowed timeout for a timer within Node.js. If the value is set to a negative
   * number or Infinity, the retrieved value will be 0, to indicate that the interval will not be set.
   */
  get cleanupInterval(): number {
    return this._cleanupIntervalMillis;
  }

  set cleanupInterval(value: number) {
    // Clamp it to 0 (special value for "never") or at least 60000 - also clamp the maximum to a 32-bit signed integer
    // which is the maximum allowed timeout within Node.js. (Exceeding that value changes the timeout to 1ms. Surprise!
    // I mean, sure, that's documented, but...)
    this._cleanupIntervalMillis =
      value <= 0 ? 0 : value === Infinity ? 0 : Math.min(Math.max(Math.floor(value), 60000), 0x7fffffff);
  }

  /**
   * The maximum allowed entry size before it is rejected. Default is 128MB, which is hopefully well more than necessary
   * for any reasonable clinical trial JSON.
   */
  maxAllowedEntrySize = 128 * 1024 * 1024;

  private cacheDBPath: string | null;
  private cacheDB: sqlite.Database | null;
  /**
   * Internal flag indicating if init() has been called
   */
  private cacheReady = false;

  private cleanupTimeout: NodeJS.Timeout | null = null;

  readonly service: ClinicalTrialsGovAPI;

  /**
   * Creates a new instance. This will not initialize the cache or load anything, this merely creates the object. Use
   * the #init() method to initialize the service and load existing data. (Or use createClinicalTrialsGovService() do
   * construct and initialize at the same time.)
   *
   * The {@link #init} method must be used **even if** given a database object, as it will initialize the necessary
   * tables within the database. If given a path name, calling {@link #destroy} will close the database. However, if
   * given a database directly, {@link #destroy} **will not** close the database and it will be the responsibility of
   * the code using the service to close it.
   *
   * @param db either the path to the database file to use, or the sqlite.Database to use directly.
   * @param log an optional function to receive debug log messages. By default this uses util.debuglog('ctgovservice')
   *     meaning that the log can be activated by setting NODE_DEBUG to "ctgovservice"
   */
  constructor(public readonly db: string | sqlite.Database, options?: ClinicalTrialsGovServiceOptions) {
    if (typeof db === 'string') {
      this.cacheDBPath = db;
      this.cacheDB = null;
    } else {
      this.cacheDBPath = null;
      this.cacheDB = db;
    }
    const log = options ? options.log : undefined;
    // If no log was given, create it
    this.log = log ?? debuglog('ctgovservice');
    // Default expiration timeout to an hour
    this.expirationTimeout = options?.expireAfter ?? 60 * 60 * 1000;
    // Default cleanup interval to an hour
    this.cleanupInterval = options?.cleanInterval ?? 60 * 60 * 1000;
    this.service = new ClinicalTrialsGovAPI({ logger: this.log });
  }

  /**
   * Initializes the service. This will open the SQLite database and run through any necessary data migrations for it.
   */
  async init(): Promise<void> {
    if (this.cacheReady) {
      throw new Error('init() has already been called');
    }
    // Technically this isn't really ready yet, but prevent double-calls to init
    this.cacheReady = true;
    let db: sqlite.Database;
    if (this.cacheDBPath === null) {
      this.log('Using existing database object for clinicaltrials.gov data');
      if (this.cacheDB === null) {
        throw new Error('Invalid internal state: both cache DB path and DB are null');
      }
      db = this.cacheDB;
    } else {
      this.log('Using %s as cache DB for clinicaltrials.gov data', this.cacheDBPath);
      this.cacheDB = db = await sqlite.open({ driver: sqlite3.Database, filename: this.cacheDBPath });
    }
    await this.migrateDB(db, MIGRATIONS);
    // Once started, run the cache cleanup every _cleanupIntervalMillis
    this.setCleanupTimeout();
  }

  /**
   * Migrate a database. The arguments exist mostly for typing/testing purposes.
   * @param db the database to migrate
   * @param migrations the migrations to run (they're run in key order). This is an argument for testing purposes.
   */
  private async migrateDB(db: sqlite.Database, migrations: typeof MIGRATIONS): Promise<void> {
    this.log('Applying migrations...');
    // lock the database
    await db.run('BEGIN TRANSACTION');
    try {
      await db.run('CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
      const appliedMigration = new Set(
        (await db.all<{ id: number; name: string }[]>('SELECT name FROM migrations ORDER BY id ASC')).map(
          (row) => row.name
        )
      );
      for (const name in migrations) {
        if (appliedMigration.has(name)) {
          this.log('Migration %s already applied', name);
        } else {
          this.log('Applying migration %s...', name);
          await migrations[name].up(db);
          // Insert that this migration was run
          await db.run('INSERT INTO migrations (name) VALUES (?)', name);
          this.log('Migration %s completed.', name);
        }
      }
      await db.run('COMMIT');
      this.log('All migrations applied successfully.');
    } catch (ex) {
      this.log('Exception applying migrations: %o', ex);
      // Rollback if we can
      await db.run('ROLLBACK');
      this.log('Migrations were rolled back.');
      throw ex;
    }
  }

  /**
   * Internal method to get the database object, throwing an exception if it's
   * not available.
   * @returns the database
   */
  private getDB(): sqlite.Database {
    if (this.cacheDB === null) {
      throw new Error(
        `Database not available (${this.cacheReady ? 'destroy() has been called' : 'init() has not been called'})`
      );
    }
    return this.cacheDB;
  }

  /**
   * Sets the timeout interval assuming it was set.
   */
  private setCleanupTimeout(): void {
    // If set to infinity we internally set it to 0
    if (this._cleanupIntervalMillis > 0) {
      this.cleanupTimeout = setTimeout(() => {
        this.removeExpiredCacheEntries().then(
          () => {
            // Set up to do this again when that's done
            this.setCleanupTimeout();
          },
          (error) => {
            this.log('Error cleaning expired cache entries: %o', error);
            // Even though this attempt failed, try again later
            this.setCleanupTimeout();
          }
        );
      }, this._cleanupIntervalMillis);
    }
  }

  /**
   * Shuts down the service, doing any final necessary cleanup. If given a database object when constructed, this
   * **will not** close the database. However, future calls to this object will no longer function.
   */
  async destroy(): Promise<void> {
    if (this.cleanupTimeout !== null) {
      clearTimeout(this.cleanupTimeout);
      // And blank it
      this.cleanupTimeout = null;
    }
    if (this.cacheDBPath === null) {
      // Always null out the database
      this.cacheDB = null;
    } else {
      const db = this.cacheDB;
      if (db) {
        this.cacheDB = null;
        await db.close();
      }
    }
  }

  /**
   * Attempts to update the given research studies with data from within this store. This returns a Promise that
   * resolves when the research studies have been updated with any available additional data. The Promise may be
   * rejected if the process fails entirely (that is, clinicaltrials.gov could not be contacted at all, or an I/O error
   * occurs).
   *
   * @param studies the studies to attempt to update
   * @returns a Promise that resolves when the studies are updated. It will resolve with the same array that was passed
   *     in - this updates the given objects, it does not clone them and create new ones.
   */
  async updateResearchStudies(studies: ResearchStudy[]): Promise<ResearchStudy[]> {
    const nctIdMap = findNCTNumbers(studies);
    if (nctIdMap.size === 0) {
      // Nothing to do
      return studies;
    }
    const nctIds = Array.from(nctIdMap.keys());
    // Make sure the NCT numbers are in the cache
    await this.ensureTrialsAvailable(nctIds);
    // Update the items in the list
    await Promise.all(
      Array.from(nctIdMap.entries()).map(([nctId, study]) => this.updateResearchStudyFromCache(nctId, study))
    );
    return studies;
  }

  private async updateResearchStudyFromCache(nctId: string, originals: ResearchStudy | ResearchStudy[]): Promise<void> {
    const clinicalStudy = await this.getCachedClinicalStudy(nctId);
    // Make sure we have data to use - cache can be missing NCT IDs even after requesting them if the NCT is missing
    // from the origin service
    if (clinicalStudy !== null) {
      // Update whatever trials we have, which will either be an array or single object
      if (Array.isArray(originals)) {
        for (const s of originals) {
          this.updateResearchStudy(s, clinicalStudy);
        }
      } else {
        this.updateResearchStudy(originals, clinicalStudy);
      }
    }
  }

  /**
   * Tells the cache to delete all expired cached files. Currently this does nothing - entries never expire. It may
   * make sense to clean up the database every once and a while, but for now, this is a no-op.
   */
  async removeExpiredCacheEntries(): Promise<void> {
    // For now, does nothing.
  }

  /**
   * Returns a list of NCT IDs that are valid and that are not in the cache.
   * @param ids the NCT IDs to locate in the cache
   * @return a list containing only NCT IDs that are valid and missing
   */
  async findCacheMisses(ids: string[]): Promise<string[]> {
    const db = this.getDB();
    const checkIds: number[] = [];
    const idSet = new Set<string>();
    let sql = '';
    for (const id of ids) {
      const nctNum = parseNCTNumber(id);
      if (nctNum !== undefined) {
        checkIds.push(nctNum);
        idSet.add(id);
        if (sql.length === 0) {
          sql = 'SELECT nct_id FROM ctgov_studies WHERE nct_id IN (?';
        } else {
          sql += ', ?';
        }
      }
    }
    // No valid IDs
    if (sql.length === 0) {
      return [];
    }
    const cacheHitIds = await db.all<{ nct_id: number }[]>(sql + ')', checkIds);
    // Remove each hit ID
    for (const row of cacheHitIds) {
      idSet.delete(formatNCTNumber(row.nct_id));
    }
    return Array.from(idSet);
  }

  /**
   * Ensures that a given set of NCT IDs is available within the service, assuming they exist on ClinicalTrials.gov.
   * @param ids the IDs to ensure are available
   * @returns a Promise that resolves once any downloads have completed
   */
  ensureTrialsAvailable(ids: string[]): Promise<void>;
  ensureTrialsAvailable(studies: ResearchStudy[]): Promise<void>;
  async ensureTrialsAvailable(idsOrStudies: Array<string | ResearchStudy>): Promise<void> {
    // We only want string IDs and we may end up filtering some of them out
    let ids: string[] = [];
    for (const o of idsOrStudies) {
      if (typeof o === 'string') {
        if (isValidNCTNumber(o)) ids.push(o);
      } else {
        const id = findNCTNumber(o);
        if (id) ids.push(id);
      }
    }
    // Find the IDs we need to fetch
    ids = await this.findCacheMisses(ids);
    // Now that we have the IDs, we can split them into download requests
    // Run the download requests in series
    for (let start = 0; start < ids.length; start += this.maxTrialsPerRequest) {
      await this.downloadTrials(ids.slice(start, Math.min(start + this.maxTrialsPerRequest, ids.length)));
    }
  }

  /**
   * A Promise used as a lock to ensure that only one downloadTrials is attempting to insert cache entries at a time.
   */
  private _downloadTrialsLock: Promise<void> | null = null;

  /**
   * Downloads the given trials from ClinicalTrials.gov and stores them in the data directory. Note that this will
   * always replace trials if they exist.
   *
   * @param ids the IDs of the trials to download
   * @returns true if the request succeeded, false if it failed for some reason - the exact reason can be logged but
   * is otherwise silently eaten
   */
  protected async downloadTrials(ids: string[]): Promise<boolean> {
    this.log('Fetching studies with NCT IDs %j', ids);
    const studies = await this.tryFetchStudies(ids);
    // If the call failed, return false
    if (studies === null) {
      return false;
    }
    const db = this.getDB();
    // Surround this in a transaction (otherwise each insert would be a transaction on its own)
    // Some promise magic - if the lock exists, await it
    if (this._downloadTrialsLock !== null) {
      this.log('Waiting on transaction lock for NCT IDs %j', ids);
      await this._downloadTrialsLock;
      this.log('Transaction lock ready for %j', ids);
    }
    // Now, create the lock. (Default value gives it a type. Promise always runs the function in the constructor
    // immediately so resolveLock will be set to the resolve method, but TypeScript can't prove that.)
    let resolveLock = /* istanbul ignore next */ () => {};
    this._downloadTrialsLock = new Promise((resolve) => {
      resolveLock = resolve;
    });
    try {
      await db.run('BEGIN');
      try {
        for (const study of studies) {
          await this.addCacheEntry(db, study);
        }
        await db.run('COMMIT');
        return true;
      } catch (ex) {
        this.log('Exception while adding cache entries: %j', ex);
        await db.run('ROLLBACK');
        return false;
      }
    } finally {
      this._downloadTrialsLock = null;
      resolveLock();
    }
  }

  private async tryFetchStudies(ids: string[]): Promise<Study[] | null> {
    try {
      return await this.service.fetchStudies(ids, this._maxTrialsPerRequest);
    } catch (ex) {
      this.log('Error fetching trials from server: %o', ex);
      return null;
    }
  }

  private async addCacheEntry(db: sqlite.Database, study: Study): Promise<void> {
    // See if we can locate an NCT number for this study.
    const nctNumber = study.protocolSection?.identificationModule?.nctId;
    if (typeof nctNumber !== 'string') {
      this.log(
        'Ignoring study object from server: unable to locate an NCT ID for it! (protocolSection.identificationModule.nctId missing or not a string)'
      );
      return;
    }
    // Convert to the numeric ID sqlite will actually use
    const rowId = parseNCTNumber(nctNumber);
    if (rowId === undefined) {
      this.log('Ignoring invalid study object from server: NCT ID %s is not valid!', nctNumber);
      return;
    }
    await db.run(
      'INSERT INTO ctgov_studies (nct_id, study_json, created_at) VALUES (?, ?, ?) ON CONFLICT(nct_id) DO UPDATE SET study_json=excluded.study_json',
      rowId,
      JSON.stringify(study),
      new Date().valueOf()
    );
  }

  /**
   * Loads a ClinicalStudy from an extracted dataset. This will never download a copy, this will only ever return from
   * within the cache.
   * @param nctNumber the NCT number
   * @returns a Promise that resolves to either the parsed ClinicalStudy or to null if the ClinicalStudy does not exist
   */
  async getCachedClinicalStudy(nctNumber: NCTNumber): Promise<Study | null> {
    const db = this.getDB();
    const nctId = parseNCTNumber(nctNumber);
    if (nctId) {
      const result = await db.get<{ study_json: string } | null>(
        'SELECT study_json FROM ctgov_studies WHERE nct_id=?',
        nctId
      );
      // study_json can be NULL to indicate a cached failure
      if (result && result.study_json) {
        return JSON.parse(result.study_json);
      }
    }
    return null;
  }

  /**
   * The provides a stub that handles updating the research study with data from a clinical study downloaded from the
   * ClinicalTrials.gov website. This primarily exists as a stub to allow the exact process which updates a research
   * study to be overridden if necessary.
   *
   * @param researchStudy the research study to update
   * @param clinicalStudy the clinical study to update it with
   */
  updateResearchStudy(researchStudy: ResearchStudy, clinicalStudy: Study): void {
    updateResearchStudyWithClinicalStudy(researchStudy, clinicalStudy);
  }

  /**
   * Creates and initializes a new service for retrieving data from http://clinicaltrials.gov/.
   *
   * This is essentially the same as constructing the object and then calling init() on it.
   *
   * Note the same behavior applies when `create()` is invoked with a database: the database object is nulled out when
   * {@link #destroy} is called, but it isn't closed. When invoked with a database object, it is the caller's
   * responsibility to close it.
   *
   * @param db the path to the database file or the database to use directly
   * @param options additional options that can be set to further configure the trial service
   * @returns a Promise that resolves when the service is ready
   */
  static async create(
    db: string | sqlite.Database,
    options?: ClinicalTrialsGovServiceOptions
  ): Promise<ClinicalTrialsGovService> {
    const result = new ClinicalTrialsGovService(db, options);
    await result.init();
    return result;
  }
}

/**
 * Alias of ClinicalTrialsGovService.create.
 */
export const createClinicalTrialsGovService = ClinicalTrialsGovService.create;
