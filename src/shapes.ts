import * as Rdf from './rdf';

export type ShapeID = Rdf.NamedNode | Rdf.BlankNode;
export type Shape =
  | ResourceShape
  | LiteralShape
  | ObjectShape
  | UnionShape
  | SetShape
  | OptionalShape
  | ListShape
  | MapShape;

export interface ShapeBase {
  readonly id: ShapeID;
  readonly lenient?: boolean;
}

export interface ResourceShape extends ShapeBase {
  readonly type: 'resource';
  readonly value?: Rdf.NamedNode | Rdf.BlankNode;
  readonly keepAsTerm?: boolean;
  readonly vocabulary?: Vocabulary;
}

export interface LiteralShape extends ShapeBase {
  readonly type: 'literal';
  readonly id: ShapeID;
  readonly datatype?: Rdf.NamedNode;
  readonly language?: string;
  readonly value?: Rdf.Literal;
  readonly keepAsTerm?: boolean;
}

export interface ObjectShape extends ShapeBase {
  readonly type: 'object';
  readonly id: ShapeID;
  readonly typeProperties: ReadonlyArray<ObjectProperty>;
  readonly properties: ReadonlyArray<ObjectProperty>;
}

export interface ObjectProperty {
  readonly name: string;
  readonly path: PathSequence;
  readonly valueShape: Shape;
}

export type PathSequence = ReadonlyArray<PathElement>;
export type PathElement = PathExpression | PathSegment;
export interface PathExpression {
  operator: '|' | '^' | '*' | '+' | '?' | '!';
  path: PathSequence;
}
export interface PathSegment {
  predicate: Rdf.NamedNode;
}

export interface UnionShape extends ShapeBase {
  readonly type: 'union';
  readonly id: ShapeID;
  readonly variants: ReadonlyArray<Shape>;
}

export interface SetShape extends ShapeBase {
  readonly type: 'set';
  readonly id: ShapeID;
  readonly itemShape: Shape;
}

export interface OptionalShape extends ShapeBase {
  readonly type: 'optional';
  readonly id: ShapeID;
  readonly itemShape: Shape;
  readonly strict?: boolean;
  readonly emptyValue?: null | undefined;
}

export interface ListShape extends ShapeBase {
  readonly type: 'list';
  readonly id: ShapeID;
  readonly itemShape: Shape;
  /** @default [{predicate: (rdf:first)}] */
  readonly headPath?: PathSequence;
  /** @default [{predicate: (rdf:rest)}] */
  readonly tailPath?: PathSequence;
  /** @default rdf:nil */
  readonly nil?: Rdf.NamedNode;
}

export interface MapShape extends ShapeBase {
  readonly type: 'map';
  readonly id: ShapeID;
  readonly key: ShapeReference;
  readonly value?: ShapeReference;
  readonly itemShape: Shape;
}

export interface ShapeReference {
  readonly target: Shape;
  readonly part?: 'value' | 'datatype' | 'language';
}

export interface Vocabulary {
  terms: { [literal: string]: Rdf.NamedNode };
}

export function isPathSegment(element: PathElement): element is PathSegment {
  return Boolean((element as { predicate?: Rdf.NamedNode }).predicate);
}
