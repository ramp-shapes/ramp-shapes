import * as fs from 'fs';
import { promisify } from 'util';
import * as N3 from 'n3';
import { Rdf, HashSet } from "../src/index";

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
  const parser = N3.Parser();
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

export function quadsToTurtleString(
  triples: Iterable<Rdf.Quad>,
  prefixes: { [prefix: string]: string }
): Promise<string> {
  const quads: N3.Quad[] = [];
  for (const q of triples) {
    quads.push(N3.DataFactory.quad(
      q.subject,
      q.predicate,
      q.object,
      q.graph
    ));
  }
  
  return new Promise((resolve, reject) => {
    const writer = new N3.Writer({prefixes});
    writer.addQuads(quads);
    writer.end((error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  });
}

function jsonQueryResultTermToRdf(value: any): Rdf.Term | null {
  return (
    value.type === 'uri' ? Rdf.namedNode(value.value) :
    value.type === 'literal' ? Rdf.literal(
      value.value,
      value['xml:lang'] ? value['xml:lang'] :
      value.datatype ? jsonQueryResultTermToRdf(value.datatype) :
      undefined
    ) :
    value.type === 'bnode' ? Rdf.blankNode(value.value) :
    null
  );
}

export function parseJsonQueryResponse(bindings: any[]): HashSet<Rdf.Quad> {
  const set = new HashSet(Rdf.hashQuad, Rdf.equalQuads);
  for (const {subject, predicate, object} of bindings) {
    const quad = Rdf.quad(
      jsonQueryResultTermToRdf(subject) as Rdf.Quad['subject'],
      jsonQueryResultTermToRdf(predicate) as Rdf.Quad['predicate'],
      jsonQueryResultTermToRdf(object) as Rdf.Quad['object'],
    );
    set.add(quad);
  }
  return set;
}
