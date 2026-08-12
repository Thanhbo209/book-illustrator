import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CharacterDTO } from "@/types/domain";

// Local placeholder used whenever a real portrait hasn't been generated yet
// (or generation failed) — the card should always show a landscape portrait
// visual, never a raw error string standing in for the image. The database
// still records the real portraitState/portraitError; this is UI-only.
const MOCK_PORTRAIT_SRC = "/mock-portrait.svg";

export function CharacterCard({ character }: { character: CharacterDTO }) {
  const isRunning = character.portraitState === "RUNNING";
  const isFailed = character.portraitState === "FAILED";

  return (
    <Card>
      <Image
        src={character.portraitUrl ?? MOCK_PORTRAIT_SRC}
        alt={
          character.portraitUrl
            ? `Portrait of ${character.name}`
            : `Placeholder portrait for ${character.name}`
        }
        width={480}
        height={320}
        className="aspect-3/2 w-full object-cover"
      />
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{character.name}</CardTitle>
          {isRunning ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              Generating...
            </span>
          ) : null}
          {isFailed ? <Badge variant="destructive">Portrait failed</Badge> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">{character.prompt}</p>
        {isFailed && character.portraitError ? (
          <p className="text-[11px] text-muted-foreground/80">{character.portraitError}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
