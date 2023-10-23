import * as ctms from '../src/index';

describe('index', () => {
  it('exports symbols', () => {
    // Not sure what all to try and test here
    expect(ctms.ResearchStudy).toBeDefined();
    expect(ctms.ClinicalTrialMatchingService).toBeDefined();
    expect(ctms.ClinicalTrialsGovAPI).toBeDefined();
    expect(ctms.updateResearchStudyWithClinicalStudy).toBeDefined();
    expect(ctms.CodeMapper).toBeDefined();
    expect(ctms.CodeSystemEnum).toBeDefined();
    expect(ctms.ClientError).toBeDefined();
    expect(ctms.ServerError).toBeDefined();
    // This is dumb but otherwise Istanbul complains they were never called
    expect(new ctms.ClientError('example')).toBeInstanceOf(Error);
    expect(new ctms.ServerError('example')).toBeInstanceOf(Error);
  });
});
