import type { DataFactory, Term, BlankNode, NamedNode } from '@rdfjs/types';
import { HashMap, HashSet } from '@reactodia/hashmap';

import { hashTerm, equalTerms, termToString } from './rdf/rdf-model.js';
import {
  ListShape, LiteralShape, PropertyPath, ResourceShape, Shape,
} from './shapes.js';
import { ErrorCode, RampError } from './errors.js';
import { rdf } from './vocabulary.js';

export function makeTermSet() {
  return new HashSet<Term>(hashTerm, equalTerms);
}

export function makeTermMap<V>() {
  return new HashMap<Term, V>(hashTerm, equalTerms);
}

export function assertUnknownShape(shape: never): never {
  throw new Error(`Unknown shape type ${(shape as Shape).type}`);
}

export function matchesTerm(
  shape: ResourceShape | LiteralShape,
  node: Term,
  makeError?: (code: ErrorCode, message: string) => RampError
): boolean {
  if (shape.type === 'resource') {
    if (!(node.termType === 'NamedNode' || node.termType === 'BlankNode')) {
      if (makeError) {
        throw makeError(
          ErrorCode.NonMatchingTermType,
          `Expected "NamedNode" or "BlankNode" term type but found "${node.termType}"`
        );
      } else {
        return false;
      }
    }
    if (shape.onlyNamed && node.termType !== 'NamedNode') {
      if (makeError) {
        throw makeError(
          ErrorCode.NonMatchingTermType,
          `Expected only "NamedNode" term type but found "${node.termType}"`
        );
      } else {
        return false;
      }
    }
  } else {
    if (node.termType !== 'Literal') {
      if (makeError) {
        throw makeError(
          ErrorCode.NonMatchingTermType,
          `Expected "Literal" term type but found "${node.termType}"`
        );
      } else {
        return false;
      }
    }
    if (shape.datatype && shape.datatype.value !== node.datatype.value) {
      if (makeError) {
        const expectedDatatype = termToString(shape.datatype);
        const foundDatatype = termToString(node.datatype);
        throw makeError(
          ErrorCode.NonMatchingLiteralDatatype,
          `Expected literal datatype ${expectedDatatype} but found ${foundDatatype}`
        );
      } else {
        return false;
      }
    }
    if (shape.language && shape.language !== node.language) {
      if (makeError) {
        throw makeError(
          ErrorCode.NonMatchingLiteralLanguage,
          `Expected literal language "${shape.language}" but found "${node.language}"`
        );
      } else {
        return false;
      }
    }
  }
  if (shape.value && !equalTerms(shape.value, node)) {
    if (makeError) {
      throw makeError(
        ErrorCode.NonMatchingTermValue,
        `Expected different term value ${termToString(shape.value)} but found ${termToString(node)}`
      );
    } else {
      return false;
    }
  }
  return true;
}

export interface ResolvedListShape {
  head: PropertyPath;
  tail: PropertyPath;
  nil: NamedNode;
}

export function makeListShapeDefaults(factory: DataFactory): ResolvedListShape {
  return {
    head: {type: 'predicate', predicate: factory.namedNode(rdf.first)},
    tail: {type: 'predicate', predicate: factory.namedNode(rdf.rest)},
    nil: factory.namedNode(rdf.nil),
  };
}

export function resolveListShape(shape: ListShape, defaults: ResolvedListShape): ResolvedListShape {
  return {
    head: shape.headPath || defaults.head,
    tail: shape.tailPath || defaults.tail,
    nil: shape.nil || defaults.nil,
  };
}

export class SubjectMemo {
  private iri: NamedNode | undefined;
  private lastBlank: BlankNode | undefined;

  constructor(private shape: Shape) {}

  set(node: Term) {
    if (node.termType === 'NamedNode') {
      if (this.iri && !equalTerms(node, this.iri)) {
        throw new Error(
          `Inconsistent self reference for object shape ${termToString(this.shape.id)}`
        );
      }
      this.iri = node;
    } else if (node.termType === 'BlankNode') {
      this.lastBlank = node;
    }
  }

  resolve() {
    return this.iri || this.lastBlank;
  }
}
