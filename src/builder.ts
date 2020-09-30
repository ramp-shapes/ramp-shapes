import { HashMap, ReadonlyHashMap } from './hash-map';
import * as Rdf from './rdf';
import { ObjectProperty, PropertyPath, Shape, ShapeID, ShapeReference, Vocabulary } from './shapes';

export interface ShapeBuilderOptions {
  factory?: Rdf.DataFactory;
  blankUniqueKey?: string;
}

interface ShapeBaseProps {
  id?: ShapeID;
  lenient?: boolean;
}

interface ObjectShapeProps extends ShapeBaseProps {
  typeProperties?: { [name: string]: PartialProperty };
  properties?: { [name: string]: PartialProperty };
  computedProperties?: { [name: string]: ShapeID };
}

interface PartialProperty {
  path: PropertyPath;
  valueShape: ShapeID;
  transient?: boolean;
}

interface OptionalShapeProps extends ShapeBaseProps {
  emptyValue?: null;
}

interface ConstantShapeProps extends ShapeBaseProps {
  keepAsTerm?: boolean;
  vocabulary?: Vocabulary;
}

interface ResourceShapeProps extends ShapeBaseProps {
  onlyNamed?: boolean;
  keepAsTerm?: boolean;
  vocabulary?: Vocabulary;
}

interface LiteralShapeProps extends ShapeBaseProps {
  datatype?: Rdf.NamedNode;
  language?: string;
  keepAsTerm?: boolean;
}

interface SetShapeProps extends ShapeBaseProps {
  minCount?: number;
  maxCount?: number;
}

interface MapShapeProps extends ShapeBaseProps {
  key: PartialShapeReference;
  value: PartialShapeReference;
  itemShape?: ShapeID;
}

interface PartialShapeReference {
  target: ShapeID;
  part?: ShapeReference['part'];
}

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

  addAll(shapes: Iterable<Shape>) {
    for (const shape of shapes) {
      this._shapes.set(shape.id, shape);
    }
  }

  object(props: ObjectShapeProps): ShapeID {
    const {id = this.makeShapeID('object'), typeProperties, properties, computedProperties} = props;
    const {_shapes} = this;

    function toField(name: string, partial: PartialProperty): ObjectProperty {
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

    function toFields(partials: { [name: string]: PartialProperty }) {
      return Object.keys(partials).map(name => toField(name, partials[name]));
    }

    function toComputedFields(partials: { [name: string]: ShapeID }) {
      return Object.keys(partials).map(name => {
        const computedShape = partials[name];
        return {
          name,
          get valueShape() {
            return _shapes.get(computedShape)!;
          }
        };
      });
    }

    this._shapes.set(id, {
      type: 'object',
      id,
      typeProperties: typeProperties ? toFields(typeProperties) : [],
      properties: properties ? toFields(properties) : [],
      computedProperties: computedProperties
        ? toComputedFields(computedProperties) : [],
    });
    return id;
  }

  union(variants: ReadonlyArray<ShapeID>, props: ShapeBaseProps = {}): ShapeID {
    const {id = this.makeShapeID('union'), lenient} = props;
    const {_shapes} = this;
    this._shapes.set(id, {
      type: 'union',
      id,
      lenient,
      get variants() {
        return variants.map(variant => _shapes.get(variant)!);
      }
    });
    return id;
  }

  set(itemShape: ShapeID, props: SetShapeProps = {}): ShapeID {
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
    return id;
  }

  optional(itemShape: ShapeID, props: OptionalShapeProps = {}): ShapeID {
    const {id = this.makeShapeID('optional'), lenient, emptyValue} = props;
    const {_shapes} = this;
    this._shapes.set(id, {
      type: 'optional',
      id,
      lenient,
      emptyValue,
      get itemShape() {
        return _shapes.get(itemShape)!;
      }
    });
    return id;
  }

  constant(value: Rdf.Term, props: ConstantShapeProps = {}): ShapeID {
    const {lenient, keepAsTerm, vocabulary} = props;
    let shape: Shape;
    switch (value.termType) {
      case 'NamedNode':
      case 'BlankNode': {
        const {id = this.makeShapeID('resource')} = props;
        shape = {type: 'resource', id, lenient, value, keepAsTerm, vocabulary};
        break;
      }
      case 'Literal': {
        const {id = this.makeShapeID('literal')} = props;
        shape = {type: 'literal', id, lenient, value, keepAsTerm};
        break;
      }
      default:
        throw new Error('Unexpected term type for constant shape: ' + value.termType);
    }
    this._shapes.set(shape.id, shape);
    return shape.id;
  }

  resource(props: ResourceShapeProps = {}): ShapeID {
    const {id = this.makeShapeID('resource'), lenient, onlyNamed, keepAsTerm, vocabulary} = props;
    this._shapes.set(id, {type: 'resource', id, lenient, onlyNamed, keepAsTerm, vocabulary});
    return id;
  }

  literal(props: LiteralShapeProps = {}): ShapeID {
    const {id = this.makeShapeID('literal'), lenient, datatype, language, keepAsTerm} = props;
    this._shapes.set(id, {type: 'literal', id, lenient, datatype, language, keepAsTerm});
    return id;
  }

  list(itemShape: ShapeID, props: ShapeBaseProps = {}): ShapeID {
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
    return id;
  }

  map(props: MapShapeProps): ShapeID {
    const {
      id = this.makeShapeID('map'),
      lenient,
      key,
      value,
      itemShape = value.target,
    } = props;
    const {_shapes} = this;
    this._shapes.set(id, {
      type: 'map',
      id,
      lenient,
      key: {
        part: key.part,
        get target() { return _shapes.get(key.target)!; }
      },
      value: {
        part: value.part,
        get target() { return _shapes.get(value.target)!; }
      },
      get itemShape() { return _shapes.get(itemShape)!; }
    });
    return id;
  }

  makeShapeID(prefix: string): Rdf.BlankNode {
    const index = this.blankSequence++;
    return this.factory.blankNode(`${prefix}_${this.blankUniqueKey}_${index}`);
  }
}

export interface PropertyProps {
  transient?: boolean;
}

export function self(valueShape: ShapeID, props: PropertyProps = {}): PartialProperty {
  const {transient} = props;
  return {path: {type: 'sequence', sequence: []}, valueShape, transient};
}

export function property(
  predicate: Rdf.NamedNode,
  valueShape: ShapeID,
  props: PropertyProps = {}
): PartialProperty {
  const {transient} = props;
  return {path: {type: 'predicate', predicate}, valueShape, transient};
}

export function inverseProperty(
  predicate: Rdf.NamedNode,
  valueShape: ShapeID,
  props: PropertyProps = {}
): PartialProperty {
  const {transient} = props;
  return {
    path: {
      type: 'inverse',
      inverse: {type: 'predicate', predicate}
    },
    valueShape,
    transient,
  };
}

export function propertyPath(
  path: PropertyPath,
  valueShape: ShapeID,
  props: PropertyProps = {}
): PartialProperty {
  const {transient} = props;
  return {path, valueShape, transient};
}
