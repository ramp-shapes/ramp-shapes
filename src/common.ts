import { HashMap, HashSet } from './hash-map';
import * as Rdf from './rdf';
import {
  ListShape, LiteralShape, PropertyPath, ResourceShape, Shape,
} from './shapes';
import { ErrorCode, RampError } from './errors';
import { rdf } from './vocabulary';

export function makeTermSet() {
  return new HashSet<Rdf.Term>(Rdf.hashTerm, Rdf.equalTerms);
}

export function makeTermMap<V>() {
  return new HashMap<Rdf.Term, V>(Rdf.hashTerm, Rdf.equalTerms);
}

export function assertUnknownShape(shape: never): never {
  throw new Error(`Unknown shape type ${(shape as Shape).type}`);
}

export function matchesTerm(
  shape: ResourceShape | LiteralShape,
  node: Rdf.Term,
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
        const expectedDatatype = Rdf.toString(shape.datatype);
        const foundDatatype = Rdf.toString(node.datatype);
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
  if (shape.value && !Rdf.equalTerms(shape.value, node)) {
    if (makeError) {
      throw makeError(
        ErrorCode.NonMatchingTermValue,
        `Expected different term value ${Rdf.toString(shape.value)} but found ${Rdf.toString(node)}`
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
  nil: Rdf.NamedNode;
}

export function makeListShapeDefaults(factory: Rdf.DataFactory): ResolvedListShape {
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
  private iri: Rdf.NamedNode | undefined;
  private lastBlank: Rdf.BlankNode | undefined;

  constructor(private shape: Shape) {}

  set(node: Rdf.Term) {
    if (node.termType === 'NamedNode') {
      if (this.iri && !Rdf.equalTerms(node, this.iri)) {
        throw new Error(
          `Inconsistent self reference for object shape ${Rdf.toString(this.shape.id)}`
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
