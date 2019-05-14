export type Term = NamedNode | BlankNode | Literal | Variable | DefaultGraph;

export class NamedNode {
  readonly termType = 'NamedNode';
  constructor(
    readonly value: string,
  ) {}
  equals(other: Term | undefined | null): boolean {
    return other && equals(this, other) || false;
  }
  hashCode?() {
    return hash(this);
  }
  toString() {
    return toString(this);
  }
}

export class BlankNode {
  readonly termType = 'BlankNode';
  constructor(
    readonly value: string,
  ) {}
  equals(other: Term | undefined | null): boolean {
    return other && equals(this, other) || false;
  }
  hashCode?() {
    return hash(this);
  }
  toString() {
    return toString(this);
  }
}

const RDF_LANG_STRING = new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#langString');
const XSD_STRING = new NamedNode('http://www.w3.org/2001/XMLSchema#string');

export class Literal {
  readonly termType = 'Literal';
  readonly value: string;
  readonly language: string;
  readonly datatype: NamedNode;
  constructor(value: string, languageOrDatatype?: string | NamedNode) {
    this.value = value;
    if (typeof languageOrDatatype === 'string') {
      this.language = languageOrDatatype;
      this.datatype = RDF_LANG_STRING;
    } else {
      this.language = "";
      this.datatype = languageOrDatatype || XSD_STRING;
    }
  }
  equals(other: Term | undefined | null): boolean {
    return other && equals(this, other) || false;
  }
  hashCode?() {
    return hash(this);
  }
  toString() {
    return toString(this);
  }
}

export class Variable {
  readonly termType = 'Variable';
  constructor(
    readonly value: string
  ) {}
  equals(other: Term | undefined | null): boolean {
    return other && equals(this, other) || false;
  }
  hashCode?() {
    return hash(this);
  }
  toString() {
    return toString(this);
  }
}

export class DefaultGraph {
  static readonly instance = new DefaultGraph();
  readonly termType = 'DefaultGraph';
  readonly value = '';
  constructor() {}
  equals(other: Term | undefined | null): boolean {
    return other && equals(this, other) || false;
  }
  hashCode?() {
    return hash(this);
  }
  toString() {
    return toString(this);
  }
}

export class Quad {
  constructor(
    readonly subject: NamedNode | BlankNode | Variable,
    readonly predicate: NamedNode | Variable,
    readonly object: NamedNode | BlankNode | Literal | Variable,
    readonly graph: DefaultGraph | NamedNode | BlankNode | Variable = DefaultGraph.instance,
  ) {}
  equals(other: Quad | undefined | null): boolean {
    return other
      && equals(this.subject, other.subject)
      && equals(this.predicate, other.predicate)
      && equals(this.object, other.object)
      && equals(this.graph, other.graph)
      || false;
  }
}

export function namedNode(value: string): NamedNode {
  return new NamedNode(value);
}

export function blankNode(value?: string): BlankNode {
  return typeof value === 'string'
    ? new BlankNode(value) : randomBlankNode('b', 48);
}

export function randomBlankNode(prefix: string, randomBitCount: number): BlankNode {
  if (randomBitCount > 48) {
    throw new Error(`Cannot generate random blank node with > 48 bits of randomness`);
  }
  const hexDigitCount = Math.ceil(randomBitCount / 4);
  const num = Math.floor(Math.random() * Math.pow(2, randomBitCount));
  const value = prefix + num.toString(16).padStart(hexDigitCount, '0');
  return new BlankNode(value);
}

export function literal(value: string, languageOrDatatype?: string | NamedNode): Literal {
  return new Literal(value, languageOrDatatype);
}

export function variable(value: string): Variable {
  return new Variable(value);
}

export function defaultGraph(): DefaultGraph {
  return DefaultGraph.instance;
}

export function quad(
  subject: Quad['subject'],
  predicate: Quad['predicate'],
  object: Quad['object'],
  graph?: Quad['graph'],
): Quad {
  return new Quad(subject, predicate, object, graph);
}

export function wrap(
  v:
    Pick<NamedNode, 'termType' | 'value'> |
    Pick<BlankNode, 'termType' | 'value'> |
    Pick<Literal, 'termType' | 'value' | 'language'>
      & { datatype: Pick<NamedNode, 'termType' | 'value'> } |
    Pick<Variable, 'termType' | 'value'> |
    Pick<DefaultGraph, 'termType'>
): Term | undefined {
  switch (v.termType) {
    case 'NamedNode':
      return new NamedNode(v.value);
    case 'BlankNode':
      return new BlankNode(v.value);
    case 'Literal':
      return new Literal(v.value, v.language || wrap(v.datatype) as NamedNode);
    case 'Variable':
      return new Variable(v.value);
    case 'DefaultGraph':
      return DefaultGraph.instance;
  }
}

export function toString(node: Term): string {
  switch (node.termType) {
    case 'NamedNode':
      return `<${node.value}>`;
    case 'BlankNode':
      return `_:${node.value}`;
    case 'Literal': {
      const {value, language, datatype} = node;
      const stringLiteral = `"${escapeLiteralValue(value)}"`;
      if (language) {
        return stringLiteral + `@${language}`;
      } else if (datatype) {
        return stringLiteral + '^^' + toString(datatype);
      } else {
        return stringLiteral;
      }
    }
    case 'DefaultGraph':
      return '(default graph)';
    case 'Variable':
      return `?${node.value}`;
  }
}

function escapeLiteralValue(value: string): string {
  return value
    .replace('"', '\\"')
    .replace('\t', '\\t')
    .replace('\r', '\\r')
    .replace('\n', '\\n');
}

export function hash(node: Term): number {
  let hash = 0;
  switch (node.termType) {
    case 'NamedNode':
    case 'BlankNode':
      hash = hashFnv32a(node.value);
      break;
    case 'Literal':
      hash = hashFnv32a(node.value);
      if (node.datatype) {
        hash = (hash * 31 + hashFnv32a(node.datatype.value)) | 0;
      }
      if (node.language) {
        hash = (hash * 31 + hashFnv32a(node.language)) | 0;
      }
      break;
    case 'Variable':
      hash = hashFnv32a(node.value);
      break;
  }
  return hash;
}

export function equals(a: Term, b: Term): boolean {
  if (a.termType !== b.termType) {
    return false;
  }
  switch (a.termType) {
    case 'NamedNode':
    case 'BlankNode':
    case 'Variable':
    case 'DefaultGraph': {
      const {value} = b as NamedNode | BlankNode | Variable | DefaultGraph;
      return a.value === value;
    }
    case 'Literal': {
      const {value, language, datatype} = b as Literal;
      return a.value === value
        && a.datatype.value === datatype.value
        && a.language === language;
    }
  }
}

/**
* Calculate a 32 bit FNV-1a hash
* Found here: https://gist.github.com/vaiorabbit/5657561
* Ref.: http://isthe.com/chongo/tech/comp/fnv/
*
* @param {string} str the input value
* @param {integer} [seed] optionally pass the hash of the previous chunk
* @returns {integer}
*/
function hashFnv32a(str: string, seed = 0x811c9dc5): number {
  /* tslint:disable:no-bitwise */
  let i: number, l: number, hval = seed & 0x7fffffff;

  for (i = 0, l = str.length; i < l; i++) {
    hval ^= str.charCodeAt(i);
    hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
  }
  return hval >>> 0;
  /* tslint:enable:no-bitwise */
}
