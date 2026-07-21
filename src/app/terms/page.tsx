import type { Metadata } from 'next'
import Link from 'next/link'
import KrenixLogo from '@/components/ui/KrenixLogo'

export const metadata: Metadata = {
  title: "Conditions d'utilisation — Krenix",
  description: "Les conditions d'utilisation de la plateforme Krenix.",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-dash-page dash-font-sans">
      <header className="flex items-center justify-between px-6 py-5 border-b border-dash-border max-w-3xl mx-auto">
        <Link href="/" className="flex items-center gap-2">
          <KrenixLogo height={32} compact />
          <span className="dash-font-heading text-lg font-medium text-dash-ink">Krenix</span>
        </Link>
        <Link href="/" className="text-sm text-dash-accent hover:text-dash-accent-dark">Retour à l'accueil</Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12 text-dash-ink-soft text-sm leading-relaxed space-y-8">
        <div>
          <h1 className="dash-font-heading text-3xl font-medium text-dash-ink mb-2">Conditions d'utilisation</h1>
          <p className="text-dash-ink-faint text-xs">Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <p>
          En créant un compte ou une boutique sur Krenix, vous acceptez les conditions ci-dessous. Merci de les
          lire avant d'utiliser la plateforme.
        </p>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">1. Le service</h2>
          <p>
            Krenix est une plateforme permettant de créer une boutique en ligne, générer des landing pages
            assistées par IA, et gérer des commandes. Chaque compte marchand ("vous") est responsable du contenu
            qu'il publie (produits, textes, images) et des commandes qu'il traite avec ses clients.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">2. Comptes et sécurité</h2>
          <p>
            Vous êtes responsable de la confidentialité de vos identifiants de connexion et de toute activité
            effectuée depuis votre compte. Contactez-nous immédiatement en cas d'accès non autorisé suspecté.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">3. Abonnements et paiements</h2>
          <p>
            Les plans payants sont facturés selon les tarifs affichés sur notre page de tarification. Les
            abonnements mensuels peuvent être annulés à tout moment depuis le tableau de bord — l'accès reste
            actif jusqu'à la fin de la période déjà payée, sans renouvellement automatique après annulation.
            Le plan Basic est un paiement unique non remboursable donnant accès à un nombre fixe de crédits IA.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">4. Utilisation acceptable</h2>
          <p>
            Vous vous engagez à ne pas utiliser Krenix pour vendre des produits illégaux, frauduleux ou
            trompeurs, ni pour envoyer des messages non sollicités via les canaux Messenger/Instagram connectés.
            Nous nous réservons le droit de suspendre tout compte enfreignant ces conditions.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">5. Contenu généré par IA</h2>
          <p>
            Les landing pages et réponses de chatbot générées par Krenix utilisent des modèles d'intelligence
            artificielle tiers. Vous êtes responsable de vérifier l'exactitude du contenu généré avant publication.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">6. Limitation de responsabilité</h2>
          <p>
            Krenix est fourni "en l'état". Nous ne garantissons pas une disponibilité ininterrompue du service et
            ne sommes pas responsables des litiges entre un marchand et ses propres clients.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">7. Modifications</h2>
          <p>
            Nous pouvons modifier ces conditions à tout moment. Les changements importants seront communiqués
            via l'e-mail associé à votre compte.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">8. Contact</h2>
          <p>
            Pour toute question : <a href="mailto:contact@krenix.store" className="text-dash-accent hover:text-dash-accent-dark">contact@krenix.store</a>
          </p>
        </section>

        <p className="text-dash-ink-faint text-xs pt-4 border-t border-dash-border">
          Voir aussi notre <Link href="/privacy" className="text-dash-accent hover:text-dash-accent-dark">politique de confidentialité</Link>.
        </p>
      </main>
    </div>
  )
}
