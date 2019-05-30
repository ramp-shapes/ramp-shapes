import { ShapeBuilder, property, self } from './builder';
import * as Rdf from './rdf-model';
import { Shape } from './shapes';
import { FrameTypeHandler, frame } from './frame';
import { rdf, ram, xsd } from './vocabulary';

const schema = new ShapeBuilder({blankUniqueKey: 'shapes'});

const Shape: Shape = {
  type: 'union',
  id: ram.Shape,
  variants: [
    ram.ObjectShape,
    ram.UnionShape,
    ram.SetShape,
    ram.OptionalShape,
    ram.ResourceShape,
    ram.LiteralShape,
    ram.ListShape,
    ram.MapShape,
  ]
};

const ShapeID: Shape = {
  type: 'resource',
  id: ram.ShapeID,
  keepAsTerm: true,
};

schema.object({
  id: ram.ObjectShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(ram.ObjectShape)),
  },
  properties: {
    id: self(ram.ShapeID),
    typeProperties: property(ram.typeProperty, schema.set(ram.ObjectProperty)),
    properties: property(ram.property, schema.set(ram.ObjectProperty)),
  }
});

schema.object({
  id: ram.ObjectProperty,
  properties: {
    name: property(ram.name, schema.literal({datatype: xsd.string})),
    path: property(ram.path, schema.list(ram.PropertyPathSegment)),
    valueShape: property(ram.shape, ram.ShapeID),
  }
});

schema.object({
  id: ram.PropertyPathSegment,
  typeProperties: {
    predicate: property(ram.predicate, schema.resource({keepAsTerm: true})),
  },
  properties: {
    inverse: property(ram.inverse, schema.optional(schema.literal({datatype: xsd.boolean}))),
  }
});

schema.object({
  id: ram.UnionShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(ram.UnionShape)),
  },
  properties: {
    id: self(ram.ShapeID),
    variants: property(ram.variant, schema.set(ram.ShapeID)),
  }
});

schema.object({
  id: ram.SetShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(ram.SetShape)),
  },
  properties: {
    id: self(ram.ShapeID),
    itemShape: property(ram.item, ram.ShapeID),
  }
});

schema.object({
  id: ram.OptionalShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(ram.OptionalShape)),
  },
  properties: {
    id: self(ram.ShapeID),
    itemShape: property(ram.item, ram.ShapeID),
  }
});

schema.object({
  id: ram.ResourceShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(ram.ResourceShape)),
  },
  properties: {
    id: self(ram.ShapeID),
    value: property(ram.termValue, schema.optional(schema.resource({keepAsTerm: true}))),
    keepAsTerm: property(ram.keepAsTerm, schema.optional(
      schema.literal({datatype: xsd.boolean})
    )),
  }
});

schema.object({
  id: ram.LiteralShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(ram.LiteralShape)),
  },
  properties: {
    id: self(ram.ShapeID),
    datatype: property(ram.termDatatype, schema.optional(schema.resource({keepAsTerm: true}))),
    language: property(ram.termLanguage, schema.optional(schema.literal({datatype: xsd.string}))),
    value: property(ram.termValue, schema.optional(schema.literal({keepAsTerm: true}))),
    keepAsTerm: property(ram.keepAsTerm, schema.optional(
      schema.literal({datatype: xsd.boolean})
    )),
  }
});

schema.object({
  id: ram.ListShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(ram.ListShape)),
  },
  properties: {
    id: self(ram.ShapeID),
    itemShape: property(ram.item, ram.ShapeID),
    headPath: property(ram.headPath, schema.optional(schema.list(ram.PropertyPathSegment))),
    tailPath: property(ram.tailPath, schema.optional(schema.list(ram.PropertyPathSegment))),
    nil: property(ram.nil, schema.optional(schema.resource({keepAsTerm: true}))),
  }
});

schema.object({
  id: ram.MapShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(ram.MapShape)),
  },
  properties: {
    id: self(ram.ShapeID),
    key: property(ram.key, ram.ShapeReference),
    itemShape: property(ram.item, ram.ShapeID),
  }
});

schema.object({
  id: ram.ShapeReference,
  properties: {
    target: property(ram.shape, ram.ShapeID),
    part: property(ram.termPart, schema.optional(schema.union(
      schema.constant(Rdf.literal("value")),
      schema.constant(Rdf.literal("datatype")),
      schema.constant(Rdf.literal("language"))
    )))
  }
});

export const ShapesForShapes = [Shape, ShapeID, ...schema.shapes];

const convertShapeType: FrameTypeHandler = (value, shape) => {
  if (shape.type === 'resource') {
    const term = value as Rdf.Term;
    if (term.termType === 'NamedNode') {
      switch (term.value) {
        case ram.ObjectShape.value: return 'object';
        case ram.UnionShape.value: return 'union';
        case ram.SetShape.value: return 'set';
        case ram.OptionalShape.value: return 'optional';
        case ram.ResourceShape.value: return 'resource';
        case ram.LiteralShape.value: return 'literal';
        case ram.ListShape.value: return 'list';
        case ram.MapShape.value: return 'map';
      }
    }
  }
  return FrameTypeHandler.convertToNativeType(value, shape);
};

export function frameShapes(graph: ReadonlyArray<Rdf.Quad>): Shape[] {
  const framingResults = frame({
    rootShape: ram.Shape,
    shapes: ShapesForShapes,
    triples: graph,
    convertType: convertShapeType,
  });
  const shapes: Shape[] = [];
  for (const {value} of framingResults) {
    shapes.push(value as Shape);
  }
  return shapes;
}
