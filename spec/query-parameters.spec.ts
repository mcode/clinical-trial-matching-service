import { Bundle, BundleEntry, Parameters } from 'fhir/r4';
import { parseQueryParameters } from '../src/query-parameters';

describe('parseQueryParameters', () => {
  it('extracts passed properties', () => {
    expect(
      parseQueryParameters({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            resource: {
              resourceType: 'Parameters',
              parameter: [
                {
                  name: 'zipCode',
                  valueString: '01730'
                },
                {
                  name: 'travelRadius',
                  valueString: '25'
                },
                {
                  name: 'phase',
                  valueString: 'phase-1'
                },
                {
                  name: 'recruitmentStatus',
                  valueString: 'approved'
                }
              ]
            }
          }
        ]
      })
    ).toEqual({
      zipCode: '01730',
      travelRadius: 25,
      phase: 'phase-1',
      recruitmentStatus: 'approved'
    });
  });
  it('extracts travel radius from valueDecimal', () => {
    expect(
      parseQueryParameters({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            resource: {
              resourceType: 'Parameters',
              parameter: [
                {
                  name: 'travelRadius',
                  valueDecimal: 25
                }
              ]
            }
          }
        ]
      })
    ).toEqual({
      travelRadius: 25
    });
  });
  it('ignores travel radius of an invalid type', () => {
    expect(
      parseQueryParameters({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            resource: {
              resourceType: 'Parameters',
              parameter: [
                {
                  name: 'travelRadius',
                  valueDecimal: 25
                },
                {
                  name: 'travelRadius',
                  valueBoolean: true
                }
              ]
            }
          }
        ]
      })
    ).toEqual({
      travelRadius: 25
    });
  });

  it('ignores unknown parameters', () => {
    const parameters = parseQueryParameters({
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'Parameters',
            parameter: [
              {
                name: 'unknown',
                valueString: 'invalid'
              }
            ]
          }
        }
      ]
    });
    expect(parameters).toEqual({});
  });

  it('ignores invalid entries', () => {
    const bundle: Bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: undefined
        }
      ]
    };
    // Force an invalid entry in
    bundle.entry?.push({ invalid: true } as unknown as BundleEntry, { resource: 'invalid' } as unknown as BundleEntry);
    // Passing in this case is not throwing an exception and returning nothing
    expect(parseQueryParameters(bundle)).toEqual({});
  });

  it('ignores non-parameter resources', () => {
    expect(
      parseQueryParameters({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            resource: {
              resourceType: 'Observation',
              code: {},
              status: 'final'
            }
          }
        ]
      })
    ).toEqual({});
  });

  it('ignores invalid parameters', () => {
    // Invalid parameters object
    const invalidParameters = {
      resourceType: 'Parameters',
      parameter: 'invalid'
    } as unknown as Parameters;
    // Passing in this case is not throwing an exception and returning nothing
    expect(
      parseQueryParameters({
        resourceType: 'Bundle',
        type: 'collection',
        entry: [
          {
            resource: invalidParameters
          }
        ]
      })
    ).toEqual({});
  });

  it('ignores invalid bundles', () => {
    // Passing in this case is not throwing an exception and returning nothing
    expect(
      parseQueryParameters({
        entry: 'invalid'
      } as unknown as Bundle)
    ).toEqual({});
  });
});
