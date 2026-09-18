"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile-context";
import { canManage, type Animateur } from "@/lib/types";

const EMPTY_FORM = {
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  diplomes: "",
  disponibilites: "",
  statut: "actif",
  notes: "",
};

export default function AnimateursPage() {
  const profile = useProfile();
  const supabase = createClient();
  const editable = canManage(profile.role);

  const [animateurs, setAnimateurs] = useState<Animateur[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("animateurs")
      .select("*")
      .order("nom", { ascending: true });
    if (!error && data) setAnimateurs(data as Animateur[]);
    setLoading(false);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startEdit(a: Animateur) {
    setEditingId(a.id);
    setForm({
      nom: a.nom,
      prenom: a.prenom,
      email: a.email ?? "",
      telephone: a.telephone ?? "",
      diplomes: a.diplomes ?? "",
      disponibilites: a.disponibilites ?? "",
      statut: a.statut,
      notes: a.notes ?? "",
    });
    setShowForm(true);
  }

  function startCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (editingId) {
      const { error } = await supabase
        .from("animateurs")
        .update(form)
        .eq("id", editingId);
      if (error) {
        setError(error.message);
        return;
      }
    } else {
      const { error } = await supabase
        .from("animateurs")
        .insert({ ...form, created_by: profile.id });
      if (error) {
        setError(error.message);
        return;
      }
    }

    setShowForm(false);
    setForm(EMPTY_FORM);
    setEditingId(null);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Supprimer cet animateur ?")) return;
    await supabase.from("animateurs").delete().eq("id", id);
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Animateurs</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {editable
              ? "Gère la liste des animateurs de l'équipe."
              : "Liste des animateurs de l'équipe (lecture seule)."}
          </p>
        </div>
        {editable && (
          <button
            onClick={startCreate}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            + Ajouter
          </button>
        )}
      </div>

      {showForm && editable && (
        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 gap-3 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:grid-cols-2"
        >
          <input
            placeholder="Nom"
            required
            value={form.nom}
            onChange={(e) => setForm({ ...form, nom: e.target.value })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Prénom"
            required
            value={form.prenom}
            onChange={(e) => setForm({ ...form, prenom: e.target.value })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Téléphone"
            value={form.telephone}
            onChange={(e) => setForm({ ...form, telephone: e.target.value })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Diplômes (BAFA, PSC1...)"
            value={form.diplomes}
            onChange={(e) => setForm({ ...form, diplomes: e.target.value })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Disponibilités"
            value={form.disponibilites}
            onChange={(e) =>
              setForm({ ...form, disponibilites: e.target.value })
            }
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />
          <select
            value={form.statut}
            onChange={(e) => setForm({ ...form, statut: e.target.value })}
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="actif">Actif</option>
            <option value="inactif">Inactif</option>
          </select>
          <textarea
            placeholder="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="col-span-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
          />

          {error && <p className="col-span-full text-sm text-red-600">{error}</p>}

          <div className="col-span-full flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              {editingId ? "Enregistrer" : "Ajouter"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Annuler
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-500">
            <tr>
              <th className="px-4 py-3 font-medium">Nom</th>
              <th className="px-4 py-3 font-medium">Contact</th>
              <th className="px-4 py-3 font-medium">Diplômes</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              {editable && <th className="px-4 py-3" />}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-400">
                  Chargement...
                </td>
              </tr>
            ) : animateurs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-zinc-400">
                  Aucun animateur pour l&apos;instant.
                </td>
              </tr>
            ) : (
              animateurs.map((a) => (
                <tr key={a.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-zinc-900">
                    {a.prenom} {a.nom}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {a.email}
                    {a.email && a.telephone && <br />}
                    {a.telephone}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">{a.diplomes}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        a.statut === "actif"
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-zinc-100 text-zinc-600"
                      }`}
                    >
                      {a.statut}
                    </span>
                  </td>
                  {editable && (
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => startEdit(a)}
                        className="mr-3 text-zinc-500 hover:text-zinc-900"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        Supprimer
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
