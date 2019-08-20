# RAMP shapes: declarative RDF ↔ algebraic data type mapping [![npm version](https://badge.fury.io/js/ramp-shapes.svg)](https://badge.fury.io/js/ramp-shapes)

[Home page](https://ramp-shapes.github.io/) | [Specification draft](https://ramp-shapes.github.io/ramp-shapes-spec/) | [Playground](https://ramp-shapes.github.io/playground.html)

**RAMP** is a type construction language, specification and an implementation of mapping operations between RDF graphs and structured data types.

## Features
**RAMP** introduces a language based on RDF which allows to describe a runtime object interface with so-called "shapes". The shapes are basically types augumented with metadata to map them into RDF graph. Usage of such shapes allows to:

 * Map RDF graph data into JS objects.
 * Generate RDF quad/triple data from JS objects.
 * Construct SPARQL queries to fetch necessary data for given shapes.
 * *(In the future)* Validate that runtime object structure matches specified shape.

## Installation

Install with `npm install --save ramp-shapes`

## Usage

Try out on the interactive [playground](https://ramp-shapes.github.io/playground.html).

```ts
import * as Ramp from 'ramp-shapes';
import * as N3 from 'n3';
import * as SparqlJs from 'sparqljs';

// get graph triples (source data)
const dataset = Ramp.Rdf.dataset(new N3.Parser().parse(`
    @prefix ex: <http://example.com/schema/>.
    @prefix : <http://example.com/data/>.

    :anno1 a ex:Annotation;
        ex:start :point1;
        ex:end ("1" "2").

    :point1 a ex:Point;
        ex:position 42.
`));

// define custom shapes using Turtle syntax
const shapes = Ramp.frameShapes(Ramp.Rdf.dataset(new N3.Parser().parse(`
    @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>.
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#>.
    @prefix : <http://ramp-shapes.github.io/schema#>.
    @prefix ex: <http://example.com/schema/>.

    ex:Annotation a :ObjectShape;
        :typeProperty [
            :name "type";
            :path ([ :predicate rdf:type ]);
            :shape [ a :ResourceShape; :termValue ex:Annotation ]
        ];
        :property [
            :name "id";
            :path ();
            :shape [ a :ResourceShape ]
        ];
        :property [
            :name "start";
            :path ([ :predicate ex:start ]);
            :shape ex:Selector
        ];
        :property [
            :name "end";
            :path ([ :predicate ex:end ]);
            :shape [ a :OptionalShape; :item ex:Selector ]
        ].

    ex:Selector a :UnionShape;
        :variant ex:Point, ex:Path.

    ex:Point a :ObjectShape;
        :typeProperty [
            :name "type";
            :path ([ :predicate rdf:type ]);
            :shape [ a :ResourceShape; :termValue ex:Point ]
        ];
        :property [
            :name "position";
            :path ([ :predicate ex:position ]);
            :shape [ a :LiteralShape; :termDatatype xsd:integer ]
        ].

    ex:Path a :ListShape;
        :item [ a :LiteralShape; :termDatatype xsd:string ].
`)));

// choose entry point shape
const rootShape = Ramp.Rdf.namedNode(
  'http://example.com/schema#Annotation'
);
// (optionally) specify prefixes for Turtle and SPARQL
const prefixes = {
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  xsd: "http://www.w3.org/2001/XMLSchema#",
  ex: "http://example.com/schema/",
  "": "http://example.com/data/",
};

// use defined shapes to lower RDF graph into JS objects...
const matches = Ramp.frame({shapes, rootShape, dataset}));
for (const match of matches) {
  /* match.value object has ex:Annotation shape, e.g.:
    {
      "type": "http://example.com/schema/Annotation",
      "id": "http://example.com/data/anno1",
      "start": {
        "type": "http://example.com/schema/Point",
        "position": 42
      },
      "end": ["1", "2"]
    }
  */

  // ... and lift JS object back into an RDF graph
  const quads = Ramp.flatten({
    shapes,
    rootShape,
    value: match.value,
    prefixes,
  });
  /* quads is Iterable<Rdf.Quad>, e.g.:

    :anno1 a ex:Annotation;
        ex:start _:object_044916_1.
    _:object_044916_1 a ex:Point;
        ex:position "42"^^xsd:integer.
    :anno1 ex:end _:list_044916_2.
    _:list_044916_2 rdf:first "1";
        rdf:rest _:list_044916_3.
    _:list_044916_3 rdf:first "2";
        rdf:rest rdf:nil.
  */
}

// another application of defined shapes is to generate a CONSTRUCT query
// to get necessary graph data for framing
const query = Ramp.generateQuery({shapes, rootShape, prefixes});
const queryString = new SparqlJs.Generator().stringify(query);
/* query is a CONSTRUCT query in SPARQL.js runtime format:

  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
  PREFIX ex: <http://example.com/schema/>
  CONSTRUCT {
    ?object_1 rdf:type ex:Annotation.
    ?object_1 ex:start ?object_4.
    ?object_4 rdf:type ex:Point.
    ?object_4 ex:position ?literal_5.
    ?object_1 ex:start ?list_6.
    ?listNode_7 rdf:rest ?nextNode_8.
    ?listNode_7 rdf:first ?literal_9.
    ?object_1 ex:end ?object_11.
    ?object_11 rdf:type ex:Point.
    ?object_11 ex:position ?literal_12.
    ?object_1 ex:end ?list_13.
    ?listNode_14 rdf:rest ?nextNode_15.
    ?listNode_14 rdf:first ?literal_16.
  }
  WHERE {
    ?object_1 rdf:type ex:Annotation.
    {
      ?object_1 ex:start ?object_4.
      ?object_4 rdf:type ex:Point.
      ?object_4 ex:position ?literal_5.
    }
    UNION
    {
      ?object_1 ex:start ?list_6.
      ?list_6 (rdf:rest*) ?listNode_7.
      ?listNode_7 rdf:rest ?nextNode_8.
      ?listNode_7 rdf:first ?literal_9.
    }
    OPTIONAL {
      {
        ?object_1 ex:end ?object_11.
        ?object_11 rdf:type ex:Point.
        ?object_11 ex:position ?literal_12.
      }
      UNION
      {
        ?object_1 ex:end ?list_13.
        ?list_13 (rdf:rest*) ?listNode_14.
        ?listNode_14 rdf:rest ?nextNode_15.
        ?listNode_14 rdf:first ?literal_16.
      }
    }
  }
 */
```

## References
A publication which describes this work is currently under review at MTSR Conference 2019.
