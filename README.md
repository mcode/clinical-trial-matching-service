# clinical-trial-matching-service

[![Node.js CI](https://github.com/mcode/clinical-trial-matching-service/actions/workflows/node.js.yml/badge.svg)](https://github.com/mcode/clinical-trial-matching-service/actions/workflows/node.js.yml)

Provides a generic backend library for Clinical Trial Matching Service implementations. This provides the generic shell for services that connect to an actual clinical trial matching service. It receives a FHIR Bundle of patient information, and then uses that to generate a FHIR search result that contains FHIR ResearchStudy objects that describe matching clinical trials.

For more information on the architecture and data schemas of the clinical trial matching system, please visit the clinical-trial-matching-engine [wiki](https://github.com/mcode/clinical-trial-matching-engine/wiki).

## Implementing a Matching Service

Implementing an underlying matching service should be fairly simple: create a new instance of the `ClinicalTrialMatchingService` class, or simply extend it and provide a custom matcher.

```typescript
import ClinicalTrialMatchingService, {
  Bundle,
  ResearchStudy,
  SearchSet
} from 'clinical-trial-matching-service';
// Import the actual implementation which is outside the scope
import findMatchingServices from './matching-implementation';

function customMatchingFunction(patientData: Bundle): Promise<SearchSet> {
  return new Promise((resolve, reject) => {
    // Code to do the searching:
    const results: ResearchStudy[] = findMatchingServices(patientData);
    resolve(new SearchSet(results));
  });
}

const service = new ClinicalTrialMatchingService(customMatchingFunction);
service.listen().catch(err => {
  // Handle listen failing
  console.error('Server failed to start:');
  console.error(err);
});
```

## A Note on Dependencies

Assuming the implementation is in TypeScript, there are a few dependencies that need to match. The first is TypeScript itself. In theory, it doesn't need to match directly, but it's safest if it does. This library is currently built using TypeScript 5.1.6.

Type dependencies currently can't be expressed in `package.json`: that is, libraries that this uses for their types (i.e., anything in `@types`), rather than any code. The same versions should be used in the `devDependencies` of any packages implementing them. The most noteable is the `@types/fhir` library, used for FHIR object types. The library currently uses version 0.0.37, this dependency should be copied into implementations as well. The same `express` types should be used as well, since wrappers need to interact with the Express.js request and response objects. The current `@types/express` used is 4.17.17. Note that the `express` dependency is a `dependency`, meaning it's pulled to packages that depend on it. The problem is solely with the types.

(The types that are necessary for implementing wrappers could also be added to `dependencies` but they'd only serve to bloat the production run-time. They aren't needed except when building this library via TypeScript and any wrapper that uses this library and TypeScript. In theory, a wrapper could use plain JavaScript and not require them at all.)

The following configuration should be in the `devDependencies` of any wrapper that uses this library:

```json
"devDependencies": {
  "@types/express": "^4.17.17",
  "@types/fhir": "^0.0.37",
  "typescript": "^5.1.6"
}
```

Wrappers may work even if the versions don't match exactly, but it's best to try and ensure they remain in sync.

## Configuring the service

The `ClinicalTrialMatchingService` can optionally take a `Configuration` object that describes the server's configuration.

 * `port` - the port to listen on, must be in the range 0-65535. If 0, a default open port is used.
 * `host` - the host address to bind to
 * `urlPrefix` - if given, the prefix to use for all configured request paths (note that it's normalized: `"/prefix"` and `"prefix/"` both cause the application to generate paths that begin with `"/prefix/"`.)

For more information about how `port` and `host` are used, read the [Node.js `net.Server#listen` documentation](https://nodejs.org/dist/latest-v12.x/docs/api/net.html#net_server_listen_port_host_backlog_callback).

Note: If the `PASSENGER_BASE_URI` environment variable is set, this is used as the value for `urlPrefix`. This is to provide compatibility when running within Passenger with a base URI set via Passenger's configuration.

The `configFromEnv()` helper function can be used to pull in all environment variables (or all environment variables starting with a given prefix) into a configuration object that can be passed to the `ClinicalTrialMatchingService` constructor. The function will remove the prefix (if one is given) and lowercase the key for all environment variables in the final configuration (meaning `PORT` and `port` both specify a value for `port`). The function has the following overloads:

 * `configFromEnv()` - load all environment variables in `process.env` with no prefix
 * `configFromEnv(prefix: string)` - load all environment variables in `process.env` with the given prefix
 * `configFromEnv(env: Record<string, string | undefined>)` - convert the given object
 * `configFromEnv(prefix: string, env: Record<string, string | undefined>)` - using the given prefix, convert the given object

It is recommended that you use something like [dotenv-flow](https://github.com/kerimdzhanov/dotenv-flow) to load configuration into the environment and then this helper to create the configuration itself.

# Helper Classes

Various classes and types are provided to make implementing another service easier.

## ResearchStudy

An implementation of the FHIR ResearchStudy type is provided to make generating a ResearchStudy easier. It offers a few helper methods to make filling out the study easier:

### `ResearchStudy(id: string | number)`

Construct the ResearchStudy resource, filling out a few default values (such as the `resourceType` field), and populating the ID.

### `addContainedResource(resource: ContainedResource): Reference`

Add a contained resource, returning a reference to it that can be added elsewhere. If the contained resource does not have an ID, one will be created, based on the resource type.

### `createReferenceId(prefix = 'resource')`

Generate a new ID that can be used on a contained resource. At present this does not check existing IDs to ensure they are unique.

### `addContact`

This has two overloads:
 * `addContact(contact: ContactDetail): ContactDetail`
 * `addContact(name: string, phone?: string, email?: string): ContactDetail`

Both add a contact to the `contact` field within the ResearchStudy. The first adds the given `ContactDetail` directly, the second one creates it and populates it with the given information. Both return the added `ContactDetail` - for the first, it will be the contact given, on the second, it will be the newly generated `ContactDetail`.

### `addSite`

This has two overloads:
 * `addSite(location: Location): Location`
 * `addSite(name: string, phone?: string, email?: string): Location`

Both add a reference to a Location to the `site` field, and then add the `Location` to the contained resources as via `addContainedResource(resource)`. The given `Location` (first overload) or generated `Location` (second overload) is returned.

## `SearchSet`

This helper class basically generates a `Bundle` of type `searchset` that contains a set of `ResearchStudy` objects that are given to it.

### `SearchSet(studies: ResearchStudy[])`

Construct a `Bundle` that contains `entry` objects that contain the given set of studies.

## `RequestError`

When thrown from the matching function, this allows greater customization of a 4xx HTTP response based on some error that prevents the search from being proessed. For example, if necessary data is missing, or the server can't be accessed, this can be thrown.

### `RequestError(message: string, httpStatus = 400)`

Construct an error with the given `message` string and possibly with an `httpStatus` code.

## mCODE Extractor

The mCODEextractor is a class within the package that can be used to extract and create mCODE objects from an input patient record.
Construct with: `const extractedMcode = new mcode.mCODEextractor(patientBundle: fhir.Bundle);`
Then, you can pull out the different objects using:
  `getPrimaryCancerConditions(): PrimaryCancerCondition[]`
  `getSecondaryCancerConditions(): SecondaryCancerCondition[]`
  `getTNMclinicalStageGroup(): fhir.Coding[]`
  `getTNMpathologicalStageGroup(): fhir.Coding[]`
  `getBirthDate(): string`
  `getTumorMarkers(): TumorMarker[]`
  `getCancerGeneticVariants(): CancerGeneticVariant[]`
  `getCancerRelatedRadiationProcedures(): CancerRelatedRadiationProcedure[]`
  `getCancerRelatedSurgicalProcedures(): CancerRelatedSurgicalProcedure[]`
  `getCancerRelatedMedicationStatements(): fhir.Coding[]`
  `getEcogPerformanceStatus(): number`
  `getKarnofskyPerformanceStatus(): number`

## MappingLogic

MappingLogic is an abstract class that can be extended to implement your own Mapping Logic. Its constructor takes, by default, a `(patientBundle: fhir.Bundle)` and automatically builds out the extracted mCODE objects. It includes several required methods that are necessary to have logic for.

## CodeMapper

The CodeMapper class is one that can be used to automatically build out a mapping of codes to profile strings. It can be constructed using `const codeMapper = new CodeMapper(code_mapping_file: {[key: string]: ProfileSystemCodes;});`. The required structure of this input JSON can be viewed in the example file at `/spec/data/code_mapper_test.json`.

# Lint and tests

Use `npm run-script lint` to run the linter and `npm test` to run tests. Additionally, `npm run-script coverage` generates a coverage report and `npm run-script coverage:html` generates an HTML coverage report that can be viewed in a browser.
