From 72319340495e8b8e5efa689a1b3479e36d50e592 Mon Sep 17 00:00:00 2001
From: Claude <noreply@anthropic.com>
Date: Wed, 5 Aug 2026 20:00:48 +0000
Subject: [PATCH] fix: add missing payment-return page under the store route
 middleware actually serves
MIME-Version: 1.0
Content-Type: text/plain; charset=UTF-8
Content-Transfer-Encoding: 8bit

Online payments (SlickPay/Chargily) redirect customers to /paiement/retour
after checkout. On a real store subdomain, middleware.ts rewrites every
request to /store/*, but no page existed at src/app/store/paiement/retour
— only a stale duplicate under the unused src/app/(store)/* route-group
tree, which is never reached by real subdomain/custom-domain traffic. A
customer who just paid online landed on a 404.

Added the missing page to the tree middleware actually rewrites into,
mirroring the (store) version's content/behavior exactly. Verified
end-to-end against a production build (next start): the store-subdomain
flow (?store=slug simulation) now renders the confirmation page instead of
404ing, while requests without store context still correctly go through
the platform auth gate untouched.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01QdfZH7jSVqVVzgdYNHeuA5
---
 src/app/store/paiement/retour/page.tsx | 61 ++++++++++++++++++++++++++
 1 file changed, 61 insertions(+)
 create mode 100644 src/app/store/paiement/retour/page.tsx

diff --git a/src/app/store/paiement/retour/page.tsx b/src/app/store/paiement/retour/page.tsx
new file mode 100644
index 0000000..d792d57
--- /dev/null
+++ b/src/app/store/paiement/retour/page.tsx
@@ -0,0 +1,61 @@
+import { headers } from 'next/headers'
+import { createClient } from '@/lib/supabase/server'
+import Link from 'next/link'
+import { CheckCircle2, XCircle, ArrowLeft } from 'lucide-react'
+
+export default async function PaymentReturnPage({
+  searchParams,
+}: {
+  searchParams: Promise<{ paid?: string; failed?: string; order?: string }>
+}) {
+  const { paid, order } = await searchParams
+  const headersList = await headers()
+  const storeSlug = headersList.get('x-store-slug')
+
+  let storeName = 'la boutique'
+  let storeHref = '/'
+  if (storeSlug) {
+    const supabase = await createClient()
+    const { data: store } = await supabase.from('stores').select('name, slug').eq('slug', storeSlug).maybeSingle()
+    if (store) {
+      storeName = store.name
+      storeHref = `/?store=${store.slug}`
+    }
+  }
+
+  const success = paid === '1'
+
+  return (
+    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#0A0A0F' }}>
+      <div className="w-full max-w-md rounded-2xl p-8 text-center" style={{ background: '#111118', border: '1px solid rgba(255,255,255,0.1)' }}>
+        <div
+          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
+          style={{ background: success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)' }}
+        >
+          {success
+            ? <CheckCircle2 size={32} style={{ color: '#22C55E' }} />
+            : <XCircle size={32} style={{ color: '#EF4444' }} />}
+        </div>
+        <h1 className="text-xl font-bold text-white mb-2">
+          {success ? 'Paiement reçu !' : 'Paiement non confirmé'}
+        </h1>
+        <p className="text-sm mb-1" style={{ color: '#9CA3AF' }}>
+          {success
+            ? `Merci pour votre commande chez ${storeName}. Vous recevrez une confirmation prochainement.`
+            : "Nous n'avons pas pu confirmer votre paiement. Si le montant a été débité, contactez le vendeur avec votre numéro de commande."}
+        </p>
+        {order && (
+          <p className="text-xs font-mono mb-6" dir="ltr" style={{ color: '#6B7280' }}>#{order.slice(0, 8).toUpperCase()}</p>
+        )}
+        <Link
+          href={storeHref}
+          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm mt-4"
+          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
+        >
+          <ArrowLeft size={15} />
+          Retour à la boutique
+        </Link>
+      </div>
+    </div>
+  )
+}
-- 
2.43.0

