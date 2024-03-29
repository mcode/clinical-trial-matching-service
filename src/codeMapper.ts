import { Coding } from 'fhir/r4';

/**
 * Enumeration of the possible code systems.
 */
export enum CodeSystemEnum {
  ICD10 = "ICD10",
  SNOMED = "SNOMED",
  RXNORM = "RXNORM",
  AJCC = "AJCC",
  LOINC = "LOINC",
  NIH = "NIH",
  HGNC = "HGNC",
  HL7 = "HL7"
}

/**
 * A class that acts a Code Mapper that maps an input JSON's codes to their associated profiles.
 */
export class CodeMapper {

  // Map<MedicalCode -> Profile[]>
  code_map: Map<string, string[]>;

  /**
   * Constructor for a Code Mapper.
   * @param code_mapping_file The file that dictates the code mapping.
   */
  constructor(code_mapping_file: {[key: string]: ProfileSystemCodes;}) {
    this.code_map = CodeMapper.convertJsonToCodeMap(code_mapping_file);
  }

  /**
   * Converts the JSON object to the Map<Code -> Profile[]> format.
   * @param obj The JSON object.
   * @returns Map<String. Map<String -> List<String>>>
   */
  static convertJsonToCodeMap(obj: {
    [key: string]: ProfileSystemCodes;
  }): Map<string, string[]> {
    const code_map = new Map<string, string[]>();
    for (const profile of Object.keys(obj)) {
      for (const system of Object.keys(obj[profile])) {
        for (const code of obj[profile][system]) {
          const code_string = new MedicalCode(code, system).toString();
          const existing = code_map.get(code_string);
          if (existing) {
            existing.push(profile);
          } else {
            code_map.set(code_string, [profile]);
          }
        }
      }
    }
    return code_map;
  }

  /**
   * Extracts the code mappings for the given list of codings.
   * @param codings The codings to map to profiles.
   * @returns The list of mapped strings for the codings.
   */
  extractCodeMappings(codings: Coding[]): string[] {
    const extracted_mappings: string[] = [];
    for (const code of codings) {
      // Technically the code and system values are optional
      if (typeof code.code !== 'string' || typeof code.system !== 'string') {
        // Skip this code
        continue;
      }
      const medical_code_key = new MedicalCode(code.code, code.system).toString();
      const existing_codes = this.code_map.get(medical_code_key);
      if (existing_codes) {
        extracted_mappings.push(...existing_codes);
      }
    }
    return extracted_mappings;
  }

  /**
   * Returns whether the given coding equals the given code attributes.
   * @param input_coding The coding to check against.
   * @param system The system of the code to compare to.
   * @param code The code of the code to compare to.
   */
  static codesEqual(input_coding: Coding, system: CodeSystemEnum, code: string ): boolean {
    if (typeof input_coding.code !== 'string' || typeof input_coding.system !== 'string') {
      // Treat as false
      return false;
    }
    return new MedicalCode(input_coding.code, input_coding.system).equalsMedicalCode(new MedicalCode(code, system.toString()));
  }

  /**
   * Normalize the code system to a consistent format.
   * @param codeSystem  The code system to normalize.
   * @returns The normalized code system.
   */
  static normalizeCodeSystem(codeSystem: string): CodeSystemEnum {
    const lowerCaseCodeSystem: string = codeSystem.toLowerCase();
    if (lowerCaseCodeSystem.includes("snomed")) {
      return CodeSystemEnum.SNOMED;
    } else if (lowerCaseCodeSystem.includes("rxnorm")) {
      return CodeSystemEnum.RXNORM;
    } else if (
      lowerCaseCodeSystem.includes("icd-10") ||
      lowerCaseCodeSystem.includes("icd10")
    ) {
      return CodeSystemEnum.ICD10;
    } else if (
      lowerCaseCodeSystem.includes("ajcc") ||
      lowerCaseCodeSystem.includes("cancerstaging.org")
    ) {
      return CodeSystemEnum.AJCC;
    } else if (lowerCaseCodeSystem.includes("loinc")) {
      return CodeSystemEnum.LOINC;
    } else if (lowerCaseCodeSystem.includes("nih")) {
      return CodeSystemEnum.NIH;
    } else if (
      lowerCaseCodeSystem.includes("hgnc") ||
      lowerCaseCodeSystem.includes("genenames.org")
    ) {
      return CodeSystemEnum.HGNC;
    } else if (lowerCaseCodeSystem.includes("hl7")) {
      return CodeSystemEnum.HL7;
    } else {
      throw Error("Profile codes do not support code system: " + codeSystem);
    }
  }
}

/**
 * A class that defines a medical code.
 */
class MedicalCode {
  code: string;
  system: CodeSystemEnum;

  /**
   * Constructor for a Medical Code.
   * @param code_string
   * @param system_string
   * @param system_enum
   */
  constructor(
    code_string: string,
    system_string: string,
  ) {
    this.code = code_string;
    this.system = CodeMapper.normalizeCodeSystem(system_string);
  }

  toString() {
    return (
      "Medical Code {code: " + this.code + ", system: " + this.system.toString() + "}"
    );
  }

  equalsMedicalCode(that: MedicalCode) {
    return this.toString() === that.toString();
  }
}

/**
 * Describes the format that the JSON object should be made up of.
 */
interface ProfileSystemCodes {
  // System -> Code[]
  [system: string]: string[];
}
