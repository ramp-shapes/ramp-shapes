import type { DatasetCore, Term, BaseQuad, Quad } from '@rdfjs/types';
import { HashMap } from '@reactodia/hashmap';

import { BaseRdfQuad, hashTerm, equalTerms, hashQuad, equalQuads } from './rdf-model.js';

export interface LazyDatasetCore<
  OutQuad extends BaseQuad = Quad,
  InQuad extends BaseQuad = OutQuad
> extends DatasetCore<OutQuad, InQuad> {
  materialize(): DatasetCore<OutQuad, InQuad>;
}

export enum IndexQuadBy {
  /** Index by whole quad (default, required). */
  OnlyQuad = 0,
  /** Index by subject. */
  S = 1,
  /** Index by predicate. */
  P = 2,
  /** Index by object. */
  O = 4,
  /** Index by subject and predicate. */
  SP = 8,
  /** Index by object and predicate. */
  OP = 16,
  /* Reserved: SO = 32 */
  /** Index by graph */
  G = 64,
}

export function dataset(quads?: Iterable<Quad>): IndexedDataset {
  const dataset = IndexedDataset.create({ indexBy: IndexQuadBy.SP | IndexQuadBy.OP });
  if (quads) {
    dataset.addAll(quads);
  }
  return dataset;
}

export class IndexedDataset implements DatasetCore<Quad> {
  private readonly indexBy: IndexQuadBy;
  private _size = 0;

  private readonly byQuad: HashMap<BaseQuad, Quad>;
  private readonly bySubject: HashMap<Term, SmallQuadSet> | undefined;
  private readonly byPredicate: HashMap<Term, SmallQuadSet> | undefined;
  private readonly byObject: HashMap<Term, SmallQuadSet> | undefined;
  private readonly bySubjectPredicate: HashMap<SourcePredicateKey, SmallQuadSet> | undefined;
  private readonly byObjectPredicate: HashMap<SourcePredicateKey, SmallQuadSet> | undefined;
  private readonly byGraph: HashMap<Term, SmallQuadSet> | undefined;

  private constructor(indexBy: IndexQuadBy) {
    this.indexBy = indexBy;
    this.byQuad = new HashMap<Quad, Quad>(hashQuad, equalQuads);
    if (indexBy & IndexQuadBy.S) {
      this.bySubject = new HashMap<Term, SmallQuadSet>(hashTerm, equalTerms);
    }
    if (indexBy & IndexQuadBy.P) {
      this.byPredicate = new HashMap<Term, SmallQuadSet>(hashTerm, equalTerms);
    }
    if (indexBy & IndexQuadBy.O) {
      this.byObject = new HashMap<Term, SmallQuadSet>(hashTerm, equalTerms);
    }
    if (indexBy & IndexQuadBy.G) {
      this.byGraph = new HashMap<Term, SmallQuadSet>(hashTerm, equalTerms);
    }
    if (indexBy & IndexQuadBy.SP) {
      this.bySubjectPredicate = new HashMap<SourcePredicateKey, SmallQuadSet>(
        SourcePredicateKey.hashCode, SourcePredicateKey.equals
      );
    }
    if (indexBy & IndexQuadBy.OP) {
      this.byObjectPredicate = new HashMap<SourcePredicateKey, SmallQuadSet>(
        SourcePredicateKey.hashCode, SourcePredicateKey.equals
      );
    }
  }

  static create(options: { indexBy: IndexQuadBy }): IndexedDataset {
    const {indexBy} = options;
    return new IndexedDataset(indexBy);
  }

  get size(): number {
    return this._size;
  }

  add(quad: Quad): this {
    if (!this.byQuad.has(quad)) {
      this.byQuad.set(quad, quad);
      if (this.bySubject) {
        pushToIndex(this.bySubject, quad.subject, quad);
      }
      if (this.byPredicate) {
        pushToIndex(this.byPredicate, quad.predicate, quad);
      }
      if (this.byObject) {
        pushToIndex(this.byObject, quad.object, quad);
      }
      if (this.byGraph) {
        pushToIndex(this.byGraph, quad.graph, quad);
      }
      if (this.bySubjectPredicate) {
        pushToIndex(
          this.bySubjectPredicate,
          {source: quad.subject, predicate: quad.predicate},
          quad
        );
      }
      if (this.byObjectPredicate) {
        pushToIndex(
          this.byObjectPredicate,
          {source: quad.object, predicate: quad.predicate},
          quad
        );
      }
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
    const existing = this.byQuad.get(quad);
    if (existing) {
      this.byQuad.delete(existing);
      if (this.bySubject) {
        deleteFromIndex(this.bySubject, existing.subject, existing);
      }
      if (this.byPredicate) {
        deleteFromIndex(this.byPredicate, existing.predicate, existing);
      }
      if (this.byObject) {
        deleteFromIndex(this.byObject, existing.object, existing);
      }
      if (this.byGraph) {
        deleteFromIndex(this.byGraph, existing.graph, existing);
      }
      if (this.bySubjectPredicate) {
        deleteFromIndex(
          this.bySubjectPredicate,
          {source: quad.subject, predicate: quad.predicate},
          existing
        );
      }
      if (this.byObjectPredicate) {
        deleteFromIndex(
          this.byObjectPredicate,
          {source: quad.object, predicate: quad.predicate},
          existing
        );
      }
      this._size--;
    }
    return this;
  }

  clear(): void {
    this._size = 0;
    this.byQuad.clear();
    if (this.bySubject) {
      this.bySubject.clear();
    }
    if (this.byPredicate) {
      this.byPredicate.clear();
    }
    if (this.byObject) {
      this.byObject.clear();
    }
    if (this.byGraph) {
      this.byGraph.clear();
    }
    if (this.bySubjectPredicate) {
      this.bySubjectPredicate.clear();
    }
    if (this.byObjectPredicate) {
      this.byObjectPredicate.clear();
    }
  }

  has(quad: Quad): boolean {
    return this.byQuad.has(quad);
  }

  hasMatches(
    subject: Term | undefined | null,
    predicate: Term | undefined | null,
    object: Term | undefined | null,
    graph?: Term | null
  ): boolean {
    for (const q of this.iterateMatches(subject, predicate, object, graph)) {
      return true;
    }
    return false;
  }

  iterateMatches(
    subject: Term | undefined | null,
    predicate: Term | undefined | null,
    object: Term | undefined | null,
    graph?: Term | null
  ): Iterable<Quad> {
    let result: Iterable<Quad>;
    if (subject && predicate && object && graph) {
      const found = this.byQuad.get(new BaseRdfQuad(subject, predicate, object, graph));
      result = found ? [found] : [];
    } else if (this.bySubjectPredicate && subject && predicate) {
      const indexed = this.bySubjectPredicate.get({ source: subject, predicate });
      result = filterBySPO(iterateSmallSet(indexed), null, null, object);
    } else if (this.byObjectPredicate && predicate && object) {
      const indexed = this.byObjectPredicate.get({ source: object, predicate });
      result = filterBySPO(iterateSmallSet(indexed), subject, null, null);
    } else if (this.bySubject && subject) {
      const indexed = this.bySubject.get(subject);
      result = filterBySPO(iterateSmallSet(indexed), null, predicate, object);
    } else if (this.byPredicate && predicate) {
      const indexed = this.byPredicate.get(predicate);
      result = filterBySPO(iterateSmallSet(indexed), subject, null, object);
    } else if (this.byObject && object) {
      const indexed = this.byObject.get(object);
      result = filterBySPO(iterateSmallSet(indexed), subject, predicate, null);
    } else if (this.byGraph && graph) {
      const indexed = this.byGraph.get(graph);
      result = filterBySPO(iterateSmallSet(indexed), subject, predicate, object);
      // avoid double-filtering by graph
      return result;
    } else {
      result = filterBySPO(this.byQuad.values(), subject, predicate, object);
    }
    return graph ? filterByGraph(result, graph) : result;
  }

  match(
    subject?: Term | null,
    predicate?: Term | null,
    object?: Term | null,
    graph?: Term | null
  ): LazyDatasetCore<Quad, Quad> {
    return new LazyDataset(
      () => this.iterateMatches(subject, predicate, object, graph),
      this._createDataset
    );
  }

  private _createDataset = (quads: Iterable<Quad>) => {
    const matchSet = new IndexedDataset(this.indexBy);
    matchSet.addAll(quads);
    return matchSet;
  };

  [Symbol.iterator](): Iterator<Quad> {
    return this.byQuad.values();
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

type SmallQuadSet = Quad | Set<Quad> | undefined;

function iterateSmallSet(set: SmallQuadSet): Iterable<Quad> {
  return set instanceof Set ? set : (set ? [set] : []);
}

function pushToIndex<K>(index: HashMap<K, SmallQuadSet>, key: K, quad: Quad) {
  let bucket = index.get(key);
  if (!bucket) {
    bucket = quad;
    index.set(key, bucket);
  } else if (bucket instanceof Set) {
    bucket.add(quad);
  } else {
    const single = bucket;
    bucket = new Set<Quad>();
    bucket.add(single);
    bucket.add(quad);
    index.set(key, bucket);
  }
}

function deleteFromIndex<K>(index: HashMap<K, SmallQuadSet>, key: K, quad: Quad) {
  const items = index.get(key);
  if (items) {
    if (items instanceof Set) {
      items.delete(quad);
    } else {
      index.delete(key);
    }
  }
}

function* filterBySPO(
  quads: Iterable<Quad>,
  subject: Term | undefined | null,
  predicate: Term | undefined | null,
  object: Term | undefined | null,
): Iterable<Quad> {
  for (const quad of quads) {
    if (subject && !equalTerms(subject, quad.subject)) { continue; }
    if (predicate && !equalTerms(predicate, quad.predicate)) { continue; }
    if (object && !equalTerms(object, quad.object)) { continue; }
    yield quad;
  }
}

function* filterByGraph(quads: Iterable<Quad>, graph: Term): Iterable<Quad> {
  for (const quad of quads) {
    if (equalTerms(quad.graph, graph)) {
      yield quad;
    }
  }
}

class LazyDataset implements LazyDatasetCore<Quad> {
  private _materialized: DatasetCore<Quad> | undefined;

  constructor(
    private readonly _iterate: () => Iterable<Quad>,
    private readonly _create: (quads: Iterable<Quad>) => DatasetCore<Quad>
  ) {}

  materialize(): DatasetCore<Quad> {
    if (!this._materialized) {
      this._materialized = this._create(this._iterate());
    }
    return this._materialized;
  }

  get size(): number {
    return this.materialize().size;
  }

  add(quad: Quad): this {
    this.materialize().add(quad);
    return this;
  }

  delete(quad: Quad): this {
    this.materialize().delete(quad);
    return this;
  }

  has(quad: Quad): boolean {
    return this.materialize().has(quad);
  }

  match(
    subject?: Term | null,
    predicate?: Term | null,
    object?: Term | null,
    graph?: Term | null
  ): DatasetCore<Quad, Quad> {
    return this.materialize().match(subject, predicate, object, graph);
  }

  [Symbol.iterator](): Iterator<Quad> {
    const iterable = this._iterate();
    return iterable[Symbol.iterator]();
  }
}
