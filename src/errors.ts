import * as Rdf from './rdf';
import { Shape } from './shapes';
import { rdf, xsd } from './vocabulary';

export type RampError = Error & {
  rampErrorCode: ErrorCode;
  rampStack?: ReadonlyArray<StackFrame>;
};

export interface StackFrame {
  edge?: string | number;
  shape: Shape;
  focus?: Rdf.Term;
}

export const enum ErrorCode {
  // General errors
  MissingShape = 101,

  // Frame/flatten errors
  ShapeMismatch = 201,
  PropertyMismatch = 202,
  NoPropertyMatches = 203,
  MultiplePropertyMatches = 204,
  NonResourceTerm = 205,
  MultipleListHeadMatches = 206,
  NoListHeadMatches = 207,
  MultipleListItemMatches = 208,
  NoListItemMatches = 209,
  MultipleListTailMatches = 210,
  NoListTailMatches = 211,
  CompositeMapKey = 212,
  FailedToCompactValue = 213,
  CannotRemoveRefContext = 214,
  NonMatchingRefContext = 215,
  CyclicMatch = 216,
  NoMapKeyMatches = 217,
  NoMapValueMatches = 218,
  MinCountMismatch = 219,
  MaxCountMismatch = 220,
  // term matching
  NonMatchingTermType = 221,
  NonMatchingTermValue = 222,
  NonMatchingLiteralDatatype = 223,
  NonMatchingLiteralLanguage = 224,

  // Synthesize errors
  CannotSynthesizeShapeType = 301,
  CannotSynthesizeResourceFromNonString = 302,
  CannotSynthesizeResourceFromPart = 303,
  CannotSynthesizePartFromNonString = 304,
  NoMatchesToSynthesize = 305,
  NoPartToSynthesize = 306,

  // Flatten/validate errors
  FailedToMatchProperties = 401,
  FailedToMatchProperty = 402,
  CannotUseLiteralAsSubject = 403,
}

export function isRampError(error: unknown): error is RampError {
  return typeof error === 'object'
    && typeof (error as RampError).rampErrorCode === 'number';
}

export function makeRampError(
  code: ErrorCode,
  message: string,
  stack?: ReadonlyArray<StackFrame>
): RampError {
  const stackString = stack ? formatShapeStack(stack) : undefined;
  const error = new Error(
    `RAMP${code}: ${message}` + (stackString ? ` at ${stackString}` : '')
  ) as RampError;
  error.rampErrorCode = code;
  error.rampStack = stack;
  return error;
}

export function formatDisplayShape(shape: Shape, focus?: Rdf.Term): string {
  const formattedShape = shape.id.termType === 'BlankNode'
    ? formatBlankShape(shape)
    : Rdf.toString(shape.id);
  return focus ? `(${Rdf.toString(focus)} @ ${formattedShape})` : formattedShape;
}

function formatBlankShape(shape: Shape) {
  if ((shape.type === 'resource' || shape.type === 'literal') && shape.value) {
    return `(equals ${Rdf.toString(shape.value)})`;
  } else if (shape.type === 'literal' && typeof shape.language === 'string') {
    return `(literal with language "${shape.language}")`;
  } else if (shape.type === 'literal' && shape.datatype) {
    return `(literal of type ${formatCommonPrefixedIri(shape.datatype)})`;
  }
  return `(${shape.type})`;
}

function formatCommonPrefixedIri(term: Rdf.NamedNode) {
  if (term.value.startsWith(rdf.NAMESPACE)) {
    return `rdf:` + term.value.substring(rdf.NAMESPACE.length);
  } else if (term.value.startsWith(xsd.NAMESPACE)) {
    return `xsd:` + term.value.substring(xsd.NAMESPACE.length);
  } else {
    return Rdf.toString(term);
  }
}

const STACK_FRAME_SEPARATOR = `\n  >> `;

export function formatShapeStack(stack: ReadonlyArray<StackFrame>): string {
  let result = '';
  let first = true;
  for (const frame of stack) {
    const edge = (
      typeof frame.edge === 'string' ? `."${frame.edge}"` :
      frame && typeof frame.edge === 'number' ? `.[${frame.edge}]` :
      ''
    );
    const shape = formatDisplayShape(frame.shape, frame.focus);
    result += `${edge}${(edge || !first) ? STACK_FRAME_SEPARATOR : ''}${shape}`;
    first = false;
  }
  return STACK_FRAME_SEPARATOR + result;
}
