import { z } from "zod";
import { api } from "@/lib/api/handler";
import { monthStr } from "@/validations/common";
import { prefillAttendance } from "@/services/attendance.service";

export const POST = api({ permission: "attendance.write" }, async ({ body, actor }) => {
  const { month } = await body(z.object({ month: monthStr }));
  return prefillAttendance(month, actor);
});
