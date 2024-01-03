#######
#
# usage: loader.py [-h] [-r RESULT_DIRECTORY] [-e] [-s] record_directory
#
#######

import argparse
import json
import os
import glob
import requests
import csv
import sys
import atexit
from os.path import exists

argParser = argparse.ArgumentParser()
argParser.add_argument("record_directory", help="Directory of records")
argParser.add_argument("-r", "--result_directory", help="Result Directory")
argParser.add_argument("-e", "--extensive", action='store_const', const=True, help="Run extensive, against multiple zips and radii of interest")
argParser.add_argument("-s", "--skip", action='store_const', const=True, help="If files already exist, skip (don't rewrite)")
args = argParser.parse_args()

# List the directory of the records and retrieve only the .json files from that directory
record_directory = os.path.expanduser(args.record_directory)
os.chdir(record_directory)
records = glob.glob('*.json')
records.sort()
results_directory = None

if args.result_directory:
    results_directory = os.path.expanduser(args.result_directory)

if results_directory == None or len(results_directory) == 0:
    print("Please supply a path to a results directory")
    sys.exit()

extensive = args.extensive
skip = args.skip

# Create the FHIR Parameters resource
zipCodes = ["25438",
            "26506",
            "26330",
            "26101",
            "25401",
            "26003",
            "26038",
            "24740",
            "15401",
            "26726",
            "90211",
            "55455",
            "55101",
            "72205",
            "26506",
            "19104",
            "92868",
            "60637",
            "59102",
            "85364",
            "33606",
            "80045",
            "06102",
            "31202",
            "31405",
            "31904",
            "31501",
            "30303",
            "75390"] if extensive else ["75001"]
radii = ["20", "50", "100"] if extensive else ["20"]

errors = []
total_runs = 0
for zipCode in zipCodes:
    for radius in radii:
        parameter = {
            "resource":
            {
                "resourceType": "Parameters",
                "id": "0",
                "parameter": [
                    {
                        "name": "zipCode",
                        "valueString": zipCode
                    },
                    {
                        "name": "travelRadius",
                        "valueString": radius
                    }
                ]
            }
        }

        # Loop through each record
        for record in records:
            total_runs += 1
            recordName = record[:-5]
            print("-"*45)
            print(
                f"Record ({total_runs}): {recordName} | zip: {zipCode} | travel radius: {radius}")

            fileName = f'{results_directory}{os.sep}{recordName}_r{radius}_z{zipCode}.csv'
            file_exists = exists(fileName)

            if skip and file_exists:
                print("Skipping file due to prior existence")
                continue

            with open(record) as f:
                data = json.load(f)

                # Add the parameter resource to the record
                data["entry"].append(parameter)
                data["type"] = "collection"

                # Send the patient bundle to the wrapper
                try:
                    response = requests.post('http://localhost:3000/getClinicalTrial', data=json.dumps(
                        data), headers={"Content-Type": "application/json"}, timeout=30)
                except requests.Timeout:
                    print(
                        f"There was a timeout with sending this record ({recordName}) to the wrapper")
                    errors.append(
                        {"record": recordName, "radius": radius, "zipCode": zipCode})
                    continue
                except requests.ConnectionError:
                    print(
                        f"There was a connection error with sending this record ({recordName}) to the wrapper")
                    errors.append(
                        {"record": recordName, "radius": radius, "zipCode": zipCode})
                    continue

                if response.status_code == requests.codes.ok:
                    researchStudies = response.json()
                    # Create a .csv file in the results_directory and write the NCTID of each match to that file
                    if (researchStudies["total"] > 0):
                        # fileName = results_directory + "/" + record[:-5] + ".csv"
                        print(f"Writing results to... {fileName}")
                        with open(fileName, mode='w+') as result_file:
                            writer = csv.writer(result_file)
                            for entry in researchStudies["entry"]:
                                writer.writerow(
                                    [entry["resource"]["identifier"][0]["value"]])
                else:
                    print(
                        f"There was an issue with sending this record ({recordName}) to the wrapper")
                    errors.append(
                        {"record": recordName, "radius": radius, "zipCode": zipCode})


def exit_handler(total_runs, errors):
    num_of_errors = len(errors)
    print("-"*45)
    print(
        f"There were {num_of_errors} errors out of {total_runs} records run.")
    if num_of_errors > 0:
        print("-"*45)
        print(errors)
        print("-"*45)


atexit.register(exit_handler, total_runs, errors)
