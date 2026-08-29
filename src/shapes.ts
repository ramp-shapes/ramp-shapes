import type { BlankNode, Literal, NamedNode } from '@rdfjs/types';

export type ShapeID = NamedNode | BlankNode;
export type Shape =
  | ResourceShape
  | LiteralShape
  | RecordShape
  | AnyOfShape
  | SetShape
  | OptionalShape
  | ListShape
  | MapShape;

export type TypedShapeID<T> = ShapeID & { readonly __type: T };
export type TypedShape<T> = Shape & { readonly __type: T };

export type UnwrapShape<T> =
  T extends TypedShapeID<infer V> ? V :
  T extends TypedShape<infer V> ? V :
  never;

export interface ShapeBase {
  readonly id: ShapeID;
  readonly lenient?: boolean;
  readonly mapper?: ValueMapper<unknown, unknown>;
}

export interface ValueMapper<In, Out> {
  readonly type?: NamedNode | BlankNode;
  map(value: In, shape: Shape): Match<Out> | undefined;
  unmap(value: Out, shape: Shape): Match<In> | undefined;
}

export interface NamedMapper<In, Out>
  extends Omit<ValueMapper<In, Out>, 'type'>
{
  readonly type: NamedNode | BlankNode;
}

export class Match<T> {
  private declare readonly _brand: 'match';

  constructor(
    readonly value: T
  ) {}
}

export class ValueHole {
  private _resolvers: Array<(mapped: unknown) => void> = [];

  constructor(
    readonly value: unknown,
    readonly shape: Shape
  ) {}

  addResolver(resolver: (mapped: unknown) => void): void {
    this._resolvers.push(resolver);
  }

  resolve(mapped: unknown): void {
    for (const resolver of this._resolvers) {
      resolver(mapped);
    }
  }
}

export interface ResourceShape extends ShapeBase {
  readonly type: 'resource';
  readonly onlyNamed?: boolean;
  readonly value?: NamedNode | BlankNode;
  readonly vocabulary?: Vocabulary;
}

export interface LiteralShape extends ShapeBase {
  readonly type: 'literal';
  readonly id: ShapeID;
  readonly datatype?: NamedNode;
  readonly language?: string;
  readonly value?: Literal;
}

export interface RecordShape extends ShapeBase {
  readonly type: 'record';
  readonly id: ShapeID;
  readonly typeProperties: ReadonlyArray<FieldProperty | TransientProperty>;
  readonly properties: ReadonlyArray<FieldProperty | TransientProperty>;
  readonly computedProperties: ReadonlyArray<ComputedProperty>;
}

export type RecordProperty = FieldProperty | TransientProperty | ComputedProperty;

export interface FieldProperty {
  readonly kind: 'field';
  readonly name: string;
  readonly path: PropertyPath;
  readonly valueShape: Shape;
}

export interface TransientProperty {
  readonly kind: 'transient';
  readonly path: PropertyPath;
  readonly valueShape: Shape;
}

export interface ComputedProperty {
  readonly kind: 'computed';
  readonly name: string;
  readonly valueShape: Shape;
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
  readonly predicate: NamedNode;
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

export interface AnyOfShape extends ShapeBase {
  readonly type: 'anyOf';
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
  readonly nil?: NamedNode;
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
  readonly id?: NamedNode | BlankNode;
  readonly terms: VocabularyTerms;
}

export interface TypedVocabulary<T extends VocabularyTerms> {
  readonly id?: Vocabulary['id'];
  readonly terms: T;
}

interface VocabularyTerms {
  readonly [literal: string]: NamedNode;
}

export function typedShape<T>(id: Shape): TypedShape<T> {
  return id as TypedShape<T>;
}

export function typedShapeID<T>(id: ShapeID): TypedShapeID<T> {
  return id as TypedShapeID<T>;
}

export function typedVocabulary<T extends VocabularyTerms>(v: Vocabulary): TypedVocabulary<T> {
  return v as TypedVocabulary<T>;
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
