import { join } from 'path';
import * as Ramp from '../../src/index';
import { self, property, inverseProperty, propertyPath } from '../../src/index';
import { rdf, rdfs, xsd, oa } from '../namespaces';
import { toJson, readQuadsFromTurtle, quadsToTurtleString } from '../util';

const dataset = Ramp.Rdf.dataset(readQuadsFromTurtle(join(__dirname, 'annotation.ttl')));

const schema = new Ramp.ShapeBuilder();

const xpathLiteral = schema.literal({datatype: xsd.string});

schema.object({
  id: oa.XPathSelector,
  typeProperties: {
    type: property(rdf.type, schema.constant(oa.XPathSelector)),
  },
  properties: {
    xpath: property(rdf.value, xpathLiteral),
    offset: propertyPath(
      {
        type: 'sequence',
        sequence: [
          {type: 'predicate', predicate: oa.refinedBy},
          {type: 'predicate', predicate: oa.start},
        ],
      },
      schema.literal({datatype: xsd.nonNegativeInteger})
    ),
    refinedBy: property(oa.refinedBy, schema.optional(schema.resource())),
  }
});

schema.object({
  id: oa.RangeSelector,
  typeProperties: {
    type: property(rdf.type, schema.constant(oa.RangeSelector)),
  },
  properties: {
    start: property(oa.hasStartSelector, oa.XPathSelector),
    end: property(oa.hasEndSelector, oa.XPathSelector),
  }
});

const bodyLabel = schema.literal({datatype: rdf.langString});

schema.object({
  id: oa.Annotation,
  typeProperties: {
    type: property(rdf.type, schema.constant(oa.Annotation)),
  },
  properties: {
    iri: self(schema.resource()),
    target: property(oa.hasTarget, schema.object({
      properties: {
        source: property(oa.hasSource, schema.resource()),
        selector: property(oa.hasSelector, schema.union(
          [oa.RangeSelector, oa.XPathSelector]
        ))
      }
    })),
    body: property(oa.hasBody, schema.object({
      properties: {
        label: property(rdfs.label, schema.map({
          key: {target: bodyLabel, part: 'language'},
          value: {target: bodyLabel, part: 'value'},
        })),
        label_en: property(rdfs.label, schema.literal({language: 'en', lenient: true})),
        nonExistentValue: property(rdf.value, schema.optional(schema.literal())),
      }
    })),
  }
});

const backwardsShapeId = schema.object({
  properties: {
    iri: self(schema.resource()),
    source: property(oa.hasSource, schema.resource()),
    selector: property(oa.hasSelector, schema.union(
      [oa.RangeSelector, oa.XPathSelector]
    )),
    annotations: inverseProperty(oa.hasTarget, schema.set(oa.Annotation)),
  }
});

const PREFIXES = {
  rdf: rdf.NAMESPACE,
  rdfs: rdfs.NAMESPACE,
  xsd: xsd.NAMESPACE,
  oa: oa.NAMESPACE,
};

(async function main() {
  const annotationShape = schema.shapes.get(oa.Annotation)!;
  for (const {value} of Ramp.frame({shape: annotationShape, dataset})) {
    console.log('FRAME oa:Annotation', toJson(value));
    const triples = Ramp.flatten({value, shape: annotationShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }

  const backwardsShape = schema.shapes.get(backwardsShapeId)!;
  for (const {value} of Ramp.frame({shape: backwardsShape, dataset})) {
    console.log('FRAME backwards shape', toJson(value));
    const triples = Ramp.flatten({value, shape: backwardsShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }
})();
