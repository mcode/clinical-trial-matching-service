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

  it("defaults to port 3000 if the port config isn't set", () => {
    const testServer = new ClinicalTrialMatchingService(service.matcher);
    expect(testServer.port).toEqual(3000);
  });

  describe('#listen()', () => {
    it('returns the running service object when running', () => {
      expect(service.server).toBeInstanceOf(http.Server);
    });

    it('returns the server object on a second listen() call', () => {
      const listenSpy = spyOn(server, 'listen');
      service.listen();
      expect(listenSpy).not.toHaveBeenCalled();
    });

    it('handles net.Server.address being weird', () => {
      // Handle weird address edge cases
      [ 'string_address', null ].forEach(address => {
        const testService = new ClinicalTrialMatchingService(service.matcher);
        // Fake out TypeScript on the spy - the spy is in no way a complete
        // implementation, but it doens't need to be
        const fakeServer = jasmine.createSpyObj('http.Server', { address: address }) as unknown;
        spyOn(testService.app, 'listen').and.returnValue(fakeServer as http.Server);
        testService.listen();
        expect((fakeServer as http.Server).address).toHaveBeenCalled();
      });
    });
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
