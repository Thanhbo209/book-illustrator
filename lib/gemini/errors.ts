export class GeminiApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "GeminiApiError";
    this.code = code;
  }
}

/** Gemini returned a 200 but the payload didn't match what we expected. */
export class GeminiResponseShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiResponseShapeError";
  }
}
