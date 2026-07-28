import { config } from "dotenv";
config({ path: ".env.local" });
import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, product_name, manufacturer, material_type, status, pdf_blob_url, pdf_filename FROM mixtures ORDER BY uploaded_at DESC LIMIT 5`;
console.log(rows);
for (const r of rows) {
  const ings = await sql`SELECT ingredient_name, cas_no, content_percent_raw FROM mixture_ingredients WHERE mixture_id = ${r.id}`;
  console.log(`--- ${r.product_name} ingredients (${ings.length}) ---`, ings);
}
