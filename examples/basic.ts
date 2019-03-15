import { Rdf, ShapeBuilder, self, property, inverseProperty, unifyTriplesToJson, propertyPath } from '../src/index';

const triples = require('./triples.json');

namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const type = Rdf.iri(NAMESPACE + 'type');
  export const value = Rdf.iri(NAMESPACE + 'value');
}

namespace rdfs {
  export const NAMESPACE = 'http://www.w3.org/2000/01/rdf-schema#';
  export const label = Rdf.iri(NAMESPACE + 'label');
}

namespace oa {
  export const NAMESPACE = 'http://www.w3.org/ns/oa#';
  export const Annotation = Rdf.iri(NAMESPACE + 'Annotation');
  export const RangeSelector = Rdf.iri(NAMESPACE + 'RangeSelector');
  export const XPathSelector = Rdf.iri(NAMESPACE + 'XPathSelector');
  export const hasBody = Rdf.iri(NAMESPACE + 'hasBody');
  export const hasTarget = Rdf.iri(NAMESPACE + 'hasTarget');
  export const hasSource = Rdf.iri(NAMESPACE + 'hasSource');
  export const hasSelector = Rdf.iri(NAMESPACE + 'hasSelector');
  export const hasStartSelector = Rdf.iri(NAMESPACE + 'hasStartSelector');
  export const hasEndSelector = Rdf.iri(NAMESPACE + 'hasEndSelector');
  export const start = Rdf.iri(NAMESPACE + 'start');
  export const end = Rdf.iri(NAMESPACE + 'end');
  export const refinedBy = Rdf.iri(NAMESPACE + 'refinedBy');
}

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

for (const result of unifyTriplesToJson({rootShape: oa.Annotation, shapes: schema.shapes, triples})) {
  console.log('FOUND oa:Annotation', JSON.stringify(result.value, null, 2));
  console.log('VAR xpath', JSON.stringify(result.vars.get(xpathNode), null, 2));
}

for (const result of unifyTriplesToJson({rootShape: backwardsShape, shapes: schema.shapes, triples})) {
  console.log('FOUND backwards shape', JSON.stringify(result.value, null, 2));
  console.log('VAR xpath', JSON.stringify(result.vars.get(xpathNode), null, 2));
}
