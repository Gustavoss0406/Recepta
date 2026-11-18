CREATE TABLE "repasses" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"agente_id" text,
	"conversa_id" text,
	"titulo" text NOT NULL,
	"motivo" text NOT NULL,
	"pedido" text NOT NULL,
	"urgencia" text DEFAULT 'media' NOT NULL,
	"proximo_passo" text,
	"contato_nome" text,
	"contato_telefone" text,
	"dados" jsonb,
	"trecho" text,
	"origem" text DEFAULT 'agente' NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"responsavel_id" text,
	"nota" text,
	"resolvido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "repasses_org_idx" ON "repasses" USING btree ("org_id","status","criado_em");