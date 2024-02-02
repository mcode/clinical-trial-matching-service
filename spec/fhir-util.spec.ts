import { FhirResource } from 'fhir/r4';
import { FHIRDate, FHIRDateAccuracy, resourceContainsProfile } from '../src/fhir-util';

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
    expect(
      resourceContainsProfile(
        {
          resourceType: 'Bundle',
          type: 'searchset',
          meta: {
            profile: ['http://www.example.com/findme', 'http://www.example.com/extra']
          }
        },
        /example/
      )
    ).toBeTrue();
  });
});

describe('FHIRDate', () => {
  it('defaults to not being a leap second', () => {
    expect(new FHIRDate(new Date(2023, 0, 1, 0, 0, 0), FHIRDateAccuracy.YEAR_MONTH_DAY_TIME).leapSecond).toBeFalse();
  });
  describe('.parse', () => {
    it('parses a date containing the year', () => {
      const actual = FHIRDate.parse('2024');
      expect(actual.date).toEqual(new Date(Date.UTC(2024, 0, 1, 0, 0, 0, 0)));
      expect(actual.accuracy).toEqual(FHIRDateAccuracy.YEAR);
    });
    it('parses a date containing the year and month', () => {
      const actual = FHIRDate.parse('2024-02');
      expect(actual.date).toEqual(new Date(Date.UTC(2024, 1, 1, 0, 0, 0, 0)));
      expect(actual.accuracy).toEqual(FHIRDateAccuracy.YEAR_MONTH);
    });
    it('parses a date containing the year, month, and date', () => {
      const actual = FHIRDate.parse('2024-03-02');
      expect(actual.date).toEqual(new Date(Date.UTC(2024, 2, 2, 0, 0, 0, 0)));
      expect(actual.accuracy).toEqual(FHIRDateAccuracy.YEAR_MONTH_DAY);
    });
    it('parses a date containing the year, month, date, and a time', () => {
      let actual = FHIRDate.parse('2025-04-03T01:23:45.6789Z');
      expect(actual.date).toEqual(new Date(Date.UTC(2025, 3, 3, 1, 23, 45, 678)));
      expect(actual.accuracy).toEqual(FHIRDateAccuracy.YEAR_MONTH_DAY_TIME);
      actual = FHIRDate.parse('2025-04-03T01:23:45Z');
      expect(actual.date).toEqual(new Date(Date.UTC(2025, 3, 3, 1, 23, 45)));
      expect(actual.accuracy).toEqual(FHIRDateAccuracy.YEAR_MONTH_DAY_TIME);
    });
    it('parses a date containing the year, month, date, a time, and a time zone', () => {
      let actual = FHIRDate.parse('2025-04-03T01:23:45.6789-04:00');
      expect(actual.date).toEqual(new Date(Date.UTC(2025, 3, 3, 5, 23, 45, 678)));
      expect(actual.accuracy).toEqual(FHIRDateAccuracy.YEAR_MONTH_DAY_TIME);
      actual = FHIRDate.parse('2025-04-03T01:23:45.6789+01:00');
      expect(actual.date).toEqual(new Date(Date.UTC(2025, 3, 3, 0, 23, 45, 678)));
      expect(actual.accuracy).toEqual(FHIRDateAccuracy.YEAR_MONTH_DAY_TIME);
    });
    it('handles leap seconds', () => {
      // The FHIR spec allows it and this is the last time it happened:
      const actual = FHIRDate.parse('2016-12-31T23:59:60Z');
      expect(actual.leapSecond).toEqual(true);
      expect(actual.date).toEqual(new Date(Date.UTC(2016, 11, 31, 23, 59, 59)));
      expect(actual.accuracy).toEqual(FHIRDateAccuracy.YEAR_MONTH_DAY_TIME);
    });
    it('catches invalid dates', () => {
      expect(() => {
        FHIRDate.parse('2023-02-29');
      }).toThrowError('Invalid date 29 for month 2 in dateTime "2023-02-29"');
      expect(() => {
        FHIRDate.parse('2024-02-29');
      }).not.toThrow();
      expect(() => {
        FHIRDate.parse('2023-13-05');
      }).toThrowError('Invalid month 13 in dateTime "2023-13-05"');
      expect(() => {
        FHIRDate.parse('2023-00-05');
      }).toThrowError('Invalid month 00 in dateTime "2023-00-05"');
      expect(() => {
        FHIRDate.parse('2023-01-32');
      }).toThrowError('Invalid date 32 in dateTime "2023-01-32"');
      expect(() => {
        FHIRDate.parse('2023-01-02T24:00:00Z');
      }).toThrowError('Invalid hours 24 in dateTime "2023-01-02T24:00:00Z"');
      expect(() => {
        FHIRDate.parse('2023-01-02T12:60:00Z');
      }).toThrowError('Invalid minutes 60 in dateTime "2023-01-02T12:60:00Z"');
      expect(() => {
        FHIRDate.parse('2023-01-02T12:00:61Z');
      }).toThrowError('Invalid seconds 61 in dateTime "2023-01-02T12:00:61Z"');
      expect(() => {
        FHIRDate.parse('2023-01-02T24:00Z');
      }).toThrowError('Invalid FHIR dateTime "2023-01-02T24:00Z"');
      expect(() => {
        FHIRDate.parse('Jun 01 2020');
      }).toThrowError('Invalid FHIR dateTime "Jun 01 2020"');
    });
    it('does not allow year 0', () => {
      expect(() => {
        FHIRDate.parse('0000-01-01');
      }).toThrowError('Invalid year 0 in dateTime "0000-01-01"');
    });
  });
});
