# Changelog
All notable changes to the Reactodia will be documented in this document.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]
- RAMP language changes:
  * Introduce separate namespace `rampjs` for JS-specific features i.e. mapping values to various types via mappers;
  * Replace `ramp:transient` property on a property by allowing to specify a property type: `[ a ramp:TransientProperty ]` which does not have a `ramp:name`.
  * Remove `ramp:keepAsTerm` property from a `ramp:Literal` (can be repalced by a shape mapper, e.g. `rampjs:mapper [ a rampjs:MapAsTerm ]`).
- `frame()` and `flatten()` changes:
  * `ValueMapper` interface is properly typed with `In` and `Out` generic type parameters to support typed schemas with TypeScript;
  * `ValueMapper.*` built-in mappers are replaced by `mapByDefault()`, `mapIdentity()`, `mapVocabularies()`, `mapVocabulary()`, `mapAsTerm()`, `mapAsString()`, `mapAsNumber()`, `mapAsBoolean()`, `mapAsNativeType()`, `mapInSequence()`;
  * `mapper` parameter to `frame()` and `flatten()` now specifies only a *default* mapper to use when a shape lacks an explicitly provided one;
  * Allow `StackFrame.edge` to be a `PropertyPath`.
- `ShapeBuilder` changes:
  * Construct type-safe schemas with shapes by providing a typed `mapper` instance to various builder methods;
  * Transient properties should be provided to as separate `{ ..., transients: [...] }` parameter to `ShapeBuilder.record()` without an explicit name.
- Fix `generateQuery()` to merge groups of quads (BGPs) located next to each other.
- Expand test suite:
  * Fix an error when trying to display a diff for a recursive (cyclic) value.
  * Enable `flatten` test result comparison with expected graph.
  * Convert existing examples into unit tests.
  * Output elapsed time for each test.

## [0.11.0] - 2022-02-17

TODO: describe changes in previous releases

[Unreleased]: https://github.com/ramp-shapes/ramp-shapes/compare/v0.11.0...HEAD
[0.11.0]: https://github.com/ramp-shapes/ramp-shapes/compare/v0.10.0...v0.11.0
