import * as Ramp from '../src/index';
import { Rdf, vocabulary as ramp } from '../src/index';
import { rdf } from './namespaces';
import { quadsToTurtleString, toJson } from './util';

const PREFIXES = {
  rdf: rdf.NAMESPACE,
  '': Ramp.vocabulary.NAMESPACE,
};

const BASE_SHAPE = Ramp.ShapesForShapes
  .find(s => Rdf.equalTerms(s.id, ramp.Shape))! as Ramp.UnionShape;
const ROOT_SHAPES = [
  BASE_SHAPE,
  ...BASE_SHAPE.variants.map(variant => Ramp.ShapesForShapes.find(s => Rdf.equalTerms(s.id, variant))!)
];

async function main() {
  for (const shape of ROOT_SHAPES) {
    console.log('### ', Rdf.toString(shape.id), '###');
    const quads = Ramp.flatten({
      rootShape: ramp.Shape,
      shapes: Ramp.ShapesForShapes,
      value: shape,
    });

    const dataset = Rdf.dataset(quads);
    const shapeTurtle = await quadsToTurtleString(dataset, PREFIXES);
    console.log(shapeTurtle);

    for (const {value} of Ramp.frame({shapes: Ramp.ShapesForShapes, rootShape: BASE_SHAPE.id, dataset})) {
      console.log(toJson(value));
    }
  }
}

main();
