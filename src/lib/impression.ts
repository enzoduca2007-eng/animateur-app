// Impression centralisée : toutes les pages passent par imprimer() plutôt
// que window.print() directement.
//
// - Orientation automatique : les vues imprimables en portrait portent la
//   classe .print-portrait, tout le reste sort en paysage. On injecte une
//   seule règle @page { size } juste avant l'impression (les "pages
//   nommées" CSS étaient ignorées dès que le contenu est dans un conteneur
//   flex, et ne sont pas gérées par Safari iOS).
// - App mobile (Capacitor) : dans la WebView Android/iOS, window.print() ne
//   fait rien. On passe par le plugin natif "Impression" (MainActivity /
//   SceneDelegate) qui ouvre la boîte d'impression du système.

export type Orientation = "portrait" | "landscape";

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  isPluginAvailable?: (nom: string) => boolean;
  nativePromise?: (plugin: string, methode: string, options?: unknown) => Promise<unknown>;
};

const ID_STYLE = "impression-orientation";

export function orientationImpression(): Orientation {
  return document.querySelector(".print-portrait") ? "portrait" : "landscape";
}

/** Pose la règle @page correspondant à ce qui va être imprimé. Appelé sur
 * "beforeprint" (donc aussi pour Ctrl+P) et avant l'impression native. */
export function preparerImpression(): Orientation {
  const orientation = orientationImpression();
  let style = document.getElementById(ID_STYLE) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = ID_STYLE;
    document.head.appendChild(style);
  }
  style.textContent = `@page { size: A4 ${orientation}; margin: 10mm; }`;
  document.documentElement.dataset.orientationImpression = orientation;
  return orientation;
}

function capacitor(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

function impressionNativeDisponible() {
  const cap = capacitor();
  return (
    !!cap?.nativePromise &&
    !!cap.isNativePlatform?.() &&
    (cap.isPluginAvailable?.("Impression") ?? false)
  );
}

export function imprimer() {
  if (!impressionNativeDisponible()) {
    window.print();
    return;
  }
  // Pas d'événements beforeprint/afterprint côté natif : on les émet nous-
  // mêmes pour que les pages qui s'y abonnent (remise à zéro après
  // impression...) se comportent comme dans un navigateur.
  window.dispatchEvent(new Event("beforeprint"));
  const orientation = orientationImpression();
  capacitor()!
    .nativePromise!("Impression", "imprimer", { orientation, titre: document.title })
    .catch(() => window.print())
    .finally(() => window.dispatchEvent(new Event("afterprint")));
}
