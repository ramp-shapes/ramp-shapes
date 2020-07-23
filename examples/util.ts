import * as fs from 'fs';
import { promisify } from 'util';
import * as N3 from 'n3';
import { Rdf } from '../src/index';

const factory = Rdf.DefaultDataFactory;

export { quadsToTurtleString } from './turtle-blank';

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

export function readQuadsFromTurtle(path: string): Rdf.Quad[] {
  const ttl = fs.readFileSync(path, {encoding: 'utf-8'});
  const parser = new N3.Parser({factory, blankNodePrefix: ''});
  return parser.parse(ttl) as Rdf.Quad[];
}

export function toJson(match: unknown): string {
  return JSON.stringify(match, (key, value) => {
    if (typeof value === 'object' && value !== null && 'termType' in value) {
      return Rdf.toString(value as Rdf.Term);
    }
    return value;
  }, 2);
}

function jsonQueryResultTermToRdf(value: any): Rdf.Term | null {
  return (
    value.type === 'uri' ? factory.namedNode(value.value) :
    value.type === 'literal' ? factory.literal(
      value.value,
      value['xml:lang'] ? value['xml:lang'] :
      value.datatype ? jsonQueryResultTermToRdf(value.datatype) :
      undefined
    ) :
    value.type === 'bnode' ? factory.blankNode(value.value) :
    null
  );
}

export function parseJsonQueryResponse(bindings: any[]): Rdf.Quad[] {
  const quads: Rdf.Quad[] = [];
  for (const {subject, predicate, object} of bindings) {
    const quad = factory.quad(
      jsonQueryResultTermToRdf(subject) as Rdf.Quad['subject'],
      jsonQueryResultTermToRdf(predicate) as Rdf.Quad['predicate'],
      jsonQueryResultTermToRdf(object) as Rdf.Quad['object'],
    );
    quads.push(quad);
  }
  return quads;
}
