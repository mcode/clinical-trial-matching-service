import express from 'express';
import bodyParser from 'body-parser';
import { Bundle, SearchSet, isBundle } from './fhir-types';
import { isHttpError, restrictToHttpErrors } from './errors';
import * as http from 'http';

export type ClinicalTrialMatcher = (patientBundle: Bundle) => Promise<SearchSet>;

/**
 * Server configuration.
 */
export interface Configuration {
  // This may be further loosened in the future
  [key: string]: string | number | undefined;
  /**
   * The port to listen on (must be in the range 0-65535, if outside or unset,
   * the default of 3000 is used).
   */
  port?: number;
  /**
   * The host address to bind to, if unset, uses the default from
   * http.Server#listen.
   */
  host?: string;
}

/**
 * The JSON request from the client. This exists more for documentation purposes
 * than anything else.
 */
export interface ClinicalTrialMatchServiceRequest {
  /**
   * The patient data. If a string, it's parsed as JSON. The string use should
   * be deprecated.
   */
  patientData: Bundle | string;
}

export class ClinicalTrialMatchingService {
  public readonly app: express.Application;
  private readonly configuration: Configuration;
  private _server: http.Server | null = null;

  /**
   * Create a new service.
   * @param matcher the matcher function
   * @param configuration the server configuration
   */
  constructor(public matcher: ClinicalTrialMatcher, configuration?: Configuration) {
    this.app = express();
    this.configuration = configuration ? configuration : {};
    this.app.use(
      bodyParser.json({
        // Need to increase the payload limit to receive patient bundles
        limit: '10MB'
      })
    );

    // Set up CORS
    this.app.use(function (_req, res, next) {
      // Website you wish to allow to connect
      res.setHeader('Access-Control-Allow-Origin', '*');

      // Request methods you wish to allow
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');

      // Request headers you wish to allow
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Cache-Control, Pragma, Origin, Authorization, Content-Type, X-Requested-With, WU-Api-Key, WU-Api-Secret'
      );

      next();
    });

    // Default callback
    this.app.get('/', function (_req, res) {
      res.status(200).send('Hello from the Clinical Trial Matching Service');
    });

    this.app.post('/getClinicalTrial', (request, response) => {
      this.getClinicalTrial(request, response);
    });
  }

  /**
   * Gets the server object, if it's running, or `null` if it isn't.
   */
  get server(): http.Server | null {
    return this._server;
  }

  /**
   * Gets the configured port. If the port configuration is invalid, this
   * returns the default port, 3000.
   */
  get port(): number {
    if (typeof this.configuration.port === 'number') {
      const port = Math.floor(this.configuration.port);
      if (port >= 0 && port <= 0xFFFF)
        return port;
    }
    return 3000;
  }

  get host(): string | undefined {
    return typeof this.configuration.host === 'string' ? this.configuration.host : undefined;
  }

  getClinicalTrial(request: express.Request, response: express.Response): void {
    const postBody = request.body as Record<string, unknown>;
    if ('patientData' in postBody) {
      const patientBundle = (typeof postBody.patientData === 'string'
        ? JSON.parse(postBody.patientData)
        : postBody.patientData) as Record<string, unknown>;
      if (isBundle(patientBundle)) {
        // Error handler for exceptions raised (as it should be handled on the
        // resulting Promise and if invoking the matcher itself fails)
        const handleError = (error: unknown): void => {
          if (isHttpError(error)) {
            response.status(restrictToHttpErrors(error.httpStatus)).send({ error: error.message });
          } else {
            console.error('An unexpected internal server error occurred:');
            console.error(error);
            response.status(500).send({ error: 'Internal server error', exception: Object.prototype.toString.call(error) as string });
          }
        };
        try {
          this.matcher(patientBundle)
            .then((result) => {
              response.status(200).send(JSON.stringify(result));
            })
            .catch(handleError);
        } catch (ex) {
          handleError(ex);
        }
      } else {
        response.status(400).send({ error: 'Invalid patientBundle' });
      }
    } else {
      // request missing json fields
      response.status(400).send({ error: 'Request missing required fields' });
    }
  }

  /**
   * Closes the server if it's running. Unlike the underlying service function,
   * no error is raised if the server wasn't running.
   */
  close(): Promise<void> {
    if (this._server === null) {
      return Promise.resolve();
    } else {
      return new Promise<void>((resolve) => {
        if (this._server === null) {
          // It's unclear how this could happen, but in theory if close was
          // called within a single event loop, server could be set to null
          // within one Promise before the other Promise got a chance to run.
          // Handle by resolving immediately: someone else closed the server
          // if it's null.
          resolve();
        } else {
          this._server.close(() => {
            resolve();
          });
          this._server = null;
        }
      });
    }
  }

  /**
   * Logs a message. The default simply invokes console.log, but subclasses
   * may override to use more fine-grained logging.
   * @param message the message to log
   */
  log(message: string): void {
    console.log(message);
  }

  /**
   * Starts the server running, returning the newly running instance. If the
   * server is already running, simply returns the already running instance.
   */
  listen(): Promise<http.Server> {
    if (this._server !== null) {
      return Promise.resolve(this._server);
    }
    return new Promise((resolve, reject) => {
      const port = this.port;
      const host = this.host;
      const callback = () => {
        // Callback shouldn't fire if the server is null but if it does we're in
        // a weird state. Reject the promise in this instance.
        if (this._server === null) {
          reject(new Error('_server is null on listen callback (listen callback ran after server was closed?)'));
          return;
        }
        // Remove the error handler - further errors should not reject this
        // promise
        this._server.off('error', errorHandler);
        const listeningOn = this._server.address();
        if (typeof listeningOn === 'object' && listeningOn !== null) {
          this.log(`Server listening on ${listeningOn.address}:${listeningOn.port}...`);
        } else {
          // Should not be possible at this point but whatever
          this.log(`Server listening on ${listeningOn === null ? 'unknown address' : listeningOn}.`);
        }
        resolve(this._server);
      };
      const errorHandler = (error: Error) => {
        if (this._server !== null) this._server.off('error', errorHandler);
        reject(error);
      };
      // It's unclear if we can pass undefined to listen
      this._server = host ? this.app.listen(port, host, callback) : this.app.listen(port, callback);
      if (this._server === null) {
        reject(new Error('app.listen returned null'));
      } else {
        this._server.on('error', errorHandler);
      }
    });
  }
}

export default ClinicalTrialMatchingService;
