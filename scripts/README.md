# clinical-trial-matching-app/scripts

Useful scripts to test the other matching services via the [Clinical Trial Matching Service wrappers](https://github.com/mcode?q=clinical-trial-service-&type=all&language=&sort=). 

## Requirements

- [Python 3](https://www.python.org/downloads/)
  - [pip](https://pypi.org/project/pip/)
- At least one of the following matching services:
  - [Ancora](https://github.com/mcode/clinical-trial-matching-service-ancora.ai)
  - [BreastCancerTrials](https://github.com/mcode/clinical-trial-matching-service-breastcancertrials.org)
  - [Carebox](https://github.com/mcode/clinical-trial-matching-service-carebox)
  - [Lungevity](https://github.com/mcode/clinical-trial-matching-service-lungevity)
  - [TrialScope](https://github.com/mcode/clinical-trial-matching-service-trialscope)
- [Clinical Trial Matching App](https://github.com/mcode/clinical-trial-matching-app)

## Usage

Follow the instructions needed to install and run the wrapper of your choice before running any of the following scripts.

### loader.py

Purpose of this script is meant to test a single wrapper against a directory of Patient Bundles, radii, and zip codes and save off the results (NCT IDs). Will generate a csv per every patient bundle, radius, and zipcode combination. 

```
usage: loader.py [-h] [-r RESULT_DIRECTORY] [-e] [-s] record_directory

positional arguments:
  record_directory      Directory of records

optional arguments:
  -h, --help            show this help message and exit
  -r RESULT_DIRECTORY, --result_directory RESULT_DIRECTORY
                        Result Directory
  -e, --extensive       Run extensive, against multiple zips and radii of
                        interest
  -s, --skip            If files already exist, skip (don't rewrite)
  ```

* `record_directory`: Directory holding Patient Bundles
* `-r RESULT_DIRECTORY, --result_directory RESULT_DIRECTORY` (Optional): Directory where results should be dumped. If you don't want to supply this as an argument, you can also change line 29 to the directory where the results should be placed. You must do at least one of these.
* `-e, --extensive` (Optional): Run the script in extensive mode. This will run the each provided patient bundle against multiple zip codes of interest and against three different radii magnitudes (20, 50, 100 miles). If not present, the script will only run with a distance of 20miles for the zipcode 75001. 
* `-s, --skip` (Optional): Run the script in skip mode. When running the script, if one of the results has a name conflict with an existing file, it will skip writing those results. If not present, the script will rewrite any files if there are conflicts.

### test_cancer_types.py

Purpose of this script is meant to test a single wrapper against all of the primary cancer conditions allowed in the [Clinical Trial Matching App](https://github.com/mcode/clinical-trial-matching-app) for a single cancer type and saves off the successes/failures. Will generate one Excel workbook with a spreadsheet for every returned HTTP Status.

```
usage: test_cancer_types.py [-h] [-f FILE] [-d DIRECTORY]
                            {ancora,bct,carebox,lungevity,trialjectory}
                            {bladder,brain,breast,colon,lung,multipleMyeloma,prostate}

positional arguments:
  {ancora,bct,carebox,lungevity,trialjectory}
                        Service you want to send the requests to
  {bladder,brain,breast,colon,lung,multipleMyeloma,prostate}
                        Cancer type you would like to run against

optional arguments:
  -h, --help            show this help message and exit
  -f FILE, --file FILE  Path to the cancerTypes.json file
  -d DIRECTORY, --directory DIRECTORY
                        Directory on where to place results
```

* `service {ancora,bct,carebox,lungevity,trialjectory}`: The service/wrapper that you would like to run the script against. 
* `cancer_type {bladder,brain,breast,colon,lung,multipleMyeloma,prostate}`: The cancer type that you would like to filter from the app's available primary cancer conditions. 
* `-f FILE, --file FILE` (Optional): Path to where `cancerTypes.json` is defined where ever you have saved [Clinical Trial Matching App](https://github.com/mcode/clinical-trial-matching-app). If you don't want to supply this as an argument, you can also change line 18 to this path. You must do at least one of these.
* `-d DIRECTORY, --directory DIRECTORY`(Optional): Directory where resulting Excel should be dumped. If not present, will place the resulting Excel file in current working directory.