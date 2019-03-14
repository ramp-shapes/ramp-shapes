export type Node = Iri | Literal | Blank;

export interface Iri {
    type: 'uri';
    value: string;
}

export interface Blank {
    type: 'bnode';
    value: string;
}

export interface Literal {
    type: 'literal';
    value: string;
    datatype?: string;
    'xml:lang'?: string;
}

export interface Triple {
    s: Node;
    p: Node;
    o: Node;
}

export function isBlank(e: Node): e is Blank {
    return e && e.type === 'bnode';
}

export function isIri(e: Node): e is Iri {
    return e && e.type === 'uri';
}

export function isLiteral(e: Node): e is Literal {
    return e && e.type === 'literal';
}
