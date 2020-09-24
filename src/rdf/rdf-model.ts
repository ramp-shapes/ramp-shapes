import * as RdfJs from 'rdf-js';

import { escapeRdfValue } from './rdf-escape';

export type Term = NamedNode | BlankNode | Literal | Variable | DefaultGraph | Quad;

export type NamedNode<Iri extends string = string> = RdfJs.NamedNode<Iri>;
export type BlankNode = RdfJs.BlankNode;
export type Literal = RdfJs.Literal;
export type Variable = RdfJs.Variable;
export type DefaultGraph = RdfJs.DefaultGraph;
export type Quad = RdfJs.Quad;

export type DataFactory = RdfJs.DataFactory;

class RdfNamedNode<Iri extends string> implements NamedNode<Iri> {
  get termType() { return 'NamedNode' as const; }
  constructor(
    readonly value: Iri,
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

class RdfQuad implements Quad {
  constructor(
    readonly subject: NamedNode | BlankNode | Variable | Quad,
    readonly predicate: NamedNode | Variable,
    readonly object: NamedNode | BlankNode | Literal | Variable | Quad,
    readonly graph: DefaultGraph | NamedNode | BlankNode | Variable = RdfDefaultGraph.instance,
  ) {}
  get termType() { return 'Quad' as const; }
  readonly value = '';
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

class RdfDataFactory implements RdfJs.DataFactory {
  namedNode = <Iri extends string = string>(value: Iri): RdfJs.NamedNode<Iri> => {
    return new RdfNamedNode<Iri>(value);
  }
  blankNode = (value?: string | undefined): RdfJs.BlankNode => {
    return new RdfBlankNode(typeof value === 'string' ? value : randomString('b', 48));
  }
  literal = (value: string, languageOrDatatype?: string | RdfJs.NamedNode | undefined): RdfJs.Literal => {
    return new RdfLiteral(value, languageOrDatatype);
  }
  variable = (value: string): RdfJs.Variable => {
    return new RdfVariable(value);
  }
  defaultGraph(): RdfJs.DefaultGraph {
    return RdfDefaultGraph.instance;
  }
  quad(
    subject: RdfJs.Quad_Subject,
    predicate: RdfJs.Quad_Predicate,
    object: RdfJs.Quad_Object,
    graph?: RdfJs.BlankNode | RdfJs.Variable | RdfJs.DefaultGraph | RdfJs.NamedNode | undefined
  ): RdfJs.Quad {
    return new RdfQuad(subject, predicate, object, graph);
  }
}

export const DefaultDataFactory: RdfJs.DataFactory = new RdfDataFactory();

export function randomString(prefix: string, randomBitCount: number): string {
  if (randomBitCount > 48) {
    throw new Error(`Cannot generate random blank node with > 48 bits of randomness`);
  }
  const hexDigitCount = Math.ceil(randomBitCount / 4);
  const num = Math.floor(Math.random() * Math.pow(2, randomBitCount));
  const value = prefix + num.toString(16).padStart(hexDigitCount, '0');
  return value;
}

export function wrap(
  v:
    Pick<NamedNode, 'termType' | 'value'> |
    Pick<BlankNode, 'termType' | 'value'> |
    Pick<Literal, 'termType' | 'value' | 'language'>
      & { datatype: Pick<NamedNode, 'termType' | 'value'> } |
    Pick<Variable, 'termType' | 'value'> |
    Pick<DefaultGraph, 'termType'> |
    Pick<Quad, 'termType' | 'subject' | 'predicate' | 'object' | 'graph'>,
  factory: RdfJs.DataFactory
): Term | undefined {
  switch (v.termType) {
    case 'NamedNode':
      return factory.namedNode(v.value);
    case 'BlankNode':
      return factory.blankNode(v.value);
    case 'Literal':
      return factory.literal(v.value, v.language || wrap(v.datatype, factory) as NamedNode);
    case 'Variable':
      return factory.variable!(v.value);
    case 'DefaultGraph':
      return factory.defaultGraph();
    case 'Quad':
      return factory.quad(
        wrap(v.subject, factory) as Quad['subject'],
        wrap(v.predicate, factory) as Quad['predicate'],
        wrap(v.object, factory) as Quad['object'],
        v.graph ? wrap(v.graph, factory) as Quad['graph'] : undefined
      );
  }
}

export function toString(node: Term): string {
  switch (node.termType) {
    case 'NamedNode':
      return `<${escapeRdfValue(node.value)}>`;
    case 'BlankNode':
      return `_:${node.value}`;
    case 'Literal': {
      const {value, language, datatype} = node;
      const stringLiteral = `"${escapeRdfValue(value)}"`;
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
    case 'Quad': {
      let str = `<< `;
      str += toString(node.subject) + ' ';
      str += toString(node.predicate) + ' ';
      str += toString(node.object) + ' ';
      if (node.graph.termType !== 'DefaultGraph') {
        str += toString(node.graph) + ' ';
      }
      str += '>>';
      return str;
    }
  }
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
        hash = (Math.imul(hash, 31) + hashFnv32a(node.datatype.value)) | 0;
      }
      if (node.language) {
        // tslint:disable-next-line: no-bitwise
        hash = (Math.imul(hash, 31) + hashFnv32a(node.language)) | 0;
      }
      break;
    case 'Variable':
      hash = hashFnv32a(node.value);
      break;
    case 'Quad': {
      /* tslint:disable: no-bitwise */
      hash = (Math.imul(hash, 31) + hashTerm(node.subject)) | 0;
      hash = (Math.imul(hash, 31) + hashTerm(node.predicate)) | 0;
      hash = (Math.imul(hash, 31) + hashTerm(node.object)) | 0;
      hash = (Math.imul(hash, 31) + hashTerm(node.graph)) | 0;
      /* tslint:enable: no-bitwise */
      break;
    }
  }
  return dropHighestNonSignBit(hash);
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
    case 'Quad': {
      const {subject, predicate, object, graph} = b as Quad;
      return (
        equalTerms(a.subject, subject) &&
        equalTerms(a.predicate, predicate) &&
        equalTerms(a.object, object) &&
        equalTerms(a.graph, graph)
      );
    }
  }
}

export function hashQuad(quad: Quad): number {
  return hashTerm(quad);
}

export function equalQuads(a: Quad, b: Quad): boolean {
  return equalTerms(a, b);
}

export function hashString(str: string): number {
  return dropHighestNonSignBit(hashFnv32a(str));
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

export function dropHighestNonSignBit(i32: number): number {
  // tslint:disable-next-line: no-bitwise
  return ((i32 >>> 1) & 0x40000000) | (i32 & 0xBFFFFFFF);
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
