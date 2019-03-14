import { Rdf, ShapeBuilder, unifyTriplesToJson } from '../src/index';

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

const xpathPlaceholder = schema.placeholder();

schema.namedObject(oa.XPathSelector, {
  type: schema.determinesType(rdf.type, schema.constant(oa.XPathSelector)),
  xpath: schema.refersTo(rdf.value, xpathPlaceholder),
});

schema.namedObject(oa.RangeSelector, {
  type: schema.determinesType(rdf.type, schema.constant(oa.RangeSelector)),
  start: schema.refersTo(oa.hasStartSelector, oa.XPathSelector),
  end: schema.refersTo(oa.hasEndSelector, oa.XPathSelector),
});

schema.namedObject(oa.Annotation, {
  type: schema.determinesType(rdf.type, schema.constant(oa.Annotation)),
  target: schema.refersTo(oa.hasTarget, schema.object({
    source: schema.refersTo(oa.hasSource, schema.placeholder()),
    selector: schema.refersTo(oa.hasSelector, schema.union(
      oa.RangeSelector,
      oa.XPathSelector
    ))
  })),
  body: schema.refersTo(oa.hasBody, schema.object({
    label: schema.refersTo(rdfs.label, schema.set(schema.placeholder()))
  })),
});

const backwardsShape = schema.object({
  source: schema.refersTo(oa.hasSource, schema.placeholder()),
  selector: schema.refersTo(oa.hasSelector, schema.union(
    oa.RangeSelector,
    oa.XPathSelector
  )),
  annotations: schema.referredFrom(oa.hasTarget, schema.set(schema.placeholder())),
});

for (const result of unifyTriplesToJson({rootShape: oa.Annotation, shapes: schema.shapes, triples})) {
  console.log('FOUND oa:Annotation', JSON.stringify(result.value, null, 2));
}

for (const result of unifyTriplesToJson({rootShape: backwardsShape, shapes: schema.shapes, triples})) {
  console.log('FOUND backwards shape', JSON.stringify(result.value, null, 2));
  console.log('VAR xpath', JSON.stringify(result.vars.get(xpathPlaceholder), null, 2));
}
