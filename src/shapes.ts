import * as Rdf from './rdf';

export type ShapeID = Rdf.NamedNode | Rdf.BlankNode;
export type Shape =
  | ObjectShape
  | UnionShape
  | SetShape
  | OptionalShape
  | ResourceShape
  | LiteralShape
  | ListShape
  | MapShape;

export interface ObjectShape {
  readonly type: 'object';
  readonly id: ShapeID;
  readonly typeProperties: ReadonlyArray<ObjectProperty>;
  readonly properties: ReadonlyArray<ObjectProperty>;
}

export interface ObjectProperty {
  readonly name: string;
  readonly path: ReadonlyArray<PropertyPathSegment>;
  readonly valueShape: ShapeID;
}

export interface PropertyPathSegment {
  readonly predicate: Rdf.NamedNode;
  readonly reverse?: boolean;
}

export interface UnionShape {
  readonly type: 'union';
  readonly id: ShapeID;
  readonly variants: ReadonlyArray<ShapeID>;
}

export interface SetShape {
  readonly type: 'set';
  readonly id: ShapeID;
  readonly itemShape: ShapeID;
}

export interface OptionalShape {
  readonly type: 'optional';
  readonly id: ShapeID;
  readonly itemShape: ShapeID;
  readonly emptyValue?: null | undefined;
}

export interface ResourceShape {
  readonly type: 'resource';
  readonly id: ShapeID;
  readonly value?: Rdf.NamedNode | Rdf.BlankNode;
  readonly keepAsTerm?: boolean;
  readonly vocabulary?: Vocabulary;
}

export interface LiteralShape {
  readonly type: 'literal';
  readonly id: ShapeID;
  readonly datatype?: Rdf.NamedNode;
  readonly language?: string;
  readonly value?: Rdf.Literal;
  readonly keepAsTerm?: boolean;
}

export interface ListShape {
  readonly type: 'list';
  readonly id: ShapeID;
  readonly itemShape: ShapeID;
  /** @default [{predicate: (rdf:first)}] */
  readonly headPath?: ReadonlyArray<PropertyPathSegment>;
  /** @default [{predicate: (rdf:rest)}] */
  readonly tailPath?: ReadonlyArray<PropertyPathSegment>;
  /** @default rdf:nil */
  readonly nil?: Rdf.NamedNode;
}

export interface MapShape {
  readonly type: 'map';
  readonly id: ShapeID;
  readonly key: ShapeReference;
  readonly value?: ShapeReference;
  readonly itemShape: ShapeID;
}

export interface ShapeReference {
  readonly target: ShapeID;
  readonly part?: 'value' | 'datatype' | 'language';
}

export interface Vocabulary {
  terms: { [literal: string]: Rdf.NamedNode };
}
