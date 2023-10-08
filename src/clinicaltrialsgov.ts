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

import fs from 'fs';
import path from 'path';
import * as https from 'https';
// Needed for types:
import * as http from 'http';
import { debuglog } from 'util';
import {
  CodeableConcept,
  ContactDetail,
  ContactPoint,
  Group,
  Location,
  PlanDefinition,
  Reference,
  ResearchStudy,
  ResearchStudyArm
} from 'fhir/r4';
import { ClinicalTrialsGovAPI, Study } from './clinical-trials-gov';
import { Status } from './ctg-api';
import { addContainedResource, addToContainer } from './research-study';
import { WriteFileOptions } from 'fs';

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
 * @returns a promise that resolves to the parsed object or null
 */
export function parseStudyJson(fileContents: string, log?: Logger): Study | null {
  try {
    const json = JSON.parse(fileContents);
    if (json === null) {
      return null;
    } else if (typeof json === 'object') {
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

const CLINICAL_STATUS_MAP = new Map<Status, ResearchStudy['status']>([
  [Status.ACTIVE_NOT_RECRUITING, 'closed-to-accrual'],
  [Status.COMPLETED, 'completed'],
  // FIXME: This does not appear to have a proper mapping
  [Status.ENROLLING_BY_INVITATION, 'active'],
  [Status.NOT_YET_RECRUITING, 'approved'],
  [Status.RECRUITING, 'active'],
  [Status.SUSPENDED, 'temporarily-closed-to-accrual'],
  [Status.TERMINATED, 'administratively-completed'],
  [Status.WITHDRAWN, 'withdrawn'],
  [Status.AVAILABLE, 'completed'],
  [Status.NO_LONGER_AVAILABLE, 'closed-to-accrual'],
  [Status.TEMPORARILY_NOT_AVAILABLE, 'temporarily-closed-to-accrual'],
  [Status.APPROVED_FOR_MARKETING, 'completed'],
  // FIXME: This does not appear to have a proper mapping
  [Status.WITHHELD, 'in-review'],
  // FIXME: This does not appear to have a proper mapping
  [Status.UNKNOWN, 'in-review']
]);

export function convertClincalStudyStatusToFHIRStatus(status: Status): ResearchStudy['status'] | undefined {
  return CLINICAL_STATUS_MAP.get(status);
}

function convertToTitleCase(str: string): string {
  return str.replace(/\b(\w+)\b/g, (s) => s.substring(0, 1) + s.substring(1).toLowerCase()).replace(/_/g, ' ');
}

function convertArrayToCodeableConcept(trialConditions: string[]): CodeableConcept[] {
  const fhirConditions: CodeableConcept[] = [];
  for (const condition of trialConditions) {
    fhirConditions.push({ text: condition });
  }
  return fhirConditions;
}

/**
 * Subset of the Node.js fs module necessary to handle the cache file system, allowing it to be overridden if
 * necessary.
 */
export interface FileSystem {
  readFile: (
    path: fs.PathOrFileDescriptor,
    options: { encoding: BufferEncoding; flag?: string },
    callback: (err: NodeJS.ErrnoException | null, data: string) => void
  ) => void;
  mkdir: (path: string, callback: (err: NodeJS.ErrnoException | null) => void) => void;
  readdir: (path: string, callback: (err: NodeJS.ErrnoException | null, files: string[]) => void) => void;
  stat: (path: string, callback: (err: NodeJS.ErrnoException | null, stat: fs.Stats) => void) => void;
  writeFile: (file: string, data: Buffer | string, options: WriteFileOptions, callback: (err: Error | null) => void) => void;
  unlink: (path: string, callback: (err: NodeJS.ErrnoException | null) => void) => void;
}

interface PendingState {
  promise: Promise<void>;
  resolve: () => void;
  reject: (e: Error) => void;
}

/**
 * A cache entry. Cache entries basically operate in two modes: an entry that is pending being written based on a ZIP
 * file, and a file that has a backing file ready to be loaded.
 *
 * The pending state is kind of weird because an entry is pending once a download has been requested for it, but cannot
 * be properly fulfilled until the file data has been saved. There's no really good way to wrap that in a Promise so
 * instead the resolve method is stored until the pending state can be resolved.
 */
export class CacheEntry {
  private _cache: ClinicalTrialsGovService;
  // Dates are, sadly, mutable via set methods. This makes it impractical to attempt to make properties involving them
  // immutable.
  private _createdAt: Date | null;
  private _lastAccess: Date;
  /**
   * The pending status. Either a Promise (in which case it is not only pending, but has things actively waiting for
   * it), or true, in which case it is pending but the promise is yet to be created, or false if pending but the promise
   * has not been created. This is so that no Promise is created if nothing ever needs it, which avoids cases where the
   * Promise won't have a catch handler attached to it.
   */
  private _pending: PendingState | boolean = false;
  /**
   * Create a new cache entry.
   * @param filename the file name of the entry
   * @param options the file stats (if the file exists) or a flag indicating it's pending (being downloaded still)
   */
  constructor(
    cache: ClinicalTrialsGovService,
    public filename: string,
    options: { stats?: fs.Stats; pending?: boolean }
  ) {
    this._cache = cache;
    if (options.stats) {
      // Default to using the metadata from the fs.Stats object
      this._createdAt = options.stats.ctime;
      // Assume the last modified time was when the cache entry was fetched (it's close enough anyway)
      this._lastAccess = options.stats.mtime;
    } else {
      // Otherwise, default to now
      this._createdAt = new Date();
      this._lastAccess = new Date();
    }
    if (options.pending) {
      // In this mode, mark createdAt as null
      this._createdAt = null;
      this._pending = true;
    }
  }
  // As the returned Date objects are mutable, return copies
  /**
   * Gets the time when this entry was initially created. If null, that indicates that the entry was never successfully
   * created - it's still waiting for data to be downloaded.
   */
  get createdAt(): Date | null {
    return this._createdAt === null ? null : new Date(this._createdAt);
  }
  /**
   * Gets the last time the cache entry was accessed. This is updated whenever
   * #load() is called.
   */
  get lastAccess(): Date {
    return new Date(this._lastAccess);
  }
  /**
   * Determine if the cache entry is still pending: data for it has not yet been saved.
   */
  get pending(): boolean {
    return this._pending !== false;
  }

  /**
   * Check if the last access time is before the given date
   * @param date the date to check
   * @returns true if the last access time was before the given date
   */
  lastAccessedBefore(date: Date): boolean {
    return this._lastAccess < date;
  }

  /**
   * Indicates that the entry has been located somewhere and that data for it is now being prepared.
   */
  found(): void {
    if (this._createdAt === null) {
      this._createdAt = new Date();
    }
  }

  /**
   * Resolves the pending state (if the entry was pending), otherwise does nothing. This does not change the "found"
   * status - if ready() is called without found(), createdAt remains null and the entry may be removed as pointing to
   * a record that does not exist.
   */
  ready(): void {
    if (typeof this._pending === 'object') {
      this._pending.resolve();
    }
    this._pending = false;
  }

  /**
   * Forcibly fail the entry.
   * @param e the error to fail the entry with
   */
  fail(e: Error | string): void {
    if (typeof this._pending === 'object') {
      if (typeof e === 'string') {
        e = new Error(e);
      }
      this._pending.reject(e);
    }
    this._pending = false;
  }

  /**
   * Loads the underlying file. If the entry is still pending, then the file is read once the entry is ready. This may
   * resolve to null if the clinical study does not exist in the results.
   */
  load(): Promise<Study | null> {
    // Move last access to now
    this._lastAccess = new Date();
    // If we're still pending, we have to wait for that to finish before we can
    // read the underlying file.
    if (this._pending) {
      let promise: Promise<void>;
      if (this._pending === true) {
        // This is the only case when we actually create the Promise - when still pending and something attempts a load.
        // TODO (maybe): Add a timeout?
        // There's no way to prove it to TypeScript, but the executor function in the Promise runs immediately when the
        // Promise is created. So create useless no-op funcs to avoid "may be undefined" errors.
        let resolveFunc: () => void = () => {
            /* no-op */
          },
          rejectFunc: (e: Error) => void = () => {
            /* no-op */
          };
        promise = new Promise<void>((resolve, reject) => {
          resolveFunc = resolve;
          rejectFunc = reject;
        });
        this._pending = {
          promise: promise,
          resolve: resolveFunc,
          reject: rejectFunc
        };
      } else {
        promise = this._pending.promise;
      }
      return promise.then(() => {
        return this.readFile();
      });
    } else {
      // Otherwise we can just return immediately
      return this.readFile();
    }
  }

  /**
   * Always attempt to read the file, regardless of whether or not the entry is pending.
   */
  readFile(): Promise<Study | null> {
    return new Promise((resolve, reject) => {
      this._cache.fs.readFile(this.filename, { encoding: 'utf8' }, (err, data) => {
        if (err) {
          reject(err);
        } else {
          // Again bump last access to now since the access has completed
          this._lastAccess = new Date();
          if (data.length === 0) {
            // Sometimes files end up empty - this appears to be a bug?
            // It's unclear what causes this to happen
            this._cache.log('Warning: %s is empty on read', this.filename);
            resolve(null);
          } else {
            resolve(parseStudyJson(data, this._cache.log));
          }
        }
      });
    });
  }

  /**
   * Remove the entry from the cache. All this does is delete the underlying file. The returned Promise is more for
   * error handling than anything else.
   */
  remove(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      fs.unlink(this.filename, (err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }
}

/**
 * Create a directory if it does not already exist. If it does exist (or some other file exists in its place), this
 * still resolves rather than raising an error. This used to check if the paths were really directories, but since the
 * final step is now reading the file entries from the directory anyway, that check ensures everything is a directory
 * anyway.
 *
 * @param path the path to create (will be created recursively)
 * @return a Promise that resolves as true if the directory was newly created or false if it existed
 */
export function mkdir(fs: FileSystem, path: string): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    fs.mkdir(path, (err) => {
      if (err) {
        if (err.code === 'EEXIST') {
          // This is fine - resolve false. We'll only get this if the final part of the path exists (although it will be
          // EEXIST regardless of if it's a directory or a regular file)
          resolve(false);
        } else {
          reject(err);
        }
      } else {
        resolve(true);
      }
    });
  });
}

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
   * Internal value to track temporary file names.
   */
  private tempId = 0;

  /**
   * Log used to log debug information. Either passed in at creation time or created via the Node.js util.debuglog
   * function. With the latter, activate by setting the NODE_DEBUG environment variable to "ctgovservice" (or include it
   * in a comma separated list of debugging modules to include).
   */
  readonly log: Logger;

  private _maxTrialsPerRequest = 128;
  /**
   * The maximum number of trials to attempt to download in a single request. Each NCT ID increases the URI size by
   * effectively 15 bytes: essentially each NCT ID becomes '+OR+NCT12345678'. The request path "counts" as a header and
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

  private cacheDataDir: string;

  /**
   * Actual cache of NCT IDs to their cached values. This is the "real cache" versus whatever's on the filesystem.
   * (The NCT ID is in the form that returns true from isValidNCTNumber, so NCTnnnnnnnn where n are digits.)
   */
  private cache = new Map<NCTNumber, CacheEntry>();

  private cleanupTimeout: NodeJS.Timeout | null = null;

  readonly service: ClinicalTrialsGovAPI;

  /**
   * The filesystem being used by the cache.
   */
  readonly fs: FileSystem;

  /**
   * Creates a new instance. This will not initialize the cache or load anything, this merely creates the object. Use
   * the #init() method to initialize the service and load existing data. (Or use createClinicalTrialsGovService() do
   * construct and initialize at the same time.)
   *
   * @param dataDir the directory to use for cache data
   * @param log an optional function to receive debug log messages. By default this uses util.debuglog('ctgovservice')
   *     meaning that the log can be activated by setting NODE_DEBUG to "ctgovservice"
   */
  constructor(public readonly dataDir: string, options?: ClinicalTrialsGovServiceOptions) {
    this.cacheDataDir = path.join(dataDir, 'data');
    const log = options ? options.log : null;
    // If no log was given, create it
    this.log = log ?? debuglog('ctgovservice');
    // Default expiration timeout to an hour
    this.expirationTimeout = options?.expireAfter ?? 60 * 60 * 1000;
    // Default cleanup interval to an hour
    this.cleanupInterval = options?.cleanInterval ?? 60 * 60 * 1000;
    this.fs = options?.fs ?? fs;
    this.service = new ClinicalTrialsGovAPI();
  }

  /**
   * Creates the necessary directories if they do not exist, and loads any existing data into the cache. Parent
   * directories of the cache will not be created automatically, they must already exist.
   */
  async init(): Promise<void> {
    this.log('Using %s as cache dir for clinicaltrials.gov data', this.dataDir);
    const baseDirExisted = !(await mkdir(this.fs, this.dataDir));
    // The directory containing cached studies
    const dataDirExisted = !(await mkdir(this.fs, this.cacheDataDir));
    if (baseDirExisted && dataDirExisted) {
      // If both directories existed, it's necessary to restore the cache directory
      await this.restoreCacheFromFS();
      this.log('Restored existing cache data.');
    } else {
      this.log(baseDirExisted ? 'Created data directory for storing result' : 'Created new cache directory');
    }
    // Once started, run the cache cleanup every _cleanupIntervalMillis
    this.setCleanupTimeout();
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
   * Shuts down the service, doing any final necessary cleanup. At present this stops any running timers. The Promise
   * returned currently resolves immediately, but in the future, it may resolve asynchronously when the service has been
   * cleanly shut down.
   */
  destroy(): Promise<void> {
    if (this.cleanupTimeout !== null) {
      clearTimeout(this.cleanupTimeout);
      // And blank it
      this.cleanupTimeout = null;
    }
    return Promise.resolve();
  }

  /**
   * This attempts to load the cache from the filesystem.
   */
  private restoreCacheFromFS(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.log('Scanning %s for existing cache entries...', this.cacheDataDir);
      this.fs.readdir(this.cacheDataDir, (err, files) => {
        if (err) {
          reject(err);
        } else {
          // Go through the files and create entries for them.
          const promises: Promise<void>[] = [];
          for (const file of files) {
            this.log('Checking %s', file);
            // Split this file name into two parts: the extension and the base name
            const dotIdx = file.lastIndexOf('.');
            if (dotIdx < 1) {
              // Skip "bad" files
              continue;
            }
            // FIXME: This is probably a bad idea. Right now the file name serves as the "master" name for files. It's
            // probably possible to load the file and pull the NCT ID out that way, as well as clear out files that
            // can't be parsed.
            const baseName = file.substring(0, dotIdx);
            const extension = file.substring(dotIdx + 1);
            if (isValidNCTNumber(baseName) && extension === 'json') {
              promises.push(this.createCacheEntry(baseName, path.join(this.cacheDataDir, file)));
            }
          }
          Promise.all(promises).then(() => {
            resolve();
          }, reject);
        }
      });
    });
  }

  private createCacheEntry(id: NCTNumber, filename: string): Promise<void> {
    // Restoring this involves getting the time the file was created so we know when the entry expires
    return new Promise((resolve, reject) => {
      this.fs.stat(filename, (err, stats) => {
        if (err) {
          // TODO (maybe): Instead of rejecting, just log - rejecting will caused Promise.all to immediately reject and
          // ignore the rest of the Promises. However, stat failing is probably a "real" error.
          reject(err);
        } else {
          this.cache.set(id, new CacheEntry(this, filename, { stats: stats }));
          this.log('Restored cache entry for %s', filename);
          resolve();
        }
      });
    });
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
  updateResearchStudies(studies: ResearchStudy[]): Promise<ResearchStudy[]> {
    const nctIdMap = findNCTNumbers(studies);
    if (nctIdMap.size === 0) {
      // Nothing to do
      return Promise.resolve(studies);
    } else {
      const nctIds = Array.from(nctIdMap.keys());
      // Make sure the NCT numbers are in the cache
      return this.ensureTrialsAvailable(nctIds).then(() => {
        const promises: Promise<Study | null>[] = [];
        // Go through the NCT numbers we found and updated all matching trials
        for (const entry of nctIdMap.entries()) {
          const [nctId, study] = entry;
          const promise = this.getCachedClinicalStudy(nctId);
          promises.push(promise);
          promise.then((clinicalStudy) => {
            if (clinicalStudy !== null) {
              // Make sure we have data to use - we may still get null if there was no data for a given NCT number
              // Update whatever trials we have
              if (Array.isArray(study)) {
                for (const s of study) {
                  this.updateResearchStudy(s, clinicalStudy);
                }
              } else {
                this.updateResearchStudy(study, clinicalStudy);
              }
            }
          });
        }
        // Finally resolve to the promises we were given
        return Promise.all(promises).then(() => studies);
      });
    }
  }

  /**
   * Tells the cache to delete all expired cached files. The entries are removed from access immediately, but a Promise
   * is returned that resolves when all the underlying data is cleaned up. This Promise is more for error handling than
   * anything else.
   */
  removeExpiredCacheEntries(): Promise<void> {
    const expiredEntries: CacheEntry[] = [];
    const expiredIds: string[] = [];
    // Go through the cache and find all expired entries
    const expired = new Date();
    expired.setTime(expired.getTime() - this._expirationTimeout);
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccessedBefore(expired)) {
        expiredIds.push(key);
        expiredEntries.push(entry);
      }
    }
    const expiredPromises: Promise<void>[] = [];
    // Now that the expired entries have been found, remove them
    for (const key of expiredIds) {
      this.cache.delete(key);
    }
    // FIXME: It's unclear whether or not this creates a race condition where it may be possible for another request
    // for an entry we just expired to be deleted before the new entry is ready. This is somewhat unlikely, but it's
    // something that could probably be fixed by ensuring that each time we create a cache entry we use a unique
    // filename.
    for (const entry of expiredEntries) {
      expiredPromises.push(entry.remove());
    }

    // The "then" essentially removes the array of undefined that will result
    // into a single undefined.
    return Promise.all(expiredPromises).then(() => {
      /* do nothing */
    });
  }

  /**
   * Ensures that a given set of NCT IDs is available within the service, assuming they exist on ClinicalTrials.gov.
   * @param ids the IDs to ensure are available
   * @returns a Promise that resolves once any downloads have completed
   */
  ensureTrialsAvailable(ids: string[]): Promise<void>;
  ensureTrialsAvailable(studies: ResearchStudy[]): Promise<void>;
  ensureTrialsAvailable(idsOrStudies: Array<string | ResearchStudy>): Promise<void> {
    // We only want string IDs and we may end up filtering some of them out
    const ids: string[] = [];
    for (const o of idsOrStudies) {
      if (typeof o === 'string') {
        if (isValidNCTNumber(o)) ids.push(o);
      } else {
        const id = findNCTNumber(o);
        if (id) ids.push(id);
      }
    }
    // Now that we have the IDs, we can split them into download requests
    const promises: Promise<void>[] = [];
    for (let start = 0; start < ids.length; start += this.maxTrialsPerRequest) {
      promises.push(this.downloadTrials(ids.slice(start, Math.min(start + this.maxTrialsPerRequest, ids.length))));
    }
    return Promise.all(promises).then(() => {
      // This exists solely to turn the result from an array of nothing into a single nothing
    });
  }

  /**
   * Downloads the given trials from ClinicalTrials.gov and stores them in the data directory. Note that this will
   * always replace trials if they exist.
   *
   * @param ids the IDs of the trials to download
   * @returns a Promise that resolves to the path where the given IDs were downloaded
   */
  protected async downloadTrials(ids: string[]): Promise<void> {
    // Now that we're starting to download clinical trials, immediately create pending entries for them.
    for (const id of ids) {
      if (!this.cache.has(id)) {
        this.cache.set(id, new CacheEntry(this, this.pathForNctNumber(id), { pending: true }));
      }
    }
    try {
      const studies = await this.service.fetchStudies(ids);
      for (const study of studies) {
        // Grab the NCT ID of this study
        const nctId = study.protocolSection?.identificationModule?.nctId;
        // TODO: Handle aliases?
        if (nctId) {
          await this.addCacheEntry(nctId, JSON.stringify(study));
        }
      }
    } catch (ex) {
      // If an error occurred while fetching studies, every cache entry we just loaded may be invalid.
      this.log('Invalidating cache entry IDs for: %s', ids);
      for (const id of ids) {
        const entry = this.cache.get(id);
        if (entry && entry.pending) {
          this.cache.delete(id);
        }
      }
    }
    // Invalidate any IDs that are still pending, they weren't in the results
    for (const id of ids) {
      const entry = this.cache.get(id);
      if (entry && entry.createdAt === null) {
        this.log('Removing cache entry for %s: it was not in the downloaded bundle!', id);
        entry.fail('Not found in bundle');
        this.cache.delete(id);
      }
    }
  }

  /**
   * Provides a method that can be overridden to alter how a web request is
   * made. Defaults to simply calling https.get directly.
   * @param url the URL to get
   * @param callback the callback
   */
  protected getURL(url: string, callback: (res: http.IncomingMessage) => void): http.ClientRequest {
    return https.get(url, callback);
  }

  /**
   * Internal method to create a temporary file within the data directory. Temporary files created via this method are
   * not automatically deleted and need to be cleaned up by the caller.
   */
  private createTemporaryFileName(): string {
    // For now, temporary files are always "temp-[DATE]-[PID]-[TEMPID]" where [TEMPID] is an incrementing internal ID.
    // This means that temp files should never collide across processes or within a process. However, if a temporary
    // file is created and then the server is restarted and it somehow manages to get the same PID, a collision can
    // happen in that case.
    const now = new Date();
    return [
      'temp-',
      now.getUTCFullYear(),
      (now.getUTCMonth() + 1).toString().padStart(2, '0'),
      now.getUTCDate().toString().padStart(2, '0'),
      '-',
      process.pid,
      '-',
      this.tempId++
    ].join('');
  }

  /**
   * Create a path to the data file that stores data about a cache entry.
   * @param nctNumber the NCT number
   */
  private pathForNctNumber(nctNumber: NCTNumber): string {
    // FIXME: It's probably best not to use the NCT number as the sole part of the filename. See
    // removeExpiredCacheEntries for details.
    return path.join(this.cacheDataDir, nctNumber + '.json');
  }

  private addCacheEntry(nctNumber: NCTNumber, contents: string): Promise<void> {
    const filename = path.join(this.cacheDataDir, nctNumber + '.json');
    // The cache entry should already exist
    const entry = this.cache.get(nctNumber);
    // Tell the entry that we are writing data
    if (entry) {
      entry.found();
    }
    return new Promise<void>((resolve, reject) => {
      // This indicates whether no error was raised - close can get called anyway, and it's slightly cleaner to just
      // mark that an error happened and ignore the close handler if it did.
      // (This also potentially allows us to do additional cleanup on close if an error happened.)
      this.fs.writeFile(filename, contents, 'utf8', (err) => {
        if (err) {
          this.log('Unable to create file [%s]: %o', filename, err);
          // If the cache entry exists in pending mode, delete it - we failed to create this entry
          if (entry && entry.pending) {
            entry.fail('Unable to create file');
            this.cache.delete(nctNumber);
          }
          // TODO: Do we also need to delete the file? Or will the error prevent the file from existing?
          reject(err);
        } else {
          if (entry && entry.pending) {
            entry.ready();
          }
          resolve();
        }
      });
    });
  }

  /**
   * Loads a ClinicalStudy from an extracted dataset. This will never download a copy, this will only ever return from
   * within the cache.
   * @param nctNumber the NCT number
   * @returns a Promise that resolves to either the parsed ClinicalStudy or to null if the ClinicalStudy does not exist
   */
  getCachedClinicalStudy(nctNumber: NCTNumber): Promise<Study | null> {
    const entry = this.cache.get(nctNumber);
    if (entry) {
      return entry.load();
    } else {
      return Promise.resolve(null);
    }
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
   * Creates and initializes a new service for retrieving data from http://clinicaltrials.gov/. This will automatically
   * invoke the init method to create the directory if it doesn't exist and load any existing data if it does. Note that
   * the init method will not create missing parent directories - the path to the cache directory must already exist
   * minus the cache directory itself. If the cache directory cannot be created the Promise will be rejected with the
   * error preventing it from being created.
   *
   * @param dataDir the data directory
   * @param options additional options that can be set to further configure the trial service
   * @returns a Promise that resolves when the service is ready
   */
  static create(dataDir: string, options?: ClinicalTrialsGovServiceOptions): Promise<ClinicalTrialsGovService> {
    const result = new ClinicalTrialsGovService(dataDir, options);
    return result.init().then(() => result);
  }
}

/**
 * Creates and initializes a new service for retrieving data from http://clinicaltrials.gov/. This is the same as
 * ClinicalTrialsGovService.create, see that method for details.
 *
 * @param dataDir the data directory
 * @param options additional options that can be set to further configure the trial service
 * @returns a Promise that resolves when the service is ready
 */
export function createClinicalTrialsGovService(
  dataDir: string,
  options?: ClinicalTrialsGovServiceOptions
): Promise<ClinicalTrialsGovService> {
  return ClinicalTrialsGovService.create(dataDir, options);
}

/**
 * Updates a research study with data from a clinical study off the ClinicalTrials.gov website. This will only update
 * fields that do not have data, it will not overwrite any existing data.
 *
 * Mapping as defined by https://www.hl7.org/fhir/researchstudy-mappings.html#clinicaltrials-gov
 *
 * @param result the research study to update
 * @param study the clinical study to use to update
 */
export function updateResearchStudyWithClinicalStudy(
  result: ResearchStudy,
  study: Study
): ResearchStudy {
  const protocolSection = study.protocolSection;
  // If there is no protocol section, we can't do anything.
  if (!protocolSection) {
    return result;
  }
  if (!result.enrollment) {
    const eligibility = protocolSection.eligibilityModule;
    if (eligibility) {
      const criteria = eligibility.eligibilityCriteria;
      if (criteria) {
        const group: Group = { resourceType: 'Group', id: 'group' + result.id, type: 'person', actual: false };
        const reference = addContainedResource(result, group);
        reference.display = criteria;
        result.enrollment = [reference];
      }
    }
  }

  if (!result.description) {
    const briefSummary = protocolSection.descriptionModule?.briefSummary;
    if (briefSummary) {
      result.description = briefSummary;
    }
  }

  if (!result.phase) {
    const phase = protocolSection.designModule?.phases;
    if (phase && phase.length > 0) {
      // For now, just grab whatever the first phase is
      result.phase = {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/research-study-phase',
            code: phase[0],
            display: phase[0]
          }
        ],
        text: phase[0]
      };
    }
  }

  // ------- Category
  // Since we may not have all of the Study design in the result, we need to do a merge of data
  const studyType = study.protocolSection?.designModule?.studyType;
  const categories: CodeableConcept[] = result.category ? result.category : [];

  // We need to determine what categories have already been declared.
  const types = categories.map((item) => {
    const sep = item.text?.split(':');
    return sep ? sep[0] : '';
  });

  if (studyType && !types.includes('Study Type')) {
    categories.push({ text: 'Study Type: ' + studyType[0] });
  }

  const designInfo = protocolSection.designModule?.designInfo;
  if (designInfo) {
    if (designInfo.interventionModelDescription && !types.includes('Intervention Model')) {
      categories.push({ text: 'Intervention Model: ' + designInfo.interventionModelDescription });
    }

    if (designInfo.primaryPurpose && !types.includes('Primary Purpose')) {
      categories.push({ text: 'Primary Purpose: ' + convertToTitleCase(designInfo.primaryPurpose) });
    }

    if (designInfo.maskingInfo?.maskingDescription && !types.includes('Masking')) {
      categories.push({ text: 'Masking: ' + designInfo.maskingInfo?.maskingDescription });
    }

    if (designInfo.allocation && !types.includes('Allocation')) {
      categories.push({ text: 'Allocation: ' + convertToTitleCase(designInfo.allocation) });
    }

    if (designInfo.timePerspective && !types.includes('Time Perspective')) {
      categories.push({ text: 'Time Perspective: ' + convertToTitleCase(designInfo.timePerspective) });
    }

    if (designInfo.observationalModel && !types.includes('Observation Model')) {
      categories.push({ text: 'Observation Model: ' + convertToTitleCase(designInfo.observationalModel) });
    }
  }

  if (categories.length > 1) result.category = categories;
  // ------- Category

  // Right now, the default value for a research study is "active". If CT.G
  // knows better, then allow it to override that.
  if (!result.status || result.status == 'active') {
    const overallStatus = protocolSection.statusModule?.lastKnownStatus;
    if (overallStatus) {
      const status = convertClincalStudyStatusToFHIRStatus(overallStatus);
      if (typeof status !== 'undefined') result.status = status;
    }
  }

  if (!result.condition) {
    if (protocolSection.conditionsModule?.conditions) {
      result.condition = convertArrayToCodeableConcept(protocolSection.conditionsModule?.conditions);
    }
  }

  if (!result.site) {
    const locations = protocolSection.contactsLocationsModule?.locations;
    if (locations) {
      let index = 0;
      for (const location of locations) {
        const fhirLocation: Location = { resourceType: 'Location', id: 'location-' + index++ };
        if (location) {
          if (location.facility) fhirLocation.name = location.facility;
          if (location.city && location.country) {
            // Also add the address information
            fhirLocation.address = { use: 'work', city: location.city, country: location.country };
            if (location.state) {
              fhirLocation.address.state = location.state;
            }
            if (location.zip) {
              fhirLocation.address.postalCode = location.zip;
            }
          }
        }
        if (location.contacts) {
          for (const contact of location.contacts) {
            if (contact.email) {
              addToContainer<Location, ContactPoint, 'telecom'>(fhirLocation, 'telecom', {
                system: 'email',
                value: contact.email,
                use: 'work'
              });
            }
            if (contact.phone) {
              addToContainer<Location, ContactPoint, 'telecom'>(fhirLocation, 'telecom', {
                system: 'phone',
                value: contact.phone,
                use: 'work'
              });
            }
          }
        }
        addToContainer<ResearchStudy, Reference, 'site'>(result, 'site', addContainedResource(result, fhirLocation));
      }
    }
  }

  if (!result.arm) {
    const armGroups = protocolSection.armsInterventionsModule?.armGroups;
    if (armGroups) {
      for (const studyArm of armGroups) {
        const label = studyArm.label;
        if (label) {
          const arm: ResearchStudyArm = {
            name: label,
            ...(studyArm.type && {
              type: {
                coding: [
                  {
                    code: studyArm.type,
                    display: studyArm.type
                  }
                ],
                text: studyArm.type
              }
            }),
            ...(studyArm.description && { description: studyArm.description[0] })
          };

          addToContainer<ResearchStudy, ResearchStudyArm, 'arm'>(result, 'arm', arm);
        }
      }
    }
  }

  if (!result.protocol) {
    const interventions = protocolSection.armsInterventionsModule?.interventions;
    if (interventions) {
      let index = 0;
      for (const intervention of interventions) {
        if (intervention.armGroupLabels) {
          for (const armGroupLabel of intervention.armGroupLabels) {
            let plan: PlanDefinition = { resourceType: 'PlanDefinition', status: 'unknown', id: 'plan-' + index++ };

            plan = {
              ...plan,
              ...(intervention.description && { description: intervention.description }),
              ...(intervention.name && { title: intervention.name }),
              ...(intervention.otherNames && intervention.otherNames.length > 0 && { subtitle: intervention.otherNames[0] }),
              ...(intervention.type && { type: { text: intervention.type } }),
              ...{ subjectCodeableConcept: { text: armGroupLabel } }
            };

            addToContainer<ResearchStudy, Reference, 'protocol'>(
              result,
              'protocol',
              addContainedResource(result, plan)
            );
          }
        } else {
          let plan: PlanDefinition = { resourceType: 'PlanDefinition', status: 'unknown', id: 'plan-' + index++ };

          plan = {
            ...plan,
            ...(intervention.description && { description: intervention.description }),
            ...(intervention.name && { title: intervention.name }),
            ...(intervention.otherNames && intervention.otherNames.length > 0 && { subtitle: intervention.otherNames[0] }),
            ...(intervention.type && { type: { text: intervention.type } })
          };

          addToContainer<ResearchStudy, Reference, 'protocol'>(result, 'protocol', addContainedResource(result, plan));
        }
      }
    }
  }

  if (!result.contact) {
    const contacts = protocolSection.contactsLocationsModule?.centralContacts;

    if (contacts) {
      for (const contact of contacts) {
        if (contact != undefined) {
          const contactName = contact.name;
          if (contactName) {
            const fhirContact: ContactDetail = { name: contactName };
            if (contact.email) {
              addToContainer<ContactDetail, ContactPoint, 'telecom'>(fhirContact, 'telecom', {
                system: 'email',
                value: contact.email,
                use: 'work'
              });
            }
            if (contact.phone) {
              addToContainer<ContactDetail, ContactPoint, 'telecom'>(fhirContact, 'telecom', {
                system: 'phone',
                value: contact.phone,
                use: 'work'
              });
            }
            addToContainer<ResearchStudy, ContactDetail, 'contact'>(result, 'contact', fhirContact);
          }
        }
      }
    }
  }

  if (!result.period) {
    const startDate = protocolSection.statusModule?.startDateStruct?.date;
    const completionDate = protocolSection.statusModule?.completionDateStruct?.date;
    if (startDate || completionDate) {
      // Set the period object as appropriate
      const period = {
          ...(startDate && { start: startDate }),
          ...(completionDate && { end: completionDate })
      };

      if (Object.keys(period).length != 0) result.period = period;
    }
  }

  return result;
}
