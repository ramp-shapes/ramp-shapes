import { ShapeBuilder, property, self } from './builder';
import * as Rdf from './rdf';
import { Shape, Vocabulary } from './shapes';
import { frame } from './frame';
import { rdf, ramp, xsd } from './vocabulary';

const schema = new ShapeBuilder({blankUniqueKey: 'shapes'});

schema.union([
  ramp.ObjectShape,
  ramp.UnionShape,
  ramp.SetShape,
  ramp.OptionalShape,
  ramp.ResourceShape,
  ramp.LiteralShape,
  ramp.ListShape,
  ramp.MapShape,
], {
  id: ramp.Shape,
});

schema.resource({
  id: ramp.ShapeID,
  keepAsTerm: true,
});

const ShapeTypeVocabulary: Vocabulary = {
  terms: {
    'object': ramp.ObjectShape,
    'union': ramp.UnionShape,
    'set': ramp.SetShape,
    'optional': ramp.OptionalShape,
    'resource': ramp.ResourceShape,
    'literal': ramp.LiteralShape,
    'list': ramp.ListShape,
    'map': ramp.MapShape,
  }
};

const baseProperties = {
  id: self(ramp.ShapeID),
  lenient: property(ramp.lenient, schema.optional(
    schema.literal({datatype: xsd.boolean})
  )),
};

schema.object({
  id: ramp.ObjectShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ramp.ObjectShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    ...baseProperties,
    typeProperties: property(ramp.typeProperty, schema.set(ramp.ObjectProperty)),
    properties: property(ramp.property, schema.set(ramp.ObjectProperty)),
  }
});

schema.object({
  id: ramp.ObjectProperty,
  properties: {
    name: property(ramp.name, schema.literal({datatype: xsd.string})),
    path: property(ramp.path, ramp.PathSequence),
    valueShape: property(ramp.shape, ramp.ShapeID),
  }
});

schema.list(ramp.PathElement, {
  id: ramp.PathSequence,
});

schema.union([ramp.PathExpression, ramp.PathSegment], {
  id: ramp.PathElement,
});

schema.object({
  id: ramp.PathExpression,
  typeProperties: {
    operator: property(ramp.operator, schema.union([
      schema.constant(Rdf.literal('|')),
      schema.constant(Rdf.literal('^')),
      schema.constant(Rdf.literal('*')),
      schema.constant(Rdf.literal('+')),
      schema.constant(Rdf.literal('?')),
      schema.constant(Rdf.literal('!')),
    ])),
  },
  properties: {
    path: property(ramp.path, ramp.PathSequence),
  }
});

schema.object({
  id: ramp.PathSegment,
  typeProperties: {
    predicate: property(ramp.predicate, schema.resource({keepAsTerm: true})),
  }
});

schema.object({
  id: ramp.UnionShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ramp.UnionShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    ...baseProperties,
    variants: property(ramp.variant, schema.set(ramp.ShapeID)),
  }
});

schema.object({
  id: ramp.SetShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ramp.SetShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    ...baseProperties,
    itemShape: property(ramp.item, ramp.ShapeID),
  }
});

schema.object({
  id: ramp.OptionalShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ramp.OptionalShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    ...baseProperties,
    itemShape: property(ramp.item, ramp.ShapeID),
  }
});

schema.object({
  id: ramp.ResourceShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ramp.ResourceShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    ...baseProperties,
    value: property(ramp.termValue, schema.optional(schema.resource({keepAsTerm: true}))),
    keepAsTerm: property(ramp.keepAsTerm, schema.optional(
      schema.literal({datatype: xsd.boolean})
    )),
    vocabulary: property(ramp.vocabulary, schema.optional(ramp.Vocabulary)),
  }
});

const VocabularyItemKey = schema.literal({datatype: xsd.string});
const VocabularyItemTerm = schema.resource({keepAsTerm: true});
const VocabularyItem = schema.object({
  id: schema.makeShapeID('VocabularyItem'),
  typeProperties: {
    key: property(ramp.vocabKey, VocabularyItemKey),
  },
  properties: {
    term: property(ramp.termValue, VocabularyItemTerm),
  }
});

schema.object({
  id: ramp.Vocabulary,
  properties: {
    terms: property(ramp.vocabItem, schema.map({
      key: {target: VocabularyItemKey},
      value: {target: VocabularyItemTerm},
      itemShape: VocabularyItem,
    })),
  }
});

schema.object({
  id: ramp.LiteralShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ramp.LiteralShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    ...baseProperties,
    datatype: property(ramp.termDatatype, schema.optional(schema.resource({keepAsTerm: true}))),
    language: property(ramp.termLanguage, schema.optional(schema.literal({datatype: xsd.string}))),
    value: property(ramp.termValue, schema.optional(schema.literal({keepAsTerm: true}))),
    keepAsTerm: property(ramp.keepAsTerm, schema.optional(
      schema.literal({datatype: xsd.boolean})
    )),
  }
});

schema.object({
  id: ramp.ListShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ramp.ListShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    ...baseProperties,
    itemShape: property(ramp.item, ramp.ShapeID),
    headPath: property(ramp.headPath, schema.optional(ramp.PathSequence)),
    tailPath: property(ramp.tailPath, schema.optional(ramp.PathSequence)),
    nil: property(ramp.nil, schema.optional(schema.resource({keepAsTerm: true}))),
  }
});

schema.object({
  id: ramp.MapShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ramp.MapShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    ...baseProperties,
    key: property(ramp.mapKey, ramp.ShapeReference),
    value: property(ramp.mapValue, schema.optional(ramp.ShapeReference)),
    itemShape: property(ramp.item, ramp.ShapeID),
  }
});

const TermPartVocabulary: Vocabulary = {
  terms: {
    'datatype': ramp.TermDatatype,
    'value': ramp.TermValue,
    'language': ramp.TermLanguage,
  }
};

schema.object({
  id: ramp.ShapeReference,
  properties: {
    target: property(ramp.shape, ramp.ShapeID),
    part: property(ramp.termPart, schema.optional(schema.union([
      schema.constant(ramp.TermDatatype, {vocabulary: TermPartVocabulary}),
      schema.constant(ramp.TermLanguage, {vocabulary: TermPartVocabulary}),
      schema.constant(ramp.TermValue, {vocabulary: TermPartVocabulary}),
    ])))
  }
});

export const ShapesForShapes = [...schema.shapes];

export function frameShapes(dataset: Rdf.Dataset): Shape[] {
  const framingResults = frame({
    rootShape: ramp.Shape,
    shapes: ShapesForShapes,
    dataset,
  });
  const shapes: Shape[] = [];
  for (const {value} of framingResults) {
    shapes.push(value as Shape);
  }
  return shapes;
}
