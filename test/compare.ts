import * as Ramp from '../src/index';

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
  switch (typeof a) {
    case 'number': {
      if (Number.isNaN(a) && Number.isNaN(b as number)) { return true; }
      break;
    }
    case 'object': {
      if (a === null || b === null) {
        return a === b;
      } else if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) { return false; }
        for (let i = 0; i < a.length; i++) {
          if (!cyclicSame(a[i], b[i], visitLeft, visitRight)) { return false; }
        }
        return true;
      } else if (Ramp.Rdf.looksLikeTerm(a) && Ramp.Rdf.looksLikeTerm(b)) {
        return Ramp.Rdf.equalTerms(a, b);
      } else {
        const aPrototype = Object.getPrototypeOf(a);
        const bPrototype = Object.getPrototypeOf(b);
        if (aPrototype !== bPrototype) {
          return false;
        }
        for (const key in a) {
          if (Object.hasOwnProperty.call(a, key)) {
            const aValue = (a as any)[key];
            if (aValue !== undefined && !Object.hasOwnProperty.call(b, key)) {
              return false;
            }
            if (!cyclicSame(aValue, (b as any)[key], visitLeft, visitRight)) {
              return false;
            }
          }
        }
        for (const key in b as object) {
          if (Object.hasOwnProperty.call(b, key)) {
            const bValue = (b as any)[key];
            if (bValue !== undefined && !Object.hasOwnProperty.call(a, key)) {
              return false;
            }
          }
        }
        return true;
      }
    }
  }
  visitLeft.delete(a);
  visitRight.delete(b);
  return false;
}
