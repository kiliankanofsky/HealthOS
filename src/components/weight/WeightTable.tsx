import { removeWeightEntry } from "@/app/weight/actions";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WeightEntry } from "@/lib/db/schema";

type Props = {
  entries: WeightEntry[];
};

export function WeightTable({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">Noch keine Einträge vorhanden.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Datum</TableHead>
          <TableHead>Gewicht</TableHead>
          <TableHead>Quelle</TableHead>
          <TableHead>Notiz</TableHead>
          <TableHead className="text-right">Aktion</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell className="font-medium">{entry.date}</TableCell>
            <TableCell>{entry.weightKg.toFixed(1)} kg</TableCell>
            <TableCell className="text-muted-foreground">{entry.source}</TableCell>
            <TableCell className="text-muted-foreground">
              {entry.notes ?? "–"}
            </TableCell>
            <TableCell className="text-right">
              <form action={removeWeightEntry}>
                <input type="hidden" name="id" value={entry.id} />
                <Button type="submit" variant="ghost" size="sm">
                  Löschen
                </Button>
              </form>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
