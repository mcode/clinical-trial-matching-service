import { FhirResource } from 'fhir/r4';

export enum FHIRDateAccuracy {
  YEAR,
  YEAR_MONTH,
  YEAR_MONTH_DAY,
  YEAR_MONTH_DAY_TIME
}

/**
 * A FHIR date. A FHIR date may not have all components provided.
 */
export class FHIRDate {
  /**
   * The parsed date as a JavaScript date object. The date is parsed into UTC,
   * so only the getUTC methods should be used to extract data from it.
   */
  readonly date: Date;
  /**
   * The degree of accuracy provided for the date. Dates can be missing parts.
   */
  readonly accuracy: FHIRDateAccuracy;
  /**
   * Whether or not the seconds was actually 60 and not 0. Leap seconds are
   * allowed in the FHIR date time spec! If given a time that ends in a 60,
   * the minute is left as-is, and the seconds are decreased to 59, and this
   * flag is set. Note that milliseconds are not changed! For almost all use
   * cases, it makes the most sense to ignore this flag.
   */
  readonly leapSecond: boolean;

  constructor(date: Date, accuracy: FHIRDateAccuracy, leapSecond = false) {
    this.date = date;
    this.accuracy = accuracy;
    this.leapSecond = leapSecond && date.getUTCSeconds() === 59;
  }

  /**
   * Parses a FHIR date. Throws an exception if the date is invalid.
   * @param value
   */
  static parse(value: string): FHIRDate {
    // The overly complicated regexp that FHIR gives checks to ensure that
    // values are in range, but that can be done after pulling them out.
    const m =
      /^([0-9]{1,4})(?:-([0-9]{2})(?:-([0-9]{2})(?:T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]+))?(Z|([+-][0-9]{1,2}):([0-9]{2})))?)?)?$/.exec(
        value
      );
    if (!m) {
      throw new Error(`Invalid FHIR dateTime "${value}"`);
    }
    const year = parseInt(m[1]);
    let monthIndex = 0,
      date = 1,
      hours = 0,
      minutes = 0,
      seconds = 0,
      millis = 0,
      leapSecond = false,
      accuracy = FHIRDateAccuracy.YEAR;
    if (year === 0) {
      throw new Error(`Invalid year 0 in dateTime "${value}"`);
    }
    if (m[2]) {
      monthIndex = parseInt(m[2]) - 1;
      if (monthIndex < 0 || monthIndex > 11) {
        throw new Error(`Invalid month ${m[2]} in dateTime "${value}"`);
      }
      if (m[3]) {
        date = parseInt(m[3]);
        if (date < 1 || date > 31) {
          throw new Error(`Invalid date ${m[3]} in dateTime "${value}"`);
        }
        // So there's an issue here - 2023-02-29 becomes 2023-03-01 via the Date
        // constructor, but checking for number of days in a month is
        // problematic, because 2024-02-29 *is* a valid date.
        // There *is* a way to deal with this, though... once we've made the
        // date object, see if the month has changed.
        if (m[4] && m[5] && m[6] && m[8]) {
          hours = parseInt(m[4]);
          if (hours < 0 || hours > 23) {
            throw new Error(`Invalid hours ${m[4]} in dateTime "${value}"`);
          }
          minutes = parseInt(m[5]);
          if (minutes < 0 || minutes > 59) {
            throw new Error(`Invalid minutes ${m[5]} in dateTime "${value}"`);
          }
          seconds = parseInt(m[6]);
          if (seconds < 0 || seconds > 60) {
            throw new Error(`Invalid seconds ${m[6]} in dateTime "${value}"`);
          }
          if (seconds === 60) {
            leapSecond = true;
            seconds = 59;
          }
          // Only the first three digits are parsed, the rest are ignored.
          // To make ".1" work, 0-pad the end, so it becomes ".100" or 100
          // milliseconds.
          millis = m[7] === undefined ? 0 : parseInt(m[7].padEnd(3, '0').substring(0, 3));
          accuracy = FHIRDateAccuracy.YEAR_MONTH_DAY_TIME;
        } else {
          accuracy = FHIRDateAccuracy.YEAR_MONTH_DAY;
        }
      } else {
        accuracy = FHIRDateAccuracy.YEAR_MONTH;
      }
    }
    let dateObject = new Date(Date.UTC(year, monthIndex, date, hours, minutes, seconds, millis));
    // Do a couple of validation checks that the date object doesn't...
    if (dateObject.getUTCMonth() != monthIndex) {
      // Date was apparently invalid for that month
      throw new Error(`Invalid date ${date} for month ${monthIndex + 1} in dateTime "${value}"`);
    }
    if (m[8] && m[8] !== 'Z') {
      // There is a time zone so the offset needs to be applied.
      const tzHours = parseInt(m[9].substring(1)),
        tzMinutes = parseInt(m[10]);
      // Calculate the offset in ms...
      const offset = (tzHours * 60 + tzMinutes) * 60000;
      // Apply the offset
      let unixTime = dateObject.valueOf();
      if (m[9].startsWith('-')) {
        // Offset is negative, meaning the time is *behind* UTC, and needs to be
        // brought *forward*, so add the offset
        unixTime += offset;
      } else {
        // Offset is positive, meaning the time is *ahead of* UTC, and needs to
        // be brought *backwards*, so subtract the offset
        unixTime -= offset;
      }
      dateObject = new Date(unixTime);
    }
    return new FHIRDate(dateObject, accuracy, leapSecond);
  }
}

/**
 * Checks to see if a given resource contains a requested profile.
 * @param resource the FHIR resource to check
 * @param profile the profile string to look up
 * @returns true if the profile exists on the resource
 */
export function resourceContainsProfile(resource: FhirResource, profile: string | RegExp): boolean {
  // Check to see if there are any profiles at all
  const meta = resource.meta;
  if (typeof meta !== 'object' || meta === null) {
    return false;
  }
  const profiles = meta.profile;
  if (!Array.isArray(profiles)) {
    return false;
  }
  // Otherwise, see if any profile has this array
  if (typeof profile === 'string') {
    return profiles.includes(profile);
  } else {
    // RegExp, test each profile with it (useful for looser matching)
    return profiles.some((p) => profile.test(p));
  }
}
