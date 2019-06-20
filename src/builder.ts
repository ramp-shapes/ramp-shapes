import * as Rdf from './rdf';
import { ShapeID, Shape, ObjectProperty, PropertyPathSegment, ShapeReference, Vocabulary } from './shapes';

export type PartialProperty = Pick<ObjectProperty, 'path' | 'valueShape'>;

export interface ObjectShapeProps {
  id?: ShapeID;
  typeProperties?: { [name: string]: PartialProperty };
  properties?: { [name: string]: PartialProperty };
}

export interface ShapeBuilderOptions {
  blankUniqueKey?: string;
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

  union(...variants: ShapeID[]): ShapeID {
    const id = this.makeShapeID('union');
    this._shapes.push({type: 'union', id, variants});
    return id;
  }

  set(itemShape: ShapeID): ShapeID {
    const id = this.makeShapeID('set');
    this._shapes.push({type: 'set', id, itemShape});
    return id;
  }

  optional(itemShape: ShapeID, emptyValue: null | undefined = undefined): ShapeID {
    const id = this.makeShapeID('optional');
    this._shapes.push({type: 'optional', id, itemShape, emptyValue});
    return id;
  }

  constant(value: Rdf.Term, options: {
    keepAsTerm?: boolean;
    vocabulary?: Vocabulary;
  } = {}): ShapeID {
    const {keepAsTerm, vocabulary} = options;
    let shape: Shape;
    switch (value.termType) {
      case 'NamedNode':
      case 'BlankNode': {
        const id = this.makeShapeID('resource');
        shape = {type: 'resource', id, value, keepAsTerm, vocabulary};
        break;
      }
      case 'Literal': {
        const id = this.makeShapeID('literal');
        shape = {type: 'literal', id, value, keepAsTerm};
        break;
      }
      default:
        throw new Error('Unexpected term type for constant shape: ' + value.termType);
    }
    this._shapes.push(shape);
    return shape.id;
  }

  resource(options: {
    keepAsTerm?: boolean;
    vocabulary?: Vocabulary;
  } = {}): ShapeID {
    const {keepAsTerm, vocabulary} = options;
    const id = this.makeShapeID('resource');
    this._shapes.push({type: 'resource', id, keepAsTerm, vocabulary});
    return id;
  }

  literal(options: {
    datatype?: Rdf.NamedNode;
    language?: string;
    keepAsTerm?: boolean;
  } = {}): ShapeID {
    const id = this.makeShapeID('literal');
    this._shapes.push({
      type: 'literal',
      id,
      datatype: options.datatype,
      language: options.language,
      keepAsTerm: options.keepAsTerm,
    });
    return id;
  }

  list(itemShape: ShapeID): ShapeID {
    const id = this.makeShapeID('list');
    this._shapes.push({type: 'list', id, itemShape});
    return id;
  }

  map(key: ShapeReference, itemShape: ShapeID): ShapeID {
    const id = this.makeShapeID('map');
    this._shapes.push({type: 'map', id, key, itemShape});
    return id;
  }

  mapValue(key: ShapeReference, value: ShapeReference, itemShape?: ShapeID): ShapeID {
    const id = this.makeShapeID('map');
    this._shapes.push({type: 'map', id, key, value, itemShape: itemShape || value.target});
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
  return {path: [{predicate, reverse: false}], valueShape};
}

export function inverseProperty(predicate: Rdf.NamedNode, valueShape: ShapeID): PartialProperty {
  return {path: [{predicate, reverse: true}], valueShape};
}

export function propertyPath(
  predicates: ReadonlyArray<Rdf.NamedNode>, valueShape: ShapeID
): PartialProperty {
  return {
    path: predicates.map((predicate): PropertyPathSegment =>
      ({predicate, reverse: false})
    ),
    valueShape,
  };
}
