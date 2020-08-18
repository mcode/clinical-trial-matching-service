
/**
 * This file contains a backup system for finding necessary trial information if
 * your matching service does not provide it.
 */

import fs from 'fs';
import path from 'path';
import * as parser from 'xml2json';
import * as https from 'https';
// Needed for types:
import * as http from 'http';
import extract from 'extract-zip';
import { ResearchStudy } from './fhir-types';

export interface TrialBackup {
  clinical_study: {
    required_header: {
      download_date: string;
      link_text: string;
      url: string;
    };
    id_info: { org_study_id: string; nct_id: string };
    brief_title: string;
    official_title: string;
    sponsors: { lead_sponsor: [Record<string, unknown>] };
    source: string;
    oversight_info: {
      has_dmc: string;
      is_fda_regulated_drug: string;
      is_fda_regulated_device: string;
    };
    brief_summary: {
      textblock: string;
    };
    overall_status: string;
    start_date: { type: string; t: string };
    completion_date: { type: string; t: string };
    primary_completion_date: { type: string; t: string };
    phase: string;
    study_type: string;
    has_expanded_access: string;
    study_design_info: {
      allocation: string;
      intervention_model: string;
      primary_purpose: string;
      masking: string;
    };
    primary_outcome: [[Record<string, unknown>], [Record<string, unknown>]];
    secondary_outcome: [[Record<string, unknown>], [Record<string, unknown>], [Record<string, unknown>]];
    number_of_arms: string;
    enrollment: { type: string; t: string };
    condition: string;
    arm_group: [[Record<string, unknown>], [Record<string, unknown>]];
    intervention: [[Record<string, unknown>], [Record<string, unknown>]];
    eligibility: {
      criteria: { textblock: string };
      gender: string;
      minimum_age: string;
      maximum_age: string;
      healthy_volunteers: string;
    };
    location: { facility: [Record<string, unknown>] };
    location_countries: { country: string };
    verification_date: string;
    study_first_submitted: string;
    study_first_submitted_qc: string;
    study_first_posted: { type: string; t: string };
    last_update_submitted: string;
    last_update_submitted_qc: string;
    last_update_posted: { type: string; t: string };
    responsible_party: { responsible_party_type: string };
    intervention_browse: { mesh_term: string };
    patient_data: { sharing_ipd: string };
  };
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

/**
 * System to fill in data on research studies based on the trial data from
 * https://clinicaltrials.gov/
 */
export class ClinicalTrialGovService {
  constructor(public dataDir: string) {
    // TODO: Validate dataDir exists, possibly make it if it doesn't
  }

  /**
   * Downloads the given trials from ClinicalTrials.gov and stores them in the
   * data directory.
   * @param ids the trials to download
   */
  downloadTrials(ids: string[]): Promise<void> {
    const url = 'https://clinicaltrials.gov/ct2/download_studies?term=' + ids.join('+OR+');
    console.log(url);
    // FIXME: Save to a temp file (this will break if called while still resolving another download)
    const file = fs.createWriteStream(`${this.dataDir}/backup.zip`);
    const filePath = path.resolve(String(file.path));
    const dirPath = filePath.slice(0,-11);
    //console.log(dirPath);
    return new Promise<void>((resolve, reject) => {
      try {
        this.getURL(url, function (response) {
          response.pipe(file).on('close', async function() {
            await extract(filePath, { dir: `${dirPath}/backups` });
            resolve();
          });
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

  getDownloadedTrial(nctId: string): TrialBackup {
    const filePath = `${this.dataDir}/backups/${nctId}.xml`;
    // TODO: Catch the file not existing.
    const data = fs.readFileSync(filePath, { encoding: 'utf8' });
    const json = JSON.parse(parser.toJson(data)) as TrialBackup;
    return json;
  }

  getBackupCriteria(trial: TrialBackup): string {
    return trial.clinical_study.eligibility.criteria.textblock;
  }

  getBackupSummary(trial: TrialBackup): string {
    return trial.clinical_study.brief_summary.textblock;
  }

  getBackupPhase(trial: TrialBackup): string {
    return trial.clinical_study.phase;
  }

  getBackupStudyType(trial: TrialBackup): string {
    return trial.clinical_study.study_type;
  }

  updateTrial(result: ResearchStudy): ResearchStudy {
    const nctId = findNCTNumber(result);
    if (nctId !== null) {
      const backup = this.getDownloadedTrial(nctId);
      if (!result.enrollment) {
        result.enrollment = [
          { reference: `#group${result.id}`, type: 'Group', display: this.getBackupCriteria(backup) }
        ];
      }
      if (!result.description) {
        result.description = this.getBackupSummary(backup);
      }
      if (!result.phase) {
        result.phase = {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/research-study-phase',
              code: (this.getBackupPhase(backup)),
              display: this.getBackupPhase(backup)
            }
          ],
          text: this.getBackupPhase(backup)
        };
      }
      if (!result.category) {
        result.category = [{ text: this.getBackupStudyType(backup) }];
      }
      //console.log(result);
      return result;
    } else {
      return result;
    }
  }
}
