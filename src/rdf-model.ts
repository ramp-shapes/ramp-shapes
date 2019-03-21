export type Node = Iri | Literal | Blank;

export interface Iri {
  readonly type: 'uri';
  readonly value: string;
}

export interface Blank {
  readonly type: 'bnode';
  readonly value: string;
}

export interface Literal {
  readonly type: 'literal';
  readonly value: string;
  readonly datatype?: string;
  readonly 'xml:lang'?: string;
}

export interface Triple {
  readonly s: Node;
  readonly p: Node;
  readonly o: Node;
}

export function isIri(e: Node): e is Iri {
  return e && e.type === 'uri';
}

export function isBlank(e: Node): e is Blank {
  return e && e.type === 'bnode';
}

export function isLiteral(e: Node): e is Literal {
  return e && e.type === 'literal';
}

export function iri(value: string): Iri {
  return {type: 'uri', value};
}

export function blank(value: string): Blank {
  return {type: 'bnode', value};
}

export function literal(value: string, dataType?: Iri): Literal {
  return {
    type: 'literal',
    datatype: dataType ? dataType.value : undefined,
    value,
  };
}

export function langString(value: string, lang: string): Literal {
  return {
    type: 'literal',
    datatype: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#langString',
    value,
    "xml:lang": lang,
  };
}

export function triple(s: Node, p: Node, o: Node) {
  return {s, p, o};
}

export function toString(node: Node): string {
  switch (node.type) {
    case 'uri':
      return `<${node.value}>`;
    case 'literal': {
      const {value, datatype, "xml:lang": lang} = node;
      const stringLiteral = `"${value.replace(/"/, `"`)}"`;
      if (lang) {
        return stringLiteral + `@${lang}`;
      } else if (datatype) {
        return stringLiteral + '^^' + toString({type: 'uri', value: datatype});
      } else {
        return stringLiteral;
      }
    }
    case 'bnode': {
      return `_:${node.value}`;
    }
  }
}

export function hash(node: Node): number {
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

export function equals(a: Node, b: Node): boolean {
  if (a.type !== b.type) {
    return false;
  }
  switch (a.type) {
    case 'uri': {
      const { value } = b as Iri;
      return a.value === value;
    }
    case 'literal': {
      const { value, datatype, "xml:lang": lang } = b as Literal;
      return a.value === value && a.datatype === datatype && a["xml:lang"] === lang;
    }
    case 'bnode': {
      const { value } = b as Blank;
      return a.value === value;
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
