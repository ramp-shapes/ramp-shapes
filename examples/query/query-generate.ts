import { join } from 'path';
import * as SparqlJs from 'sparqljs';
import * as rxj from '../../src/index';
import { toJson, readTriplesFromTurtle, triplesToTurtleString } from '../util';

const triples = readTriplesFromTurtle(join(__dirname, 'query-shapes.ttl'));
const shapes = rxj.frameShapes(triples);

const PREFIXES: { [prefix: string]: string } = {
  "sc": "http://iiif.io/api/presentation/2#",
  "iiif": "http://iiif.io/api/image/2#",
  "exif": "http://www.w3.org/2003/12/exif/ns#",
  "oa": "http://www.w3.org/ns/oa#",
  "cnt": "http://www.w3.org/2011/content#",
  "dc": "http://purl.org/dc/elements/1.1/",
  "dcterms": "http://purl.org/dc/terms/",
  "dctypes": "http://purl.org/dc/dcmitype/",
  "doap": "http://usefulinc.com/ns/doap#",
  "foaf": "http://xmlns.com/foaf/0.1/",
  "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
  "xsd": "http://www.w3.org/2001/XMLSchema#",
  "svcs": "http://rdfs.org/sioc/services#",
  "as": "http://www.w3.org/ns/activitystreams#",
  rxj: rxj.vocabulary.NAMESPACE,
};

const query = rxj.generateQuery({
  rootShape: rxj.Rdf.namedNode(PREFIXES['sc'] + 'Manifest'),
  shapes: shapes,
  prefixes: PREFIXES,
});

const generator = new SparqlJs.Generator();
const queryString = generator.stringify(query);
console.log(queryString);
