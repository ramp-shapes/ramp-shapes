import * as SparqlJs from 'sparqljs';

import { HashSet } from './hash-map';
import * as Rdf from './rdf-model';
import {
  ShapeID, Shape, ObjectShape, ObjectProperty, PropertyPathSegment, UnionShape, SetShape,
  OptionalShape, ResourceShape, LiteralShape, ListShape, MapShape, ShapeReference
} from './shapes';
import {
  makeTermMap, makeTermSet, makeShapeResolver, assertUnknownShape,
  resolveListShapeDefaults,
} from './common';

export interface GenerateQueryParams {
  rootShape: ShapeID;
  shapes: ReadonlyArray<Shape>;
  base?: Rdf.NamedNode;
  prefixes?: { [prefix: string]: string };
}

export function generateQuery(params: GenerateQueryParams): SparqlJs.ConstructQuery {
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
    predicate: SparqlJs.PropertyPath | SparqlJs.Term,
    object: SparqlJs.Term,
  ): Iterable<SparqlJs.Triple> {
    if (typeof predicate === 'string') {
      yield {subject, predicate: predicate as SparqlJs.Term, object};
      return;
    }
    const path = predicate as SparqlJs.PropertyPath;
    if (path.pathType === '^' && path.items.length === 1) {
      yield* tryGeneratePropertyPath(object, path.items[0], subject);
    } else if (path.pathType === '/') {
      let s = subject;
      for (let i = 0; i < path.items.length - 1; i++) {
        const blankIndex = templateBlankIndex++;
        const o = `_:path_${blankIndex}` as SparqlJs.Term;
        yield* tryGeneratePropertyPath(s, path.items[i], o);
        s = o;
      }
      const last = path.items[path.items.length - 1];
      yield* tryGeneratePropertyPath(s, last, object);
    }
  }

  const subjects = makeTermMap<SparqlJs.Term | null>();
  let varIndex = 1;

  const context: GenerateQueryContext = {
    visitingShapes: makeTermSet() as HashSet<ShapeID>,
    stack: [],
    resolveShape: makeShapeResolver(params.shapes, shapeID => {
      throw new Error(
        `Failed to resolve shape ${Rdf.toString(shapeID)}`
      );
    }),
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
      return `?${prefix}_${index}` as SparqlJs.Term;
    },
    addEdge: edge => {
      if (edge.subject && edge.path && !isEmptyPath(edge.path)) {
        for (const triple of tryGeneratePropertyPath(edge.subject, edge.path, edge.object)) {
          templateTriples.push(triple);
        }
      }
    },
  };

  const rootShape = context.resolveShape(params.rootShape);
  const object = context.resolveSubject(rootShape);
  generateForShape(rootShape, {object}, wherePatterns, context);
  return query;
}

function isEmptyPath(predicate: SparqlJs.PropertyPath | SparqlJs.Term) {
  if (typeof predicate !== 'object') {
    return false;
  }
  const path = predicate as SparqlJs.PropertyPath;
  return path.pathType === '/' && path.items.length === 0;
}

interface GenerateQueryContext {
  readonly visitingShapes: HashSet<ShapeID>;
  readonly stack: Shape[];
  resolveShape(shapeID: ShapeID): Shape;
  resolveSubject(shape: Shape): SparqlJs.Term;
  makeVariable(prefix: string): SparqlJs.Term;
  addEdge(edge: Edge): void;
}

interface Edge {
  subject?: SparqlJs.Term;
  path?: SparqlJs.PropertyPath | SparqlJs.Term;
  object: SparqlJs.Term;
}

function generateEdge(edge: Edge, out: SparqlJs.Pattern[]) {
  if (edge.subject && edge.path && !isEmptyPath(edge.path)) {
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

function rdfTermToSparqlTerm(term: Rdf.Term): SparqlJs.Term {
  switch (term.termType) {
    case 'NamedNode':
      return term.value as SparqlJs.Term;
    case 'Literal':{
      const {value, language, datatype} = term;
      const stringLiteral = `"${escapeSparqlLiteralValue(value)}"`;
      if (language) {
        return stringLiteral + `@${language}` as SparqlJs.Term;
      } else if (datatype) {
        return stringLiteral + '^^' + datatype.value as SparqlJs.Term;
      } else {
        return stringLiteral as SparqlJs.Term;
      }
    }
    case 'BlankNode':
    case 'Variable':
      return Rdf.toString(term) as SparqlJs.Term;
    case 'DefaultGraph':
      throw new Error('Cannot convert default graph RDF term into SPARQL.js term');
  }
}

function escapeSparqlLiteralValue(value: string): string {
  return value
    .replace('"', '\\"')
    .replace('\t', '\\t')
    .replace('\r', '\\r')
    .replace('\n', '\\n');
}

type SparqlJsPredicate = SparqlJs.PropertyPath | SparqlJs.Term;

function propertyPathToSparql(
  path: ReadonlyArray<PropertyPathSegment>
): SparqlJsPredicate {
  if (path.length === 1 && !path[0].reverse) {
    return rdfTermToSparqlTerm(path[0].predicate);
  }
  return {
    type: 'path',
    pathType: '/',
    items: path.map((segment): SparqlJs.PropertyPath | SparqlJs.Term => {
      const predicate = rdfTermToSparqlTerm(segment.predicate);
      return segment.reverse
        ? {type: 'path', pathType: '^', items: [predicate]}
        : predicate
    })
  };
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

  if (isBreakingPointShape(shape)) {
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
    const shape = context.resolveShape(property.valueShape);
    const edge: Edge = {
      subject,
      path: propertyPathToSparql(property.path),
      object: context.resolveSubject(shape),
    };
    generateForShape(shape, edge, out, context);
  }
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

  const object = context.makeVariable(shape.type + "_r");
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
    if (isBreakingPointShape(shape)) {
      return true;
    }
    for (let i = context.stack.length - 1; i >= 0; i--) {
      const frame = context.stack[i];
      if (isBreakingPointShape(frame)) {
        // if we found a "breaking point" shape somewhere between current shape
        // and the previous instance of it then we should wait
        // for second instance of that shape, and only then break
        return false;
      } else if (Rdf.equals(frame.id, shape.id)) {
        // break on recursive shapes without an object shape in-between
        return true;
      }
    }
  }
  return false;
}

function isBreakingPointShape(shape: Shape) {
  if (shape.type === 'object') {
    return true;
  } else if (shape.type === 'list') {
    const {head} = resolveListShapeDefaults(shape);
    return head.length > 0;
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
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
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
  const itemShape = context.resolveShape(shape.itemShape);
  const patterns: SparqlJs.Pattern[] = [];
  generateForShape(itemShape, edge, patterns, context);
  if (patterns.length > 0) {
    out.push({type: 'optional', patterns});
  }
}

function generateForNode(
  shape: ResourceShape | LiteralShape,
  edge: Edge,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): void {
  const {value} = shape;
  let nodeEdge = edge;
  if (value && (value.termType === 'NamedNode' || value.termType === 'BlankNode')) {
    nodeEdge = {
      subject: edge.subject,
      path: edge.path,
      object: rdfTermToSparqlTerm(value),
    };
  }
  generateEdge(edge, out);
  context.addEdge(edge);
}

function generateForList(
  shape: ListShape,
  edge: Edge,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): void {
  const {head, tail, nil} = resolveListShapeDefaults(shape);

  const subject = edge.object;
  generateEdge(edge, out);
  context.addEdge(edge);

  if (isBreakingPointShape(shape)) {
    edge = generateRecursiveEdge(shape, edge, out, context);
  }
  
  const nextPath = propertyPathToSparql(tail);
  const nodePath: SparqlJs.PropertyPath = {
    type: 'path',
    pathType: '*',
    items: [nextPath],
  };

  const listNode = head.length === 0
    ? edge.object : context.makeVariable('listNode');
  const listNodeEdge: Edge = {subject, path: nodePath, object: listNode};
  generateEdge(listNodeEdge, out);
  context.addEdge(listNodeEdge);

  const nextNode = context.makeVariable('nextNode');
  const nextEdge: Edge = {subject: listNode, path: nextPath, object: nextNode};
  generateEdge(nextEdge, out);
  context.addEdge(nextEdge);
  
  const itemShape = context.resolveShape(shape.itemShape);
  if (head.length === 0) {
    generateForShape(itemShape, {object: listNode}, out, context);
  } else {
    const headPath = propertyPathToSparql(head);
    const object = context.resolveSubject(shape);
    const headEdge: Edge = {subject: listNode, path: headPath, object};
    generateForShape(itemShape, headEdge, out, context);
  }
}

function findRecursivePaths(origin: Shape, context: GenerateQueryContext) {
  const visiting = makeTermSet();
  const path: SparqlJsPredicate[] = [];

  function *visit(shape: Shape): Iterable<SparqlJsPredicate> {
    if (visiting.has(shape.id)) {
      if (Rdf.equals(shape.id, origin.id)) {
        yield concatSparqlPaths('/', path);
      }
      return;
    }
    if (!Rdf.equals(shape.id, origin.id)
      && context.visitingShapes.has(shape.id)
      && isBreakingPointShape(shape)
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
        for (const variant of shape.variants) {
          const variantShape = context.resolveShape(variant);
          yield* visit(variantShape);
        }
        break;
      case 'set':
      case 'optional':
      case 'map': {
        const itemShape = context.resolveShape(shape.itemShape);
        yield* visit(itemShape);
        break;
      }
      case 'list': {
        const {head, tail} = resolveListShapeDefaults(shape);
        path.push({
          type: 'path',
          pathType: '*',
          items: [propertyPathToSparql(tail)],
        });
        if (head.length > 0) {
          path.push(propertyPathToSparql(head));
        }
        const itemShape = context.resolveShape(shape.itemShape);
        yield* visit(itemShape);
        if (head.length > 0) {
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
      const valueShape = context.resolveShape(property.valueShape);
      yield* visit(valueShape);
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
        for (const variant of shape.variants) {
          const variantShape = context.resolveShape(variant);
          yield* visit(variantShape);
        }
        break;
      case 'set':
      case 'optional':
      case 'map':
        const itemShape = context.resolveShape(shape.itemShape);
        yield* visit(itemShape);
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
      if (property.path.length === 0) {
        const valueShape = context.resolveShape(property.valueShape);
        yield* visit(valueShape);
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

  return term ? rdfTermToSparqlTerm(term) : null;
}
