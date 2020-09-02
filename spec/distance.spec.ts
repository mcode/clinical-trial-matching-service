import { DistanceService } from './../src/distance';
import { ResearchStudy } from '../src/fhir-types';
import fs from 'fs';
import data from './data/distance_study.json';


describe('.isValidNCTNumber', () => {
    const dist = new DistanceService('01730');

    beforeAll( async function() {
        
        await dist.makeZipDict();

    });

    it('calculates the distance to research study sites from origin', () => {
        const study = data as ResearchStudy;
        
        const updatedstudy = dist.addDistance(study);
        expect(updatedstudy.identifier?.length).toBeGreaterThan(1);
    });


});