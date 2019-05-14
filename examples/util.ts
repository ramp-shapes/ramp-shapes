import * as fs from 'fs';
import * as N3 from 'n3';
import { Rdf } from "../src/index";

export function readTriplesFromTurtle(path: string): Rdf.Quad[] {
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

export function triplesToTurtleString(
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
