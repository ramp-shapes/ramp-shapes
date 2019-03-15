import * as fs from 'fs';
import * as N3 from 'n3';
import { Rdf } from "../src/index";

export function readTriplesFromTtl(path: string): Rdf.Triple[] {
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

function n3ToRdf(v: N3.Term): Rdf.Node | undefined {
  switch (v.termType) {
    case 'NamedNode':
      return Rdf.iri(v.value);
    case 'BlankNode':
      return Rdf.blank(v.value);
    case 'Literal':
      if (v.datatypeString === 'http://www.w3.org/2000/01/rdf-schema#langString') {
        return Rdf.langString(v.value, v.language);
      } else {
        return Rdf.literal(v.value, Rdf.iri(v.datatypeString));
      }
    default:
      return undefined;
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
