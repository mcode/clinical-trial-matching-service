import { BundleEntry, BundleEntrySearch, ResearchStudy } from 'fhir/r4';
import { isResearchStudy } from './fhir-type-guards';
import { SearchSet as SearchSetBundle } from './server';

/**
 * Same as a BundleEntry but with the search parameters required.
 */
export interface SearchBundleEntry extends BundleEntry<ResearchStudy> {
  search: BundleEntrySearch;
}

export type SearchEntryMode = Exclude<BundleEntrySearch['mode'], undefined>;

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
   * Add a study to the searchset with no defined score and the search mode set
   * to "match".
   *
   * @param study the study to add
   */
  addEntry(entry: SearchBundleEntry): void;
  /**
   * Add a study to the searchset with no score and the given search mode
   *
   * @param study the study to add
   * @param mode the mode
   */
  addEntry(study: ResearchStudy, mode: SearchEntryMode): void;
  /**
   * Add a study to the searchset.
   *
   * If the score is not given, then the score will be left unset in the entry.
   * Otherwise, if the score will be clamped to the range [0..1] (values less
   * than 0 become 0, values greater than 1 become 1). NaN is treated as
   * "undefined" and leaves the score unset.
   *
   * @param study the study to add
   * @param score the score, from [0..1]
   * @param mode the mode, defaults to 'match'
   */
  addEntry(study: ResearchStudy, score?: number, mode?: SearchEntryMode): void;
  // This overload is sort of implied, but TypeScript needs us to give it outright
  addEntry(studyOrEntry: SearchBundleEntry | ResearchStudy): void;
  addEntry(
    studyOrEntry: SearchBundleEntry | ResearchStudy,
    scoreOrMode: SearchEntryMode | number | null = null,
    mode?: SearchEntryMode
  ): void {
    let score = null;
    if (typeof scoreOrMode === 'string') {
      // There is no overload that allows two modes so if anyone did that they
      // did it outside of TypeScript so go ahead and ignore them
      mode = scoreOrMode;
    } else if (typeof scoreOrMode === 'number') {
      score = scoreOrMode;
    }
    const entry: SearchBundleEntry = isResearchStudy(studyOrEntry)
      ? { resource: studyOrEntry, search: { mode: mode ?? 'match' } }
      : studyOrEntry;
    // Grab the score out of the entry if one was given
    // (See above on how there is no overload for both giving an entry and a
    // score - if you do that, you're ignoring TypeScript anyway)
    if (entry.search.score) score = entry.search.score;
    if (score !== null && !Number.isNaN(score)) {
      // Clamp the range of the score from 0 to 1
      entry.search.score = Math.min(1, Math.max(score, 0));
    }
    this.entry.push(entry);
    this.total++;
  }
}

export default SearchSet;
