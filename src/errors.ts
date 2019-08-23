import * as Rdf from './rdf';
import { Shape } from './shapes';

export type RampError = Error & {
  rampErrorCode: ErrorCode;
  rampStack?: ReadonlyArray<StackFrame>;
};

export interface StackFrame {
  edge?: string | number;
  shape: Shape;
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
}

export function isRampError(error: unknown): error is RampError {
  return typeof error === 'object'
    && typeof (error as RampError).rampErrorCode === 'number';
}

export function formatDisplayShape(shape: Shape): string {
  return shape.id.termType === 'BlankNode'
    ? `(${shape.type} ${Rdf.toString(shape.id)})`
    : Rdf.toString(shape.id);
}

export function formatShapeStack(stack: ReadonlyArray<StackFrame>): string {
  let result = '';
  let first = true;
  for (const frame of stack) {
    const edge = (
      typeof frame.edge === 'string' ? `."${frame.edge}"` :
      frame && typeof frame.edge === 'number' ? `.[${frame.edge}]` :
      ''
    );
    const shape = formatDisplayShape(frame.shape);
    result += `${edge}${(edge || !first) ? ' / ' : ''}${shape}`;
    first = false;
  }
  return result;
}
