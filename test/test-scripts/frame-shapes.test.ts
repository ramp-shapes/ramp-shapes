import path from 'node:path';

import * as Ramp from '../../src/index.js';

import { AssertEqualError, assertEqual, assertEqualStructural } from '../core/assertions.js';
import { SequentialDataFactory, readTurtle } from '../core/data-util.js';
import { TestScriptContext } from '../core/test-script-context.js';

const factory = Ramp.DefaultDataFactory;

export default (context: TestScriptContext): void => {
  context.defineCase('frame-shapes/simple-point-record', () => {
    const shapeQuads = readTurtle(
      path.join(import.meta.dirname, '../../test-data/shapes/points-simple.ttl'),
      new SequentialDataFactory(factory)
    ).quads;
    const shapes = Ramp.frameShapes(Ramp.dataset(shapeQuads));
    assertEqual(shapes.length, 4, 'Expected to frame 4 shapes in total');

    const expected: Ramp.RecordShape = {
      id: factory.namedNode('http://example.com/schema#Point'),
      type: 'record',
      typeProperties: [
        {
          kind: 'field',
          name: 'type',
          path: {
            type: 'predicate',
            predicate: factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
          },
          valueShape: {
            id: factory.blankNode('b1'),
            type: 'resource',
            value: factory.namedNode('http://example.com/schema#Point'),
          },
        },
      ],
      properties: [
        {
          kind: 'field',
          name: 'x',
          path: {
            type: 'predicate',
            predicate: factory.namedNode('http://example.com/schema#xCoord'),
          },
          valueShape: {
            id: factory.blankNode('b3'),
            type: 'literal',
            datatype: factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'),
          },
        },
        {
          kind: 'field',
          name: 'y',
          path: {
            type: 'predicate',
            predicate: factory.namedNode('http://example.com/schema#yCoord'),
          },
          valueShape: {
            id: factory.blankNode('b5'),
            type: 'literal',
            datatype: factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'),
          },
        },
      ],
      computedProperties: [],
    };

    const shape = shapes.find(s => s.id.value === 'http://example.com/schema#Point');
    if (!shape) {
      throw new AssertEqualError({
        message: 'Expected to find "Point" among framed shapes',
        expected,
        given: undefined,
      });
    }

    assertEqualStructural(shape, expected, 'Expected correctly framed "Point" shape');
  });
};
