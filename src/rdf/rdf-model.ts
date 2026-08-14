import { dropHighestNonSignBit, hashString } from '@reactodia/hashmap';
import type {
  DataFactory, Term, NamedNode, BlankNode, Literal, Variable, DefaultGraph,
  BaseQuad, Quad, Quad_Graph, Quad_Object, Quad_Predicate, Quad_Subject,
} from '@rdfjs/types';

import { escapeRdfValue } from './rdf-escape.js';

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
    return termToString(this);
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
    return termToString(this);
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
    return termToString(this);
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
    return termToString(this);
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
    return termToString(this);
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
  equals(other: Term | undefined | null): boolean {
    return other && equalTerms(this, other) || false;
  }
  toString() {
    let text = `${termToString(this.subject)} ${termToString(this.predicate)} ${termToString(this.object)}`;
    if (this.graph.termType !== 'DefaultGraph') {
      text += ` ${termToString(this.graph)}`;
    }
    return text;
  }
}

export class BaseRdfQuad implements BaseQuad {
  constructor(
    readonly subject: Term,
    readonly predicate: Term,
    readonly object: Term,
    readonly graph: Term
  ) {}
  get termType(): 'Quad' {
    return 'Quad';
  }
  readonly value = '';
  hashCode(): number {
    return hashQuad(this);
  }
  equals(other: Term | undefined | null): boolean {
    return other && equalTerms(this, other) || false;
  }
  toString(): string {
    let text = `${termToString(this.subject)} ${termToString(this.predicate)} ${termToString(this.object)}`;
    if (this.graph.termType !== 'DefaultGraph') {
      text += ` ${termToString(this.graph)}`;
    }
    return text;
  }
}

class RdfDataFactory implements DataFactory {
  namedNode = <Iri extends string = string>(value: Iri): NamedNode<Iri> => {
    return new RdfNamedNode<Iri>(value);
  };
  blankNode = (value?: string): BlankNode => {
    return new RdfBlankNode(typeof value === 'string' ? value : randomString('b', 48));
  };
  literal = (value: string, languageOrDatatype?: string | NamedNode<string>): Literal => {
    return new RdfLiteral(value, languageOrDatatype);
  };
  variable = (value: string): Variable => {
    return new RdfVariable(value);
  };
  defaultGraph = (): DefaultGraph => {
    return RdfDefaultGraph.instance;
  };
  quad = (
    subject: Quad_Subject,
    predicate: Quad_Predicate,
    object: Quad_Object,
    graph?: Quad_Graph
  ): Quad => {
    return new RdfQuad(subject, predicate, object, graph);
  };
  fromTerm(original: NamedNode): NamedNode;
  fromTerm(original: BlankNode): BlankNode;
  fromTerm(original: Literal): Literal;
  fromTerm(original: Variable): Variable;
  fromTerm(original: DefaultGraph): DefaultGraph;
  fromTerm(original: BaseQuad): Quad;
  fromTerm(original: unknown): BlankNode | Literal | Variable | DefaultGraph | Quad | NamedNode {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const wrapped = wrapTerm(original as any, this);
    if (!wrapped) {
      throw new Error('Invalid term value to wrap');
    }
    return wrapped;
  };
  fromQuad(original: Quad): Quad {
    throw new Error('Method not implemented.');
  };
}

export const DefaultDataFactory: DataFactory = new RdfDataFactory();

export function randomString(prefix: string, randomBitCount: number): string {
  if (randomBitCount > 48) {
    throw new Error('Cannot generate random blank node with > 48 bits of randomness');
  }
  const hexDigitCount = Math.ceil(randomBitCount / 4);
  const num = Math.floor(Math.random() * Math.pow(2, randomBitCount));
  const value = prefix + num.toString(16).padStart(hexDigitCount, '0');
  return value;
}

export function wrapTerm(
  v:
    Pick<NamedNode, 'termType' | 'value'> |
    Pick<BlankNode, 'termType' | 'value'> |
    Pick<Literal, 'termType' | 'value' | 'language'>
      & { datatype: Pick<NamedNode, 'termType' | 'value'> } |
    Pick<Variable, 'termType' | 'value'> |
    Pick<DefaultGraph, 'termType'> |
    Pick<Quad, 'termType' | 'subject' | 'predicate' | 'object' | 'graph'>,
  factory: DataFactory
): BlankNode | Literal | Variable | DefaultGraph | Quad | NamedNode | undefined {
  switch (v.termType) {
    case 'NamedNode':
      return factory.namedNode(v.value);
    case 'BlankNode':
      return factory.blankNode(v.value);
    case 'Literal':
      return factory.literal(v.value, v.language || wrapTerm(v.datatype, factory) as NamedNode);
    case 'Variable':
      return factory.variable!(v.value);
    case 'DefaultGraph':
      return factory.defaultGraph();
    case 'Quad':
      return factory.quad(
        wrapTerm(v.subject, factory) as Quad['subject'],
        wrapTerm(v.predicate, factory) as Quad['predicate'],
        wrapTerm(v.object, factory) as Quad['object'],
        v.graph ? wrapTerm(v.graph, factory) as Quad['graph'] : undefined
      );
  }
}

export function termToString(node: Term): string {
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
        return stringLiteral + '^^' + termToString(datatype);
      } else {
        return stringLiteral;
      }
    }
    case 'DefaultGraph':
      return '(default graph)';
    case 'Variable':
      return `?${node.value}`;
    case 'Quad': {
      let str = '<< ';
      str += termToString(node.subject) + ' ';
      str += termToString(node.predicate) + ' ';
      str += termToString(node.object) + ' ';
      if (node.graph.termType !== 'DefaultGraph') {
        str += termToString(node.graph) + ' ';
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
      hash = hashString(node.value);
      break;
    case 'Literal':
      hash = hashString(node.value);
      if (node.datatype) {
        hash = (Math.imul(hash, 31) + hashString(node.datatype.value)) | 0;
      }
      if (node.language) {
        hash = (Math.imul(hash, 31) + hashString(node.language)) | 0;
      }
      break;
    case 'Variable':
      hash = hashString(node.value);
      break;
    case 'Quad': {
      hash = (Math.imul(hash, 31) + hashTerm(node.subject)) | 0;
      hash = (Math.imul(hash, 31) + hashTerm(node.predicate)) | 0;
      hash = (Math.imul(hash, 31) + hashTerm(node.object)) | 0;
      hash = (Math.imul(hash, 31) + hashTerm(node.graph)) | 0;
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

export function hashQuad(quad: BaseQuad): number {
  return hashTerm(quad);
}

export function equalQuads(a: BaseQuad, b: BaseQuad): boolean {
  return equalTerms(a, b);
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

export function namespacedValue<const Namespace extends string, const LocalName extends string>(
  namespace: Namespace,
  localName: LocalName
): `${Namespace}${LocalName}` {
  return `${namespace}${localName}`;
}

export function namespacedNode<const Namespace extends string, const LocalName extends string>(
  factory: DataFactory,
  namespace: Namespace,
  localName: LocalName
): NamedNode<`${Namespace}${LocalName}`> {
  return factory.namedNode(namespacedValue(namespace, localName));
}
