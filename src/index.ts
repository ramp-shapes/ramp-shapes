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

export function unifyTriplesToJson(shape: Shape, triples: ReadonlyArray<Rdf.Triple>): any {
  switch (shape.type) {
    case 'object':
      return unifyObject(shape, triples);
  }
}

function *unifyShape(
  shape: Shape,
  candidates: ReadonlyHashSet<Rdf.Node>,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<unknown> {

}

function *unifyObject(
  shape: ObjectShape,
  candidates: ReadonlyHashSet<Rdf.Node>,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<{ candidate: Rdf.Node; value: unknown }> {
  let objects = makeNodeMap<{ [fieldName: string]: unknown }>();
  for (const candidate of candidates) {
    objects.set(candidate, {});
  }

  for (const field of shape.fields) {
    if (objects.size === 0) {
      break;
    }

    const filtered = makeNodeSet();
    for (const [candidate] of objects) {
      filtered.add(candidate);
    }

    const nextObjects = makeNodeMap<{ [fieldName: string]: unknown }>();
    for (const {candidate, value} of unifyField(field, filtered, triples)) {
      const previousValue = objects.get(candidate)!;
      nextObjects.set(candidate, {...previousValue, [field.fieldName]: value});
    }
    objects = nextObjects;
  }

  for (const [candidate, value] of objects) {
    yield {candidate, value};
  }
}

function *unifyFields(
  fields: ReadonlyArray<ObjectField>,
  template: { [fieldName: string]: unknown },
  candidates: ReadonlyHashSet<Rdf.Node>,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<{ candidate: Rdf.Node; value: { [fieldName: string]: unknown } }> {
  const [field, ...otherFields] = fields;
  const filtered = makeNodeSet();
  for (const {candidate, value} of unifyField(field, candidates, triples)) {
    filtered.add(candidate);
  }
}

function *unifyField(
  field: ObjectField,
  candidates: ReadonlyHashSet<Rdf.Node>,
  triples: ReadonlyArray<Rdf.Triple>
): Iterable<{ candidate: Rdf.Node; value: unknown }> {
  const sourceToTargets = triples.reduce((acc: HashMap<Rdf.Node, HashSet<Rdf.Node>>, {s, p, o}: Rdf.Triple) => {
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
    if (candidates.has(source)) {
      let targets = acc.get(source);
      if (!targets) {
        targets = makeNodeSet();
        acc.set(source, targets);
      }
      targets.add(target);
    }
    return acc;
  }, makeNodeMap());

  for (const [source, targets] of sourceToTargets) {
    for (const value of unifyShape(field.valueShape, targets, triples)) {
      return {value, candidate: source};
    }
  }
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
