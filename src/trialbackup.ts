import  StreamZip = require('node-stream-zip');
import fs from 'fs';
import * as parser from 'xml2json';
import { exec } from 'child_process';
import * as https from 'https';
import { ResearchStudy } from './fhir-types';


/**
 * This is the service that handles fetching data.
 */
export class ClinicalTrialGov {
  path: string;
  constructor(public dataDir: string) {
    this.path = dataDir;
  }
  downloadRemoteBackups(ids: string[]): Promise<void> {
    const url = 'https://clinicaltrials.gov/ct2/download_studies?term=' + ids.join('+OR+');;
    console.log(url);
    const file = fs.createWriteStream(`${this.path}/backup.zip`);

    return new Promise<void>((resolve, reject) => {
      try {
        const request = https.get(url, function (this: ClinicalTrialGov , response) {
          response.pipe(file).on('close', () => {
            //const StreamZip = require('node-stream-zip');
            const zip = new StreamZip({ 
                file: String(file.path),
                storeEntries: true
            });
            //fs.createReadStream(`${this.path}/backup.zip`).pipe( unzip.Extract({ path: `${this.path}/backups` })); //.on('close'), () => {resolve();});
            // exec(`unzip ${this.path}/backup -d ${this.path}/backups/`, (error, stdout, stderr) => {
            //   if (error) console.log(error);
            //   resolve();
            // });
            zip.on('ready', () => {
                fs.mkdirSync(`${this.path}/backups`);
                zip.extract(null, `${this.path}/backups`, (err, count) => {
                    if (err) console.log(err);
                    zip.close();
                });
            });
          });
        });
      } catch (err) {
        reject(err);
      }
    });
  }
}


/*
This file contains a backup system for finding necessary trial information if your matching service does not provide it:
  Using the given trial's nctId, use getBackupTrial to retrieve the trial's info from a local data store within AllPublicXML
  Use the rest of the getBackup functions to retrieve the missing information in question
*/

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
 * Finds the NCT number specified for the given ResearchStudy, assuming there is
 * one. This requires there to be an identifier on the ResearchStudy that
 * belongs to the coding system "http://clinicaltrials.gov/". (If no such
 * identifier is found, it will look for the first identifier that matches
 * /^NCT[0-9]{8}$/.)
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
      if (typeof identifier.value === 'string' && /^NCT[0-9]{8}$/.test(identifier.value))
        return identifier.value;
    }
  }
  // Return null on failures
  return null;
}

/** System to fill in data on research studies */

export class BackupSystem {
  path: string;
  constructor(public dataDir: string) {
      this.path = dataDir;
  }
/**depreceated function
getBackupTrial(nctId: string): TrialBackup {
  const filePath = `src/AllPublicXML/${nctId.substr(0, 7)}xxxx/${nctId}.xml`;
  const data = fs.readFileSync(filePath, { encoding: 'utf8' });
  const json: TrialBackup = JSON.parse(parser.toJson(data)) as TrialBackup;
  return json;
}
*/
  getDownloadedTrial(nctId: string): TrialBackup {
    const filePath = `${this.path}/backups/${nctId}.xml`;
    const data = fs.readFileSync(filePath, { encoding: 'utf8' });
    const json: TrialBackup = JSON.parse(parser.toJson(data)) as TrialBackup;
    return json;
  }


  getBackupCriteria(trial: TrialBackup): string {
    const criteria: string = trial.clinical_study.eligibility.criteria.textblock;
    return criteria;
  }

  getBackupSummary(trial: TrialBackup): string {
    const summary: string = trial.clinical_study.brief_summary.textblock;
    return summary;
  }

  getBackupPhase(trial: TrialBackup): string {
    const phase: string = trial.clinical_study.phase;
    return phase;
  }

  getBackupStudyType(trial: TrialBackup): string {
    const studytype: string = trial.clinical_study.study_type;
    return studytype;
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
