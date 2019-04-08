import * as fs from 'fs';
import * as N3 from 'n3';
import { Rdf } from "../src/index";

export function readTriplesFromTurtle(path: string): Rdf.Quad[] {
  const ttl = fs.readFileSync(path, {encoding: 'utf-8'});
  const parser = N3.Parser();
  return parser.parse(ttl).map(quad => Rdf.quad(
    Rdf.wrap(quad.subject) as Rdf.Quad['subject'],
    Rdf.wrap(quad.predicate) as Rdf.Quad['predicate'],
    Rdf.wrap(quad.object) as Rdf.Quad['object'],
    Rdf.wrap(quad.graph) as Rdf.Quad['graph'],
  ));
}

export function rdfToN3(v: Rdf.Term): N3.Term {
  switch (v.termType) {
    case 'NamedNode':
      return N3.DataFactory.namedNode(v.value);
    case 'BlankNode':
      return N3.DataFactory.blankNode(v.value);
    case 'Literal':
      return N3.DataFactory.literal(v.value, v.language || rdfToN3(v.datatype) as N3.NamedNode);
    case 'Variable':
      return N3.DataFactory.variable(v.value);
    case 'DefaultGraph':
      return N3.DataFactory.defaultGraph();
  }
}

export function toJson(match: unknown): string {
  return JSON.stringify(match, null, 2);
}

export function triplesToTurtleString(
  triples: Iterable<Rdf.Quad>,
  prefixes: { [prefix: string]: string }
): Promise<string> {
  const quads: N3.Quad[] = [];
  for (const q of triples) {
    const s = rdfToN3(q.s) as N3.Quad['subject'];
    const p = rdfToN3(q.p) as N3.Quad['predicate'];
    const o = rdfToN3(q.o) as N3.Quad['object'];
    const g = rdfToN3(q.g) as N3.Quad['graph'];
    quads.push(N3.DataFactory.quad(s, p, o, g));
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
