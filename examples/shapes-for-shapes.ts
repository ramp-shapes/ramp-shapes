import { LowerTypeHandler, Rdf, ShapesForShapes, UnionShape, lift, lower, vocabulary } from '../src/index';
import { rdf } from './namespaces';
import { triplesToTurtleString, toJson } from './util';

const PREFIXES = {
  rdf: rdf.NAMESPACE,
  '': vocabulary.NAMESPACE,
};

const BASE_SHAPE = ShapesForShapes.find(s => Rdf.equals(s.id, vocabulary.Shape))! as UnionShape;
const ROOT_SHAPES = [
  BASE_SHAPE,
  ...BASE_SHAPE.variants.map(variant => ShapesForShapes.find(s => Rdf.equals(s.id, variant))!)
];

const lowerType: LowerTypeHandler = (value, shape) => {
  if (shape.type === 'resource') {
    switch (value) {
      case 'object': return vocabulary.ObjectShape;
      case 'union': return vocabulary.UnionShape;
      case 'set': return vocabulary.SetShape;
      case 'optional': return vocabulary.OptionalShape;
      case 'resource': return vocabulary.ResourceShape;
      case 'literal': return vocabulary.LiteralShape;
      case 'list': return vocabulary.ListShape;
      case 'map': return vocabulary.MapShape;
    }
  }
  return LowerTypeHandler.convertFromNativeType(value, shape);
};

async function main() {
  for (const shape of ROOT_SHAPES) {
    console.log('### ', Rdf.toString(shape.id), '###');
    const quads = lower({
      rootShape: vocabulary.Shape,
      shapes: ShapesForShapes,
      value: shape,
      lowerType,
    });

    const triples = [...quads];
    const shapeTurtle = await triplesToTurtleString(triples, PREFIXES);
    console.log(shapeTurtle);

    for (const {value} of lift({shapes: ShapesForShapes, rootShape: BASE_SHAPE.id, triples})) {
      console.log(toJson(value));
    }
  }
}

main();
