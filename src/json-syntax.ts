import { ShapeBuilder, definesType, computedProperty, property, self, transient } from './builder';
import * as Rdf from './rdf';
import {
  AlternativePath, AnyOfShape, ComputedProperty, InversePath, ListShape, LiteralShape, MapShape,
  OneOrMorePath, OptionalShape, PredicatePath, PropertyPath, RecordShape, RecordProperty,
  ResourceShape, SetShape, SequencePath, Shape, TypedShapeID, Vocabulary, ZeroOrMorePath,
  ZeroOrOnePath, typedShapeID,
} from './shapes';
import { frame } from './frame';
import { rdf, xsd, makeRampVocabulary } from './vocabulary';

interface JsonShapeBase {
  readonly id: Rdf.NamedNode | Rdf.BlankNode;
  readonly lenient?: boolean;
}

interface JsonResourceShape extends JsonShapeBase, Omit<ResourceShape, 'type'> {
  readonly node: 'resource';
}

interface JsonLiteralShape extends JsonShapeBase, Omit<LiteralShape, 'type'> {
  readonly node: 'literal';
}

interface JsonRecordShape extends JsonShapeBase {
  readonly typeProperties: ReadonlyArray<string>;
  readonly properties: ReadonlyArray<unknown>;
}

export function makeJsonShapesForShapes(factory = Rdf.DefaultDataFactory) {
  const RDF_TYPE = factory.namedNode(rdf.type);
  const XSD_BOOLEAN = factory.namedNode(xsd.boolean);
  const XSD_STRING = factory.namedNode(xsd.string);
  const XSD_INTEGER = factory.namedNode(xsd.integer);
  const ramp = makeRampVocabulary(factory);

  const schema = new ShapeBuilder({factory, blankUniqueKey: 'shapes'});

  const NamespacedName = schema.resourceTerm({
    id: ramp.NamespacedName,
    // TODO: pass namespaces here
  });

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

  const ShapeRef = schema.readonlyRecord({
    id: ramp.ShapeRef,
    properties: {
      $ref: definesType(self(NamespacedName)),
    }
  });

  const ComputedShapeID = schema.resourceTerm({id: ramp.ShapeID});

  schema.readonlyRecord({
    id: ramp.Module,
    properties: {
      shapes: property(
        ramp.containsShape,
        schema.map({
          key: {target: ComputedShapeID, part: 'value'},
          value: {target: Shape},
        })
      )
    }
  });

  schema.anyOf([ShapeRef, Shape], {id: ramp.ShapeOrRef});  

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

  const makeBaseProperties = () => ({
    id: computedProperty(ComputedShapeID),
    lenient: property(ramp.lenient, schema.optional(
      schema.literal<boolean>({datatype: XSD_BOOLEAN})
    )),
  });

  schema.readonlyRecord<JsonResourceShape>({
    id: ramp.Resource,
    properties: {
      node: definesType(
        property(RDF_TYPE, schema.fromVocabulary('resource', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      onlyNamed: property(ramp.onlyNamed, schema.optional(
        schema.literal({datatype: XSD_BOOLEAN})
      )),
      value: property(ramp.termValue, schema.optional(schema.resourceTerm())),
      keepAsTerm: property(ramp.keepAsTerm, schema.optional(
        schema.literal({datatype: XSD_BOOLEAN})
      )),
      vocabulary: property(ramp.vocabulary, schema.optional(ramp.Vocabulary)),
    }
  });

  schema.readonlyRecord<JsonLiteralShape>({
    id: ramp.Literal,
    properties: {
      node: definesType(
        property(RDF_TYPE, schema.fromVocabulary('literal', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      datatype: property(ramp.termDatatype, schema.optional(schema.namedNodeTerm())),
      language: property(ramp.termLanguage, schema.optional(schema.literal({datatype: XSD_STRING}))),
      value: property(ramp.termValue, schema.optional(schema.literalTerm())),
      keepAsTerm: property(ramp.keepAsTerm, schema.optional(
        schema.literal({datatype: XSD_BOOLEAN})
      )),
    }
  });

  const PropertyName = schema.literal({
    id: ramp.PropertyName,
    datatype: XSD_STRING,
  });

  schema.readonlyRecord<RecordShape>({
    id: ramp.Record,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('record', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      typeProperties: property(ramp.typeProperty, schema.set(PropertyName)),
      properties: definesType(
        property(ramp.property, schema.set(ramp.Property))
      ),
      computedProperties: property(ramp.computedProperty,
        schema.set(ramp.ComputedProperty)
      ),
    }
  });

  schema.readonlyRecord<RecordProperty>({
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

  schema.readonlyRecord<ComputedProperty>({
    id: ramp.ComputedProperty,
    properties: {
      name: property(ramp.name, schema.literal({datatype: XSD_STRING})),
      valueShape: property(ramp.shape, ramp.Shape),
    }
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

  schema.readonlyRecord<PredicatePath & { exclude: undefined }>({
    id: ramp.PredicatePath,
    properties: {
      type: computedProperty(
        schema.fromVocabulary('predicate', PropertyPathTypeVocabulary)
      ),
      predicate: self(schema.namedNodeTerm()),
      // negative properties to exclude other property path types
      exclude: transient(self(
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
      )),
    }
  });

  schema.readonlyRecord<SequencePath>({
    id: ramp.SequencePath,
    properties: {
      type: computedProperty(
        schema.fromVocabulary('sequence', PropertyPathTypeVocabulary)
      ),
      sequence: self(schema.list(PropertyPath)),
    }
  });

  schema.readonlyRecord<InversePath>({
    id: ramp.InversePath,
    properties: {
      type: computedProperty(
        schema.fromVocabulary('inverse', PropertyPathTypeVocabulary)
      ),
      inverse: property(ramp.inversePath, PropertyPath),
    }
  });

  schema.readonlyRecord<AlternativePath>({
    id: ramp.AlternativePath,
    properties: {
      type: computedProperty(
        schema.fromVocabulary('alternative', PropertyPathTypeVocabulary)
      ),
      alternatives: property(ramp.alternativePath, schema.list(PropertyPath)),
    }
  });

  schema.readonlyRecord<ZeroOrMorePath>({
    id: ramp.ZeroOrMorePath,
    properties: {
      type: computedProperty(
        schema.fromVocabulary('zeroOrMore', PropertyPathTypeVocabulary)
      ),
      zeroOrMore: property(ramp.zeroOrMorePath, PropertyPath),
    }
  });

  schema.readonlyRecord<ZeroOrOnePath>({
    id: ramp.ZeroOrOnePath,
    properties: {
      type: computedProperty(
        schema.fromVocabulary('zeroOrOne', PropertyPathTypeVocabulary)
      ),
      zeroOrOne: property(ramp.zeroOrOnePath, PropertyPath),
    }
  });

  schema.readonlyRecord<OneOrMorePath>({
    id: ramp.OneOrMorePath,
    properties: {
      type: computedProperty(
        schema.fromVocabulary('oneOrMore', PropertyPathTypeVocabulary)
      ),
      oneOrMore: property(ramp.oneOrMorePath, PropertyPath),
    }
  });

  schema.readonlyRecord<AnyOfShape>({
    id: ramp.AnyOf,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('anyOf', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      variants: property(ramp.variant, schema.set(ramp.Shape)),
    }
  });

  schema.readonlyRecord<SetShape>({
    id: ramp.Set,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('set', ShapeTypeVocabulary))
      ),
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

  schema.readonlyRecord<OptionalShape>({
    id: ramp.Optional,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('optional', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      itemShape: property(ramp.item, ramp.Shape),
    }
  });

  schema.readonlyRecord<ListShape>({
    id: ramp.List,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('list', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      itemShape: property(ramp.item, ramp.Shape),
      headPath: property(ramp.headPath, schema.optional(ramp.PropertyPath)),
      tailPath: property(ramp.tailPath, schema.optional(ramp.PropertyPath)),
      nil: property(ramp.nil, schema.optional(schema.namedNodeTerm())),
    }
  });

  schema.readonlyRecord<MapShape>({
    id: ramp.Map,
    properties: {
      type: definesType(
        property(RDF_TYPE, schema.fromVocabulary('map', ShapeTypeVocabulary))
      ),
      ...makeBaseProperties(),
      key: property(ramp.mapKey, ramp.ShapeReference),
      value: property(ramp.mapValue, schema.optional(ramp.ShapeReference)),
      itemShape: property(ramp.item, ramp.Shape),
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

  schema.readonlyRecord({
    id: ramp.ShapeReference,
    properties: {
      target: property(ramp.shape, ramp.Shape),
      part: property(ramp.termPart, schema.optional(schema.anyOf([
        schema.fromVocabulary('datatype', TermPartVocabulary),
        schema.fromVocabulary('language', TermPartVocabulary),
        schema.fromVocabulary('value', TermPartVocabulary),
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

  schema.readonlyRecord({
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
