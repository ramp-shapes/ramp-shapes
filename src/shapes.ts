import * as Rdf from './rdf-model';

export type Shape = ObjectShape | UnionShape | SetShape | OptionalShape | NodeShape;
export type ShapeID = Rdf.Iri | Rdf.Blank;

export interface ObjectShape {
  readonly type: 'object';
  readonly id: ShapeID;
  readonly typeProperties: ReadonlyArray<ObjectProperty>;
  readonly properties: ReadonlyArray<ObjectProperty>;
}

export interface ObjectProperty {
  readonly type: 'property';
  readonly name: string;
  readonly path: ReadonlyArray<PropertyPathSegment>;
  readonly valueShape: ShapeID;
}

export interface PropertyPathSegment {
  readonly predicate: Rdf.Iri;
  readonly reverse: boolean;
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
  readonly valueShape: ShapeID;
  readonly emptyValue: null | undefined;
}

export interface NodeShape {
  readonly type: 'node';
  readonly id: ShapeID;
  readonly value: Rdf.Node | undefined;
}
