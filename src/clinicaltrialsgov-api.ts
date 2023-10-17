/**
 * Module for invoking the Clinical Trials.gov API.
 */
import { debuglog } from 'util';
import { PagedStudies, Study } from './ctg-api';
import fetch from 'node-fetch';

// Re-export the study type
export { Study };

/**
 * The default endpoint if none is specified: the clinicaltrials.gov v2 API
 * endpoint.
 */
export const DEFAULT_ENDPOINT = 'https://clinicaltrials.gov/api/v2';

type Logger = (message: string, ...param: unknown[]) => void;

/**
 * Type guard for checking the response from the server. Exported for tests.
 * @param o the object to check
 * @returns
 */
export function isPagedStudies(o: unknown): o is PagedStudies {
  if (typeof o !== 'object' || o === null) {
    return false;
  }
  const maybeStudies = (o as PagedStudies).studies;
  if (!Array.isArray(maybeStudies)) {
    return false;
  }
  // Make sure the studies array are all at least valid enough to not crash everything
  return maybeStudies.every((e) => typeof e === 'object' && e !== null);
}

/**
 * Class that provides a method for invoking the ClinicalTrials.gov V2 API using
 * the built-in Node.js HTTPS library.
 */
export class ClinicalTrialsGovAPI {
  private _log: Logger;
  private _endpoint: string;
  /**
   * Maximum number of redirects before giving up.
   */
  _maxRedirects = 10;
  constructor(options?: { logger?: Logger; endpoint?: string }) {
    this._log =
      options?.logger ??
      debuglog('ctgov-api', /* istanbul ignore next: not worth the effort to mock/test */ (log) => {
        this._log = log;
      });
    this._endpoint = options?.endpoint ?? DEFAULT_ENDPOINT;
  }

  /**
   * Fetches the given list of NCT IDs.
   * @param nctIds the NCT IDs to fetch
   * @returns a promise that resolves to the list of studies
   */
  async fetchStudies(nctIds: string[], pageSize?: number): Promise<Study[]> {
    let url = `${this._endpoint}/studies?filter.ids=${nctIds.join(',')}`;
    if (pageSize && pageSize > 0) {
      url += `&pageSize=${pageSize}`;
    }
    const studies: Study[] = [];
    let nextPageToken: string | undefined;
    do {
      const result = await this.getUrl(nextPageToken ? `${url}&pageToken=${nextPageToken}` : url);
      if (isPagedStudies(result)) {
        studies.push(...result.studies);
        nextPageToken = result.nextPageToken;
      } else {
        throw new Error('Server returned a success response, but the result could not be parsed.');
      }
    } while (nextPageToken);
    return studies;
  }

  async getUrl(url: string): Promise<unknown> {
    this._log('Fetching [%s]', url);
    const response = await fetch(url);
    if (response.ok) {
      return response.json();
    } else {
      throw new Error(`Error from ClinicalTrials.gov server: ${response.status} ${response.statusText}`);
    }
  }
}

export default ClinicalTrialsGovAPI;
