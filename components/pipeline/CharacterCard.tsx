import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CharacterDTO } from "@/types/domain";

export function CharacterCard({ character }: { character: CharacterDTO }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{character.name}</CardTitle>
          {character.portraitState === "RUNNING" ? (
            <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              Generating...
            </span>
          ) : null}
          {character.portraitState === "FAILED" ? (
            <Badge variant="destructive">Portrait failed</Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {character.portraitUrl ? (
          <Image
            src={character.portraitUrl}
            alt={`Portrait of ${character.name}`}
            width={256}
            height={256}
            className="aspect-square w-full rounded-md object-cover"
          />
        ) : null}
        {character.portraitState === "FAILED" && character.portraitError ? (
          <p className="text-xs text-destructive">{character.portraitError}</p>
        ) : null}
        <p className="text-sm text-muted-foreground">{character.prompt}</p>
      </CardContent>
    </Card>
  );
}
