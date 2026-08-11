"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { ApiErrorBody } from "@/types/api";

type BookSource = "paste" | "upload";

export function NewProjectForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<BookSource>("paste");
  const [title, setTitle] = useState("");
  const [bookText, setBookText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError("Title is required");
      return;
    }

    const file = fileInputRef.current?.files?.[0];
    if (source === "paste" && !bookText.trim()) {
      setError("Paste the book's text, or switch to upload a .txt file");
      return;
    }
    if (source === "upload" && !file) {
      setError("Choose a .txt file to upload");
      return;
    }

    const formData = new FormData();
    formData.set("title", trimmedTitle);
    if (source === "upload" && file) {
      formData.set("file", file);
    } else {
      formData.set("bookText", bookText);
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/projects", { method: "POST", body: formData });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        setError(body?.error.message ?? "Something went wrong. Please try again.");
        return;
      }
      const { project } = await response.json();
      router.push(`/projects/${project.id}`);
      router.refresh();
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle>New project</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-5" onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Book text</Label>
            <div className="inline-flex w-fit rounded-lg border border-border p-0.5">
              <button
                type="button"
                onClick={() => setSource("paste")}
                disabled={isSubmitting}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  source === "paste"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Paste text
              </button>
              <button
                type="button"
                onClick={() => setSource("upload")}
                disabled={isSubmitting}
                className={cn(
                  "rounded-md px-3 py-1 text-sm font-medium transition-colors",
                  source === "upload"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Upload .txt
              </button>
            </div>

            {source === "paste" ? (
              <Textarea
                rows={10}
                placeholder="Paste the book's full text here..."
                value={bookText}
                onChange={(event) => setBookText(event.target.value)}
                disabled={isSubmitting}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,text/plain"
                  disabled={isSubmitting}
                  onChange={(event) => setFileName(event.target.files?.[0]?.name ?? null)}
                />
                {fileName ? (
                  <p className="text-sm text-muted-foreground">Selected: {fileName}</p>
                ) : null}
              </div>
            )}
          </div>

          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <Button type="submit" disabled={isSubmitting} className="self-start">
            {isSubmitting ? "Creating..." : "Create project"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
