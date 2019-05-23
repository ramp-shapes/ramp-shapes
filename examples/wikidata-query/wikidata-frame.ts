import * as path from 'path';
import * as Ram from '../../src/index';
import { writeFile, makeDirectoryIfNotExists, toJson } from '../util';
import { Shapes, PeterTheGreatShape, Prefixes } from './wikidata-common';

const bindings = require('../../out/wikidata-query-result.json').results.bindings;

function toRdfTerm(value: any): Ram.Rdf.Term | null {
  return (
    value.type === 'uri' ? Ram.Rdf.namedNode(value.value) :
    value.type === 'literal' ? Ram.Rdf.literal(
      value.value,
      value['xml:lang'] ? value['xml:lang'] :
      value.datatype ? toRdfTerm(value.datatype) :
      undefined
    ) :
    value.type === 'bnode' ? Ram.Rdf.blankNode(value.value) :
    null
  );
}

(async function main() {
  const set = new Ram.HashSet(Ram.Rdf.hashQuad, Ram.Rdf.equalsQuad);
  for (const {subject, predicate, object} of bindings) {
    const quad = Ram.Rdf.quad(
      toRdfTerm(subject) as Ram.Rdf.Quad['subject'],
      toRdfTerm(predicate) as Ram.Rdf.Quad['predicate'],
      toRdfTerm(object) as Ram.Rdf.Quad['object'],
    );
    set.add(quad);
  }
  console.log('Total quads: ' + bindings.length);
  console.log('Unique quads: ' + set.size);

  const iterator = Ram.frame({
    rootShape: PeterTheGreatShape.id,
    shapes: Shapes,
    triples: [...set],
  });

  const outDir = path.join(__dirname, '../../out');
  makeDirectoryIfNotExists(outDir);

  let matched = false;
  for (const {value} of iterator) {
    if (matched) {
      throw new Error('Multiple matches!');
    }
    matched = true;
    
    await writeFile(
      path.join(outDir, 'wikidata-framed.json'),
      toJson(value),
      {encoding: 'utf-8'}
    );
  }
})();
