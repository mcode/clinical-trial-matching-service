import { ResearchStudy, Resource } from './fhir-types';
import fs from 'fs';
import csv from 'csv-parser';
import { getDistance, convertDistance, getPreciseDistance, orderByDistance } from 'geolib';
import { GeolibInputCoordinates } from 'geolib/es/types';


export class DistanceService {
    public dict? : Map<string, { latitude: number; longitude: number }>;

  /**
   * @param zipCode the zipcode of the starting location
   */
  constructor(public zipCode: string) {}

  /** Creates a dictionary of zipcodes to lat long coordinates
   * 
   */
    makeZipDict(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            try {
                let results: Map<string, { latitude: number; longitude: number }> = new Map<string, { latitude: number; longitude: number }>();
                fs.createReadStream('spec/data/uszips2.csv')
                    .pipe(csv())
                    .on('data', (data) => results.set(data.zip, JSON.parse(data.json)))
                    .on('end', () => {
                        /* console.log('we ended');
                        const point1: GeolibInputCoordinates = results.get('07030') as GeolibInputCoordinates;
                        const point2: GeolibInputCoordinates = results.get('01886') as GeolibInputCoordinates;
                        console.log(point1);
                        console.log(point2);
                        console.log(convertDistance(getPreciseDistance(point1, point2), 'mi') + ' miles');
                        */
                       this.dict=results;
                        resolve()
                    });
            }
            catch (error) {
                reject(error);
            }
        });
    }
  /**
   * Adds a site as a contained resource.
   * @param name the name of the site to add
   * @return the location added
   */
  addDistance(study: ResearchStudy): ResearchStudy {
    let points : GeolibInputCoordinates [] = [];
    if(study.contained){
    for (const resource of study.contained){
        if(resource.resourceType === 'Location'){
            if(resource.position){
                const coordinate =  {"latitude": resource.position.latitude, "longitude": resource.position.longitude} as GeolibInputCoordinates;
                points.push(coordinate);


            }
        }

    }
    const origin = this.dict?.get(this.zipCode) as GeolibInputCoordinates;
    const ordered = orderByDistance(origin, points);
   
    const closest = ordered.map((point) => convertDistance(getDistance(origin, point), 'mi'));
    if(study.identifier){
        study.identifier.push({ 
            use: "temp",
            value: `Nearest site as close as ${closest[0]} miles`
          });
    }
    return study;

    }
    else{
        return study;
    }

    //convertDistance(getPreciseDistance(point1, point2), 'mi')



  }
}
