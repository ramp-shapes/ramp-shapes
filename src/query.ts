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

  const subjects = makeTermMap<SparqlJs.Term>();
  let varIndex = 1;

  const context: GenerateQueryContext = {
    currentShapes: makeTermSet() as HashSet<ShapeID>,
    resolveShape: makeShapeResolver(params.shapes, shapeID => {
      throw new Error(
        `Failed to resolve shape ${Rdf.toString(shapeID)}`
      );
    }),
    resolveSubject: (shape: Shape) => {
      let subject = subjects.get(shape.id);
      if (!subject) {
        subject = findSubject(shape, context);
        subjects.set(shape.id, subject);
      }
      return subject;
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
  currentShapes: HashSet<ShapeID>;
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

function propertyPathToSparql(
  path: ReadonlyArray<PropertyPathSegment>
): SparqlJs.PropertyPath | SparqlJs.Term {
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

function generateForShape(
  shape: Shape,
  edge: Edge,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): void {
  if (context.currentShapes.has(shape.id)) {
    const unresolvedEdge: Edge = {
      subject: edge.subject,
      path: edge.path,
      object: context.makeVariable(shape.type + '_un'),
    }
    generateEdge(unresolvedEdge, out);
    context.addEdge(unresolvedEdge);
    return;
  }

  context.currentShapes.add(shape.id);
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
  context.currentShapes.delete(shape.id);
}

function generateForObject(
  shape: ObjectShape,
  edge: Edge,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): void {
  generateEdge(edge, out);
  context.addEdge(edge);

  const subject = edge.object;
  const object = generateRecursiveAlternatives(shape, subject, out, context);
  generateForProperties(object || subject, shape.typeProperties, out, context);
  generateForProperties(object || subject, shape.properties, out, context);
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

function generateRecursiveAlternatives(
  shape: ObjectShape,
  subject: SparqlJs.Term,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext
): SparqlJs.Term | undefined {
  const alternatives = [...findRecursivePaths(shape, context)];
  if (alternatives.length === 0) {
    return undefined;
  }

  const object = context.makeVariable(shape.type + "_r");

  const sparqlAlternatives: Array<SparqlJs.Term | SparqlJs.PropertyPath> = [];
  for (const alternative of alternatives) {
    const fullPath: PropertyPathSegment[] = [];
    for (const property of alternative) {
      for (const segement of property.path) {
        fullPath.push(segement);
      }
    }
    const sparqlPath = propertyPathToSparql(fullPath);
    sparqlAlternatives.push(sparqlPath);
  }
  
  out.push({
    type: 'bgp',
    triples: [{
      subject: subject,
      predicate: {
        type: 'path',
        pathType: '*',
        items: sparqlAlternatives.length > 1 ? [{
          type: 'path',
          pathType: '|',
          items: sparqlAlternatives,
        }] : sparqlAlternatives,
      },
      object: object,
    }]
  });

  return object;
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
  
  const nextPath = propertyPathToSparql(tail);
  const nodePath: SparqlJs.PropertyPath = {
    type: 'path',
    pathType: '*',
    items: [nextPath],
  };

  const listNode = context.makeVariable('listNode');
  const listNodeEdge: Edge = {subject, path: nodePath, object: listNode};
  generateEdge(listNodeEdge, out);
  context.addEdge(listNodeEdge);

  const nextNode = context.makeVariable('nextNode');
  const nextEdge: Edge = {subject: listNode, path: nextPath, object: nextNode};
  generateEdge(nextEdge, out);
  context.addEdge(nextEdge);

  const itemShape = context.resolveShape(shape.itemShape);
  const headPath = propertyPathToSparql(head);
  const object = context.resolveSubject(shape);
  const headEdge: Edge = {subject: listNode, path: headPath, object};
  generateForShape(itemShape, headEdge, out, context);
}

function findRecursivePaths(origin: Shape, context: GenerateQueryContext) {
  const visiting = makeTermSet();
  const path: ObjectProperty[] = [];

  function *visit(shape: Shape): Iterable<ObjectProperty[]> {
    if (!Rdf.equals(shape.id, origin.id) && context.currentShapes.has(shape.id)) {
      return;
    }
    if (visiting.has(shape.id)) {
      if (Rdf.equals(shape.id, origin.id)) {
        yield [...path];
      }
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
      case 'map':
      case 'list':
        const itemShape = context.resolveShape(shape.itemShape);
        yield* visit(itemShape);
        break;
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
  ): Iterable<ObjectProperty[]>  {
    for (const property of properties) {
      path.push(property);
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

  return term ? rdfTermToSparqlTerm(term) : context.makeVariable(shape.type);
}
