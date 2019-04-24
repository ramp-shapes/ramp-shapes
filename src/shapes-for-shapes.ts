import { ShapeBuilder, property, self } from './builder';
import * as Rdf from './rdf-model';
import { Shape } from './shapes';
import { rdf, rxj, xsd } from './vocabulary';

const schema = new ShapeBuilder({blankUniqueKey: 'shapes'});

const Shape: Shape = {
  type: 'union',
  id: rxj.Shape,
  variants: [
    rxj.ObjectShape,
    rxj.UnionShape,
    rxj.SetShape,
    rxj.OptionalShape,
    rxj.ResourceShape,
    rxj.LiteralShape,
    rxj.ListShape,
    rxj.MapShape,
  ]
};

const ShapeID: Shape = {
  type: 'resource',
  id: rxj.ShapeID,
  keepAsTerm: true,
};

schema.object({
  id: rxj.ObjectShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(rxj.ObjectShape)),
  },
  properties: {
    id: self(rxj.ShapeID),
    typeProperties: property(rxj.typeProperty, schema.set(rxj.ObjectProperty)),
    properties: property(rxj.property, schema.set(rxj.ObjectProperty)),
  }
});

schema.object({
  id: rxj.ObjectProperty,
  properties: {
    name: property(rxj.name, schema.literal({datatype: xsd.string})),
    path: property(rxj.path, schema.list(rxj.PropertyPathSegment)),
    valueShape: property(rxj.shape, rxj.ShapeID),
  }
});

schema.object({
  id: rxj.PropertyPathSegment,
  typeProperties: {
    predicate: property(rxj.predicate, schema.resource({keepAsTerm: true})),
  },
  properties: {
    inverse: property(rxj.inverse, schema.optional(schema.literal({datatype: xsd.boolean}))),
  }
});

schema.object({
  id: rxj.UnionShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(rxj.UnionShape)),
  },
  properties: {
    id: self(rxj.ShapeID),
    variants: property(rxj.variant, schema.set(rxj.ShapeID)),
  }
});

schema.object({
  id: rxj.SetShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(rxj.SetShape)),
  },
  properties: {
    id: self(rxj.ShapeID),
    itemShape: property(rxj.item, rxj.ShapeID),
  }
});

schema.object({
  id: rxj.OptionalShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(rxj.OptionalShape)),
  },
  properties: {
    id: self(rxj.ShapeID),
    itemShape: property(rxj.item, rxj.ShapeID),
  }
});

schema.object({
  id: rxj.ResourceShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(rxj.ResourceShape)),
  },
  properties: {
    id: self(rxj.ShapeID),
    value: property(rxj.termValue, schema.optional(schema.resource({keepAsTerm: true}))),
    keepAsTerm: property(rxj.keepAsTerm, schema.optional(
      schema.literal({datatype: xsd.boolean})
    )),
  }
});

schema.object({
  id: rxj.LiteralShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(rxj.LiteralShape)),
  },
  properties: {
    id: self(rxj.ShapeID),
    datatype: property(rxj.termDatatype, schema.optional(schema.resource({keepAsTerm: true}))),
    language: property(rxj.termLanguage, schema.optional(schema.literal({datatype: xsd.string}))),
    value: property(rxj.termValue, schema.optional(schema.literal({keepAsTerm: true}))),
  }
});

schema.object({
  id: rxj.ListShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(rxj.ListShape)),
  },
  properties: {
    id: self(rxj.ShapeID),
    itemShape: property(rxj.item, rxj.ShapeID),
    headPath: property(rxj.headPath, schema.optional(schema.list(rxj.PropertyPathSegment))),
    tailPath: property(rxj.tailPath, schema.optional(schema.list(rxj.PropertyPathSegment))),
    nil: property(rxj.nil, schema.optional(schema.resource({keepAsTerm: true}))),
  }
});

schema.object({
  id: rxj.MapShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(rxj.MapShape)),
  },
  properties: {
    id: self(rxj.ShapeID),
    key: property(rxj.key, rxj.ShapeReference),
    itemShape: property(rxj.item, rxj.ShapeID),
  }
});

schema.object({
  id: rxj.ShapeReference,
  properties: {
    target: property(rxj.shape, rxj.ShapeID),
    part: property(rxj.termPart, schema.optional(schema.union(
      schema.constant(Rdf.literal("value")),
      schema.constant(Rdf.literal("datatype")),
      schema.constant(Rdf.literal("language"))
    )))
  }
});

export const ShapesForShapes = [Shape, ShapeID, ...schema.shapes];
