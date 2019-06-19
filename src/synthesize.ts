import { ReadonlyHashMap } from './hash-map';
import * as Rdf from './rdf-model';
import {
  ObjectProperty, LiteralShape, ResourceShape, Shape, ShapeID, ShapeReference
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
          `value is (${typeof value}) ${value}, target is ${Rdf.toString(ref.target)}`
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
          `value is (${typeof value}) ${value}, target is ${Rdf.toString(ref.target)}`
        );
      }
    default:
      return value;
  }
}

export interface SynthesizeContext {
  readonly matches: ReadonlyHashMap<Rdf.Term, ReadonlyArray<ReferenceMatch>>;
  resolveShape(id: ShapeID): Shape;
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
      let result: { [propertyName: string]: unknown } = {};
      synthesizeProperties(result, shape.typeProperties, context);
      synthesizeProperties(result, shape.properties, context);
      return result;
    }
    case 'resource':
      return synthesizeResource(shape, context);
    case 'literal':
      return synthesizeLiteral(shape, context);
    default:
      throw new Error('Cannot synthesize value for shape ' + Rdf.toString(shape.id));
  }
}

function synthesizeProperties(
  template: { [propertyName: string]: unknown },
  properties: ReadonlyArray<ObjectProperty>,
  context: SynthesizeContext
) {
  for (const property of properties) {
    const valueShape = context.resolveShape(property.valueShape);
    template[property.name] = synthesizeShape(valueShape, context);
  }
}

function synthesizeResource(shape: ResourceShape, context: SynthesizeContext) {
  if (shape.value) {
    return shape.value;
  }
  for (const match of context.matches.get(shape.id) || EMPTY_MATCHES) {
    if (Rdf.equals(match.ref.target, shape.id)) {
      switch (match.ref.part) {
        case undefined:
          return match.match;
        case 'value':
          if (typeof match.match !== 'string') {
            throw new Error(
              `Cannot synthesize RDF resource for shape ${Rdf.toString(shape.id)} ` +
              `from non-string (${typeof match.match}) ${match.match}`
            );
          }
          return Rdf.namedNode(match.match);
        default:
          throw new Error(
            `Cannot synthesize RDF resource for shape ${Rdf.toString(shape.id)} ` +
            `from reference part '${match.ref.part}'`
          );
      }
    }
  }
  throw new Error(
    `Failed to find matches to synthesize RDF resource for shape ${Rdf.toString(shape.id)}`
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
    if (Rdf.equals(match.ref.target, shape.id)) {
      switch (match.ref.part) {
        case undefined:
          return match.match;
        case 'value':
          value = checkRefPart(match);
          break;
        case 'datatype':
          datatype = Rdf.namedNode(checkRefPart(match));
          break;
        case 'language':
          language = checkRefPart(match);
          break;
      }
    }
  }
  
  assertPart(shape, 'value', value);
  assertPart(shape, 'datatype', datatype);
  if (datatype && Rdf.equals(datatype, rdf.langString)) {
    assertPart(shape, 'language', language);
    return Rdf.literal(value!, language);
  } else {
    return Rdf.literal(value!, datatype);
  }
}

function checkRefPart(match: ReferenceMatch): string {
  if (typeof match.match !== 'string') {
    throw new Error(
      `Cannot synthesize '${match.ref.part}' part for shape ${Rdf.toString(match.ref.target)} ` +
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
    throw new Error(
      `Failed to find '${part}' part for shape ${Rdf.toString(shape.id)}`
    );
  }
}
