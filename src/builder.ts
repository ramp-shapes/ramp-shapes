import * as Rdf from './rdf-model';
import { ShapeID, Shape, ObjectField } from './shapes';

export type PartialField =
    Pick<ObjectField, 'predicate' | 'direction' | 'valueShape'> &
    { determinesType: boolean };

export class ShapeBuilder {
  private _shapes: Shape[] = [];

  get shapes(): ReadonlyArray<Shape> {
    return this._shapes;
  }

  object(fields: { [fieldName: string]: PartialField }): ShapeID {
    return this.namedObject(this.randomShapeID('object'), fields);
  }
  
  namedObject(id: ShapeID, fields: { [fieldName: string]: PartialField }): ShapeID {
    const typeFields: ObjectField[] = [];
    const otherFields: ObjectField[] = [];
    for (const fieldName of Object.keys(fields)) {
      const {predicate, direction, valueShape, determinesType} = fields[fieldName];
      const field: ObjectField = {
        type: 'field',
        fieldName,
        predicate,
        direction,
        valueShape,
      };
      if (determinesType) {
        typeFields.push(field);
      } else {
        otherFields.push(field);
      }
    }
    this._shapes.push({type: 'object', id, typeFields, otherFields});
    return id;
  }

  determinesType(predicate: Rdf.Iri, valueShape: ShapeID): PartialField {
    return {direction: 'to-object', predicate, determinesType: true, valueShape};
  }

  refersTo(predicate: Rdf.Iri, valueShape: ShapeID): PartialField {
    return {direction: 'to-object', predicate, determinesType: false, valueShape};
  }

  referredFrom(predicate: Rdf.Iri, valueShape: ShapeID): PartialField {
    return {direction: 'to-subject', predicate, determinesType: false, valueShape};
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

  constant(value: Rdf.Node): ShapeID {
    const id = this.randomShapeID('constant');
    this._shapes.push({type: 'constant', id, value});
    return id;
  }

  placeholder(id?: ShapeID): ShapeID {
    const shapeId = id || this.randomShapeID('placeholder');
    this._shapes.push({type: 'placeholder', id: shapeId});
    return shapeId;
  }

  private randomShapeID(prefix: string): Rdf.Blank {
    const num = Math.floor(Math.random() * Math.pow(2, 24));
    const value = prefix + num.toString(16).padStart(3, '0');
    return {type: 'bnode', value};
  }
}
