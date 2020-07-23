import { HashMap, HashSet } from './hash-map';
import * as Rdf from './rdf';
import {
  ListShape, LiteralShape, PathSequence, ResourceShape, Shape,
} from './shapes';
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

export function matchesTerm(shape: ResourceShape | LiteralShape, node: Rdf.Term): boolean {
  if (shape.type === 'resource') {
    return (node.termType === 'NamedNode' || node.termType === 'BlankNode')
      && (!shape.value || Rdf.equalTerms(shape.value, node));
  } else {
    return node.termType === 'Literal'
      && (!shape.datatype || shape.datatype.value === node.datatype.value)
      && (!shape.language || shape.language === node.language)
      && (!shape.value || Rdf.equalTerms(shape.value, node));
  }
}

export interface ResolvedListShape {
  head: PathSequence;
  tail: PathSequence;
  nil: Rdf.NamedNode;
}

export function makeListShapeDefaults(factory: Rdf.DataFactory): ResolvedListShape {
  return {
    head: [{predicate: factory.namedNode(rdf.first)}],
    tail: [{predicate: factory.namedNode(rdf.rest)}],
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
