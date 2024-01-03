import argparse
from datetime import datetime
import json
import requests
import os
import sys
import xlsxwriter

SERVICES = {
    "ancora": "http://localhost:3002/getClinicalTrial",
    "carebox": "http://localhost:3004/getClinicalTrial",
    "bct": "http://localhost:3000/getClinicalTrial",
    "lungevity": "http://localhost:3003/getClinicalTrial",
    "trialjectory": "http://localhost:3001/getClinicalTrial"
}

# Change this if you just want to set this moving forward instead of 
path_to_cancer_types = None

# Filter function for selecting only values with specific cancer_type
def filter_cancer_type(cancer_type, entry):
    return cancer_type in entry["cancerType"]

# Basic request that will change the primary cancer condition
def primary_request(code, display, system='http://snomed.info/sct'):
    req = {
            "resourceType": "Bundle",
            "type": "collection",
            "entry": [
                {
                    "resource": {
                        "resourceType": "Parameters",
                        "id": "0",
                        "parameter": [
                            {
                                "name": "zipCode",
                                "valueString": "75390"
                            },
                            {
                                "name": "travelRadius",
                                "valueString": "20"
                            }
                        ]
                    }
                },
                {
                    "resource": {
                        "resourceType": "Patient",
                        "id": "x158lHhYhbvCXQ3VLfy-v",
                        "gender": "female",
                        "birthDate": "1953"
                    },
                    "fullUrl": "urn:uuid:x158lHhYhbvCXQ3VLfy-v"
                },
                {
                    "resource": {
                        "resourceType": "Condition",
                        "meta": {
                            "profile": [
                                "http://hl7.org/fhir/us/mcode/StructureDefinition/mcode-primary-cancer-condition"
                            ]
                        },
                        "subject": {
                            "reference": "urn:uuid:x158lHhYhbvCXQ3VLfy-v",
                            "type": "Patient"
                        },
                        "code": {
                            "coding": [
                                {
                                    "system": system,
                                    "code": code,
                                    "display": display
                                }
                            ]
                        },
                        "category": [
                            {
                                "coding": [
                                    {
                                        "system": "http://snomed.info/sct",
                                        "code": "64572001"
                                    }
                                ]
                            }
                        ]
                    }
                }
            ]
        }
    return req

def main(argv):
    # Collect cli arguments
    argParser = argparse.ArgumentParser()
    argParser.add_argument("service", choices=["ancora", "bct", "carebox", "lungevity", "trialjectory"], help="Service you want to send the requests to")
    argParser.add_argument("cancer", choices=["bladder", "brain", "breast", "colon", "lung", "multipleMyeloma", "prostate"], help="Cancer type you would like to run against")
    argParser.add_argument("-f", "--file", help="Path to the cancerTypes.json file")
    argParser.add_argument("-d", "--directory", help="Directory on where to place results")
    args = argParser.parse_args()

    results = {}
    timeouts = []

    # Process cli arguments
    service = args.service
    cancer_type = args.cancer
    directory = os.path.expanduser(args.directory)

    if args.file:
        path_to_cancer_types = args.file

    if service == None or cancer_type == None:
        sys.exit()

    if path_to_cancer_types == None or len(path_to_cancer_types) == 0:
        print("Please supply a path to the application's list of cancer types.")
        sys.exit()

    # Collect system, display, and code from app's cancerTypes.json file
    f = open(path_to_cancer_types)
    data = json.load(f)

    # Filter out the ones for the specific cancer type we're testing against
    filtered_cancer_types = filter(lambda entry: filter_cancer_type(cancer_type, entry), data)

    # Go through each of the primary cancer conditions
    for entry in filtered_cancer_types:
        # Build the request and send it to the matching service wrapper
        req = primary_request(entry["code"], entry["display"], entry["system"])
        try:
            response = requests.post(SERVICES[service], data=json.dumps(req), headers={"Content-Type": "application/json"}, timeout=30)
        except requests.Timeout:
            # Collect any Timeouts if we receive any
            print(f'There was a timeout with sending this record ({entry["code"]}, {entry["display"]}, {entry["system"]}) to the wrapper')
            timeouts.append([entry["code"], entry["display"], entry["system"]])
            continue

        if response.status_code not in results:
            results[response.status_code] = []

        # Collect results based on status returned
        researchStudies = response.json()
        results[response.status_code].append([entry["code"], entry["display"], entry["system"], researchStudies["total"] if "total" in researchStudies else 0 ])

    dt = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    if directory != None and len(directory) > 0 and os.path.exists(directory):
        os.chdir(directory)

    # Build excel sheet
    filename = f"{service}_{cancer_type}_{dt}.xlsx"
    workbook = xlsxwriter.Workbook(filename)
    # Prevent the codes from being changed to scientific/number formats
    text_format = workbook.add_format({'num_format': '@'})

    for status, studies in results.items():
        worksheet = workbook.add_worksheet(str(status))
        worksheet.write(0, 0, "Code")
        worksheet.write(0, 1, "Display")
        worksheet.write(0, 2, "System")
        worksheet.write(0, 3, "Number of Results")
        for index, entry in enumerate(studies):
            worksheet.write(index + 1, 0, entry[0], text_format)
            worksheet.write(index + 1, 1, entry[1])
            worksheet.write(index + 1, 2, entry[2])
            worksheet.write(index + 1, 3, entry[3])
    
    if len(timeouts):
        worksheet = workbook.add_worksheet("Timeouts")
        worksheet.write(0, 0, "Code")
        worksheet.write(0, 1, "Display")
        worksheet.write(0, 2, "System")
        for entry in timeouts:
            worksheet.write(index + 1, 0, timeouts[0], text_format)
            worksheet.write(index + 1, 1, timeouts[1])
            worksheet.write(index + 1, 2, timeouts[2])

    workbook.close()
    print("-"*45)
    print("Results", results)
    print("-"*45)
    print("Timeouts", timeouts)
    print("-"*45)
    print(f"Results printed out to {filename}")

if __name__ == "__main__":
    main(sys.argv[1:])