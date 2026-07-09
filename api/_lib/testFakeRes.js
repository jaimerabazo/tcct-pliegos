// Doble mínimo del objeto `res` de Vercel/Node para tests de handlers: solo
// necesitamos capturar el status y el payload de `.json(...)`.
export function createFakeRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}
