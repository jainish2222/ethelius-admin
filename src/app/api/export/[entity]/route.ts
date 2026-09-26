import { api } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { parseList } from "@/lib/api/list-query";
import { audit } from "@/lib/audit";
import { exportData } from "@/services/export.service";

type P = { entity: string };

/** Exports any list with the same filters it was viewed with. ?format=csv|xlsx|pdf */
export const GET = api<P>({}, async ({ params, query, actor }) => {
  const format = query.format;
  if (format !== "csv" && format !== "xlsx" && format !== "pdf") throw badRequest("Format must be csv, xlsx or pdf.");
  const { format: _f, ...rest } = query;
  const file = await exportData(params.entity, format, parseList(rest), actor);
  await audit(actor, { action: "export.downloaded", entity: "Export", entityId: params.entity, newValue: { format, filters: rest } });
  return new Response(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
