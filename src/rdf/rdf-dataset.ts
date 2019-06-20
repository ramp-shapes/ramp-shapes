import { HashMap, HashSet } from '../hash-map';
import { Quad, Term, hashTerm, equalTerms, hashQuad, equalQuads } from './rdf-model';

export interface Dataset extends Iterable<Quad> {
  readonly size: number;
  add(quad: Quad): this;
  addAll(quads: Iterable<Quad>): this;
  delete(quad: Quad): this;
  has(quad: Quad): boolean;
  match(
    subject: Term | undefined | null,
    predicate: Term | undefined | null,
    object: Term | undefined | null,
    graph?: Term | null
  ): Dataset;
  iterateMatches(
    subject: Term | undefined | null,
    predicate: Term | undefined | null,
    object: Term | undefined | null,
    graph?: Term | null
  ): Iterable<Quad>;
}

export function dataset(quads?: Iterable<Quad>) {
  const result = new SourcePredicateIndexedDataset();
  if (quads) {
    result.addAll(quads);
  }
  return result;
}

const EMPTY_QUADS: ReadonlyArray<Quad> = [];

class SourcePredicateIndexedDataset implements Dataset {
  private _size = 0;

  private byQuad = new HashSet(hashQuad, equalQuads);
  private bySubjectPredicate = new HashMap<SourcePredicateKey, Quad[]>(
    SourcePredicateKey.hashCode, SourcePredicateKey.equals
  );
  private byObjectPredicate = new HashMap<SourcePredicateKey, Quad[]>(
    SourcePredicateKey.hashCode, SourcePredicateKey.equals
  );

  get size(): number {
    return this._size;
  }
  
  add(quad: Quad): this {
    if (!this.byQuad.has(quad)) {
      this.byQuad.add(quad);
      pushToIndex(this.bySubjectPredicate, {source: quad.subject, predicate: quad.predicate}, quad);
      pushToIndex(this.byObjectPredicate, {source: quad.object, predicate: quad.predicate}, quad);
      this._size++;
    }
    return this;
  }

  addAll(quads: Iterable<Quad>): this {
    for (const quad of quads) {
      this.add(quad);
    }
    return this;
  }

  delete(quad: Quad): this {
    if (this.byQuad.has(quad)) {
      this.byQuad.delete(quad);
      deleteFromIndex(this.bySubjectPredicate, {source: quad.subject, predicate: quad.predicate}, quad);
      deleteFromIndex(this.byObjectPredicate, {source: quad.object, predicate: quad.predicate}, quad);
      this._size--;
    }
    return this;
  }

  has(quad: Quad): boolean {
    return this.byQuad.has(quad);
  }

  match(
    subject: Term | undefined | null,
    predicate: Term | undefined | null,
    object: Term | undefined | null,
    graph?: Term | null
  ): Dataset {
    const result = new SourcePredicateIndexedDataset();
    result.addAll(this.iterateMatches(subject, predicate, object, graph));
    return result;
  }

  iterateMatches(
    subject: Term | undefined | null,
    predicate: Term | undefined | null,
    object: Term | undefined | null,
    graph?: Term | null
  ): Iterable<Quad> {
    let result: Iterable<Quad>;
    if (subject && predicate) {
      result = this.bySubjectPredicate.get({source: subject, predicate}) || EMPTY_QUADS;
    } else if (predicate && object) {
      result = this.byObjectPredicate.get({source: object, predicate}) || EMPTY_QUADS;
    } else {
      result = filterBySPO(this, subject, predicate, object);
    }
    return graph ? filterByGraph(result, graph) : result;
  }

  [Symbol.iterator](): Iterator<Quad> {
    return this.byQuad[Symbol.iterator]();
  }
}

interface SourcePredicateKey {
  readonly source: Term;
  readonly predicate: Term;
}
namespace SourcePredicateKey {
  export function hashCode(key: SourcePredicateKey): number {
    return (hashTerm(key.source) * 31 + hashTerm(key.predicate)) | 0;
  }
  export function equals(a: SourcePredicateKey, b: SourcePredicateKey): boolean {
    return equalTerms(a.source, b.source) && equalTerms(a.predicate, b.predicate);
  }
}

function pushToIndex(
  index: HashMap<SourcePredicateKey, Quad[]>,
  key: SourcePredicateKey,
  quad: Quad
) {
  let items = index.get(key);
  if (!items) {
    items = [];
    index.set(key, items);
  }
  items.push(quad);
}

function deleteFromIndex(
  index: HashMap<SourcePredicateKey, Quad[]>,
  key: SourcePredicateKey,
  quad: Quad
) {
  const items = index.get(key);
  if (items) {
    for (let i = 0; i < items.length; i++) {
      if (equalQuads(items[i], quad)) {
        items.splice(i, 1);
        break;
      }
    }
  }
}

function *filterBySPO(
  quads: Iterable<Quad>,
  subject: Term | undefined | null,
  predicate: Term | undefined | null,
  object: Term | undefined | null,
) {
  for (const quad of quads) {
    if (subject && !equalTerms(subject, quad.subject)) {
      continue;
    }
    if (predicate && !equalTerms(predicate, quad.predicate)) {
      continue;
    }
    if (object && !equalTerms(object, quad.object)) {
      continue;
    }
    yield quad;
  }
}

function *filterByGraph(quads: Iterable<Quad>, graph: Term) {
  for (const quad of quads) {
    if (equalTerms(quad.graph, graph)) {
      yield quad;
    }
  }
}
