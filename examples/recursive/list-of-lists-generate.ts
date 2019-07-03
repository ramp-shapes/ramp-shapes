import * as SparqlJs from 'sparqljs';
import * as Ram from '../../src/index';
import { rdf, xsd } from '../namespaces';

const PREFIXES: { [prefix: string]: string } = {
  rdf: rdf.NAMESPACE,
  xsd: xsd.NAMESPACE,
  ex: 'http://example.com/schema',
  ram: Ram.vocabulary.NAMESPACE,
};

const schema = new Ram.ShapeBuilder({blankUniqueKey: 'recLists'});
const LIST_SHAPE_ID = Ram.Rdf.namedNode(PREFIXES.ex + 'ListOfLists');
schema.list(
  schema.union([
    LIST_SHAPE_ID,
    schema.literal({datatype: xsd.integer})
  ]),
  {id: LIST_SHAPE_ID}
);

const rootListIri = Ram.Rdf.namedNode(PREFIXES.ex + 'rootList');

const rootShape = schema.object({
  typeProperties: {
    iri: Ram.self(schema.constant(rootListIri)),
  },
  properties: {
    body: Ram.self(LIST_SHAPE_ID),
  }
});

const query = Ram.generateQuery({
  rootShape,
  shapes: schema.shapes,
  prefixes: PREFIXES,
});

const generator = new SparqlJs.Generator();
const queryString = generator.stringify(query);
console.log(queryString);
