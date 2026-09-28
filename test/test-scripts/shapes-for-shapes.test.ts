import path from 'node:path';

import * as Ramp from '../../src/index.js';

import { assertEqual } from '../core/assertions.js';
import { readTurtle } from '../core/data-util.js';
import { TestScriptContext } from '../core/test-script-context.js';
import { quadsToTurtleString } from '../core/turtle-blank.js';

const factory = Ramp.DefaultDataFactory;
const ramp = Ramp.vocabulary;

export default (context: TestScriptContext): void => {
  context.defineCase('shapes-for-shapes/generate-shapes', async () => {
    let blankIndex = 0;
    const generateBlankNode = (prefix: string) => {
      blankIndex++;
      return factory.blankNode(`${prefix}_gen_${blankIndex}`);
    };

    const shapesForShapes = Ramp.makeShapesForShapes();
    const rootShape = shapesForShapes.get(factory.namedNode(ramp.Shape))!;
    const quadSet = Ramp.dataset(Ramp.flatten({
      shape: rootShape,
      value: rootShape,
      unstable_generateBlankNode: generateBlankNode,
    }));

    const expected = readTurtle(path.join(import.meta.dirname, './shapes-for-shapes.ttl'));
    const givenTurtle = await quadsToTurtleString(Array.from(quadSet), expected.prefixes);
    assertEqual(givenTurtle, expected.turtle, 'Expected to produce same shapes-for-shapes');
  });

  context.defineCase('shapes-for-shapes/frame-shapes', () => {
    const shapesForShapes = Ramp.makeShapesForShapes();
    const expected = readTurtle(path.join(import.meta.dirname, './shapes-for-shapes.ttl'));
    const shapes = Ramp.frameShapes(Ramp.dataset(expected.quads));
    assertEqual(
      shapesForShapes.size,
      shapes.length,
      'Expect same shape count after flatten -> frame shapes for shapes'
    );
  });
};
