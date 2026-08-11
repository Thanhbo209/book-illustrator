// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GEMINI_API_KEY = "test-key";
  process.env.GEMINI_TEXT_MODEL = "gemini-3.6-flash";
  process.env.GEMINI_IMAGE_MODEL = "gemini-3.1-flash-image";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createInteraction", () => {
  it("posts the expected body and returns the parsed response", async () => {
    const { createInteraction } = await import("@/lib/gemini/client");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "abc", status: "completed", steps: [], model: "x", object: "interaction" }), {
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createInteraction({
      model: "gemini-3.6-flash",
      input: "hello",
      previousInteractionId: "prev-1",
      responseSchema: { type: "object" },
    });

    expect(result.id).toBe("abc");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://generativelanguage.googleapis.com/v1beta/interactions");
    expect(init.headers["x-goog-api-key"]).toBe("test-key");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      model: "gemini-3.6-flash",
      input: "hello",
      previous_interaction_id: "prev-1",
      response_format: { type: "object" },
    });
  });

  it("throws GeminiApiError with the server's message on failure", async () => {
    const { createInteraction } = await import("@/lib/gemini/client");
    const { GeminiApiError } = await import("@/lib/gemini/errors");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "bad request", code: "invalid_request" } }), {
          status: 400,
        }),
      ),
    );

    await expect(createInteraction({ model: "gemini-3.6-flash", input: "hi" })).rejects.toMatchObject({
      message: "bad request",
      code: "invalid_request",
    });
    await expect(createInteraction({ model: "gemini-3.6-flash", input: "hi" })).rejects.toBeInstanceOf(
      GeminiApiError,
    );
  });

  it("throws GeminiApiError when the response body isn't parseable JSON", async () => {
    const { createInteraction } = await import("@/lib/gemini/client");
    const { GeminiApiError } = await import("@/lib/gemini/errors");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 500 })));

    await expect(createInteraction({ model: "gemini-3.6-flash", input: "hi" })).rejects.toBeInstanceOf(
      GeminiApiError,
    );
  });
});

describe("getModelOutputText", () => {
  it("extracts text from the model_output step", async () => {
    const { getModelOutputText } = await import("@/lib/gemini/client");

    const text = getModelOutputText({
      id: "1",
      status: "completed",
      model: "x",
      object: "interaction",
      steps: [
        { type: "thought" },
        { type: "model_output", content: [{ type: "text", text: "hello world" }] },
      ],
    });

    expect(text).toBe("hello world");
  });

  it("throws GeminiResponseShapeError when no model_output text step exists", async () => {
    const { getModelOutputText } = await import("@/lib/gemini/client");
    const { GeminiResponseShapeError } = await import("@/lib/gemini/errors");

    expect(() =>
      getModelOutputText({ id: "1", status: "completed", model: "x", object: "interaction", steps: [{ type: "thought" }] }),
    ).toThrow(GeminiResponseShapeError);
  });
});

describe("uploadFile", () => {
  it("performs the resumable start+upload flow and returns the file resource", async () => {
    const { uploadFile } = await import("@/lib/gemini/client");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 200,
          headers: { "x-goog-upload-url": "https://upload.example/session-1" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            file: {
              uri: "https://generativelanguage.googleapis.com/v1beta/files/abc",
              mimeType: "text/plain",
              expirationTime: "2026-01-01T00:00:00Z",
            },
          }),
          { status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await uploadFile({
      content: Buffer.from("hello"),
      mimeType: "text/plain",
      displayName: "book.txt",
    });

    expect(result.uri).toBe("https://generativelanguage.googleapis.com/v1beta/files/abc");
    expect(result.expiresAt).toEqual(new Date("2026-01-01T00:00:00Z"));
    expect(fetchMock.mock.calls[1][0]).toBe("https://upload.example/session-1");
  });

  it("throws GeminiApiError when the start request doesn't return an upload URL", async () => {
    const { uploadFile } = await import("@/lib/gemini/client");
    const { GeminiApiError } = await import("@/lib/gemini/errors");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));

    await expect(
      uploadFile({ content: Buffer.from("hi"), mimeType: "text/plain", displayName: "x.txt" }),
    ).rejects.toBeInstanceOf(GeminiApiError);
  });
});
