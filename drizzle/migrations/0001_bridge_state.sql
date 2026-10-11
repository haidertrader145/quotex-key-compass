CREATE TABLE public.bridge_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status text NOT NULL DEFAULT 'offline',
  login_code text,
  session_string text,
  last_seen timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bridge_state TO service_role;
ALTER TABLE public.bridge_state ENABLE ROW LEVEL SECURITY;
INSERT INTO public.bridge_state (id) VALUES (1) ON CONFLICT DO NOTHING;