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
  /**
   * If defined, a prefix which will be prepended to each mapped URL. If this
   * is not specified by the PASSENGER_BASE_URI is defined in the process
   * environment, then PASSENGER_BASE_URI will be used as the prefix. (To
   * prevent that, you can set the prefix explicitly to '/' which will prevent
   * any prefix from being used.)
   */
  urlPrefix?: string;
}

function isConfiguration(o: unknown): o is Configuration {
  if (typeof o !== 'object' || o === null)
    return false;
  // For now, an object is a configuration object if every key is a string or number
  const obj = o as Record<string | number | symbol, unknown>;
  for (const k in obj) {
    const t = typeof obj[k];
    if (t !== 'string' && t !== 'number' && t !== 'undefined')
      return false;
  }
  return true;
}

/**
 * Server options - configuration options that are more involved that simple
 * strings.
 */
export interface ServerOptions {
  /**
   * If given, use the given Express engine rather than creating a new one.
   */
  appEngine?: express.Application;
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
  constructor(matcher: ClinicalTrialMatcher);
  constructor(matcher: ClinicalTrialMatcher, options: ServerOptions);
  constructor(matcher: ClinicalTrialMatcher, configuration: Configuration, options?: ServerOptions);
  constructor(public matcher: ClinicalTrialMatcher, configurationOrOptions?: Configuration | ServerOptions, options?: ServerOptions) {
    if (isConfiguration(configurationOrOptions)) {
      this.configuration = configurationOrOptions;
    } else {
      // If here, no configuration was given so use whatever options we have
      options = configurationOrOptions;
      this.configuration = {};
    }
    // if called with only options, options will have been moved to the options variable
    this.app = options && options.appEngine ? options.appEngine : express();

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

    let prefix: string;
    if (this.configuration.urlPrefix) {
      prefix = this.configuration.urlPrefix;
    } else if (process.env['PASSENGER_BASE_URI']) {
      prefix = process.env['PASSENGER_BASE_URI'];
    } else {
      prefix = '/';
    }
    // Make sure the prefix is of the form /path without a trailing slash and
    // with a leading slash
    if (!prefix.startsWith('/')) {
      prefix = '/' + prefix;
    }
    // Remove the trailing slash - note that this means a prefix of '/' becomes
    // the empty string, WHICH IS EXPECTED
    if (prefix.endsWith('/')) {
      prefix = prefix.substr(0, prefix.length - 1);
    }

    // Default callback
    this.app.get(prefix.length > 0 ? prefix : '/', (_req, res) => {
      res.status(200).send('Hello from the Clinical Trial Matching Service');
    });

    this.app.post(prefix + '/getClinicalTrial', (request, response) => {
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
    const patientBundle = (typeof postBody === 'string'
      ? JSON.parse(postBody)
      : postBody) as Record<string, unknown>;
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
  }

  /**
   * Closes the server if it's running. Unlike the underlying service function,
   * no error is raised if the server wasn't running.
   */
  close(): Promise<void> {
    if (this._server === null) {
      return Promise.resolve();
    } else {
      const server: http.Server = this._server;
      return new Promise<void>((resolve, reject) => {
        server.close((err?: Error) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
        this._server = null;
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
      // It's unclear if we can pass undefined to listen
      const server = host ? this.app.listen(port, host) : this.app.listen(port);
      this._server = server;
      server.once('error', (error: Error) => {
        reject(error);
      });
      server.once('listening', () => {
        const listeningOn = server.address();
        if (typeof listeningOn === 'object' && listeningOn !== null) {
          this.log(`Server listening on ${listeningOn.address}:${listeningOn.port}...`);
        } else {
          // Should not be possible at this point but whatever
          this.log(`Server listening on ${listeningOn === null ? 'unknown address' : listeningOn}.`);
        }
        resolve(server);
      });
    });
  }
}

export default ClinicalTrialMatchingService;
