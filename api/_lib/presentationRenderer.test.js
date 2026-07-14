import { describe, it, expect } from 'vitest';
import { estimateBlockHeight, paginateBlocks } from './presentationRenderer.js';

const BODY_TOP = 1.5;
const BODY_BOTTOM = 7.5 - 0.55;
const BLOCK_GAP = 0.25;

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
});
