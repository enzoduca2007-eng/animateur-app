import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MODELE = "gemini-3.6-flash";

// Le modèle Gemini renvoie parfois une erreur transitoire (surcharge, limite
// de débit) ou une réponse mal formée (JSON tronqué/invalide) de façon
// aléatoire : on réessaie automatiquement avant d'abandonner.
const DELAIS_RETRY_MS = [3000, 6000, 10000];

function attendre(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ErreurReessayable extends Error {}

// Le modèle enveloppe parfois le JSON dans des ```json ... ``` malgré la
// consigne stricte : on l'extrait avant de parser.
function extraireJson(texte: string) {
  const nettoye = texte
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return JSON.parse(nettoye);
  } catch {
    const match = nettoye.match(/\{[\s\S]*\}/);
    if (!match) throw new ErreurReessayable("Réponse IA non-JSON.");
    return JSON.parse(match[0]);
  }
}

async function tenterAnalyse(url: string, body: string) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });

  if (!res.ok) {
    const detail = await res.text();
    if (res.status === 503 || res.status === 429) {
      throw new ErreurReessayable(
        "Le modèle IA est temporairement surchargé, réessaie dans quelques instants."
      );
    }
    throw new Error(`Erreur Gemini (${res.status}) : ${detail.slice(0, 300)}`);
  }

  const geminiJson = await res.json();
  const candidat = geminiJson?.candidates?.[0];
  const texte = candidat?.content?.parts?.[0]?.text;

  if (!texte) {
    // Réponse vide (filtre de sécurité, coupure) : quasi toujours transitoire.
    throw new ErreurReessayable(
      `Réponse IA vide ou inattendue${candidat?.finishReason ? ` (${candidat.finishReason})` : ""}.`
    );
  }

  try {
    return extraireJson(texte);
  } catch {
    throw new ErreurReessayable("Réponse IA mal formée (JSON invalide).");
  }
}

async function appellerGeminiAvecRetry(url: string, body: string) {
  for (let tentative = 0; ; tentative++) {
    try {
      return await tenterAnalyse(url, body);
    } catch (err) {
      const reessayable = err instanceof ErreurReessayable;
      if (!reessayable || tentative === DELAIS_RETRY_MS.length) throw err;
      await attendre(DELAIS_RETRY_MS[tentative]);
    }
  }
}

const PROMPT = `Tu regardes la photo de l'emballage d'un produit alimentaire (goûter de centre de loisirs). Extrait UNIQUEMENT les informations suivantes, telles qu'elles apparaissent sur l'emballage :
- type_produit : la catégorie courte du produit (ex: "Biscuits", "Compote", "Jus de fruit", "Pain", "Fruit", "Gâteau", "Autre")
- marque : le nom de la marque telle qu'écrite sur l'emballage
- nom_produit : le nom exact du produit
- numero_lot : le numéro de lot (souvent précédé de "Lot", "L", ou un code court)
- date_peremption : la date de péremption / DLC / DLUO, au format AAAA-MM-JJ (déduis l'année si seul le jour/mois est visible, en supposant l'année la plus proche dans le futur)
- quantite : le poids ou la quantité (ex: "125g", "6x20cl")

Réponds STRICTEMENT en JSON, sans aucun texte autour, avec exactement ces clés. Mets null pour une valeur que tu ne trouves pas ou dont tu n'es pas sûr :
{"type_produit": string|null, "marque": string|null, "nom_produit": string|null, "numero_lot": string|null, "date_peremption": string|null, "quantite": string|null}`;

export async function POST(request: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY n'est pas configurée sur le serveur." },
      { status: 500 }
    );
  }

  const { gouterId } = await request.json();
  if (!gouterId) {
    return NextResponse.json({ error: "gouterId manquant." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: gouter, error: erreurLecture } = await supabase
    .from("gouters")
    .select("*")
    .eq("id", gouterId)
    .maybeSingle();

  if (erreurLecture || !gouter) {
    return NextResponse.json(
      { error: erreurLecture?.message ?? "Fiche goûter introuvable." },
      { status: 404 }
    );
  }

  if (!gouter.photo_url) {
    return NextResponse.json({ error: "Aucune photo à analyser." }, { status: 400 });
  }

  try {
    const photoRes = await fetch(gouter.photo_url);
    if (!photoRes.ok) throw new Error("Impossible de récupérer la photo.");
    const contentType = photoRes.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await photoRes.arrayBuffer());
    const base64 = buffer.toString("base64");

    const extrait = (await appellerGeminiAvecRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent?key=${apiKey}`,
      JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: contentType, data: base64 } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json", temperature: 0 },
      })
    )) as {
      type_produit: string | null;
      marque: string | null;
      nom_produit: string | null;
      numero_lot: string | null;
      date_peremption: string | null;
      quantite: string | null;
    };

    // type_produit/marque ne sont écrasés par l'IA que s'ils n'ont pas déjà
    // été renseignés (saisie manuelle du directeur/coordinateur, ou analyse
    // précédente) — une nouvelle photo ne doit pas effacer une correction.
    const misAJour: Record<string, unknown> = {
      nom_produit: extrait.nom_produit ?? null,
      numero_lot: extrait.numero_lot ?? null,
      date_peremption: extrait.date_peremption || null,
      quantite: extrait.quantite ?? null,
      statut_ia: "traite",
      erreur_ia: null,
    };
    if (!gouter.type_produit) misAJour.type_produit = extrait.type_produit ?? null;
    if (!gouter.marque) misAJour.marque = extrait.marque ?? null;

    const { data: mis_a_jour, error: erreurEcriture } = await supabase
      .from("gouters")
      .update(misAJour)
      .eq("id", gouterId)
      .select("*")
      .single();

    if (erreurEcriture) throw new Error(erreurEcriture.message);

    return NextResponse.json({ gouter: mis_a_jour });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur inconnue.";
    await supabase
      .from("gouters")
      .update({ statut_ia: "echec", erreur_ia: message })
      .eq("id", gouterId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
