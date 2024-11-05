# Optic CI action

[![Coverage](./badges/coverage.svg)](./badges/coverage.svg)

This action runs [Optic](https://github.com/opticdev/optic) diff check on all
Open API specs within the repo.

## Inputs

### `compare-from`

The base ref to compare against. Defaults to PR target or HEAD~1.

### `match`

A glob to match specs (e.g. "\*\*/\*.yml" or "\*\*/specifications/\*.json").
Also takes comma separated values (e.g. "\*\*/\*.yml,\*\*/\*.json")

### `ignore`

An ignore glob to ignore certain matches (e.g. "\*\*/\*.yml" or
"\*\*/specifications/\*.json"). Also takes comma separated values (e.g.
"\*\*/\*.yml,\*\*/\*.json")

### `standard`

Run comparison with a locally defined standard, if not set, looks for the
standard on the [x-optic-standard] key in the spec and then the
[optic.yml](https://github.com/opticdev/optic/wiki/CLI-Configuration-Reference#ruleset)
file

### `github-token`

GitHub token to access the repository: comments. Defaults to `github.token`

### `post-pr-comment`

Post a comment on the PR with the results.

### `verbose`

Verbose comments. Default false.

## Example Usage

### Basic Usage

None of the inputs are required, OPTIC will try to find all Open API specs
within the repo and check all files comparing with the PR target or HEAD~1.

```yaml
uses: actions/optic-ci@main
```

### Compare with specific branch

```yaml
uses: actions/optic-ci@main
with:
  compare-from: branch-to-compare
```

### Full list of inputs

```yaml
uses: actions/optic-ci@main
with:
  compare-to: pr-branch-name
  compare-from: branch-to-compare
  match: **/openapi.yaml # also worsk with json spec files
  ignore: **/tests/openapi.yaml
  standard: custom-standard-file.yml
  github-token: ${ github.token }
  post-to-pr: true
  verbose: true
```

## Rulesets

OPTIC relies on rulesets to customize the checks. Those rules are based on
[Spectral](https://docs.stoplight.io/docs/spectral/) rulesets.

### Optic YAML example

```yaml
# optic.yml
ruleset:
  # Prevent breaking changes.
  - 'breaking-changes'

  # Enforce naming conventions in your API.
  - naming:
      required_on: always
      requestHeaders: Capital-Param-Case
      responseHeaders: param-case
      properties: Capital-Param-Case
      pathComponents: param-case
      queryParameters: snake_case

  # Require your OpenAPI has examples, and that those examples match the schema.
  - examples:
      required_on: always
      require_request_examples: true
      require_response_examples: true
      require_parameter_examples: true
      # (Optional) allow certain operations do not need examples.
      exclude_operations_with_extension: x-legacy-api

  - documentation:
      required_on: always
      require_property_descriptions: true
      require_operation_summary: true
      require_operation_description: true
      require_operation_id: true
      # (Optional) allow certain operations do not need examples.
      exclude_operations_with_extension: x-legacy-api

  - spectral:
      # Remote URLs and local paths are supported.
      always:
        - https://raw.githubusercontent.com/.../.spectral.yml
      added:
        - ./spectral.yml
```

### Spectral YAML example

```yaml
# spectra.yml
extends: ['spectral:oas', 'spectral:asyncapi', 'spectral:arazzo']
```

### Notes

## Lint only

If you need only an Open API linter, use
[Spectral Action](https://github.com/stoplightio/spectral-action) instead.
