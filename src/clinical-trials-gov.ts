import type { IncomingMessage } from 'http';
import https from 'https';
import { PagedStudies, Study } from './ctg-api';

import { debuglog } from 'util';

// Re-export the study type
export { Study };

/**
 * The default endpoint if none is specified: the clinicaltrials.gov v2 API
 * endpoint.
 */
export const DEFAULT_ENDPOINT = 'https://clinicaltrials.gov/api/v2';

type Logger = (message: string, ...param: unknown[]) => void;

/**
 * Class that provides a method for invoking the ClinicalTrials.gov V2 API using
 * the built-in Node.js HTTPS library.
 */
export class ClinicalTrialsGovAPI {
  _log: Logger;
  _endpoint: string;
  /**
   * Maximum number of redirects before giving up.
   */
  _maxRedirects = 10;
  constructor(options?: { logger?: Logger; endpoint?: string }) {
    this._log =
      options?.logger ??
      debuglog('ctgov-api', (log) => {
        this._log = log;
      });
    this._endpoint = options?.endpoint ?? DEFAULT_ENDPOINT;
  }

  /**
   * Fetches the given list of NCT IDs.
   * @param nctIds the NCT IDs to fetch
   * @returns a promise that resolves to the list of studies
   */
  fetchStudies(nctIds: string[]): Promise<Study[]> {
    const url = `${this._endpoint}/studies?filter.ids=${nctIds.join(',')}`;
    return new Promise<Study[]>((resolve, reject) => {
      this._log('Fetching [%s]', url);
      this.getUrl(
        url,
        (response) => {
          if (response.statusCode !== 200) {
            this._log('Error %d %s from ClinicalTrials.gov API', response.statusCode, response.statusMessage);
            // Resume the response to ensure it gets cleaned up properly
            response.resume();
            // Assume some sort of server error
            reject(new Error(`Server error: ${response.statusCode} ${response.statusMessage}`));
          } else {
            // Start receiving JSON data
            const data: string[] = [];
            response.setEncoding('utf8');
            response.on('data', (chunk) => {
              data.push(chunk);
            }).on('end', () => {
              // All data has been received, attempt to parse
              try {
                const json = JSON.parse(data.join(''));
                if (typeof json === 'object' && json != null) {
                  // Should be a PagedStudies object
                  resolve((json as PagedStudies).studies);
                }
              } catch (ex) {
                reject(ex);
              }
            })
          }
        },
        (error) => {
          reject(error);
        }
      );
    });
  }

  getUrl(url: string, callback: (response: IncomingMessage) => void, errorCallback: (err: Error) => void, redirects?: number): void {
    if (redirects && redirects > this._maxRedirects) {
      errorCallback(new Error(`Redirected ${redirects} times, exceeding max redirects of ${this._maxRedirects}`));
    }
    https
      .get(url, (response) => {
        // Handle redirects
        const statusCode = response.statusCode;
        if (statusCode && ((statusCode >= 301 && statusCode <= 303) || statusCode === 307 || statusCode === 308)) {
          const redirectUri = response.headers.location;
          if (redirectUri) {
            // Repeat the request
            this.getUrl(redirectUri, callback, errorCallback, typeof redirects == 'number' ? redirects + 1 : 1);
          }
          // Resume the response so it will eventually close but we no longer care about this response
          response.resume();
        } else {
          // Otherwise, pass it off to the callback
          callback(response);
        }
      })
      .on('error', errorCallback);
  }
}
