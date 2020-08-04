import request from 'supertest';

import ClinicalTrialMatchingService from '../src/server';
import SearchSet from '../src/searchset';
import http from 'http';
import RequestError from '../src/request-error';

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

  describe('/getClinicalTrial', () => {
    // This bundle is just enough to get passed to our test handler, which
    // always generates an empty SearchSet.
    const emptyPatientBundle = { resourceType: 'Bundle', type: 'collection', entry: [] };

    // Helper function to generate the request since it's always the same
    function getClinicalTrial(patientData: Record<string, unknown> | string = emptyPatientBundle): request.Test {
      return request(server)
        .post('/getClinicalTrial')
        .send({ patientData: patientData })
        .set('Accept', 'application/json');
    }

    it('responds with an error if given a bad patient data bundle', () => {
      return request(server)
        .post('/getClinicalTrial')
        .send({ patientData: {} })
        .set('Accept', 'application/json')
        .expect(400);
    });

    it('responds to a valid request with a proper bundle', () => {
      return getClinicalTrial()
        .expect(200)
        .then((result) => {
          expect(result.text).toEqual('{"resourceType":"Bundle","type":"searchset","total":0,"entry":[]}');
        });
    });

    it('handles being given a string', () => {
      return getClinicalTrial(JSON.stringify(emptyPatientBundle))
        .expect(200)
        .then((result) => {
          expect(result.text).toEqual('{"resourceType":"Bundle","type":"searchset","total":0,"entry":[]}');
        });
    });

    it('handles receiving an empty request', () => {
      return request(server).post('/getClinicalTrial').send({}).set('Accept', 'application/json').expect(400);
    });

    it('handles a matcher raising an error', () => {
      spyOn(service, 'matcher').and.throwError('An example error');
      return getClinicalTrial().expect(500);
    });

    it('handles a matcher raising a RequestError', () => {
      spyOn(service, 'matcher').and.throwError(new RequestError('Forbidden for some reason', 403));
      return getClinicalTrial().expect(403).then((result) => {
        expect(result.text).toEqual('{"error":"Forbidden for some reason"}');
      });
    });

    it('handles a matcher returning a rejected Promise', () => {
      // I don't understand why callFake works and returnValue doesn't, but for
      // whatever reason, it does not
      spyOn(service, 'matcher').and.callFake(() => Promise.reject(new Error('Failure')));
      return getClinicalTrial().expect(500);
    });

    it('handles a request returning a rejected Promise that resolves to a RequestError', () => {
      spyOn(service, 'matcher').and.callFake(() => Promise.reject(new RequestError('Not Found', 404)));
      return getClinicalTrial().expect(404).then((result) => {
        expect(result.text).toEqual('{"error":"Not Found"}');
      });
    });
  });

  describe('configuration', () => {
    it("defaults to port 3000 if the port config isn't set", () => {
      const testServer = new ClinicalTrialMatchingService(service.matcher);
      expect(testServer.port).toEqual(3000);
    });

    it('defaults to port 3000 if the requested port is out of range', () => {
      const testServer = new ClinicalTrialMatchingService(service.matcher, { port: -42 });
      expect(testServer.port).toEqual(3000);
    });
  });

  describe('#close()', () => {
    it("does nothing on a service that isn't listening", () => {
      // Basically: this shouldn't crash
      new ClinicalTrialMatchingService(service.matcher).close();
    });

    it('stops the server', () => {
      // This gets kind of weird
      const fakeServer: http.Server = jasmine.createSpyObj('http.Server', {
        address: { address: '0.0.0.0', port: 3000 },
        close: null
      }) as http.Server;
      const testService = new ClinicalTrialMatchingService(service.matcher);
      spyOn(testService.app, 'listen').and.returnValue(fakeServer);
      // Fake listen
      testService.listen();
      // And fake close
      testService.close();
      expect(fakeServer.close).toHaveBeenCalled();
      expect(testService.server).toBeNull();
    });
  });

  describe('#listen()', () => {
    it('returns the running service object when running', () => {
      expect(service.server).toBeInstanceOf(http.Server);
    });

    it('returns the server object on a second listen() call', () => {
      const listenSpy = spyOn(server, 'listen');
      expect(service.listen()).toBe(server);
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

    it('uses the host config', () => {
      const testService = new ClinicalTrialMatchingService(service.matcher, { host: '127.0.0.1', port: 3000 });
      const fakeServer = jasmine.createSpyObj('http.Server', { address: { address: '127.0.0.1', port: 3000 } }) as unknown;
      const listenSpy: jasmine.Spy = spyOn(testService.app, 'listen').and.returnValue(fakeServer as http.Server);
      testService.listen();
      expect(listenSpy).toHaveBeenCalledWith(3000, '127.0.0.1');
    });
  });
});
