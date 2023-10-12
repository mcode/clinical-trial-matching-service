import { Status, Study, StudyType } from '../../src/ctg-api';

/**
 * Simple factory method for creating demo data.
 * @param nctId the NCT ID to use
 */
export function createClinicalStudy(nctId = 'NCT12345678'): Study {
  return {
    protocolSection: {
      identificationModule: {
        nctId: nctId
      },
      statusModule: {
        overallStatus: Status.AVAILABLE
      },
      designModule: {
        studyType: StudyType.OBSERVATIONAL
      },
      descriptionModule: {
        briefSummary: 'Title'
      },
      sponsorCollaboratorsModule: {
        leadSponsor: {
          name: 'Agency'
        }
      }
    }
  };
}
