import { SignerPresenceQr } from "./signer-presence-qr";

// Page ouverte en scannant le QR code de présence du jour affiché à la MJC
// (feuille imprimée depuis Fiches horaires) : /dashboard/presence?j=<jeton>.
export default async function PresencePage({
  searchParams,
}: {
  searchParams: Promise<{ j?: string }>;
}) {
  const { j } = await searchParams;
  return <SignerPresenceQr jeton={j ?? ""} />;
}
