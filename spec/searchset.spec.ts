import SearchSet from '../src/searchset';
import { ResearchStudy } from '../src/research-study';

describe('SearchSet', () => {
  it('creates a SearchSet', () => {
    const searchSet = new SearchSet([]);
    expect(searchSet.total).toEqual(0);
    expect(searchSet.resourceType).toEqual('Bundle');
    expect(searchSet.type).toEqual('searchset');
    expect(searchSet.entry.length).toEqual(0);
  });

  it('wraps resources in entries', () => {
    const study = new ResearchStudy('test');
    const searchSet = new SearchSet([study]);
    expect(searchSet.total).toEqual(1);
    expect(searchSet.entry.length).toEqual(1);
    expect(searchSet.entry[0].resource).toEqual(study);
    expect(searchSet.entry[0].search).toBeDefined();
    if (searchSet.entry[0].search) {
      expect(searchSet.entry[0].search.score).not.toBeDefined();
      expect(searchSet.entry[0].search.mode).toEqual('match');
    }
  });

  describe('.addEntry', () => {
    const researchStudy = new ResearchStudy(1);
    let searchSet: SearchSet;
    beforeEach(() => { searchSet = new SearchSet(); });
    it('does not add a score if none is given', () => {
      searchSet.addEntry(researchStudy);
      expect(searchSet.entry.length).toEqual(1);
      expect(searchSet.entry[0].search).toBeDefined();
      // And prove it to TypeScript
      if (searchSet.entry[0].search)
        expect(searchSet.entry[0].search.score).not.toBeDefined();
    });
    it('converts NaN to 1.0', () => {
      searchSet.addEntry(researchStudy, Number.NaN);
      expect(searchSet.entry.length).toEqual(1);
      expect(searchSet.entry[0].search).toBeDefined();
      // And prove it to TypeScript
      if (searchSet.entry[0].search)
        expect(searchSet.entry[0].search.score).toEqual(1);
    });
    it('converts negative scores to 0', () => {
      searchSet.addEntry(researchStudy, -8);
      expect(searchSet.entry[0].search).toBeDefined();
      if (searchSet.entry[0].search)
      expect(searchSet.entry[0].search.score).toEqual(0);
    });
    it('accepts valid scores', () => {
      searchSet.addEntry(researchStudy, 0.25);
      expect(searchSet.entry[0].search).toBeDefined();
      if (searchSet.entry[0].search)
      expect(searchSet.entry[0].search.score).toEqual(0.25);
    });
    it('uses the match value', () => {
      searchSet.addEntry(researchStudy, -8, 'include');
      expect(searchSet.entry[0].search).toBeDefined();
      if (searchSet.entry[0].search)
      expect(searchSet.entry[0].search.mode).toEqual('include');
    });
    it('updates the total', () => {
      searchSet.total = 1;
      searchSet.addEntry(researchStudy);
      expect(searchSet.total).toEqual(2);
    });
    it('accepts an entry', () => {
      searchSet.addEntry({resource: new ResearchStudy(1), search: { score: 0.125, mode: 'match' } });
      expect(searchSet.entry.length).toEqual(1);
      expect(searchSet.entry[0].search.score).toEqual(0.125);
    });
  });
});
