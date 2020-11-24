import { CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL } from '../../src/clinicaltrialgov';
import { ResearchStudy as IResearchStudy } from '../../src/fhir-types';
import { ResearchStudy } from '../../src/research-study';

export function createResearchStudyObject(nctId?: string): ResearchStudy {
  const result = new ResearchStudy(nctId ?? "test");
  if (nctId) {
    result.identifier = [
      {
        system: CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
        value: nctId
      }
    ];
  }
  return result;
}

export function createResearchStudy(id: string, nctId?: string): IResearchStudy {
  const result: IResearchStudy = {
    resourceType: 'ResearchStudy',
    id: id
  };
  if (nctId) {
    result.identifier = [
      {
        system: CLINICAL_TRIAL_IDENTIFIER_CODING_SYSTEM_URL,
        value: nctId
      }
    ];
  }
  return result;
}
