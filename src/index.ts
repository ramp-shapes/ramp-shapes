import { HashMap, HashSet, ReadonlyHashMap, ReadonlyHashSet, hashFnv32a } from './hash-map';
import * as Rdf from './rdf-model';

export type Shape = ObjectShape | ArrayShape | UnionShape | ConstantShape | PlaceholderShape;

export interface ObjectShape {
  readonly type: 'object';
  readonly fields: ReadonlyArray<ObjectField>;
}

export interface ObjectField {
  readonly type: 'field';
  readonly fieldName: string;
  readonly direction: 'to-subject' | 'to-object';
  readonly predicate: Rdf.Iri;
  readonly valueShape: Shape;
}

export interface ArrayShape {
  readonly type: 'array';
  readonly itemShape: Shape;
}

export interface UnionShape {
  readonly type: 'union';
  readonly variants: ReadonlyArray<Shape>;
}

export interface ConstantShape {
  readonly type: 'constant';
  readonly value: Rdf.Node;
}

export interface PlaceholderShape {
  readonly type: 'placeholder';
  readonly id: string | undefined;
}

export namespace Shape {
  export type PartialField = Pick<ObjectField, 'direction' | 'predicate' | 'valueShape'>;

  export function iri(value: string): Rdf.Iri {
    return {type: 'uri', value};
  }

  export function literal(value: string, dataType?: Rdf.Iri): Rdf.Literal {
    return {
      type: 'literal',
      datatype: dataType ? dataType.value : undefined,
      value,
    };
  }

  export function object(fields: { [fieldName: string]: PartialField }): ObjectShape {
    return {
      type: 'object',
      fields: Object.keys(fields).map((fieldName): ObjectField => ({
        type: 'field',
        fieldName,
        ...fields[fieldName],
      })),
    }
  }

  export function refersTo(predicate: Rdf.Iri, valueShape: Shape): PartialField {
    return {direction: 'to-object', predicate, valueShape};
  }

  export function referredFrom(predicate: Rdf.Iri, valueShape: Shape): PartialField {
    return {direction: 'to-subject', predicate, valueShape};
  }

  export function oneOf(...variants: Shape[]): UnionShape {
    return {type: 'union', variants};
  }

  export function constant(value: Rdf.Node): ConstantShape {
    return {type: 'constant', value};
  }

  export function placeholder(id?: string): PlaceholderShape {
    return {type: 'placeholder', id};
  }
}

export function *unifyTriplesToJson(
  shape: Shape,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<unknown> {
  const allCandidates = findAllCandidates(triples);
  yield* unifyShape(shape, allCandidates, triples);
}

function *unifyShape(
  shape: Shape,
  candidates: ReadonlyHashSet<Rdf.Node>,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<unknown> {
  switch (shape.type) {
    case 'object':
      yield* unifyObject(shape, candidates, triples);
      break;
    case 'union':
      yield* unifyUnion(shape, candidates, triples);
      break;
    case 'array':
      yield* unifyArray(shape, candidates, triples);
      break;
    case 'constant':
      yield* unifyConstant(shape, candidates, triples);
      break;
    case 'placeholder':
      yield* unifyPlaceholder(shape, candidates, triples);
  }
}

function *unifyObject(
  shape: ObjectShape,
  candidates: ReadonlyHashSet<Rdf.Node>,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<unknown> {
  const template: { [fieldName: string]: unknown } = {};
  for (const candidate of candidates) {
    yield* unifyFields(shape.fields, template, candidate, triples);
  }
}

function *unifyFields(
  fields: ReadonlyArray<ObjectField>,
  template: { [fieldName: string]: unknown },
  candidate: Rdf.Node,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<unknown> {
  if (fields.length === 0) {
    yield template;
  }
  const [field, ...otherFields] = fields;
  for (const value of unifyField(field, candidate, triples)) {
    template[field.fieldName] = value;
    yield* unifyFields(otherFields, template, candidate, triples);
    delete template[field.fieldName];
  }
}

function *unifyField(
  field: ObjectField,
  candidate: Rdf.Node,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<unknown> {
  const targets = triples.reduce((acc: HashSet<Rdf.Node>, {s, p, o}: Rdf.Triple) => {
    if (!equalsNode(field.predicate, p)) {
      return acc;
    }
    let source: Rdf.Node;
    let target: Rdf.Node;
    if (field.direction === 'to-object') {
      source = s;
      target = o;
    } else {
      source = o;
      target = s;
    }
    if (equalsNode(candidate, source)) {
      acc.add(target);
    }
    return acc;
  }, makeNodeSet());

  yield* unifyShape(field.valueShape, targets, triples);
}

function *unifyUnion(
  shape: UnionShape,
  candidates: ReadonlyHashSet<Rdf.Node>,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<unknown> {
  for (const variant of shape.variants) {
    yield* unifyShape(variant, candidates, triples);
  }
}

function *unifyArray(
  shape: ArrayShape,
  candidates: ReadonlyHashSet<Rdf.Node>,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<unknown> {
  yield Array.from(unifyShape(shape.itemShape, candidates, triples));
}

function *unifyConstant(
  shape: ConstantShape,
  candidates: ReadonlyHashSet<Rdf.Node>,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<unknown> {
  for (const candidate of candidates) {
    if (equalsNode(candidate, shape.value)) {
      yield candidate;
    }
  }
}

function *unifyPlaceholder(
  shape: PlaceholderShape,
  candidates: ReadonlyHashSet<Rdf.Node>,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<unknown> {
  for (const candidate of candidates) {
    yield candidate;
  }
}

function findAllCandidates(triples: ReadonlyArray<Rdf.Triple>) {
  const candidates = makeNodeSet();
  for (const {s, p, o} of triples) {
    if (Rdf.isIri(s)) {
      candidates.add(s);
    }
    if (Rdf.isIri(o)) {
      candidates.add(o);
    }
  }
  return candidates;
}

function makeNodeSet() {
  return new HashSet<Rdf.Node>(hashNode, equalsNode);
}

function makeNodeMap<V>() {
  return new HashMap<Rdf.Node, V>(hashNode, equalsNode);
}

function hashNode(node: Rdf.Node): number {
  let hash = 0;
  switch (node.type) {
    case 'uri':
      hash = hashFnv32a(node.value);
      break;
    case 'literal':
      hash = hashFnv32a(node.value);
      if (node.datatype) {
        hash = (hash * 31 + hashFnv32a(node.datatype)) | 0;
      }
      if (node["xml:lang"]) {
        hash = (hash * 31 + hashFnv32a(node["xml:lang"])) | 0;
      }
      break;
    case 'bnode':
      hash = hashFnv32a(node.value);
      break;
  }
  return hash;
}

function equalsNode(a: Rdf.Node, b: Rdf.Node): boolean {
  if (a.type !== b.type) {
    return false;
  }
  switch (a.type) {
    case 'uri': {
      const {value} = b as Rdf.Iri;
      return a.value === value;
    }
    case 'literal': {
      const {value, datatype, "xml:lang": lang} = b as Rdf.Literal;
      return a.value === value && a.datatype === datatype && a["xml:lang"] === lang;
    }
    case 'bnode': {
      const {value} = b as Rdf.Blank;
      return a.value === value;
    }
  }
}
