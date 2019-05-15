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

  let varIndex = 1;

  const context: GenerateQueryContext = {
    currentShapes: makeTermSet() as HashSet<ShapeID>,
    resolveShape: makeShapeResolver(params.shapes, shapeID => {
      throw new Error(
        `Failed to resolve shape ${Rdf.toString(shapeID)}`
      );
    }),
    makeVariable: prefix => {
      const index = varIndex++;
      return `?${prefix}_${index}` as SparqlJs.Term;
    },
    addEdge: (edge, object) => {
      if (edge && !isEmptyPath(edge.path)) {
        for (const triple of tryGeneratePropertyPath(edge.subject, edge.path, object)) {
          templateTriples.push(triple);
        }
      }
    },
  };

  const rootShape = context.resolveShape(params.rootShape);
  generateForShape(rootShape, undefined, wherePatterns, context);
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
  makeVariable(prefix: string): SparqlJs.Term;
  addEdge(edge: Edge | undefined, object: SparqlJs.Term): void;
}

interface Edge {
  subject: SparqlJs.Term;
  path: SparqlJs.PropertyPath | SparqlJs.Term;
}

function generateEdge(
  edge: Edge | undefined,
  object: SparqlJs.Term,
  out: SparqlJs.Pattern[]
) {
  if (edge && !isEmptyPath(edge.path)) {
    out.push({
      type: 'bgp',
      triples: [{
        subject: edge.subject,
        predicate: edge.path,
        object,
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
  edge: Edge | undefined,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): SparqlJs.Term {
  if (context.currentShapes.has(shape.id)) {
    const unresolvedObject = context.makeVariable(shape.type + '_un');
    generateEdge(edge, unresolvedObject, out);
    context.addEdge(edge, unresolvedObject);
    return unresolvedObject;
  }

  switch (shape.type) {
    case 'object':
      return generateForObject(shape, edge, out, context);
    case 'union':
      return generateForUnion(shape, edge, out, context);
    case 'set':
    case 'optional':
    case 'map':
      return generateForSetLikeShape(shape, edge, out, context);
    case 'resource':
    case 'literal':
      return generateForNode(shape, edge, out, context);
    case 'list':
      return generateForList(shape, edge, out, context);
    default:
      return assertUnknownShape(shape);
  }
}

function generateForObject(
  shape: ObjectShape,
  edge: Edge | undefined,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): SparqlJs.Term {
  const subject = context.makeVariable(shape.type);
  generateEdge(edge, subject, out);
  context.addEdge(edge, subject);
  generateForProperties(subject, shape.typeProperties, out, context);
  generateForProperties(subject, shape.properties, out, context);
  return subject;
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
    };
    generateForShape(shape, edge, out, context);
  }
}

function generateForUnion(
  shape: UnionShape,
  edge: Edge | undefined,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): SparqlJs.Term {
  const subject = context.makeVariable(shape.type);
  const unionBlocks: SparqlJs.Pattern[] = [];
  for (const variant of shape.variants) {
    const variantShape = context.resolveShape(variant);
    const blockPatterns: SparqlJs.Pattern[] = [];
    const object = generateForShape(variantShape, edge, blockPatterns, context);
    // generateEdge({subject, path: propertyPathToSparql([])}, object, blockPatterns);
    if (blockPatterns.length > 0) {
      unionBlocks.push({type: 'group', patterns: blockPatterns});
    }
  }
  if (unionBlocks.length > 0) {
    out.push({type: 'union', patterns: unionBlocks});
  }
  return subject;
}

function generateForSetLikeShape(
  shape: SetShape | OptionalShape | MapShape,
  edge: Edge | undefined,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): SparqlJs.Term {
  const itemShape = context.resolveShape(shape.itemShape);
  const patterns: SparqlJs.Pattern[] = [];
  const object = generateForShape(itemShape, edge, patterns, context);
  if (patterns.length > 0) {
    out.push({type: 'optional', patterns});
  }
  return object;
}

function generateForNode(
  shape: ResourceShape | LiteralShape,
  edge: Edge | undefined,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): SparqlJs.Term {
  const object = shape.value
    ? rdfTermToSparqlTerm(shape.value)
    : context.makeVariable(shape.type);
  generateEdge(edge, object, out);
  context.addEdge(edge, object);
  return object;
}

function generateForList(
  shape: ListShape,
  edge: Edge | undefined,
  out: SparqlJs.Pattern[],
  context: GenerateQueryContext,
): SparqlJs.Term {
  const {head, tail, nil} = resolveListShapeDefaults(shape);

  const subject = context.makeVariable(shape.type);
  generateEdge(edge, subject, out);
  context.addEdge(edge, subject);
  
  const nextPath = propertyPathToSparql(tail);
  const nodePath: SparqlJs.PropertyPath = {
    type: 'path',
    pathType: '*',
    items: [nextPath],
  };

  const listNode = context.makeVariable('listNode');
  const listNodeEdge: Edge = {subject, path: nodePath};
  generateEdge(listNodeEdge, listNode, out);
  context.addEdge(listNodeEdge, listNode);

  const nextNode = context.makeVariable('nextNode');
  const nextEdge: Edge = {subject: listNode, path: nextPath};
  generateEdge(nextEdge, nextNode, out);
  context.addEdge(nextEdge, nextNode);

  const itemShape = context.resolveShape(shape.itemShape);
  const headPath = propertyPathToSparql(head);
  generateForShape(itemShape, {subject: listNode, path: headPath}, out, context);

  return subject;
}
