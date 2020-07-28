import { BasicResearchStudy } from '../src/research-study';

describe('BasicResearchStudy', () => {
  it('converts to JSON properly', () => {
    const study = new BasicResearchStudy(1);
    // Keys should be in a consistent order, thankfully
    expect(JSON.stringify(study)).toEqual('{"resourceType":"ResearchStudy","id":"study-1"}');
  });
});
