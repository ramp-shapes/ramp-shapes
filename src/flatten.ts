import type { DataFactory, BlankNode, Literal, NamedNode, Quad } from '@rdfjs/types';

import {
  DefaultDataFactory, type RawTerm, randomString, termToString, termFromRaw,
} from './rdf/rdf-model.js';
import {
  Shape, TypedShape, RecordProperty, PropertyPath, ResourceShape, LiteralShape,
  ValueMapper, getNestedPropertyPath,
} from './shapes.js';
import { SubjectMemo, makeListShapeDefaults, resolveListShape } from './common.js';
import { RampError, ErrorCode, formatDisplayShape, makeRampError } from './errors.js';
import {
  type TransformVisitor, type MatchCache, DefaultMatchCache, transform,
} from './transform.js';
import { valueUnmap } from './value-map.js';

export interface FlattenParams<S extends Shape> {
  value: S extends TypedShape<infer T> ? T : unknown;
  shape: S;
  factory?: DataFactory;
  /** Default mapper to use when no specific mapper is defined for a shape. */
  mapper?: ValueMapper<unknown, unknown>;
  /**
   * Causes quads for entities with non-blank subject to appear only after current stack of
   * blank groups or lists are emitted to produce better looking Turtle serialization.
   *
   * @default true
   */
  postponeNamed?: boolean;
  unstable_generateBlankNode?: (prefix: string) => BlankNode;
}

export function *flatten<S extends Shape>(params: FlattenParams<S>): Iterable<Quad> {
  const {
    factory = DefaultDataFactory,
    mapper,
    postponeNamed = true,
    unstable_generateBlankNode,
  } = params;
  const generateBlankNode = unstable_generateBlankNode || makeDefaultBlankNodeGenerator(factory);

  const listDefaults = makeListShapeDefaults(factory);

  const cache = new DefaultMatchCache<ShapeMatch>();
  const context: LowerContext = {
    factory,
    cache,
    generateBlankNode,
    generateSubject: (shape: Shape) => generateBlankNode(shape.type),
    makeError: (code, message) => makeRampError(code, message),
  };

  const queuedGenerations: Array<{ match: ShapeMatch; edge?: Edge }> = [];
  const pushMatchGeneration = (edge: Edge | undefined, match: ShapeMatch) => {
    if (postponeNamed && edge?.subject.termType === 'NamedNode') {
      queuedGenerations.push({match, edge});
      return [];
    } else {
      return match.generate(edge);
    }
  };

  const visitTerm = (
    value: RawTerm<NamedNode | BlankNode | Literal>,
    shape: ResourceShape | LiteralShape
  ): ShapeMatch => {
    const term = termFromRaw(factory, value);
    function nodes(): Iterable<RdfNode> {
      return [term];
    }
    function generate(edge: Edge | undefined): Iterable<Quad> {
      return generateEdge(edge, term, context);
    }
    return {nodes, generate};
  };

  const visitor: TransformVisitor<ShapeMatch> = {
    createPlaceholder: (hole) => new PlaceholderMatch(context, hole.shape, hole.value),
    resolvePlaceholder: (hole, match) => {/* ignore */},
    visitAnyOf: (match, shape, value) => match,
    visitList: (matches, shape, value) => {
      const {head, tail, nil} = resolveListShape(shape, listDefaults);
      const list = matches.length === 0 ? nil : context.generateBlankNode('list');

      function *nodes(): Iterable<RdfNode> {
        yield list;
      }

      function *generate(edge: Edge | undefined): Iterable<Quad> {
        yield* generateEdge(edge, list, context);
        let current = list;
        for (let i = 0; i < matches.length; i++) {
          const match = matches[i];
          yield* pushMatchGeneration({subject: current, path: head}, match);
          const next = i === matches.length - 1
            ? nil : context.generateBlankNode('list');
          yield* generatePropertyPath(current, tail, next, context);
          current = next;
        }
      }

      return {nodes, generate};
    },
    visitLiteral: visitTerm,
    visitNode: visitTerm,
    visitMap: (matches, shape, value) => {
      function *nodes() {
        for (const match of Object.values(matches)) {
          yield* match.nodes();
        }
      }

      function *generate(edge: Edge | undefined): Iterable<Quad> {
        for (const match of Object.values(matches)) {
          yield* match.generate(edge);
        }
      }

      return {nodes, generate};
    },
    visitOptional: (match, shape, value) => {
      function nodes(): Iterable<RdfNode> {
        return match ? match.nodes() : [];
      }
      function generate(edge: Edge | undefined): Iterable<Quad> {
        return match ? match.generate(edge) : [];
      }
      return {nodes, generate};
    },
    visitRecord: (matches, shape, value) => {
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

      function *generate(edge: Edge | undefined): Iterable<Quad> {
        yield* generateEdge(edge, subject, context);
        for (const {property, match} of matches) {
          if (property.kind === 'computed') {
            continue;
          }
          yield* pushMatchGeneration({subject, path: property.path}, match);
        }
      }

      return {nodes, generate};
    },
    visitSet: (matches, shape, value) => {
      function *nodes(): Iterable<RdfNode> {
        for (const match of matches) {
          yield* match.nodes();
        }
      }
      function *generate(edge: Edge | undefined): Iterable<Quad> {
        for (const match of matches) {
          yield* match.generate(edge);
        }
      }
      return {nodes, generate};
    },
  };

  const unmapped = valueUnmap({
    value: params.value,
    shape: params.shape,
    factory,
    defaultMapper: params.mapper,
  });

  const match = transform({
    shape: params.shape,
    value: unmapped,
    factory,
    visitor,
    cache,
    synthesizeTransient: true,
  });

  queuedGenerations.push({match});
  while (queuedGenerations.length > 0) {
    const {match, edge} = queuedGenerations.shift()!;
    yield* match.generate(edge);
  }
}

type RdfNode = NamedNode | BlankNode | Literal;

interface LowerContext {
  readonly factory: DataFactory;
  readonly cache: MatchCache<ShapeMatch>;
  generateBlankNode: (prefix: string) => BlankNode;
  generateSubject: (shape: Shape) => NamedNode | BlankNode;
  makeError(code: ErrorCode, message: string): RampError;
}

interface ShapeMatch {
  nodes: () => Iterable<RdfNode>;
  generate: (edge: Edge | undefined) => Iterable<Quad>;
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

  *generate(edge: Edge | undefined): Iterable<Quad> {
    const match = this.context.cache.get(this.shape, this.value);
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

interface Edge {
  subject: NamedNode | BlankNode;
  path: PropertyPath;
}

function generateEdge(
  edge: Edge | undefined,
  object: RdfNode,
  context: LowerContext
): Iterable<Quad> {
  return edge ? generatePropertyPath(edge.subject, edge.path, object, context) : [];
}

function *generatePropertyPath(
  subject: RdfNode,
  path: PropertyPath,
  object: RdfNode,
  context: LowerContext
): Iterable<Quad> {
  switch (path.type) {
    case 'predicate': {
      if (subject.termType === 'Literal') {
        throw context.makeError(
          ErrorCode.CannotUseLiteralAsSubject,
          `Cannot put literal ${termToString(subject)} as subject with ` +
          `predicate ${termToString(path.predicate)}`
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

function isSelfProperty(property: RecordProperty) {
  return (
    property.kind !== 'computed' &&
    property.path.type === 'sequence' &&
    property.path.sequence.length === 0
  );
}

function makeDefaultBlankNodeGenerator(factory: DataFactory) {
  const blankUniqueKey = randomString('', 24);
  let blankIndex = 1;
  return (prefix: string) => {
    const index = blankIndex++;
    return factory.blankNode(`${prefix}_${blankUniqueKey}_${index}`);
  };
}
