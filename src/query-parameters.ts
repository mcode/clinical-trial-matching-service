import { Bundle } from 'fhir/r4';

/**
 * The following parameters are defined by the PCT IG.
 */
export interface QueryParameters {
  zipCode?: string;
  travelRadius?: number;
  phase?: string;
  recruitmentStatus?: string;
}

/**
 * Parses out query parameters from a patient bundle.
 * @param patientBundle the patient bundle containing parameters
 */
export function parseQueryParameters(patientBundle: Bundle): QueryParameters {
  // Resulting parameters
  const parameters: QueryParameters = {};
  if (Array.isArray(patientBundle.entry)) {
    for (const entry of patientBundle.entry) {
      if (!('resource' in entry)) {
        // Skip bad entries
        continue;
      }
      const resource = entry.resource;
      // Pull out search parameters
      if (resource?.resourceType === 'Parameters') {
        if (Array.isArray(resource.parameter)) {
          for (const parameter of resource.parameter) {
            if (parameter.name === 'zipCode') {
              parameters.zipCode = parameter.valueString;
            } else if (parameter.name === 'travelRadius') {
              if (typeof parameter.valueString === 'string') {
                parameters.travelRadius = parseFloat(parameter.valueString);
              } else if (typeof parameter.valueDecimal === 'number') {
                parameters.travelRadius = parameter.valueDecimal;
              }
            } else if (parameter.name === 'phase') {
              parameters.phase = parameter.valueString;
            } else if (parameter.name === 'recruitmentStatus') {
              parameters.recruitmentStatus = parameter.valueString;
            }
          }
        }
      }
    }
  }
  return parameters;
}
