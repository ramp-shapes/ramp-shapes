import * as Rdf from './rdf-model';
import { ResourceShape, LiteralShape } from './shapes';
import { rdf, xsd } from './vocabulary';

export function tryConvertToNativeType(shape: ResourceShape | LiteralShape, value: Rdf.Term): unknown {
  if (shape.keepAsTerm) {
    return value;
  }
  
  if (shape.type === 'resource') {
    if (value.termType === 'NamedNode') {
      return value.value;
    } else if (value.termType === 'BlankNode') {
      return Rdf.toString(value);
    }
  }
  
  if (shape.type === 'literal' && value.termType === 'Literal') {
    const datatype = effectiveDatatype(shape);
    if (datatype) {
      if (Rdf.equals(datatype, xsd.string)) {
        return value.value;
      } else if (Rdf.equals(datatype, rdf.langString) && shape.language) {
        return value.value;
      } else if (Rdf.equals(datatype, xsd.boolean)) {
        return Boolean(value.value);
      } else if (isNumberType(datatype.value)) {
        return Number(value.value);
      }
    }
  }

  return value;
}

export function tryConvertFromNativeType(shape: ResourceShape | LiteralShape, value: unknown): unknown {
  if (shape.type === 'resource' && typeof value === 'string') {
    return value.startsWith('_:')
      ? Rdf.blankNode(value.substring(2))
      : Rdf.namedNode(value);
  }
  
  if (shape.type === 'literal') {
    const datatype = effectiveDatatype(shape);
    if (datatype) {
      if (Rdf.equals(datatype, xsd.string) && typeof value === 'string') {
        return Rdf.literal(value);
      } else if (
        Rdf.equals(datatype, rdf.langString)
        && shape.language
        && typeof value === 'string'
      ) {
        return Rdf.literal(value, shape.language);
      } else if (Rdf.equals(datatype, xsd.boolean) && typeof value === 'boolean') {
        return Rdf.literal(value ? 'true' : 'false', shape.datatype);
      } else if (isNumberType(datatype.value) && typeof value === 'number') {
        return Rdf.literal(value.toString(), shape.datatype);
      }
    }
  }

  return value;
}

function effectiveDatatype(shape: LiteralShape): Rdf.NamedNode | undefined {
  return shape.datatype
    || (shape.language ? rdf.langString : undefined)
    || (shape.value ? shape.value.datatype : undefined);
}

function isNumberType(datatype: string) {
  return isIntegerType(datatype) || isFractionalType(datatype);
}

function isIntegerType(datatype: string) {
  return (
    datatype === xsd.integer.value ||
    datatype === xsd.nonNegativeInteger.value
  );
}

function isFractionalType(datatype: string) {
  return (
    datatype === xsd.decimal.value ||
    datatype === xsd.double.value
  );
}
