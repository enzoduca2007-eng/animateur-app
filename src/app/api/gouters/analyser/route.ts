import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MODELE = "gemini-2.0-flash";

const PROMPT = `Tu regardes la photo de l'emballage d'un produit alimentaire (goûter de centre de loisirs). Extrait UNIQUEMENT les informations suivantes, telles qu'elles apparaissent sur l'emballage :
- nom_produit : le nom exact du produit
- numero_lot : le numéro de lot (souvent précédé de "Lot", "L", ou un code court)
- date_peremption : la date de péremption / DLC / DLUO, au format AAAA-MM-JJ (déduis l'année si seul le jour/mois est visible, en supposant l'année la plus proche dans le futur)
- quantite : le poids ou la quantité (ex: "125g", "6x20cl")

Réponds STRICTEMENT en JSON, sans aucun texte autour, avec exactement ces clés. Mets null pour une valeur que tu ne trouves pas ou dont tu n'es pas sûr :
{"nom_produit": string|null, "numero_lot": string|null, "date_peremption": string|null, "quantite": string|null}`;

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

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELE}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: PROMPT },
                { inline_data: { mime_type: contentType, data: base64 } },
              ],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!geminiRes.ok) {
      const detail = await geminiRes.text();
      throw new Error(`Erreur Gemini (${geminiRes.status}) : ${detail.slice(0, 300)}`);
    }

    const geminiJson = await geminiRes.json();
    const texte = geminiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!texte) throw new Error("Réponse IA vide ou inattendue.");

    const extrait = JSON.parse(texte) as {
      nom_produit: string | null;
      numero_lot: string | null;
      date_peremption: string | null;
      quantite: string | null;
    };

    const { data: mis_a_jour, error: erreurEcriture } = await supabase
      .from("gouters")
      .update({
        nom_produit: extrait.nom_produit ?? null,
        numero_lot: extrait.numero_lot ?? null,
        date_peremption: extrait.date_peremption || null,
        quantite: extrait.quantite ?? null,
        statut_ia: "traite",
        erreur_ia: null,
      })
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
