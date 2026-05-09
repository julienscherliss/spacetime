create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

create or replace function private.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

grant execute on function private.has_role(uuid, public.app_role) to authenticated;
grant execute on function private.has_role(uuid, public.app_role) to service_role;

alter policy "Admins view all audit"
on public.audit_log
using (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can delete feedback"
on public.feedback
using (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can update feedback"
on public.feedback
using (private.has_role(auth.uid(), 'admin'::public.app_role))
with check (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can view all feedback"
on public.feedback
using (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can view all profiles"
on public.profiles
using (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can manage promo codes"
on public.promo_codes
using (private.has_role(auth.uid(), 'admin'::public.app_role))
with check (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can view all redemptions"
on public.promo_redemptions
using (private.has_role(auth.uid(), 'admin'::public.app_role))
with check (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can update subscriptions"
on public.subscriptions
using (private.has_role(auth.uid(), 'admin'::public.app_role))
with check (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can view all subscriptions"
on public.subscriptions
using (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can delete roles"
on public.user_roles
using (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can insert roles"
on public.user_roles
with check (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can select all roles"
on public.user_roles
using (private.has_role(auth.uid(), 'admin'::public.app_role));

alter policy "Admins can update roles"
on public.user_roles
using (private.has_role(auth.uid(), 'admin'::public.app_role))
with check (private.has_role(auth.uid(), 'admin'::public.app_role));

revoke execute on function public.has_role(uuid, public.app_role) from authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from service_role;