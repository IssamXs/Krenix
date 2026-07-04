import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Use globalThis to ensure a single shared instance across all module
// evaluations (Next.js / Turbopack can load the same module multiple times).
declare global {
  // eslint-disable-next-line no-var
  var __supabase: SupabaseClient | undefined;
}

// A recursive proxy that never throws on any access or invocation,
// and resolves thenables/promises safely with default mock structures.
function createDummyClient(): SupabaseClient {
  const dummy = () => {};
  
  const properties: Record<string, any> = {
    data: {
      user: null,
      session: null,
      subscription: { unsubscribe: () => {} }
    },
    error: { message: "Supabase is not configured. Missing URL or Anon Key." },
    user: null,
    session: null,
  };

  const handler: ProxyHandler<any> = {
    get(target, prop) {
      if (prop === "then") {
        return (resolve: any) => resolve({
          data: properties.data,
          error: properties.error
        });
      }
      if (typeof prop === "string" && prop in properties) {
        return properties[prop];
      }
      // Return a recursive proxy to allow infinite chaining like supabase.from().select().order()
      return new Proxy(() => {}, handler);
    },
    apply() {
      // Allow functions to be called, returning a proxy that also has properties
      const executed = () => {};
      Object.assign(executed, properties);
      return new Proxy(executed, handler);
    }
  };

  Object.assign(dummy, properties);
  return new Proxy(dummy, handler) as unknown as SupabaseClient;
}

function getClient(): SupabaseClient {
  if (globalThis.__supabase) return globalThis.__supabase;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.warn(
      "⚠️ Supabase URL or Anon Key is missing. Falling back to robust mock client to prevent server/client crashes."
    );
    return createDummyClient();
  }

  try {
    globalThis.__supabase = createClient(url, key);
    return globalThis.__supabase;
  } catch (error) {
    console.error("Error creating Supabase client, falling back to mock:", error);
    return createDummyClient();
  }
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    const client = getClient();
    const value = (client as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === "function" ? value.bind(client) : value;
  },
});

