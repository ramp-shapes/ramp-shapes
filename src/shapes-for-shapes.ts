import { DatasetCore } from '@rdfjs/types';

import { DefaultDataFactory } from './rdf/rdf-model.js';
import { ShapeBuilder, property, self, definesType, computedProperty } from './builder.js';
import {
  Shape, TypedShape, TypedShapeID,
  RecordShape, FieldProperty, TransientProperty, ComputedProperty, PropertyPath,
  PredicatePath, SequencePath, InversePath, AlternativePath, ZeroOrMorePath, ZeroOrOnePath, OneOrMorePath,
  AnyOfShape, SetShape, OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape,
  ShapeReference, Vocabulary, ValueMapper, NamedMapper, Match, typedShapeID,
} from './shapes.js';
import { frame } from './frame.js';
import { mapAsBoolean, mapAsNumber, mapAsString, mapAsTerm } from './mappers.js';
import { rdf, xsd, ramp as rampVocabulary, makeRampVocabulary } from './vocabulary.js';

export function makeShapesForShapes(factory = DefaultDataFactory) {
  const RDF_TYPE = factory.namedNode(rdf.type);
  const XSD_BOOLEAN = factory.namedNode(xsd.boolean);
  const XSD_STRING = factory.namedNode(xsd.string);
  const XSD_INTEGER = factory.namedNode(xsd.integer);
  const {ramp, rampjs} = makeRampVocabulary(factory);

  const schema = new ShapeBuilder({factory, blankUniqueKey: 'shapes'});

  const Shape: TypedShapeID<Shape> = schema.anyOf([
    typedShapeID(ramp.Record),
    typedShapeID(ramp.AnyOf),
    typedShapeID(ramp.Set),
    typedShapeID(ramp.Optional),
    typedShapeID(ramp.Resource),
    typedShapeID(ramp.Literal),
    typedShapeID(ramp.List),
    typedShapeID(ramp.Map),
  ], {
    id: ramp.Shape,
  });

  const ShapeID = schema.resourceTerm({id: ramp.ShapeID});

  const ShapeTypeVocabulary = schema.vocabulary({
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
  });

  const PropertyKindVocabulary = schema.vocabulary({
    id: ramp.PropertyKindVocabulary,
    terms: {
      'field': ramp.FieldProperty,
      'transient': ramp.TransientProperty,
      'computed': ramp.ComputedProperty,
    },
  });

  const makeBaseProperties = () => ({
    id: self(ShapeID),
    lenient: property(ramp.lenient, schema.optional(
      schema.literal({datatype: XSD_BOOLEAN, mapper: mapAsBoolean(factory)})
    )),
    mapper: property(rampjs.mapper, schema.optional(
      typedShapeID<ValueMapper<unknown, unknown>>(rampjs.Mapper)
    )),
  });

  schema.readonlyRecord<RecordShape>({
    id: ramp.Record,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('record', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      typeProperties: property(ramp.typeProperty, schema.set(schema.anyOf([
        typedShapeID(ramp.FieldProperty),
        typedShapeID(ramp.TransientProperty),
      ]))),
      properties: property(ramp.property, schema.set(schema.anyOf([
        typedShapeID(ramp.FieldProperty),
        typedShapeID(ramp.TransientProperty),
      ]))),
      computedProperties: property(ramp.computedProperty,
        schema.set(typedShapeID(ramp.ComputedProperty))
      ),
    }
  });

  schema.readonlyRecord<FieldProperty>({
    id: ramp.FieldProperty,
    properties: {
      kind: computedProperty(schema.fromVocabulary('field', PropertyKindVocabulary)),
      name: property(ramp.name, schema.literal({datatype: XSD_STRING})),
      path: property(ramp.path, typedShapeID<PropertyPath>(ramp.PropertyPath)),
      valueShape: property(ramp.shape, Shape),
    },
    transients: [
      definesType(
        property(RDF_TYPE, schema.anyOf([
          schema.set(
            schema.anyOf([
              schema.constant(ramp.TransientProperty),
              schema.constant(ramp.ComputedProperty),
            ]),
            {maxCount: 0}
          ),
          schema.constant(ramp.FieldProperty),
        ]))
      ),
    ],
  });

  schema.readonlyRecord<TransientProperty>({
    id: ramp.TransientProperty,
    properties: {
      kind: definesType(
        property(RDF_TYPE, schema.fromVocabulary('transient', PropertyKindVocabulary))
      ),
      path: property(ramp.path, typedShapeID<PropertyPath>(ramp.PropertyPath)),
      valueShape: property(ramp.shape, Shape),
    },
  });

  schema.readonlyRecord<ComputedProperty>({
    id: ramp.ComputedProperty,
    properties: {
      kind: computedProperty(schema.fromVocabulary('computed', PropertyKindVocabulary)),
      name: property(ramp.name, schema.literal({datatype: XSD_STRING})),
      valueShape: property(ramp.shape, Shape),
    },
    transients: [
      definesType(
        property(RDF_TYPE, schema.optional(schema.constant(ramp.ComputedProperty)))
      ),
    ],
  });

  const PropertyPath: TypedShapeID<PropertyPath> = schema.anyOf([
    typedShapeID(ramp.PredicatePath),
    typedShapeID(ramp.SequencePath),
    typedShapeID(ramp.InversePath),
    typedShapeID(ramp.AlternativePath),
    typedShapeID(ramp.ZeroOrMorePath),
    typedShapeID(ramp.ZeroOrOnePath),
    typedShapeID(ramp.OneOrMorePath),
  ], {
    id: ramp.PropertyPath,
  });

  const PropertyPathTypeVocabulary = schema.vocabulary({
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
  });

  schema.readonlyRecord<PredicatePath>({
    id: ramp.PredicatePath,
    properties: {
      predicate: self(schema.namedNodeTerm()),
      type: computedProperty(
        schema.fromVocabulary('predicate', PropertyPathTypeVocabulary)
      ),
    },
    transients: [
      // negative properties to exclude other property path types
      self(
        schema.set(
          schema.anyOf<TypedShapeID<any>[]>([
            typedShapeID(ramp.SequencePath),
            typedShapeID(ramp.InversePath),
            typedShapeID(ramp.AlternativePath),
            typedShapeID(ramp.ZeroOrMorePath),
            typedShapeID(ramp.ZeroOrOnePath),
            typedShapeID(ramp.OneOrMorePath),
          ], {lenient: true}),
          {maxCount: 0}
        )
      )
    ],
  });

  schema.record<SequencePath>({
    id: ramp.SequencePath,
    properties: {
      sequence: self(schema.list(PropertyPath)),
      type: computedProperty(
        schema.fromVocabulary('sequence', PropertyPathTypeVocabulary)
      ),
    }
  });

  schema.record<InversePath>({
    id: ramp.InversePath,
    properties: {
      inverse: property(ramp.inversePath, PropertyPath),
      type: computedProperty(
        schema.fromVocabulary('inverse', PropertyPathTypeVocabulary)
      ),
    }
  });

  schema.record<AlternativePath>({
    id: ramp.AlternativePath,
    properties: {
      alternatives: property(ramp.alternativePath, schema.list(PropertyPath)),
      type: computedProperty(
        schema.fromVocabulary('alternative', PropertyPathTypeVocabulary)
      ),
    }
  });

  schema.record<ZeroOrMorePath>({
    id: ramp.ZeroOrMorePath,
    properties: {
      zeroOrMore: property(ramp.zeroOrMorePath, PropertyPath),
      type: computedProperty(
        schema.fromVocabulary('zeroOrMore', PropertyPathTypeVocabulary)
      ),
    }
  });

  schema.record<ZeroOrOnePath>({
    id: ramp.ZeroOrOnePath,
    properties: {
      zeroOrOne: property(ramp.zeroOrOnePath, PropertyPath),
      type: computedProperty(
        schema.fromVocabulary('zeroOrOne', PropertyPathTypeVocabulary)
      ),
    }
  });

  schema.record<OneOrMorePath>({
    id: ramp.OneOrMorePath,
    properties: {
      oneOrMore: property(ramp.oneOrMorePath, PropertyPath),
      type: computedProperty(
        schema.fromVocabulary('oneOrMore', PropertyPathTypeVocabulary)
      ),
    }
  });

  schema.record<AnyOfShape>({
    id: ramp.AnyOf,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('anyOf', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      variants: property(ramp.variant, schema.set(Shape)),
    }
  });

  schema.record<SetShape>({
    id: ramp.Set,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('set', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      itemShape: property(ramp.item, Shape),
      minCount: property(ramp.minCount, schema.optional(
        schema.literal({
          datatype: XSD_INTEGER,
          mapper: mapAsNumber(factory),
        })
      )),
      maxCount: property(ramp.maxCount, schema.optional(
        schema.literal({
          datatype: XSD_INTEGER,
          mapper: mapAsNumber(factory),
        })
      )),
    }
  });

  schema.record<OptionalShape>({
    id: ramp.Optional,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('optional', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      itemShape: property(ramp.item, Shape),
    }
  });

  schema.record<ResourceShape>({
    id: ramp.Resource,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('resource', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      onlyNamed: property(ramp.onlyNamed, schema.optional(
        schema.literal({
          datatype: XSD_BOOLEAN,
          mapper: mapAsBoolean(factory),
        })
      )),
      value: property(ramp.termValue, schema.optional(schema.resourceTerm())),
      vocabulary: property(ramp.vocabulary, schema.optional(
        typedShapeID(ramp.Vocabulary)
      )),
    }
  });

  const VocabularyItemKey = schema.literal({datatype: XSD_STRING});
  const VocabularyItemTerm = schema.namedNodeTerm();
  const VocabularyItem = schema.record({
    id: schema.makeShapeID('VocabularyItem'),
    properties: {
      key: definesType(
        property(ramp.vocabKey, VocabularyItemKey)
      ),
      term: property(ramp.termValue, VocabularyItemTerm),
    }
  });

  schema.record<Vocabulary>({
    id: ramp.Vocabulary,
    properties: {
      id: self(schema.optional(schema.resourceTerm())),
      terms: property(ramp.vocabItem, schema.map({
        key: {target: VocabularyItemKey, part: 'value'},
        value: {target: VocabularyItemTerm},
        itemShape: VocabularyItem,
      })),
    }
  });

  schema.record<LiteralShape>({
    id: ramp.Literal,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('literal', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      datatype: property(ramp.termDatatype, schema.optional(schema.namedNodeTerm())),
      language: property(ramp.termLanguage, schema.optional(schema.literal({datatype: XSD_STRING}))),
      value: property(ramp.termValue, schema.optional(schema.literalTerm())),
    }
  });

  schema.record<ListShape>({
    id: ramp.List,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('list', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      itemShape: property(ramp.item, Shape),
      headPath: property(ramp.headPath, schema.optional(PropertyPath)),
      tailPath: property(ramp.tailPath, schema.optional(PropertyPath)),
      nil: property(ramp.nil, schema.optional(schema.namedNodeTerm())),
    }
  });

  schema.record<MapShape>({
    id: ramp.Map,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('map', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      key: property(ramp.mapKey, typedShapeID(ramp.ShapeReference)),
      value: property(ramp.mapValue, schema.optional(typedShapeID(ramp.ShapeReference))),
      itemShape: property(ramp.item, Shape),
    }
  });

  const TermPartVocabulary = schema.vocabulary({
    id: ramp.TermPartVocabulary,
    terms: {
      'datatype': ramp.TermDatatype,
      'value': ramp.TermValue,
      'language': ramp.TermLanguage,
    }
  });

  schema.record<ShapeReference>({
    id: ramp.ShapeReference,
    properties: {
      target: property(ramp.shape, Shape),
      part: property(ramp.termPart, schema.optional(schema.anyOf([
        schema.fromVocabulary('datatype', TermPartVocabulary),
        schema.fromVocabulary('language', TermPartVocabulary),
        schema.fromVocabulary('value', TermPartVocabulary),
      ])))
    }
  });

  const mappers: NamedMapper<unknown, unknown>[] = [
    mapAsString(factory),
    mapAsTerm(factory),
    mapAsNumber(factory),
    mapAsBoolean(factory),
  ];

  schema.anyOf(
    mappers.map(m => typedShapeID(m.type)),
    {
      id: rampjs.Mapper,
      lenient: true,
    }
  );

  for (const mapper of mappers) {
    schema.record({
      id: mapper.type,
      properties: {
        type: definesType(property(RDF_TYPE, schema.constantTerm(mapper.type)))
      },
      mapper: {
        map: () => new Match(mapper),
        unmap: value => new Match({type: value.type}),
      },
    });
  }

  return schema.shapes;
}

export function frameShapes(dataset: DatasetCore, factory = DefaultDataFactory): Shape[] {
  const shapesForShapes = makeShapesForShapes(factory);
  const rootShape = shapesForShapes.get(factory.namedNode(rampVocabulary.Shape)) as TypedShape<Shape>;
  const framingResults = frame({shape: rootShape, dataset});
  const shapes: Shape[] = [];
  for (const {value} of framingResults) {
    shapes.push(value);
  }
  return shapes;
}
