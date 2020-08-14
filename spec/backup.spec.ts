import { ResearchStudy } from '../src/fhir-types';
import data from './data/resource.json'; //trial missing summary, inclusion/exclusion criteria, phase and study type
import * as trialbackup from '../src/trialbackup';
import * as fs from 'fs';

describe('.findNCTNumber', () => {
  it('finds an NCT number with the proper coding system', () => {
    expect(trialbackup.findNCTNumber({
      resourceType: 'ResearchStudy',
      identifier: [
        {
          'system': 'other',
          'value': 'ignoreme'
        },
        {
          'system': trialbackup.CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
          'value': 'test'
        }
      ]
    })).toEqual('test');
  });
  it('finds an NCT number based on regexp', () => {
    expect(trialbackup.findNCTNumber({
      resourceType: 'ResearchStudy',
      identifier: [
        {
          'system': 'other',
          'value': 'ignoreme'
        },
        {
          'system': 'invalidsystem',
          'value': 'NCT12345678'
        }
      ]
    })).toEqual('NCT12345678');
  });
  it('returns null with no valid NCT number', () => {
    expect(trialbackup.findNCTNumber({
      resourceType: 'ResearchStudy',
      identifier: [
        {
          'system': 'other',
          'value': 'ignoreme'
        },
        {
          'system': 'invalid',
          'value': 'alsoignored'
        }
      ]
    })).toBeNull();
  });
  it('returns null with no identifier', () => {
    expect(trialbackup.findNCTNumber({
      resourceType: 'ResearchStudy',
      identifier: [ ]
    })).toBeNull();
    expect(trialbackup.findNCTNumber({ resourceType: 'ResearchStudy' })).toBeNull();
  });
});

describe('backup tests', () => {
  let study: ResearchStudy = data.entry[0].resource as ResearchStudy;
  const nctID = trialbackup.findNCTNumber(study);
  if (nctID === null) {
    throw new Error('ResearchStudy has no NCT number');
  }
  const nctIds = [ nctID ];
  beforeEach(function () {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
  });
  afterEach(function () {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 5000;
  });
  const filepath = './src';
  let checker : trialbackup.BackupSystem;
  let trial : trialbackup.TrialBackup;
  beforeAll(async function () {
    
    const downloader = new trialbackup.ClinicalTrialGov(filepath)
    await downloader.downloadRemoteBackups(nctIds);
    const backup = new trialbackup.BackupSystem(filepath);
    study = backup.updateTrial(study);
    checker = new trialbackup.BackupSystem(filepath);
    trial = checker.getDownloadedTrial(nctID);
  });
 
  it('has backup criteria' , () => {
    expect(checker.getBackupCriteria(trial)).toBeDefined();

  });
  it('has backup description' , () => {
    expect(checker.getBackupSummary(trial)).toBeDefined();

  });
  it('has backup phase' , () => {
    expect(checker.getBackupPhase(trial)).toBeDefined();

  });
  it('has backup study type' , () => {
    expect(checker.getBackupStudyType(trial)).toBeDefined();

  });
  //trialbackup.downloadRemoteBackups(nctIds).then( (); => {
  //  study = updateTrial(study);
  //console.log(study);
  it('fills in inclusion criteria ', () => {
    expect(study.enrollment).toBeDefined();
    if (study.enrollment) {
      // Prove enrollment exists to TypeScript
      expect(study.enrollment.length).toBeGreaterThan(0);
      expect(study.enrollment[0].display).toBeDefined();
    }
  });

  it('fills in phase', () => {
    expect(study.phase).toBeDefined();
    if (study.phase)
      expect(study.phase.text).toBe('Phase 3');
  });

  it('fills in study type', () => {
    expect(study.category).toBeDefined();
    if (study.category) {
      expect(study.category.length).toBeGreaterThan(0);
      expect(study.category[0].text).toBe('Interventional');
    }
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
