import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ChapterDTO } from "@/types/domain";

export function ChapterCard({ chapter }: { chapter: ChapterDTO }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{chapter.title}</CardTitle>
          {chapter.illustrationState === "RUNNING" ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              Generating...
            </span>
          ) : null}
          {chapter.illustrationState === "FAILED" ? (
            <Badge variant="destructive">Illustration failed</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {chapter.illustrationUrl ? (
          <Image
            src={chapter.illustrationUrl}
            alt={`Illustration for ${chapter.title}`}
            width={512}
            height={512}
            className="aspect-video w-full rounded-md object-cover"
          />
        ) : null}
        {chapter.illustrationState === "FAILED" && chapter.illustrationError ? (
          <p className="text-xs text-destructive">{chapter.illustrationError}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">{chapter.prompt}</p>
      </CardContent>
    </Card>
  );
}
