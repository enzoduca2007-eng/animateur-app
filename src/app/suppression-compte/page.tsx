import Link from "next/link";

export const metadata = {
  title: "Suppression de compte — AnimTaStructure",
};

export default function SuppressionComptePage() {
  return (
    <div className="flex flex-1 justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Retour
        </Link>

        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">
          Suppression de compte
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Comment demander la suppression de votre compte et de vos données.
        </p>

        <div className="mt-8 flex flex-col gap-6 text-sm leading-6 text-zinc-700">
          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              Comment demander la suppression
            </h2>
            <p className="mt-2">
              Deux façons de demander la suppression de votre compte
              AnimTaStructure :
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Demandez au directeur de votre établissement de supprimer
                votre compte depuis son espace Équipe.
              </li>
              <li>
                Envoyez une demande par email à{" "}
                <a
                  href="mailto:enzoduca2007@gmail.com"
                  className="font-medium text-zinc-900 underline underline-offset-2"
                >
                  enzoduca2007@gmail.com
                </a>{" "}
                en précisant l&apos;adresse email de votre compte. La
                suppression est effectuée sous 7 jours.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              Données supprimées
            </h2>
            <p className="mt-2">
              La suppression du compte entraîne la suppression définitive de
              vos données personnelles : nom, email, mot de passe. Les
              données professionnelles auxquelles vous étiez associé
              (plannings passés, messages) peuvent être conservées de façon
              anonymisée pour l&apos;historique de l&apos;établissement.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              Plus d&apos;informations
            </h2>
            <p className="mt-2">
              Voir notre{" "}
              <Link
                href="/politique-de-confidentialite"
                className="font-medium text-zinc-900 underline underline-offset-2"
              >
                politique de confidentialité
              </Link>{" "}
              pour le détail des données collectées et vos droits.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
