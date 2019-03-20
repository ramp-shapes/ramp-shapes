import { join } from 'path';
import {
  Rdf, ShapeBuilder, self, property, inverseProperty, propertyPath, frame, flatten
} from '../src/index';
import { rdf, rdfs, xsd, oa } from './namespaces';
import { readTriplesFromTurtle, toJson } from './util';

const triples = readTriplesFromTurtle(join(__dirname, 'annotation.ttl'));

const schema = new ShapeBuilder();

const xpathLiteral = schema.literal(xsd.string);

schema.object({
  id: oa.XPathSelector,
  typeProperties: {
    type: property(rdf.type, schema.constant(oa.XPathSelector)),
  },
  properties: {
    xpath: property(rdf.value, xpathLiteral),
    offset: propertyPath([oa.refinedBy, oa.start], schema.literal(xsd.nonNegativeInteger)),
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
        label: property(rdfs.label, schema.set(schema.literal())),
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

for (const {value, vars} of frame({rootShape: oa.Annotation, shapes: schema.shapes, triples})) {
  console.log('FOUND oa:Annotation', toJson(value));
  console.log('VAR xpath', toJson(vars.get(xpathLiteral)));
  for (const {s, p, o} of flatten({value, rootShape: oa.Annotation, shapes: schema.shapes})) {
    console.log(Rdf.toString(s), Rdf.toString(p), Rdf.toString(o));
  }
}

for (const result of frame({rootShape: backwardsShape, shapes: schema.shapes, triples})) {
  console.log('FOUND backwards shape', toJson(result.value));
  console.log('VAR xpath', toJson(result.vars.get(xpathLiteral)));
}
