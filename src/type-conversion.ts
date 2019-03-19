import * as Rdf from './rdf-model';
import { NodeShape } from './shapes';
import { xsd } from './vocabulary';

export function tryConvertToNativeType(shape: NodeShape, value: Rdf.Node): unknown {
  if (value.type === 'uri') {
    return value.value;
  } else if (value.type === 'bnode') {
    return Rdf.toString(value);
  } else if (shape.datatype) {
    if (Rdf.equals(shape.datatype, xsd.string)) {
      return value.value;
    } else if (Rdf.equals(shape.datatype, xsd.boolean)) {
      return Boolean(value.value);
    } else if (isIntegerType(shape.datatype.value) || isFractionalType(shape.datatype.value)) {
      return Number(value.value);
    } else if (isDateType(shape.datatype.value)) {
      return new Date(value.value);
    }
  } else {
    return value;
  }
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

function isDateType(datatype: string) {
  return datatype === xsd.dateTime.value;
}
