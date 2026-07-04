import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * POST /api/wecan/send-order
 *
 * Reads the WECAN API token from store_settings (Supabase) then proxies the
 * order to WecanServices. The token is NEVER sent to the browser.
 */

// Server-side Supabase client (uses service role to bypass RLS for settings read)
function serverSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Use service role key if available, otherwise fall back to anon key
  // For reading store_settings as admin, anon key is fine IF you allow authenticated reads
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

async function getWecanCredentials() {
  const supabase = serverSupabase();
  const [{ data: tokenRow }, { data: storeRow }] = await Promise.all([
    supabase.from("store_settings").select("value").eq("id", "wecan_api_token").single(),
    supabase.from("store_settings").select("value").eq("id", "wecan_store_id").single(),
  ]);
  return {
    token:   tokenRow?.value ?? "",
    storeId: storeRow?.value ?? "",
  };
}

export async function POST(req: NextRequest) {
  // 1. Load credentials from DB
  let token = "";
  let storeId = "";
  try {
    const creds = await getWecanCredentials();
    token   = creds.token;
    storeId = creds.storeId;
  } catch (err) {
    console.error("[WECAN] Failed to load credentials from DB:", err);
    return NextResponse.json(
      { error: "Impossible de lire les identifiants WECAN depuis la base de données." },
      { status: 500 }
    );
  }

  if (!token) {
    return NextResponse.json(
      {
        error:
          "Token WECAN non configuré. Allez dans Admin → Paramètres → WECAN Livraison pour l'ajouter.",
      },
      { status: 503 }
    );
  }

  // 2. Parse request body
  let body: { order: any };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide" }, { status: 400 });
  }

  const { order } = body;
  if (!order) {
    return NextResponse.json({ error: "Commande manquante" }, { status: 400 });
  }

  // 3. Build WecanServices payload
  //    ⚠️ Adjust field names to match WecanServices' exact API schema
  //       (visible in your WecanServices dashboard → Developer → API Reference)
  const wecanPayload = {
    store_id:    storeId || undefined,
    reference:   order.id,
    customer: {
      first_name: order.customer_prenom,
      last_name:  order.customer_nom,
      phone:      order.customer_phone,
      wilaya:     order.customer_wilaya,
      commune:    order.customer_commune,
    },
    product: {
      name:     order.product_name,
      color:    order.selected_color,
      quantity: order.quantity,
    },
    total_price:  order.total_price,
    delivery_fee: order.delivery_fee,
    note: `Le Mirage — ${new Date(order.created_at).toLocaleDateString("fr-DZ")}`,
  };

  // 4. Call WecanServices API
  try {
    const wecanRes = await fetch("https://api.wecanservices.com/api/orders", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
        "Accept":        "application/json",
      },
      body: JSON.stringify(wecanPayload),
    });

    const data = await wecanRes.json().catch(() => ({}));

    if (!wecanRes.ok) {
      console.error("[WECAN] Error:", wecanRes.status, data);
      return NextResponse.json(
        { error: data?.message ?? `Erreur WECAN ${wecanRes.status}`, details: data },
        { status: wecanRes.status }
      );
    }

    return NextResponse.json({
      success:  true,
      wecan_id: data?.id ?? data?.order_id ?? null,
      tracking: data?.tracking_number ?? null,
      message:  "Commande envoyée à WECAN avec succès",
    });
  } catch (err: any) {
    console.error("[WECAN] Network error:", err);
    return NextResponse.json(
      { error: "Impossible de joindre WECAN. Vérifiez votre connexion." },
      { status: 502 }
    );
  }
}
