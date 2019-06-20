import { ShapeBuilder, property, self } from './builder';
import * as Rdf from './rdf';
import { Shape, Vocabulary } from './shapes';
import { frame } from './frame';
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

const ShapeTypeVocabulary: Vocabulary = {
  terms: {
    'object': ram.ObjectShape,
    'union': ram.UnionShape,
    'set': ram.SetShape,
    'optional': ram.OptionalShape,
    'resource': ram.ResourceShape,
    'literal': ram.LiteralShape,
    'list': ram.ListShape,
    'map': ram.MapShape,
  }
};

schema.object({
  id: ram.ObjectShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ram.ObjectShape, {vocabulary: ShapeTypeVocabulary}
    )),
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
    type: property(rdf.type, schema.constant(
      ram.UnionShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    id: self(ram.ShapeID),
    variants: property(ram.variant, schema.set(ram.ShapeID)),
  }
});

schema.object({
  id: ram.SetShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ram.SetShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    id: self(ram.ShapeID),
    itemShape: property(ram.item, ram.ShapeID),
  }
});

schema.object({
  id: ram.OptionalShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ram.OptionalShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    id: self(ram.ShapeID),
    itemShape: property(ram.item, ram.ShapeID),
  }
});

schema.object({
  id: ram.ResourceShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ram.ResourceShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    id: self(ram.ShapeID),
    value: property(ram.termValue, schema.optional(schema.resource({keepAsTerm: true}))),
    keepAsTerm: property(ram.keepAsTerm, schema.optional(
      schema.literal({datatype: xsd.boolean})
    )),
    vocabulary: property(ram.vocabulary, schema.optional(ram.Vocabulary)),
  }
});

const VocabularyItemKey = schema.literal({datatype: xsd.string});
const VocabularyItemTerm = schema.resource({keepAsTerm: true});
const VocabularyItem = schema.object({
  id: schema.makeShapeID('VocabularyItem'),
  typeProperties: {
    key: property(ram.vocabKey, VocabularyItemKey),
  },
  properties: {
    term: property(ram.termValue, VocabularyItemTerm),
  }
});

schema.object({
  id: ram.Vocabulary,
  properties: {
    terms: property(ram.vocabItem, schema.mapValue(
      {target: VocabularyItemKey},
      {target: VocabularyItemTerm},
      VocabularyItem,
    )),
  }
});

schema.object({
  id: ram.LiteralShape,
  typeProperties: {
    type: property(rdf.type, schema.constant(
      ram.LiteralShape, {vocabulary: ShapeTypeVocabulary}
    )),
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
    type: property(rdf.type, schema.constant(
      ram.ListShape, {vocabulary: ShapeTypeVocabulary}
    )),
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
    type: property(rdf.type, schema.constant(
      ram.MapShape, {vocabulary: ShapeTypeVocabulary}
    )),
  },
  properties: {
    id: self(ram.ShapeID),
    key: property(ram.mapKey, ram.ShapeReference),
    value: property(ram.mapValue, schema.optional(ram.ShapeReference)),
    itemShape: property(ram.item, ram.ShapeID),
  }
});

const TermPartVocabulary: Vocabulary = {
  terms: {
    'datatype': ram.TermDatatype,
    'value': ram.TermValue,
    'language': ram.TermLanguage,
  }
};

schema.object({
  id: ram.ShapeReference,
  properties: {
    target: property(ram.shape, ram.ShapeID),
    part: property(ram.termPart, schema.optional(schema.union(
      schema.constant(ram.TermDatatype, {vocabulary: TermPartVocabulary}),
      schema.constant(ram.TermLanguage, {vocabulary: TermPartVocabulary}),
      schema.constant(ram.TermValue, {vocabulary: TermPartVocabulary}),
    )))
  }
});

export const ShapesForShapes = [Shape, ShapeID, ...schema.shapes];

export function frameShapes(dataset: Rdf.Dataset): Shape[] {
  const framingResults = frame({
    rootShape: ram.Shape,
    shapes: ShapesForShapes,
    dataset,
  });
  const shapes: Shape[] = [];
  for (const {value} of framingResults) {
    shapes.push(value as Shape);
  }
  return shapes;
}
