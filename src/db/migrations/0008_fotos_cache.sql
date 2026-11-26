CREATE TABLE IF NOT EXISTS "fotos_cache" ("slug" text PRIMARY KEY NOT NULL, "dados" jsonb, "atualizado_em" timestamp with time zone DEFAULT now() NOT NULL);
