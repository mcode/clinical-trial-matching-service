import * as fhir from 'fhir/r4';
import { CodeMapper, CodeSystemEnum } from '../src/codeMapper';
import * as code_mapper_test from './data/code_mapper_test.json';

describe('CodeMapper', () => {
  const codeMapper = new CodeMapper(code_mapper_test);

  it('handles all possible values', function () {
    const allCodings: fhir.Coding[] = [];
    allCodings.push({ code: 'aa', system: 'snomed' });
    allCodings.push({ code: 'bb', system: 'SNOMED' });
    allCodings.push({ code: 'cc', system: 'rxnorm' });
    allCodings.push({ code: 'dd', system: 'RXNORM' });
    allCodings.push({ code: 'ee', system: 'icd-10' });
    allCodings.push({ code: 'ff', system: 'ICD-10' });
    allCodings.push({ code: 'gg', system: 'ajcc' });
    allCodings.push({ code: 'hh', system: 'AJCC' });
    allCodings.push({ code: 'ii', system: 'loinc' });
    allCodings.push({ code: 'jj', system: 'LOINC' });
    allCodings.push({ code: 'kk', system: 'nih' });
    allCodings.push({ code: 'll', system: 'NIH' });
    allCodings.push({ code: 'mm', system: 'nih' });
    allCodings.push({ code: 'nn', system: 'NIH' });
    allCodings.push({ code: 'oo', system: 'hl7' });
    allCodings.push({ code: 'pp', system: 'HL7' });

    const testResults = codeMapper.extractCodeMappings(allCodings);
    expect(testResults.indexOf('TEST-1') > -1).toBeTrue();
    expect(testResults.indexOf('TEST-2') > -1).toBeTrue();
    expect(testResults.indexOf('TEST-3') > -1).toBeTrue();
    expect(testResults.indexOf('TEST-4') > -1).toBeTrue();
    expect(testResults.indexOf('TEST-5') > -1).toBeTrue();
    expect(testResults.indexOf('TEST-6') > -1).toBeTrue();
    expect(testResults.indexOf('TEST-7') > -1).toBeTrue();
    expect(testResults.indexOf('TEST-8') > -1).toBeTrue();
  });

  it('Test single mapping.', function () {
    const allCodings: fhir.Coding[] = [];
    allCodings.push({ code: 'ee', system: 'icd-10' });

    const testResults = codeMapper.extractCodeMappings(allCodings);
    expect(testResults.indexOf('TEST-3')).toBe(0);
    expect(testResults.length).toBe(1);
  });

  it('Correct codes with incorrect systems.', function () {
    const allCodings: fhir.Coding[] = [];
    allCodings.push({ code: 'aa', system: 'ajcc' });
    allCodings.push({ code: 'bb', system: 'nih' });
    allCodings.push({ code: 'cc', system: 'snomed' });
    allCodings.push({ code: 'dd', system: 'snomed' });
    allCodings.push({ code: 'ee', system: 'snomed' });
    allCodings.push({ code: 'ff', system: 'snomed' });
    allCodings.push({ code: 'gg', system: 'snomed' });
    allCodings.push({ code: 'hh', system: 'snomed' });
    allCodings.push({ code: 'ii', system: 'snomed' });
    allCodings.push({ code: 'jj', system: 'snomed' });
    allCodings.push({ code: 'kk', system: 'snomed' });
    allCodings.push({ code: 'll', system: 'snomed' });
    allCodings.push({ code: 'mm', system: 'snomed' });
    allCodings.push({ code: 'nn', system: 'snomed' });
    allCodings.push({ code: 'oo', system: 'snomed' });
    allCodings.push({ code: 'pp', system: 'snomed' });

    const testResults = codeMapper.extractCodeMappings(allCodings);
    expect(testResults.length < 1).toBeTrue();
  });

  it('Incorrect codes.', function () {
    const allCodings: fhir.Coding[] = [];
    allCodings.push({ code: 'xx', system: 'ajcc' });
    allCodings.push({ code: 'zz', system: 'nih' });

    const testResults = codeMapper.extractCodeMappings(allCodings);
    expect(testResults.length < 1).toBeTrue();
  });

  it('Invalid code sytem.', () => {
    const testFunc = function () {
      const invalidCoding: fhir.Coding[] = [];
      invalidCoding.push({ code: 'yy', system: 'XXX' });
      codeMapper.extractCodeMappings(invalidCoding);
    };
    expect(testFunc).toThrow(Error('Profile codes do not support code system: XXX'));
  });

  it('Check code equality.', () => {
    const code1 = { code: 'gggggggg', system: 'snomed' } as fhir.Coding;
    const code2 = { code: 'gggggggg', system: 'snomed' };
    const code3 = { code: 'gggggggg', system: 'icd-10' };

    expect(CodeMapper.codesEqual(code1, CodeMapper.normalizeCodeSystem(code2.system), code2.code)).toBeTrue();
    expect(CodeMapper.codesEqual(code1, CodeMapper.normalizeCodeSystem(code3.system), code3.code)).toBeFalse();
  });

  it('Test NIH System Normalizer.', () => {
    expect(CodeMapper.normalizeCodeSystem('nih')).toBe(CodeSystemEnum.NIH);
  });

  describe('#extractMappings', () => {
    it('skips codes with missing system/codes', () => {
      expect(
        codeMapper.extractCodeMappings([
          {
            /* literally nothing */
          },
          { system: 'http://www.example.com/' },
          { code: '1234' }
        ])
      ).toEqual([]);
    });
  });

  describe('.codesEqual', () => {
    it('handles missing system/codes', () => {
      expect(CodeMapper.codesEqual({}, CodeSystemEnum.ICD10, '1234')).toBeFalse();
      expect(CodeMapper.codesEqual({ system: 'icd10' }, CodeSystemEnum.ICD10, '1234')).toBeFalse();
      expect(CodeMapper.codesEqual({ code: '1234' }, CodeSystemEnum.ICD10, '1234')).toBeFalse();
    });
  });

  describe('.normalizeCodeSystem', () => {
    it('maps systems as expected', () => {
      expect(CodeMapper.normalizeCodeSystem('http://www.example.com/hgnc')).toEqual(CodeSystemEnum.HGNC);
      expect(CodeMapper.normalizeCodeSystem('http://www.genenames.org/hgnc')).toEqual(CodeSystemEnum.HGNC);
    });
  });
});
