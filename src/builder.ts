import { HashMap, ReadonlyHashMap } from './hash-map';
import * as Rdf from './rdf';
import {
  RecordProperty, ComputedProperty, PropertyPath, Shape, ShapeID, ShapeReference, Vocabulary,
  TypedShape, TypedShapeID, TypedVocabulary,
} from './shapes';

export interface ShapeBuilderOptions {
  factory?: Rdf.DataFactory;
  blankUniqueKey?: string;
}

interface ShapeBaseProps {
  id?: ShapeID;
  lenient?: boolean;
}

interface RecordShapeProps<Props extends object> extends ShapeBaseProps {
  properties: {
    [Name in keyof Props]: PartialProperty<Props[Name]>;
  };
}

interface PartialProperty<T> {
  path: PropertyPath;
  valueShape: TypedShapeID<T>;
  kind?: 'type' | 'computed';
  transient?: boolean;
}

interface OptionalShapeProps<
  Empty extends 'undefined' | 'null' = 'undefined'
> extends ShapeBaseProps {
  emptyValue?: Empty;
}

interface ResourceShapeProps extends ShapeBaseProps {
  onlyNamed?: boolean;
  vocabulary?: Vocabulary;
}

interface LiteralShapeProps extends ShapeBaseProps {
  datatype?: Rdf.NamedNode;
  language?: string;
}

interface LiteralShapeWithDatatypeProps extends ShapeBaseProps {
  datatype: Rdf.NamedNode;
}

interface LiteralShapeWithLanguageProps extends ShapeBaseProps {
  language: string;
}

interface SetShapeProps extends ShapeBaseProps {
  minCount?: number;
  maxCount?: number;
}

interface MapShapeProps<T> extends ShapeBaseProps {
  key: TypedShapeID<string> | PartialShapeReference<any>;
  value: PartialShapeReference<T>;
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
  private readonly _shapes = new HashMap<ShapeID, Shape>(Rdf.hashTerm, Rdf.equalTerms);

  private readonly factory: Rdf.DataFactory;
  private readonly blankUniqueKey: string | undefined;
  private blankSequence = 1;

  constructor(options: ShapeBuilderOptions = {}) {
    const {
      factory = Rdf.DefaultDataFactory,
      blankUniqueKey = Rdf.randomString('', 24),
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

  record<Props extends object = object>(
    props: RecordShapeProps<Props>
  ): TypedShapeID<NullableAsOptional<Props>> {
    const {id = this.makeShapeID('record'), properties} = props;
    const {_shapes} = this;

    function makeProperty(name: string, partial: PartialProperty<any>): RecordProperty {
      const {path, valueShape, transient} = partial;
      return {
        name,
        path,
        transient,
        get valueShape() {
          return _shapes.get(valueShape)!;
        }
      };
    }

    function makeComputedProperty(name: string, partial: PartialProperty<any>): ComputedProperty {
      return {
        name,
        get valueShape() {
          return _shapes.get(partial.valueShape)!;
        }
      };
    }

    const typeProperties: RecordProperty[] = [];
    const normalProperties: RecordProperty[] = [];
    const computedProperties: ComputedProperty[] = [];

    for (const propertyName of Object.keys(properties)) {
      const partial = (properties as { [name: string]: PartialProperty<any> })[propertyName];
      if (partial.kind === 'computed') {
        computedProperties.push(makeComputedProperty(propertyName, partial));
      } else {
        const property = makeProperty(propertyName, partial);
        if (partial.kind === 'type') {
          typeProperties.push(property);
        } else {
          normalProperties.push(property);
        }
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

  readonlyRecord<Props extends object>(
    props: RecordShapeProps<Props>
  ): TypedShapeID<Readonly<NullableAsOptional<Props>>> {
    return this.record(props);
  }

  anyOf<Variants extends [...TypedShapeID<any>[]]>(
    variants: Variants,
    props: ShapeBaseProps = {}
  ): TypedShapeID<UnpackShapeID<Variants[keyof Variants]>> {
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

  set<T>(itemShape: TypedShapeID<T>, props: SetShapeProps = {}): TypedShapeID<T[]> {
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

  readonlySet<T>(
    itemShape: TypedShapeID<T>,
    props: SetShapeProps = {}
  ): TypedShapeID<ReadonlyArray<T>> {
    return this.set(itemShape, props);
  }

  optional<T, Empty extends 'undefined' | 'null' = 'undefined'>(
    itemShape: TypedShapeID<T>,
    props: OptionalShapeProps<Empty> = {}
  ): TypedShapeID<T | (Empty extends 'null' ? null : undefined)> {
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

  constant<T extends string>(
    value: Rdf.NamedNode<T> | Rdf.BlankNode | Rdf.Literal,
    props: ShapeBaseProps = {}
  ): TypedShapeID<T> {
    return this.constantShape(value, props) as TypedShapeID<any>;
  }

  fromVocabulary<Vocab extends Vocabulary['terms'], K extends keyof Vocab>(
    value: K,
    vocabulary: TypedVocabulary<Vocab>,
    props: ShapeBaseProps = {}
  ): TypedShapeID<K> {
    if (!Object.prototype.hasOwnProperty.call(vocabulary.terms, value)) {
      throw new Error(`Vocabulary does not contain key: ${value as string}`);
    }
    const node = vocabulary.terms[value];
    return this.constantShape(node, {...props, vocabulary}) as TypedShapeID<any>;
  }

  constantTerm<Term extends Rdf.NamedNode | Rdf.BlankNode | Rdf.Literal>(
    value: Term,
    props: ShapeBaseProps = {}
  ): TypedShapeID<Term> {
    return this.constantShape(value, {...props, keepAsTerm: true}) as TypedShapeID<any>;
  }

  private constantShape(
    value: Rdf.NamedNode | Rdf.BlankNode | Rdf.Literal,
    props: ShapeBaseProps & {
      vocabulary?: Vocabulary;
      keepAsTerm?: boolean;
    }
  ): ShapeID {
    const {lenient, vocabulary, keepAsTerm} = props;
    let shape: Shape;
    switch (value.termType) {
      case 'NamedNode':
      case 'BlankNode': {
        const {id = this.makeShapeID('resource')} = props;
        shape = {type: 'resource', id, lenient, value, vocabulary, keepAsTerm};
        break;
      }
      case 'Literal': {
        const {id = this.makeShapeID('literal')} = props;
        shape = {type: 'literal', id, lenient, value, keepAsTerm};
        break;
      }
      default: {
        throw new Error(
          'Unexpected term type for constant shape: ' +
          (value as Rdf.NamedNode).termType
        );
      }
    }
    this._shapes.set(shape.id, shape);
    return shape.id as TypedShapeID<any>;
  }

  resource(props: ResourceShapeProps = {}): TypedShapeID<string> {
    const {id = this.makeShapeID('resource'), lenient, onlyNamed, vocabulary} = props;
    this._shapes.set(id, {type: 'resource', id, lenient, onlyNamed, vocabulary});
    return id as TypedShapeID<any>;
  }

  resourceTerm(props: ShapeBaseProps = {}): TypedShapeID<Rdf.NamedNode | Rdf.BlankNode> {
    const {id = this.makeShapeID('resource'), lenient} = props;
    this._shapes.set(id, {type: 'resource', id, lenient, keepAsTerm: true});
    return id as TypedShapeID<any>;
  }

  namedNodeTerm(props: ShapeBaseProps = {}): TypedShapeID<Rdf.NamedNode> {
    const {id = this.makeShapeID('resource'), lenient} = props;
    this._shapes.set(id, {type: 'resource', id, lenient, onlyNamed: true, keepAsTerm: true});
    return id as TypedShapeID<any>;
  }

  literal<T = string>(
    props: LiteralShapeWithDatatypeProps | LiteralShapeWithLanguageProps
  ): TypedShapeID<T> {
    const {id = this.makeShapeID('literal'), datatype, language, lenient} = props as LiteralShapeProps;
    this._shapes.set(id, {type: 'literal', id, datatype, language, lenient});
    return id as TypedShapeID<any>;
  }

  literalTerm(props: LiteralShapeProps = {}): TypedShapeID<Rdf.Literal> {
    const {id = this.makeShapeID('literal'), datatype, language, lenient} = props as LiteralShapeProps;
    this._shapes.set(id, {type: 'literal', id, datatype, language, lenient, keepAsTerm: true});
    return id as TypedShapeID<any>;
  }

  list<T>(itemShape: TypedShapeID<T>, props: ShapeBaseProps = {}): TypedShapeID<T[]> {
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

  readonlyList<T>(
    itemShape: TypedShapeID<T>,
    props: ShapeBaseProps = {}
  ): TypedShapeID<ReadonlyArray<T>> {
    return this.list(itemShape, props);
  }

  map<T>(props: MapShapeProps<T>): TypedShapeID<{ [key: string]: T }> {
    const {
      id = this.makeShapeID('map'),
      lenient,
      key,
      value,
      itemShape = value.target,
    } = props;
    const {_shapes} = this;
    const keyRef: PartialShapeReference<any> = Rdf.looksLikeTerm(key) ? {target: key} : key;
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

  readonlyMap<T>(props: MapShapeProps<T>): TypedShapeID<{ readonly [key: string]: T }> {
    return this.map(props);
  }

  vocabulary<T extends Vocabulary['terms']>(
    vocabulary: TypedVocabulary<T>
  ): TypedVocabulary<T> {
    return vocabulary;
  }

  makeShapeID(prefix: string): Rdf.BlankNode {
    const index = this.blankSequence++;
    return this.factory.blankNode(`${prefix}_${this.blankUniqueKey}_${index}`);
  }
}

export function self<T>(valueShape: TypedShapeID<T>): PartialProperty<T> {
  return {path: {type: 'sequence', sequence: []}, valueShape};
}

export function property<T>(
  predicate: Rdf.NamedNode,
  valueShape: TypedShapeID<T>
): PartialProperty<T> {
  return {path: {type: 'predicate', predicate}, valueShape};
}

export function inverseProperty<T>(
  predicate: Rdf.NamedNode,
  valueShape: TypedShapeID<T>
): PartialProperty<T> {
  return {
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
): PartialProperty<T> {
  return {path, valueShape};
}

export function definesType<T>(property: PartialProperty<T>): PartialProperty<T> {
  return {...property, kind: 'type'};
}

export function transient(property: PartialProperty<any>): PartialProperty<undefined> {
  return {...property, transient: true};
}

export function computedProperty<T>(valueShape: TypedShapeID<T>): PartialProperty<T> {
  return {
    path: {type: 'sequence', sequence: []},
    valueShape,
    kind: 'computed',
  };
}
