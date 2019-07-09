import * as fs from 'fs';
import { promisify } from 'util';
import * as N3 from 'n3';

import * as Ram from '../src/index';
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

export function readJson(path: string): unknown {
  const json = fs.readFileSync(path, {encoding: 'utf-8'});
  return JSON.parse(json);
}

export function findFirstShape(
  quads: ReadonlyArray<Rdf.Quad>,
  shapes: ReadonlyArray<Ram.Shape>
): Ram.ShapeID | undefined {
  const shapeIds = new Set<string>();
  for (const shape of shapes) {
    shapeIds.add(shape.id.value);
  }
  const rootShapeQuad = quads.find(
    q => q.subject.termType === 'NamedNode' && shapeIds.has(q.subject.value)
  );
  return rootShapeQuad ? rootShapeQuad.subject as Rdf.NamedNode : undefined;
}
