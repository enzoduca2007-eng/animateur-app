-- Trajets de bus possibles entre deux arrets, pour un jour de la semaine
-- donne (1=lundi ... 6=samedi). Utilise par la page "Mon planning" pour
-- afficher le bus a prendre en fonction de l'heure d'arrivee prevue.
create or replace function public.bus_options(
  p_arret_depart_id text,
  p_arret_arrivee_id text,
  p_jour_semaine smallint
)
returns table (
  trip_id text,
  route_short_name text,
  heure_depart interval,
  heure_arrivee interval
)
language sql
stable
as $$
  select
    st_dep.trip_id,
    r.route_short_name,
    st_dep.departure_time as heure_depart,
    st_arr.arrival_time as heure_arrivee
  from public.gtfs_stop_times st_dep
  join public.gtfs_stop_times st_arr
    on st_arr.trip_id = st_dep.trip_id
   and st_arr.stop_sequence > st_dep.stop_sequence
  join public.gtfs_trips t on t.trip_id = st_dep.trip_id
  join public.gtfs_routes r on r.route_id = t.route_id
  where st_dep.stop_id = p_arret_depart_id
    and st_arr.stop_id = p_arret_arrivee_id
    and t.jour_semaine = p_jour_semaine
  order by st_dep.departure_time;
$$;
