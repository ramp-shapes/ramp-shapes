import * as Rdf from './rdf-model';
import { ShapeID, Shape, ObjectProperty, PropertyPathSegment } from './shapes';
import { rdf } from './vocabulary';

export type PartialProperty = Pick<ObjectProperty, 'path' | 'valueShape'>;

export interface ObjectShapeProps {
  id?: ShapeID;
  typeProperties?: { [name: string]: PartialProperty };
  properties?: { [name: string]: PartialProperty };
}

export class ShapeBuilder {
  private _shapes: Shape[] = [];

  get shapes(): ReadonlyArray<Shape> {
    return this._shapes;
  }

  object(props: ObjectShapeProps): ShapeID {
    const {id = this.randomShapeID('object'), typeProperties, properties} = props;

    function toField(name: string, partial: PartialProperty): ObjectProperty {
      const {path, valueShape} = partial;
      return {
        type: 'property',
        name,
        path,
        valueShape,
      };
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
    const id = this.randomShapeID('union');
    this._shapes.push({type: 'union', id, variants});
    return id;
  }

  set(itemShape: ShapeID): ShapeID {
    const id = this.randomShapeID('set');
    this._shapes.push({type: 'set', id, itemShape});
    return id;
  }

  optional(valueShape: ShapeID, emptyValue: null | undefined = undefined): ShapeID {
    const id = this.randomShapeID('optional');
    this._shapes.push({type: 'optional', id, valueShape, emptyValue});
    return id;
  }

  constant(value: Rdf.Term): ShapeID {
    let shape: Shape;
    switch (value.termType) {
      case 'NamedNode':
      case 'BlankNode': {
        const id = this.randomShapeID('resource');
        shape = {type: 'resource', id, value};
        break;
      }
      case 'Literal': {
        const id = this.randomShapeID('literal');
        shape = {type: 'literal', id, value};
        break;
      }
      default:
        throw new Error('Unexpected term type for constant shape: ' + value.termType);
    }
    this._shapes.push(shape);
    return shape.id;
  }

  resource(): ShapeID {
    const id = this.randomShapeID('resource');
    this._shapes.push({type: 'resource', id});
    return id;
  }

  literal(datatype?: Rdf.NamedNode): ShapeID {
    const id = this.randomShapeID('literal');
    this._shapes.push({type: 'literal', id, datatype});
    return id;
  }

  langLiteral(language: string): ShapeID {
    const id = this.randomShapeID('langLiteral');
    this._shapes.push({type: 'literal', id, datatype: rdf.langString, language});
    return id;
  }

  list(itemShape: ShapeID): ShapeID {
    const id = this.randomShapeID('list');
    this._shapes.push({type: 'list', id, itemShape});
    return id;
  }

  map(keyRef: ShapeID, itemShape: ShapeID): ShapeID {
    const id = this.randomShapeID('map');
    this._shapes.push({type: 'map', id, keyRef, itemShape});
    return id;
  }

  private randomShapeID(prefix: string): Rdf.BlankNode {
    return Rdf.randomBlankNode(prefix, 24);
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
