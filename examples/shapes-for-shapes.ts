import * as path from 'path';
import * as Ramp from '../src/index';
import { Rdf, vocabulary as ramp } from '../src/index';
import { rdf, xsd } from './namespaces';
import { makeDirectoryIfNotExists, writeFile, quadsToTurtleString } from './util';

const factory = Rdf.DefaultDataFactory;

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
    return factory.blankNode(`${prefix}_gen_${blankIndex}`);
  };

  const shapesForShapes = Ramp.makeShapesForShapes();
  const rootShape = shapesForShapes.get(factory.namedNode(ramp.Shape))!;
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

  const outDir = path.join(__dirname, '../out');
  makeDirectoryIfNotExists(outDir);

  await writeFile(
    path.join(outDir, 'ramp-shapes.ttl'),
    allShapesTurtle,
    {encoding: 'utf-8'}
  );

  const shapes = Ramp.frameShapes(quadSet);
  console.log(`Source shape count = ${shapesForShapes.size}; framed shape count = ${shapes.length}`);
}

main();
