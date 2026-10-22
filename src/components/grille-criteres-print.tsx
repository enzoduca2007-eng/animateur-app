import {
  CRITERES_STAGIAIRE,
  NIVEAU_CRITERE_ABBREV,
  NIVEAU_CRITERE_LABELS,
  type NiveauCritere,
} from "@/lib/types";

export const NIVEAUX: NiveauCritere[] = ["a_travailler", "en_cours", "acquis", "depasse"];

// Niveau de concordance auto-évaluation / évaluation : se déduit
// automatiquement (pas de saisie) du nombre de critères où le
// stagiaire et la direction ont choisi le même niveau, parmi les
// critères que les deux ont notés — plus il y a d'accord, plus le
// stagiaire se connaît bien lui-même.
export function concordance(
  criteresDirection: Partial<Record<string, NiveauCritere>> | null | undefined,
  criteresStagiaire: Partial<Record<string, NiveauCritere>> | null | undefined
): { matches: number; total: number; niveau: NiveauCritere | null } {
  let matches = 0;
  let total = 0;
  for (const cat of CRITERES_STAGIAIRE) {
    for (const c of cat.criteres) {
      const dir = criteresDirection?.[c.cle];
      const stag = criteresStagiaire?.[c.cle];
      if (!dir || !stag) continue;
      total += 1;
      if (dir === stag) matches += 1;
    }
  }
  if (total === 0) return { matches, total, niveau: null };
  const ratio = matches / total;
  const niveau: NiveauCritere =
    ratio >= 0.9 ? "depasse" : ratio >= 0.6 ? "acquis" : ratio >= 0.34 ? "en_cours" : "a_travailler";
  return { matches, total, niveau };
}

// Marque d'un critère : X orange (direction) et/ou X bleu (stagiaire).
// Quand les deux ont choisi le même niveau, la croix est entourée d'un
// anneau bleu — les deux couleurs indiquent l'accord en un coup d'œil,
// sans dupliquer la case.
function MarqueNiveau({
  dir,
  stag,
  niveau,
}: {
  dir?: NiveauCritere;
  stag?: NiveauCritere;
  niveau: NiveauCritere;
}) {
  const dirMatch = dir === niveau;
  const stagMatch = stag === niveau;
  if (dirMatch && stagMatch) {
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-sky-500 bg-orange-200 text-[10px] font-bold leading-none text-orange-800">
        X
      </span>
    );
  }
  if (dirMatch) {
    return <span className="text-xs font-bold text-orange-700">X</span>;
  }
  if (stagMatch) {
    return <span className="text-xs font-bold text-sky-700">X</span>;
  }
  return null;
}

function Colonnes() {
  return (
    <colgroup>
      <col className="w-[45%]" />
      {NIVEAUX.map((n) => (
        <col key={n} className="w-[8%]" />
      ))}
      <col className="w-[23%]" />
    </colgroup>
  );
}

// Grille imprimable fusionnant l'évaluation de la direction et
// l'auto-évaluation du stagiaire dans la même case (voir MarqueNiveau).
//
// Un bloc insécable par catégorie (break-inside: avoid) : quand la fiche
// déborde sur une 2e page, la coupure tombe entre deux catégories, jamais
// au milieu — chaque bloc est un tableau fermé (bordure tout autour). Le
// bandeau gris de chaque catégorie porte les en-têtes AT/ECA/A/D et
// Appréciation, lisibles sur n'importe quelle page. Pas de trait entre les
// critères d'une même catégorie, seulement les colonnes ; la case
// Appréciation est fusionnée sur toute la catégorie. Colonne Critère à
// 45% : les libellés longs tiennent sur moins de lignes.
export function GrilleCriteresPrint({
  criteresDirection,
  criteresStagiaire,
  appreciations,
}: {
  criteresDirection: Partial<Record<string, NiveauCritere>> | null;
  criteresStagiaire?: Partial<Record<string, NiveauCritere>> | null;
  appreciations?: Partial<Record<string, string>> | null;
}) {
  const { matches, total, niveau } = concordance(criteresDirection, criteresStagiaire);

  return (
    <>
      <p className="mt-3 text-xs text-zinc-500">
        {NIVEAUX.map((n) => `${NIVEAU_CRITERE_ABBREV[n]} = ${NIVEAU_CRITERE_LABELS[n]}`).join(
          " · "
        )}
        {" — "}
        <span className="font-bold text-orange-700">X orange</span> = Direction ·{" "}
        <span className="font-bold text-sky-700">X bleu</span> = Stagiaire · anneau bleu = même
        avis
      </p>

      <div className="mt-2">
        {CRITERES_STAGIAIRE.map((cat, iCat) => (
          <div key={cat.cle} className={`break-inside-avoid ${iCat === 0 ? "" : "-mt-px"}`}>
            <table className="w-full table-fixed border-collapse text-left text-[11px] leading-tight">
              <Colonnes />
              <tbody>
                <tr className="bg-zinc-200">
                  <td className="border border-black px-2 py-1 font-semibold">{cat.categorie}</td>
                  {NIVEAUX.map((n) => (
                    <td
                      key={n}
                      className="border border-black px-1 py-1 text-center font-semibold"
                    >
                      {NIVEAU_CRITERE_ABBREV[n]}
                    </td>
                  ))}
                  <td className="border border-black px-2 py-1 font-semibold">Appréciation</td>
                </tr>
                {cat.criteres.map((c, idx) => {
                  const bas = idx === cat.criteres.length - 1 ? "border-b" : "";
                  return (
                    <tr key={c.cle}>
                      <td className={`border-x border-black px-2 py-1.5 ${bas}`}>{c.label}</td>
                      {NIVEAUX.map((n) => (
                        <td
                          key={n}
                          className={`border-x border-black px-1 py-1.5 text-center ${bas}`}
                        >
                          <MarqueNiveau
                            dir={criteresDirection?.[c.cle]}
                            stag={criteresStagiaire?.[c.cle]}
                            niveau={n}
                          />
                        </td>
                      ))}
                      {idx === 0 && (
                        <td
                          rowSpan={cat.criteres.length}
                          className="border-x border-b border-black px-2 py-1.5 align-top whitespace-pre-wrap text-zinc-700"
                        >
                          {appreciations?.[cat.cle] ?? ""}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}

        <div className="-mt-px break-inside-avoid">
          <table className="w-full table-fixed border-collapse text-left text-[11px] leading-tight">
            <Colonnes />
            <tbody>
              <tr className="bg-zinc-200">
                <td className="border border-black px-2 py-1.5 font-semibold">
                  Niveau d&apos;acquisition global
                  <span className="block text-[10px] font-normal text-zinc-600">
                    déduit de la concordance auto-évaluation / direction
                    {total > 0 ? ` — ${matches}/${total} critères` : ""}
                  </span>
                </td>
                {NIVEAUX.map((n) => (
                  <td key={n} className="border border-black px-1 py-1.5 text-center">
                    {niveau === n ? (
                      <span className="text-sm font-bold text-zinc-900">X</span>
                    ) : null}
                  </td>
                ))}
                <td className="border border-black px-2 py-1.5" />
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
