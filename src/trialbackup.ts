import fs from 'fs';
import * as parser from 'xml2json';
import { exec } from 'child_process';
import * as https from 'https';

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

export function getBackupTrial(nctId: string): TrialBackup {
  const filePath = `src/AllPublicXML/${nctId.substr(0, 7)}xxxx/${nctId}.xml`;
  const data = fs.readFileSync(filePath, { encoding: 'utf8' });
  const json: TrialBackup = JSON.parse(parser.toJson(data)) as TrialBackup;
  return json;
}
export function getDownloadedTrial(nctId: string): TrialBackup {
  const filePath = `src/backups/${nctId}.xml`;
  const data = fs.readFileSync(filePath, { encoding: 'utf8' });
  const json: TrialBackup = JSON.parse(parser.toJson(data)) as TrialBackup;
  return json;
}
export function downloadRemoteBackups(ids: string[]) {
  let url = 'https://clinicaltrials.gov/ct2/download_studies?term=';
  for (const id of ids) {
    url += `${id}+OR+`;
  }
  //remove trailing +OR+
  url = url.slice(0, -4);
  console.log(url);
  const file = fs.createWriteStream('src/backup.zip');

  return new Promise<void>((resolve, reject) => {
    try {
      const request = https.get(url, function (response) {
        response.pipe(file).on('close', () => {
          exec('unzip src/backup -d src/backups/', (error, stdout, stderr) => {
            if (error) console.log(error);
            resolve();
          });
        });
      });
    } catch (err) {
      reject(err);
    }
  });
}

export function getBackupCriteria(trial: TrialBackup): string {
  const criteria: string = trial.clinical_study.eligibility.criteria.textblock;
  return criteria;
}

export function getBackupSummary(trial: TrialBackup): string {
  const summary: string = trial.clinical_study.brief_summary.textblock;
  return summary;
}

export function getBackupPhase(trial: TrialBackup): string {
  const phase: string = trial.clinical_study.phase;
  return phase;
}

export function getBackupStudyType(trial: TrialBackup): string {
  const studytype: string = trial.clinical_study.study_type;
  return studytype;
}