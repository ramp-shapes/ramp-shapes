import * as SparqlJs from 'sparqljs';

import { HashSet } from './hash-map';
import * as Rdf from './rdf';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PropertyPath, UnionShape, SetShape,
  OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape, getNestedPropertyPath,
} from './shapes';
import {
  ResolvedListShape, makeTermMap, makeTermSet, assertUnknownShape, makeListShapeDefaults, resolveListShape,
} from './common';
import { ErrorCode, RampError, makeRampError } from './errors';

export interface GenerateQueryParams {
  shape: Shape;
  factory?: Rdf.DataFactory;
  base?: Rdf.NamedNode;
  prefixes?: { [prefix: string]: string };
  unstable_onEmit?: (shape: Shape, subject: SparqlJs.Term, out: SparqlJs.Pattern[]) => void;
}

/**
 * @throws {RamError}
 */
export function generateQuery(params: GenerateQueryParams): SparqlJs.ConstructQuery {
  const factory = params.factory || Rdf.DefaultDataFactory;

  const templateTriples: SparqlJs.Triple[] = [];
  const wherePatterns: SparqlJs.Pattern[] = [];
  const query: SparqlJs.ConstructQuery = {
    type: 'query',
    queryType: 'CONSTRUCT',
    base: params.base ? params.base.value : undefined,
    prefixes: params.prefixes || {},
    template: templateTriples,
    where: wherePatterns,
  };

  let templateBlankIndex = 1;
  function *tryGeneratePropertyPath(
    subject: SparqlJs.Term,
    predicate: SparqlJs.PropertyPath | SparqlJs.IriTerm,
    object: SparqlJs.Term,
  ): Iterable<SparqlJs.Triple> {
    if (Rdf.looksLikeTerm(predicate)) {
      assertValidSubject(subject);
      yield {subject, predicate, object};
      return;
    }
    const path: SparqlJs.PropertyPath = predicate;
    if (path.pathType === '^' && path.items.length === 1) {
      yield* tryGeneratePropertyPath(object, path.items[0], subject);
    } else if (path.pathType === '/') {
      let s = subject;
      for (let i = 0; i < path.items.length - 1; i++) {
        const blankIndex = templateBlankIndex++;
        const o = factory.blankNode(`path_${blankIndex}`);
        yield* tryGeneratePropertyPath(s, path.items[i], o);
        s = o;
      }
      const last = path.items[path.items.length - 1];
      yield* tryGeneratePropertyPath(s, last, object);
    }
  }

  const subjects = makeTermMap<SparqlJs.Triple['subject'] | null>();
  let varIndex = 1;

  const context: GenerateQueryContext = {
    factory,
    listDefaults: makeListShapeDefaults(factory),
    visitingShapes: makeTermSet() as HashSet<ShapeID>,
    stack: [],
    resolveSubject: (shape: Shape) => {
      let subject = subjects.get(shape.id);
      if (subject === undefined) {
        subject = findSubject(shape, context);
        subjects.set(shape.id, subject);
      }
      return subject === null ? context.makeVariable(shape.type) : subject;
    },
    makeVariable: prefix => {
      const index = varIndex++;
      return factory.variable!(`${prefix}_${index}`);
    },
    addEdge: edge => {
      if (edge.subject && edge.path && !isEmptyPath(edge.path)) {
        for (const triple of tryGeneratePropertyPath(edge.subject, edge.path, edge.object)) {
          templateTriples.push(triple);
        }
      }
    },
    makeError: (code, message) => {
      const stack = context.stack.map(shape => ({shape}));
      return makeRampError(code, message, stack);
    },
    onEmit: params.unstable_onEmit || ((shape, subject, out) => {/* nothing by default */}),
  };

  const rootShape = params.shape;
  const object = context.resolveSubject(rootShape);
  generateForShape(rootShape, {object}, wherePatterns, context);
  return query;
}

function isEmptyPath(predicate: SparqlJs.PropertyPath | SparqlJs.Term) {
  if (Rdf.looksLikeTerm(predicate)) {
    return false;
  }
  return predicate.pathType === '/' && predicate.items.length === 0;
}

interface GenerateQueryContext {
  readonly factory: Rdf.DataFactory;
  readonly listDefaults: ResolvedListShape;
  readonly visitingShapes: HashSet<ShapeID>;
  readonly stack: Shape[];
  resolveSubject(shape: Shape): SparqlJs.Triple['subject'];
  makeVariable(prefix: string): SparqlJs.VariableTerm;
  addEdge(edge: Edge): void;
  makeError(code: ErrorCode, message: string): RampError;
  onEmit(shape: Shape, subject: SparqlJs.Term, out: SparqlJs.Pattern[]): void;
}

interface Edge {
  subject?: SparqlJs.Term;
  path?: SparqlJs.PropertyPath | SparqlJs.IriTerm;
  object: SparqlJs.Term;
}

function generateEdge(edge: Edge, out: SparqlJs.Pattern[]) {
  if (edge.subject && edge.path && !isEmptyPath(edge.path)) {
    assertValidSubject(edge.subject);
    out.push({
      type: 'bgp',
      triples: [{
        subject: edge.subject,
        predicate: edge.path,
        object: edge.object,
      }]
    });
  }
}

function assertValidSubject(term: SparqlJs.Term): asserts term is SparqlJs.Triple['subject'] {
  switch (term.termType) {
    case 'NamedNode':
    case 'BlankNode':
    case 'Variable':
      /* allowed */
      break;
    default:
      throw new Error('Cannot generate triple with given subject: ' + Rdf.toString(term));
  }
}

type SparqlJsPredicate = SparqlJs.PropertyPath | SparqlJs.IriTerm;

function propertyPathToSparql(path: PropertyPath): SparqlJsPredicate {
  switch (path.type) {
    case 'predicate':
      return path.predicate;
    case 'sequence':
      return {
        type: 'path',
        pathType: '/',
        items: path.sequence.map(propertyPathToSparql),
      };
    case 'inverse':
      return {type: 'path', pathType: '^', items: [propertyPathToSparql(path.inverse)]};
    case 'alternative':
      return {
        type: 'path',
        pathType: '|',
        items: path.alternatives.map(propertyPathToSparql),
      };
    case 'zeroOrMore':
      return {type: 'path', pathType: '*', items: [propertyPathToSparql(path.zeroOrMore)]};
    case 'zeroOrOne':
      // TODO: fix Sparql.js typings for property path operator '?'
      return {type: 'path', pathType: '?' as any, items: [propertyPathToSparql(path.zeroOrOne)]};
    case 'oneOrMore':
      return {type: 'path', pathType: '+', items: [propertyPathToSparql(path.oneOrMore)]};
    default:
      throw new Error(`Unknown path type "${(path as PropertyPath).type}"`);
  }
}

function concatSparqlPaths(
  pathType: '/' | '|',
  parts: SparqlJsPredicate[]
): SparqlJsPredicate {
  if (parts.length === 0) {
    throw new Error('Cannot concat zero path parts');
  } else if (parts.length === 1) {
    return parts[0];
  } else {
    const items: SparqlJsPredicate[] = [];
    for (const part of parts) {
      if (isSparqlPropertyPath(part) && part.pathType === pathType) {
        for (const item of part.items) {
          items.push(item);
        }
      } else {
        items.push(part);
      }
    }
    return {type: 'path', pathType, items};
  }
}

function isSparqlPropertyPath(predicate: SparqlJsPredicate): predicate is SparqlJs.PropertyPath {
  return typeof predicate === 'object';
}

function generateForShape(
  shape: Shape,
  edge: Edge,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): void {
  if (shouldBreakRecursion(shape, context)) {
    const unresolvedEdge: Edge = {
      subject: edge.subject,
      path: edge.path,
      object: context.makeVariable(shape.type + '_un'),
    };
    generateEdge(unresolvedEdge, out);
    context.addEdge(unresolvedEdge);
    return;
  }

  context.visitingShapes.add(shape.id);
  context.stack.push(shape);

  switch (shape.type) {
    case 'object':
      generateForObject(shape, edge, out, context);
      break;
    case 'union':
      generateForUnion(shape, edge, out, context);
      break;
    case 'set':
    case 'optional':
    case 'map':
      generateForSetLikeShape(shape, edge, out, context);
      break;
    case 'resource':
    case 'literal':
      generateForNode(shape, edge, out, context);
      break;
    case 'list':
      generateForList(shape, edge, out, context);
      break;
    default:
      assertUnknownShape(shape);
      break;
  }

  context.onEmit(shape, edge.object, out);

  context.visitingShapes.delete(shape.id);
  context.stack.pop();
}

function generateForObject(
  shape: ObjectShape,
  edge: Edge,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): void {
  generateEdge(edge, out);
  context.addEdge(edge);

  if (isBreakingPointShape(shape, context)) {
    edge = generateRecursiveEdge(shape, edge, out, context);
  }

  generateForProperties(edge.object, shape.typeProperties, out, context);
  generateForProperties(edge.object, shape.properties, out, context);
}

function generateForProperties(
  subject: SparqlJs.Term,
  properties: ReadonlyArray<ObjectProperty>,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
) {
  for (const property of properties) {
    const shape = property.valueShape;
    const edge: Edge = {
      subject,
      path: propertyPathToSparql(property.path),
      object: isSelfPath(property.path) ? subject : context.resolveSubject(shape),
    };
    generateForShape(shape, edge, out, context);
  }
}

function isSelfPath(path: PropertyPath) {
  return path.type === 'sequence' && path.sequence.length === 0;
}

function generateRecursiveEdge(
  shape: Shape,
  edge: Edge,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext
): Edge {
  const alternatives = [...findRecursivePaths(shape, context)];
  if (alternatives.length === 0) {
    return edge;
  }

  assertValidSubject(edge.object);
  const object = context.makeVariable(shape.type + '_r');
  out.push({
    type: 'bgp',
    triples: [{
      subject: edge.object,
      predicate: {
        type: 'path',
        pathType: '*',
        items: [concatSparqlPaths('|', alternatives)],
      },
      object,
    }]
  });

  return {object};
}

function shouldBreakRecursion(shape: Shape, context: GenerateQueryContext): boolean {
  if (context.visitingShapes.has(shape.id)) {
    if (isBreakingPointShape(shape, context)) {
      return true;
    }
    for (let i = context.stack.length - 1; i >= 0; i--) {
      const frame = context.stack[i];
      if (isBreakingPointShape(frame, context)) {
        // if we found a "breaking point" shape somewhere between current shape
        // and the previous instance of it then we should wait
        // for second instance of that shape, and only then break
        return false;
      } else if (Rdf.equalTerms(frame.id, shape.id)) {
        // break on recursive shapes without an object shape in-between
        return true;
      }
    }
  }
  return false;
}

function isBreakingPointShape(shape: Shape, context: GenerateQueryContext) {
  if (shape.type === 'object') {
    return true;
  } else if (shape.type === 'list') {
    const {head} = resolveListShape(shape, context.listDefaults);
    return !isSelfPath(head);
  }
  return false;
}

function generateForUnion(
  shape: UnionShape,
  edge: Edge,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): void {
  const unionBlocks: SparqlJs.Pattern[] = [];
  for (const variantShape of shape.variants) {
    const blockPatterns: SparqlJs.Pattern[] = [];
    generateForShape(variantShape, edge, blockPatterns, context);
    if (blockPatterns.length > 0) {
      unionBlocks.push({type: 'group', patterns: blockPatterns});
    }
  }
  if (unionBlocks.length > 0) {
    out.push({type: 'union', patterns: unionBlocks});
  }
}

function generateForSetLikeShape(
  shape: SetShape | OptionalShape | MapShape,
  edge: Edge,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): void {
  const patterns: SparqlJs.Pattern[] = [];
  generateForShape(shape.itemShape, edge, patterns, context);
  if (patterns.length > 0) {
    if (shape.type === 'set' && (shape.minCount ?? 0) > 0) {
      for (const pattern of patterns) {
        out.push(pattern);
      }
    } else {
      out.push({type: 'optional', patterns});
    }
  }
}

function generateForNode(
  shape: ResourceShape | LiteralShape,
  edge: Edge,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): void {
  const {value} = shape;
  let effectiveEdge: Edge;
  if (value) {
    effectiveEdge = {
      subject: edge.subject,
      path: edge.path,
      object: value,
    };
  } else {
    effectiveEdge = edge;
  }
  generateEdge(effectiveEdge, out);
  context.addEdge(effectiveEdge);
}

function generateForList(
  shape: ListShape,
  edge: Edge,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): void {
  const {head, tail, nil} = resolveListShape(shape, context.listDefaults);

  generateEdge(edge, out);
  context.addEdge(edge);

  if (isBreakingPointShape(shape, context)) {
    edge = generateRecursiveEdge(shape, edge, out, context);
  }

  const nextPath = propertyPathToSparql(tail);
  const nodePath: SparqlJs.PropertyPath = {
    type: 'path',
    pathType: '*',
    items: [nextPath],
  };

  const listNode = isSelfPath(head)
    ? edge.object : context.makeVariable('listNode');
  const listNodeEdge: Edge = {subject: edge.object, path: nodePath, object: listNode};
  generateEdge(listNodeEdge, out);
  context.addEdge(listNodeEdge);

  const nextNode = context.makeVariable('nextNode');
  const nextEdge: Edge = {subject: listNode, path: nextPath, object: nextNode};
  generateEdge(nextEdge, out);
  context.addEdge(nextEdge);

  if (isSelfPath(head)) {
    generateForShape(shape.itemShape, {object: listNode}, out, context);
  } else {
    const headPath = propertyPathToSparql(head);
    const object = context.resolveSubject(shape);
    const headEdge: Edge = {subject: listNode, path: headPath, object};
    generateForShape(shape.itemShape, headEdge, out, context);
  }
}

function findRecursivePaths(origin: Shape, context: GenerateQueryContext) {
  const visiting = makeTermSet();
  const path: SparqlJsPredicate[] = [];

  function *visit(shape: Shape): Iterable<SparqlJsPredicate> {
    if (visiting.has(shape.id)) {
      if (Rdf.equalTerms(shape.id, origin.id)) {
        yield concatSparqlPaths('/', path);
      }
      return;
    }
    if (!Rdf.equalTerms(shape.id, origin.id)
      && context.visitingShapes.has(shape.id)
      && isBreakingPointShape(shape, context)
    ) {
      return;
    }
    visiting.add(shape.id);
    switch (shape.type) {
      case 'object':
        yield* visitProperties(shape.typeProperties);
        yield* visitProperties(shape.properties);
        break;
      case 'union':
        for (const variantShape of shape.variants) {
          yield* visit(variantShape);
        }
        break;
      case 'set':
      case 'optional':
      case 'map': {
        yield* visit(shape.itemShape);
        break;
      }
      case 'list': {
        const {head, tail} = resolveListShape(shape, context.listDefaults);
        path.push({
          type: 'path',
          pathType: '*',
          items: [propertyPathToSparql(tail)],
        });
        if (!isSelfPath(head)) {
          path.push(propertyPathToSparql(head));
        }
        yield* visit(shape.itemShape);
        if (!isSelfPath(head)) {
          path.pop();
        }
        path.pop();
        break;
      }
      case 'resource':
      case 'literal':
        break;
      default:
        assertUnknownShape(shape);
    }
    visiting.delete(shape.id);
  }

  function *visitProperties(
    properties: ReadonlyArray<ObjectProperty>
  ): Iterable<SparqlJsPredicate>  {
    for (const property of properties) {
      path.push(propertyPathToSparql(property.path));
      yield* visit(property.valueShape);
      path.pop();
    }
  }

  return visit(origin);
}

function findSubject(shape: Shape, context: GenerateQueryContext) {
  const visiting = makeTermSet();

  function *visit(shape: Shape): Iterable<Rdf.NamedNode> {
    if (visiting.has(shape.id)) { return; }
    visiting.add(shape.id);
    switch (shape.type) {
      case 'object':
        yield* visitProperties(shape.typeProperties);
        yield* visitProperties(shape.properties);
        break;
      case 'union':
        for (const variantShape of shape.variants) {
          yield* visit(variantShape);
        }
        break;
      case 'set':
      case 'optional':
      case 'map':
        yield* visit(shape.itemShape);
        break;
      case 'resource':
        if (shape.value && shape.value.termType === 'NamedNode') {
          yield shape.value;
        }
        break;
      case 'literal':
      case 'list':
        break;
      default:
        assertUnknownShape(shape);
        break;
    }
    visiting.delete(shape.id);
  }

  function *visitProperties(
    properties: ReadonlyArray<ObjectProperty>
  ): Iterable<Rdf.NamedNode>  {
    for (const property of properties) {
      if (isSelfPath(property.path)) {
        yield* visit(property.valueShape);
      }
    }
  }

  let term: Rdf.NamedNode | undefined;
  for (const subject of visit(shape)) {
    if (term) {
      term = undefined;
      break;
    }
    term = subject;
  }

  return term ? term : null;
}
