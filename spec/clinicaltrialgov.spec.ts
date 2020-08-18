import { ResearchStudy as ResearchStudyObj } from './../src/research-study';
import { ResearchStudy } from '../src/fhir-types';
import data from './data/resource.json'; //trial missing summary, inclusion/exclusion criteria, phase and study type
import * as ctg from '../src/clinicaltrialgov';
import * as fs from 'fs';
import filled from './data/complete_study.json';

describe('.isValidNCTNumber', () => {
  it('accepts valid numbers', () => {
    expect(ctg.isValidNCTNumber('NCT12345678')).toBeTrue();
    expect(ctg.isValidNCTNumber('NCT00000000')).toBeTrue();
  });
  it('rejects invalid numbers', () => {
    expect(ctg.isValidNCTNumber('NCT1234567')).toBeFalse();
    expect(ctg.isValidNCTNumber('NCT123456789')).toBeFalse();
    expect(ctg.isValidNCTNumber('blatantly wrong')).toBeFalse();
    expect(ctg.isValidNCTNumber('')).toBeFalse();
  });
});

describe('.findNCTNumber', () => {
  it('finds an NCT number with the proper coding system', () => {
    expect(
      ctg.findNCTNumber({
        resourceType: 'ResearchStudy',
        identifier: [
          {
            system: 'other',
            value: 'ignoreme'
          },
          {
            system: ctg.CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
            value: 'test'
          }
        ]
      })
    ).toEqual('test');
  });
  it('finds an NCT number based on regexp', () => {
    expect(
      ctg.findNCTNumber({
        resourceType: 'ResearchStudy',
        identifier: [
          {
            system: 'other',
            value: 'ignoreme'
          },
          {
            system: 'invalidsystem',
            value: 'NCT12345678'
          }
        ]
      })
    ).toEqual('NCT12345678');
  });
  it('returns null with no valid NCT number', () => {
    expect(
      ctg.findNCTNumber({
        resourceType: 'ResearchStudy',
        identifier: [
          {
            system: 'other',
            value: 'ignoreme'
          },
          {
            system: 'invalid',
            value: 'alsoignored'
          }
        ]
      })
    ).toBeNull();
  });
  it('returns null with no identifier', () => {
    expect(
      ctg.findNCTNumber({
        resourceType: 'ResearchStudy',
        identifier: []
      })
    ).toBeNull();
    expect(ctg.findNCTNumber({ resourceType: 'ResearchStudy' })).toBeNull();
  });
});

describe('ClinicalTrialGovService', () => {
  let study: ResearchStudy = data.entry[0].resource as ResearchStudy;
  const nctID = ctg.findNCTNumber(study);
  if (nctID === null) {
    // This indicates a failure in test cases
    throw new Error('ResearchStudy has no NCT number');
  }
  const nctIds = [nctID];
  beforeEach(function () {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;
  });
  afterEach(function () {
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 5000;
  });
  const filepath = './src';
  let checker: ctg.ClinicalTrialGovService;
  let trial: ctg.TrialBackup;
  beforeAll(async function () {
    const downloader = new ctg.ClinicalTrialGovService(filepath);
    await downloader.downloadTrials(nctIds);
    study = downloader.updateTrial(study);
    console.log(JSON.stringify(study));
    checker = new ctg.ClinicalTrialGovService(filepath);
    trial = checker.getDownloadedTrial(nctID);
  });

  it('has backup criteria', () => {
    expect(checker.getBackupCriteria(trial)).toBeDefined();
  });
  it('has backup description', () => {
    expect(checker.getBackupSummary(trial)).toBeDefined();
  });
  it('has backup phase', () => {
    expect(checker.getBackupPhase(trial)).toBeDefined();
  });
  it('has backup study type', () => {
    expect(checker.getBackupStudyType(trial)).toBeDefined();
  });

  //ctg.downloadRemoteBackups(nctIds).then( (); => {
  //  study = updateTrial(study);
  //console.log(study);
  it('fills in inclusion criteria', () => {
    expect(study.enrollment).toBeDefined();
    if (study.enrollment) {
      // Prove enrollment exists to TypeScript
      expect(study.enrollment.length).toBeGreaterThan(0);
      expect(study.enrollment[0].display).toBeDefined();
    }
  });

  it('fills in phase', () => {
    expect(study.phase).toBeDefined();
    if (study.phase) expect(study.phase.text).toBe('Phase 3');
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

  it('returns same object on empty study', () => {
    const empty = new ResearchStudyObj(2);
    const backup_service = new ctg.ClinicalTrialGovService(filepath);
    expect(backup_service.updateTrial(empty)).toBe(empty);
  });

  it('returns on filled out study', () => {
    const study_filled = filled as ResearchStudy;
    const backup_service = new ctg.ClinicalTrialGovService(filepath);
    expect(backup_service.updateTrial(study_filled)).toBeDefined();
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
