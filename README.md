# clinical-trial-matching-service

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
    resolve(new SeaarchSet(results));
  });
}

const service = new ClinicalTrialMatchingService(customMatchingFunction);
service.listen();
```

## Configuring the service

The `ClinicalTrialMatchingService` can optionally take a `Configuration` object that describes the server's configuration. At present, it has two fields, that are both handed off to the underlying `net.Server#listen` directly:

 * `port` - the port to listen on, must be in the range 0-65535. If 0, a default open port is used.
 * `host` - the host address to bind to

For more information about how these are used, read the [Node.js `net.Server#listen` documentation](https://nodejs.org/dist/latest-v12.x/docs/api/net.html#net_server_listen_port_host_backlog_callback).

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

# Lint and tests

Use `npm run-script lint` to run the linter and `npm test` to run tests. Additionally, `npm run-script coverage` generates a coverage report and `npm run-script coverage:html` generates an HTML coverage report that can be viewed in a browser.