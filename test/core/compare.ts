import type { Literal, Term, BaseQuad } from '@rdfjs/types';

import * as Ramp from '../../src/index.js';

export function structurallySame(a: unknown, b: unknown): boolean {
  return cyclicSame(a, b, new Set(), new Set());
}

export function cyclicSame(a: unknown, b: unknown, visitLeft: Set<unknown>, visitRight: Set<unknown>) {
  if (a === b) { return true; }
  if (typeof a !== typeof b) { return false; }
  if (visitLeft.has(a) && visitRight.has(b)) {
    return true;
  }
  visitLeft.add(a);
  visitRight.add(b);
  let result = false;
  outer: switch (typeof a) {
    case 'number': {
      if (Number.isNaN(a) && Number.isNaN(b as number)) {
        result = true;
        break outer;
      }
      break;
    }
    case 'object': {
      if (a === null || b === null) {
        result = a === b;
        break outer;
      } else if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) {
          break outer;
        }
        for (let i = 0; i < a.length; i++) {
          if (!cyclicSame(a[i], b[i], visitLeft, visitRight)) {
            break outer;
          }
        }
        result = true;
        break outer;
      } else if (Ramp.looksLikeTerm(a) && Ramp.looksLikeTerm(b)) {
        result = Ramp.equalTerms(a, b);
        break outer;
      } else {
        const aPrototype: unknown = Object.getPrototypeOf(a);
        const bPrototype: unknown = Object.getPrototypeOf(b);
        if (aPrototype !== bPrototype) {
          break outer;
        }
        for (const key in a) {
          if (Object.hasOwnProperty.call(a, key)) {
            const aValue = (a as Record<string, unknown>)[key];
            if (aValue !== undefined && !Object.hasOwnProperty.call(b, key)) {
              break outer;
            }
            if (!cyclicSame(aValue, (b as Record<string, unknown>)[key], visitLeft, visitRight)) {
              break outer;
            }
          }
        }
        for (const key in b as object) {
          if (Object.hasOwnProperty.call(b, key)) {
            const bValue = (b as Record<string, unknown>)[key];
            if (bValue !== undefined && !Object.hasOwnProperty.call(a, key)) {
              break outer;
            }
          }
        }
        result = true;
        break outer;
      }
    }
  }
  visitLeft.delete(a);
  visitRight.delete(b);
  return result;
}

export function compareTerms(a: Term, b: Term): number {
  if (a.termType !== b.termType) {
    return a.termType < b.termType ? -1 : 1;
  }
  switch (a.termType) {
    case 'NamedNode':
    case 'BlankNode':
    case 'Variable': {
      if (a.value !== b.value) {
        return a.value < b.value ? -1 : 1;
      }
      return 0;
    }
    case 'Literal': {
      const other = b as Literal;
      if (a.value !== other.value) {
        return a.value < other.value ? -1 : 1;
      } else if (a.datatype !== other.datatype) {
        return a.datatype < other.datatype ? -1 : 1;
      } else if (a.language !== other.language) {
        return a.language < other.language ? -1 : 1;
      }
      return 0;
    }
    case 'Quad': {
      const other = b as BaseQuad;
      return (
        compareTerms(a.graph, other.graph) ||
        compareTerms(a.subject, other.subject) ||
        compareTerms(a.predicate, other.predicate) ||
        compareTerms(a.object, other.object)
      );
    }
    default: {
      return 0;
    }
  }
}
