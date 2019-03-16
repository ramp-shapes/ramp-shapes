import { join } from 'path';
import { Rdf, ShapeBuilder, self, property, inverseProperty, unifyTriplesToShape, propertyPath } from '../src/index';
import { rdf, rdfs, oa } from './namespaces';
import { readTriplesFromTurtle, toJson } from './util';

const triples = readTriplesFromTurtle(join(__dirname, 'annotation.ttl'));

const schema = new ShapeBuilder();

const xpathNode = schema.node();

schema.object({
  id: oa.XPathSelector,
  typeProperties: {
    type: property(rdf.type, schema.constant(oa.XPathSelector)),
  },
  properties: {
    xpath: property(rdf.value, xpathNode),
    offset: propertyPath([oa.refinedBy, oa.start], schema.node()),
    refinedBy: property(oa.refinedBy, schema.optional(schema.node())),
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
    iri: self(schema.node()),
    target: property(oa.hasTarget, schema.object({
      properties: {
        source: property(oa.hasSource, schema.node()),
        selector: property(oa.hasSelector, schema.union(
          oa.RangeSelector,
          oa.XPathSelector
        ))
      }
    })),
    body: property(oa.hasBody, schema.object({
      properties: {
        label: property(rdfs.label, schema.set(schema.node())),
        nonExistentValue: property(rdf.value, schema.optional(schema.node())),
      }
    })),
  }
});

const backwardsShape = schema.object({
  properties: {
    iri: self(schema.node()),
    source: property(oa.hasSource, schema.node()),
    selector: property(oa.hasSelector, schema.union(
      oa.RangeSelector,
      oa.XPathSelector
    )),
    annotations: inverseProperty(oa.hasTarget, schema.set(oa.Annotation)),
  }
});

for (const result of unifyTriplesToShape({rootShape: oa.Annotation, shapes: schema.shapes, triples})) {
  console.log('FOUND oa:Annotation', toJson(result.value));
  console.log('VAR xpath', toJson(result.vars.get(xpathNode)));
}

for (const result of unifyTriplesToShape({rootShape: backwardsShape, shapes: schema.shapes, triples})) {
  console.log('FOUND backwards shape', toJson(result.value));
  console.log('VAR xpath', toJson(result.vars.get(xpathNode)));
}
