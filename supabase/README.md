# Al Ras Steel CRM Supabase Setup

Run `schema.sql` in the Supabase SQL Editor for project:

`https://xlhgvsxiksuojibiitae.supabase.co`

The CRM server writes through server-side environment keys only. Prefer:

`SUPABASE_SERVICE_ROLE_KEY`

The app also detects `SUPABASE_ANON_KEY`, `SUPABASE_PUBLISHABLE_KEY`, or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, but service-role is the reliable option for server-side CRM persistence.

After running the schema, restart the app and create a lead. The API response should include:

`"supabase": { "persisted": true }`
