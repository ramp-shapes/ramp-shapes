import { join } from 'path';
import * as Ram from '../../src/index';
import { toJson, readQuadsFromTurtle } from '../util';

const shapes = Ram.frameShapes(Ram.Rdf.dataset(
  readQuadsFromTurtle(join(__dirname, 'iiif-shapes.ttl'))
));

const quads = readQuadsFromTurtle(join(__dirname, '../../out/iiif-query-result.ttl'));
const dataset = Ram.Rdf.dataset(quads);
console.log(`Total quads: ${quads.length}; Unique quads: ${dataset.size}`);

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
  ram: Ram.vocabulary.NAMESPACE,
};

const iterator = Ram.frame({
  rootShape: Ram.Rdf.namedNode(PREFIXES['sc'] + 'Manifest'),
  shapes,
  dataset,
});

for (const {value} of iterator) {
  console.log(toJson(value));
}
