import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const MODELE = "gemini-3.6-flash";

// Le modèle Gemini renvoie parfois 503 (surchargé) ou 429 (limite de débit)
// de façon transitoire : on réessaie automatiquement avant d'abandonner.
const DELAIS_RETRY_MS = [3000, 6000];

function attendre(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function appellerGemini(url: string, body: string) {
  let derniereReponse: Response | null = null;
  for (let tentative = 0; tentative <= DELAIS_RETRY_MS.length; tentative++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });
    if (res.ok) return res;
    derniereReponse = res;
    const reessayable = res.status === 503 || res.status === 429;
    if (!reessayable || tentative === DELAIS_RETRY_MS.length) break;
    await attendre(DELAIS_RETRY_MS[tentative]);
  }
  return derniereReponse!;
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

    const geminiRes = await appellerGemini(
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
        generationConfig: { responseMimeType: "application/json" },
      })
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      const messageBase =
        geminiRes.status === 503
          ? "Le modèle IA est temporairement surchargé, réessaie dans quelques instants."
          : `Erreur Gemini (${geminiRes.status}) : ${detail.slice(0, 300)}`;
      throw new Error(messageBase);
    }

    const geminiJson = await geminiRes.json();
    const texte = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texte) throw new Error("Réponse IA vide ou inattendue.");

    const extrait = JSON.parse(texte) as {
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
