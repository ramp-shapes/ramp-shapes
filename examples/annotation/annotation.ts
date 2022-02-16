import { join } from 'path';
import * as Ramp from '../../src/index';
import { self, property, inverseProperty, propertyPath, definesType } from '../../src/index';
import { rdf, rdfs, xsd, oa } from '../namespaces';
import { toJson, readQuadsFromTurtle, quadsToTurtleString } from '../util';

const dataset = Ramp.Rdf.dataset(readQuadsFromTurtle(join(__dirname, 'annotation.ttl')));

const schema = new Ramp.ShapeBuilder();

const xpathLiteral = schema.literal({datatype: xsd.string});

const XPathSelectorID = schema.record({
  id: oa.XPathSelector,
  properties: {
    type: definesType(
      property(rdf.type, schema.constant(oa.XPathSelector))
    ),
    xpath: property(rdf.value, xpathLiteral),
    offset: propertyPath(
      {
        type: 'sequence',
        sequence: [
          {type: 'predicate', predicate: oa.refinedBy},
          {type: 'predicate', predicate: oa.start},
        ],
      },
      schema.literal<number>({datatype: xsd.nonNegativeInteger})
    ),
    refinedBy: property(oa.refinedBy, schema.optional(schema.resource())),
  }
});

interface XPathSelector extends Ramp.UnwrapShape<typeof XPathSelectorID> {}
const XPathSelector: Ramp.TypedShapeID<XPathSelector> = XPathSelectorID;

const RangeSelectorID = schema.record({
  id: oa.RangeSelector,
  properties: {
    type: definesType(
      property(rdf.type, schema.constant(oa.RangeSelector))
    ),
    start: property(oa.hasStartSelector, XPathSelector),
    end: property(oa.hasEndSelector, XPathSelector),
  }
});

interface RangeSelector extends Ramp.UnwrapShape<typeof RangeSelectorID> {}
const RangeSelector: Ramp.TypedShapeID<RangeSelector> = RangeSelectorID;

const bodyLabel = schema.literal({datatype: rdf.langString});

const AnnotationID = schema.record({
  id: oa.Annotation,
  properties: {
    type: definesType(
      property(rdf.type, schema.constant(oa.Annotation))
    ),
    iri: self(schema.resource()),
    target: property(oa.hasTarget, schema.record({
      properties: {
        source: property(oa.hasSource, schema.resource()),
        selector: property(oa.hasSelector, schema.anyOf(
          [RangeSelector, XPathSelector]
        ))
      }
    })),
    body: property(oa.hasBody, schema.record({
      properties: {
        label: property(rdfs.label, schema.map({
          key: {target: bodyLabel, part: 'language'},
          value: {target: bodyLabel, part: 'value'},
        })),
        label_en: property(rdfs.label, schema.literal({language: 'en', lenient: true})),
        nonExistentValue: property(rdf.value, schema.optional(schema.literalTerm())),
      }
    })),
  }
});

interface Annotation extends Ramp.UnwrapShape<typeof AnnotationID> {}
const Annotation: Ramp.TypedShapeID<Annotation> = AnnotationID;

const backwardsShapeId = schema.record({
  properties: {
    iri: self(schema.resource()),
    source: property(oa.hasSource, schema.resource()),
    selector: property(oa.hasSelector, schema.anyOf(
      [RangeSelector, XPathSelector]
    )),
    annotations: inverseProperty(oa.hasTarget, schema.set(Annotation)),
  }
});

const PREFIXES = {
  rdf: rdf.NAMESPACE,
  rdfs: rdfs.NAMESPACE,
  xsd: xsd.NAMESPACE,
  oa: oa.NAMESPACE,
};

(async function main() {
  const annotationShape = schema.getShape(Annotation)!;
  for (const {value} of Ramp.frame({shape: annotationShape, dataset})) {
    console.log('FRAME oa:Annotation', toJson(value));
    const triples = Ramp.flatten({value, shape: annotationShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }

  const backwardsShape = schema.getShape(backwardsShapeId)!;
  for (const {value} of Ramp.frame({shape: backwardsShape, dataset})) {
    console.log('FRAME backwards shape', toJson(value));
    const triples = Ramp.flatten({value, shape: backwardsShape});
    console.log('FLATTEN:\n', await quadsToTurtleString(triples, PREFIXES));
  }
})();
