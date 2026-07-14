// Materializa las specs de diapositiva (ver presentationBuilder.js) en un .pptx con
// pptxgenjs. Es IO/plumbing: SIN test unitario (mismo criterio que el handler de
// api/analyze.js) — se verifica abriendo el archivo generado. La lógica testeable
// (qué va en cada diapositiva) vive en presentationBuilder.js, este módulo solo dibuja.
import pptxgen from 'pptxgenjs';
import { PPT, FONT, LAYOUT } from './presentationTheme.js';

const M = LAYOUT.margin; // margen lateral
const CONTENT_W = LAYOUT.w - M * 2;
const HEADER_Y = 0.55; // franja de título en diapositivas de contenido
const BODY_TOP = 1.5; // dónde empieza el cuerpo bajo la cabecera
const BODY_BOTTOM = LAYOUT.h - 0.55; // reserva para el pie
const BLOCK_GAP = 0.25;
const BLOCK_HEADING_H = 0.42;
const TABLE_ROW_H = 0.34;
const TABLE_FONT_SIZE = 10;
const TABLE_HEADER_FONT_SIZE = 11;
const TABLE_LINE_SPACING = 1.2;
const TABLE_LINE_H = (TABLE_FONT_SIZE * TABLE_LINE_SPACING) / 72;
const TABLE_CELL_PAD = TABLE_ROW_H - TABLE_LINE_H;
const KV_ROW_H = 0.46;
const BULLET_ITEM_H = 0.34;
const PARAGRAPH_FONT_SIZE = 12;
const PARAGRAPH_LINE_SPACING = 1.2;
const PARAGRAPH_LINE_H = (PARAGRAPH_FONT_SIZE * PARAGRAPH_LINE_SPACING) / 72;
const PARAGRAPH_MIN_H = PARAGRAPH_LINE_H;

const bodySpan = () => BODY_BOTTOM - BODY_TOP;

// Heurística compartida entre paginación y render: ancho medio de carácter en Calibri 12.
function charsPerLine(widthInches = CONTENT_W, fontSize = PARAGRAPH_FONT_SIZE) {
  const avgCharWidthPt = fontSize * 0.5;
  return Math.max(1, Math.floor((widthInches * 72) / avgCharWidthPt));
}

function wrapTextToLines(text, maxCharsPerLine) {
  const lines = [];
  for (const paragraph of String(text ?? '').split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxCharsPerLine) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      if (word.length > maxCharsPerLine) {
        let rest = word;
        while (rest.length > maxCharsPerLine) {
          lines.push(rest.slice(0, maxCharsPerLine));
          rest = rest.slice(maxCharsPerLine);
        }
        current = rest;
      } else {
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [''];
}

function estimateParagraphTextHeight(text) {
  const lineCount = wrapTextToLines(text, charsPerLine()).length;
  return Math.max(PARAGRAPH_MIN_H, lineCount * PARAGRAPH_LINE_H);
}

function tableColumnWidths(columnCount) {
  const colW = CONTENT_W / Math.max(1, columnCount);
  return Array(columnCount).fill(colW);
}

function estimateTableCellHeight(text, columnWidth, fontSize = TABLE_FONT_SIZE) {
  const lineCount = wrapTextToLines(text, charsPerLine(columnWidth, fontSize)).length;
  const lineH = (fontSize * TABLE_LINE_SPACING) / 72;
  return Math.max(TABLE_ROW_H, lineCount * lineH + TABLE_CELL_PAD);
}

function estimateTableRowHeight(cells, columnWidths, fontSize = TABLE_FONT_SIZE) {
  return cells.reduce((maxH, cell, i) => {
    const colW = columnWidths[i] ?? columnWidths[columnWidths.length - 1];
    return Math.max(maxH, estimateTableCellHeight(cell, colW, fontSize));
  }, TABLE_ROW_H);
}

function estimateTableRowHeights(block) {
  const widths = tableColumnWidths(block.columns.length);
  const headerH = estimateTableRowHeight(block.columns, widths, TABLE_HEADER_FONT_SIZE);
  const bodyHs = block.rows.map((row) => estimateTableRowHeight(row, widths, TABLE_FONT_SIZE));
  return [headerH, ...bodyHs];
}

function estimateTableBlockHeight(block) {
  const headH = block.heading ? BLOCK_HEADING_H : 0;
  return headH + estimateTableRowHeights(block).reduce((acc, h) => acc + h, 0);
}

function splitParagraphText(text, maxLines) {
  const lines = wrapTextToLines(text, charsPerLine());
  if (lines.length <= maxLines) {
    return { chunkText: String(text ?? ''), remainderText: null };
  }
  return {
    chunkText: lines.slice(0, maxLines).join(' '),
    remainderText: lines.slice(maxLines).join(' '),
  };
}

// --- Portada -----------------------------------------------------------------

function renderCover(pptx, spec) {
  const slide = pptx.addSlide();
  slide.background = { color: PPT.navy };

  // Banda de acento azul a la izquierda
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.22, h: LAYOUT.h, fill: { color: PPT.blue } });

  // Kicker corporativo
  slide.addText('TCCT · PRESALES SUITE', {
    x: M, y: 0.7, w: CONTENT_W, h: 0.3,
    fontFace: FONT.body, fontSize: 12, color: PPT.blue, bold: true, charSpacing: 2,
  });

  // Título del pliego
  slide.addText(spec.title, {
    x: M, y: 1.3, w: CONTENT_W, h: 1.8,
    fontFace: FONT.display, fontSize: 40, color: PPT.white, bold: true, valign: 'top', lineSpacingMultiple: 1.0,
  });

  // Organismo
  slide.addText(spec.organismo, {
    x: M, y: 3.15, w: CONTENT_W, h: 0.5,
    fontFace: FONT.body, fontSize: 18, color: 'C7D2E4',
  });

  // Tagline opcional
  if (spec.tagline) {
    slide.addText(spec.tagline, {
      x: M, y: 3.7, w: CONTENT_W, h: 0.5,
      fontFace: FONT.body, fontSize: 14, color: '9FB3D0', italic: true,
    });
  }

  // Rejilla de metadatos (3 columnas) en la parte baja
  const cols = 3;
  const cellW = CONTENT_W / cols;
  const gridTop = 4.7;
  spec.meta.forEach((m, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = M + col * cellW;
    const y = gridTop + row * 1.0;
    slide.addText(m.label.toUpperCase(), {
      x, y, w: cellW - 0.2, h: 0.3,
      fontFace: FONT.body, fontSize: 9, color: '7E93B5', bold: true, charSpacing: 1,
    });
    slide.addText(m.value, {
      x, y: y + 0.28, w: cellW - 0.2, h: 0.4,
      fontFace: m.mono ? FONT.mono : FONT.body, fontSize: 15, color: PPT.white, bold: true,
    });
  });
}

// --- Cabecera / pie de diapositivas de contenido -----------------------------

function addContentHeader(pptx, slide, spec) {
  slide.background = { color: PPT.white };
  // Marcador de acento
  slide.addShape(pptx.ShapeType.rect, { x: M, y: HEADER_Y, w: 0.14, h: 0.5, fill: { color: PPT.blue } });
  slide.addText(spec.title, {
    x: M + 0.28, y: HEADER_Y - 0.05, w: CONTENT_W - 2, h: 0.6,
    fontFace: FONT.display, fontSize: 24, color: PPT.navy, bold: true, valign: 'middle',
  });
  // Numeración de sección (arriba a la derecha)
  if (spec.kind === 'section') {
    slide.addText(`${spec.index} / ${spec.total}`, {
      x: LAYOUT.w - M - 1.5, y: HEADER_Y, w: 1.5, h: 0.5,
      fontFace: FONT.mono, fontSize: 12, color: PPT.gray, align: 'right', valign: 'middle',
    });
  }
  // Línea separadora
  slide.addShape(pptx.ShapeType.line, {
    x: M, y: 1.25, w: CONTENT_W, h: 0, line: { color: PPT.border, width: 1 },
  });
}

function addFooter(slide, spec) {
  slide.addText(
    [
      { text: 'TCCT Pliegos · Presales Suite', options: { color: PPT.gray } },
      { text: '   ·   ', options: { color: PPT.border } },
      { text: spec.expediente || '', options: { color: PPT.gray, fontFace: FONT.mono } },
    ],
    { x: M, y: LAYOUT.h - 0.45, w: CONTENT_W, h: 0.3, fontFace: FONT.body, fontSize: 8, align: 'left' },
  );
}

// --- Render de bloques -------------------------------------------------------

// Altura estimada alineada con las constantes de render (rowH, cursor, etc.).
function estimateBlockHeight(block) {
  const headH = block.heading ? BLOCK_HEADING_H : 0;
  if (block.type === 'table') return estimateTableBlockHeight(block);
  if (block.type === 'keyvalue') return headH + block.rows.length * KV_ROW_H;
  if (block.type === 'bullets') return headH + block.items.length * BULLET_ITEM_H;
  if (block.type === 'paragraph') return headH + estimateParagraphTextHeight(block.text);
  return 0.5;
}

function splitParagraphBlock(block, maxHeight, showHeading = true) {
  const headingH = showHeading && block.heading ? BLOCK_HEADING_H : 0;
  const availableForText = maxHeight - headingH;
  if (availableForText <= 0) {
    return { chunk: null, remainder: block };
  }
  const fullTextH = estimateParagraphTextHeight(block.text);
  if (headingH + fullTextH <= maxHeight) {
    return { chunk: block, remainder: null };
  }
  const maxLines = Math.floor(availableForText / PARAGRAPH_LINE_H);
  if (maxLines <= 0) {
    return { chunk: null, remainder: block };
  }
  const { chunkText, remainderText } = splitParagraphText(block.text, maxLines);
  const chunk = {
    ...block,
    heading: showHeading ? block.heading : undefined,
    text: chunkText,
  };
  const remainder = remainderText
    ? { ...block, heading: undefined, text: remainderText }
    : null;
  return { chunk, remainder };
}

function splitTableBlock(block, maxHeight, showHeading = true) {
  const headingH = showHeading && block.heading ? BLOCK_HEADING_H : 0;
  const rowHs = estimateTableRowHeights(block);
  let used = headingH + rowHs[0];
  let maxRows = 0;
  for (let i = 0; i < block.rows.length; i++) {
    const next = used + rowHs[i + 1];
    if (next > maxHeight) break;
    used = next;
    maxRows += 1;
  }
  if (maxRows >= block.rows.length) {
    return { chunk: block, remainder: null };
  }
  if (maxRows <= 0) {
    return { chunk: null, remainder: block };
  }
  const chunk = {
    ...block,
    heading: showHeading ? block.heading : undefined,
    rows: block.rows.slice(0, maxRows),
  };
  const remainder = {
    ...block,
    heading: undefined,
    rows: block.rows.slice(maxRows),
  };
  return { chunk, remainder };
}

function splitKeyValueBlock(block, maxHeight, showHeading = true) {
  const headingH = showHeading && block.heading ? BLOCK_HEADING_H : 0;
  const maxRows = Math.floor((maxHeight - headingH) / KV_ROW_H);
  if (maxRows >= block.rows.length) {
    return { chunk: block, remainder: null };
  }
  if (maxRows <= 0) {
    return { chunk: null, remainder: block };
  }
  const chunk = {
    ...block,
    heading: showHeading ? block.heading : undefined,
    rows: block.rows.slice(0, maxRows),
  };
  const remainder = {
    ...block,
    heading: undefined,
    rows: block.rows.slice(maxRows),
  };
  return { chunk, remainder };
}

function splitBulletsBlock(block, maxHeight, showHeading = true) {
  const headingH = showHeading && block.heading ? BLOCK_HEADING_H : 0;
  const maxItems = Math.floor((maxHeight - headingH) / BULLET_ITEM_H);
  if (maxItems >= block.items.length) {
    return { chunk: block, remainder: null };
  }
  if (maxItems <= 0) {
    return { chunk: null, remainder: block };
  }
  const chunk = {
    ...block,
    heading: showHeading ? block.heading : undefined,
    items: block.items.slice(0, maxItems),
  };
  const remainder = {
    ...block,
    heading: undefined,
    items: block.items.slice(maxItems),
  };
  return { chunk, remainder };
}

function splitBlockForHeight(block, maxHeight, showHeading = true) {
  if (block.type === 'table') return splitTableBlock(block, maxHeight, showHeading);
  if (block.type === 'keyvalue') return splitKeyValueBlock(block, maxHeight, showHeading);
  if (block.type === 'bullets') return splitBulletsBlock(block, maxHeight, showHeading);
  if (block.type === 'paragraph') return splitParagraphBlock(block, maxHeight, showHeading);
  const blockH = estimateBlockHeight({
    ...block,
    heading: showHeading ? block.heading : undefined,
  });
  if (blockH <= maxHeight) {
    return { chunk: block, remainder: null };
  }
  return { chunk: null, remainder: block };
}

// Reparte bloques en páginas que respetan BODY_BOTTOM. Las tablas (y listas largas)
// se trocean por filas/ítems y continúan en diapositivas "(cont.)" si hace falta.
function paginateBlocks(blocks) {
  const pages = [];
  let queue = blocks.map((block) => ({ block, showHeading: true }));

  while (queue.length > 0) {
    const page = [];
    let cursor = BODY_TOP;

    while (queue.length > 0) {
      const { block, showHeading } = queue[0];
      const blockH = estimateBlockHeight({
        ...block,
        heading: showHeading ? block.heading : undefined,
      });
      const available = BODY_BOTTOM - cursor;

      if (blockH <= available) {
        page.push({ block, showHeading });
        queue.shift();
        cursor += blockH + BLOCK_GAP;
        continue;
      }

      const { chunk, remainder } = splitBlockForHeight(block, available, showHeading);
      if (chunk) {
        page.push({ block: chunk, showHeading });
        if (remainder) {
          queue[0] = { block: remainder, showHeading: false };
        } else {
          queue.shift();
        }
        break;
      }

      if (page.length > 0) break;

      const { chunk: forced, remainder: forcedRemainder } = splitBlockForHeight(
        block,
        bodySpan(),
        showHeading,
      );
      if (forced) {
        page.push({ block: forced, showHeading });
        if (forcedRemainder) {
          queue[0] = { block: forcedRemainder, showHeading: false };
        } else {
          queue.shift();
        }
        break;
      }

      page.push({ block, showHeading });
      queue.shift();
      break;
    }

    pages.push(page);
  }

  return pages.length ? pages : [[]];
}

function renderTableBlock(pptx, slide, block, y) {
  const header = block.columns.map((c) => ({
    text: c,
    options: { fill: { color: PPT.navy }, color: PPT.white, bold: true, fontSize: 11, fontFace: FONT.body },
  }));
  const body = block.rows.map((row, ri) =>
    row.map((cell) => ({
      text: cell,
      options: {
        fill: { color: ri % 2 ? PPT.surface : PPT.white },
        color: PPT.navy, fontSize: 10, fontFace: FONT.body, valign: 'middle',
      },
    })),
  );
  const rows = [header, ...body];
  const rowH = estimateTableRowHeights(block);
  slide.addTable(rows, {
    x: M, y, w: CONTENT_W,
    border: { type: 'solid', color: PPT.border, pt: 1 },
    align: 'left', valign: 'middle', autoPage: false, rowH,
  });
}

function renderKeyValueBlock(pptx, slide, block, y) {
  let cursor = y;
  if (block.heading) {
    slide.addText(block.heading, {
      x: M, y: cursor, w: CONTENT_W, h: 0.35,
      fontFace: FONT.display, fontSize: 14, color: PPT.blue, bold: true,
    });
    cursor += 0.42;
  }
  const labelW = 2.6;
  block.rows.forEach((r) => {
    slide.addText(r.label, {
      x: M, y: cursor, w: labelW, h: 0.42,
      fontFace: FONT.body, fontSize: 11, color: PPT.gray, bold: true, valign: 'top',
    });
    slide.addText(r.value, {
      x: M + labelW + 0.2, y: cursor, w: CONTENT_W - labelW - 0.2, h: 0.42,
      fontFace: r.mono ? FONT.mono : FONT.body, fontSize: 11, color: PPT.navy, valign: 'top',
    });
    cursor += 0.46;
  });
}

function renderBulletsBlock(pptx, slide, block, y) {
  let cursor = y;
  if (block.heading) {
    slide.addText(block.heading, {
      x: M, y: cursor, w: CONTENT_W, h: 0.35,
      fontFace: FONT.display, fontSize: 14, color: PPT.blue, bold: true,
    });
    cursor += 0.42;
  }
  slide.addText(
    block.items.map((it) => ({ text: it, options: { bullet: { indent: 15 }, color: PPT.navy } })),
    {
      x: M, y: cursor, w: CONTENT_W, h: block.items.length * 0.34,
      fontFace: FONT.body, fontSize: 12, valign: 'top', lineSpacingMultiple: 1.15,
    },
  );
}

function renderParagraphBlock(pptx, slide, block, y) {
  let cursor = y;
  if (block.heading) {
    slide.addText(block.heading, {
      x: M, y: cursor, w: CONTENT_W, h: 0.35,
      fontFace: FONT.display, fontSize: 14, color: PPT.blue, bold: true,
    });
    cursor += 0.42;
  }
  const textH = estimateParagraphTextHeight(block.text);
  slide.addText(block.text, {
    x: M, y: cursor, w: CONTENT_W, h: textH,
    fontFace: FONT.body, fontSize: PARAGRAPH_FONT_SIZE, color: PPT.navy,
    valign: 'top', lineSpacingMultiple: PARAGRAPH_LINE_SPACING,
  });
}

function renderBlock(pptx, slide, block, y) {
  if (block.type === 'table') return renderTableBlock(pptx, slide, block, y);
  if (block.type === 'keyvalue') return renderKeyValueBlock(pptx, slide, block, y);
  if (block.type === 'bullets') return renderBulletsBlock(pptx, slide, block, y);
  if (block.type === 'paragraph') return renderParagraphBlock(pptx, slide, block, y);
}

function renderContentSlide(pptx, spec) {
  if (spec.blocks.length === 0) {
    const slide = pptx.addSlide();
    addContentHeader(pptx, slide, spec);
    const emptyMessage = spec.kind === 'final'
      ? 'Sin conclusiones ni recomendación generadas.'
      : 'Sin datos para esta sección.';
    slide.addText(emptyMessage, {
      x: M, y: BODY_TOP + 0.3, w: CONTENT_W, h: 0.5,
      fontFace: FONT.body, fontSize: 13, color: PPT.gray, italic: true,
    });
    addFooter(slide, spec);
    return;
  }

  const pages = paginateBlocks(spec.blocks);
  const totalH = spec.blocks.reduce((acc, b) => acc + estimateBlockHeight(b) + BLOCK_GAP, 0) - BLOCK_GAP;
  const centerOffset = pages.length === 1 && totalH < bodySpan()
    ? Math.min(0.3, (bodySpan() - totalH) / 2)
    : 0;

  pages.forEach((pageBlocks, pageIndex) => {
    const slide = pptx.addSlide();
    const slideSpec = pageIndex > 0
      ? { ...spec, title: `${spec.title} (cont.)` }
      : spec;
    addContentHeader(pptx, slide, slideSpec);

    let cursor = BODY_TOP + (pageIndex === 0 ? centerOffset : 0);
    pageBlocks.forEach(({ block, showHeading }) => {
      const renderable = showHeading ? block : { ...block, heading: undefined };
      renderBlock(pptx, slide, renderable, cursor);
      cursor += estimateBlockHeight(renderable) + BLOCK_GAP;
    });

    addFooter(slide, spec);
  });
}

// --- Punto de entrada --------------------------------------------------------

// specs → Buffer con el .pptx. `meta` opcional (expediente) para el pie de página.
export async function renderPptx(specs, { expediente } = {}) {
  const pptx = new pptxgen();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'TCCT Pliegos · Presales Suite';
  pptx.company = 'Telefónica Cybersecurity & Cloud Tech';

  specs.forEach((spec) => {
    const withExp = { ...spec, expediente };
    if (spec.kind === 'cover') renderCover(pptx, withExp);
    else renderContentSlide(pptx, withExp);
  });

  return pptx.write({ outputType: 'nodebuffer' });
}

export {
  estimateBlockHeight,
  estimateParagraphTextHeight,
  estimateTableRowHeights,
  paginateBlocks,
};
