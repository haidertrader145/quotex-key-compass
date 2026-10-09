create type public.app_role as enum ('admin', 'user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = _user_id and role = _role
  )
$$;

create policy "Users can read their own roles"
on public.user_roles for select to authenticated
using (auth.uid() = user_id);

create table public.license_keys (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  status text not null default 'available' check (status in ('available','issued','revoked')),
  issued_to_chat_id bigint,
  issued_to_trader_id text,
  issued_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.license_keys to authenticated;
grant all on public.license_keys to service_role;
alter table public.license_keys enable row level security;

create policy "Admins can manage license keys"
on public.license_keys for all to authenticated
using (public.has_role(auth.uid(), 'admin'));

create table public.verified_users (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null unique,
  username text,
  trader_id text not null,
  license_key_id uuid references public.license_keys(id),
  verified_at timestamptz not null default now()
);
grant select, insert, update, delete on public.verified_users to authenticated;
grant all on public.verified_users to service_role;
alter table public.verified_users enable row level security;

create policy "Admins can view verified users"
on public.verified_users for all to authenticated
using (public.has_role(auth.uid(), 'admin'));

create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  chat_id bigint not null,
  trader_id text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected','error')),
  affiliate_reply text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
grant select, insert, update, delete on public.verification_requests to authenticated;
grant all on public.verification_requests to service_role;
alter table public.verification_requests enable row level security;

create policy "Admins can view verification requests"
on public.verification_requests for all to authenticated
using (public.has_role(auth.uid(), 'admin'));