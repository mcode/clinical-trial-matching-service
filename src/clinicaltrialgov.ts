/**
 * This file contains a backup system for finding necessary trial information if
 * your matching service does not provide it.
 */

import fs from 'fs';
import path from 'path';
import * as xml2js from 'xml2js';
import * as https from 'https';
// Needed for types:
import * as http from 'http';
import * as stream from 'stream';
import extract from 'extract-zip';
import { CodeableConcept, ContactPoint, Group, Location, Reference, ResearchStudy } from './fhir-types';
import { ClinicalStudy } from './clinicalstudy';
import { addContainedResource, addToContainer } from './research-study';

export interface TrialBackup {
  clinical_study: ClinicalStudy;
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

export function parseClinicalTrialXML(fileContents: string): Promise<TrialBackup> {
  const parser = new xml2js.Parser();
  return parser.parseStringPromise(fileContents).then((result) => {
    return result as TrialBackup;
  });
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
   * Creates a new instance. This does NOT check that the data directory exists,
   * use init() for that.
   * @param dataDir the data directory to use
   */
  constructor(public dataDir: string) {}

  /**
   * Creates the data directory is necessary.
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
                resolve();
              }
            });
          } else {
            // Otherwise, this error can't be handled
            reject(err);
          }
        } else {
          dir.close((err) => {
            if (err) {
              // ???
              console.error('Error closing data directory: ' + err);
            }
            // Resolve anyway
            resolve();
          });
        }
      });
    });
  }

  /**
   * Downloads the given trials from ClinicalTrials.gov and stores them in the
   * data directory.
   * @param ids the trials to download
   */
  downloadTrials(ids: string[]): Promise<void> {
    const url = 'https://clinicaltrials.gov/ct2/download_studies?term=' + ids.join('+OR+');
    return new Promise<void>((resolve, reject) => {
      try {
        this.getURL(url, (response) => {
          if (response.statusCode !== 200) {
            // Assume some sort of server error
            reject(new Error(`Server error: ${response.statusCode} ${response.statusMessage}`));
          } else {
            this.extractResults(response).then(resolve).catch(reject);
          }
        });
      } catch (err) {
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
  getURL(url: string, callback: (res: http.IncomingMessage) => void): http.ClientRequest {
    return https.get(url, callback);
  }

  /**
   *
   * @param results a readable stream that is a set of results
   */
  extractResults(results: stream.Readable): Promise<void> {
    // FIXME: Save to a temp file (this will break if called while still resolving another download)
    const file = fs.createWriteStream(`${this.dataDir}/backup.zip`);
    const filePath = path.resolve(String(file.path));
    const dirPath = filePath.slice(0, -11);
    console.log(dirPath);
    return new Promise((resolve, reject) => {
      results.on('error', (err: Error) => {
        reject(err);
      });
      results.pipe(file).on('close', function () {
        extract(filePath, { dir: `${dirPath}/backups` })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  getDownloadedTrial(nctId: string): Promise<TrialBackup> {
    const filePath = `${this.dataDir}/backups/${nctId}.xml`;
    // TODO: Catch the file not existing.
    return new Promise((resolve, reject) => {
      fs.readFile(filePath, { encoding: 'utf8' }, (error, data): void => {
        if (error) {
          reject(error);
          return;
        }
        resolve(parseClinicalTrialXML(data));
      });
    });
  }

  updateTrial(result: ResearchStudy): Promise<ResearchStudy> {
    const nctId = findNCTNumber(result);
    if (nctId === null) {
      // If there is no ID, there is nothing we can do
      return Promise.resolve(result);
    }
    return this.getDownloadedTrial(nctId).then((backup) => {
      return updateTrialWithBackup(result, backup);
    });
  }
}

export function createClinicalTrialGovService(dataDir: string): Promise<ClinicalTrialGovService> {
  return new Promise<ClinicalTrialGovService>((resolve, reject) => {
    const result = new ClinicalTrialGovService(dataDir);
    result
      .init()
      .then(() => {
        resolve(result);
      })
      .catch(reject);
  });
}

export function updateTrialWithBackup(result: ResearchStudy, backup: TrialBackup): ResearchStudy {
  const study = backup.clinical_study;
  if (!result.enrollment) {
    const eligibility = study.eligibility;
    if (eligibility) {
      const criteria = eligibility[0].criteria;
      if (criteria) {
        const group: Group = { resourceType: 'Group', id: 'group' + result.id, type: 'person', actual: false };
        const reference = addContainedResource(result, group);
        reference.display = criteria[0].textblock[0];
        result.enrollment = [ reference ];
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
      result.status = overallStatus[0];
    }
  }

  const backupCondition = study.condition;

  if (backupCondition) {
    result.condition = convertArrayToCodeableConcept(backupCondition);
  }
  if (!result.site) {
    if (study.location) {
      let index = 0;
      for (const location of study.location) {
        const fhirLocation: Location = { resourceType: 'Location', id: 'location-' + index++ };
        if (location.facility && location.facility[0].name) fhirLocation.name = location.facility[0].name[0];
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
