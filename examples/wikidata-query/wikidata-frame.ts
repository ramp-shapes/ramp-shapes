import fs from 'node:fs';
import path from 'node:path';

import * as Ramp from '../../src/index.js';
import {
  SparqlJsonQueryResponse, writeFile, makeDirectoryIfNotExists, toJson,
  parseJsonQueryResponse, quadsToTurtleString,
} from '../util.js';
import { Prefixes, AlexanderTheThirdDescendants } from './wikidata-common.js';

const queryResult = JSON.parse(fs.readFileSync(
  path.join(import.meta.dirname, '../../out/wikidata-query-result.json'),
  {encoding: 'utf-8'}
)) as SparqlJsonQueryResponse;

void (async function main() {
  const bindings = queryResult.results.bindings;
  const quads = parseJsonQueryResponse(bindings);
  const dataset = Ramp.dataset(quads);
  console.log(`Total quads: ${bindings.length}`);
  console.log(`Unique quads: ${dataset.size}`);

  const iterator = Ramp.frame({shape: AlexanderTheThirdDescendants, dataset});

  const outDir = path.join(import.meta.dirname, '../../out');
  await makeDirectoryIfNotExists(outDir);

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
