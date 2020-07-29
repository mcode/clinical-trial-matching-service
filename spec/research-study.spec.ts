import { BasicResearchStudy, Group, Practitioner } from '../src/research-study';

describe('BasicResearchStudy', () => {
  it('converts to JSON properly', () => {
    const study = new BasicResearchStudy(1);
    // Keys should be in a consistent order, thankfully
    expect(JSON.stringify(study)).toEqual('{"resourceType":"ResearchStudy","id":"study-1"}');
  });

  it('uses the passed ID', () => {
    expect(new BasicResearchStudy('id').id).toEqual('id');
  });

  describe('#addContainedResource', () => {
    it('adds contained resources', () => {
      const researchStudy = new BasicResearchStudy('test');
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
      const researchStudy = new BasicResearchStudy('test');
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
      const researchStudy = new BasicResearchStudy('test');
      const location = researchStudy.addSite('Hospital');
      expect(location.id).toBeDefined();
      expect(researchStudy.site).toBeDefined();
      // Let TypeScript prove it's defined
      if (researchStudy.site) {
        const siteReference = researchStudy.site[0];
        expect(siteReference.type).toEqual('Location');
        expect(siteReference.reference).toEqual('#' + location.id);
      }
      expect(researchStudy.contained).toBeDefined();
      if (researchStudy.contained) {
        expect(researchStudy.contained[0]).toBe(location);
      }
    });
  });
});
