import request from 'supertest';

import ClinicalTrialMatchingService from '../src/server';
import SearchSet from '../src/searchset';
import http from 'http';
import HttpError from '../src/errors';
import MockServer from './support/mock-server';

describe('server', () => {
  let service: ClinicalTrialMatchingService;
  let server: http.Server;
  beforeAll(async () => {
    // Note we use port 0 to get a free port since we don't care what we listen on
    service = new ClinicalTrialMatchingService(() => {
      return Promise.resolve(new SearchSet([]));
    }, { port: 0 });
    server = await service.listen();
  });
  afterAll(async () => {
    await server.close();
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

    it('handles a matcher raising a HttpError', () => {
      spyOn(service, 'matcher').and.throwError(new HttpError('Forbidden for some reason', 403));
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

    it('handles a request returning a rejected Promise that resolves to a HttpError', () => {
      spyOn(service, 'matcher').and.callFake(() => Promise.reject(new HttpError('Not Found', 404)));
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
      return expectAsync(new ClinicalTrialMatchingService(service.matcher).close()).toBeResolved();
    });

    it('handles the close failing by rejecting the promise', () => {
      const testService = new ClinicalTrialMatchingService(service.matcher);
      const expectedError = new Error('Test error');
      const fakeServer = new MockServer();
      (spyOn(testService.app, 'listen') as jasmine.Spy).and.callFake(() => fakeServer.listen());
      fakeServer.mockErrorOnClose(expectedError);
      return expectAsync(testService.listen().then(() => {
        // Immediately close
        return testService.close();
      })).toBeRejectedWith(expectedError);
    });

    it('stops the server', async () => {
      // This gets kind of weird
      const testService = new ClinicalTrialMatchingService(service.matcher);
      const fakeServer = new MockServer();
      // Rather than properly type the function, erase the proper type information
      (spyOn(testService.app, 'listen') as jasmine.Spy).and.callFake((): http.Server => {
        // It would be nice to just pass the arguments along but A) it doesn't
        // really matter and B) TypeScript doesn't appear to allow it
        return fakeServer.listen() as unknown as http.Server;
      });
      const closeSpy = spyOn(fakeServer, 'close').and.callThrough();
      // Fake listen
      await testService.listen();
      expect(testService.server).not.toBeNull();
      // And fake close
      await testService.close();
      expect(closeSpy).toHaveBeenCalled();
      expect(testService.server).toBeNull();
    });
  });

  describe('#listen()', () => {
    it('returns the running service object when running', () => {
      expect(service.server).toBeInstanceOf(http.Server);
    });

    it('returns the server object on a second listen() call', () => {
      const listenSpy = spyOn(server, 'listen');
      return expectAsync(service.listen()).toBeResolvedTo(server).then(() => {
        expect(listenSpy).not.toHaveBeenCalled();
      });
    });

    it('handles the listen failing by rejecting the promise', () => {
      const testService = new ClinicalTrialMatchingService(service.matcher);
      const expectedError = new Error('Test error');
      const fakeServer = new MockServer();
      fakeServer.mockErrorOnListen(expectedError);
      (spyOn(testService.app, 'listen') as jasmine.Spy).and.callFake(() => fakeServer.listen());
      return expectAsync(testService.listen()).toBeRejectedWith(expectedError);
    })

    it('handles net.Server.address being weird', () => {
      // Handle weird address edge cases
      const promises: Promise<http.Server>[] = [ 'string_address', null ].map(address => {
        const testService = new ClinicalTrialMatchingService(service.matcher);
        const fakeServer = new MockServer();
        fakeServer.mockAddress(address);
        (spyOn(testService.app, 'listen') as jasmine.Spy).and.callFake(() => fakeServer.listen());
        return testService.listen();
      });
      return expectAsync(Promise.all(promises)).toBeResolved();
    });

    it('uses the host config', async () => {
      const testService = new ClinicalTrialMatchingService(service.matcher, { host: '127.0.0.1', port: 3000 });
      const fakeServer = new MockServer();
      const listenSpy: jasmine.Spy = spyOn(testService.app, 'listen');
      listenSpy.and.callFake(() => {
        return fakeServer.listen();
      });
      await testService.listen();
      expect(listenSpy).toHaveBeenCalledOnceWith(3000, '127.0.0.1');
    });
  });
});
