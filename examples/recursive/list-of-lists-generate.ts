import * as SparqlJs from 'sparqljs';
import * as Ramp from '../../src/index';
import { rdf, xsd } from '../namespaces';

const PREFIXES: { [prefix: string]: string } = {
  rdf: rdf.NAMESPACE,
  xsd: xsd.NAMESPACE,
  ex: 'http://example.com/schema',
  ramp: Ramp.vocabulary.NAMESPACE,
};

const schema = new Ramp.ShapeBuilder({blankUniqueKey: 'recLists'});
const LIST_SHAPE_ID = Ramp.Rdf.namedNode(PREFIXES.ex + 'ListOfLists');
schema.list(
  schema.union([
    LIST_SHAPE_ID,
    schema.literal({datatype: xsd.integer})
  ]),
  {id: LIST_SHAPE_ID}
);

const rootListIri = Ramp.Rdf.namedNode(PREFIXES.ex + 'rootList');

const rootShape = schema.object({
  typeProperties: {
    iri: Ramp.self(schema.constant(rootListIri)),
  },
  properties: {
    body: Ramp.self(LIST_SHAPE_ID),
  }
});

const query = Ramp.generateQuery({
  rootShape,
  shapes: schema.shapes,
  prefixes: PREFIXES,
});

const generator = new SparqlJs.Generator();
const queryString = generator.stringify(query);
console.log(queryString);
