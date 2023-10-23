import { FhirResource } from 'fhir/r4';
import { resourceContainsProfile } from '../src/fhir-util';

describe('#resourceContainsProfile', () => {
  it('handles resources with no meta', () => {
    expect(
      resourceContainsProfile({ resourceType: 'Bundle', type: 'searchset' }, 'http://www.example.com/')
    ).toBeFalse();
    // Check if it handle possibly invalid JSON
    expect(
      resourceContainsProfile(
        { resourceType: 'Bundle', type: 'searchset', meta: null } as unknown as FhirResource,
        'http://www.example.com/'
      )
    ).toBeFalse();
  });
  it('handles resources with a meta block but no profile', () => {
    expect(
      resourceContainsProfile({ resourceType: 'Bundle', type: 'searchset', meta: {} }, 'http://www.example.com/')
    ).toBeFalse();
  });
  it('finds substrings using a RegExp', () => {
    expect(resourceContainsProfile({ resourceType: 'Bundle', type: 'searchset', meta: {
      profile: [ 'http://www.example.com/findme', 'http://www.example.com/extra' ]
    } }, /example/)).toBeTrue();
  });
});
