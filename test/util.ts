import fs from 'node:fs';
import type {
  BlankNode, DataFactory, DefaultGraph, DirectionalLanguage, Literal, NamedNode,
  Quad, Quad_Graph, Quad_Object, Quad_Predicate, Quad_Subject, Variable,
} from '@rdfjs/types';
import * as N3 from 'n3';
import * as SparqlJs from 'sparqljs';

import * as Ramp from '../src/index.js';

export function readQuadsFromTurtle(path: string, factory = Ramp.DefaultDataFactory): Quad[] {
  const ttl = fs.readFileSync(path, {encoding: 'utf-8'});
  const parser = new N3.Parser({factory, blankNodePrefix: ''});
  return parser.parse(ttl);
}

export function readCyclicJson(path: string): unknown {
  const json = fs.readFileSync(path, {encoding: 'utf-8'});
  const refs = new Map<number, unknown>();
  const holes: Array<{ use: number; target: Record<string, unknown>; key: string }> = [];
  const parsed: unknown = JSON.parse(json, function (this: Record<string, unknown>, key, value: unknown) {
    if (key === '@ref') {
      if (typeof value !== 'number') {
        throw new Error('Invalid non-number object definition {"@ref": ...}');
      }
      if (refs.has(value)) {
        throw new Error(`Duplicate object definition: {"@ref": ${value}}`);
      }
      refs.set(value, this);
      return undefined;
    }
    if (typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, '@use')) {
      const useRef = (value as { '@use': unknown })['@use'];
      if (typeof useRef !== 'number') {
        throw new Error('Invalid non-number object reference {"@use": ...}');
      }
      holes.push({use: useRef, target: this, key});
      return undefined;
    }
    return value;
  });
  for (const hole of holes) {
    if (!refs.has(hole.use)) {
      throw new Error(`Failed to find object reference: {"@use": ${hole.use}}`);
    }
    const ref = refs.get(hole.use);
    hole.target[hole.key] = ref;
  }
  return parsed;
}

export function breakReferenceCycles(root: unknown): void {
  const assignedRefs = new Map<unknown, number>();
  const visiting = new Set<unknown>();

  const visit = (value: unknown): unknown => {
    if (visiting.has(value)) {
      let ref = assignedRefs.get(value);
      if (ref === undefined) {
        ref = assignedRefs.size;
        assignedRefs.set(value, ref);
        (value as Record<string, unknown>)['@ref'] = ref;
      }
      return {'@use': ref};
    }
    visiting.add(value);
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item: unknown = value[i];
        const changed = visit(item);
        if (changed !== item) {
          value[i] = changed;
        }
      }
    } else if (Ramp.looksLikeTerm(value)) {
      /* ignore */
    } else if (typeof value === 'object' && value !== null) {
      for (const key in value) {
        if (Object.hasOwnProperty.call(value, key)) {
          const nested = (value as Record<string, unknown>)[key];
          const changed = visit(nested);
          if (changed !== nested) {
            (value as Record<string, unknown>)[key] = changed;
          }
        }
      }
    }
    visiting.delete(value);
    return value;
  };

  visit(root);
}

export function readQuery(path: string): SparqlJs.SparqlQuery {
  const queryText = fs.readFileSync(path, {encoding: 'utf-8'});
  return new SparqlJs.Parser().parse(queryText);
}

export function findFirstShape(
  quads: ReadonlyArray<Quad>,
  shapes: ReadonlyArray<Ramp.Shape>
): Ramp.Shape | undefined {
  const shapeIds = new Set<string>();
  for (const shape of shapes) {
    shapeIds.add(shape.id.value);
  }
  for (const q of quads) {
    if (q.subject.termType === 'NamedNode' && shapeIds.has(q.subject.value)) {
      return shapes.find(shape => Ramp.equalTerms(shape.id, q.subject));
    }
  }
  return undefined;
}

export class SequentialDataFactory implements DataFactory {
  private nextBlankIndex: number;

  constructor(
    private readonly baseFactory: DataFactory,
    blankStartIndex = 0
  ) {
    this.variable = baseFactory.variable ? (value) => baseFactory.variable!(value) : undefined;
    this.nextBlankIndex = blankStartIndex;
  }

  namedNode<Iri extends string = string>(value: Iri): NamedNode<Iri> {
    return this.baseFactory.namedNode(value);
  }

  blankNode(value?: string): BlankNode {
    return this.baseFactory.blankNode(value ?? `b${this.nextBlankIndex++}`);
  }

  literal(value: string, languageOrDatatype?: string | NamedNode | DirectionalLanguage): Literal {
    return this.baseFactory.literal(value, languageOrDatatype);
  }

  variable: ((value: string) => Variable) | undefined;

  defaultGraph(): DefaultGraph {
    return this.baseFactory.defaultGraph();
  }

  quad(subject: Quad_Subject, predicate: Quad_Predicate, object: Quad_Object, graph?: Quad_Graph): Quad {
    return this.baseFactory.quad(subject, predicate, object, graph);
  }

  fromTerm(original: any): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return this.baseFactory.fromTerm(original);
  }

  fromQuad(original: Quad): Quad {
    return this.baseFactory.fromQuad(original);
  }
}
