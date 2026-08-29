import type { DataFactory, Term, BlankNode, Literal, NamedNode } from '@rdfjs/types';
import { HashMap } from '@reactodia/hashmap';

import { type RawTerm, hashTerm, equalTerms, looksLikeTerm } from './rdf/rdf-model.js';
import {
  ResolvedListShape, SubjectMemo, assertUnknownShape, makeListShapeDefaults, resolveListShape,
  matchesTerm, makeTermMap,
} from './common.js';
import { ErrorCode, RampError, StackFrame, makeRampError, formatDisplayShape } from './errors.js';
import {
  Shape, TypedShape, RecordShape, RecordProperty, PropertyPath, AnyOfShape, SetShape,
  OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape, ShapeID, ShapeReference,
  ValueMapper,
} from './shapes.js';
import { ReferenceMatch, synthesizeShape, EMPTY_REF_MATCHES } from './synthesize.js';

export interface TransformParams<M> {
  value: unknown;
  shape: Shape;
  factory: DataFactory;
  visitor: TransformVisitor<M>;
  cache: MatchCache<M>;
}

export function transform<M>(
  params: TransformParams<M>
): M {
  const {value: rootValue, shape: rootShape, factory, visitor, cache} = params;

  const context: TransformContext<M> = {
    stack: [],
    factory,
    visitor,
    cache,
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
  makeError(code: ErrorCode, message: string): RampError;
}

export interface TransformVisitor<M> {
  createPlaceholder(
    value: unknown,
    shape: Shape
  ): M | undefined;
  visitAnyOf(
    match: M,
    shape: AnyOfShape,
    value: unknown,
  ): M | undefined;
  visitList(
    matches: M[],
    shape: ListShape,
    value: unknown[]
  ): M | undefined;
  visitLiteral(
    value: RawTerm<Literal>,
    shape: LiteralShape
  ): M | undefined;
  visitNode(
    value: RawTerm<NamedNode | BlankNode>,
    shape: ResourceShape
  ): M | undefined;
  visitMap(
    matches: { [key: string]: M },
    shape: MapShape,
    value: { [key: string]: unknown }
  ): M | undefined;
  visitOptional(
    match: M | undefined,
    shape: OptionalShape,
    value: unknown
  ): M | undefined;
  visitRecord(
    matches: Array<{ property: RecordProperty; match: M }>,
    shape: RecordShape,
    value: Record<string, unknown>
  ): M | undefined;
  visitSet(
    matches: M[],
    shape: SetShape,
    value: unknown[]
  ): M | undefined;
}

export interface MatchCache<M> {
  getMatch(shape: Shape, value: unknown): M | null | undefined;
  setMatch(shape: Shape, value: unknown, match: M | null | undefined): void;
}

export class DefaultMatchCache<M> {
  private readonly matches = new HashMap<ShapeID, Map<unknown, M | null>>(
    hashTerm,
    equalTerms
  );

  getMatch(shape: Shape, value: unknown): M | null | undefined {
    const map = this.matches.get(shape.id);
    if (!map) {
      return undefined;
    }
    return map.get(value);
  }

  setMatch(shape: Shape, value: unknown, match: M | null | undefined): void {
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
  value: unknown,
  frame: StackFrame,
  context: TransformContext<M>
): M | undefined {
  let existing = context.cache.getMatch(shape, value);
  if (existing === null) {
    existing = context.visitor.createPlaceholder(value, shape);
  }

  if (existing) {
    return existing;
  }

  context.stack.push(frame);
  context.cache.setMatch(shape, value, null);

  let match: M | undefined;
  switch (shape.type) {
    case 'anyOf':
      match = transformAnyOf(shape, required, value, context);
      break;
    case 'list':
      match = transformList(shape, required, value, context);
      break;
    case 'map':
      match = transformMap(shape, required, value, context);
      break;
    case 'optional':
      match = transformOptional(shape, required, value, context);
      break;
    case 'record':
      match = transformRecord(shape, required, value, context);
      break;
    case 'set':
      match = transformSet(shape, required, value, context);
      break;
    case 'resource':
    case 'literal':
      match = transformTerm(shape, required, value, context);
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
  context.cache.setMatch(shape, value, match);
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
      return context.visitor.visitAnyOf(match, shape, value);
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

  return context.visitor.visitList(matches, shape, value);
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

    const match = transformShape(itemShape, required, item, frame, context);
    if (!match) {
      return undefined;
    }
    matches[key] = match;
  }

  return context.visitor.visitMap(matches, shape, value as { [key: string]: unknown });
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

  return context.visitor.visitOptional(match, shape, value);
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

  return context.visitor.visitRecord(matches, shape, value);
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
    const frame: StackFrame = {shape: property.valueShape, edge: property.name};
    let propertyValue: unknown;
    if (property.transient) {
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
        `Failed to match property "${property.name}"`
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

  return context.visitor.visitSet(matches, shape, value);
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
    ? context.visitor.visitNode(value as RawTerm<NamedNode | BlankNode>, shape)
    : context.visitor.visitLiteral(value as RawTerm<Literal>, shape);
}
