import { Shape, unifyTriplesToShape } from '../src/index';

const triples = require('./triples.json');

namespace rdf {
  export const NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
  export const type = Shape.iri(NAMESPACE + 'type');
  export const value = Shape.iri(NAMESPACE + 'value');
}

namespace rdfs {
  export const NAMESPACE = 'http://www.w3.org/2000/01/rdf-schema#';
  export const label = Shape.iri(NAMESPACE + 'label');
}

namespace oa {
  export const NAMESPACE = 'http://www.w3.org/ns/oa#';
  export const Annotation = Shape.iri(NAMESPACE + 'Annotation');
  export const RangeSelector = Shape.iri(NAMESPACE + 'RangeSelector');
  export const XPathSelector = Shape.iri(NAMESPACE + 'XPathSelector');
  export const hasBody = Shape.iri(NAMESPACE + 'hasBody');
  export const hasTarget = Shape.iri(NAMESPACE + 'hasTarget');
  export const hasStartSelector = Shape.iri(NAMESPACE + 'hasStartSelector');
  export const hasEndSelector = Shape.iri(NAMESPACE + 'hasEndSelector');
  export const start = Shape.iri(NAMESPACE + 'start');
  export const end = Shape.iri(NAMESPACE + 'end');
}

const xpathSelectorShape = Shape.object({
  type: Shape.refersTo(rdf.type, Shape.constant(oa.XPathSelector)),
  xpath: Shape.refersTo(rdf.value, Shape.placeholder()),
});

const rangeSelectorShape = Shape.object({
  type: Shape.refersTo(rdf.type, Shape.constant(oa.RangeSelector)),
  start: Shape.refersTo(oa.hasStartSelector, xpathSelectorShape),
  end: Shape.refersTo(oa.hasEndSelector, xpathSelectorShape),
});

const annotationShape = Shape.object({
  type: Shape.refersTo(rdf.type, Shape.constant(oa.Annotation)),
  target: Shape.refersTo(oa.hasTarget, Shape.oneOf(rangeSelectorShape, xpathSelectorShape)),
  body: Shape.refersTo(oa.hasBody, Shape.object({
    label: Shape.refersTo(rdfs.label, Shape.placeholder())
  })),
});

const result = unifyTriplesToShape(triples, annotationShape);
