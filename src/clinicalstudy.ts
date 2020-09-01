/**
 * Types related to the ClinicalTrials.gov XML file. This is based on the ClinicalTrials.gov XML schema:
 * https://clinicaltrials.gov/ct2/html/images/info/public.xsd
 *
 * This is a *partial* set of types. It's based on the object that would be created via xml2js, assuming that the
 * given XML file is valid.
 */

/**
 * For documentation purposes, indicates an element that will only ever appear once in a valid document. It's still
 * ultimately an array at present.
 */
type One<T> = Array<T>;

/**
 * For documentation purposes, indicates an element that can appear any number of times.
 */
type Unbounded<T> = Array<T>;

/**
 * For documentation purposes, a field that is an XML Schema Integer.
 * (Note that technically, integer is unbounded - that is, may be any integer of any length.)
 */
export type XSInteger = string;

/**
 * For documentation purposes, a field that is an XML Schema positiveInteger.
 */
export type XSPositiveInteger = string;

// Generic data types

export type ActualEnum = 'Actual' | 'Anticipated' | 'Estimate';

// This is how it exists within the XML. It could be converted to a boolean.
export type YesNoEnum = 'Yes' | 'No';

/**
 * Actually needs to match a pattern, but TypeScript doesn't support that. From
 * the schema:
 *
 * Dates may now include a day
 *     Month Day, Year    Or    Month Year
 * Necessary to accurately calculate deadlines
 *
 * The pattern is: (Unknown|((January|February|March|April|May|June|July|August|September|October|November|December) (([12]?[0-9]|30|31)\, )?[12][0-9]
 */
export type VariableDate = string;

// Due to the way the parser works
export type VariableDateStruct =
  | {
      $: { type?: ActualEnum };
      _: VariableDate;
    }
  | VariableDate;

// Required Header

export interface RequiredHeaderStruct {
  download_date: One<string>;
  link_text: One<string>;
  url: One<string>;
}

// Id Info

export interface IdInfoStruct {
  org_study_id?: One<string>;
  secondary_id?: Unbounded<string>;
  nct_id: One<string>;
  nct_alias?: Unbounded<string>;
}

// Sponsor

export type AgencyClassEnum = 'NIH' | 'U.S. Fed' | 'Industry' | 'Other';

export interface SponsorStruct {
  agency: One<string>;
  agency_class?: One<AgencyClassEnum>;
}

// Sponsors

export interface SponsorsStruct {
  lead_sponsor: One<SponsorStruct>;
  collaborator?: Unbounded<SponsorStruct>;
}

// Oversight

export interface OversightInfoStruct {
  has_dmc?: One<YesNoEnum>;
  is_fda_regulated_drug?: One<YesNoEnum>;
  is_fda_regulated_device?: One<YesNoEnum>;
  is_unapproved_device?: One<YesNoEnum>;
  is_ppsd?: One<YesNoEnum>;
  is_us_export?: One<YesNoEnum>;
}

// Expanded Access

export interface ExpandedAccessInfoStruct {
  expanded_access_type_individual?: One<YesNoEnum>;
  expanded_access_type_intermediate?: One<YesNoEnum>;
  expanded_access_type_treatment?: One<YesNoEnum>;
}

// Study Design

export interface StudyDesignInfoStruct {
  allocation?: One<string>;
  intervention_model?: One<string>;
  intervention_model_description?: One<string>;
  primary_purpose?: One<string>;
  observational_model?: One<string>;
  time_perspective?: One<string>;
  masking?: One<string>;
  masking_description?: One<string>;
}

// Protocol Outcome

export interface protocol_outcome_struct {
  measure: One<string>;
  time_frame?: One<string>;
  description?: One<string>;
}

// Enrollment

export type EnrollmentStruct =
  | {
      $: { type: ActualEnum };
      _: XSInteger;
    }
  | XSInteger;

// Arm Group

export interface ArmGroupStruct {
  arm_group_label: One<string>;
  arm_group_type?: One<string>;
  description?: One<string>;
}

// Intervention

export type InterventionTypeEnum =
  | 'Behavioral'
  | 'Biological'
  | 'Combination Product'
  | 'Device'
  | 'Diagnostic Test'
  | 'Dietary Supplement'
  | 'Drug'
  | 'Genetic'
  | 'Procedure'
  | 'Radiation'
  | 'Other';

export interface InterventionStruct {
  intervention_type: One<InterventionTypeEnum>;
  intervention_name: One<string>;
  description?: One<string>;
  arm_group_label?: Unbounded<string>;
  other_name?: Unbounded<string>; // synonyms for intervention_name
}

// Textblock

export interface TextblockStruct {
  textblock: One<string>;
}

// Eligibility

export type SamplingMethodEnum = 'Probability Sample' | 'Non-Probability Sample';

export type GenderEnum = 'Female' | 'Male' | 'All';

/**
 * This is another XML schema pattern. The pattern is:
 * N/A|([1-9][0-9]* (Year|Years|Month|Months|Week|Weeks|Day|Days|Hour|Hours|Minute|Minutes))
 */
export type AgePattern = string;

export interface EligibilityStruct {
  study_pop?: One<TextblockStruct>;
  sampling_method?: One<SamplingMethodEnum>;
  criteria?: One<TextblockStruct>;
  gender: One<GenderEnum>;
  gender_based?: One<YesNoEnum>;
  gender_description?: One<string>;
  minimum_age: One<AgePattern>;
  maximum_age: One<AgePattern>;
  healthy_volunteers?: One<string>;
}

// Contact

export interface ContactStruct {
  first_name?: One<string>;
  middle_name?: One<string>;
  last_name?: One<string>;
  degrees?: One<string>;
  phone?: One<string>;
  phone_ext?: One<string>;
  email?: One<string>;
}

// Investigator

export type RoleEnum = 'Principal Investigator' | 'Sub-Investigator' | 'Study Chair' | 'Study Director';

export interface InvestigatorStruct {
  first_name?: One<string>;
  middle_name?: One<string>;
  last_name: One<string>;
  degrees?: One<string>;
  role?: One<RoleEnum>;
  affiliation?: One<string>;
}

// Address

export interface AddressStruct {
  city: One<string>;
  state?: One<string>;
  zip?: One<string>;
  country: One<string>;
}

// Facility
export interface FacilityStruct {
  name?: One<string>;
  address?: One<AddressStruct>;
}

// Status
export type RecruitmentStatusEnum =
  | 'Active, not recruiting'
  | 'Completed'
  | 'Enrolling by invitation'
  | 'Not yet recruiting'
  | 'Recruiting'
  | 'Suspended'
  | 'Terminated'
  | 'Withdrawn';

export type ExpandedAccessStatusEnum =
  | 'Available'
  | 'No longer available'
  | 'Temporarily not available'
  | 'Approved for marketing';

export type RedactedRecordStatusEnum = 'Withheld';

export type UnknownStatusEnum = 'Unknown status';

/**
 * Valid values for overall status depend on the value of the study type:
 *  - For studies that have not been updated in 2 years, the value unknown_status_enum
 *  - For Interventional or Observational studies, values from recruitment_status_enum
 *  - For Expanded Access studies, values from expanded_access_status_enum
 *  - Otherwise, values from redacted_record_status_enum
 *
 * This enum is also the valid values for location status, but the rules for which
 * locations are included or witheld in the public xml are subject to change.
 * You may not see all possible values.
 */
export type StatusEnum =
  | RecruitmentStatusEnum
  | ExpandedAccessStatusEnum
  | RedactedRecordStatusEnum
  | UnknownStatusEnum;

// Location

export interface LocationStruct {
  facility?: One<FacilityStruct>;
  status?: One<StatusEnum>;
  contact?: One<ContactStruct>;
  contact_backup?: One<ContactStruct>;
  investigator?: Unbounded<InvestigatorStruct>;
}

// Location Countries

export interface CountriesStruct {
  country?: Unbounded<string>;
}

// Links

export interface LinkStruct {
  url: One<string>;
  description?: One<string>;
}

// References

export interface ReferenceStruct {
  citation?: One<string>;
  PMID?: One<XSPositiveInteger>;
}

// Responsible Party

export type ResponsiblePartyTypeEnum = 'Sponsor' | 'Principal Investigator' | 'Sponsor-Investigator';

/**
 * old style
 */
export interface ResponsiblePartyStructOldStyle {
  name_title?: One<string>;
  organization?: One<string>;
}

/**
 * new style, used in newer records
 */
export interface ResponsiblePartyStructNewStyle {
  responsible_party_type: One<ResponsiblePartyTypeEnum>;
  investigator_affiliation?: One<string>;
  investigator_full_name?: One<string>;
  investigator_title?: One<string>;
}

export type ResponsiblePartyStruct = ResponsiblePartyStructOldStyle | ResponsiblePartyStructNewStyle;

// Browse

export interface BrowseStruct {
  mesh_term?: Unbounded<string>;
}

// Patient Data

export interface PatientDataStruct {
  sharing_ipd: One<string>;
  ipd_description?: One<string>;
  ipd_info_type?: Unbounded<string>;
  ipd_time_frame?: One<string>;
  ipd_access_criteria?: One<string>;
  ipd_url?: One<string>;
}

// Study Docs

export interface StudyDocStruct {
  doc_id?: One<string>;
  doc_type?: One<string>;
  doc_url?: One<string>;
  doc_comment?: One<string>;
}

export interface StudyDocsStruct {
  study_doc: Unbounded<StudyDocStruct>;
}

// Provided Document Section Struct

export interface provided_document_struct {
  document_type?: One<string>;
  document_has_protocol?: One<string>;
  document_has_icf: One<string>;
  document_has_sap?: One<string>;
  document_date?: One<string>;
  document_url?: One<string>;
}

export interface provided_document_section_struct {
  provided_document: provided_document_struct; //  maxOccurs="unbounded"
}

// Pending Results

// The schema declaration here is weird, and probably wrong. It defines an
// optional unbounded choice between three different elements that are each
// individually optional.
//
// In regex terms, it's doing something like (a?|b?|c?)*.
export interface PendingResultsStruct {
  submitted?: VariableDateStruct[];
  returned?: VariableDateStruct[];
  submission_canceled?: VariableDateStruct[];
}

// Group

export interface GroupStruct {
  $: { group_id: string };
  title?: One<string>;
  description?: One<string>;
}

export interface ParticipantsStruct {
  $: {
    group_id: string;
    count?: string;
  };
  _: string;
}

// Milestone
export interface MilestoneStruct {
  title: One<string>;
  participants_list: One<{
    participants: ParticipantsStruct[];
  }>;
}

// Clinical Study

export type StudyTypeEnum =
  | 'Expanded Access'
  | 'Interventional'
  | 'N/A'
  | 'Observational'
  | 'Observational [Patient Registry]';

export type PhaseEnum =
  | 'N/A'
  | 'Early Phase 1'
  | 'Phase 1'
  | 'Phase 1/Phase 2'
  | 'Phase 2'
  | 'Phase 2/Phase 3'
  | 'Phase 3'
  | 'Phase 4';

export type BiospecRetentionEnum = 'None Retained' | 'Samples With DNA' | 'Samples Without DNA';

export interface ClinicalStudy {
  $: { rank?: string };
  required_header: One<RequiredHeaderStruct>;
  id_info: One<IdInfoStruct>;
  brief_title: One<string>;
  acronym?: One<string>;
  official_title?: One<string>;
  sponsors: One<SponsorsStruct>;
  source: One<string>;
  oversight_info?: One<OversightInfoStruct>;
  brief_summary?: One<TextblockStruct>;
  detailed_description?: One<TextblockStruct>;
  overall_status: One<StatusEnum>;
  last_known_status?: One<StatusEnum>;
  why_stopped?: One<string>;
  start_date?: One<VariableDateStruct>;
  completion_date?: One<VariableDateStruct>;
  primary_completion_date?: One<VariableDateStruct>;
  phase?: One<PhaseEnum>;
  study_type: One<StudyTypeEnum>;
  has_expanded_access?: One<YesNoEnum>;
  expanded_access_info?: One<ExpandedAccessInfoStruct>;
  study_design_info?: One<StudyDesignInfoStruct>;
  target_duration?: One<string>;
  // primary_outcome?: Unbounded<ProtocolOutcomeStruct>;
  // secondary_outcome?: Unbounded<ProtocolOutcomeStruct>;
  // other_outcome?: Unbounded<ProtocolOutcomeStruct>;
  number_of_arms?: One<XSInteger>;
  number_of_groups?: One<XSInteger>;
  enrollment?: One<EnrollmentStruct>;
  condition?: Unbounded<string>;
  // arm_group: arm_group_struct; //  minOccurs="0" maxOccurs="unbounded"
  // intervention: intervention_struct; //  minOccurs="0" maxOccurs="unbounded"
  // biospec_retention: biospec_retention_enum; //  minOccurs="0"
  // biospec_descr: textblock_struct; //  minOccurs="0"
  eligibility?: One<EligibilityStruct>; //  minOccurs="0"
  // overall_official: investigator_struct; //  minOccurs="0" maxOccurs="unbounded"
  // overall_contact: contact_struct; //  minOccurs="0"
  // overall_contact_backup: contact_struct; //  minOccurs="0"
  location?: Unbounded<LocationStruct>;
  // location_countries: countries_struct; //  minOccurs="0"
  // removed_countries: countries_struct; //  minOccurs="0"
  // link: link_struct; //  minOccurs="0" maxOccurs="unbounded"
  // reference: reference_struct; //  minOccurs="0" maxOccurs="unbounded"
  // results_reference: reference_struct; //  minOccurs="0" maxOccurs="unbounded"
  // verification_date: variable_date_type; //  minOccurs="0"
  // study_first_submitted: variable_date_type; //  minOccurs="0"
  // study_first_submitted_qc: variable_date_type; //  minOccurs="0"
  // study_first_posted: variable_date_struct; //  minOccurs="0"
  // results_first_submitted: variable_date_type; //  minOccurs="0"
  // results_first_submitted_qc: variable_date_type; //  minOccurs="0"
  // results_first_posted: variable_date_struct; //  minOccurs="0"
  // disposition_first_submitted: variable_date_type; //  minOccurs="0"
  // disposition_first_submitted_qc: variable_date_type; //  minOccurs="0"
  // disposition_first_posted: variable_date_struct; //  minOccurs="0"
  // last_update_submitted: variable_date_type; //  minOccurs="0"
  // last_update_submitted_qc: variable_date_type; //  minOccurs="0"
  // last_update_posted: variable_date_struct; //  minOccurs="0"
  // responsible_party: responsible_party_struct; //  minOccurs="0"
  // keyword: xs:string; //  minOccurs="0" maxOccurs="unbounded"
  // condition_browse: browse_struct; //  minOccurs="0"
  // intervention_browse: browse_struct; //  minOccurs="0"
  // patient_data: patient_data_struct; //  minOccurs="0"
  // study_docs: study_docs_struct; //  minOccurs="0"
  // provided_document_section: provided_document_section_struct; //  minOccurs="0"
  // pending_results: pending_results_struct; //  minOccurs="0"
  // clinical_results: clinical_results_struct; //  minOccurs="0"
}
