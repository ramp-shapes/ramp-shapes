import * as Rdf from './rdf-model';
import { ShapeID, Shape, ObjectField } from './shapes';

export type PartialField = Pick<ObjectField, 'predicate' | 'direction' | 'valueShape'>;

export interface ObjectShapeProps {
  id?: ShapeID;
  typeFields?: { [fieldName: string]: PartialField };
  fields?: { [fieldName: string]: PartialField };
}

export class ShapeBuilder {
  private _shapes: Shape[] = [];

  get shapes(): ReadonlyArray<Shape> {
    return this._shapes;
  }

  object(props: ObjectShapeProps): ShapeID {
    const {id = this.randomShapeID('object'), typeFields, fields} = props;

    function toField(fieldName: string, partial: PartialField): ObjectField {
      const {predicate, direction, valueShape} = partial;
      return {
        type: 'field',
        fieldName,
        predicate,
        direction,
        valueShape,
      };
    }

    function toFields(partials: { [fieldName: string]: PartialField }) {
      return Object.keys(partials).map(fieldName => toField(fieldName, partials[fieldName]));
    }

    this._shapes.push({
      type: 'object',
      id,
      typeFields: typeFields ? toFields(typeFields) : [],
      otherFields: fields ? toFields(fields) : [],
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

export function field(predicate: Rdf.Iri, valueShape: ShapeID): PartialField {
  return {predicate, direction: 'to-object', valueShape};
}

export function reverseField(predicate: Rdf.Iri, valueShape: ShapeID): PartialField {
  return {predicate, direction: 'to-subject', valueShape};
}
