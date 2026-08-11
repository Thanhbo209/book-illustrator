import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { CharacterDTO } from "@/types/domain";

export function CharacterCard({ character }: { character: CharacterDTO }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{character.name}</CardTitle>
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
        <p className="text-sm text-muted-foreground">{character.prompt}</p>
      </CardContent>
    </Card>
  );
}
