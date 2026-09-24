import Link from "next/link";

export const metadata = {
  title: "Support — AnimTaStructure",
};

export default function SupportPage() {
  return (
    <div className="flex flex-1 justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-900">
          ← Retour
        </Link>

        <h1 className="mt-4 text-2xl font-semibold text-zinc-900">
          Support
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Besoin d&apos;aide avec AnimTaStructure ? Nous sommes là.
        </p>

        <div className="mt-8 flex flex-col gap-6 text-sm leading-6 text-zinc-700">
          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              Nous contacter
            </h2>
            <p className="mt-2">
              Pour toute question, problème technique, ou demande
              d&apos;assistance concernant l&apos;application, écrivez-nous à
              l&apos;adresse :{" "}
              <a
                href="mailto:enzoduca2007@gmail.com"
                className="font-medium text-zinc-900 underline underline-offset-2"
              >
                enzoduca2007@gmail.com
              </a>
              . Nous répondons généralement sous 48 heures.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              Problèmes fréquents
            </h2>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                <span className="font-medium">Connexion impossible</span> :
                vérifiez votre email et votre mot de passe, ou contactez le
                directeur de votre établissement pour vérifier que votre
                compte est bien actif.
              </li>
              <li>
                <span className="font-medium">Accès manquant</span> à une
                page ou une fonctionnalité : cela dépend de votre rôle
                (directeur, coordinateur, responsable, animateur) — contactez
                votre directeur pour un ajustement.
              </li>
              <li>
                <span className="font-medium">Donnée incorrecte ou bug</span>{" "}
                : décrivez-nous le problème par email, avec si possible une
                capture d&apos;écran.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-zinc-900">
              Vos données
            </h2>
            <p className="mt-2">
              Pour toute question sur vos données personnelles, consultez
              notre{" "}
              <Link
                href="/politique-de-confidentialite"
                className="font-medium text-zinc-900 underline underline-offset-2"
              >
                politique de confidentialité
              </Link>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
