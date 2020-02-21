import * as fs from 'fs';
import { promisify } from 'util';
import * as N3 from 'n3';
import * as SparqlJs from 'sparqljs';

import * as Ramp from '../src/index';
import { Rdf } from '../src/index';

export const exists = promisify(fs.exists);
export const mkdir = promisify(fs.mkdir);
export const readdir = promisify(fs.readdir);
export const readFile = promisify(fs.readFile);
export const writeFile = promisify(fs.writeFile);

export function readQuadsFromTurtle(path: string): Rdf.Quad[] {
  const ttl = fs.readFileSync(path, {encoding: 'utf-8'});
  const parser = N3.Parser();
  return parser.parse(ttl) as Rdf.Quad[];
}

export function readCyclicJson(path: string): unknown {
  const json = fs.readFileSync(path, {encoding: 'utf-8'});
  const refs = new Map<number, unknown>();
  const holes: Array<{ use: number; target: any; key: string }> = [];
  const parsed = JSON.parse(json, function (key, value) {
    if (key === '@ref') {
      if (typeof value !== 'number') {
        throw new Error(`Invalid non-number object definition {"@ref": ...}`);
      }
      if (refs.has(value)) {
        throw new Error(`Duplicate object definition: {"@ref": ${value}}`);
      }
      refs.set(value, this);
      return undefined;
    }
    if (typeof value === 'object' && value.hasOwnProperty('@use')) {
      const useRef = value['@use'];
      if (typeof useRef !== 'number') {
        throw new Error(`Invalid non-number object reference {"@use": ...}`);
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
  quads: ReadonlyArray<Rdf.Quad>,
  shapes: ReadonlyArray<Ramp.Shape>
): Ramp.Shape | undefined {
  const shapeIds = new Set<string>();
  for (const shape of shapes) {
    shapeIds.add(shape.id.value);
  }
  for (const q of quads) {
    if (q.subject.termType === 'NamedNode' && shapeIds.has(q.subject.value)) {
      return shapes.find(shape => Rdf.equalTerms(shape.id, q.subject));
    }
  }
  return undefined;
}
