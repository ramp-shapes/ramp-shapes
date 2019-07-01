import { HashMap, HashSet } from './hash-map';
import * as Rdf from './rdf';
import {
  ListShape, LiteralShape, PathSequence, ResourceShape, Shape, ShapeID
} from './shapes';
import { rdf } from './vocabulary';

export function makeTermSet() {
  return new HashSet<Rdf.Term>(Rdf.hashTerm, Rdf.equalTerms);
}

export function makeTermMap<V>() {
  return new HashMap<Rdf.Term, V>(Rdf.hashTerm, Rdf.equalTerms);
}

export function makeShapeResolver(
  shapes: ReadonlyArray<Shape>,
  onFailed: (shapeID: ShapeID) => never
): (shapeID: ShapeID) => Shape {
  const contextShapes = makeTermMap<Shape>();
  for (const shape of shapes) {
    contextShapes.set(shape.id, shape);
  }
  return shapeID => {
    const shape = contextShapes.get(shapeID);
    if (!shape) {
      return onFailed(shapeID);
    }
    return shape;
  };
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

const DEFAULT_LIST_HEAD: PathSequence = [{predicate: rdf.first}];
const DEFAULT_LIST_TAIL: PathSequence = [{predicate: rdf.rest}];

export interface ResolvedListShape {
  head: PathSequence;
  tail: PathSequence;
  nil: Rdf.NamedNode;
}

export function resolveListShapeDefaults(shape: ListShape): ResolvedListShape {
  return {
    head: shape.headPath || DEFAULT_LIST_HEAD,
    tail: shape.tailPath || DEFAULT_LIST_TAIL,
    nil: shape.nil || rdf.nil,
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
