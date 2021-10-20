# RAMP shapes: declarative RDF ↔ algebraic data type mapping [![npm version](https://badge.fury.io/js/ramp-shapes.svg)](https://badge.fury.io/js/ramp-shapes)

[Home page](https://ramp-shapes.github.io/) | [Introductory paper](https://www.researchgate.net/publication/337724413_RAMP_Shapes_Declarative_RDF_ADT_Mapping) | [Specification draft](https://ramp-shapes.github.io/ramp-shapes-spec/) | [Playground](https://ramp-shapes.github.io/playground.html)

**RAMP** is a type construction language, specification and an implementation of mapping operations between RDF graphs and structured data types.

## Features
**RAMP** introduces a language based on RDF which allows to describe a runtime object interface with so-called "shapes". The shapes are basically types augumented with metadata to map them into RDF graph. Usage of such shapes allows to:

 * Map RDF graph data into JS objects.
 * Generate RDF quad/triple data from JS objects.
 * Construct SPARQL queries to fetch necessary data for given shapes.
 * *(In the future)* Validate that runtime object structure matches specified shape.

### Feature comparison with other RDF modelling languages

| Feature | [OWL/RDFS](https://www.w3.org/TR/owl2-overview/) | [SHACL](https://www.w3.org/TR/shacl/) | [ShEx](https://shex.io/shex-semantics/index.html) | [JSON-LD](https://www.w3.org/TR/json-ld11/) | [**RAMP Shapes**](https://ramp-shapes.github.io/) |
|---|---|---|---|---|---|
| Describes closed RDF graph structure | ❌ | ✅ | ✅ | ✅ | ✅ |
| Describes data mapping / serialization | ❌ | ❌ | ❌ | requires frame definition | ✅ |
| Has ability to generate query and deserialize results based on shapes | ❌ | ❌ | ❌ | ❌ | ✅ |
| Has RDF representation | ✅ | ✅ | ✅ | ❌ | ✅ |
| Supports RDF lists | ❌ | [with workaround](https://www.topquadrant.com/constraints-on-rdflists-using-shacl/) | ❌ | ✅ | ✅ |
| Supports shape unions | ✅ | through shape targets | ✅ | ❌ | ✅ |
| Supports cardinality constraints (min/max) | ✅ | ✅ | ✅ | ❌ | ✅ |
| Supports recursive shapes | ✅ | depends on implementation | ✅ | ❌ | ✅ |
| Supports property paths | ❌ | ✅ | ❌ | ❌ | ✅ |
| Supports ignoring optional non-matching shapes | ❌ | by declaring shape severity | ❌ | ❌ | ✅ |

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
    @prefix ramp: <http://ramp-shapes.github.io/schema#>.
    @prefix ex: <http://example.com/schema/>.

    ex:Annotation a ramp:Record;
        ramp:typeProperty [
            ramp:name "type";
            ramp:path rdf:type;
            ramp:shape [ a ramp:Resource; ramp:termValue ex:Annotation ]
        ];
        ramp:property [
            ramp:name "id";
            ramp:path ();
            ramp:shape [ a ramp:Resource ]
        ];
        ramp:property [
            ramp:name "start";
            ramp:path ex:start;
            ramp:shape ex:Selector
        ];
        ramp:property [
            ramp:name "end";
            ramp:path ex:end;
            ramp:shape [ a ramp:Optional; ramp:item ex:Selector ]
        ].

    ex:Selector a ramp:AnyOf;
        ramp:variant ex:Point, ex:Path.

    ex:Point a ramp:Record;
        ramp:typeProperty [
            ramp:name "type";
            ramp:path rdf:type;
            ramp:shape [ a ramp:Resource; ramp:termValue ex:Point ]
        ];
        ramp:property [
            ramp:name "position";
            ramp:path ex:position;
            ramp:shape [ a ramp:Literal; ramp:termDatatype xsd:integer ]
        ].

    ex:Path a ramp:List;
        ramp:item [ a ramp:Literal; ramp:termDatatype xsd:string ].
`)));

// choose entry point shape
const shape = shapes.find(s =>
  s.id.value === 'http://example.com/schema#Annotation'
);

// use defined shapes to lower RDF graph into JS objects...
const matches = Ramp.frame({shape, dataset});
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
  const quads = Ramp.flatten({shape, value: match.value});
  /* quads is Iterable<Rdf.Quad>, e.g.:

    :anno1 a ex:Annotation;
        ex:start _:record_044916_1.
    _:record_044916_1 a ex:Point;
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
const query = Ramp.generateQuery({
  shape,
  // (optionally) specify prefixes for SPARQL
  prefixes: {
    rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    rdfs: "http://www.w3.org/2000/01/rdf-schema#",
    xsd: "http://www.w3.org/2001/XMLSchema#",
    ex: "http://example.com/schema/",
    "": "http://example.com/data/",
  }
});
const queryString = new SparqlJs.Generator().stringify(query);
/* query is a CONSTRUCT query in SPARQL.js runtime format:

  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
  PREFIX ex: <http://example.com/schema/>
  CONSTRUCT {
    ?record_1 rdf:type ex:Annotation.
    ?record_1 ex:start ?record_4.
    ?record_4 rdf:type ex:Point.
    ?record_4 ex:position ?literal_5.
    ?record_1 ex:start ?list_6.
    ?listNode_7 rdf:rest ?nextNode_8.
    ?listNode_7 rdf:first ?literal_9.
    ?record_1 ex:end ?record_11.
    ?record_11 rdf:type ex:Point.
    ?record_11 ex:position ?literal_12.
    ?record_1 ex:end ?list_13.
    ?listNode_14 rdf:rest ?nextNode_15.
    ?listNode_14 rdf:first ?literal_16.
  }
  WHERE {
    ?record_1 rdf:type ex:Annotation.
    {
      ?record_1 ex:start ?record_4.
      ?record_4 rdf:type ex:Point.
      ?record_4 ex:position ?literal_5.
    }
    UNION
    {
      ?record_1 ex:start ?list_6.
      ?list_6 (rdf:rest*) ?listNode_7.
      ?listNode_7 rdf:rest ?nextNode_8.
      ?listNode_7 rdf:first ?literal_9.
    }
    OPTIONAL {
      {
        ?record_1 ex:end ?record_11.
        ?record_11 rdf:type ex:Point.
        ?record_11 ex:position ?literal_12.
      }
      UNION
      {
        ?record_1 ex:end ?list_13.
        ?list_13 (rdf:rest*) ?listNode_14.
        ?listNode_14 rdf:rest ?nextNode_15.
        ?listNode_14 rdf:first ?literal_16.
      }
    }
  }
 */
```

## References

Morozov A., Wohlgenannt G., Mouromtsev D., Pavlov D., Emelyanov Y. (2019) RAMP Shapes: Declarative RDF ↔ ADT Mapping. In: Garoufallou E., Fallucchi F., William De Luca E. (eds) Metadata and Semantic Research. MTSR 2019. Communications in Computer and Information Science, vol 1057. Springer, Cham

https://link.springer.com/chapter/10.1007/978-3-030-36599-8_4
