import '@testing-library/jest-dom';

// Node 22 puede publicar un global `localStorage` indefinido si no se arrancó con
// --localstorage-file. En los tests de navegador debe prevalecer siempre el storage que
// proporciona jsdom.
if (typeof window !== 'undefined') {
  const memory = new Map();
  const testStorage = window.localStorage ?? {
    getItem: (key) => memory.get(String(key)) ?? null,
    setItem: (key, value) => memory.set(String(key), String(value)),
    removeItem: (key) => memory.delete(String(key)),
    clear: () => memory.clear(),
  };
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: testStorage,
  });
}
