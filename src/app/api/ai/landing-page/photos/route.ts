import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveActiveStoreServer } from '@/lib/server-store'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateProductShot, generateProductShotFromText } from '@/lib/gemini'
import { PHOTO_SCENES, getPhotoCount, buildScenePrompt, buildTextScenePrompt } from '@/lib/landing-photos'
import type { Plan } from '@/types/database'

export async function POST(req: NextRequest) {
  try {
    const { landingPageId, sceneIndex } = await req.json() as {
      landingPageId?: string
      sceneIndex?: number
    }

    if (!landingPageId || typeof sceneIndex !== 'number') {
      return NextResponse.json({ error: 'landingPageId et sceneIndex requis' }, { status: 400 })
    }

    // Auth — session-bound client, not the admin client, for the ownership check
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

    const store = await resolveActiveStoreServer(supabase, user.id, 'id, plan, owner_id')
    if (!store) return NextResponse.json({ error: 'Boutique introuvable' }, { status: 404 })

    const { data: landingPage } = await supabase
      .from('landing_pages')
      .select('id, slug, content, generated_images')
      .eq('id', landingPageId)
      .eq('store_id', store.id)
      .single()
    if (!landingPage) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })

    const maxPhotos = getPhotoCount(store.plan as Plan)
    if (
      !Number.isInteger(sceneIndex) ||
      sceneIndex < 0 ||
      sceneIndex >= maxPhotos ||
      sceneIndex >= PHOTO_SCENES.length
    ) {
      return NextResponse.json({ error: 'Index de scène invalide pour ce plan' }, { status: 400 })
    }

    const sourceImageUrl = landingPage.content?._meta?.imageUrl
    const productName = landingPage.content?._meta?.productName ?? 'Produit'
    const productDescription = landingPage.content?._meta?.description ?? null
    const scene = PHOTO_SCENES[sceneIndex]

    // Upload client used both for the SSRF-guard prefix probe below and for
    // storing the generated shot further down.
    const admin = createAdminClient()

    let shot
    try {
      if (sourceImageUrl) {
        // SSRF guard: imageUrl ultimately originates from client input upstream (Phase 1
        // route). Only allow fetching images that live in our own Supabase Storage bucket —
        // never an arbitrary attacker-supplied host.
        //
        // Derive the allowed prefix from the Storage SDK itself (same call used to mint
        // the URLs in the first place) rather than rebuilding it from
        // NEXT_PUBLIC_SUPABASE_URL by hand. Next.js inlines NEXT_PUBLIC_* vars at BUILD
        // time everywhere (including server code), so a manually-concatenated prefix goes
        // stale if the env var ever changes without a fresh build — silently rejecting
        // every valid image with "Image source invalide" even though the stored URL is
        // completely correct. Probing the SDK avoids that class of bug entirely.
        const probe = '__ssrf_probe__'
        const probeUrl = admin.storage.from('product-images').getPublicUrl(probe).data.publicUrl
        const allowedImagePrefix = probeUrl.slice(0, probeUrl.length - probe.length)
        if (!sourceImageUrl.startsWith(allowedImagePrefix)) {
          return NextResponse.json({ error: 'Image source invalide' }, { status: 400 })
        }

        const imgRes = await fetch(sourceImageUrl)
        if (!imgRes.ok) {
          return NextResponse.json({ error: 'Image source inaccessible' }, { status: 400 })
        }
        const contentType = (imgRes.headers.get('content-type') ?? 'image/jpeg').split(';')[0].trim()
        const buffer = await imgRes.arrayBuffer()
        const productImageBase64 = Buffer.from(buffer).toString('base64')

        const scenePrompt = buildScenePrompt(scene, productName)
        shot = await generateProductShot({
          productImageBase64,
          productImageMimeType: contentType,
          productName,
          scenePrompt,
        })
      } else {
        // No source photo (optional field, skipped by merchant) — fall back to
        // generating a plausible product photo from name/description alone so
        // every plan still gets its full photo count, matching the "l'IA génère
        // tout" promise on the generator page.
        const scenePrompt = buildTextScenePrompt(scene, productName, productDescription)
        shot = await generateProductShotFromText({ productName, productDescription, scenePrompt })
      }
    } catch (genError) {
      console.error('[landing-page-photos]', genError)
      const raw = genError instanceof Error ? genError.message : ''
      // Map the verbose Gemini SDK error to a short, actionable French message.
      if (/\b429\b|quota|too many requests|rate.?limit/i.test(raw)) {
        return NextResponse.json(
          { error: 'Quota Google épuisé pour la génération d\'images. Activez la facturation sur votre compte Google AI Studio pour générer des photos.' },
          { status: 429 },
        )
      }
      if (/\b(401|403)\b|api key|permission|unauthenticated|invalid.*key/i.test(raw)) {
        return NextResponse.json(
          { error: 'Clé API Google invalide ou non autorisée pour la génération d\'images.' },
          { status: 502 },
        )
      }
      return NextResponse.json({ error: 'Échec de la génération de la photo. Réessayez.' }, { status: 502 })
    }

    // admin client declared earlier (also used for the SSRF probe above)
    const ext = shot.mimeType.includes('jpeg') ? 'jpg' : 'png'
    const path = `${store.id}/landing-photos/${landingPage.slug}/${sceneIndex}.${ext}`
    const imageBuffer = Buffer.from(shot.imageBase64, 'base64')

    const { error: uploadError } = await admin.storage
      .from('product-images')
      .upload(path, imageBuffer, { contentType: shot.mimeType, upsert: true })

    if (uploadError) {
      console.error('[landing-page-photos]', uploadError)
      return NextResponse.json({ error: 'Erreur de stockage de l\'image' }, { status: 500 })
    }

    const { data: { publicUrl } } = admin.storage.from('product-images').getPublicUrl(path)

    // Append to generated_images at the correct slot. This read-then-write is safe ONLY
    // because the calling client awaits each scene sequentially before issuing the next
    // one (no concurrent writers). If that contract ever changes, add real concurrency
    // protection (e.g. optimistic locking like the credit deduction in the sibling
    // Phase 1 route uses) rather than relying on this read-then-write.
    const current = [...(landingPage.generated_images ?? [])]
    current[sceneIndex] = publicUrl
    const { error: updateError } = await admin
      .from('landing_pages')
      .update({ generated_images: current })
      .eq('id', landingPageId)

    if (updateError) {
      console.error('[landing-page-photos]', updateError)
      return NextResponse.json({ error: "Erreur lors de l'enregistrement de la photo" }, { status: 500 })
    }

    return NextResponse.json({ imageUrl: publicUrl, sceneIndex })
  } catch (error) {
    console.error('[landing-page-photos]', error)
    return NextResponse.json({ error: 'Erreur interne du serveur' }, { status: 500 })
  }
}
