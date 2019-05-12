import { join } from 'path';
import {
  ShapeBuilder, self, property, inverseProperty, propertyPath, frame, flatten
} from '../src/index';
import { rdf, rdfs, xsd, oa } from './namespaces';
import { toJson, readTriplesFromTurtle, triplesToTurtleString } from './util';

const triples = readTriplesFromTurtle(join(__dirname, 'annotation.ttl'));

const schema = new ShapeBuilder();

const xpathLiteral = schema.literal({datatype: xsd.string});

schema.object({
  id: oa.XPathSelector,
  typeProperties: {
    type: property(rdf.type, schema.constant(oa.XPathSelector)),
  },
  properties: {
    xpath: property(rdf.value, xpathLiteral),
    offset: propertyPath([oa.refinedBy, oa.start],
      schema.literal({datatype: xsd.nonNegativeInteger})),
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

const bodyLabel = schema.literal();

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
          oa.RangeSelector,
          oa.XPathSelector
        ))
      }
    })),
    body: property(oa.hasBody, schema.object({
      properties: {
        label: property(rdfs.label, schema.map(
          {target: bodyLabel, part: 'language'}, bodyLabel
        )),
        label_en: property(rdfs.label, schema.literal({language: 'en'})),
        nonExistentValue: property(rdf.value, schema.optional(schema.literal())),
      }
    })),
  }
});

const backwardsShape = schema.object({
  properties: {
    iri: self(schema.resource()),
    source: property(oa.hasSource, schema.resource()),
    selector: property(oa.hasSelector, schema.union(
      oa.RangeSelector,
      oa.XPathSelector
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
  for (const {value, vars} of frame({rootShape: oa.Annotation, shapes: schema.shapes, triples})) {
    console.log('FRAME oa:Annotation', toJson(value));
    console.log('VAR xpath', toJson(vars.get(xpathLiteral)));
    const triples = flatten({value, rootShape: oa.Annotation, shapes: schema.shapes});
    console.log('FLATTEN:\n', await triplesToTurtleString(triples, PREFIXES));
  }
  
  for (const {value, vars} of frame({rootShape: backwardsShape, shapes: schema.shapes, triples})) {
    console.log('FRAME backwards shape', toJson(value));
    console.log('VAR xpath', toJson(vars.get(xpathLiteral)));
    const triples = flatten({value, rootShape: backwardsShape, shapes: schema.shapes});
    console.log('FLATTEN:\n', await triplesToTurtleString(triples, PREFIXES));
  }
})();
