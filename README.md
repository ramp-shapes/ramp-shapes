# RAM shapes: Declarative RDF ↔ ADT mapping

**RAM** is a type construction language, specification and an implementation of mapping operations between RDF graphs and structured data types.

## Features
**RAM** introduces a language based on RDF which allows to describe a runtime object interface with so-called "shapes". The shapes are basically types augumented with metadata to map them into RDF graph. Usage of such shapes allows to:

 * Map RDF graph data into JS objects.
 * Generate RDF quad/triple data from JS objects.
 * *(In the future)* Validate that runtime object structure matches specified shape.
 * *(In the future)* Construct SPARQL queries to fetch necessary data for given shapes.

## Example

```ts
import * as Ram from 'ram-shapes';
import * as N3 from 'n3';

const shapes = Ram.frameShapes(new N3.Parser().parse(`
  @prefix : <http://ram-shapes.github.io/schema#>.
  @prefix ex: <http://example.com/schema#>.

  ex:Selector a :UnionShape; :variant ex:Range, ex:Point.
  ex:Range a :ObjectShape;
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
  ex:Point a :LiteralShape;
    :termDatatype ex:Point.
`));

// define simple vocabulary for our custom namespace
namespace ex {
    export const NAMESPACE = 'http://example.com/schema#';
    export const Selector = Ram.Rdf.namedNode(NAMESPACE + 'Selector');
}

// lower RDF graph quads into JS objects
const matches = Ram.frame({shapes, rootShape: ex.Selector, graph: ...}));
for (const match of matches) {
    /* match.value object has ex.Selector, e.g.:
       {
         "start": { "start": "(1,1)", "end": "(1,10)" }
         "end": { "start": "(20,30)" }
       }
    */
}

// lift JS object value into an RDF graph quads
const quads = Ram.flatten({shapes, rootShape: ex.Selector, value: ...});
/* quads is Iterable<Ram.Rdf.Quad>, e.g.:
   @prefix ex: <http://example.com/schema#>
   _:b1 ex:start _:b2.
   _:b2 ex:start "(1,1)"^^ex:Point.
   _:b2 ex:end "(1,10)"^^ex:Point.
   _:b1 ex:end _:b3.
   _:b3 ex:start "(20,30)"^^ex:Point.
*/
```

## References
A publication which describes this work is currently under review at 
Semantics-2019 conference.
