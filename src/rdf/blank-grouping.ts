import { HashSet } from '../hash-map';
import * as Rdf from './rdf-model';

export class GroupedQuad {
  constructor(
    readonly subject: Rdf.Quad['subject'] | BlankGroup | BlankList,
    readonly predicate: Rdf.Quad['predicate'],
    readonly object: Rdf.Quad['object'] | BlankGroup | BlankList,
    readonly graph: Rdf.Quad['graph']
  ) {}
  get termType() { return 'GroupedQuad' as const; }
}

export class BlankGroup {
  constructor(
    readonly content: ReadonlyArray<GroupedQuad>
  ) {}
  get termType() { return 'BlankGroup' as const; }
}

export class BlankList {
  constructor(
    readonly items: ReadonlyArray<Rdf.Term | BlankGroup | BlankList>
  ) {}
  get termType() { return 'BlankList' as const; }
}

export function *groupBlanks(quads: ReadonlyArray<Rdf.Quad>): Iterable<GroupedQuad | Rdf.Quad> {
  const blankStats = computeBlankStats(quads);
  const context: InlineContext = {
    quads,
    blankStats,
    visitingBlanks: new Set<string>(),
    alreadyInlined: new HashSet(Rdf.hashQuad, Rdf.equalQuads),

  };

  let i = 0;
  while (i < quads.length) {
    const q = quads[i];
    let child: BlankGroup | BlankList | undefined;
    if (q.object.termType === 'BlankNode') {
      const next = i + 1;
      const result = tryInlineChildGroupOrList(context, q.object, next);
      if (result && result.child) {
        i = result.next;
        child = result.child;
      }
    }

    if (child) {
      yield new GroupedQuad(q.subject, q.predicate, child, q.graph);
    } else {
      yield q;
      i++;
    }
  }
}

const RDF_NAMESPACE = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
const RDF_FIRST = Rdf.DefaultDataFactory.namedNode(RDF_NAMESPACE + 'first');
const RDF_REST = Rdf.DefaultDataFactory.namedNode(RDF_NAMESPACE + 'rest');
const RDF_NIL = Rdf.DefaultDataFactory.namedNode(RDF_NAMESPACE + 'nil');

interface InlineContext {
  readonly quads: ReadonlyArray<Rdf.Quad>;
  readonly blankStats: ReadonlyMap<string, BlankStatEntry>;
  readonly visitingBlanks: Set<string>;
}

function tryInlineChildGroupOrList(context: InlineContext, subject: Rdf.Term, start: number) {
  const {blankStats} = context;
  let next = start;
  let childList: BlankList | undefined;
  let childGroup: BlankGroup | undefined;

  if (!(subject.termType === 'BlankNode' && canInlineBlank(blankStats.get(subject.value)))) {
    return {next, child: childList || childGroup};
  }

  const listOutput: Array<Rdf.Term | BlankGroup | BlankList> = [];
  const nextList = tryInlineBlankList(context, subject, next, listOutput);
  if (nextList === null) { return null; }
  if (nextList > next) {
    next = nextList;
    childList = new BlankList(listOutput);
  }

  if (!childList) {
    const childOutput: GroupedQuad[] = [];
    const nextGroup = tryInlineBlankGroup(context, subject, next, childOutput);
    if (nextGroup === null) { return null; }
    if (nextGroup > next) {
      next = nextGroup;
      childGroup = new BlankGroup(childOutput);
    }
  }

  return {next, child: childList || childGroup};
}

function tryInlineBlankGroup(
  context: InlineContext, subject: Rdf.BlankNode | undefined, start: number, output: GroupedQuad[]
): number | null {
  const {quads, visitingBlanks} = context;
  if (subject) {
    if (visitingBlanks.has(subject.value)) { return null; }
    visitingBlanks.add(subject.value);
  }
  let i = start;
  while (i < quads.length) {
    const q = quads[i];
    if (subject && !Rdf.equalTerms(subject, q.subject)) {
      return i;
    }

    const result = tryInlineChildGroupOrList(context, q.object, i + 1);
    if (result === null) { return null; }

    output.push(new GroupedQuad(
      q.subject,
      q.predicate,
      result.child || (Rdf.equalTerms(q.object, RDF_NIL) ? new BlankList([]) : q.object),
      q.graph
    ));
    i = result.next;
  }
  if (subject) {
    visitingBlanks.delete(subject.value);
  }
  return quads.length;
}

function tryInlineBlankList(
  context: InlineContext, head: Rdf.BlankNode, start: number, output: Array<Rdf.Term | BlankGroup | BlankList>
): number | null {
  const {quads, blankStats, visitingBlanks} = context;
  if (blankMinIndex.get(head.value)! < start - 1) {
    return start;
  }

  let current = head;
  let i = start;
  while (i < quads.length) {
    if (visitingBlanks.has(current.value)) { return null; }
    visitingBlanks.add(current.value);

    let foundFirst = false;

    const qFirst = quads[i];
    if (Rdf.equalTerms(qFirst.subject, current) && Rdf.equalTerms(qFirst.predicate, RDF_FIRST)) {
      const next = i + 1;
      const result = tryInlineChildGroupOrList(context, qFirst.object, next);
      if (result === null) { return null; }
      foundFirst = true;
      i = result.next;
      output.push(result.child || qFirst.object);
    }

    let foundNil = false;
    let nextItem: Rdf.BlankNode | undefined;

    if (foundFirst && i < quads.length && blankMaxIndex.get(current.value)! <= i) {
      const qRest = quads[i];
      if (Rdf.equalTerms(qRest.subject, current) && Rdf.equalTerms(qRest.predicate, RDF_REST)) {
        if (Rdf.equalTerms(qRest.object, RDF_NIL)) {
          foundNil = true;
          i++;
        } else if (qRest.object.termType === 'BlankNode' && blankMinIndex.get(qRest.object.value)! === i) {
          nextItem = qRest.object;
          i++;
        }
      }
    }

    visitingBlanks.delete(current.value);
    if (foundNil) {
      return i;
    } else if (nextItem) {
      current = nextItem;
    } else {
      return start;
    }
  }

  return start;
}

interface BlankStatEntry {
  subjects: number;
  objects: number;
  graphs: number;
  rdfStarNested: boolean;
}

function computeBlankStats(quads: ReadonlyArray<Rdf.Quad>): Map<string, BlankStatEntry> {
  const stats = new Map<string, BlankStatEntry>();

  const getEntry = (blank: Rdf.BlankNode) => {
    let entry = stats.get(blank.value);
    if (!entry) {
      entry = {subjects: 0, objects: 0, graphs: 0, rdfStarNested: false};
      stats.set(blank.value, entry);
    }
    return entry;
  };

  const visitRdfNestedQuad = (quad: Rdf.Quad) => {
    switch (quad.subject.termType) {
      case 'BlankNode': {
        getEntry(quad.subject).rdfStarNested = true;
        break;
      }
      case 'Quad': {
        visitRdfNestedQuad(quad.subject);
        break;
      }
    }
    switch (quad.object.termType) {
      case 'BlankNode': {
        getEntry(quad.object).rdfStarNested = true;
        break;
      }
      case 'Quad': {
        visitRdfNestedQuad(quad.object);
        break;
      }
    }
    switch (quad.graph.termType) {
      case 'BlankNode': {
        getEntry(quad.graph).rdfStarNested = true;
        break;
      }
    }
  };

  const visitQuad = (quad: Rdf.Quad) => {
    switch (quad.subject.termType) {
      case 'BlankNode': {
        getEntry(quad.subject).subjects++;
        break;
      }
      case 'Quad': {
        visitRdfNestedQuad(quad.subject);
        break;
      }
    }
    switch (quad.object.termType) {
      case 'BlankNode': {
        getEntry(quad.object).objects++;
        break;
      }
      case 'Quad': {
        visitRdfNestedQuad(quad.object);
        break;
      }
    }
    switch (quad.graph.termType) {
      case 'BlankNode': {
        getEntry(quad.graph).graphs++;
      }
    }
  };

  for (const q of quads) {
    visitQuad(q);
  }

  return stats;
}

function canInlineBlank(entry: BlankStatEntry | undefined): boolean {
  return Boolean(
    entry &&
    entry.objects <= 1 &&
    entry.graphs === 0 &&
    !entry.rdfStarNested
  );
}
