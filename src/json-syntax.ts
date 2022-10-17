import { ShapeBuilder, property, self } from './builder';
import * as Rdf from './rdf';
import { Shape, Vocabulary } from './shapes';
import { frame } from './frame';
import { rdf, xsd, ramp as rampVocabulary, makeRampVocabulary } from './vocabulary';

export function makeShapesForShapes(factory = Rdf.DefaultDataFactory) {
  const RDF_TYPE = factory.namedNode(rdf.type);
  const XSD_BOOLEAN = factory.namedNode(xsd.boolean);
  const XSD_STRING = factory.namedNode(xsd.string);
  const XSD_INTEGER = factory.namedNode(xsd.integer);
  const ramp = makeRampVocabulary(factory);

  const schema = new ShapeBuilder({factory, blankUniqueKey: 'shapes'});

  const shapeItem = schema.record({
    properties: {
      id: self(ramp.NamespacedName),
      shape: self(ramp.Shape),
    }
  });

  schema.record({
    id: ramp.Module,
    properties: {
      shapes: property(
        ramp.containsShape,
        schema.map({
          key: {target: shapeItem, part: 'value'},
          value: {target: ramp.Shape},
          itemShape: shapeItem,
        })
      )
    }
  });

  schema.anyOf([ramp.ShapeRef, ramp.Shape], {id: ramp.ShapeOrRef});

  schema.record({
    id: ramp.ShapeRef,
    typeProperties: {
      $ref: self(ramp.NamespacedName),
    }
  });

  schema.anyOf([
    ramp.Record,
    ramp.AnyOf,
    ramp.Set,
    ramp.Optional,
    ramp.Resource,
    ramp.Literal,
    ramp.List,
    ramp.Map,
  ], {
    id: ramp.Shape,
  });

  const ShapeTypeVocabulary: Vocabulary = {
    id: ramp.ShapeTypeVocabulary,
    terms: {
      'record': ramp.Record,
      'anyOf': ramp.AnyOf,
      'set': ramp.Set,
      'optional': ramp.Optional,
      'resource': ramp.Resource,
      'literal': ramp.Literal,
      'list': ramp.List,
      'map': ramp.Map,
    }
  };

  const makeBaseProperties = () => ({
    lenient: property(ramp.lenient, schema.optional(
      schema.literal({datatype: XSD_BOOLEAN})
    )),
  });

  schema.record({
    id: ramp.Resource,
    typeProperties: {
      type: property(RDF_TYPE, schema.constant(
        ramp.Resource, {vocabulary: ShapeTypeVocabulary}
      )),
    },
    properties: {
      ...makeBaseProperties(),
      onlyNamed: property(ramp.onlyNamed, schema.optional(
        schema.literal({datatype: XSD_BOOLEAN})
      )),
      value: property(ramp.termValue, schema.optional(schema.resource({keepAsTerm: true}))),
      keepAsTerm: property(ramp.keepAsTerm, schema.optional(
        schema.literal({datatype: XSD_BOOLEAN})
      )),
      vocabulary: property(ramp.vocabulary, schema.optional(ramp.Vocabulary)),
    }
  });

  schema.record({
    id: ramp.Literal,
    typeProperties: {
      type: property(RDF_TYPE, schema.constant(
        ramp.Literal, {vocabulary: ShapeTypeVocabulary}
      )),
    },
    properties: {
      ...makeBaseProperties(),
      datatype: property(ramp.termDatatype, schema.optional(schema.resource({keepAsTerm: true}))),
      language: property(ramp.termLanguage, schema.optional(schema.literal({datatype: XSD_STRING}))),
      value: property(ramp.termValue, schema.optional(schema.literal({keepAsTerm: true}))),
      keepAsTerm: property(ramp.keepAsTerm, schema.optional(
        schema.literal({datatype: XSD_BOOLEAN})
      )),
    }
  });

  schema.record({
    id: ramp.Record,
    typeProperties: {
      type: property(RDF_TYPE, schema.constant(
        ramp.Record, {vocabulary: ShapeTypeVocabulary}
      )),
    },
    properties: {
      ...makeBaseProperties(),
      typeProperties: property(ramp.typeProperty, schema.set(ramp.PropertyName)),
      properties: property(ramp.property, schema.set(ramp.Property)),
      computedProperties: property(ramp.computedProperty,
        schema.set(ramp.ComputedProperty)
      ),
    }
  });

  schema.literal({
    id: ramp.PropertyName,
    datatype: XSD_STRING,
  });

  schema.record({
    id: ramp.Property,
    properties: {
      name: property(ramp.name, schema.literal({datatype: XSD_STRING})),
      path: property(ramp.path, ramp.PropertyPath),
      valueShape: property(ramp.shape, ramp.Shape),
      transient: property(ramp.transient, schema.optional(
        schema.literal({datatype: XSD_BOOLEAN})
      )),
    }
  });

  schema.record({
    id: ramp.ComputedProperty,
    properties: {
      name: property(ramp.name, schema.literal({datatype: XSD_STRING})),
      valueShape: property(ramp.shape, ramp.Shape),
    }
  });

  schema.anyOf([
    ramp.PredicatePath,
    ramp.SequencePath,
    ramp.InversePath,
    ramp.AlternativePath,
    ramp.ZeroOrMorePath,
    ramp.ZeroOrOnePath,
    ramp.OneOrMorePath,
  ], {
    id: ramp.PropertyPath,
  });

  const PropertyPathTypeVocabulary: Vocabulary = {
    id: ramp.PropertyPathVocabulary,
    terms: {
      'predicate': ramp.PredicatePath,
      'sequence': ramp.SequencePath,
      'inverse': ramp.InversePath,
      'alternative': ramp.AlternativePath,
      'zeroOrMore': ramp.ZeroOrMorePath,
      'zeroOrOne': ramp.ZeroOrOnePath,
      'oneOrMore': ramp.OneOrMorePath,
    }
  };

  schema.record({
    id: ramp.PredicatePath,
    properties: {
      predicate: self(schema.resource({onlyNamed: true, keepAsTerm: true})),
      // negative properties to exclude other property path types
      exclude: self(
        schema.set(
          schema.anyOf([
            ramp.SequencePath,
            ramp.InversePath,
            ramp.AlternativePath,
            ramp.ZeroOrMorePath,
            ramp.ZeroOrOnePath,
            ramp.OneOrMorePath,
          ], {lenient: true}),
          {maxCount: 0}
        ),
        {transient: true}
      ),
    },
    computedProperties: {
      type: schema.constant(
        ramp.PredicatePath,
        {vocabulary: PropertyPathTypeVocabulary}
      ),
    }
  });

  schema.record({
    id: ramp.SequencePath,
    properties: {
      sequence: self(schema.list(ramp.PropertyPath)),
    },
    computedProperties: {
      type: schema.constant(
        ramp.SequencePath,
        {vocabulary: PropertyPathTypeVocabulary}
      ),
    }
  });

  schema.record({
    id: ramp.InversePath,
    properties: {
      inverse: property(ramp.inversePath, ramp.PropertyPath),
    },
    computedProperties: {
      type: schema.constant(
        ramp.InversePath,
        {vocabulary: PropertyPathTypeVocabulary}
      ),
    }
  });

  schema.record({
    id: ramp.AlternativePath,
    properties: {
      alternatives: property(ramp.alternativePath, schema.list(ramp.PropertyPath)),
    },
    computedProperties: {
      type: schema.constant(
        ramp.AlternativePath,
        {vocabulary: PropertyPathTypeVocabulary}
      ),
    }
  });

  schema.record({
    id: ramp.ZeroOrMorePath,
    properties: {
      zeroOrMore: property(ramp.zeroOrMorePath, ramp.PropertyPath),
    },
    computedProperties: {
      type: schema.constant(
        ramp.ZeroOrMorePath,
        {vocabulary: PropertyPathTypeVocabulary}
      ),
    }
  });

  schema.record({
    id: ramp.ZeroOrOnePath,
    properties: {
      zeroOrOne: property(ramp.zeroOrOnePath, ramp.PropertyPath),
    },
    computedProperties: {
      type: schema.constant(
        ramp.ZeroOrOnePath,
        {vocabulary: PropertyPathTypeVocabulary}
      ),
    }
  });

  schema.record({
    id: ramp.OneOrMorePath,
    properties: {
      oneOrMore: property(ramp.oneOrMorePath, ramp.PropertyPath),
    },
    computedProperties: {
      type: schema.constant(
        ramp.OneOrMorePath,
        {vocabulary: PropertyPathTypeVocabulary}
      ),
    }
  });

  schema.record({
    id: ramp.AnyOf,
    typeProperties: {
      type: property(RDF_TYPE, schema.constant(
        ramp.AnyOf, {vocabulary: ShapeTypeVocabulary}
      )),
    },
    properties: {
      ...makeBaseProperties(),
      variants: property(ramp.variant, schema.set(ramp.Shape)),
    }
  });

  schema.record({
    id: ramp.Set,
    typeProperties: {
      type: property(RDF_TYPE, schema.constant(
        ramp.Set, {vocabulary: ShapeTypeVocabulary}
      )),
    },
    properties: {
      ...makeBaseProperties(),
      itemShape: property(ramp.item, ramp.Shape),
      minCount: property(ramp.minCount, schema.optional(
        schema.literal({datatype: XSD_INTEGER})
      )),
      maxCount: property(ramp.maxCount, schema.optional(
        schema.literal({datatype: XSD_INTEGER})
      )),
    }
  });

  schema.record({
    id: ramp.Optional,
    typeProperties: {
      type: property(RDF_TYPE, schema.constant(
        ramp.Optional, {vocabulary: ShapeTypeVocabulary}
      )),
    },
    properties: {
      ...makeBaseProperties(),
      itemShape: property(ramp.item, ramp.Shape),
    }
  });

  schema.record({
    id: ramp.List,
    typeProperties: {
      type: property(RDF_TYPE, schema.constant(
        ramp.List, {vocabulary: ShapeTypeVocabulary}
      )),
    },
    properties: {
      ...makeBaseProperties(),
      itemShape: property(ramp.item, ramp.Shape),
      headPath: property(ramp.headPath, schema.optional(ramp.PropertyPath)),
      tailPath: property(ramp.tailPath, schema.optional(ramp.PropertyPath)),
      nil: property(ramp.nil, schema.optional(schema.resource({keepAsTerm: true}))),
    }
  });

  schema.record({
    id: ramp.Map,
    typeProperties: {
      type: property(RDF_TYPE, schema.constant(
        ramp.Map, {vocabulary: ShapeTypeVocabulary}
      )),
    },
    properties: {
      ...makeBaseProperties(),
      key: property(ramp.mapKey, ramp.ShapeReference),
      value: property(ramp.mapValue, schema.optional(ramp.ShapeReference)),
      itemShape: property(ramp.item, ramp.Shape),
    }
  });

  const TermPartVocabulary: Vocabulary = {
    id: ramp.TermPartVocabulary,
    terms: {
      'datatype': ramp.TermDatatype,
      'value': ramp.TermValue,
      'language': ramp.TermLanguage,
    }
  };

  schema.record({
    id: ramp.ShapeReference,
    properties: {
      target: property(ramp.shape, ramp.Shape),
      part: property(ramp.termPart, schema.optional(schema.anyOf([
        schema.constant(ramp.TermDatatype, {vocabulary: TermPartVocabulary}),
        schema.constant(ramp.TermLanguage, {vocabulary: TermPartVocabulary}),
        schema.constant(ramp.TermValue, {vocabulary: TermPartVocabulary}),
      ])))
    }
  });

  const VocabularyItemKey = schema.literal({datatype: XSD_STRING});
  const VocabularyItemTerm = schema.resource({keepAsTerm: true});
  const VocabularyItem = schema.record({
    id: schema.makeShapeID('VocabularyItem'),
    typeProperties: {
      key: property(ramp.vocabKey, VocabularyItemKey),
    },
    properties: {
      term: property(ramp.termValue, VocabularyItemTerm),
    }
  });

  schema.record({
    id: ramp.Vocabulary,
    properties: {
      id: self(schema.optional(schema.resource())),
      terms: property(ramp.vocabItem, schema.map({
        key: {target: VocabularyItemKey},
        value: {target: VocabularyItemTerm},
        itemShape: VocabularyItem,
      })),
    }
  });

  return schema.shapes;
}
