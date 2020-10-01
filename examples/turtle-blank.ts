import * as N3 from 'n3';
import { Rdf } from '../src/index';

export function quadsToTurtleString(
  triples: Iterable<Rdf.Quad>,
  prefixes: { [prefix: string]: string }
): Promise<string> {
  const quads = Array.from(triples);

  return new Promise<string>((resolve, reject) => {
    const writer = new N3.Writer({prefixes});

    const makeQuad = (q: Rdf.GroupedQuad): N3.Quad => {
      return N3.DataFactory.quad(
        makeTerm(q.subject),
        q.predicate,
        makeTerm(q.object),
        q.graph
      );
    };
    const makeTerm = (term: Rdf.BlankGroup | Rdf.BlankList | Rdf.Term): any => {
      return (
        term.termType === 'BlankGroup' ? writer.blank(term.content.map(makeQuad)) :
        term.termType === 'BlankList' ? writer.list(term.items.map(makeTerm)) :
        term
      );
    };

    for (const q of Rdf.groupBlanks(quads)) {
      writer.addQuad(q.termType === 'GroupedQuad' ? makeQuad(q) : q);
    }

    writer.end((error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    });
  }).then(normalizeN3TurtleIndentation);
}

function normalizeN3TurtleIndentation(turtle: string): string {
  const lines = turtle.split('\n');
  const indentedLines: string[] = [];
  let level = 0;
  const DEFAULT_SPACING = '  ';
  let spacing = DEFAULT_SPACING;
  for (const line of lines) {
    let nextLevel = level;
    const spacingLength = findLineIndentation(line);
    // tslint:disable-next-line: prefer-for-of
    for (let j = 0; j < line.length; j++) {
      switch (line[j]) {
        case '[': {
          if (level === 0) {
            spacing = spacingLength
              ? line.substring(0, spacingLength)
              : DEFAULT_SPACING;
          }
          nextLevel++;
          break;
        }
        case ']': {
          nextLevel--;
          break;
        }
      }
    }
    if (level > 0) {
      // [ --> level
      // ] --> nextLevel
      // foo ] --> level
      // ] ] --> (level - 1)
      // ], [ --> ((level or nextLevel) - 1)
      const effectiveLevel = /^[ \t]*\]/.test(line)
        ? (nextLevel === level ? (nextLevel - 1) : (level - 1))
        : level;
      indentedLines.push(spacing.repeat(effectiveLevel + 1) + line.substring(spacingLength));
    } else {
      indentedLines.push(line);
    }
    level = nextLevel;
  }
  return indentedLines.join('\n');
}

function findLineIndentation(line: string): number {
  for (let i = 0; i < line.length; i++) {
    switch (line[i]) {
      case ' ':
      case '\t':
        /* nothing */
        break;
      default:
        return i;
    }
  }
  return 0;
}
