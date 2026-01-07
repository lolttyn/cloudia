import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SUPABASE_ANON_KEY ??
  process.env.SUPABASE_KEY;

function missingEnvError() {
  return new Error(
    "Missing Supabase key env var (SUPABASE_SERVICE_ROLE_KEY preferred)"
  );
}

// If env exists, create a real client.
// If env missing, export a proxy that throws ONLY when accessed.
export const supabase =
  supabaseUrl && key
    ? createClient(supabaseUrl, key, {
        auth: {
          persistSession: false,
          autoRefreshToken: false
        }
      })
    : (new Proxy(
        {},
        {
          get() {
            throw missingEnvError();
          },
        }
      ) as any);

