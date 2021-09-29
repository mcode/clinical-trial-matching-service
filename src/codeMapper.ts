/**
 * A class that acts a Code Mapper that maps an input JSON's codes to their associated profiles.
 */
export class CodeMapper {
  // Map<Profile -> Map<System -> List<Codes>>>
  code_map: Map<string, Map<string, string[]>>;

  /**
   * Constructor for a Code Mapper.
   * @param code_mapping_file The file that dictates the code mapping.
   */
  constructor(code_mapping_file: any) {
    this.code_map = CodeMapper.convertJsonToMap(code_mapping_file);
  }

  /**
   * Converts the JSON object to the Map<Profile -> Map<System -> List<Codes>>> format.
   * @param obj The JSON object.
   * @returns Map<String. Map<String -> List<String>>>
   */
  static convertJsonToMap(obj: {
    [key: string]: ProfileSystemCodes;
  }): Map<string, Map<string, string[]>> {
    const profile_map = new Map<string, Map<string, string[]>>();
    for (const profile_key of Object.keys(obj)) {
      const code_map = new Map<string, string[]>();
      for (const system_key of Object.keys(obj[profile_key])) {
        const codes = obj[profile_key][system_key];
        const code_strings: string[] = codes.map(function (code) {
          return code.code;
        });
        code_map.set(system_key, code_strings);
      }
      // For the current profile, inserts the current system->code mapping.
      profile_map.set(profile_key, code_map);
    }
    return profile_map;
  }

  /**
   * Checks whether the given code is within one of the given profile mappings.
   */
  codeIsInMapping(coding: Coding, ...profiles: string[]): boolean {
    const system = CodeMapper.normalizeCodeSystem(coding.system);
    for (const profile of profiles) {
      if(!this.code_map.has(profile)){
        throw "Profile '" + profile + "' does not exist in the given profile mappings."
      }
      const code_profiles: Map<string, string[]> = this.code_map.get(profile) as Map<string, string[]>; // Pull the codes for the profile
      if(code_profiles == undefined || !code_profiles.has(system)){
        // If the system is not in this code profile, then the code does not map to this one.
        continue;
      }
      const codes_to_check: string[] = code_profiles.get(system) as string[];
      if (
        codes_to_check != undefined && (
        codes_to_check.includes(coding.code) ||
        codes_to_check.includes(coding.display))
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns whether the given code is any code not in the given profile.
   */
  codeIsNotInMapping(coding: Coding, profile: string): boolean {
    if (coding.code == undefined || coding.code == null) {
      return false;
    } else {
      return !this.codeIsInMapping(coding, profile);
    }
  }

  /**
   * Normalize the code system to a consistent format.
   * @param codeSystem  The code system to normalize.
   * @returns The normalized code system.
   */
  static normalizeCodeSystem(codeSystem: string): string {
    const lowerCaseCodeSystem: string = codeSystem.toLowerCase();
    if (lowerCaseCodeSystem.includes("snomed")) {
      return "SNOMED";
    } else if (lowerCaseCodeSystem.includes("rxnorm")) {
      return "RxNorm";
    } else if (lowerCaseCodeSystem.includes("icd-10")) {
      return "ICD-10";
    } else if (
      lowerCaseCodeSystem.includes("ajcc") ||
      lowerCaseCodeSystem.includes("cancerstaging.org")
    ) {
      return "AJCC";
    } else if (lowerCaseCodeSystem.includes("loinc")) {
      return "LOINC";
    } else if (lowerCaseCodeSystem.includes("nih")) {
      return "NIH";
    } else if (
      lowerCaseCodeSystem.includes("hgnc") ||
      lowerCaseCodeSystem.includes("genenames.org")
    ) {
      return "HGNC";
    } else if (lowerCaseCodeSystem.includes("hl7")) {
      return "HL7";
    } else {
      throw ("Profile codes do not support code system: " + codeSystem);
    }
  }
}

/**
 * Describes the format that the JSON object should be made up of.
 */
interface ProfileSystemCodes {
  [system: string]: { code: string }[];
}

/**
 * Describes a Coding object.
 */
interface Coding {
  system: string;
  code: string;
  display: string;
}