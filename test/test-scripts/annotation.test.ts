import path from 'node:path';

import * as Ramp from '../../src/index.js';
import { readQuadsFromTurtle } from '../util.js';
import {
  TestScriptContext, assertEqual, assertEqualStructural,
} from './test-script-context.js';

const factory = Ramp.DefaultDataFactory;

export namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const type = Ramp.namespacedNode(factory, NAMESPACE, 'type');
  export const value = Ramp.namespacedNode(factory, NAMESPACE, 'value');
  export const langString = Ramp.namespacedNode(factory, NAMESPACE, 'langString');
}

export namespace rdfs {
  export const NAMESPACE = 'http://www.w3.org/2000/01/rdf-schema#';
  export const label = Ramp.namespacedNode(factory, NAMESPACE, 'label');
}

export namespace xsd {
  export const NAMESPACE = 'http://www.w3.org/2001/XMLSchema#';
  export const string = Ramp.namespacedNode(factory, NAMESPACE, 'string');
  export const nonNegativeInteger = Ramp.namespacedNode(factory, NAMESPACE, 'nonNegativeInteger');
}

export namespace oa {
  export const NAMESPACE = 'http://www.w3.org/ns/oa#';
  export const Annotation = Ramp.namespacedNode(factory, NAMESPACE, 'Annotation');
  export const RangeSelector = Ramp.namespacedNode(factory, NAMESPACE, 'RangeSelector');
  export const XPathSelector = Ramp.namespacedNode(factory, NAMESPACE, 'XPathSelector');
  export const hasBody = Ramp.namespacedNode(factory, NAMESPACE, 'hasBody');
  export const hasTarget = Ramp.namespacedNode(factory, NAMESPACE, 'hasTarget');
  export const hasSource = Ramp.namespacedNode(factory, NAMESPACE, 'hasSource');
  export const hasSelector = Ramp.namespacedNode(factory, NAMESPACE, 'hasSelector');
  export const hasStartSelector = Ramp.namespacedNode(factory, NAMESPACE, 'hasStartSelector');
  export const hasEndSelector = Ramp.namespacedNode(factory, NAMESPACE, 'hasEndSelector');
  export const start = Ramp.namespacedNode(factory, NAMESPACE, 'start');
  export const end = Ramp.namespacedNode(factory, NAMESPACE, 'end');
  export const refinedBy = Ramp.namespacedNode(factory, NAMESPACE, 'refinedBy');
}

const schema = new Ramp.ShapeBuilder();

const xpathLiteral = schema.literal({datatype: xsd.string});

const XPathSelectorShape = schema.record({
  id: oa.XPathSelector,
  properties: {
    type: Ramp.definesType(
      Ramp.property(rdf.type, schema.constant(oa.XPathSelector))
    ),
    xpath: Ramp.property(rdf.value, xpathLiteral),
    offset: Ramp.propertyPath(
      {
        type: 'sequence',
        sequence: [
          {type: 'predicate', predicate: oa.refinedBy},
          {type: 'predicate', predicate: oa.start},
        ],
      },
      schema.literal({
        datatype: xsd.nonNegativeInteger,
        mapper: Ramp.mapAsNumber(schema.factory),
      })
    ),
    refinedBy: Ramp.property(oa.refinedBy, schema.optional(schema.resource())),
  }
});

interface XPathSelector extends Ramp.UnwrapShape<typeof XPathSelectorShape> {}
const XPathSelector: Ramp.TypedShapeID<XPathSelector> = XPathSelectorShape;

const RangeSelectorShape = schema.record({
  id: oa.RangeSelector,
  properties: {
    type: Ramp.definesType(
      Ramp.property(rdf.type, schema.constant(oa.RangeSelector))
    ),
    start: Ramp.property(oa.hasStartSelector, XPathSelector),
    end: Ramp.property(oa.hasEndSelector, XPathSelector),
  }
});

interface RangeSelector extends Ramp.UnwrapShape<typeof RangeSelectorShape> {}
const RangeSelector: Ramp.TypedShapeID<RangeSelector> = RangeSelectorShape;

const bodyLabel = schema.literal({datatype: rdf.langString});

const AnnotationShape = schema.record({
  id: oa.Annotation,
  properties: {
    type: Ramp.definesType(
      Ramp.property(rdf.type, schema.constant(oa.Annotation))
    ),
    iri: Ramp.self(schema.resource()),
    target: Ramp.property(oa.hasTarget, schema.record({
      properties: {
        source: Ramp.property(oa.hasSource, schema.resource()),
        selector: Ramp.property(oa.hasSelector, schema.anyOf(
          [RangeSelector, XPathSelector]
        ))
      }
    })),
    body: Ramp.property(oa.hasBody, schema.record({
      properties: {
        label: Ramp.property(rdfs.label, schema.map({
          key: {target: bodyLabel, part: 'language'},
          value: {target: bodyLabel, part: 'value'},
        })),
        label_en: Ramp.property(rdfs.label, schema.literal({language: 'en', lenient: true})),
        nonExistentValue: Ramp.property(rdf.value, schema.optional(schema.literalTerm())),
      }
    })),
  }
});

interface Annotation extends Ramp.UnwrapShape<typeof AnnotationShape> {}
const Annotation: Ramp.TypedShapeID<Annotation> = AnnotationShape;

const BackwardsShape = schema.record({
  properties: {
    iri: Ramp.self(schema.resource()),
    source: Ramp.property(oa.hasSource, schema.resource()),
    selector: Ramp.property(oa.hasSelector, schema.anyOf(
      [RangeSelector, XPathSelector]
    )),
    annotations: Ramp.inverseProperty(oa.hasTarget, schema.set(Annotation)),
  }
});
interface Backwards extends Ramp.UnwrapShape<typeof BackwardsShape> {}
const Backwards: Ramp.TypedShapeID<Backwards> = BackwardsShape;

export default (context: TestScriptContext): void => {
  const dataset = Ramp.dataset(readQuadsFromTurtle(
    path.join(import.meta.dirname, 'annotation.ttl')
  ));

  context.defineCase('annotation/roundtrip', () => {
    const annotationShape = schema.getShape(Annotation)!;

    const matches = Array.from(
      Ramp.frame({shape: annotationShape, dataset}),
      s => s.value
    );
    assertEqual(matches.length, 1, 'Expected to frame a single match');
    const expectedMatch: Annotation = {
      type: 'http://www.w3.org/ns/oa#Annotation',
      iri: 'example:annotation1',
      target: {
        source: 'example:document1',
        selector: {
          type: 'http://www.w3.org/ns/oa#RangeSelector',
          start: {
            type: 'http://www.w3.org/ns/oa#XPathSelector',
            xpath: '/table[1]/tbody[1]/tr[4]/td[1]',
            offset: 9,
            refinedBy: 'example:offset1',
          },
          end: {
            type: 'http://www.w3.org/ns/oa#XPathSelector',
            xpath: '/table[1]/tbody[1]/tr[4]/td[1]',
            offset: 34,
            refinedBy: 'example:offset2',
          },
        }
      },
      body: {
        label: { en: 'Borders', ru: 'Границы' },
        label_en: 'Borders',
        nonExistentValue: undefined
      }
    };
    assertEqualStructural(matches[0], expectedMatch, 'Expected to correctly frame shape');

    const triples = Array.from(Ramp.flatten({value: matches[0], shape: annotationShape}));
    // const turtle = await quadsToTurtleString(triples, PREFIXES);
    // assertEqual(tutrle, expectedTurtle, 'Expected to correctly flatten shape');
  });
  
  context.defineCase('annotation/roundtrip-backwards', () => {
    const backwardsShape = schema.getShape(Backwards)!;
  
    const matches = Array.from(
      Ramp.frame({shape: backwardsShape, dataset}),
      s => s.value
    );
    assertEqual(matches.length, 1, 'Expected to frame a single match');
    const expectedMatch: Backwards = {
      iri: 'example:range-source1',
      source: 'example:document1',
      selector: {
        type: 'http://www.w3.org/ns/oa#RangeSelector',
        start: {
          type: 'http://www.w3.org/ns/oa#XPathSelector',
          xpath: '/table[1]/tbody[1]/tr[4]/td[1]',
          offset: 9,
          refinedBy: 'example:offset1',
        },
        end: {
          type: 'http://www.w3.org/ns/oa#XPathSelector',
          xpath: '/table[1]/tbody[1]/tr[4]/td[1]',
          offset: 34,
          refinedBy: 'example:offset2',
        },
      },
      annotations: [
        {
          type: 'http://www.w3.org/ns/oa#Annotation',
          iri: 'example:annotation1',
          target: {
            source: 'example:document1',
            selector: {
              type: 'http://www.w3.org/ns/oa#RangeSelector',
              start: {
                type: 'http://www.w3.org/ns/oa#XPathSelector',
                xpath: '/table[1]/tbody[1]/tr[4]/td[1]',
                offset: 9,
                refinedBy: 'example:offset1',
              },
              end: {
                type: 'http://www.w3.org/ns/oa#XPathSelector',
                xpath: '/table[1]/tbody[1]/tr[4]/td[1]',
                offset: 34,
                refinedBy: 'example:offset2',
              },
            },
          },
          body: {
            label: {
              en: 'Borders',
              ru: 'Границы',
            },
            label_en: 'Borders',
          },
        },
      ]
    };
    assertEqualStructural(matches[0], expectedMatch, 'Expected to correctly frame shape');

    const triples = Array.from(Ramp.flatten({value: matches[0], shape: backwardsShape}));
  });
};
