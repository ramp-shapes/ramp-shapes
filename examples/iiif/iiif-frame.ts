import { join } from 'path';
import * as Ramp from '../../src/index';
import { toJson, readQuadsFromTurtle } from '../util';

const shapes = Ramp.frameShapes(Ramp.Rdf.dataset(
  readQuadsFromTurtle(join(__dirname, 'iiif-shapes.ttl'))
));

const quads = readQuadsFromTurtle(join(__dirname, '../../out/iiif-query-result.ttl'));
const dataset = Ramp.Rdf.dataset(quads);
console.log(`Total quads: ${quads.length}; Unique quads: ${dataset.size}`);

/* tslint:disable: quotemark */
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
  ramp: Ramp.vocabulary.NAMESPACE,
};
/* tslint:enable: quotemark */

const manifestShapeId = Ramp.Rdf.namedNode(PREFIXES.sc + 'Manifest');
const manifestShape = shapes.find(shape => Ramp.Rdf.equalTerms(shape.id, manifestShapeId))!;
const iterator = Ramp.frame({shape: manifestShape, dataset});

for (const {value} of iterator) {
  console.log(toJson(value));
}
