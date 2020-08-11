import { ResearchStudyInterface } from './../src/research-study';
import data from './data/resource.json'; //trial missing summary, inclusion/exclusion criteria, phase and study type
import * as trialbackup from '../src/trialbackup';
import * as fs from 'fs';
export function updateTrial(result: ResearchStudyInterface): ResearchStudyInterface {
  const backup = trialbackup.getDownloadedTrial(result.identifier[0].value);
  if (!result.enrollment) {
    result.enrollment = [
      { reference: `#group${result.id}`, type: 'Group', display: trialbackup.getBackupCriteria(backup) }
    ];
  }

  if (!result.description) {
    result.description = trialbackup.getBackupSummary(backup);
  }
  if (!result.phase) {
    result.phase = {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/research-study-phase',
          code: trialbackup.getBackupPhase(backup),
          display: trialbackup.getBackupPhase(backup)
        }
      ],
      text: trialbackup.getBackupPhase(backup)
    };
  }
  if (!result.category) {
    result.category = [{ text: trialbackup.getBackupStudyType(backup) }];
  }
  //console.log(result);
  return result;
}

describe('backup tests', () => {
  let study: ResearchStudyInterface = data as ResearchStudyInterface;
  //convert trialscope object to research study
  const nctIds = [study.identifier[0].value];
  beforeEach(function () {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
  });
  afterEach(function () {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 5000;
  });
  beforeAll(async function () {
    await trialbackup.downloadRemoteBackups(nctIds);
    study = updateTrial(study);
  });
  //trialbackup.downloadRemoteBackups(nctIds).then( () => {
  //  study = updateTrial(study);
  //console.log(study);
  it('fills in inclusion criteria ', () => {
    expect(study.enrollment[0].display).toBeDefined();
  });

  it('fills in phase', () => {
    expect(study.phase.text).toBe('Phase 2');
  });

  it('fills in study type', () => {
    expect(study.category[0].text).toBe('Interventional');
  });

  it('fills in description', () => {
    expect(study.description).toBeDefined();
  });

  afterAll(function (done) {
    fs.unlink('src/backup.zip', (err) => {
      if (err) {
        console.log(err);
      }
    });

    fs.rmdir('src/backups/', { recursive: true }, (err) => {
      if (err) {
        console.log(err);
      }
    });
    done();
  });
});
