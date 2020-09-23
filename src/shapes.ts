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
  readonly onlyNamed?: boolean;
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
  readonly path: PropertyPath;
  readonly valueShape: Shape;
  readonly transient?: boolean;
}

export type PropertyPath =
  | PredicatePath
  | SequencePath
  | InversePath
  | AlternativePath
  | ZeroOrMorePath
  | ZeroOrOnePath
  | OneOrMorePath;

export interface PredicatePath {
  readonly type: 'predicate';
  readonly predicate: Rdf.NamedNode;
}
export interface SequencePath {
  readonly type: 'sequence';
  readonly sequence: ReadonlyArray<PropertyPath>;
}
export interface InversePath {
  readonly type: 'inverse';
  readonly inverse: PropertyPath;
}
export interface AlternativePath {
  readonly type: 'alternative';
  readonly alternatives: ReadonlyArray<PropertyPath>;
}
export interface ZeroOrMorePath {
  readonly type: 'zeroOrMore';
  readonly zeroOrMore: PropertyPath;
}
export interface ZeroOrOnePath {
  readonly type: 'zeroOrOne';
  readonly zeroOrOne: PropertyPath;
}
export interface OneOrMorePath {
  readonly type: 'oneOrMore';
  readonly oneOrMore: PropertyPath;
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
  readonly minCount?: number;
  readonly maxCount?: number;
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
  /** @default rdf:first */
  readonly headPath?: PropertyPath;
  /** @default rdf:rest */
  readonly tailPath?: PropertyPath;
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
  readonly id?: Rdf.NamedNode | Rdf.BlankNode;
  readonly terms: { [literal: string]: Rdf.NamedNode };
}

export function getNestedPropertyPath(path: ZeroOrMorePath | ZeroOrOnePath | OneOrMorePath): PropertyPath {
  switch (path.type) {
    case 'zeroOrMore': return path.zeroOrMore;
    case 'zeroOrOne': return path.zeroOrOne;
    case 'oneOrMore': return path.oneOrMore;
    default:
      throw new Error(`"${(path as PropertyPath).type}" nested path cannot be undefined`);
  }
}
