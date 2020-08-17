import { ResearchStudy } from './research-study';

/**
 * The search entry mode valueset (from https://www.hl7.org/fhir/valueset-search-entry-mode.html).
 */
export type SearchEntryMode = 'match' | 'include' |	'outcome';

export interface SearchResult {
  mode?: string;
  score?: number;
}

export interface SearchBundleEntry {
  resource: ResearchStudy;
  search?: SearchResult;
}

export class SearchSet {
  // Class attributes
  resourceType = 'Bundle';
  type = 'searchset';
  /**
   * The total number of results. As a bundle support pagination, this defaults
   * to the current number of studies, but may be overridden. (See
   * https://www.hl7.org/fhir/http.html#paging for details on paging in FHIR.)
   * Note that addEntry will increment the total by one on each call.
   */
  total = 0;
  entry: SearchBundleEntry[] = [];

  /**
   * Creates a new SearchSet, adding the given array of studies with a default
   * score of 1.0.
   * @param studies the studies to add
   */
  constructor(studies?: ResearchStudy[]) {
    if (studies) {
      for (const study of studies) {
        this.addEntry(study);
      }
    }
  }

  /**
   * Add a study to the searchset.
   *
   * If the score is less than 0, it will be set to 0. Otherwise, if it isn't
   * a valid number, it will be set to 1.
   *
   * @param study the study to add
   * @param score the score, from [0..1]
   * @param mode the mode, defaults to 'match'
   */
  addEntry(study: ResearchStudy, score = 1, mode: SearchEntryMode = 'match'): void {
    // This somewhat bizarre logic is to catch NaN
    if (!(score > 0 && score < 1)) {
      if (score < 0) {
        score = 0;
      } else {
        score = 1;
      }
    }
    this.entry.push({ resource: study, search: { mode: mode, score: score } });
    this.total++;
  }
}

export default SearchSet;
