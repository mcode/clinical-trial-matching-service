import { ClinicalStudy } from '../../src/clinicalstudy';

/**
 * Simple factory method for creating demo data.
 * @param nctId the NCT ID to use
 */
export function createClinicalStudy(nctId = 'NCT12345678'): ClinicalStudy {
  return {
    required_header: [{ download_date: ['test'], link_text: ['link'], url: ['http://www.example.com/'] }],
    id_info: [
      {
        nct_id: [nctId]
      }
    ],
    brief_title: ['Title'],
    sponsors: [
      {
        lead_sponsor: [
          {
            agency: ['Agency']
          }
        ]
      }
    ],
    source: ['test'],
    overall_status: ['Available'],
    study_type: ['Observational']
  };
}
