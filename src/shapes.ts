import * as Rdf from './rdf-model';

export type Shape = ObjectShape | UnionShape | SetShape | OptionalShape | NodeShape;
export type ShapeID = Rdf.Iri | Rdf.Blank;

export interface ObjectShape {
  readonly type: 'object';
  readonly id: ShapeID;
  readonly typeFields: ReadonlyArray<ObjectField>;
  readonly otherFields: ReadonlyArray<ObjectField>;
}

export interface ObjectField {
  readonly type: 'field';
  readonly fieldName: string;
  readonly predicate: Rdf.Iri;
  readonly direction: 'to-subject' | 'to-object';
  readonly valueShape: ShapeID;
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
