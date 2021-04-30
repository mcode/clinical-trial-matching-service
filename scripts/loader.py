#######
#
# usage: python3 loader.py [absolute_path_to_records]
#
#######

import json, os, glob, requests, csv, sys

# List the directory of the records and retrieve only the .json files from that directory
recordDirectory = sys.argv[1]
os.chdir(recordDirectory)
records = glob.glob('*.json')
resultsDirectory = "results"

# Create the FHIR Parameters resource
zipCode = "02021"
travelRadius = "100"
parameter = {"resource": 
{"resourceType": "Parameters",
 "id": "0",
 "parameter": [{"name": "zipCode", "valueString":zipCode}]}}

# Loop through each record
for record in records:
  print(record)
  with open(record) as f:
    data = json.load(f)

    # Add the parameter resource to the record
    data["entry"].append(parameter)
    data["type"] = "collection"

    # Send the patient bundle to the wrapper
    response = requests.post('http://localhost:3000/getClinicalTrial', data=json.dumps(data), headers={"Content-Type":"application/json"})
    researchStudies = response.json()

    # Create a .csv file in the resultsDirectory and write the NCTID of each match to that file 
    if (researchStudies["total"] > 0):
      with open(resultsDirectory + "/" + record[:-5] + ".csv", mode='w') as result_file:
        writer = csv.writer(result_file)
        for entry in researchStudies["entry"]:
          writer.writerow([entry["resource"]["id"]])
