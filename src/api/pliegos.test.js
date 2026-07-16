import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizePliego, listPliegos, analyzePdf, updatePliego, updateAnalysis, generatePresentation, downloadBlob } from './pliegos.js';

function mockFetchOnce({ ok = true, status = 200, body }) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('normalizePliego', () => {
  it('convierte las fechas ISO de la BD a formato corto', () => {
    const row = { id: 'a', importe: 100, fechaAnalisis: '2026-07-04T00:00:00.000Z', fechaLimite: '2026-07-15T00:00:00.000Z' };
    const p = normalizePliego(row);
    expect(p.fechaAnalisis).toBe('04 jul 2026');
    expect(p.fechaLimite).toBe('15 jul 2026');
  });

  it('deja fechaLimite en null cuando la BD la trae vacía', () => {
    const p = normalizePliego({ id: 'a', importe: 100, fechaAnalisis: '2026-07-04T00:00:00.000Z', fechaLimite: null });
    expect(p.fechaLimite).toBeNull();
  });

  it('conserva el resto de campos intactos', () => {
    const row = { id: 'a', expediente: '2026/0001', importe: 100, analysisData: { x: 1 }, fechaAnalisis: null, fechaLimite: null };
    const p = normalizePliego(row);
    expect(p.expediente).toBe('2026/0001');
    expect(p.analysisData).toEqual({ x: 1 });
  });

  it('si fechaAnalisis no es parseable, conserva el valor original; fechaLimite cae a null', () => {
    const p = normalizePliego({ id: 'a', importe: 100, fechaAnalisis: 'no-es-fecha', fechaLimite: 'tampoco' });
    expect(p.fechaAnalisis).toBe('no-es-fecha');
    expect(p.fechaLimite).toBeNull();
  });
});

describe('listPliegos', () => {
  it('devuelve los pliegos normalizados', async () => {
    mockFetchOnce({ body: [{ id: 'a', importe: 100, fechaAnalisis: '2026-07-04T00:00:00.000Z', fechaLimite: '2026-07-15T00:00:00.000Z' }] });
    const result = await listPliegos();
    expect(result).toHaveLength(1);
    expect(result[0].fechaLimite).toBe('15 jul 2026');
  });

  it('lanza un Error con el mensaje del servidor si la respuesta no es ok', async () => {
    mockFetchOnce({ ok: false, status: 500, body: { error: 'Fallo del servidor.' } });
    await expect(listPliegos()).rejects.toThrow('Fallo del servidor.');
  });

  it('usa un mensaje de fallback si el cuerpo de error no trae error', async () => {
    mockFetchOnce({ ok: false, status: 503, body: null });
    await expect(listPliegos()).rejects.toThrow(/HTTP 503/);
  });

  it('usa el fallback aunque el cuerpo de error no sea JSON parseable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    });
    await expect(listPliegos()).rejects.toThrow(/HTTP 500/);
  });

  it('ante un 401 propaga el error del servidor (y apiFetch cierra la sesión local)', async () => {
    mockFetchOnce({ ok: false, status: 401, body: { error: 'No autorizado. Inicia sesión para continuar.' } });
    await expect(listPliegos()).rejects.toThrow(/No autorizado/);
  });
});

describe('analyzePdf', () => {
  it('envía el PDF y devuelve { pliego, analysis } tal cual', async () => {
    const payload = { pliego: { id: 'x', expediente: '2026/9999' }, analysis: { resumen: {} } };
    mockFetchOnce({ body: payload });
    const file = new File(['%PDF'], 'pliego.pdf', { type: 'application/pdf' });
    const result = await analyzePdf(file);
    expect(result).toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith('/api/analyze', expect.objectContaining({ method: 'POST' }));
  });

  it('propaga el error del servidor', async () => {
    mockFetchOnce({ ok: false, status: 502, body: { error: 'Claude falló.' } });
    const file = new File(['%PDF'], 'pliego.pdf', { type: 'application/pdf' });
    await expect(analyzePdf(file)).rejects.toThrow('Claude falló.');
  });
});

describe('updatePliego', () => {
  it('hace PATCH y devuelve el pliego normalizado', async () => {
    mockFetchOnce({ body: { id: 'a', importe: 3000000, fechaLimite: '2026-07-15T00:00:00.000Z' } });
    const result = await updatePliego('a', { importe: 3000000 });
    expect(result.importe).toBe(3000000);
    expect(result.fechaLimite).toBe('15 jul 2026');
    expect(global.fetch).toHaveBeenCalledWith('/api/pliegos/a', expect.objectContaining({ method: 'PATCH' }));
  });

  it('propaga el error del servidor', async () => {
    mockFetchOnce({ ok: false, status: 404, body: { error: 'Pliego no encontrado.' } });
    await expect(updatePliego('no-existe', { importe: 1 })).rejects.toThrow('Pliego no encontrado.');
  });
});

describe('updateAnalysis', () => {
  it('hace PATCH al sub-recurso de análisis y devuelve el pliego normalizado', async () => {
    mockFetchOnce({ body: { id: 'a', analysisData: { resumen: {} }, fechaLimite: null } });
    const result = await updateAnalysis('a', { resumen: {} });
    expect(result.analysisData).toEqual({ resumen: {} });
    expect(global.fetch).toHaveBeenCalledWith('/api/pliegos/a/analysis', expect.objectContaining({ method: 'PATCH' }));
  });

  it('propaga el error del servidor', async () => {
    mockFetchOnce({ ok: false, status: 400, body: { error: 'Datos de análisis inválidos.' } });
    await expect(updateAnalysis('a', {})).rejects.toThrow('Datos de análisis inválidos.');
  });
});

// Mock de fetch para respuestas binarias (.pptx): expone blob() y headers.get().
function mockFetchBinary({ ok = true, status = 200, blob, disposition = null, errorBody } = {}) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    status,
    blob: async () => blob,
    json: async () => errorBody,
    headers: { get: (k) => (k === 'Content-Disposition' ? disposition : null) },
  });
}

describe('generatePresentation', () => {
  const pliego = { id: 'a', expediente: '2026/7008', analysisData: { resumen: {} } };

  it('devuelve { blob, filename } usando el nombre de Content-Disposition', async () => {
    const blob = new Blob(['pptx-bytes']);
    mockFetchBinary({ blob, disposition: 'attachment; filename="Presentacion_2026-7008.pptx"' });
    const result = await generatePresentation(pliego);
    expect(result.blob).toBe(blob);
    expect(result.filename).toBe('Presentacion_2026-7008.pptx');
    expect(global.fetch).toHaveBeenCalledWith('/api/pliegos/a/presentation', expect.objectContaining({ method: 'POST' }));
  });

  it('manda el pliego completo en el body', async () => {
    mockFetchBinary({ blob: new Blob(['x']), disposition: 'attachment; filename="f.pptx"' });
    await generatePresentation(pliego);
    const [, opts] = global.fetch.mock.calls[0];
    expect(JSON.parse(opts.body)).toEqual(pliego);
  });

  it('cae a un nombre derivado del expediente si no hay Content-Disposition', async () => {
    mockFetchBinary({ blob: new Blob(['x']), disposition: null });
    const result = await generatePresentation(pliego);
    expect(result.filename).toBe('Presentacion_2026-7008.pptx');
  });

  it('cae al nombre por expediente si el Content-Disposition no trae filename', async () => {
    mockFetchBinary({ blob: new Blob(['x']), disposition: 'attachment' });
    const result = await generatePresentation(pliego);
    expect(result.filename).toBe('Presentacion_2026-7008.pptx');
  });

  it('usa "pliego" como nombre si el pliego no tiene expediente', async () => {
    mockFetchBinary({ blob: new Blob(['x']), disposition: null });
    const result = await generatePresentation({ id: 'a', analysisData: {} });
    expect(result.filename).toBe('Presentacion_pliego.pptx');
  });

  it('propaga el error JSON del servidor cuando la respuesta no es ok', async () => {
    mockFetchBinary({ ok: false, status: 502, errorBody: { error: 'Claude ha fallado.' } });
    await expect(generatePresentation(pliego)).rejects.toThrow('Claude ha fallado.');
  });

  it('usa un mensaje de fallback si el error no trae cuerpo JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 500,
      json: async () => { throw new Error('not json'); },
    });
    await expect(generatePresentation(pliego)).rejects.toThrow(/HTTP 500/);
  });
});

describe('downloadBlob', () => {
  it('crea un <a download> con el nombre dado, lo dispara y difiere la limpieza', async () => {
    global.URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    global.URL.revokeObjectURL = vi.fn();
    const created = [];
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      const el = realCreate(tag);
      created.push(el);
      return el;
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    downloadBlob(new Blob(['x']), 'Presentacion_2026-7008.pptx');

    const anchor = created.find((el) => el.tagName === 'A');
    expect(anchor).toBeTruthy();
    expect(anchor.download).toBe('Presentacion_2026-7008.pptx');
    expect(anchor.href).toContain('blob:fake-url');
    expect(clickSpy).toHaveBeenCalled();
    expect(global.URL.createObjectURL).toHaveBeenCalled();
    // El click es síncrono; la limpieza (remove + revoke) se difiere para no abortar la descarga.
    expect(global.URL.revokeObjectURL).not.toHaveBeenCalled();
    expect(document.body.contains(anchor)).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url');
    expect(document.body.contains(anchor)).toBe(false);
  });
});
