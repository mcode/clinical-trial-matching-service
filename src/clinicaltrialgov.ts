
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
import * as util from 'util';
import extract from 'extract-zip';
import { ResearchStudy } from './fhir-types';

// For documentation purposes, indicates an element that will only ever appear once in a valid document. It's still
// ultimately an array at present.
type One<T> = Array<T>;
// For documentation purposes, indicates an element that can appear any number of times.
// (currently, this is unused, but hey)
//type Unbounded<T> = Array<T>;

type ActualEnum = "Actual" | "Anticipated" | "Estimate";
interface EnrollmentStruct {
  _: string;
  $: { type: ActualEnum };
}

interface TextblockStruct {
  textblock: string[];
}

/**
 * A text block is, for whatever reason, a list of textblocks. This merges them
 * into a single string. It's unclear if this is "correct" so this exists as a
 * function so that if it's wrong it can be fixed in a single place.
 * @param textblock the textblock to merge
 */
function mergeTextblock(textblock: TextblockStruct): string {
  return textblock.textblock.join('\n');
}

type PhaseEnum = 'N/A'
| 'Early Phase 1'
| 'Phase 1'
| 'Phase 1/Phase 2'
| 'Phase 2'
| 'Phase 2/Phase 3'
| 'Phase 3'
| 'Phase 4';

type StudyTypeEnum = 'Expanded Access'
| 'Interventional'
| 'N/A';

interface EligibilityStruct {
  criteria?: One<TextblockStruct>;
}

/**
 * This is a simplified type that currently contains *only* the parts of the result that are used. This does NOT contain
 * the full type. The full schema is here: https://clinicaltrials.gov/ct2/html/images/info/public.xsd
 */
export interface ClinicalStudy {
  brief_summary?: One<TextblockStruct>;
  phase?: One<PhaseEnum>;
  study_type: One<StudyTypeEnum>;
  eligibility?: One<EligibilityStruct>;
}
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
      if (typeof identifier.value === 'string' && isValidNCTNumber(identifier.value))
        return identifier.value;
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
  constructor(public dataDir: string) {
  }

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
      })
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
    const dirPath = filePath.slice(0,-11);
    console.log(dirPath);
    return new Promise((resolve, reject) => {
      results.on('error', (err: Error) => {
        reject(err);
      });
      results.pipe(file).on('close', function() {
        extract(filePath, { dir: `${dirPath}/backups` }).then(resolve).catch(reject);
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
      return this.updateTrialWithBackup(result, backup);
    });
  }

  updateTrialWithBackup(result: ResearchStudy, backup: TrialBackup): ResearchStudy {
    const study = backup.clinical_study;
    if (!result.enrollment) {
      const eligibility = study.eligibility;
      if (eligibility) {
        const criteria = eligibility[0].criteria;
        if (criteria) {
          result.enrollment = [
            { reference: `#group${result.id}`, type: 'Group', display: mergeTextblock(criteria[0]) }
          ];
        }
      }
    }
    if (!result.description) {
      const briefSummary = study.brief_summary;
      if (briefSummary) {
        result.description = mergeTextblock(briefSummary[0]);
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
    //console.log(result);
    return result;
  }
}

export function createClinicalTrialGovService(dataDir: string): Promise<ClinicalTrialGovService> {
  return new Promise<ClinicalTrialGovService>((resolve, reject) => {
    const result = new ClinicalTrialGovService(dataDir);
    result.init().then(() => {
      resolve(result);
    }).catch(reject);
  });
}
