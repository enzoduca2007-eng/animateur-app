import Link from "next/link";

export const metadata = {
  title: "Politique de confidentialité — AnimTaStructure",
};

export default function PolitiqueConfidentialitePage() {
  return (
    <div className="flex flex-1 justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Retour
        </Link>

        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">
          Politique de confidentialité
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Dernière mise à jour : {new Date().toLocaleDateString("fr-FR", {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>

        <div className="mt-8 flex flex-col gap-6 text-sm leading-6 text-zinc-700">
          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              1. Qui sommes-nous
            </h2>
            <p className="mt-2">
              AnimTaStructure est une application de gestion d&apos;équipe et
              de planning destinée aux structures d&apos;accueil de loisirs
              (centres de loisirs, colonies, accueils périscolaires). Elle
              permet aux directeurs, coordinateurs, responsables et
              animateurs d&apos;un établissement de gérer les plannings, les
              activités, les répartitions par groupe et la communication
              interne à l&apos;équipe.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              2. Données que nous collectons
            </h2>
            <p className="mt-2">
              Lors de la création d&apos;un compte et de l&apos;utilisation de
              l&apos;application, nous collectons :
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium">Données de compte</span> : nom
                complet, adresse email, mot de passe (stocké de façon
                chiffrée), rôle au sein de l&apos;établissement (directeur,
                coordinateur, responsable, animateur).
              </li>
              <li>
                <span className="font-medium">Données professionnelles</span>{" "}
                : plannings et horaires de travail, groupes et activités
                encadrés, évaluations de stage (le cas échéant), messages
                échangés au sein de l&apos;équipe.
              </li>
              <li>
                <span className="font-medium">Photos</span> : dans le cadre
                du suivi des goûters, une photo peut être prise ou importée
                depuis la galerie pour être analysée et associée à
                l&apos;établissement.
              </li>
            </ul>
            <p className="mt-2">
              L&apos;application ne collecte <span className="font-medium">
                aucune donnée nominative concernant les enfants accueillis
              </span>
              : ils n&apos;apparaissent que sous forme d&apos;effectifs
              chiffrés par tranche d&apos;âge, jamais par nom.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              3. Pourquoi nous utilisons ces données
            </h2>
            <p className="mt-2">
              Ces données sont utilisées exclusivement pour faire fonctionner
              l&apos;application : authentifier les comptes, afficher les
              plannings et activités de l&apos;établissement concerné,
              permettre la communication entre membres de l&apos;équipe, et
              assurer le suivi administratif (heures, encadrement,
              évaluations). Elles ne sont jamais utilisées à des fins
              publicitaires.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              4. Partage des données
            </h2>
            <p className="mt-2">
              Les données ne sont jamais vendues ni partagées avec des tiers
              à des fins commerciales. Elles sont visibles uniquement par les
              membres de l&apos;équipe de votre établissement, selon leur
              rôle. Elles sont hébergées chez nos prestataires techniques
              (hébergement web et base de données) qui n&apos;y accèdent que
              pour assurer le fonctionnement du service.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              5. Conservation des données
            </h2>
            <p className="mt-2">
              Les données sont conservées tant que le compte ou
              l&apos;établissement reste actif. Un directeur ou un
              gestionnaire peut à tout moment demander la suppression
              d&apos;un compte, ce qui entraîne la suppression des données
              personnelles associées.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              6. Vos droits
            </h2>
            <p className="mt-2">
              Conformément au Règlement Général sur la Protection des
              Données (RGPD), vous disposez d&apos;un droit d&apos;accès, de
              rectification et de suppression de vos données. Pour exercer
              ces droits, contactez l&apos;adresse indiquée ci-dessous.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              7. Contact
            </h2>
            <p className="mt-2">
              Pour toute question concernant cette politique de
              confidentialité ou vos données personnelles, vous pouvez nous
              contacter à l&apos;adresse : enzoduca2007@gmail.com
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
