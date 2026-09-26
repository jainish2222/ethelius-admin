import { api } from "@/lib/api/handler";
import { globalSearch } from "@/services/search.service";

export const GET = api({}, async ({ query, actor }) => globalSearch(String(query.q ?? "").slice(0, 100), actor));
