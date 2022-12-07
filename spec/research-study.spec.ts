import ResearchStudy, {
  convertStringsToCodeableConcept,
  createReferenceTo,
  getContainedResource
} from '../src/research-study';
import { Resource,
  ContactDetail,
  Group,
  Practitioner,
  Location
} from 'fhir/r4';

describe('convertStringsToCodeableConcept', () => {
  it('converts JSON to codeable concepts', () => {
    expect(convertStringsToCodeableConcept('["a","b","c"]')).toEqual([
      { text: 'a' }, { text: 'b' }, { text: 'c' }
    ]);
  });
  it('converts CSV to codeable concepts', () => {
    expect(convertStringsToCodeableConcept('a, b ,c')).toEqual([
      { text: 'a' }, { text: 'b' }, { text: 'c' }
    ]);
  });
  it('converts a single string a codeable concept', () => {
    expect(convertStringsToCodeableConcept('test')).toEqual([
      { text: 'test' }
    ]);
  });
  it('converts an array to codeable concepts', () => {
    expect(convertStringsToCodeableConcept(['foo', 'bar', 'baz'])).toEqual([
      { text: 'foo' }, { text: 'bar' }, { text: 'baz' }
    ]);
  });
});

describe('createReferenceTo', () => {
  it('handles resources with no resourceType', () => {
    // This is actually impossible within TypeScript as it ensures resourceType
    // is set, as that's what makes something a Resource. However, to allow
    // us to work with JSON objects coming from outside TypeScript, it should be
    // handled.
    const resource: Resource = { id: 'example' } as Resource;
    const reference = createReferenceTo(resource);
    expect(reference.reference).toEqual('#example');
    expect(reference.type).toBeUndefined();
  });

  it('raises an error if no ID exists on the resource being referenced', () => {
    expect(() => { createReferenceTo({ resourceType: 'ResearchStudy' }) }).toThrowError('no ID to create reference to ResearchStudy');
    // See above: this is invalid in TypeScript but a likely source of objects
    // from JSON
    const resource: Resource = { } as Resource;
    expect(() => { createReferenceTo(resource) }).toThrowError('no ID to create reference');
  });
});

describe('.getContainedResource', () => {
  it('returns null if the contained list is empty', () => {
    expect(getContainedResource({ resourceType: 'ResearchStudy', status: 'active' }, 'anything')).toBeNull();
  });
  it('returns null if the contained list does not contain a resource with the given ID', () => {
    expect(getContainedResource({
      resourceType: 'ResearchStudy',
      status: 'active',
      contained: [
        { resourceType: 'Location', id: 'foo' }
      ]
    }, 'bar')).toBeNull();
  });
  it('returns the proper object', () => {
    const expected: Group = { resourceType: 'Group', id: 'group', actual: false, type: 'person' };
    expect(getContainedResource({
      resourceType: 'ResearchStudy',
      status: 'active',
      contained: [
        { resourceType: 'Location', id: 'location' },
        { resourceType: 'Organization', id: 'organization' },
        expected,
        { resourceType: 'Practitioner', id: 'practitioner' }
      ]
    }, 'group')).toEqual(expected);
  })
});

describe('ResearchStudy', () => {
  it('converts to JSON properly', () => {
    const study = new ResearchStudy(1);
    // Keys should be in a consistent order, thankfully
    expect(JSON.stringify(study)).toEqual('{"resourceType":"ResearchStudy","status":"active","id":"study-1"}');
  });

  it('uses the passed ID', () => {
    expect(new ResearchStudy('id').id).toEqual('id');
  });

  describe('#addContainedResource', () => {
    it('adds contained resources', () => {
      const researchStudy = new ResearchStudy('test');
      expect(researchStudy.contained).toBeUndefined();
      const containedResource0: Group = { resourceType: 'Group', actual: false, type: 'person' };
      const containedResource1: Practitioner = { resourceType: 'Practitioner' };
      researchStudy.addContainedResource(containedResource0);
      expect(researchStudy.contained).toBeDefined();
      expect(Array.isArray(researchStudy.contained)).toBe(true);
      expect(researchStudy.contained?.length).toEqual(1);
      expect(researchStudy.contained ? researchStudy.contained[0] : null).toEqual(containedResource0);
      researchStudy.addContainedResource(containedResource1);
      if (researchStudy.contained) {
        expect(researchStudy.contained[0]).toEqual(containedResource0);
        expect(researchStudy.contained[1]).toEqual(containedResource1);
      }
    });
  });

  describe('#addContact', () => {
    it('adds a contact', () => {
      const researchStudy = new ResearchStudy('test');
      researchStudy.addContact('Test Contact', '781-555-0100', 'test@example.com');
      expect(researchStudy.contact).toBeDefined();
      // Let TypeScript prove it's defined
      if (researchStudy.contact) {
        const contact = researchStudy.contact[0];
        expect(contact.name).toEqual('Test Contact');
        expect(contact.telecom).toBeDefined();
        if (contact.telecom) {
          expect(contact.telecom.length).toEqual(2);
          expect(contact.telecom[0].system).toEqual('phone');
          expect(contact.telecom[0].value).toEqual('781-555-0100');
          expect(contact.telecom[1].system).toEqual('email');
          expect(contact.telecom[1].value).toEqual('test@example.com');
        }
      }
      // Make sure adding a second also works
      const secondContact: ContactDetail = { name: 'Another Contact' };
      researchStudy.addContact(secondContact);
      if (researchStudy.contact) {
        expect(researchStudy.contact.length).toEqual(2);
        const contact = researchStudy.contact[1];
        expect(contact.name).toEqual('Another Contact');
      }
    });

    it('handles either phone or email or both being undefined', () => {
      const researchStudy = new ResearchStudy('test');
      const contact = researchStudy.addContact('Example Contact');
      expect(contact.telecom).toBeUndefined();
      const contactWithPhone = researchStudy.addContact('Phone Contact', '781-555-0102');
      expect(Array.isArray(contactWithPhone.telecom)).toBeTrue();
      if (contactWithPhone.telecom) {
        expect(contactWithPhone.telecom.length).toEqual(1);
        expect(contactWithPhone.telecom[0].system).toEqual('phone');
        expect(contactWithPhone.telecom[0].value).toEqual('781-555-0102');
      }
      const contactWithEmail = researchStudy.addContact('Email Contact', undefined, 'test@example.com');
      expect(Array.isArray(contactWithEmail.telecom)).toBeTrue();
      if (contactWithEmail.telecom) {
        expect(contactWithEmail.telecom.length).toEqual(1);
        expect(contactWithEmail.telecom[0].system).toEqual('email');
        expect(contactWithEmail.telecom[0].value).toEqual('test@example.com');
      }
    });
  });

  describe('#addSite', () => {
    it('adds a site', () => {
      const researchStudy = new ResearchStudy('test');
      const location = researchStudy.addSite('Hospital', '781-555-0101', 'hospital@example.com');
      expect(location.id).toBeDefined();
      expect(location.telecom).toBeDefined();
      // Let TypeScript prove it's defined (same reason when repeated below)
      if (location.telecom) {
        expect(location.telecom.length).toEqual(2);
        expect(location.telecom[0].system).toEqual('phone');
        expect(location.telecom[0].value).toEqual('781-555-0101');
        expect(location.telecom[1].system).toEqual('email');
        expect(location.telecom[1].value).toEqual('hospital@example.com');
      }
      expect(researchStudy.site).toBeDefined();
      if (researchStudy.site) {
        const siteReference = researchStudy.site[0];
        expect(siteReference.type).toEqual('Location');
        expect(siteReference.reference).toEqual('#' + location.id);
      }
      expect(researchStudy.contained).toBeDefined();
      if (researchStudy.contained) {
        expect(researchStudy.contained[0]).toBe(location);
      }
      // Make sure adding a second also works
      const secondLocation: Location = { resourceType: 'Location', name: 'Lab', id: 'lab' };
      researchStudy.addSite(secondLocation);
      if (researchStudy.site) {
        const siteReference = researchStudy.site[1];
        expect(siteReference.type).toEqual('Location');
        expect(siteReference.reference).toEqual('#lab');
      }
      if (researchStudy.contained) {
        expect(researchStudy.contained[1]).toBe(secondLocation);
      }
    });

    it('handles either phone or email or both being undefined', () => {
      const researchStudy = new ResearchStudy('test');
      const location = researchStudy.addSite('Hospital');
      expect(location.telecom).toBeUndefined();
      const locationWithPhone = researchStudy.addSite('Lab', '781-555-0102');
      expect(Array.isArray(locationWithPhone.telecom)).toBeTrue();
      if (locationWithPhone.telecom) {
        expect(locationWithPhone.telecom.length).toEqual(1);
        expect(locationWithPhone.telecom[0].system).toEqual('phone');
        expect(locationWithPhone.telecom[0].value).toEqual('781-555-0102');
      }
      const locationWithEmail = researchStudy.addSite('University', undefined, 'test@example.com');
      expect(Array.isArray(locationWithEmail.telecom)).toBeTrue();
      if (locationWithEmail.telecom) {
        expect(locationWithEmail.telecom.length).toEqual(1);
        expect(locationWithEmail.telecom[0].system).toEqual('email');
        expect(locationWithEmail.telecom[0].value).toEqual('test@example.com');
      }
    });
  });

  describe('#createReferenceId', () => {
    it('defaults to resource', () => {
      expect(new ResearchStudy('id').createReferenceId()).toEqual("resource-0");
    });
    it('increments each call', () => {
      const study = new ResearchStudy('id');
      expect(study.createReferenceId('test')).toEqual('test-0');
      expect(study.createReferenceId('other')).toEqual('other-1');
    });
  });
});
