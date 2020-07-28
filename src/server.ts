import express from 'express';
import bodyParser from 'body-parser';
import Bundle, { isBundle } from './bundle';
import { SearchSet } from './searchset';
import RequestError from './request-error';
import * as http from 'http';

export type ClinicalTrialMatcher = (patientBundle: Bundle) => Promise<SearchSet>;

export interface Configuration {
  // This may be further loosened in the future
  [key: string]: string | number | undefined;
  port?: number;
  host?: string;
}

export class ClinicalTrialMatchingService {
  public readonly app: express.Application;
  private readonly configuration: Configuration;
  private _server: http.Server | null = null;

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
    return this.server;
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

  getClinicalTrial(request: express.Request, response: express.Response): void {
    const postBody = request.body as Record<string, unknown>;
    if ('patientData' in postBody) {
      const patientBundle = (typeof postBody.patientData === 'string'
        ? JSON.parse(postBody.patientData)
        : postBody.patientData) as Record<string, unknown>;
      if (isBundle(patientBundle)) {
        try {
          this.matcher(patientBundle)
            .then((result) => {
              response.status(200).send(JSON.stringify(result));
            })
            .catch((error) => {
              console.error(error);
              response
                .status(500)
                .send({ error: 'Error from server', exception: Object.prototype.toString.call(error) as string });
            });
        } catch (ex) {
          if (ex instanceof RequestError) {
            response.status(ex.httpStatus).send({ error: ex.message });
          } else {
            response.status(500).send({ error: 'Internal server error' });
          }
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
   * Closes the server if it's running.
   */
  close(): void {
    if (this._server !== null) {
      this._server.close();
      this._server = null;
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
  listen(): http.Server {
    if (this._server !== null) {
      return this._server;
    }
    const port = this.port;
    this._server = this.app.listen(port);
    const listeningOn = this._server.address();
    if (typeof listeningOn === 'object' && listeningOn !== null) {
      this.log(`Server listening on ${listeningOn.address}:${listeningOn.port}...`);
    } else {
      // Should not be possible at this point but whatever
      this.log(`Server listening on ${listeningOn === null ? 'unknown address' : listeningOn}.`);
    }
    return this._server;
  }
}

export default ClinicalTrialMatchingService;
