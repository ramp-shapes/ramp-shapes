import * as fs from 'fs';
import * as N3 from 'n3';
import { Rdf } from "../src/index";

export function readTriplesFromTurtle(path: string): Rdf.Triple[] {
  const ttl = fs.readFileSync(path, {encoding: 'utf-8'});
  const parser = N3.Parser();
  return parser.parse(ttl).reduce((acc: Rdf.Triple[], quad) => {
    const s = n3ToRdf(quad.subject);
    const p = n3ToRdf(quad.predicate);
    const o = n3ToRdf(quad.object);
    if (s && p && o) {
      acc.push({s, p, o});
    }
    return acc;
  }, []);
}

export function n3ToRdf(v: N3.Term): Rdf.Node | undefined {
  switch (v.termType) {
    case 'NamedNode':
      return Rdf.iri(v.value);
    case 'BlankNode':
      return Rdf.blank(v.value);
    case 'Literal':
      if (v.datatypeString === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString') {
        return Rdf.langString(v.value, v.language);
      } else {
        return Rdf.literal(v.value, Rdf.iri(v.datatypeString));
      }
    default:
      return undefined;
  }
}

export function rdfToN3(v: Rdf.Node): N3.NamedNode | N3.BlankNode | N3.Literal {
  switch (v.type) {
    case 'uri':
      return N3.DataFactory.namedNode(v.value);
    case 'bnode':
      return N3.DataFactory.blankNode(v.value);
    case 'literal':
      const datatypeOrLanguage = (
        v.datatype === 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString' ? v["xml:lang"] :
        typeof v.datatype === 'string' ? N3.DataFactory.namedNode(v.datatype) :
        undefined
      );
      return N3.DataFactory.literal(v.value, datatypeOrLanguage);
  }
}

export function toJson(match: unknown): string {
  return JSON.stringify(match, (key, value) => {
    if (typeof value === 'object' && value !== null &&
      (Rdf.isIri(value) || Rdf.isLiteral(value) || Rdf.isBlank(value))
    ) {
      return Rdf.toString(value);
    }
    return value;
  }, 2);
}

export function triplesToTurtleString(
  triples: Iterable<Rdf.Triple>,
  prefixes: { [prefix: string]: string }
): Promise<string> {
  const quads: N3.Quad[] = [];
  for (const {s, p, o} of triples) {
    const ns = rdfToN3(s);
    const np = rdfToN3(p);
    const no = rdfToN3(o);
    if ((ns.termType === 'NamedNode' || ns.termType === 'BlankNode') &&
      (np.termType === 'NamedNode')
    ) {
      quads.push(N3.DataFactory.quad(ns, np, no));
    }
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
