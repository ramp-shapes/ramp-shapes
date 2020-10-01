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
  const {blankMinIndex, blankMaxIndex} = computeBlankRanges(quads);
  const context: WriteContext = {
    quads,
    blankMinIndex,
    blankMaxIndex,
    visitingBlanks: new Set<string>(),
  };

  let i = 0;
  while (i < quads.length) {
    const q = quads[i];
    let child: BlankGroup | BlankList | undefined;
    if (q.object.termType === 'BlankNode') {
      context.visitingBlanks.clear();
      const next = i + 1;
      const result = tryWriteChildGroupOrList(context, q.object, next);
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

interface WriteContext {
  readonly quads: ReadonlyArray<Rdf.Quad>;
  readonly blankMinIndex: ReadonlyMap<string, number>;
  readonly blankMaxIndex: ReadonlyMap<string, number>;
  readonly visitingBlanks: Set<string>;
}

function tryWriteChildGroupOrList(context: WriteContext, subject: Rdf.Term, start: number) {
  const {blankMinIndex, blankMaxIndex} = context;
  let next = start;
  let childList: BlankList | undefined;
  let childGroup: BlankGroup | undefined;

  if (!(subject.termType === 'BlankNode' && blankMinIndex.get(subject.value)! === start - 1)) {
    return {next, child: childList || childGroup};
  }

  const listOutput: Array<Rdf.Term | BlankGroup | BlankList> = [];
  const nextList = tryWriteBlankList(context, subject, next, listOutput);
  if (nextList === null) { return null; }
  if (nextList > next && nextList > blankMaxIndex.get(subject.value)!) {
    next = nextList;
    childList = new BlankList(listOutput);
  }

  if (!childList) {
    const childOutput: GroupedQuad[] = [];
    const nextGroup = tryWriteBlankGroup(context, subject, next, childOutput);
    if (nextGroup === null) { return null; }
    if (nextGroup > next && nextGroup > blankMaxIndex.get(subject.value)!) {
      next = nextGroup;
      childGroup = new BlankGroup(childOutput);
    }
  }

  return {next, child: childList || childGroup};
}

function tryWriteBlankGroup(
  context: WriteContext, subject: Rdf.BlankNode | undefined, start: number, output: GroupedQuad[]
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

    const result = tryWriteChildGroupOrList(context, q.object, i + 1);
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

function tryWriteBlankList(
  context: WriteContext, head: Rdf.BlankNode, start: number, output: Array<Rdf.Term | BlankGroup | BlankList>
): number | null {
  const {quads, blankMinIndex, blankMaxIndex, visitingBlanks} = context;
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
      const result = tryWriteChildGroupOrList(context, qFirst.object, next);
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

interface BlankRanges {
  blankMinIndex: ReadonlyMap<string, number>;
  blankMaxIndex: ReadonlyMap<string, number>;
}

function computeBlankRanges(quads: ReadonlyArray<Rdf.Quad>): BlankRanges {
  const blankMinIndex = new Map<string, number>();
  const blankMaxIndex = new Map<string, number>();

  const seenAt = (term: Rdf.Term, index: number) => {
    if (term.termType !== 'BlankNode') { return; }
    const previousMin = blankMinIndex.get(term.value);
    blankMinIndex.set(
      term.value,
      typeof previousMin === 'number' ? Math.min(previousMin, index) : index
    );
    const previousMax = blankMaxIndex.get(term.value);
    blankMaxIndex.set(
      term.value,
      typeof previousMax === 'number' ? Math.max(previousMax, index) : index
    );
  };

  for (let i = 0; i < quads.length; i++) {
    const q = quads[i];
    seenAt(q.subject, i);
    seenAt(q.object, i);
    seenAt(q.graph, i);
  }

  return {blankMinIndex, blankMaxIndex};
}
