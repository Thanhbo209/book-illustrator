import "server-only";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export function getGeminiConfig() {
  return {
    apiKey: requireEnv("GEMINI_API_KEY"),
    textModel: requireEnv("GEMINI_TEXT_MODEL"),
    imageModel: requireEnv("GEMINI_IMAGE_MODEL"),
  };
}
