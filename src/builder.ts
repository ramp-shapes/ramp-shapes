import * as Rdf from './rdf-model';
import { ShapeID, Shape, ObjectProperty, PropertyPathSegment } from './shapes';

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

  union(...variants: Rdf.Iri[]): ShapeID {
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

  constant(value: Rdf.Node): ShapeID {
    const id = this.randomShapeID('node');
    this._shapes.push({type: 'node', id, value});
    return id;
  }

  node(): ShapeID {
    const id = this.randomShapeID('node');
    this._shapes.push({type: 'node', id, value: undefined});
    return id;
  }

  private randomShapeID(prefix: string): Rdf.Blank {
    const num = Math.floor(Math.random() * Math.pow(2, 24));
    const value = prefix + num.toString(16).padStart(3, '0');
    return {type: 'bnode', value};
  }
}

export function self(valueShape: ShapeID): PartialProperty {
  return {path: [], valueShape};
}

export function property(predicate: Rdf.Iri, valueShape: ShapeID): PartialProperty {
  return {path: [{predicate, reverse: false}], valueShape};
}

export function inverseProperty(predicate: Rdf.Iri, valueShape: ShapeID): PartialProperty {
  return {path: [{predicate, reverse: true}], valueShape};
}

export function propertyPath(
  predicates: ReadonlyArray<Rdf.Iri>, valueShape: ShapeID
): PartialProperty {
  return {
    path: predicates.map((predicate): PropertyPathSegment =>
      ({predicate, reverse: false})
    ),
    valueShape,
  };
}
