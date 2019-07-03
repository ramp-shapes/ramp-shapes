import * as Rdf from './rdf';
import { ObjectProperty, PathSequence, Shape, ShapeID, ShapeReference, Vocabulary } from './shapes';

export interface ShapeBuilderOptions {
  blankUniqueKey?: string;
}

interface ShapeBaseProps {
  id?: ShapeID;
  lenient?: boolean;
}

interface ObjectShapeProps extends ShapeBaseProps {
  typeProperties?: { [name: string]: PartialProperty };
  properties?: { [name: string]: PartialProperty };
}

type PartialProperty = Pick<ObjectProperty, 'path' | 'valueShape'>;

interface OptionalShapeProps extends ShapeBaseProps {
  emptyValue?: null;
}

interface ConstantShapeProps extends ShapeBaseProps {
  keepAsTerm?: boolean;
  vocabulary?: Vocabulary;
}

interface LiteralShapeProps extends ShapeBaseProps {
  datatype?: Rdf.NamedNode;
  language?: string;
  keepAsTerm?: boolean;
}

interface MapShapeProps extends ShapeBaseProps {
  key: ShapeReference;
  value: ShapeReference;
  itemShape?: ShapeID;
}

export class ShapeBuilder {
  private readonly _shapes: Shape[] = [];

  private readonly blankUniqueKey: string | undefined;
  private blankSequence = 1;

  constructor(options: ShapeBuilderOptions = {}) {
    const {
      blankUniqueKey = Rdf.randomBlankNode('', 24).value,
    } = options;
    this.blankUniqueKey = blankUniqueKey;
  }

  get shapes(): Shape[] {
    return this._shapes;
  }

  object(props: ObjectShapeProps): ShapeID {
    const {id = this.makeShapeID('object'), typeProperties, properties} = props;

    function toField(name: string, partial: PartialProperty): ObjectProperty {
      const {path, valueShape} = partial;
      return {name, path, valueShape};
    }

    function toFields(partials: { [name: string]: PartialProperty }) {
      return Object.keys(partials).map(name => toField(name, partials[name]));
    }

    this._shapes.push({
      type: 'object',
      id,
      typeProperties: typeProperties ? toFields(typeProperties) : [],
      properties: properties ? toFields(properties) : [],
    });
    return id;
  }

  union(variants: ReadonlyArray<ShapeID>, props: ShapeBaseProps = {}): ShapeID {
    const {id = this.makeShapeID('union'), lenient} = props;
    this._shapes.push({type: 'union', id, lenient, variants});
    return id;
  }

  set(itemShape: ShapeID, props: ShapeBaseProps = {}): ShapeID {
    const {id = this.makeShapeID('set'), lenient} = props;
    this._shapes.push({type: 'set', id, lenient, itemShape});
    return id;
  }

  optional(itemShape: ShapeID, props: OptionalShapeProps = {}): ShapeID {
    const {id = this.makeShapeID('optional'), lenient, emptyValue} = props;
    this._shapes.push({type: 'optional', id, lenient, itemShape, emptyValue});
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
    this._shapes.push(shape);
    return shape.id;
  }

  resource(props: ConstantShapeProps = {}): ShapeID {
    const {id = this.makeShapeID('resource'), lenient, keepAsTerm, vocabulary} = props;
    this._shapes.push({type: 'resource', id, lenient, keepAsTerm, vocabulary});
    return id;
  }

  literal(props: LiteralShapeProps = {}): ShapeID {
    const {id = this.makeShapeID('literal'), lenient, datatype, language, keepAsTerm} = props;
    this._shapes.push({type: 'literal', id, lenient, datatype, language, keepAsTerm});
    return id;
  }

  list(itemShape: ShapeID, props: ShapeBaseProps = {}): ShapeID {
    const {id = this.makeShapeID('list'), lenient} = props;
    this._shapes.push({type: 'list', id, lenient, itemShape});
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
    this._shapes.push({type: 'map', id, lenient, key, value, itemShape});
    return id;
  }

  makeShapeID(prefix: string): Rdf.BlankNode {
    const index = this.blankSequence++;
    return Rdf.blankNode(`${prefix}_${this.blankUniqueKey}_${index}`);
  }
}

export function self(valueShape: ShapeID): PartialProperty {
  return {path: [], valueShape};
}

export function property(predicate: Rdf.NamedNode, valueShape: ShapeID): PartialProperty {
  return {path: [{predicate}], valueShape};
}

export function inverseProperty(predicate: Rdf.NamedNode, valueShape: ShapeID): PartialProperty {
  return {path: [{operator: '^', path: [{predicate}]}], valueShape};
}

export function propertyPath(path: PathSequence, valueShape: ShapeID): PartialProperty {
  return {path, valueShape};
}
