import * as path from 'path';
import * as Ram from '../../src/index';
import { writeFile, makeDirectoryIfNotExists, toJson, parseJsonQueryResponse } from '../util';
import { Shapes, PeterTheGreatDescendants } from './wikidata-common';

const queryResult = require('../../out/wikidata-query-result.json');

(async function main() {
  const bindings = queryResult.results.bindings;
  const dataset = Ram.Rdf.dataset(parseJsonQueryResponse(bindings));
  console.log('Total quads: ' + bindings.length);
  console.log('Unique quads: ' + dataset.size);

  const iterator = Ram.frame({
    rootShape: PeterTheGreatDescendants,
    shapes: Shapes,
    dataset,
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
