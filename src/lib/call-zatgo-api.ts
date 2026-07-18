import { createCallZatGoApi } from "@zatgo/erpnext";
import { erpnextApi } from "@/lib/client";

export const callZatGoApi = createCallZatGoApi(erpnextApi);
