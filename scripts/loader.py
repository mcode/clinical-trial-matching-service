#######
#
# usage: python3 loader.py [absolute_path_to_records] [extensive?] [skip?]
#
#######

import json, os, glob, requests, csv, sys, atexit
from os.path import exists

# List the directory of the records and retrieve only the .json files from that directory
recordDirectory = sys.argv[1]
# Set up the directories
os.chdir(recordDirectory)
records = glob.glob('*.json')
records.sort()
resultsDirectory = "results"

# Determine whether we want to run 1 zip/dist or multiple
extensive = sys.argv[2] == "extensive" if len(sys.argv) > 2 else False
skip = sys.argv[3] == "skip" if len(sys.argv) > 3 else False

# Create the FHIR Parameters resource
zipCodes = ["03766",
            "06510",
            "19114",
            "26241",
            "28655",
            "30303",
            "32209",
            "33612",
            "37232",
            "43506",
            "56401",
            "59901",
            "63104",
            "69361",
            "75390",
            "78229",
            "86901",
            "90505",
            "94115",
            "98284",
            "17601",
            "98027" ] if extensive else ["17601"]
radii = ["20", "50", "100"] if extensive else ["50"]

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
      print(f"Record ({total_runs}): {recordName} | zip: {zipCode} | travel radius: {radius}")

      fileName = f'{resultsDirectory}/{recordName}_r{radius}_z{zipCode}.csv'
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
          response = requests.post('http://localhost:3000/getClinicalTrial', data=json.dumps(data), headers={"Content-Type":"application/json"}, timeout = 30)
        except requests.Timeout:
          print(f"There was a timeout with sending this record ({recordName}) to the wrapper")
          errors.append( { "record": recordName, "radius": radius, "zipCode": zipCode })
          continue
        except requests.ConnectionError:
          print(f"There was a connection error with sending this record ({recordName}) to the wrapper")
          errors.append( { "record": recordName, "radius": radius, "zipCode": zipCode })
          continue

        if response.status_code == requests.codes.ok:
          researchStudies = response.json()
          # Create a .csv file in the resultsDirectory and write the NCTID of each match to that file 
          if (researchStudies["total"] > 0):
            # fileName = resultsDirectory + "/" + record[:-5] + ".csv"
            with open(fileName, mode='w+') as result_file:
              writer = csv.writer(result_file)
              for entry in researchStudies["entry"]:
                writer.writerow([entry["resource"]["id"]])
        else:
          print(f"There was an issue with sending this record ({recordName}) to the wrapper")
          errors.append( { "record": recordName, "radius": radius, "zipCode": zipCode })

def exit_handler(total_runs, errors):
  num_of_errors = len(errors)
  print("-"*45)
  print(f"There were {num_of_errors} errors out of {total_runs} records run.")
  if num_of_errors > 0:
    print("-"*45)
    print(errors)
    print("-"*45)

atexit.register(exit_handler, total_runs, errors)