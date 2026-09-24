-- Horaires de bus Citea (Valence Romans Mobilites) limites aux lignes qui
-- desservent Etoile-sur-Rhone. Donnees issues du GTFS open data publie sur
-- transport.data.gouv.fr (reference uniquement : le jour_semaine remplace
-- le calendrier GTFS exact, perime, pour donner un horaire type par jour).

create table public.gtfs_stops (
  stop_id text primary key,
  stop_name text not null,
  stop_lat double precision,
  stop_lon double precision,
  parent_station text
);

create table public.gtfs_routes (
  route_id text primary key,
  route_short_name text,
  route_long_name text
);

create table public.gtfs_trips (
  trip_id text primary key,
  route_id text not null references public.gtfs_routes (route_id),
  trip_headsign text,
  jour_semaine smallint not null -- 1=lundi ... 6=samedi
);

create table public.gtfs_stop_times (
  trip_id text not null references public.gtfs_trips (trip_id) on delete cascade,
  stop_id text not null references public.gtfs_stops (stop_id),
  arrival_time interval not null,
  departure_time interval not null,
  stop_sequence int not null,
  primary key (trip_id, stop_sequence)
);

create index gtfs_stop_times_stop_id_idx on public.gtfs_stop_times (stop_id);
create index gtfs_stop_times_trip_id_idx on public.gtfs_stop_times (trip_id);

alter table public.gtfs_stops enable row level security;
alter table public.gtfs_routes enable row level security;
alter table public.gtfs_trips enable row level security;
alter table public.gtfs_stop_times enable row level security;

create policy "gtfs: readable by any signed-in user" on public.gtfs_stops
  for select using (auth.uid() is not null);
create policy "gtfs: readable by any signed-in user" on public.gtfs_routes
  for select using (auth.uid() is not null);
create policy "gtfs: readable by any signed-in user" on public.gtfs_trips
  for select using (auth.uid() is not null);
create policy "gtfs: readable by any signed-in user" on public.gtfs_stop_times
  for select using (auth.uid() is not null);

-- Arrets de bus choisis par l'animateur lui-meme (depart / arrivee a Etoile).
alter table public.animateurs
  add column arret_bus_depart_id text references public.gtfs_stops (stop_id),
  add column arret_bus_arrivee_id text references public.gtfs_stops (stop_id);

-- Permet a un animateur de modifier UNIQUEMENT ses arrets de bus sur sa
-- propre fiche, sans lui donner un droit d'ecriture general sur la table
-- animateurs (reservee a directeur/coordinateur par ailleurs).
create or replace function public.set_mes_arrets_bus(
  p_arret_depart_id text,
  p_arret_arrivee_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.animateurs
  set arret_bus_depart_id = p_arret_depart_id,
      arret_bus_arrivee_id = p_arret_arrivee_id,
      updated_at = now()
  where profile_id = auth.uid();
end;
$$;
