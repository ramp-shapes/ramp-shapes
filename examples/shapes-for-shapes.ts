import * as Ramp from '../src/index';
import { Rdf, vocabulary as ramp } from '../src/index';
import { rdf, xsd } from './namespaces';
import { quadsToTurtleString } from './util';

const PREFIXES = {
  rdf: rdf.NAMESPACE,
  xsd: xsd.NAMESPACE,
  '': Ramp.vocabulary.NAMESPACE,
};

async function main() {
  const quads: Rdf.Quad[] = [];
  const quadSet = Rdf.dataset();

  let blankIndex = 0;
  const generateBlankNode = (prefix: string) => {
    blankIndex++;
    return Rdf.blankNode(`${prefix}_gen_${blankIndex}`);
  };

  const rootShape = Ramp.ShapesForShapes.get(ramp.Shape)!;
  const flattenedShapes = Ramp.flatten({
    shape: rootShape,
    value: rootShape,
    unstable_generateBlankNode: generateBlankNode,
  });
  for (const quad of flattenedShapes) {
    if (!quadSet.has(quad)) {
      quadSet.add(quad);
      quads.push(quad);
    }
  }

  const allShapesTurtle = await quadsToTurtleString(quads, PREFIXES);
  console.log(allShapesTurtle);

  const shapes = Ramp.frameShapes(quadSet);
  console.log(`Source shape count = ${Ramp.ShapesForShapes.size}; framed shape count = ${shapes.length}`);
}

main();
