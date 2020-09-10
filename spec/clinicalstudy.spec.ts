import { isClinicalStudy } from '../src/clinicalstudy';

describe('.isClinicalStudy', () => {
  it('rejects null', () => {
    expect(isClinicalStudy(null)).toBeFalse();
  });
  it('rejects non-objects', () => {
    expect(isClinicalStudy('string')).toBeFalse();
    expect(isClinicalStudy(1)).toBeFalse();
    expect(isClinicalStudy(undefined)).toBeFalse();
    expect(isClinicalStudy(true)).toBeFalse();
  });
  it('rejects a partial but invalid object', () => {
    // Note that this object is actually invalid but the check doesn't do a
    // complete validation of the schema. At least, not yet. If it ever gets
    // that far, it should be spun off into its own library.
    expect(isClinicalStudy({
      'required_header': true,
      'id_info': true,
      'sponsors': true,
      'source': true,
      'overall_status': true,
      'study_type': true
    })).toBeFalse();
  });
})
