import "server-only";

import { getGeminiConfig } from "@/lib/gemini/config";
import { GeminiApiError, GeminiResponseShapeError } from "@/lib/gemini/errors";

// Mechanics verified against the live REST API on 2026-08-11 (see
// DECISIONS.md) — the Interactions API is not yet documented in any SDK
// for non-Python/JS stacks, so this was confirmed empirically rather than
// from official examples.
const API_BASE = "https://generativelanguage.googleapis.com";

export type InteractionInputItem =
  | { type: "text"; text: string }
  | { type: "document"; uri: string; mime_type: string }
  | { type: "image"; data: string; mime_type: string };

export interface InteractionContentItem {
  type: string;
  text?: string;
  data?: string;
  mime_type?: string;
}

export interface InteractionStep {
  type: string;
  content?: InteractionContentItem[];
}

export interface InteractionResponse {
  id: string;
  status: string;
  steps: InteractionStep[];
  model: string;
  object: string;
}

export interface CreateInteractionParams {
  model: string;
  input: string | InteractionInputItem[];
  previousInteractionId?: string;
  /** Raw JSON Schema — see lib/validation/gemini.ts's toGeminiSchema(). */
  responseSchema?: Record<string, unknown>;
  /** Verified live as a real top-level field, not SDK sugar. */
  systemInstruction?: string;
}

interface GeminiErrorBody {
  error?: { message?: string; code?: string };
}

export async function createInteraction(
  params: CreateInteractionParams,
): Promise<InteractionResponse> {
  const { apiKey } = getGeminiConfig();

  const body: Record<string, unknown> = {
    model: params.model,
    input: params.input,
  };
  if (params.previousInteractionId) {
    body.previous_interaction_id = params.previousInteractionId;
  }
  if (params.responseSchema) {
    body.response_format = params.responseSchema;
  }
  if (params.systemInstruction) {
    body.system_instruction = params.systemInstruction;
  }

  const response = await fetch(`${API_BASE}/v1beta/interactions`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => null)) as
    | (InteractionResponse & GeminiErrorBody)
    | null;

  if (!response.ok || !json || json.error) {
    throw new GeminiApiError(
      json?.error?.message ?? `Gemini request failed with status ${response.status}`,
      json?.error?.code,
    );
  }

  return json;
}

export interface UploadFileParams {
  content: Buffer;
  mimeType: string;
  displayName: string;
}

export interface UploadedFile {
  uri: string;
  mimeType: string;
  expiresAt: Date;
}

export async function uploadFile(params: UploadFileParams): Promise<UploadedFile> {
  const { apiKey } = getGeminiConfig();

  const startResponse = await fetch(`${API_BASE}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(params.content.byteLength),
      "X-Goog-Upload-Header-Content-Type": params.mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: params.displayName } }),
  });

  if (!startResponse.ok) {
    const errJson = (await startResponse.json().catch(() => null)) as GeminiErrorBody | null;
    throw new GeminiApiError(
      errJson?.error?.message ??
        `Gemini file upload failed to start (status ${startResponse.status})`,
      errJson?.error?.code,
    );
  }

  const uploadUrl = startResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new GeminiApiError("Gemini file upload did not return an upload URL");
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(params.content.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: new Uint8Array(params.content),
  });

  const json = (await uploadResponse.json().catch(() => null)) as
    | { file?: { uri?: string; mimeType?: string; expirationTime?: string } }
    | (GeminiErrorBody & { file?: undefined })
    | null;

  if (!uploadResponse.ok || !json?.file?.uri || !json.file.expirationTime) {
    const errJson = json as GeminiErrorBody | null;
    throw new GeminiApiError(
      errJson?.error?.message ??
        `Gemini file upload failed to finalize (status ${uploadResponse.status})`,
      errJson?.error?.code,
    );
  }

  return {
    uri: json.file.uri,
    mimeType: json.file.mimeType ?? params.mimeType,
    expiresAt: new Date(json.file.expirationTime),
  };
}

export function getModelOutputText(response: InteractionResponse): string {
  const outputStep = response.steps.find((step) => step.type === "model_output");
  const textItem = outputStep?.content?.find(
    (item) => item.type === "text" && typeof item.text === "string",
  );

  if (!textItem?.text) {
    const stepTypes = response.steps.map((step) => step.type);
    throw new GeminiResponseShapeError(
      `Expected a text model_output step, found step types: ${JSON.stringify(stepTypes)}`,
    );
  }

  return textItem.text;
}
