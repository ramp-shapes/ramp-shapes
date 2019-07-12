import * as Rdf from './rdf';
import { Shape } from './shapes';

export type RamError = Error & {
  ramErrorCode: ErrorCode;
  ramStack?: ReadonlyArray<StackFrame>;
};

export interface StackFrame {
  edge?: string | number;
  shape: Shape;
}

export const enum ErrorCode {
  // General errors
  MissingShape = 101,

  // Framing errors
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

export function isRamError(error: unknown): error is RamError {
  return typeof error === 'object'
    && typeof (error as RamError).ramErrorCode === 'number';
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
    const shape = frame.shape.id.termType === 'BlankNode'
      ? `(${frame.shape.type} ${Rdf.toString(frame.shape.id)})`
      : Rdf.toString(frame.shape.id);
    result += `${edge}${(edge || !first) ? ' / ' : ''}${shape}`;
    first = false;
  }
  return result;
}
