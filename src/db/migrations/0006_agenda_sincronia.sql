ALTER TABLE "agenda_eventos" ADD COLUMN "origem" text DEFAULT 'recepcionista' NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda_eventos" ADD COLUMN "observacao" text;--> statement-breakpoint
ALTER TABLE "agenda_eventos" ADD COLUMN "google_id" text;--> statement-breakpoint
ALTER TABLE "agenda_eventos" ADD COLUMN "sincronia" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "agenda_eventos" ADD COLUMN "sincronizado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agenda_eventos" ADD COLUMN "atualizado_em" timestamp with time zone;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agenda_eventos_org_google_idx" ON "agenda_eventos" ("org_id","google_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agenda_eventos_org_inicio_idx" ON "agenda_eventos" ("org_id","inicio");
