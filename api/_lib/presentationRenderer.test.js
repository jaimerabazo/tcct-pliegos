import { describe, it, expect } from 'vitest';
import {
  estimateBlockHeight,
  estimateParagraphTextHeight,
  estimateTableRowHeights,
  paginateBlocks,
} from './presentationRenderer.js';

const BODY_TOP = 1.5;
const BODY_BOTTOM = 7.5 - 0.55;
const BLOCK_GAP = 0.25;
const TABLE_ROW_H = 0.34;
const PARAGRAPH_LINE_H = (12 * 1.2) / 72;

function pageContentHeight(pageBlocks) {
  return pageBlocks.reduce((acc, { block, showHeading }, i) => {
    const renderable = showHeading ? block : { ...block, heading: undefined };
    const h = estimateBlockHeight(renderable);
    return acc + h + (i < pageBlocks.length - 1 ? BLOCK_GAP : 0);
  }, 0);
}

function fitsOnPage(pageBlocks) {
  return BODY_TOP + pageContentHeight(pageBlocks) <= BODY_BOTTOM;
}

describe('estimateParagraphTextHeight', () => {
  it('grows with wrapped line count instead of using a fixed box', () => {
    const short = estimateParagraphTextHeight('Una frase corta.');
    const long = estimateParagraphTextHeight(
      'Posicionamiento recomendado. '.repeat(80),
    );

    expect(short).toBe(PARAGRAPH_LINE_H);
    expect(long).toBeGreaterThan(short);
    expect(long).toBeGreaterThan(0.9);
  });
});

describe('estimateBlockHeight — tables', () => {
  it('grows table height when cell text wraps beyond one row', () => {
    const shortTable = {
      type: 'table',
      columns: ['Tipo', 'Descripción', 'Cuantía'],
      rows: [['Retraso', 'Penalización por día', '0,5 %']],
    };
    const longTable = {
      type: 'table',
      columns: ['Tipo', 'Descripción', 'Cuantía'],
      rows: [[
        'Incumplimiento SLA',
        'Penalización por cada incumplimiento grave de disponibilidad o tiempos de respuesta pactados en el Anexo de Niveles de Servicio. '.repeat(4),
        'Hasta 5 % del importe del lote afectado',
      ]],
    };

    const fixedH = (longTable.rows.length + 1) * TABLE_ROW_H;
    const shortH = estimateBlockHeight(shortTable);
    const longH = estimateBlockHeight(longTable);

    expect(shortH).toBeGreaterThanOrEqual(fixedH);
    expect(longH).toBeGreaterThan(shortH);
    expect(estimateTableRowHeights(longTable)[1]).toBeGreaterThan(TABLE_ROW_H);
  });

  it('paginates penalizaciones-style tables before they overlap the footer', () => {
    const longDescription = 'Descripción extensa de la penalización contractual con múltiples condiciones y referencias normativas. ';
    const table = {
      type: 'table',
      heading: 'Penalizaciones',
      columns: ['Tipo', 'Descripción', 'Cuantía'],
      rows: Array(8).fill(null).map((_, i) => [
        `Tipo ${i + 1}`,
        `${longDescription}`.repeat(6),
        `${(i + 1) * 0.5} %`,
      ]),
    };

    const oldEstimate = 0.42 + (table.rows.length + 1) * TABLE_ROW_H;
    expect(BODY_TOP + oldEstimate).toBeLessThanOrEqual(BODY_BOTTOM);

    const pages = paginateBlocks([table]);

    pages.forEach((page) => expect(fitsOnPage(page)).toBe(true));
    expect(estimateBlockHeight(table)).toBeGreaterThan(oldEstimate);
    expect(pages.length).toBeGreaterThan(1);

    const rowCount = pages.reduce(
      (acc, page) => acc + page[0].block.rows.length,
      0,
    );
    expect(rowCount).toBe(8);
  });
});

describe('paginateBlocks — non-splittable blocks', () => {
  it('moves a paragraph to the next page when it does not fit below the footer line', () => {
    const kv = {
      type: 'keyvalue',
      heading: 'Section',
      rows: Array(10).fill(null).map((_, i) => ({ label: `L${i}`, value: 'v' })),
    };
    const para = { type: 'paragraph', heading: 'Next', text: 'Should not overlap footer' };

    const pages = paginateBlocks([kv, para]);

    expect(pages).toHaveLength(2);
    expect(pages[0]).toHaveLength(1);
    expect(pages[0][0].block.type).toBe('keyvalue');
    expect(pages[1]).toHaveLength(1);
    expect(pages[1][0].block.type).toBe('paragraph');
    expect(fitsOnPage(pages[0])).toBe(true);
    expect(fitsOnPage(pages[1])).toBe(true);
  });

  it('keeps a paragraph on the same page when it fits in the remaining space', () => {
    const kv = {
      type: 'keyvalue',
      heading: 'Section',
      rows: Array(8).fill(null).map((_, i) => ({ label: `L${i}`, value: 'v' })),
    };
    const para = { type: 'paragraph', text: 'Fits fine without heading' };

    const pages = paginateBlocks([kv, para]);

    expect(pages).toHaveLength(1);
    expect(pages[0]).toHaveLength(2);
    expect(fitsOnPage(pages[0])).toBe(true);
  });

  it('does not underestimate long recomendacion when paginating after a keyvalue block', () => {
    const kv = {
      type: 'keyvalue',
      heading: 'Section',
      rows: Array(6).fill(null).map((_, i) => ({ label: `L${i}`, value: 'v' })),
    };
    const longRecomendacion = {
      type: 'paragraph',
      heading: 'Recomendación',
      text: 'Posicionar a TCCT como partner integral con foco en continuidad operativa. '.repeat(40),
    };

    const kvH = estimateBlockHeight(kv);
    const oldParaH = 0.42 + 0.9;
    expect(BODY_TOP + kvH + BLOCK_GAP + oldParaH).toBeLessThanOrEqual(BODY_BOTTOM);

    const pages = paginateBlocks([kv, longRecomendacion]);

    pages.forEach((page) => expect(fitsOnPage(page)).toBe(true));
    expect(estimateBlockHeight(longRecomendacion)).toBeGreaterThan(oldParaH);

    const renderedText = pages
      .flatMap((page) => page.filter(({ block }) => block.type === 'paragraph').map(({ block }) => block.text))
      .join(' ');
    expect(renderedText.replace(/\s+/g, ' ').trim()).toBe(
      longRecomendacion.text.replace(/\s+/g, ' ').trim(),
    );
  });
});

describe('paginateBlocks — splittable blocks', () => {
  it('still splits tables across continuation pages', () => {
    const table = {
      type: 'table',
      heading: 'Large table',
      columns: ['A', 'B'],
      rows: Array(20).fill(null).map((_, i) => [`Row ${i}`, 'value']),
    };

    const pages = paginateBlocks([table]);

    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page) => expect(fitsOnPage(page)).toBe(true));
    const rowCount = pages.reduce(
      (acc, page) => acc + page[0].block.rows.length,
      0,
    );
    expect(rowCount).toBe(20);
  });

  it('splits very long paragraphs across continuation pages', () => {
    const paragraph = {
      type: 'paragraph',
      heading: 'Recomendación',
      text: 'Posicionamiento recomendado para TCCT. '.repeat(120),
    };

    const pages = paginateBlocks([paragraph]);

    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((page) => expect(fitsOnPage(page)).toBe(true));

    const renderedText = pages
      .flatMap((page) => page.map(({ block }) => block.text))
      .join(' ');
    expect(renderedText.replace(/\s+/g, ' ').trim()).toBe(
      paragraph.text.replace(/\s+/g, ' ').trim(),
    );
  });
});
