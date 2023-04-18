import express from 'express';
import http from 'http';

import request from 'supertest';

import ClinicalTrialMatchingService from '../src/server';
import SearchSet from '../src/searchset';
import HttpError from '../src/errors';

import MockServer from './support/mock-server';

function mockMatcher(): Promise<SearchSet> {
  return Promise.resolve(new SearchSet([]));
}

describe('ClinicalTrialMatchingService', () => {
  describe('running as a service', () => {
    let service: ClinicalTrialMatchingService;
    let server: http.Server;
    beforeAll(async () => {
      // Unset process.env.PASSENGER_BASE_URI if it's set
      delete process.env['PASSENGER_BASE_URI'];
      // Note we use port 0 to get a free port since we don't care what we listen on
      service = new ClinicalTrialMatchingService(mockMatcher, { port: 0 });
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
          .send(patientData)
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

    it('returns the running service object when running', () => {
      expect(service.server).toBeInstanceOf(http.Server);
    });

    it('returns the currently running server object on a second listen() call', () => {
      const listenSpy = spyOn(server, 'listen');
      return expectAsync(service.listen()).toBeResolvedTo(server).then(() => {
        expect(listenSpy).not.toHaveBeenCalled();
      });
    });
  });

  describe('configuration', () => {
    it("defaults to port 3000 if the port config isn't set", () => {
      const testServer = new ClinicalTrialMatchingService(mockMatcher);
      expect(testServer.port).toEqual(3000);
    });

    it('defaults to port 3000 if the requested port is out of range', () => {
      const testServer = new ClinicalTrialMatchingService(mockMatcher, { port: -42 });
      expect(testServer.port).toEqual(3000);
    });

    it('binds to defaults with no configuration', () => {
      const testExpress = express();
      const getSpy = spyOn(testExpress, 'get');
      const postSpy = spyOn(testExpress, 'post');
      new ClinicalTrialMatchingService(mockMatcher, { appEngine: testExpress });
      // Express calls get under the hood so we only want to check the last call
      expect(getSpy.calls.count()).toBeGreaterThanOrEqual(1);
      // Only care about the first argument since the second one is a closure
      expect(getSpy.calls.argsFor(getSpy.calls.count() - 1)[0]).toEqual('/');
      expect(postSpy.calls.count()).toEqual(1);
      expect(postSpy.calls.argsFor(0)[0]).toEqual('/getClinicalTrial');
    });

    it('binds using the given prefix', () => {
      const testExpress = express();
      const getSpy = spyOn(testExpress, 'get');
      const postSpy = spyOn(testExpress, 'post');
      new ClinicalTrialMatchingService(mockMatcher, { urlPrefix: 'prefix/' }, { appEngine: testExpress });
      // Express calls get under the hood so we only want to check the last call
      expect(getSpy.calls.count()).toBeGreaterThanOrEqual(1);
      // Only care about the first argument since the second one is a closure
      expect(getSpy.calls.argsFor(getSpy.calls.count() - 1)[0]).toEqual('/prefix');
      expect(postSpy.calls.count()).toEqual(1);
      expect(postSpy.calls.argsFor(0)[0]).toEqual('/prefix/getClinicalTrial');
    });

    ['PASSENGER_BASE_URI', 'IISNODE_BASE_URI'].forEach(envName => {
      it(`binds using ${envName} if set`, () => {
        const testExpress = express();
        const getSpy = spyOn(testExpress, 'get');
        const postSpy = spyOn(testExpress, 'post');
        process.env[envName] = '/prefix';
        try {
          new ClinicalTrialMatchingService(mockMatcher, { appEngine: testExpress });
          // Express calls get under the hood so we only want to check the last call
          expect(getSpy.calls.count()).toBeGreaterThanOrEqual(1);
          // Only care about the first argument since the second one is a closure
          expect(getSpy.calls.argsFor(getSpy.calls.count() - 1)[0]).toEqual('/prefix');
          expect(postSpy.calls.count()).toEqual(1);
          expect(postSpy.calls.argsFor(0)[0]).toEqual('/prefix/getClinicalTrial');
        } finally {
          // ensure the prefix doesn't remain set
          delete process.env[envName];
        }
      });

      it(`ignores ${envName} if ignoreEnvironment is true`, () => {
        const testExpress = express();
        const getSpy = spyOn(testExpress, 'get');
        const postSpy = spyOn(testExpress, 'post');
        process.env[envName] = '/prefix';
        try {
          new ClinicalTrialMatchingService(mockMatcher, { appEngine: testExpress, ignoreEnvironment: true });
          // Express calls get under the hood so we only want to check the last call
          expect(getSpy.calls.count()).toBeGreaterThanOrEqual(1);
          // Only care about the first argument since the second one is a closure
          expect(getSpy.calls.argsFor(getSpy.calls.count() - 1)[0]).toEqual('/');
          expect(postSpy.calls.count()).toEqual(1);
          expect(postSpy.calls.argsFor(0)[0]).toEqual('/getClinicalTrial');
        } finally {
          // ensure the prefix doesn't remain set
          delete process.env[envName];
        }
      });
    });

    it('works with no configuration', () => {
      const service = new ClinicalTrialMatchingService(mockMatcher);
      // Not really sure how to check that this was created properly
      expect(service.app).toBeDefined();
      expect(service.port).toEqual(3000);
    });
  });

  describe('#close()', () => {
    it("does nothing on a service that isn't listening", () => {
      // Basically: this shouldn't crash
      return expectAsync(new ClinicalTrialMatchingService(mockMatcher).close()).toBeResolved();
    });

    it('handles the close failing by rejecting the promise', () => {
      const testService = new ClinicalTrialMatchingService(mockMatcher);
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
      const testService = new ClinicalTrialMatchingService(mockMatcher);
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

    it('handles the listen failing by rejecting the promise', () => {
      const testService = new ClinicalTrialMatchingService(mockMatcher);
      const expectedError = new Error('Test error');
      const fakeServer = new MockServer();
      fakeServer.mockErrorOnListen(expectedError);
      (spyOn(testService.app, 'listen') as jasmine.Spy).and.callFake(() => fakeServer.listen());
      return expectAsync(testService.listen()).toBeRejectedWith(expectedError);
    })

    it('handles net.Server.address being weird', () => {
      // Handle weird address edge cases
      const promises: Promise<http.Server>[] = [ 'string_address', null ].map(address => {
        const testService = new ClinicalTrialMatchingService(mockMatcher);
        const fakeServer = new MockServer();
        fakeServer.mockAddress(address);
        (spyOn(testService.app, 'listen') as jasmine.Spy).and.callFake(() => fakeServer.listen());
        return testService.listen();
      });
      return expectAsync(Promise.all(promises)).toBeResolved();
    });

    it('uses the host config', async () => {
      const testService = new ClinicalTrialMatchingService(mockMatcher, { host: '127.0.0.1', port: 3000 });
      const fakeServer = new MockServer();
      const listenSpy: jasmine.Spy = spyOn(testService.app, 'listen');
      listenSpy.and.callFake(() => {
        return fakeServer.listen();
      });
      await testService.listen();
      expect(listenSpy).toHaveBeenCalledOnceWith(3000, '127.0.0.1');
    });

    it('uses IISNode environment variables if set', async () => {
      const testService = new ClinicalTrialMatchingService(mockMatcher, { host: '127.0.0.1', port: 3000 });
      const fakeServer = new MockServer();
      const listenSpy: jasmine.Spy = spyOn(testService.app, 'listen');
      listenSpy.and.callFake(() => {
        return fakeServer.listen();
      });
      process.env['IISNODE_VERSION'] = '0.2.26';
      process.env['PORT'] = '\\\\?\\pipe\\some-long-guid';
      try {
        await testService.listen();
        expect(listenSpy).toHaveBeenCalledOnceWith('\\\\?\\pipe\\some-long-guid');
      } finally {
        delete process.env['IISNODE_VERSION'];
        delete process.env['PORT'];
      }
    });
  });
});
