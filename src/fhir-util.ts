import { FhirResource } from 'fhir/r4';

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
    return profiles.some(p => profile.test(p));
  }
}
