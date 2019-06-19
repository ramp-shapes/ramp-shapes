import * as Ram from '../src/index';
import { Rdf, vocabulary as ram } from '../src/index';
import { rdf } from './namespaces';
import { triplesToTurtleString, toJson } from './util';

const PREFIXES = {
  rdf: rdf.NAMESPACE,
  '': Ram.vocabulary.NAMESPACE,
};

const BASE_SHAPE = Ram.ShapesForShapes
  .find(s => Rdf.equals(s.id, ram.Shape))! as Ram.UnionShape;
const ROOT_SHAPES = [
  BASE_SHAPE,
  ...BASE_SHAPE.variants.map(variant => Ram.ShapesForShapes.find(s => Rdf.equals(s.id, variant))!)
];

async function main() {
  for (const shape of ROOT_SHAPES) {
    console.log('### ', Rdf.toString(shape.id), '###');
    const quads = Ram.flatten({
      rootShape: ram.Shape,
      shapes: Ram.ShapesForShapes,
      value: shape,
    });

    const triples = [...quads];
    const shapeTurtle = await triplesToTurtleString(triples, PREFIXES);
    console.log(shapeTurtle);

    for (const {value} of Ram.frame({shapes: Ram.ShapesForShapes, rootShape: BASE_SHAPE.id, triples})) {
      console.log(toJson(value));
    }
  }
}

main();
