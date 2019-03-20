import * as Rdf from './rdf-model';
import { NodeShape } from './shapes';
import { xsd } from './vocabulary';

export function tryConvertToNativeType(shape: NodeShape, value: Rdf.Node): unknown {
  if (shape.nodeType === 'resource') {
    if (value.type === 'uri') {
      return value.value;
    } else if (value.type === 'bnode') {
      return Rdf.toString(value);
    }
  } else if (shape.nodeType === 'literal' && shape.datatype && value.type === 'literal') {
    if (Rdf.equals(shape.datatype, xsd.string)) {
      return value.value;
    } else if (Rdf.equals(shape.datatype, xsd.boolean)) {
      return Boolean(value.value);
    } else if (isNumberType(shape.datatype.value)) {
      return Number(value.value);
    }
  }
  return value;
}

export function tryConvertFromNativeType(shape: NodeShape, value: unknown): unknown {
  if (shape.nodeType === 'resource' && typeof value === 'string') {
    return value.startsWith('_:')
      ? Rdf.blank(value.substring(2))
      : Rdf.iri(value);
  } else if (shape.nodeType === 'literal' && shape.datatype) {
    if (Rdf.equals(shape.datatype, xsd.string) && typeof value === 'string') {
      return Rdf.literal(value);
    } else if (Rdf.equals(shape.datatype, xsd.boolean) && typeof value === 'boolean') {
      return Rdf.literal(value ? 'true' : 'false', shape.datatype);
    } else if (isNumberType(shape.datatype.value) && typeof value === 'number') {
      return Rdf.literal(value.toString(), shape.datatype);
    }
  }
  return value;
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
