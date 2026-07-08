import { describe, it, expect } from 'vitest';
import {
  isBlankNumber,
  formatNumber,
  formatEuro,
  formatEuroFull,
  formatShortDate,
  slugify,
  listToText,
  textToList,
  linesToText,
  textToLines,
  computeDashboardKpis,
  getLotesSumMismatch,
} from './logic.js';

describe('isBlankNumber', () => {
  it('trata "", null, undefined y NaN como en blanco', () => {
    expect(isBlankNumber('')).toBe(true);
    expect(isBlankNumber(null)).toBe(true);
    expect(isBlankNumber(undefined)).toBe(true);
    expect(isBlankNumber(NaN)).toBe(true);
  });

  it('no trata 0 ni números normales como en blanco', () => {
    expect(isBlankNumber(0)).toBe(false);
    expect(isBlankNumber(42)).toBe(false);
    expect(isBlankNumber(-5)).toBe(false);
  });
});

describe('formatNumber', () => {
  it('devuelve un guion para valores en blanco', () => {
    expect(formatNumber('')).toBe('—');
    expect(formatNumber(null)).toBe('—');
  });

  it('devuelve el número tal cual si no está en blanco', () => {
    expect(formatNumber(7)).toBe(7);
    expect(formatNumber(0)).toBe(0);
  });
});

describe('formatEuro', () => {
  it('formatea millones con dos decimales', () => {
    expect(formatEuro(18500000)).toBe('18.50M €');
    expect(formatEuro(1234567)).toBe('1.23M €');
  });

  it('formatea miles sin decimales', () => {
    expect(formatEuro(4520)).toBe('5K €');
    expect(formatEuro(1000)).toBe('1K €');
  });

  it('formatea importes pequeños sin sufijo', () => {
    expect(formatEuro(500)).toBe('500 €');
    expect(formatEuro(0)).toBe('0 €');
  });

  it('devuelve un guion para valores en blanco', () => {
    expect(formatEuro('')).toBe('—');
    expect(formatEuro(null)).toBe('—');
    expect(formatEuro(NaN)).toBe('—');
  });
});

describe('formatEuroFull', () => {
  it('formatea con el locale es-ES', () => {
    // Intl.NumberFormat puede usar un espacio no separable ( / ) antes del símbolo.
    expect(formatEuroFull(18500000).replace(/\s/g, ' ')).toBe('18.500.000 €');
  });

  it('devuelve un guion para valores en blanco', () => {
    expect(formatEuroFull(undefined)).toBe('—');
  });
});

describe('formatShortDate', () => {
  it('formatea como "DD mes AAAA" en minúsculas', () => {
    expect(formatShortDate(new Date(2026, 6, 6))).toBe('06 jul 2026');
  });

  it('rellena el día con cero a la izquierda', () => {
    expect(formatShortDate(new Date(2026, 0, 1))).toBe('01 ene 2026');
  });
});

describe('slugify', () => {
  it('convierte expedientes con barra en slug con guion', () => {
    expect(slugify('2026/7008')).toBe('2026-7008');
  });

  it('quita acentos... no, normaliza a minúsculas y colapsa separadores', () => {
    expect(slugify('Hola Mundo!!')).toBe('hola-mundo');
    expect(slugify('--ya-tiene-guiones--')).toBe('ya-tiene-guiones');
  });
});

describe('listToText / textToList', () => {
  it('convierte array a texto separado por comas', () => {
    expect(listToText(['a', 'b', 'c'])).toBe('a, b, c');
  });

  it('devuelve cadena vacía para array vacío o nulo', () => {
    expect(listToText([])).toBe('');
    expect(listToText(undefined)).toBe('');
  });

  it('separa por comas, recorta espacios y descarta vacíos', () => {
    expect(textToList('a, b ,  c,')).toEqual(['a', 'b', 'c']);
  });
});

describe('linesToText / textToLines', () => {
  it('convierte array a texto con saltos de línea', () => {
    expect(linesToText(['uno', 'dos'])).toBe('uno\ndos');
  });

  it('devuelve cadena vacía para array vacío o nulo', () => {
    expect(linesToText(undefined)).toBe('');
    expect(linesToText(null)).toBe('');
  });

  it('separa por líneas, recorta espacios y descarta vacías', () => {
    expect(textToLines('uno\n dos \n\ntres')).toEqual(['uno', 'dos', 'tres']);
  });
});

describe('computeDashboardKpis', () => {
  it('devuelve ceros y confianza demo (94) para lista vacía', () => {
    const kpis = computeDashboardKpis([]);
    expect(kpis).toEqual({ count: 0, totalImporte: 0, avgImporte: 0, avgConfianza: 94 });
  });

  it('calcula count, total y media para un solo pliego', () => {
    const kpis = computeDashboardKpis([{ importe: 1000000 }]);
    expect(kpis.count).toBe(1);
    expect(kpis.totalImporte).toBe(1000000);
    expect(kpis.avgImporte).toBe(1000000);
  });

  it('suma y promedia el importe de varios pliegos', () => {
    const kpis = computeDashboardKpis([{ importe: 1000000 }, { importe: 3000000 }]);
    expect(kpis.count).toBe(2);
    expect(kpis.totalImporte).toBe(4000000);
    expect(kpis.avgImporte).toBe(2000000);
  });

  it('trata importe ausente/no numérico como 0 al sumar', () => {
    const kpis = computeDashboardKpis([{ importe: 1000 }, { importe: undefined }, { importe: '' }]);
    expect(kpis.totalImporte).toBe(1000);
  });

  it('la confianza media solo promedia pliegos con analysisData', () => {
    const pliegos = [
      { importe: 100, analysisData: { lotes: [{ confianza: 90 }, { confianza: 100 }], perfiles: [{ confianza: 80 }] } },
      { importe: 200 }, // sin analysisData, no debe contar
    ];
    const kpis = computeDashboardKpis(pliegos);
    expect(kpis.avgConfianza).toBeCloseTo(90); // (90 + 100 + 80) / 3
  });

  it('si ningún pliego tiene analysisData, usa el valor demo (94)', () => {
    const kpis = computeDashboardKpis([{ importe: 100 }, { importe: 200 }]);
    expect(kpis.avgConfianza).toBe(94);
  });

  it('ignora valores de confianza en blanco dentro de analysisData', () => {
    const pliegos = [
      { importe: 100, analysisData: { lotes: [{ confianza: '' }, { confianza: 80 }], perfiles: [] } },
    ];
    const kpis = computeDashboardKpis(pliegos);
    expect(kpis.avgConfianza).toBe(80);
  });

  it('soporta analysisData sin lotes ni perfiles (usa el default 94)', () => {
    const kpis = computeDashboardKpis([{ importe: 100, analysisData: {} }]);
    expect(kpis.avgConfianza).toBe(94);
  });

  it('si todas las confianzas están en blanco, mantiene el default 94', () => {
    const pliegos = [
      { importe: 100, analysisData: { lotes: [{ confianza: '' }], perfiles: [{ confianza: null }] } },
    ];
    const kpis = computeDashboardKpis(pliegos);
    expect(kpis.avgConfianza).toBe(94);
  });
});

describe('getLotesSumMismatch', () => {
  it('devuelve null cuando la suma de lotes coincide con el importe del pliego', () => {
    const pliego = { importe: 3000 };
    const analysisData = { lotes: [{ importe: 1000 }, { importe: 2000 }] };
    expect(getLotesSumMismatch(pliego, analysisData)).toBeNull();
  });

  it('detecta cuando la suma de lotes es menor que el importe del pliego', () => {
    const pliego = { importe: 3000 };
    const analysisData = { lotes: [{ importe: 1000 }, { importe: 1000 }] };
    const result = getLotesSumMismatch(pliego, analysisData);
    expect(result).toEqual({ lotesSum: 2000, pliegoImporte: 3000, diff: -1000 });
  });

  it('detecta cuando la suma de lotes es mayor que el importe del pliego', () => {
    const pliego = { importe: 3000 };
    const analysisData = { lotes: [{ importe: 2000 }, { importe: 2000 }] };
    const result = getLotesSumMismatch(pliego, analysisData);
    expect(result).toEqual({ lotesSum: 4000, pliegoImporte: 3000, diff: 1000 });
  });

  it('trata una lista de lotes vacía como suma 0', () => {
    const pliego = { importe: 0 };
    const result = getLotesSumMismatch(pliego, { lotes: [] });
    expect(result).toBeNull();
  });

  it('marca mismatch si hay lotes pero el pliego no tiene importe', () => {
    const pliego = { importe: 0 };
    const analysisData = { lotes: [{ importe: 500 }] };
    expect(getLotesSumMismatch(pliego, analysisData)).toEqual({ lotesSum: 500, pliegoImporte: 0, diff: 500 });
  });

  it('trata importes en blanco/no numéricos de los lotes como 0 al sumar', () => {
    const pliego = { importe: 1000 };
    const analysisData = { lotes: [{ importe: 1000 }, { importe: '' }, { importe: undefined }] };
    expect(getLotesSumMismatch(pliego, analysisData)).toBeNull();
  });

  it('funciona si analysisData no trae lotes en absoluto', () => {
    const pliego = { importe: 0 };
    expect(getLotesSumMismatch(pliego, {})).toBeNull();
  });
});
