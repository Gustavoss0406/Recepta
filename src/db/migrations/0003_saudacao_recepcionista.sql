-- Repositioning: the default greeting no longer says "inteligência artificial"; it says "recepcionista virtual"
-- plus the recording notice. Only the old default sentence is rewritten; custom greetings are left as written.
UPDATE "agentes" SET "rascunho" = jsonb_set("rascunho", '{comportamento,saudacao}', to_jsonb(regexp_replace("rascunho"->'comportamento'->>'saudacao', 'assistente virtual com intelig[êe]ncia artificial[.,] (Esta|e a) liga[çc][ãa]o pode ser gravada( para melhorar o atendimento)?\.', 'recepcionista virtual. A ligação é gravada.')))
WHERE "rascunho"->'comportamento'->>'saudacao' ~ 'assistente virtual com intelig[êe]ncia artificial';
--> statement-breakpoint
UPDATE "agente_versoes" SET "config" = jsonb_set("config", '{comportamento,saudacao}', to_jsonb(regexp_replace("config"->'comportamento'->>'saudacao', 'assistente virtual com intelig[êe]ncia artificial[.,] (Esta|e a) liga[çc][ãa]o pode ser gravada( para melhorar o atendimento)?\.', 'recepcionista virtual. A ligação é gravada.')))
WHERE "config"->'comportamento'->>'saudacao' ~ 'assistente virtual com intelig[êe]ncia artificial';
