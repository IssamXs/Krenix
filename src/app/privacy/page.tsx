import type { Metadata } from 'next'
import Link from 'next/link'
import KrenixLogo from '@/components/ui/KrenixLogo'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — Krenix',
  description: "Comment Krenix collecte, utilise et protège les données de ses utilisateurs.",
}

export default function PrivacyPage() {
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
          <h1 className="dash-font-heading text-3xl font-medium text-dash-ink mb-2">Politique de confidentialité</h1>
          <p className="text-dash-ink-faint text-xs">Dernière mise à jour : {new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <p>
          Krenix ("nous", "notre") est une plateforme SaaS permettant aux e-commerçants et dropshippers
          algériens de créer et gérer leur boutique en ligne. Cette politique explique quelles données
          nous collectons, pourquoi, et comment elles sont protégées.
        </p>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">1. Données que nous collectons</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-dash-ink">Compte marchand :</strong> nom, e-mail, mot de passe (chiffré), et optionnellement un numéro de téléphone.</li>
            <li><strong className="text-dash-ink">Données de la boutique :</strong> nom de boutique, produits, prix, images, thème choisi.</li>
            <li><strong className="text-dash-ink">Commandes clients :</strong> nom, téléphone, wilaya, commune et adresse fournis par les clients finaux lors d'une commande.</li>
            <li><strong className="text-dash-ink">Paiements :</strong> preuves de virement/BaridiMob téléversées manuellement, ou données de transaction transmises par notre prestataire de paiement en ligne (SlickPay) — nous ne stockons jamais de numéro de carte bancaire.</li>
            <li><strong className="text-dash-ink">Messagerie :</strong> si vous connectez Facebook Messenger ou Instagram, le contenu des messages échangés avec vos clients est traité pour générer les réponses automatiques du chatbot.</li>
            <li><strong className="text-dash-ink">Données techniques :</strong> adresse IP, type d'appareil et pages visitées, à des fins de sécurité et d'analyse d'audience.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">2. Comment nous utilisons ces données</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Fournir et faire fonctionner votre boutique en ligne et le tableau de bord marchand.</li>
            <li>Générer des landing pages et réponses de chatbot via des modèles d'intelligence artificielle tiers (Anthropic Claude et Google Gemini) — le texte que vous fournissez (description produit, messages clients) leur est transmis pour traitement, sans être utilisé par Krenix à d'autres fins.</li>
            <li>Traiter les commandes et faciliter la livraison (y compris via des intégrations transporteur comme Yalidine, si vous les activez avec vos propres identifiants).</li>
            <li>Confirmer les paiements d'abonnement et gérer la facturation.</li>
            <li>Vous envoyer des notifications liées à votre compte (confirmation de paiement, activation de boutique).</li>
            <li>Détecter et prévenir les fraudes ou abus de la plateforme.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">3. Partage des données</h2>
          <p>
            Nous ne vendons aucune donnée personnelle. Certaines données sont transmises à des prestataires
            tiers strictement nécessaires au fonctionnement du service : Supabase (hébergement base de données),
            Vercel (hébergement applicatif), Anthropic et Google (génération IA), Meta (Messenger/Instagram, si
            activé), et SlickPay (paiements en ligne, si activé). Chacun traite les données selon ses propres
            engagements de confidentialité.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">4. Conservation et suppression des données</h2>
          <p>
            Les données sont conservées tant que votre compte est actif. Vous pouvez demander la suppression de
            votre compte et des données associées à tout moment en nous contactant (coordonnées ci-dessous) ou,
            pour les utilisateurs Facebook/Instagram connectés, via les paramètres de votre compte Meta.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">5. Sécurité</h2>
          <p>
            Les mots de passe sont chiffrés, l'accès aux données est protégé par des règles de sécurité au niveau
            des lignes (Row Level Security), et les connexions au site sont chiffrées via HTTPS.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">6. Vos droits</h2>
          <p>
            Vous pouvez à tout moment demander l'accès, la correction ou la suppression de vos données
            personnelles en nous contactant à l'adresse ci-dessous.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="dash-font-heading text-xl font-medium text-dash-ink">7. Contact</h2>
          <p>
            Pour toute question concernant cette politique ou vos données personnelles, contactez-nous à :{' '}
            <a href="mailto:contact@krenix.store" className="text-dash-accent hover:text-dash-accent-dark">contact@krenix.store</a>
          </p>
        </section>
      </main>
    </div>
  )
}
