import type { DataFactory, Term, BlankNode, Literal, NamedNode } from '@rdfjs/types';
import { HashMap } from '@reactodia/hashmap';

import { type RawTerm, hashTerm, equalTerms, looksLikeTerm } from './rdf/rdf-model.js';
import { assertUnknownShape, matchesTerm, makeTermMap } from './common.js';
import {
  ErrorCode, RampError, StackFrame, formatDisplayShape, formatStackFrameEdge, makeRampError,
} from './errors.js';
import {
  Shape, RecordShape, RecordProperty, AnyOfShape, SetShape, OptionalShape, ResourceShape,
  LiteralShape, ListShape, MapShape, ShapeID, ShapeReference, ValueHole, Match,
} from './shapes.js';
import { ReferenceMatch, synthesizeShape, EMPTY_REF_MATCHES } from './synthesize.js';

export interface TransformParams<M> {
  value: unknown;
  shape: Shape;
  factory: DataFactory;
  visitor: TransformVisitor<M>;
  cache: MatchCache<NoInfer<M>>;
  synthesizeTransient?: boolean;
}

export function transform<M>(
  params: TransformParams<M>
): M {
  const {
    value: rootValue,
    shape: rootShape,
    factory,
    visitor,
    cache,
    synthesizeTransient = false,
  } = params;

  const context: TransformContext<M> = {
    stack: [],
    factory,
    visitor,
    cache,
    holes: new DefaultMatchCache(),
    trackedRefs: new HashMap<ShapeID, M[]>(hashTerm, equalTerms),
    synthesizeTransient,
    makeError: (code, message) => {
      return makeRampError(code, message, [...context.stack]);
    },
  };
  const match = transformShape(rootShape, true, rootValue, {shape: rootShape}, context);
  if (!match) {
    const displayedShape = formatDisplayShape(rootShape);
    throw context.makeError(
      ErrorCode.ShapeMismatch,
      `Value does not match root shape ${displayedShape}`
    );
  }
  return match;
}

interface TransformContext<M> {
  readonly stack: StackFrame[];
  readonly factory: DataFactory;
  readonly visitor: TransformVisitor<M>;
  readonly cache: MatchCache<M>;
  readonly holes: MatchCache<ValueHole>;
  readonly trackedRefs: HashMap<ShapeID, M[]>;
  readonly synthesizeTransient: boolean;
  makeError(code: ErrorCode, message: string): RampError;
}

export interface TransformVisitor<M> {
  createPlaceholder(hole: ValueHole): M | undefined;
  resolvePlaceholder(hole: ValueHole, match: M | undefined): void;
  intoShape(boxed: unknown, shape: Shape): Match<unknown> | undefined;
  fromAnyOf(
    match: M,
    shape: AnyOfShape
  ): M | undefined;
  fromList(
    matches: M[],
    shape: ListShape
  ): M | undefined;
  fromLiteral(
    value: RawTerm<Literal>,
    shape: LiteralShape
  ): M | undefined;
  fromNode(
    value: RawTerm<NamedNode | BlankNode>,
    shape: ResourceShape
  ): M | undefined;
  fromMap(
    matches: { [key: string]: M },
    shape: MapShape
  ): M | undefined;
  fromOptional(
    match: M | undefined,
    shape: OptionalShape
  ): M | undefined;
  fromRecord(
    matches: Array<{ property: RecordProperty; match: M }>,
    shape: RecordShape
  ): M | undefined;
  fromSet(
    matches: M[],
    shape: SetShape
  ): M | undefined;
}

export interface MatchCache<M> {
  get(shape: Shape, value: unknown): M | null | undefined;
  set(shape: Shape, value: unknown, match: M | null | undefined): void;
}

export class DefaultMatchCache<M> implements MatchCache<M> {
  private readonly matches = new HashMap<ShapeID, Map<unknown, M | null>>(
    hashTerm,
    equalTerms
  );

  get(shape: Shape, value: unknown): M | null | undefined {
    const map = this.matches.get(shape.id);
    if (!map) {
      return undefined;
    }
    return map.get(value);
  }

  set(shape: Shape, value: unknown, match: M | null | undefined): void {
    let map = this.matches.get(shape.id);
    if (!map) {
      map = new Map<unknown, M | null>();
      this.matches.set(shape.id, map);
    }
    if (match === undefined) {
      map.delete(value);
    } else {
      map.set(value, match);
    }
  }
}

function transformShape<M>(
  shape: Shape,
  required: boolean,
  boxed: unknown,
  frame: StackFrame,
  context: TransformContext<M>
): M | undefined {
  const unboxed = context.visitor.intoShape(boxed, shape);
  if (!unboxed) {
    return undefined;
  }

  const trackedRef = context.trackedRefs.get(shape.id);

  let existing = context.cache.get(shape, boxed);
  if (existing === null) {
    let hole = context.holes.get(shape, boxed);
    if (!hole) {
      hole = new ValueHole(boxed, shape);
      context.holes.set(shape, boxed, hole);
    }
    existing = context.visitor.createPlaceholder(hole);
  }

  if (existing) {
    if (trackedRef) {
      trackedRef.push(existing);
    }
    return existing;
  }

  context.stack.push(frame);
  context.cache.set(shape, boxed, null);

  let match: M | undefined;
  switch (shape.type) {
    case 'anyOf':
      match = transformAnyOf(shape, required, unboxed.value, context);
      break;
    case 'list':
      match = transformList(shape, required, unboxed.value, context);
      break;
    case 'map':
      match = transformMap(shape, required, unboxed.value, context);
      break;
    case 'optional':
      match = transformOptional(shape, required, unboxed.value, context);
      break;
    case 'record':
      match = transformRecord(shape, required, unboxed.value, context);
      break;
    case 'set':
      match = transformSet(shape, required, unboxed.value, context);
      break;
    case 'resource':
    case 'literal':
      match = transformTerm(shape, required, unboxed.value, context);
      break;
    default:
      return assertUnknownShape(shape);
  }

  if (required && !match) {
    const displayedShape = formatDisplayShape(shape);
    throw context.makeError(
      ErrorCode.ShapeMismatch,
      `Value does not match ${displayedShape}: ${JSON.stringify(unboxed.value)}`
    );
  }

  context.stack.pop();
  context.cache.set(shape, boxed, match);
  
  const pendingHole = context.holes.get(shape, boxed);
  if (pendingHole) {
    context.visitor.resolvePlaceholder(pendingHole, match);
    context.holes.set(shape, boxed, undefined);
  }

  if (match && trackedRef) {
    trackedRef.push(match);
  }

  return match;
}

function transformAnyOf<M>(
  shape: AnyOfShape,
  required: boolean,
  value: unknown,
  context: TransformContext<M>
): M | undefined {
  for (const variantShape of shape.variants) {
    const match = transformShape(variantShape, false, value, {shape: variantShape}, context);
    if (match) {
      return context.visitor.fromAnyOf(match, shape);
    }
  }

  if (required) {
    for (const variantShape of shape.variants) {
      // try flatten with `required = true` to produce an error
      transformShape(variantShape, true, value, {shape: variantShape}, context);
    }
  }

  return undefined;
}

function transformList<M>(
  shape: ListShape,
  required: boolean,
  value: unknown,
  context: TransformContext<M>
): M | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const frame: StackFrame = {shape: shape.itemShape};

  const matches: M[] = [];
  for (const item of value) {
    const match = transformShape(shape.itemShape, required, item, frame, context);
    if (!match) {
      return undefined;
    }
    matches.push(match);
  }

  return context.visitor.fromList(matches, shape);
}

function transformMap<M>(
  shape: MapShape,
  required: boolean,
  value: unknown,
  context: TransformContext<M>
): M | undefined {
  if (!(value && typeof value === 'object')) {
    return undefined;
  }

  const itemShape = shape.itemShape;
  const frame: StackFrame = {shape: itemShape};

  const matches = Object.create(null) as { [key: string]: M };
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
        matches: refs,
        makeError: (code, message) => makeRampError(code, message, [...context.stack, frame])
      });
    }

    if (shape.value) {
      context.trackedRefs.set(shape.value.target.id, []);
    }

    let itemMatch = transformShape(itemShape, required, item, frame, context);
    if (itemMatch) {
      if (shape.value) {
        const valueMatches = context.trackedRefs.get(shape.value.target.id);
        if (!(valueMatches && valueMatches.length > 0)) {
          throw context.makeError(
            ErrorCode.NoMapValueMatches,
            `Failed to transform item as value of map ${formatDisplayShape(shape)}`
          );
        }
        itemMatch = valueMatches[0];
      }

      matches[key] = itemMatch;
    }

    if (shape.value) {
      context.trackedRefs.delete(shape.value.target.id);
    }
  }

  return context.visitor.fromMap(matches, shape);
}

function addRefMatch(
  refs: HashMap<Term, ReferenceMatch[]>,
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

function transformOptional<M>(
  shape: OptionalShape,
  required: boolean,
  value: unknown,
  context: TransformContext<M>
): M | undefined {
  const isEmpty = value === shape.emptyValue;

  const frame: StackFrame = {shape: shape.itemShape};
  const match = isEmpty ? undefined : transformShape(shape.itemShape, required, value, frame, context);
  if (!isEmpty && !match) {
    return undefined;
  }

  return context.visitor.fromOptional(match, shape);
}

function transformRecord<M>(
  shape: RecordShape,
  required: boolean,
  value: unknown,
  context: TransformContext<M>
): M | undefined {
  if (!isObjectWithProperties(value)) {
    return undefined;
  }

  const matches: Array<{ property: RecordProperty; match: M }> = [];
  if (!matchProperties(shape.typeProperties, required, value, matches, context)) {
    return undefined;
  }
  const checkProperties = required || matches.length > 0;
  if (!(
    matchProperties(shape.properties, checkProperties, value, matches, context) &&
    matchProperties(shape.computedProperties, checkProperties, value, matches, context)
  )) {
    if (checkProperties) {
      throw context.makeError(
        ErrorCode.FailedToMatchProperties,
        `Invalid value for shape ${formatDisplayShape(shape)}: failed to match properties.`
      );
    } else {
      return undefined;
    }
  }

  return context.visitor.fromRecord(matches, shape);
}

function isObjectWithProperties(obj: unknown): obj is { [propertyName: string]: unknown } {
  return Boolean(typeof obj === 'object' && obj);
}

function matchProperties<M>(
  properties: ReadonlyArray<RecordProperty>,
  required: boolean,
  value: { [propertyName: string]: unknown },
  matches: Array<{ property: RecordProperty; match: M }>,
  context: TransformContext<M>
): boolean {
  for (const property of properties) {
    const edge = property.kind === 'transient' ? property.path : property.name;
    const frame: StackFrame = {shape: property.valueShape, edge};
    let propertyValue: unknown;
    if (property.kind === 'transient') {
      if (!context.synthesizeTransient) {
        continue;
      }
      propertyValue = synthesizeShape(property.valueShape, {
        factory: context.factory,
        matches: EMPTY_REF_MATCHES,
        makeError: (code, message) => makeRampError(code, message, [...context.stack, frame]),
      });
    } else {
      propertyValue = value[property.name];
    }
    const match = transformShape(property.valueShape, required, propertyValue, frame, context);
    if (match) {
      matches.push({property, match});
    } else if (required) {
      throw context.makeError(
        ErrorCode.FailedToMatchProperty,
        `Failed to match property "${formatStackFrameEdge(edge)}"`
      );
    } else {
      return false;
    }
  }
  return true;
}

function transformSet<M>(
  shape: SetShape,
  required: boolean,
  value: unknown,
  context: TransformContext<M>
): M | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const frame: StackFrame = {shape: shape.itemShape};
  const matches: M[] = [];
  for (const item of value) {
    const match = transformShape(shape.itemShape, required, item, frame, context);
    if (!match) {
      return undefined;
    }
    matches.push(match);
  }

  return context.visitor.fromSet(matches, shape);
}

function transformTerm<M>(
  shape: ResourceShape | LiteralShape,
  required: boolean,
  value: unknown,
  context: TransformContext<M>
): M | undefined {
  if (!looksLikeTerm(value)) {
    return undefined;
  }
  if (!matchesTerm(shape, value)) {
    if (required) {
      matchesTerm(shape, value, (code, message) => context.makeError(code, message));
      throw new Error('Expected "matchesTerm" to throw');
    } else {
      return undefined;
    }
  }

  return shape.type === 'resource'
    ? context.visitor.fromNode(value as RawTerm<NamedNode | BlankNode>, shape)
    : context.visitor.fromLiteral(value as RawTerm<Literal>, shape);
}
