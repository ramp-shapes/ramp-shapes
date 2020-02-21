export type Term = NamedNode | BlankNode | Literal | Variable | DefaultGraph;

interface TermBase {
  readonly termType: string;
  readonly value: string;
  equals(other: Term | undefined | null): boolean;
  hashCode?(): number;
  toString(): string;
}

export interface NamedNode extends TermBase {
  readonly termType: 'NamedNode';
}

export interface BlankNode extends TermBase {
  readonly termType: 'BlankNode';
}

export interface Literal extends TermBase {
  readonly termType: 'Literal';
  readonly language: string;
  readonly datatype: NamedNode;
}

export interface Variable extends TermBase {
  readonly termType: 'Variable';
}

export interface DefaultGraph extends TermBase {
  readonly termType: 'DefaultGraph';
  readonly value: '';
}

class RdfNamedNode implements NamedNode {
  get termType() { return 'NamedNode' as const; }
  constructor(
    readonly value: string,
  ) {}
  equals(other: Term | undefined | null): boolean {
    return other && equalTerms(this, other) || false;
  }
  hashCode(): number {
    return hashTerm(this);
  }
  toString(): string {
    return toString(this);
  }
}

class RdfBlankNode implements BlankNode {
  get termType() { return 'BlankNode' as const; }
  constructor(
    readonly value: string,
  ) {}
  equals(other: Term | undefined | null): boolean {
    return other && equalTerms(this, other) || false;
  }
  hashCode(): number {
    return hashTerm(this);
  }
  toString(): string {
    return toString(this);
  }
}

const RDF_LANG_STRING: NamedNode = new RdfNamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#langString');
const XSD_STRING: NamedNode = new RdfNamedNode('http://www.w3.org/2001/XMLSchema#string');

class RdfLiteral implements Literal {
  get termType() { return 'Literal' as const; }
  readonly value: string;
  readonly language: string;
  readonly datatype: NamedNode;
  constructor(value: string, languageOrDatatype?: string | NamedNode) {
    this.value = value;
    if (typeof languageOrDatatype === 'string') {
      this.language = languageOrDatatype;
      this.datatype = RDF_LANG_STRING;
    } else {
      this.language = '';
      this.datatype = languageOrDatatype || XSD_STRING;
    }
  }
  equals(other: Term | undefined | null): boolean {
    return other && equalTerms(this, other) || false;
  }
  hashCode(): number {
    return hashTerm(this);
  }
  toString(): string {
    return toString(this);
  }
}

class RdfVariable implements Variable {
  get termType() { return 'Variable' as const; }
  constructor(
    readonly value: string
  ) {}
  equals(other: Term | undefined | null): boolean {
    return other && equalTerms(this, other) || false;
  }
  hashCode(): number {
    return hashTerm(this);
  }
  toString(): string {
    return toString(this);
  }
}

class RdfDefaultGraph implements DefaultGraph {
  static readonly instance = new RdfDefaultGraph();
  get termType() { return 'DefaultGraph' as const; }
  readonly value = '';
  equals(other: Term | undefined | null): boolean {
    return other && equalTerms(this, other) || false;
  }
  hashCode(): number {
    return hashTerm(this);
  }
  toString(): string {
    return toString(this);
  }
}

export interface Quad {
  readonly subject: NamedNode | BlankNode | Variable;
  readonly predicate: NamedNode | Variable;
  readonly object: NamedNode | BlankNode | Literal | Variable;
  readonly graph: DefaultGraph | NamedNode | BlankNode | Variable;
  hashCode?(): number;
  equals(other: Quad | undefined | null): boolean;
  toString(): string;
}

class RdfQuad implements Quad {
  constructor(
    readonly subject: NamedNode | BlankNode | Variable,
    readonly predicate: NamedNode | Variable,
    readonly object: NamedNode | BlankNode | Literal | Variable,
    readonly graph: DefaultGraph | NamedNode | BlankNode | Variable = RdfDefaultGraph.instance,
  ) {}
  hashCode(): number {
    return hashQuad(this);
  }
  equals(other: Quad | undefined | null): boolean {
    return other && equalQuads(this, other) || false;
  }
  toString() {
    let text = `${toString(this.subject)} ${toString(this.predicate)} ${toString(this.object)}`;
    if (this.graph.termType !== 'DefaultGraph') {
      text += ` ${toString(this.graph)}`;
    }
    return text;
  }
}

export function namedNode(value: string): NamedNode {
  return new RdfNamedNode(value);
}

export function blankNode(value?: string): BlankNode {
  return typeof value === 'string'
    ? new RdfBlankNode(value) : randomBlankNode('b', 48);
}

export function randomBlankNode(prefix: string, randomBitCount: number): BlankNode {
  if (randomBitCount > 48) {
    throw new Error(`Cannot generate random blank node with > 48 bits of randomness`);
  }
  const hexDigitCount = Math.ceil(randomBitCount / 4);
  const num = Math.floor(Math.random() * Math.pow(2, randomBitCount));
  const value = prefix + num.toString(16).padStart(hexDigitCount, '0');
  return blankNode(value);
}

export function literal(value: string, languageOrDatatype?: string | NamedNode): Literal {
  return new RdfLiteral(value, languageOrDatatype);
}

export function variable(value: string): Variable {
  return new RdfVariable(value);
}

export function defaultGraph(): DefaultGraph {
  return RdfDefaultGraph.instance;
}

export function quad(
  subject: Quad['subject'],
  predicate: Quad['predicate'],
  object: Quad['object'],
  graph?: Quad['graph'],
): Quad {
  return new RdfQuad(subject, predicate, object, graph);
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
      return namedNode(v.value);
    case 'BlankNode':
      return blankNode(v.value);
    case 'Literal':
      return literal(v.value, v.language || wrap(v.datatype) as NamedNode);
    case 'Variable':
      return variable(v.value);
    case 'DefaultGraph':
      return defaultGraph();
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

export function hashTerm(node: Term): number {
  let hash = 0;
  switch (node.termType) {
    case 'NamedNode':
    case 'BlankNode':
      hash = hashFnv32a(node.value);
      break;
    case 'Literal':
      hash = hashFnv32a(node.value);
      if (node.datatype) {
        // tslint:disable-next-line: no-bitwise
        hash = (hash * 31 + hashFnv32a(node.datatype.value)) | 0;
      }
      if (node.language) {
        // tslint:disable-next-line: no-bitwise
        hash = (hash * 31 + hashFnv32a(node.language)) | 0;
      }
      break;
    case 'Variable':
      hash = hashFnv32a(node.value);
      break;
  }
  return hash;
}

export function equalTerms(a: Term, b: Term): boolean {
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

export function hashQuad(quad: Quad): number {
  /* tslint:disable: no-bitwise */
  let h = 0;
  h = (h * 31 + hashTerm(quad.subject)) | 0;
  h = (h * 31 + hashTerm(quad.predicate)) | 0;
  h = (h * 31 + hashTerm(quad.object)) | 0;
  h = (h * 31 + hashTerm(quad.graph)) | 0;
  return h;
  /* tslint:enable: no-bitwise */
}

export function equalQuads(a: Quad, b: Quad): boolean {
  return (
    equalTerms(a.subject, b.subject) &&
    equalTerms(a.predicate, b.predicate) &&
    equalTerms(a.object, b.object) &&
    equalTerms(a.graph, b.graph)
  );
}

export function hashString(str: string): number {
  return hashFnv32a(str);
}

/**
 * Calculate a 32 bit FNV-1a hash
 * Found here: https://gist.github.com/vaiorabbit/5657561
 * Ref.: http://isthe.com/chongo/tech/comp/fnv/
 *
 * @param str the input value
 * @param [seed] optionally pass the hash of the previous chunk
 * @returns {integer}
 */
function hashFnv32a(str: string, seed = 0x811c9dc5): number {
  /* tslint:disable: no-bitwise */
  // tslint:disable-next-line: one-variable-per-declaration
  let i: number, l: number, hval = seed & 0x7fffffff;

  for (i = 0, l = str.length; i < l; i++) {
    hval ^= str.charCodeAt(i);
    hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
  }
  return hval >>> 0;
  /* tslint:enable: no-bitwise */
}

export function looksLikeTerm(value: unknown): value is Term {
  if (!(typeof value === 'object' && value && 'termType' in value)) {
    return false;
  }
  const {termType} = value as Term;
  switch (termType) {
    case 'NamedNode':
    case 'Literal':
    case 'BlankNode':
    case 'DefaultGraph':
    case 'Variable':
      return true;
    default:
      return false;
  }
}
