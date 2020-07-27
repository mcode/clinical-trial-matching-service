import express from 'express';
import bodyParser from 'body-parser';
import Configuration from './env';
import { isBundle } from './bundle';
import { SearchSet } from './searchset';
import RequestError from './request-error';
import * as http from 'http';

export type PatientBundle = Record<string, unknown>;
export type ClinicalTrialMatcher = (patientBundle: PatientBundle) => Promise<SearchSet>;

export class ClinicalTrialMatchingService {
  public readonly app: express.Application;
  private readonly configuration: Configuration;
  private _server: http.Server | null = null;

  constructor(public matcher: ClinicalTrialMatcher) {
    this.app = express();
    this.configuration = new Configuration();
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
  get server(): http.Server {
    return this.server;
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

  close(): void {
    if (this._server !== null) {
      this._server.close();
      this._server = null;
    }
  }

  listen(): http.Server {
    console.log(`Starting server on port ${this.configuration.port}...`);
    return (this._server = this.app.listen(this.configuration.port));
  }
}

export default ClinicalTrialMatchingService;
