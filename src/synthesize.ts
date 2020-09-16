import { ReadonlyHashMap } from './hash-map';
import * as Rdf from './rdf';
import { ErrorCode, RampError, formatDisplayShape } from './errors';
import {
  ObjectProperty, SetShape, LiteralShape, ResourceShape, Shape, ShapeReference
} from './shapes';
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
  readonly matches: ReadonlyHashMap<Rdf.Term, ReadonlyArray<ReferenceMatch>>;
}

export interface ReferenceMatch {
  ref: ShapeReference;
  match: unknown;
}

const EMPTY_MATCHES: ReadonlyArray<ReferenceMatch> = [];

export function synthesizeShape(
  shape: Shape,
  context: SynthesizeContext
): unknown {
  switch (shape.type) {
    case 'object': {
      const result: { [propertyName: string]: unknown } = {};
      synthesizeProperties(result, shape.typeProperties, context);
      synthesizeProperties(result, shape.properties, context);
      return result;
    }
    case 'set':
      return synthesizeSet(shape, context);
    case 'optional':
      return shape.emptyValue;
    case 'resource':
      return synthesizeResource(shape, context);
    case 'literal':
      return synthesizeLiteral(shape, context);
    default:
      throw makeError(
        ErrorCode.CannotSynthesizeShapeType,
        'Cannot synthesize value for shape ' + formatDisplayShape(shape)
      );
  }
}

function synthesizeProperties(
  template: { [propertyName: string]: unknown },
  properties: ReadonlyArray<ObjectProperty>,
  context: SynthesizeContext
) {
  for (const property of properties) {
    template[property.name] = synthesizeShape(property.valueShape, context);
  }
}

function synthesizeSet(shape: SetShape, context: SynthesizeContext) {
  const count = shape.minCount ?? 0;
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
            throw makeError(
              ErrorCode.CannotSynthesizeResourceFromNonString,
              `Cannot synthesize RDF resource for shape ${formatDisplayShape(shape)} ` +
              `from non-string (${typeof match.match}) ${match.match}`
            );
          }
          return context.factory.namedNode(match.match);
        default:
          throw makeError(
            ErrorCode.CannotSynthesizeResourceFromPart,
            `Cannot synthesize RDF resource for shape ${formatDisplayShape(shape)} ` +
            `from reference part '${match.ref.part}'`
          );
      }
    }
  }
  throw makeError(
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
    throw makeError(
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
    throw makeError(
      ErrorCode.NoPartToSynthesize,
      `Failed to find '${part}' part for shape ${formatDisplayShape(shape)}`
    );
  }
}

function makeError(code: ErrorCode, message: string): RampError {
  const error = new Error(
    `RAMP${code}: ${message}`
  ) as RampError;
  error.rampErrorCode = code;
  return error;
}
