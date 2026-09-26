import { api } from "@/lib/api/handler";
import { badRequest } from "@/lib/api/errors";
import { currentMonth, isMonth } from "@/lib/dates";
import { attendanceSchema } from "@/validations/finance";
import { attendanceForMonth, saveAttendance } from "@/services/attendance.service";

export const GET = api({ permission: "attendance.read" }, async ({ query }) => {
  const month = query.month ?? currentMonth();
  if (!isMonth(month)) throw badRequest("Choose a valid month.");
  return attendanceForMonth(month, query.q);
});

export const PUT = api({ permission: "attendance.write" }, async ({ body, actor }) => saveAttendance(await body(attendanceSchema), actor));
