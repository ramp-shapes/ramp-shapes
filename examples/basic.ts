import { Rdf, ShapeBuilder, field, reverseField, unifyTriplesToJson } from '../src/index';

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
}

const schema = new ShapeBuilder();

const xpathNode = schema.node();

schema.object({
  id: oa.XPathSelector,
  typeFields: {
    type: field(rdf.type, schema.constant(oa.XPathSelector)),
  },
  fields: {
    xpath: field(rdf.value, xpathNode),
  }
});

schema.object({
  id: oa.RangeSelector,
  typeFields: {
    type: field(rdf.type, schema.constant(oa.RangeSelector)),
  },
  fields: {
    start: field(oa.hasStartSelector, oa.XPathSelector),
    end: field(oa.hasEndSelector, oa.XPathSelector),
  }
});

schema.object({
  id: oa.Annotation,
  typeFields: {
    type: field(rdf.type, schema.constant(oa.Annotation)),
  },
  fields: {
    target: field(oa.hasTarget, schema.object({
      fields: {
        type: field(rdf.type, schema.optional(schema.node())),
        source: field(oa.hasSource, schema.node()),
        selector: field(oa.hasSelector, schema.union(
          oa.RangeSelector,
          oa.XPathSelector
        ))
      }
    })),
    body: field(oa.hasBody, schema.object({
      fields: {
        label: field(rdfs.label, schema.set(schema.node())),
        nonExistentValue: field(rdf.value, schema.optional(schema.node())),
      }
    })),
  }
});

const backwardsShape = schema.object({
  fields: {
    source: field(oa.hasSource, schema.node()),
    selector: field(oa.hasSelector, schema.union(
      oa.RangeSelector,
      oa.XPathSelector
    )),
    annotations: reverseField(oa.hasTarget, schema.set(oa.Annotation)),
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
