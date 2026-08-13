import fs from 'node:fs';
import type { Quad } from '@rdfjs/types';
import * as N3 from 'n3';
import * as SparqlJs from 'sparqljs';

import * as Ramp from '../src/index.js';

export function readQuadsFromTurtle(path: string): Quad[] {
  const ttl = fs.readFileSync(path, {encoding: 'utf-8'});
  const parser = new N3.Parser({factory: Ramp.DefaultDataFactory});
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
