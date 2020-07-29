import SearchSet from '../src/searchset';
import { BasicResearchStudy } from '../src/research-study';

describe('SearchSet', () => {
  it('creates a SearchSet', () => {
    const searchSet = new SearchSet([]);
    expect(searchSet.total).toEqual(0);
    expect(searchSet.resourceType).toEqual('Bundle');
    expect(searchSet.type).toEqual('searchset');
    expect(searchSet.entry.length).toEqual(0);
  });

  it('wraps resources in entries', () => {
    const study = new BasicResearchStudy('test');
    const searchSet = new SearchSet([study]);
    expect(searchSet.total).toEqual(1);
    expect(searchSet.entry.length).toEqual(1);
    expect(searchSet.entry[0].resource).toEqual(study);
  });
});
