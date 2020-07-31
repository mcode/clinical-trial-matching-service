import ResearchStudy, { Group, Practitioner, Location, convertStringArrayToCodeableConcept } from '../src/research-study';

describe('convertStringArrayToCodeableConcept', () => {
  it('converts to codeable concepts', () => {
    expect(convertStringArrayToCodeableConcept('["a","b","c"]')).toEqual([
      { text: 'a' }, { text: 'b' }, { text: 'c' }
    ]);
  });
});

describe('ResearchStudy', () => {
  it('converts to JSON properly', () => {
    const study = new ResearchStudy(1);
    // Keys should be in a consistent order, thankfully
    expect(JSON.stringify(study)).toEqual('{"resourceType":"ResearchStudy","id":"study-1"}');
  });

  it('uses the passed ID', () => {
    expect(new ResearchStudy('id').id).toEqual('id');
  });

  describe('#addContainedResource', () => {
    it('adds contained resources', () => {
      const researchStudy = new ResearchStudy('test');
      expect(researchStudy.contained).toBeUndefined();
      const containedResource0: Group = { resourceType: 'Group' };
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
  });
});
