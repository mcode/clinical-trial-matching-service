/**
 * This file contains a backup system for finding necessary trial information if
 * your matching service does not provide it.
 *
 * The intended usages is essentially:
 *
 * Create the service:
 *
 * const ctgService = await createClinicalTrialGovService('temp-data');
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
import * as xml2js from 'xml2js';
import * as https from 'https';
// Needed for types:
import * as http from 'http';
import * as stream from 'stream';
import { debuglog } from 'util';
import extract from 'extract-zip';
import {
  CodeableConcept,
  ContactPoint,
  Group,
  Location,
  Reference,
  ResearchStudy,
  ResearchStudyStatus
} from './fhir-types';
import { ClinicalStudy, isClinicalStudy, StatusEnum } from './clinicalstudy';
import { addContainedResource, addToContainer } from './research-study';

/**
 * Logger type from the NodeJS utilities. (The TypeScript definitions for Node
 * don't bother naming this type.)
 */
type Logger = (message: string, ...param: unknown[]) => void;

/**
 * This is the actual type generated by xml2js when the XML file is parsed.
 */
interface TrialBackup {
  clinical_study: ClinicalStudy;
}

export function isTrialBackup(o: unknown): o is TrialBackup {
  if (typeof o !== 'object' || o === null) {
    return false;
  }
  return 'clinical_study' in o && isClinicalStudy((o as TrialBackup).clinical_study);
}

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
export function findNCTNumber(study: ResearchStudy): string | null {
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
export function findNCTNumbers(studies: ResearchStudy[]): Map<string, ResearchStudy | Array<ResearchStudy>> {
  const result = new Map<string, ResearchStudy | Array<ResearchStudy>>();
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
          result.set(nctId, [ existing, study ]);
        }
      }
    }
  }
  return result;
}

export function parseClinicalTrialXML(fileContents: string): Promise<ClinicalStudy> {
  const parser = new xml2js.Parser();
  return parser.parseStringPromise(fileContents).then((result) => {
    if (isTrialBackup(result)) {
      return result.clinical_study;
    } else {
      throw new Error('Unable to parse trial as valid clinical study XML');
    }
  });
}

const CLINICAL_STATUS_MAP = new Map<StatusEnum, ResearchStudyStatus>([
  ['Active, not recruiting', 'closed-to-accrual'],
  ['Completed', 'completed'],
  // FIXME: This does not appear to have a proper mapping
  ['Enrolling by invitation', 'active'],
  ['Not yet recruiting', 'approved'],
  ['Recruiting', 'active'],
  ['Suspended', 'temporarily-closed-to-accrual'],
  ['Terminated', 'administratively-completed'],
  ['Withdrawn', 'withdrawn'],
  ['Available', 'completed'],
  ['No longer available', 'closed-to-accrual'],
  ['Temporarily not available', 'temporarily-closed-to-accrual'],
  ['Approved for marketing', 'completed'],
  // FIXME: This does not appear to have a proper mapping
  ['Withheld', 'in-review'],
  // FIXME: This does not appear to have a proper mapping
  ['Unknown status', 'in-review']
]);

export function convertClincalStudyStatusToFHIRStatus(status: StatusEnum): ResearchStudyStatus | undefined {
  return CLINICAL_STATUS_MAP.get(status);
}

function convertArrayToCodeableConcept(trialConditions: string[]): CodeableConcept[] {
  const fhirConditions: CodeableConcept[] = [];
  for (const condition of trialConditions) {
    fhirConditions.push({ text: condition });
  }
  return fhirConditions;
}

/**
 * System to fill in data on research studies based on the trial data from
 * https://clinicaltrials.gov/
 */
export class ClinicalTrialGovService {
  /**
   * Internal value to track temporary file names.
   */
  private tempId = 0;

  private log: Logger;

  /**
   * Creates a new instance. This does NOT check that the data directory exists,
   * use init() for that.
   * @param dataDir the data directory to use
   */
  constructor(public dataDir: string, log?: Logger) {
    // If no log was given, create it
    this.log = log ?? debuglog('ctgovservice');
  }

  /**
   * Creates the data directory if necessary.
   */
  init(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      fs.opendir(this.dataDir, (err, dir) => {
        if (err) {
          // Check to see if the err is ENOENT - this is OK and means we should
          // create the directory
          if (err.code === 'ENOENT') {
            fs.mkdir(this.dataDir, { recursive: true }, (err) => {
              if (err) {
                reject(err);
              } else {
                this.log('Service directory created in %s', this.dataDir);
                resolve();
              }
            });
          } else {
            this.log('Unable to create data directory: %o', err);
            // Otherwise, this error can't be handled
            reject(err);
          }
        } else {
          dir.close((err) => {
            if (err) {
              // ???
              this.log('Error closing data directory: %o', err);
              // Fall through and resolve anyway, it probably doesn't matter
            }
            this.log('Using existing data directory %s', this.dataDir);
            resolve();
          });
        }
      });
    });
  }

  /**
   * Attempts to update the given research studies with data from within this store. This returns a Promise that
   * resolves when whatever metadata can be added is. The Promise may be rejected if the process fails entirely
   * (that is, clinicaltrials.gov could not be contacted at all, or an I/O error occurs).
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
      return this.downloadTrials(Array.from(nctIdMap.keys())).then((tempDir) => {
        // Array of Promises.
        const promises: Promise<void>[] = [];
        // Go through the NCT numbers we found and updated all matching trials
        for (const entry of nctIdMap.entries()) {
          const [nctId, study] = entry;
          promises.push(this.getDownloadedTrial(tempDir, nctId).then((clinicalStudy) => {
            if (clinicalStudy === null) {
              // If the study is null, it is missing, and we have nothing to do
              return;
            }
            // Update whatever trials we have
            if (Array.isArray(study)) {
              for (const s of study) {
                updateResearchStudyWithClinicalStudy(s, clinicalStudy);
              }
            } else {
              updateResearchStudyWithClinicalStudy(study, clinicalStudy);
            }
          }));
        }
        return Promise.all(promises).then(() => {
          // At this point we can clean up
          fs.rmdir(tempDir, { recursive: true }, (error) => {
            if (error) {
              console.error(`Unable to clean up temp directory ${tempDir}:`);
              console.error(error);
            }
          });
          // And return the original studies so we resolve properly
          return studies;
        });
      });
    }
  }

  /**
   * Downloads the given trials from ClinicalTrials.gov and stores them in the
   * data directory.
   * @param ids the IDs of the trials to download
   * @returns a Promise that resolves to the path where the given IDs were
   *     downloaded
   */
  protected downloadTrials(ids: string[]): Promise<string> {
    const url = 'https://clinicaltrials.gov/ct2/download_studies?term=' + ids.join('+OR+');
    return new Promise<string>((resolve, reject) => {
      try {
        this.log('Fetching [%s]', url);
        this.getURL(url, (response) => {
          if (response.statusCode !== 200) {
            this.log('Error %d %s from server', response.statusCode, response.statusMessage);
            // Resume the response to ensure it gets cleaned up properly
            response.resume();
            // Assume some sort of server error
            reject(new Error(`Server error: ${response.statusCode} ${response.statusMessage}`));
          } else {
            this.extractResults(response).then(resolve).catch(reject);
          }
        });
      } catch (err) {
        this.log('Exception generating request: %o', err);
        reject(err);
      }
    });
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
   * Internal method to create a temporary file within the data directory. Temporary files created via this method
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
      (now.getUTCMonth()+1).toString().padStart(2, '0'),
      now.getUTCDate().toString().padStart(2, '0'),
      '-',
      process.pid,
      '-',
      this.tempId++
    ].join('');
  }

  /**
   * Extract a given set of results.
   * @param results a readable stream that contains a ZIP file that contains the results
   * @returns a Promise that resolves to the path that contains the extracted XML files from the ZIP
   */
  extractResults(results: stream.Readable): Promise<string> {
    const tempName = this.createTemporaryFileName();
    const zipFilePath = path.join(this.dataDir, tempName + '.zip');
    const file = fs.createWriteStream(zipFilePath);
    return new Promise((resolve, reject) => {
      this.log('Saving download to [%s]...', zipFilePath);
      results.on('error', (err: Error) => {
        reject(err);
      });
      results.pipe(file).on('close', () => {
        const extractedPath = path.resolve(path.join(this.dataDir, tempName));
        this.log('Extracting to [%s]...', extractedPath);
        // Extract the file
        extract(zipFilePath, { dir: extractedPath })
          .then(() => {
            // Since it's done, we should be able to delete the ZIP file now
            fs.unlink(zipFilePath, (error) => {
              if (error) {
                this.log('Error deleting temporary file [%s]: %o', zipFilePath, error);
                console.error(`Unable to remove temporary ZIP file ${zipFilePath}:`);
                console.error(error);
              }
              // But otherwise eat the error message
            });
            resolve(extractedPath);
          })
          .catch(reject);
      });
    });
  }

  /**
   * Loads a ClinicalStudy from an extracted dataset.
   * @param tempDir the temporary directory where the files were extracted
   * @param nctId the NCT ID
   * @returns a Promise that resolves to either the parsed ClinicalStudy or to null if the ClinicalStudy does not exist
   */
  private getDownloadedTrial(tempDir: string, nctId: string): Promise<ClinicalStudy | null> {
    const filePath = path.join(tempDir, nctId + '.xml');
    // TODO: Catch the file not existing. This should probably be handled
    // specially, such as by returns null or something else to differentiate
    // it from other errors, since an file not existing may mean it simply
    // needs to be loaded later
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, { encoding: 'utf8' }, (error, data): void => {
        if (error) {
          // If the trial does not exist, return null
          if (error.code === 'ENOENT') {
            resolve(null);
          } else {
            reject(error);
          }
        } else {
          resolve(parseClinicalTrialXML(data));
        }
      });
    });
  }
}

/**
 * Creates and initializes a new service for retrieving data from http://clinicaltrials.gov/.
 *
 * This is effectively the same as new ClinicalTrialGovService(dataDir).init().
 * @param dataDir the data directory
 * @returns a Promise that resolves when the service is ready
 */
export function createClinicalTrialGovService(dataDir: string): Promise<ClinicalTrialGovService> {
  const result = new ClinicalTrialGovService(dataDir);
  return result.init().then(() => result);
}

/**
 * Updates a research study with data from a clinical study off the ClinicalTrials.gov website. This will only update
 * fields that do not have data, it will not overwrite any existing data.
 *
 * @param result the research study to update
 * @param study the clinical study to use to update (this takes a partial as the ClinicalStudy type describes the XML
 * as the schema defines it, so this is designed to handle invalid XML that's missing information that should be
 * required)
 */
export function updateResearchStudyWithClinicalStudy(
  result: ResearchStudy,
  study: Partial<ClinicalStudy>
): ResearchStudy {
  if (!result.enrollment) {
    const eligibility = study.eligibility;
    if (eligibility) {
      const criteria = eligibility[0].criteria;
      if (criteria) {
        const group: Group = { resourceType: 'Group', id: 'group' + result.id, type: 'person', actual: false };
        const reference = addContainedResource(result, group);
        reference.display = criteria[0].textblock[0];
        result.enrollment = [reference];
      }
    }
  }
  if (!result.description) {
    const briefSummary = study.brief_summary;
    if (briefSummary) {
      result.description = briefSummary[0].textblock[0];
    }
  }
  if (!result.phase) {
    const phase = study.phase;
    if (phase) {
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
  if (!result.category) {
    const studyType = study.study_type;
    if (studyType) {
      result.category = [{ text: studyType[0] }];
    }
  }
  if (!result.status) {
    const overallStatus = study.overall_status;
    if (overallStatus) {
      const status = convertClincalStudyStatusToFHIRStatus(overallStatus[0]);
      if (typeof status !== 'undefined') result.status = status;
    }
  }

  if (!result.condition) {
    if (study.condition) {
      result.condition = convertArrayToCodeableConcept(study.condition);
    }
  }
  if (!result.site) {
    if (study.location) {
      let index = 0;
      for (const location of study.location) {
        const fhirLocation: Location = { resourceType: 'Location', id: 'location-' + index++ };
        if (location.facility) {
          if (location.facility[0].name)
            fhirLocation.name = location.facility[0].name[0];
          if (location.facility[0].address) {
            // Also add the address information
            const address = location.facility[0].address[0];
            fhirLocation.address = { use: 'work', city: address.city[0], country: address.country[0] };
            if (address.state) {
              fhirLocation.address.state = address.state[0];
            }
            if (address.zip) {
              fhirLocation.address.postalCode = address.zip[0];
            }
          }
        }
        if (location.contact) {
          const contact = location.contact[0];
          if (contact.email) {
            addToContainer<Location, ContactPoint, 'telecom'>(fhirLocation, 'telecom', {
              system: 'email',
              value: contact.email[0],
              use: 'work'
            });
          }
          if (contact.phone) {
            addToContainer<Location, ContactPoint, 'telecom'>(fhirLocation, 'telecom', {
              system: 'phone',
              value: contact.phone[0],
              use: 'work'
            });
          }
        }
        addToContainer<ResearchStudy, Reference, 'site'>(result, 'site', addContainedResource(result, fhirLocation));
      }
    }
  }
  //console.log(result);
  return result;
}
