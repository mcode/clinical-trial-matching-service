import {
  BundleEntry,
  ResearchStudy,
  SearchEntryMode,
  SearchResult,
  SearchSet as SearchSetBundle,
  isResearchStudy
} from './fhir-types';

/**
 * Same as a BundleEntry but with the search parameters required.
 */
export interface SearchBundleEntry extends BundleEntry {
  search: SearchResult;
}

export class SearchSet implements SearchSetBundle {
  // Yes, this looks weird. Yes, this is required: otherwise the infered type is string and not the constant string.
  resourceType: 'Bundle' = 'Bundle';
  // Class attributes
  type: 'searchset' = 'searchset';
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
   * @param entries the entries to add
   */
  constructor(entries?: Array<ResearchStudy | SearchBundleEntry>) {
    if (entries) {
      this.addEntries(...entries);
    }
  }

  addEntries(...entries: Array<ResearchStudy | SearchBundleEntry>): void {
    for (const entry of entries) {
      this.addEntry(entry);
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
  addEntry(entry: SearchBundleEntry): void;
  addEntry(study: ResearchStudy, score?: number, mode?: SearchEntryMode): void;
  // This overload is sort of implied, but TypeScript needs us to give it outright
  addEntry(studyOrEntry: SearchBundleEntry | ResearchStudy): void;
  addEntry(studyOrEntry: SearchBundleEntry | ResearchStudy, score = 1, mode: SearchEntryMode = 'match'): void {
    const entry: SearchBundleEntry = isResearchStudy(studyOrEntry)
      ? { resource: studyOrEntry, search: { mode: mode } }
      : studyOrEntry;
    // Grab the score out of the entry if one was given
    if (entry.search.score) score = entry.search.score;
    // This somewhat bizarre logic is to catch NaN
    if (!(score >= 0 && score =< 1)) {
      if (score < 0) {
        score = 0;
      } else {
        score = 1;
      }
    }
    // Now that we've made score valid, use it
    entry.search.score = score;
    this.entry.push(entry);
    this.total++;
  }
}

export default SearchSet;
