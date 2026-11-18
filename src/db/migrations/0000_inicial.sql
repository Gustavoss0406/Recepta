CREATE TABLE "agenda_eventos" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"agente_id" text,
	"inicio" timestamp with time zone NOT NULL,
	"fim" timestamp with time zone NOT NULL,
	"titulo" text NOT NULL,
	"cliente_nome" text,
	"cliente_telefone" text,
	"conversa_id" text,
	"simulado" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'confirmado' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agente_versoes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"agente_id" text NOT NULL,
	"numero" integer NOT NULL,
	"config" jsonb NOT NULL,
	"prompt" text NOT NULL,
	"nota" text,
	"autor_id" text,
	"forcada" boolean DEFAULT false NOT NULL,
	"resultado_testes" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agentes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"nome" text NOT NULL,
	"nicho" text NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"rascunho" jsonb NOT NULL,
	"versao_publicada_id" text,
	"rascunho_alterado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alertas" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"tipo" text NOT NULL,
	"ciclo_inicio" timestamp with time zone,
	"mensagem" text NOT NULL,
	"lido" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assinaturas" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"plano_id" text NOT NULL,
	"ciclo" text DEFAULT 'mensal' NOT NULL,
	"status" text NOT NULL,
	"inicio_ciclo" timestamp with time zone NOT NULL,
	"fim_ciclo" timestamp with time zone NOT NULL,
	"trial_fim" timestamp with time zone,
	"teto_brl" double precision,
	"pico_habilitado" boolean DEFAULT false NOT NULL,
	"asaas_assinatura_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"usuario_id" text,
	"acao" text NOT NULL,
	"detalhes" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "caixa_saida" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"canal" text NOT NULL,
	"destino" text NOT NULL,
	"assunto" text,
	"corpo" text NOT NULL,
	"status" text DEFAULT 'simulado' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "casos_teste" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"agente_id" text NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"severidade" text DEFAULT 'importante' NOT NULL,
	"config" jsonb NOT NULL,
	"origem_conversa_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chamadas_ativas" (
	"conversa_id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"pico" boolean DEFAULT false NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chamadas_ferramenta" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"conversa_id" text NOT NULL,
	"nome" text NOT NULL,
	"args" jsonb,
	"resultado" jsonb,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chaves_api" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"nome" text NOT NULL,
	"prefixo" text NOT NULL,
	"hash" text NOT NULL,
	"ultimo_uso" timestamp with time zone,
	"revogada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversas" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"agente_id" text NOT NULL,
	"versao_id" text,
	"canal" text NOT NULL,
	"teste" boolean DEFAULT false NOT NULL,
	"de" text,
	"status" text DEFAULT 'em_andamento' NOT NULL,
	"resultado" text,
	"resumo" text,
	"motivo" text,
	"dados" jsonb,
	"avaliacao" jsonb,
	"sentimento" text,
	"sinalizada" boolean DEFAULT false NOT NULL,
	"pico" boolean DEFAULT false NOT NULL,
	"modo_recado" boolean DEFAULT false NOT NULL,
	"duracao_s" integer DEFAULT 0 NOT NULL,
	"minutos_cobrados" integer DEFAULT 0 NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"encerrada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "convites" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"email" text NOT NULL,
	"papel" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"aceito_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entregas_webhook" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"webhook_id" text NOT NULL,
	"evento" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"resposta_status" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execucoes_teste" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"caso_id" text NOT NULL,
	"agente_id" text NOT NULL,
	"alvo" text NOT NULL,
	"rodadas" integer NOT NULL,
	"aprovadas" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"detalhes" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "faturas" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"ciclo_inicio" timestamp with time zone NOT NULL,
	"ciclo_fim" timestamp with time zone NOT NULL,
	"itens" jsonb NOT NULL,
	"total_centavos" integer NOT NULL,
	"status" text DEFAULT 'aberta' NOT NULL,
	"vencimento" timestamp with time zone NOT NULL,
	"pago_em" timestamp with time zone,
	"asaas_cobranca_id" text,
	"link_pagamento" text,
	"pix_copia_cola" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fontes_conhecimento" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"agente_id" text NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"url" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"erro" text,
	"paginas" integer DEFAULT 0 NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integracoes" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"tipo" text NOT NULL,
	"status" text NOT NULL,
	"credenciais" text,
	"detalhes" jsonb,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"executar_em" timestamp with time zone DEFAULT now() NOT NULL,
	"erro" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "membros" (
	"org_id" text NOT NULL,
	"usuario_id" text NOT NULL,
	"papel" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membros_org_id_usuario_id_pk" PRIMARY KEY("org_id","usuario_id")
);
--> statement-breakpoint
CREATE TABLE "numeros" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"agente_id" text,
	"e164" text NOT NULL,
	"tipo" text NOT NULL,
	"operadora" text,
	"desvio_de" text,
	"modo_desvio" text,
	"verificado_em" timestamp with time zone,
	"provedor_sid" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizacoes" (
	"id" text PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"cnpj" text,
	"nicho" text DEFAULT 'clinica' NOT NULL,
	"cidade" text,
	"fuso" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	"telefone_contato" text,
	"retencao_audio_dias" integer DEFAULT 90 NOT NULL,
	"retencao_transcricao_dias" integer DEFAULT 365 NOT NULL,
	"mascarar_dados" boolean DEFAULT true NOT NULL,
	"onboarding_passo" integer DEFAULT 1 NOT NULL,
	"onboarding_concluido" boolean DEFAULT false NOT NULL,
	"asaas_cliente_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recados" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"conversa_id" text,
	"nome" text,
	"telefone" text,
	"mensagem" text NOT NULL,
	"lido" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "registro_custo" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"conversa_id" text,
	"tipo" text NOT NULL,
	"detalhes" jsonb,
	"custo_usd" double precision NOT NULL,
	"custo_brl" double precision NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" text PRIMARY KEY NOT NULL,
	"usuario_id" text NOT NULL,
	"org_id" text,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trechos" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"agente_id" text NOT NULL,
	"fonte_id" text NOT NULL,
	"origem" text,
	"texto" text NOT NULL,
	"tsv" "tsvector" GENERATED ALWAYS AS (to_tsvector('portuguese', texto)) STORED
);
--> statement-breakpoint
CREATE TABLE "turnos" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"conversa_id" text NOT NULL,
	"ordem" integer NOT NULL,
	"papel" text NOT NULL,
	"texto" text NOT NULL,
	"offset_ms" integer DEFAULT 0 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"nome" text NOT NULL,
	"senha_hash" text NOT NULL,
	"staff" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhooks" (
	"id" text PRIMARY KEY NOT NULL,
	"org_id" text NOT NULL,
	"url" text NOT NULL,
	"eventos" jsonb NOT NULL,
	"segredo" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agente_versoes_num_uq" ON "agente_versoes" USING btree ("agente_id","numero");--> statement-breakpoint
CREATE INDEX "agentes_org_idx" ON "agentes" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "alertas_unico_uq" ON "alertas" USING btree ("org_id","tipo","ciclo_inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "assinaturas_org_uq" ON "assinaturas" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "conversas_org_idx" ON "conversas" USING btree ("org_id","iniciada_em");--> statement-breakpoint
CREATE INDEX "conversas_agente_idx" ON "conversas" USING btree ("agente_id");--> statement-breakpoint
CREATE INDEX "jobs_fila_idx" ON "jobs" USING btree ("status","executar_em");--> statement-breakpoint
CREATE INDEX "registro_custo_org_idx" ON "registro_custo" USING btree ("org_id","criado_em");--> statement-breakpoint
CREATE INDEX "trechos_tsv_idx" ON "trechos" USING gin ("tsv");--> statement-breakpoint
CREATE INDEX "trechos_agente_idx" ON "trechos" USING btree ("agente_id");--> statement-breakpoint
CREATE INDEX "turnos_conversa_idx" ON "turnos" USING btree ("conversa_id","ordem");--> statement-breakpoint
CREATE UNIQUE INDEX "usuarios_email_uq" ON "usuarios" USING btree ("email");