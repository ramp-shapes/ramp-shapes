import type { DataFactory, BlankNode, Literal, NamedNode } from '@rdfjs/types';
import { HashMap, ReadonlyHashMap } from '@reactodia/hashmap';

import {
  DefaultDataFactory, type RawTerm, hashTerm, equalTerms, looksLikeTerm, randomString,
} from './rdf/rdf-model.js';
import {
  FieldProperty, TransientProperty, ComputedProperty, PropertyPath, Shape, ShapeID,
  ShapeReference, Vocabulary, TypedShape, TypedShapeID, TypedVocabulary, ValueMapper,
} from './shapes.js';
import { mapAsString, mapAsTerm, mapVocabulary } from './mappers.js';

export interface ShapeBuilderOptions {
  factory?: DataFactory;
  blankUniqueKey?: string;
}

interface ShapeBaseProps<In, Out> {
  id?: ShapeID;
  lenient?: boolean;
  mapper?: ValueMapper<In, Out>;
}

interface RecordShapeProps<Props, R>
  extends ShapeBaseProps<NullableAsOptional<Props>, R>
{
  properties: {
    [Name in keyof Props]: PartialProperty<Props[Name]>;
  };
  transients?: PartialGraphProperty<any>[];
}

type PartialProperty<T> = PartialGraphProperty<T> | PartialComputedProperty<T>;

interface PartialGraphProperty<T> {
  kind: 'graph';
  definesType?: boolean;
  path: PropertyPath;
  valueShape: TypedShapeID<T>;
}

interface PartialComputedProperty<T> {
  kind: 'computed';
  valueShape: TypedShapeID<T>;
}

interface OptionalShapeProps<
  T,
  Empty extends 'undefined' | 'null',
  R
> extends ShapeBaseProps<T | Empty, R> {
  emptyValue?: Empty;
}

interface ResourceShapeProps<R> extends ShapeBaseProps<RawTerm<NamedNode | BlankNode>, R> {
  onlyNamed?: boolean;
  vocabulary?: Vocabulary;
}

interface LiteralShapeProps<R> extends ShapeBaseProps<RawTerm<Literal>, R> {
  datatype?: NamedNode;
  language?: string;
}

interface LiteralShapeWithDatatypeProps<R> extends ShapeBaseProps<RawTerm<Literal>, R> {
  datatype: NamedNode;
}

interface LiteralShapeWithLanguageProps<R> extends ShapeBaseProps<RawTerm<Literal>, R> {
  language: string;
}

interface SetShapeProps<Item, R> extends ShapeBaseProps<Item[], R> {
  minCount?: number;
  maxCount?: number;
}

interface MapShapeProps<Item, R> extends ShapeBaseProps<{ [key: string]: Item }, R> {
  key: TypedShapeID<string> | PartialShapeReference<any>;
  value: PartialShapeReference<Item>;
  itemShape?: ShapeID;
}

interface PartialShapeReference<T> {
  target: TypedShapeID<T>;
  part?: ShapeReference['part'];
}

type UnpackShapeID<T> = T extends TypedShapeID<infer V> ? V : never;

type NullableKeys<T> =
  | { [K in keyof T]: undefined extends T[K] ? K : never }[keyof T]
  | { [K in keyof T]: null extends T[K] ? K : never }[keyof T];

type NullableAsOptional<T> = Omit<T, NullableKeys<T>> & Partial<Pick<T, NullableKeys<T>>>;

export class ShapeBuilder {
  private readonly _shapes = new HashMap<ShapeID, Shape>(hashTerm, equalTerms);

  private readonly factory: DataFactory;
  private readonly blankUniqueKey: string | undefined;
  private blankSequence = 1;

  constructor(options: ShapeBuilderOptions = {}) {
    const {
      factory = DefaultDataFactory,
      blankUniqueKey = randomString('', 24),
    } = options;
    this.factory = factory;
    this.blankUniqueKey = blankUniqueKey;
  }

  get shapes(): ReadonlyHashMap<ShapeID, Shape> {
    return this._shapes;
  }

  getShape<T>(id: TypedShapeID<T>): TypedShape<T> | undefined {
    return this._shapes.get(id) as TypedShape<any> | undefined;
  }

  addAll(shapes: Iterable<Shape>) {
    for (const shape of shapes) {
      this._shapes.set(shape.id, shape);
    }
  }

  record<
    Props,
    R = NullableAsOptional<Props>
  >(
    props: RecordShapeProps<Props, R>
  ): TypedShapeID<R> {
    const {id = this.makeShapeID('record'), properties, transients = []} = props;
    const {_shapes} = this;

    const typeProperties: Array<FieldProperty | TransientProperty> = [];
    const normalProperties: Array<FieldProperty | TransientProperty> = [];
    const computedProperties: ComputedProperty[] = [];

    for (const propertyName of Object.keys(properties)) {
      const partial = (properties as { [name: string]: PartialProperty<any> })[propertyName];
      if (partial.kind === 'computed') {
        computedProperties.push({
          kind: 'computed',
          name: propertyName,
          get valueShape() {
            return _shapes.get(partial.valueShape)!;
          }
        });
      } else {
        const property: FieldProperty = {
          kind: 'field',
          name: propertyName,
          path: partial.path,
          get valueShape() {
            return _shapes.get(partial.valueShape)!;
          }
        };
        if (partial.definesType) {
          typeProperties.push(property);
        } else {
          normalProperties.push(property);
        }
      }
    }

    for (const transient of transients) {
      const property: TransientProperty = {
        kind: 'transient',
        path: transient.path,
        get valueShape() {
          return _shapes.get(transient.valueShape)!;
        }
      };
      if (transient.definesType) {
        typeProperties.push(property);
      } else {
        normalProperties.push(property);
      }
    }

    this._shapes.set(id, {
      type: 'record',
      id,
      typeProperties,
      properties: normalProperties,
      computedProperties,
    });
    return id as TypedShapeID<any>;
  }

  readonlyRecord<
    Props,
    R = Readonly<NullableAsOptional<Props>>
  >(
    props: RecordShapeProps<Props, R>
  ): TypedShapeID<R> {
    return this.record(props);
  }

  anyOf<
    Variants extends [...TypedShapeID<any>[]],
    R = UnpackShapeID<Variants[keyof Variants]>
  >(
    variants: Variants,
    props: ShapeBaseProps<UnpackShapeID<Variants[keyof Variants]>, R> = {}
  ): TypedShapeID<R> {
    const {id = this.makeShapeID('anyOf'), lenient} = props;
    const {_shapes} = this;
    this._shapes.set(id, {
      type: 'anyOf',
      id,
      lenient,
      get variants() {
        return variants.map(variant => _shapes.get(variant)!);
      }
    });
    return id as TypedShapeID<any>;
  }

  set<Item, R = Item[]>(
    itemShape: TypedShapeID<Item>,
    props: SetShapeProps<Item, R> = {}
  ): TypedShapeID<R> {
    const {id = this.makeShapeID('set'), lenient, minCount, maxCount} = props;
    const {_shapes} = this;
    this._shapes.set(id, {
      type: 'set',
      id,
      lenient,
      minCount,
      maxCount,
      get itemShape() {
        return _shapes.get(itemShape)!;
      }
    });
    return id as TypedShapeID<any>;
  }

  readonlySet<Item, R = readonly Item[]>(
    itemShape: TypedShapeID<Item>,
    props: SetShapeProps<Item, R> = {}
  ): TypedShapeID<R> {
    return this.set(itemShape, props);
  }

  optional<
    T,
    Empty extends 'undefined' | 'null' = 'undefined',
    R = T | (Empty extends 'null' ? null : undefined)
  >(
    itemShape: TypedShapeID<T>,
    props: OptionalShapeProps<T, Empty, R> = {}
  ): TypedShapeID<R> {
    const {id = this.makeShapeID('optional'), lenient, emptyValue} = props;
    const {_shapes} = this;
    this._shapes.set(id, {
      type: 'optional',
      id,
      lenient,
      emptyValue: emptyValue === 'null' ? null : undefined,
      get itemShape() {
        return _shapes.get(itemShape)!;
      }
    });
    return id as TypedShapeID<any>;
  }

  constant<T extends NamedNode<any> | BlankNode | Literal, R = T>(
    value: T,
    props: ShapeBaseProps<RawTerm<T>, R> = {}
  ): TypedShapeID<R> {
    return this.constantShape(value, props) as TypedShapeID<any>;
  }

  fromVocabulary<Vocab extends Vocabulary['terms'], K extends keyof Vocab, R = K>(
    value: K,
    vocabulary: TypedVocabulary<Vocab>,
    props: ShapeBaseProps<K, R> = {}
  ): TypedShapeID<R> {
    if (!Object.prototype.hasOwnProperty.call(vocabulary.terms, value)) {
      throw new Error(`Vocabulary does not contain key: ${value as string}`);
    }
    const node = vocabulary.terms[value];
    return this.constantShape(node, {
      ...props,
      vocabulary,
    }) as TypedShapeID<any>;
  }

  private constantShape(
    value: NamedNode | BlankNode | Literal,
    props: ShapeBaseProps<unknown, unknown> & {
      vocabulary?: Vocabulary;
      keepAsTerm?: boolean;
    }
  ): ShapeID {
    const {lenient, vocabulary, mapper} = props;
    let shape: Shape;
    switch (value.termType) {
      case 'NamedNode':
      case 'BlankNode': {
        const {id = this.makeShapeID('resource')} = props;
        shape = {type: 'resource', id, lenient, value, vocabulary, mapper};
        break;
      }
      case 'Literal': {
        const {id = this.makeShapeID('literal')} = props;
        shape = {type: 'literal', id, lenient, value, mapper};
        break;
      }
      default: {
        throw new Error(
          'Unexpected term type for constant shape: ' +
          (value as NamedNode).termType
        );
      }
    }
    this._shapes.set(shape.id, shape);
    return shape.id as TypedShapeID<any>;
  }

  resource<R = string>(props: ResourceShapeProps<R> = {}): TypedShapeID<string> {
    const {id = this.makeShapeID('resource'), lenient, onlyNamed, vocabulary} = props;
    this._shapes.set(id, {type: 'resource', id, lenient, onlyNamed, vocabulary});
    return id as TypedShapeID<any>;
  }

  resourceTerm(
    props: ShapeBaseProps<RawTerm<NamedNode | BlankNode>, NamedNode | BlankNode> = {}
  ): TypedShapeID<NamedNode | BlankNode> {
    const {id = this.makeShapeID('resource'), lenient} = props;
    this._shapes.set(id, {
      type: 'resource',
      id,
      lenient,
      mapper: props.mapper ?? mapAsTerm(this.factory),
    });
    return id as TypedShapeID<any>;
  }

  namedNodeTerm(
    props: ShapeBaseProps<RawTerm<NamedNode>, NamedNode> = {}
  ): TypedShapeID<NamedNode> {
    const {id = this.makeShapeID('resource'), lenient} = props;
    this._shapes.set(id, {
      type: 'resource',
      id,
      lenient,
      onlyNamed: true,
      mapper: props.mapper ?? mapAsTerm(this.factory),
    });
    return id as TypedShapeID<any>;
  }

  literal<R = string>(
    props: LiteralShapeWithDatatypeProps<R> | LiteralShapeWithLanguageProps<R>
  ): TypedShapeID<R> {
    const {
      id = this.makeShapeID('literal'), datatype, language, lenient,
    } = props as LiteralShapeProps<R>;
    this._shapes.set(id, {
      type: 'literal',
      id,
      datatype,
      language,
      lenient,
      mapper: props.mapper ?? mapAsString(this.factory),
    });
    return id as TypedShapeID<any>;
  }

  literalTerm(
    props: LiteralShapeProps<Literal> = {}
  ): TypedShapeID<Literal> {
    const {id = this.makeShapeID('literal'), datatype, language, lenient} = props;
    this._shapes.set(id, {
      type: 'literal',
      id,
      datatype,
      language,
      lenient,
      mapper: props.mapper ?? mapAsTerm(this.factory),
    });
    return id as TypedShapeID<any>;
  }

  list<Item, R = Item[]>(
    itemShape: TypedShapeID<Item>,
    props: ShapeBaseProps<Item[], R> = {}
  ): TypedShapeID<R> {
    const {id = this.makeShapeID('list'), lenient} = props;
    const {_shapes} = this;
    this._shapes.set(id, {
      type: 'list',
      id,
      lenient,
      get itemShape() {
        return _shapes.get(itemShape)!;
      }
    });
    return id as TypedShapeID<any>;
  }

  readonlyList<Item, R = readonly Item[]>(
    itemShape: TypedShapeID<Item>,
    props: ShapeBaseProps<Item[], R> = {}
  ): TypedShapeID<R> {
    return this.list(itemShape, props);
  }

  map<Item, R = { [key: string]: Item }>(
    props: MapShapeProps<Item, R>
  ): TypedShapeID<R> {
    const {
      id = this.makeShapeID('map'),
      lenient,
      key,
      value,
      itemShape = value.target,
    } = props;
    const {_shapes} = this;
    const keyRef: PartialShapeReference<any> = looksLikeTerm(key) ? {target: key} : key;
    this._shapes.set(id, {
      type: 'map',
      id,
      lenient,
      key: {
        part: keyRef.part,
        get target() { return _shapes.get(keyRef.target)!; }
      },
      value: {
        part: value.part,
        get target() { return _shapes.get(value.target)!; }
      },
      get itemShape() { return _shapes.get(itemShape)!; }
    });
    return id as TypedShapeID<any>;
  }

  readonlyMap<Item, R = { readonly [key: string]: Item }>(
    props: MapShapeProps<Item, R>
  ): TypedShapeID<R> {
    return this.map(props);
  }

  vocabulary<T extends Vocabulary['terms']>(
    vocabulary: TypedVocabulary<T>
  ): TypedVocabulary<T> {
    return vocabulary;
  }

  makeShapeID(prefix: string): BlankNode {
    const index = this.blankSequence++;
    return this.factory.blankNode(`${prefix}_${this.blankUniqueKey}_${index}`);
  }
}

export function self<T>(valueShape: TypedShapeID<T>): PartialGraphProperty<T> {
  return {kind: 'graph', path: {type: 'sequence', sequence: []}, valueShape};
}

export function property<T>(
  predicate: NamedNode,
  valueShape: TypedShapeID<T>
): PartialGraphProperty<T> {
  return {kind: 'graph', path: {type: 'predicate', predicate}, valueShape};
}

export function inverseProperty<T>(
  predicate: NamedNode,
  valueShape: TypedShapeID<T>
): PartialGraphProperty<T> {
  return {
    kind: 'graph',
    path: {
      type: 'inverse',
      inverse: {type: 'predicate', predicate}
    },
    valueShape,
  };
}

export function propertyPath<T>(
  path: PropertyPath,
  valueShape: TypedShapeID<T>
): PartialGraphProperty<T> {
  return {kind: 'graph', path, valueShape};
}

export function definesType<T>(property: PartialGraphProperty<T>): PartialGraphProperty<T> {
  return {...property, definesType: true};
}

export function computedProperty<T>(valueShape: TypedShapeID<T>): PartialComputedProperty<T> {
  return {
    kind: 'computed',
    valueShape,
  };
}
