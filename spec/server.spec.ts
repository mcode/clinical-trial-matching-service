import request from 'supertest';

import ClinicalTrialMatchingService from '../src/server';
import SearchSet from '../src/searchset';
import http from 'http';

describe('server', () => {
  let service: ClinicalTrialMatchingService;
  let server: http.Server;
  beforeAll(() => {
    // Note we use port 0 to get a free port since we don't care what we listen on
    service = new ClinicalTrialMatchingService(() => {
      return Promise.resolve(new SearchSet([]));
    }, { port: 0 });
    server = service.listen();
  });
  afterAll(() => {
    server.close();
  });

  it('responds to /', () => {
    return request(server).get('/').set('Accept', 'application/json').expect(200);
  });

  it('responds to / with hello from clinical trial', () => {
    return request(server)
      .get('/')
      .set('Accept', 'application/json')
      .expect(200)
      .then((res) => {
        expect(res.text).toBe('Hello from the Clinical Trial Matching Service');
      });
  });

  it('responds to /getClinicalTrial with improper patient bundle', () => {
    return request(server)
      .post('/getClinicalTrial')
      .send({ patientData: {} })
      .set('Accept', 'application/json')
      .expect(400);
  });

  it('responds to /getClinicalTrial with no patientBundle param', () => {
    return request(server).post('/getClinicalTrial').send({}).set('Accept', 'application/json').expect(400);
  });

  it('handles request failing', () => {
    spyOn(service, 'matcher').and.throwError('An example error');
    return request(server)
      .post('/getClinicalTrial')
      .send({
        patientData: {
          resourceType: 'Bundle',
          type: 'collection',
          entry: []
        }
      })
      .set('Accept', 'application/json')
      .expect(500);
  });
});
