import * as fs from 'node:fs';
import { promisify } from 'node:util';
import type { Term, Quad } from '@rdfjs/types';
import * as N3 from 'n3';

import * as Ramp from '../src/index.js';

export { quadsToTurtleString } from './turtle-blank.js';

const factory = Ramp.DefaultDataFactory;

export const exists = promisify(fs.exists);
export const mkdir = promisify(fs.mkdir);
export const readdir = promisify(fs.readdir);
export const readFile = promisify(fs.readFile);
export const writeFile = promisify(fs.writeFile);

export async function makeDirectoryIfNotExists(path: string) {
  if (!(await exists(path))) {
    await mkdir(path);
  }
}

export function readQuadsFromTurtle(path: string): Quad[] {
  const ttl = fs.readFileSync(path, {encoding: 'utf-8'});
  const parser = new N3.Parser({factory, blankNodePrefix: ''});
  return parser.parse(ttl) as Quad[];
}

export function toJson(match: unknown): string {
  return JSON.stringify(match, (key, value: unknown) => {
    if (typeof value === 'object' && value !== null && 'termType' in value) {
      return Ramp.termToString(value as Term);
    }
    return value;
  }, 2);
}

type SparqlJsonTerm = SparqlJsonIri | SparqlJsonBlank | SparqlJsonLiteral;

interface SparqlJsonIri {
  readonly type: 'uri';
  readonly value: string;
}

interface SparqlJsonBlank {
  readonly type: 'bnode';
  readonly value: string;
}

interface SparqlJsonLiteral {
  readonly type: 'literal';
  readonly value: string;
  readonly datatype?: string;
  readonly 'xml:lang'?: string;
}

function jsonQueryResultTermToRdf(value: SparqlJsonTerm): Term | null {
  return (
    value.type === 'uri' ? factory.namedNode(value.value) :
    value.type === 'literal' ? factory.literal(value.value, (
      value['xml:lang'] ? value['xml:lang'] :
      value.datatype ? factory.namedNode(value.datatype) :
      undefined
    )) :
    value.type === 'bnode' ? factory.blankNode(value.value) :
    null
  );
}

export interface SparqlJsonQueryResponse {
  results: {
    bindings: SparqlJsonQuad[];
  };
}

interface SparqlJsonQuad {
  readonly subject: SparqlJsonTerm;
  readonly predicate: SparqlJsonTerm;
  readonly object: SparqlJsonTerm;
}

export function parseJsonQueryResponse(bindings: SparqlJsonQuad[]): Quad[] {
  const quads: Quad[] = [];
  for (const {subject, predicate, object} of bindings) {
    const quad = factory.quad(
      jsonQueryResultTermToRdf(subject) as Quad['subject'],
      jsonQueryResultTermToRdf(predicate) as Quad['predicate'],
      jsonQueryResultTermToRdf(object) as Quad['object'],
    );
    quads.push(quad);
  }
  return quads;
}
