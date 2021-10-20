import { ReadonlyHashMap } from './hash-map';
import * as Rdf from './rdf';
import { ErrorCode, formatDisplayShape, makeRampError } from './errors';
import {
  SetShape, LiteralShape, ResourceShape, Shape, ShapeReference,
} from './shapes';
import { makeTermMap } from './common';
import { ValueMapper } from './value-mapping';
import { rdf } from './vocabulary';

export function compactByReference(value: unknown, shape: Shape, ref: ShapeReference): unknown {
  switch (ref.part) {
    case 'value':
      if (shape.type === 'resource' || shape.type === 'literal') {
        return (value as Rdf.NamedNode | Rdf.BlankNode | Rdf.Literal).value;
      } else {
        throw new Error(
          `Compacting term value by reference allowed only for resource or literal shapes: ` +
          `value is (${typeof value}) ${value}, target is ${formatDisplayShape(ref.target)}`
        );
      }
    case 'datatype':
    case 'language':
      if (shape.type === 'literal') {
        const literal = value as Rdf.Literal;
        return ref.part === 'datatype' ? literal.datatype : literal.language;
      } else {
        throw new Error(
          `Framing term datatype or language as map key allowed only for literal shapes: ` +
          `value is (${typeof value}) ${value}, target is ${formatDisplayShape(ref.target)}`
        );
      }
    default:
      return value;
  }
}

export interface SynthesizeContext {
  readonly factory: Rdf.DataFactory;
  readonly mapper: ValueMapper;
  readonly matches: ReadonlyHashMap<Rdf.Term, ReadonlyArray<ReferenceMatch>>;
}

export interface ReferenceMatch {
  ref: ShapeReference;
  match: unknown;
}

export const EMPTY_REF_MATCHES: ReadonlyHashMap<Rdf.Term, ReferenceMatch[]> =
  makeTermMap<ReferenceMatch[]>();

const EMPTY_MATCHES: ReadonlyArray<ReferenceMatch> = [];

export function synthesizeShape(
  shape: Shape,
  context: SynthesizeContext
): unknown {
  let value: unknown;
  switch (shape.type) {
    case 'record': {
      const result: { [propertyName: string]: unknown } = {};
      synthesizeProperties(result, shape.typeProperties, context);
      synthesizeProperties(result, shape.properties, context);
      if (shape.computedProperties) {
        synthesizeProperties(result, shape.computedProperties, context);
      }
      value = result;
      break;
    }
    case 'set': {
      value = synthesizeSet(shape, context);
      break;
    }
    case 'optional': {
      value = shape.emptyValue;
      break;
    }
    case 'resource': {
      value = synthesizeResource(shape, context);
      break;
    }
    case 'literal': {
      value = synthesizeLiteral(shape, context);
      break;
    }
    default: {
      throw makeRampError(
        ErrorCode.CannotSynthesizeShapeType,
        'Cannot synthesize value for shape ' + formatDisplayShape(shape)
      );
    }
  }
  const typed = context.mapper.fromRdf(value, shape);
  return typed;
}

interface AnyObjectProperty {
  readonly name: string;
  readonly valueShape: Shape;
}

function synthesizeProperties(
  template: { [propertyName: string]: unknown },
  properties: ReadonlyArray<AnyObjectProperty>,
  context: SynthesizeContext
) {
  for (const property of properties) {
    template[property.name] = synthesizeShape(property.valueShape, context);
  }
}

function synthesizeSet(shape: SetShape, context: SynthesizeContext) {
  const count = Math.min(shape.minCount ?? 0, shape.maxCount ?? Infinity);
  const result: unknown[] = [];
  for (let i = 0; i < count; i++) {
    result.push(synthesizeShape(shape.itemShape, context));
  }
  return result;
}

function synthesizeResource(shape: ResourceShape, context: SynthesizeContext) {
  if (shape.value) {
    return shape.value;
  }
  for (const match of context.matches.get(shape.id) || EMPTY_MATCHES) {
    if (Rdf.equalTerms(match.ref.target.id, shape.id)) {
      switch (match.ref.part) {
        case undefined:
          return match.match;
        case 'value':
          if (typeof match.match !== 'string') {
            throw makeRampError(
              ErrorCode.CannotSynthesizeResourceFromNonString,
              `Cannot synthesize RDF resource for shape ${formatDisplayShape(shape)} ` +
              `from non-string (${typeof match.match}) ${match.match}`
            );
          }
          return context.factory.namedNode(match.match);
        default:
          throw makeRampError(
            ErrorCode.CannotSynthesizeResourceFromPart,
            `Cannot synthesize RDF resource for shape ${formatDisplayShape(shape)} ` +
            `from reference part '${match.ref.part}'`
          );
      }
    }
  }
  throw makeRampError(
    ErrorCode.NoMatchesToSynthesize,
    `Failed to find matches to synthesize RDF resource for shape ${formatDisplayShape(shape)}`
  );
}

function synthesizeLiteral(shape: LiteralShape, context: SynthesizeContext) {
  if (shape.value) {
    return shape.value;
  }

  let value: string | undefined;
  let datatype = shape.datatype;
  let language = shape.language;

  for (const match of context.matches.get(shape.id) || EMPTY_MATCHES) {
    if (Rdf.equalTerms(match.ref.target.id, shape.id)) {
      switch (match.ref.part) {
        case undefined:
          return match.match;
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

  assertPart(shape, 'value', value);
  assertPart(shape, 'datatype', datatype);
  if (datatype && datatype.value === rdf.langString) {
    assertPart(shape, 'language', language);
    return context.factory.literal(value!, language);
  } else {
    return context.factory.literal(value!, datatype);
  }
}

function checkRefPart(match: ReferenceMatch): string {
  if (typeof match.match !== 'string') {
    throw makeRampError(
      ErrorCode.CannotSynthesizePartFromNonString,
      `Cannot synthesize '${match.ref.part}' part for shape ${formatDisplayShape(match.ref.target)} ` +
      `from non-string value (${typeof match.match}) ${match.match}`
    );
  }
  return match.match;
}

function assertPart(
  shape: Shape,
  part: ShapeReference['part'],
  partValue: unknown
) {
  if (partValue === undefined) {
    throw makeRampError(
      ErrorCode.NoPartToSynthesize,
      `Failed to find '${part}' part for shape ${formatDisplayShape(shape)}`
    );
  }
}
