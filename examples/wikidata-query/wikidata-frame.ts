import * as path from 'path';
import * as Ramp from '../../src/index';
import {
  writeFile, makeDirectoryIfNotExists, toJson, parseJsonQueryResponse, quadsToTurtleString
} from '../util';
import { Prefixes, Shapes, AlexanderTheThirdDescendants } from './wikidata-common';

const queryResult = require('../../out/wikidata-query-result.json');

(async function main() {
  const bindings = queryResult.results.bindings;
  const quads = parseJsonQueryResponse(bindings);
  const dataset = Ramp.Rdf.dataset(quads);
  console.log('Total quads: ' + bindings.length);
  console.log('Unique quads: ' + dataset.size);

  const iterator = Ramp.frame({
    rootShape: AlexanderTheThirdDescendants,
    shapes: Shapes,
    dataset,
  });

  const outDir = path.join(__dirname, '../../out');
  makeDirectoryIfNotExists(outDir);

  await writeFile(
    path.join(outDir, 'wikidata-query-result.ttl'),
    await quadsToTurtleString(quads, Prefixes),
    {encoding: 'utf-8'}
  );

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
