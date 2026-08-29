import type { DataFactory, Term, BlankNode, Literal, NamedNode } from '@rdfjs/types';
import { ReadonlyHashMap } from '@reactodia/hashmap';

import { equalTerms } from './rdf/rdf-model.js';
import { ErrorCode, RampError, formatDisplayShape, makeRampError } from './errors.js';
import {
  RecordProperty, SetShape, LiteralShape, ResourceShape, AnyOfShape, Shape, ShapeReference,
  Match,
} from './shapes.js';
import { makeTermMap } from './common.js';
import { rdf } from './vocabulary.js';

export function compactByReference(value: unknown, shape: Shape, ref: ShapeReference): unknown {
  switch (ref.part) {
    case 'value':
      if (shape.type === 'resource' || shape.type === 'literal') {
        return (value as NamedNode | BlankNode | Literal).value;
      } else {
        throw new Error(
          'Compacting term value by reference allowed only for resource or literal shapes: ' +
          `value is (${typeof value}) ${String(value)}, target is ${formatDisplayShape(ref.target)}`
        );
      }
    case 'datatype':
    case 'language':
      if (shape.type === 'literal') {
        const literal = value as Literal;
        return ref.part === 'datatype' ? literal.datatype : literal.language;
      } else {
        throw new Error(
          'Framing term datatype or language as map key allowed only for literal shapes: ' +
          `value is (${typeof value}) ${String(value)}, target is ${formatDisplayShape(ref.target)}`
        );
      }
    default:
      return value;
  }
}

export interface SynthesizeContext {
  readonly factory: DataFactory;
  readonly matches: ReadonlyHashMap<Term, ReadonlyArray<ReferenceMatch>>;
  makeError(code: ErrorCode, message: string): RampError;
}

export interface ReferenceMatch {
  readonly ref: ShapeReference;
  readonly match: unknown;
}

export const EMPTY_REF_MATCHES: ReadonlyHashMap<Term, ReferenceMatch[]> =
  makeTermMap<ReferenceMatch[]>();

const EMPTY_MATCHES: ReadonlyArray<ReferenceMatch> = [];

export function synthesizeShape(
  shape: Shape,
  context: SynthesizeContext
): unknown {
  return trySynthesizeShape(shape, true, context)!.value;
}

function trySynthesizeShape(
  shape: Shape,
  required: boolean,
  context: SynthesizeContext
): Match<unknown> | undefined {
  let match: Match<unknown> | undefined;
  switch (shape.type) {
    case 'anyOf': {
      match = synthesizeAnyOf(shape, required, context);
      break;
    }
    case 'resource': {
      match = synthesizeResource(shape, required, context);
      break;
    }
    case 'literal': {
      match = synthesizeLiteral(shape, required, context);
      break;
    }
    case 'record': {
      const result: { [propertyName: string]: unknown } = {};
      if (!(
        synthesizeProperties(result, shape.typeProperties, required, context) &&
        synthesizeProperties(result, shape.properties, required, context)
      )) {
        return undefined;
      }
      if (shape.computedProperties) {
        if (!synthesizeProperties(result, shape.computedProperties, required, context)) {
          return undefined;
        }
      }
      match = new Match(result);
      break;
    }
    case 'set': {
      match = synthesizeSet(shape, required, context);
      break;
    }
    case 'optional': {
      match = new Match(shape.emptyValue);
      break;
    }
    case 'list': {
      match = new Match([]);
      break;
    }
    case 'map': {
      match = new Match({});
      break;
    }
    default: {
      throw context.makeError(
        ErrorCode.CannotSynthesizeShapeType,
        'Cannot synthesize value for shape ' + formatDisplayShape(shape)
      );
    }
  }

  if (!match) {
    throw context.makeError(
      ErrorCode.CannotSynthesizeShapeType,
      'Cannot synthesize value for shape ' + formatDisplayShape(shape)
    );
  }

  return match;
}

function synthesizeAnyOf(
  shape: AnyOfShape,
  required: boolean,
  context: SynthesizeContext
): Match<unknown> | undefined {
  for (const variantShape of shape.variants) {
    const match = trySynthesizeShape(variantShape, false, context);
    if (match) {
      return match;
    }
  }

  if (required) {
    for (const variantShape of shape.variants) {
      // try synthesize with `required = true` to produce an error
      trySynthesizeShape(variantShape, true, context);
    }
  }

  return undefined;
}

function synthesizeProperties(
  template: { [propertyName: string]: unknown },
  properties: ReadonlyArray<RecordProperty>,
  required: boolean,
  context: SynthesizeContext
): boolean {
  for (const property of properties) {
    if (property.kind === 'transient') {
      continue;
    }
    const match = trySynthesizeShape(property.valueShape, required, context);
    if (!match) {
      return false;
    }
    template[property.name] = match.value;
  }
  return true;
}

function synthesizeSet(
  shape: SetShape,
  required: boolean,
  context: SynthesizeContext
): Match<unknown> | undefined {
  const count = Math.min(shape.minCount ?? 0, shape.maxCount ?? Infinity);
  const result: unknown[] = [];
  for (let i = 0; i < count; i++) {
    const match = trySynthesizeShape(shape.itemShape, required, context);
    if (!match) {
      return undefined;
    }
    result.push(match.value);
  }
  return new Match(result);
}

function synthesizeResource(
  shape: ResourceShape,
  required: boolean,
  context: SynthesizeContext
): Match<unknown> | undefined {
  if (shape.value) {
    return new Match(shape.value);
  }
  for (const match of context.matches.get(shape.id) || EMPTY_MATCHES) {
    if (equalTerms(match.ref.target.id, shape.id)) {
      switch (match.ref.part) {
        case undefined:
          return new Match(match.match);
        case 'value':
          if (typeof match.match !== 'string') {
            if (required) {
              throw makeRampError(
                ErrorCode.CannotSynthesizeResourceFromNonString,
                `Cannot synthesize RDF resource for shape ${formatDisplayShape(shape)} ` +
                `from non-string (${typeof match.match}) ${String(match.match)}`
              );
            } else {
              return undefined;
            }
          }
          return new Match(context.factory.namedNode(match.match));
        default:
          if (required) {
            throw makeRampError(
              ErrorCode.CannotSynthesizeResourceFromPart,
              `Cannot synthesize RDF resource for shape ${formatDisplayShape(shape)} ` +
              `from reference part '${match.ref.part}'`
            );
          } else {
            return undefined;
          }
      }
    }
  }

  if (required) {
    throw makeRampError(
      ErrorCode.NoMatchesToSynthesize,
      `Failed to find matches to synthesize RDF resource for shape ${formatDisplayShape(shape)}`
    );
  } else {
    return undefined;
  }
}

function synthesizeLiteral(
  shape: LiteralShape,
  required: boolean,
  context: SynthesizeContext
): Match<unknown> | undefined {
  if (shape.value) {
    return new Match(shape.value);
  }

  let value: string | undefined;
  let datatype = shape.datatype;
  let language = shape.language;

  for (const match of context.matches.get(shape.id) || EMPTY_MATCHES) {
    if (equalTerms(match.ref.target.id, shape.id)) {
      switch (match.ref.part) {
        case undefined:
          return new Match(match.match);
        case 'value':
          value = checkRefPart(match);
          break;
        case 'datatype':
          datatype = context.factory.namedNode(checkRefPart(match));
          break;
        case 'language':
          language = checkRefPart(match);
          break;
      }
    }
  }

  if (
    assertPart(shape, 'value', value, required, context) &&
    assertPart(shape, 'datatype', datatype, required, context)
  ) {
    if (datatype && datatype.value === rdf.langString) {
      if (assertPart(shape, 'language', language, required, context)) {
        return new Match(context.factory.literal(value, language));
      }
    } else {
      return new Match(context.factory.literal(value, datatype));
    }
  }
  return undefined;
}

function checkRefPart(match: ReferenceMatch): string {
  if (typeof match.match !== 'string') {
    throw makeRampError(
      ErrorCode.CannotSynthesizePartFromNonString,
      `Cannot synthesize '${match.ref.part}' part for shape ${formatDisplayShape(match.ref.target)} ` +
      `from non-string value (${typeof match.match}) ${String(match.match)}`
    );
  }
  return match.match;
}

function assertPart(
  shape: Shape,
  part: ShapeReference['part'],
  partValue: unknown,
  required: boolean,
  context: SynthesizeContext
): partValue is NonNullable<unknown> {
  if (partValue === undefined) {
    if (required) {
      throw context.makeError(
        ErrorCode.NoPartToSynthesize,
        `Failed to find '${part}' part for shape ${formatDisplayShape(shape)}`
      );
    } else {
      return false;
    }
  }
  return true;
}

export function *findOpenReferencedShapes(shape: Shape): Iterable<ShapeReference> {
  switch (shape.type) {
    case 'resource': {
      if (!shape.value) {
        yield {target: shape};
      }
      break;
    }
    case 'literal': {
      if (!shape.value) {
        yield {target: shape, part: 'value'};
        if (!shape.language && (!shape.datatype || shape.datatype.value === rdf.langString)) {
          yield {target: shape, part: 'language'};
        }
        if (!shape.datatype && !shape.language) {
          yield {target: shape, part: 'datatype'};
        }
      }
      break;
    }
    case 'record': {
      for (const property of shape.typeProperties) {
        yield* findOpenReferencedShapes(property.valueShape);
      }
      for (const property of shape.properties) {
        yield* findOpenReferencedShapes(property.valueShape);
      }
      break;
    }
    case 'set': {
      yield* findOpenReferencedShapes(shape.itemShape);
      break;
    }
  }
}
