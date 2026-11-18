CREATE TABLE "experimentos" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"agente_id" text NOT NULL,
	"versao_a" text NOT NULL,
	"versao_b" text NOT NULL,
	"percentual_b" integer DEFAULT 50 NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"vencedora" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "experimentos_agente_idx" ON "experimentos" USING btree ("agente_id","status");