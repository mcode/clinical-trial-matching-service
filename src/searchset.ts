import { ResearchStudy } from './fhir-types';
export interface SearchResult {
  mode: string;
  score: number;
}

export interface SearchBundleEntry {
  resource: ResearchStudy;
  search?: SearchResult;
}

export class SearchSet {
  // Class attributes
  resourceType = 'Bundle';
  type = 'searchset';
  total = 0;
  entry: SearchBundleEntry[] = [];

  constructor(studies: ResearchStudy[]) {
    this.total = studies.length;

    for (const study of studies) {
      this.entry.push({ resource: study });
    }
  }
}

export default SearchSet;