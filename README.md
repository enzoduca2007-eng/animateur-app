# Gestion Animateurs

App de gestion des animateurs avec 3 espaces par rôle : **directeur**,
**coordinateur**, **responsable**. Stack : Next.js (App Router) + Supabase
(authentification email/mot de passe + base Postgres avec règles d'accès par
rôle) + déploiement Vercel.

## Fonctionnalités (v1)

- **Animateurs** : fiche par animateur (contact, diplômes, groupe,
  disponibilités, statut). Lecture pour tous, écriture pour
  directeur/coordinateur.
- **Plannings** : activités datées avec lieu/horaires et affectation
  d'animateurs. Lecture pour tous, écriture pour directeur/coordinateur.
- **Messages** : fil de communication interne visible par les 3 espaces,
  chacun peut écrire.
- **Équipe** *(directeur uniquement)* : attribue le rôle (espace) de chaque
  compte.

## 1. Créer le projet Supabase

1. Va sur [supabase.com](https://supabase.com) → crée un compte gratuit →
   **New project**.
2. Une fois le projet créé, ouvre **SQL Editor** → **New query**, colle le
   contenu de [`supabase/schema.sql`](supabase/schema.sql) et exécute-le
   (**Run**). Ça crée les tables `profiles`, `animateurs`, `plannings`,
   `planning_animateurs`, `messages` et leurs règles d'accès (RLS).
3. Va dans **Authentication → Providers → Email** et vérifie que
   l'inscription par email/mot de passe est activée (c'est le cas par
   défaut). Pour tester rapidement sans configurer d'envoi d'email, tu peux
   désactiver **Confirm email** dans **Authentication → Settings** (à
   réactiver avant une vraie mise en production).
4. Va dans **Project Settings → API** : note l'**URL** du projet et la clé
   **anon public**.

## 2. Configurer le projet en local

```bash
cp .env.local.example .env.local
```

Remplis `.env.local` avec l'URL et la clé notées à l'étape précédente, puis :

```bash
npm install
npm run dev
```

Ouvre [http://localhost:3000](http://localhost:3000) → tu arrives sur
`/login`. Crée un premier compte via **Créer un compte** en choisissant
l'espace **Directeur** : c'est ce compte qui pourra ensuite gérer le rôle des
autres depuis l'onglet **Équipe**.

## 3. Déployer en ligne (Vercel)

1. Crée un dépôt GitHub et pousse le projet :
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <URL_DE_TON_DEPOT>
   git push -u origin main
   ```
2. Sur [vercel.com](https://vercel.com), connecte-toi avec GitHub → **Add
   New Project** → sélectionne le dépôt.
3. Dans les **Environment Variables** du projet Vercel, ajoute
   `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY` (mêmes
   valeurs que dans `.env.local`).
4. **Deploy**. Le site est en ligne à l'URL fournie par Vercel.

## Sécurité et limites connues (v1)

- L'inscription est ouverte à tous et laisse choisir son espace à la
  création du compte (y compris "Directeur"). Pratique pour démarrer sans
  configuration supplémentaire, mais à restreindre avant une diffusion
  publique du lien : un directeur peut à tout moment revoir le rôle de
  n'importe quel compte depuis **Équipe**, et il est possible de désactiver
  l'auto-inscription plus tard (ex. en retirant l'accès à `/signup` ou en
  ajoutant une validation manuelle).
- Les règles d'accès (qui peut lire/écrire quoi) sont appliquées côté base
  de données (Postgres Row Level Security), pas seulement côté interface :
  voir [`supabase/schema.sql`](supabase/schema.sql).

## Prochaines étapes possibles

- Emails de notification (nouveau message, planning modifié).
- Export du planning (PDF/CSV).
- Suivi documentaire (upload d'attestations, dates d'expiration).
- Affinage des permissions du rôle "responsable" (ex. lecture seule stricte
  vs. droits ciblés).
