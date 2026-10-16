-- Pelada de Vôlei — esquema do grupo sincronizado (Supabase).
-- Cole tudo no SQL Editor do projeto e clique em "Run". Pode rodar de novo sem problema.
--
-- Modelo: cada aparelho entra com login anônimo; quem tem o link do grupo vira membro (editor).
-- Os dados do app (jogadores, dias, partidas) ficam em `docs` como JSON, com `version` para
-- impedir que dois organizadores sobrescrevam um ao outro (controle otimista de concorrência).

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  invite_code text not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null,
  role      text not null default 'editor' check (role in ('editor', 'viewer')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.docs (
  group_id   uuid not null references public.groups(id) on delete cascade,
  kind       text not null check (kind in ('player', 'day', 'match')),
  id         text not null,
  data       jsonb not null,
  version    integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (group_id, kind, id)
);

alter table public.groups  enable row level security;
alter table public.members enable row level security;
alter table public.docs    enable row level security;

-- Ninguém escreve direto nas tabelas: só pelas funções abaixo.
revoke all on public.groups, public.members, public.docs from anon, authenticated;
grant select on public.groups, public.members, public.docs to authenticated;

create or replace function public.is_member(g uuid, need_editor boolean default false)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.members m
    where m.group_id = g and m.user_id = auth.uid() and (not need_editor or m.role = 'editor')
  );
$$;

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups for select to authenticated using (public.is_member(id));
drop policy if exists members_read on public.members;
create policy members_read on public.members for select to authenticated using (user_id = auth.uid());
drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select to authenticated using (public.is_member(group_id));

-- Cria o grupo com os dados deste aparelho. p_docs: [{kind, id, data}, ...]
create or replace function public.create_group(p_name text, p_docs jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  g    uuid;
  code text := substr(replace(gen_random_uuid()::text, '-', ''), 1, 20);
  nm   text := coalesce(nullif(trim(p_name), ''), 'Pelada');
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.groups (name, invite_code) values (nm, code) returning id into g;
  insert into public.members (group_id, user_id, role) values (g, auth.uid(), 'editor');
  insert into public.docs (group_id, kind, id, data)
    select g, d->>'kind', d->>'id', d->'data'
    from jsonb_array_elements(coalesce(p_docs, '[]'::jsonb)) d;
  return jsonb_build_object('id', g, 'name', nm, 'invite_code', code);
end;
$$;

-- Entra no grupo pelo código do link.
create or replace function public.join_group(p_code text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  grp public.groups;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into grp from public.groups where invite_code = trim(p_code);
  if not found then raise exception 'invalid_code'; end if;
  insert into public.members (group_id, user_id, role) values (grp.id, auth.uid(), 'editor')
    on conflict (group_id, user_id) do nothing;
  return jsonb_build_object('id', grp.id, 'name', grp.name, 'invite_code', grp.invite_code);
end;
$$;

-- Aplica várias gravações de uma vez (tudo ou nada).
-- p_ops: [{op: 'put'|'del', kind, id, data?, expect}], expect = versão que o aparelho leu (0 = documento novo).
-- Se alguma versão não bater (outro organizador mudou antes), nada é gravado e a função falha com 'conflict'.
create or replace function public.apply_ops(p_group uuid, p_ops jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  op     jsonb;
  cur    integer;
  newv   integer;
  result jsonb := '[]'::jsonb;
begin
  if not public.is_member(p_group, true) then raise exception 'forbidden'; end if;
  begin
    for op in select * from jsonb_array_elements(p_ops) loop
      select version into cur from public.docs
        where group_id = p_group and kind = op->>'kind' and id = op->>'id'
        for update;
      if op->>'op' = 'put' then
        if cur is null then
          if coalesce((op->>'expect')::int, 0) <> 0 then raise exception 'conflict'; end if;
          insert into public.docs (group_id, kind, id, data, version)
            values (p_group, op->>'kind', op->>'id', op->'data', 1);
          newv := 1;
        else
          if coalesce((op->>'expect')::int, 0) <> cur then raise exception 'conflict'; end if;
          update public.docs set data = op->'data', version = cur + 1, updated_at = now()
            where group_id = p_group and kind = op->>'kind' and id = op->>'id';
          newv := cur + 1;
        end if;
        result := result || jsonb_build_object('kind', op->>'kind', 'id', op->>'id', 'version', newv);
      elsif op->>'op' = 'del' then
        if cur is null or coalesce((op->>'expect')::int, 0) <> cur then raise exception 'conflict'; end if;
        delete from public.docs where group_id = p_group and kind = op->>'kind' and id = op->>'id';
        result := result || jsonb_build_object('kind', op->>'kind', 'id', op->>'id', 'deleted', true);
      else
        raise exception 'bad_op';
      end if;
    end loop;
  exception when unique_violation then
    -- dois aparelhos criando o mesmo documento ao mesmo tempo (ex.: resultado do mesmo jogo)
    raise exception 'conflict';
  end;
  return result;
end;
$$;

-- Sai do grupo (o grupo continua para os outros).
create or replace function public.leave_group(p_group uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from public.members where group_id = p_group and user_id = auth.uid();
$$;

revoke all on function public.create_group(text, jsonb), public.join_group(text),
  public.apply_ops(uuid, jsonb), public.leave_group(uuid), public.is_member(uuid, boolean) from public, anon;
grant execute on function public.create_group(text, jsonb), public.join_group(text),
  public.apply_ops(uuid, jsonb), public.leave_group(uuid), public.is_member(uuid, boolean) to authenticated;

-- Tempo real: avisa os aparelhos quando algo muda. Em exclusões chega só a chave (group_id, kind, id).
alter table public.docs replica identity full;
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
