import { HashMap } from './hash-map';
import * as Rdf from './rdf';
import {
  Shape, ObjectShape, ObjectProperty, PropertyPath, UnionShape, SetShape,
  OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape, ShapeID, ShapeReference,
  getNestedPropertyPath,
} from './shapes';
import {
  ResolvedListShape, SubjectMemo, assertUnknownShape, makeListShapeDefaults, resolveListShape,
  matchesTerm, makeTermMap,
} from './common';
import { RampError, ErrorCode, StackFrame, formatDisplayShape, makeRampError } from './errors';
import { ReferenceMatch, synthesizeShape, EMPTY_REF_MATCHES } from './synthesize';
import { ValueMapper } from './value-mapping';

export interface FlattenParams {
  value: unknown;
  shape: Shape;
  factory?: Rdf.DataFactory;
  mapper?: ValueMapper;
  unstable_generateBlankNode?: (prefix: string) => Rdf.BlankNode;
}

export function flatten(params: FlattenParams): Iterable<Rdf.Quad> {
  const factory = params.factory || Rdf.DefaultDataFactory;
  const generateBlankNode = params.unstable_generateBlankNode || makeDefaultBlankNodeGenerator(factory);

  const matches = new HashMap<ShapeID, Map<unknown, ShapeMatch | null>>(Rdf.hashTerm, Rdf.equalTerms);

  const context: LowerContext = {
    stack: [],
    factory,
    mapper: params.mapper || ValueMapper.mapByDefault(factory),
    listDefaults: makeListShapeDefaults(factory),
    getMatch: (shape, value) => {
      const map = matches.get(shape.id);
      if (!map) { return undefined; }
      return map.get(value);
    },
    setMatch: (shape, value, match) => {
      let map = matches.get(shape.id);
      if (!map) {
        map = new Map<unknown, ShapeMatch | null>();
        matches.set(shape.id, map);
      }
      if (match === undefined) {
        map.delete(value);
      } else {
        map.set(value, match);
      }
    },
    generateSubject: shape => generateBlankNode(shape.type),
    generateBlankNode,
    makeError: (code, message) => {
      return makeRampError(code, message, [...context.stack]);
    },
  };
  const rootShape = params.shape;
  const match = flattenShape(rootShape, true, params.value, {shape: rootShape}, context);
  if (!match) {
    const displayedShape = formatDisplayShape(rootShape);
    throw context.makeError(
      ErrorCode.ShapeMismatch,
      `Value does not match root shape ${displayedShape}`
    );
  }
  return match.generate(undefined);
}

type RdfNode = Rdf.NamedNode | Rdf.BlankNode | Rdf.Literal;

interface LowerContext {
  readonly stack: StackFrame[];
  readonly factory: Rdf.DataFactory;
  readonly mapper: ValueMapper;
  readonly listDefaults: ResolvedListShape;
  getMatch(shape: Shape, value: unknown): ShapeMatch | null | undefined;
  setMatch(shape: Shape, value: unknown, match: ShapeMatch | null | undefined): void;
  generateSubject: (shape: Shape) => Rdf.NamedNode | Rdf.BlankNode;
  generateBlankNode: (prefix: string) => Rdf.BlankNode;
  makeError(code: ErrorCode, message: string): RampError;
}

interface ShapeMatch {
  nodes: () => Iterable<RdfNode>;
  generate: (edge: Edge | undefined) => Iterable<Rdf.Quad>;
}

class PlaceholderMatch implements ShapeMatch {
  constructor(
    private context: LowerContext,
    private shape: Shape,
    private value: unknown
  ) {}

  nodes(): Iterable<RdfNode> {
    return [];
  }

  *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    const match = this.context.getMatch(this.shape, this.value);
    if (!match) {
      const displayedShape = formatDisplayShape(this.shape);
      throw this.context.makeError(
        ErrorCode.CyclicMatch,
        `Cannot generate quads for cyclic shape ${displayedShape}`
      );
    }
    for (const node of match.nodes()) {
      yield* generateEdge(edge, node, this.context);
    }
  }
}

function flattenShape(
  shape: Shape,
  required: boolean,
  value: unknown,
  frame: StackFrame,
  context: LowerContext
): ShapeMatch | undefined {
  let existing = context.getMatch(shape, value);
  if (existing === null) {
    existing = new PlaceholderMatch(context, shape, value);
  }

  if (existing) {
    return existing;
  }

  context.stack.push(frame);
  context.setMatch(shape, value, null);

  const converted = context.mapper.toRdf(value, shape);
  let match: ShapeMatch | undefined;
  switch (shape.type) {
    case 'object':
      match = flattenObject(shape, required, converted, context);
      break;
    case 'union':
      match = flattenUnion(shape, required, converted, context);
      break;
    case 'set':
      match = flattenSet(shape, required, converted, context);
      break;
    case 'optional':
      match = flattenOptional(shape, required, converted, context);
      break;
    case 'resource':
    case 'literal':
      match = flattenNode(shape, required, converted, context);
      break;
    case 'list':
      match = flattenList(shape, required, converted, context);
      break;
    case 'map':
      match = flattenMap(shape, required, converted, context);
      break;
    default:
      return assertUnknownShape(shape);
  }

  if (required && !match) {
    const displayedShape = formatDisplayShape(shape);
    throw context.makeError(
      ErrorCode.ShapeMismatch,
      `Value does not match ${displayedShape}: ${JSON.stringify(value)}`
    );
  }

  context.stack.pop();
  context.setMatch(shape, value, match);
  return match;
}

function flattenObject(
  shape: ObjectShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!isObjectWithProperties(value)) {
    return undefined;
  }

  const matches: Array<{ property: ObjectProperty; match: ShapeMatch }> = [];
  if (!matchProperties(shape.typeProperties, required, value, matches, context)) {
    return undefined;
  }
  const checkProperties = required || shape.typeProperties.length > 0;
  if (!matchProperties(shape.properties, checkProperties, value, matches, context)) {
    if (checkProperties) {
      throw context.makeError(
        ErrorCode.FailedToMatchProperties,
        `Invalid value for shape ${formatDisplayShape(shape)}: failed to match properties.`
      );
    } else {
      return undefined;
    }
  }

  const memo = new SubjectMemo(shape);
  for (const {property, match} of matches) {
    if (isSelfProperty(property)) {
      for (const node of match.nodes()) {
        memo.set(node);
      }
    }
  }
  const subject = memo.resolve() || context.generateSubject(shape);

  function nodes(): Iterable<RdfNode> {
    return [subject];
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    yield* generateEdge(edge, subject, context);
    for (const {property, match} of matches) {
      yield* match.generate({subject, path: property.path});
    }
  }

  return {nodes, generate};
}

function isObjectWithProperties(obj: unknown): obj is { [propertyName: string]: unknown } {
  return Boolean(typeof obj === 'object' && obj);
}

function matchProperties(
  properties: ReadonlyArray<ObjectProperty>,
  required: boolean,
  value: { [propertyName: string]: unknown },
  matches: Array<{ property: ObjectProperty; match: ShapeMatch }>,
  context: LowerContext
): boolean {
  for (const property of properties) {
    let propertyValue: unknown;
    if (property.transient) {
      propertyValue = synthesizeShape(property.valueShape, {
        factory: context.factory,
        mapper: context.mapper,
        matches: EMPTY_REF_MATCHES,
      });
    } else {
      propertyValue = value[property.name];
    }
    const frame: StackFrame = {shape: property.valueShape, edge: property.name};
    const match = flattenShape(property.valueShape, required, propertyValue, frame, context);
    if (match) {
      matches.push({property, match});
    } else if (required) {
      throw context.makeError(
        ErrorCode.FailedToMatchProperty,
        `Failed to match property "${property.name}"`
      );
    } else {
      return false;
    }
  }
  return true;
}

interface Edge {
  subject: Rdf.NamedNode | Rdf.BlankNode;
  path: PropertyPath;
}

function generateEdge(
  edge: Edge | undefined,
  object: RdfNode,
  context: LowerContext
): Iterable<Rdf.Quad> {
  return edge ? generatePropertyPath(edge.subject, edge.path, object, context) : [];
}

function *generatePropertyPath(
  subject: RdfNode,
  path: PropertyPath,
  object: RdfNode,
  context: LowerContext
): Iterable<Rdf.Quad> {
  switch (path.type) {
    case 'predicate': {
      if (subject.termType === 'Literal') {
        throw context.makeError(
          ErrorCode.CannotUseLiteralAsSubject,
          `Cannot put literal ${Rdf.toString(subject)} as subject with ` +
          `predicate ${Rdf.toString(path.predicate)}`
        );
      }
      yield context.factory.quad(subject, path.predicate, object);
      break;
    }
    case 'sequence': {
      const {sequence} = path;
      if (sequence.length === 0) {
        return;
      }
      let s = subject;
      for (let i = 0; i < sequence.length; i++) {
        const o = i === sequence.length - 1
          ? object : context.generateBlankNode('path');
        const element = sequence[i];
        yield* generatePropertyPath(s, element, o, context);
        s = o;
      }
      break;
    }
    case 'inverse': {
      // switch subject and predicate
      yield* generatePropertyPath(object, path.inverse, subject, context);
      break;
    }
    case 'alternative': {
      if (path.alternatives.length > 0) {
        // take only the first alternative
        const alternative = path.alternatives[0];
        yield* generatePropertyPath(subject, alternative, object, context);
      }
      break;
    }
    case 'zeroOrMore':
    case 'zeroOrOne':
    case 'oneOrMore': {
      // always generate a path with length === 1
      const nestedPath = getNestedPropertyPath(path);
      yield* generatePropertyPath(subject, nestedPath, object, context);
      break;
    }
  }
}

function isSelfProperty(property: ObjectProperty) {
  return property.path.type === 'sequence' && property.path.sequence.length === 0;
}

function flattenUnion(
  shape: UnionShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  for (const variantShape of shape.variants) {
    const match = flattenShape(variantShape, false, value, {shape: variantShape}, context);
    if (match) {
      return match;
    }
  }

  if (required) {
    for (const variantShape of shape.variants) {
      // try flatten with `required = true` to produce an error
      flattenShape(variantShape, true, value, {shape: variantShape}, context);
    }
  }

  return undefined;
}

function flattenSet(
  shape: SetShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const frame: StackFrame = {shape: shape.itemShape};
  const matches: ShapeMatch[] = [];
  for (const item of value) {
    const match = flattenShape(shape.itemShape, required, item, frame, context);
    if (!match) {
      return undefined;
    }
    matches.push(match);
  }

  function *nodes(): Iterable<RdfNode> {
    for (const match of matches) {
      yield* match.nodes();
    }
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    for (const match of matches) {
      yield* match.generate(edge);
    }
  }

  return {nodes, generate};
}

function flattenOptional(
  shape: OptionalShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  const isEmpty = value === shape.emptyValue;

  const frame: StackFrame = {shape: shape.itemShape};
  const match = isEmpty ? undefined : flattenShape(shape.itemShape, required, value, frame, context);
  if (!isEmpty && !match) {
    return undefined;
  }

  function nodes(): Iterable<RdfNode> {
    return match ? match.nodes() : [];
  }

  function generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    return match ? match.generate(edge) : [];
  }

  return {nodes, generate};
}

function flattenNode(
  shape: ResourceShape | LiteralShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!Rdf.looksLikeTerm(value)) { return undefined; }
  if (!matchesTerm(shape, value)) {
    if (required) {
      throw matchesTerm(shape, value, (code, message) => context.makeError(code, message));
    } else {
      return undefined;
    }
  }
  const node = value as RdfNode;
  function nodes(): Iterable<RdfNode> {
    return [node];
  }
  function generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    return generateEdge(edge, node, context);
  }
  return {nodes, generate};
}

function flattenList(
  shape: ListShape,
  required: boolean,
  value: unknown,
  context: LowerContext
): ShapeMatch | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const {head, tail, nil} = resolveListShape(shape, context.listDefaults);
  const frame: StackFrame = {shape: shape.itemShape};

  const matches: ShapeMatch[] = [];
  for (const item of value) {
    const match = flattenShape(shape.itemShape, required, item, frame, context);
    if (!match) {
      return undefined;
    }
    matches.push(match);
  }

  const list = matches.length === 0 ? nil : context.generateBlankNode('list');

  function *nodes(): Iterable<RdfNode> {
    yield list;
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    yield* generateEdge(edge, list, context);
    let current = list;
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      yield* match.generate({subject: current, path: head});
      const next = i === matches.length - 1
        ? nil : context.generateBlankNode('list');
      yield* generatePropertyPath(current, tail, next, context);
      current = next;
    }
  }

  return {nodes, generate};
}

function flattenMap(
  shape: MapShape,
  required: boolean,
  value: unknown,
  context: LowerContext
) {
  if (typeof value !== 'object') {
    return undefined;
  }

  const itemShape = shape.itemShape;
  const frame: StackFrame = {shape: itemShape};

  const matches: ShapeMatch[] = [];
  for (const key in value) {
    if (!Object.hasOwnProperty.call(value, key)) { continue; }
    const valueAtKey = (value as { [key: string]: unknown })[key];

    let item = valueAtKey;
    if (shape.value) {
      const refs = makeTermMap<ReferenceMatch[]>();
      addRefMatch(refs, shape.key, key);
      addRefMatch(refs, shape.value, valueAtKey);
      item = synthesizeShape(shape.itemShape, {
        factory: context.factory,
        mapper: context.mapper,
        matches: refs,
      });
    }

    const match = flattenShape(itemShape, required, item, frame, context);
    if (!match) {
      return undefined;
    }
    matches.push(match);
  }

  function *nodes() {
    for (const match of matches) {
      yield* match.nodes();
    }
  }

  function *generate(edge: Edge | undefined): Iterable<Rdf.Quad> {
    for (const match of matches) {
      yield* match.generate(edge);
    }
  }

  return {nodes, generate};
}

function addRefMatch(
  refs: HashMap<Rdf.Term, ReferenceMatch[]>,
  ref: ShapeReference,
  match: unknown
) {
  let array = refs.get(ref.target.id);
  if (!array) {
    array = [];
    refs.set(ref.target.id, array);
  }
  array.push({ref, match});
}

function makeDefaultBlankNodeGenerator(factory: Rdf.DataFactory) {
  const blankUniqueKey = Rdf.randomString('', 24);
  let blankIndex = 1;
  return (prefix: string) => {
    const index = blankIndex++;
    return factory.blankNode(`${prefix}_${blankUniqueKey}_${index}`);
  };
}
