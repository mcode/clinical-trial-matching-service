import * as ctms from '../src/index';

describe('index', () => {
  it('exports symbols', () => {
    // Not sure what all to try and test here
    expect(ctms.ResearchStudy).toBeDefined();
    expect(ctms.ClinicalTrialMatchingService).toBeDefined();
  });
});
