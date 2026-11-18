import { brand } from "@/config/brand";

export const metadata = { title: "Política de privacidade" };

const ATUALIZADA = "18 de novembro de 2026";

function S({ id, titulo, children }: { id: string; titulo: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-hairline pt-8">
      <h2 className="display-sm text-ink">{titulo}</h2>
      <div className="mt-4 space-y-3 text-[0.9375rem] leading-relaxed text-body [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-medium [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export default function PrivacidadePage() {
  return (
    <div className="container-page max-w-[760px] py-16 sm:py-24">
      <p className="eyebrow">LGPD · Lei 13.709/2018</p>
      <h1 className="display-section mt-3 text-ink">Política de privacidade</h1>
      <p className="mt-3 text-sm text-muted-foreground">Atualizada em {ATUALIZADA}.</p>

      <div className="mt-10 space-y-10">
        <S id="quem" titulo="1. Quem somos e qual o nosso papel">
          <p>
            A {brand.name} ({brand.legalName}) oferece uma recepcionista virtual que atende ligações e conversas em nome de empresas (nossos clientes).
          </p>
          <ul>
            <li>
              <strong>Dados da conta do cliente</strong> (nome, e-mail, empresa, cobrança): a {brand.name} é <strong>controladora</strong>.
            </li>
            <li>
              <strong>Dados das pessoas que ligam</strong> para os nossos clientes (voz, transcrição, nome, telefone, pedido): o cliente é o controlador e a {brand.name} é{" "}
              <strong>operadora</strong>, tratando os dados conforme as instruções do cliente e o Acordo de Tratamento de Dados (DPA).
            </li>
          </ul>
        </S>

        <S id="dados" titulo="2. Quais dados tratamos">
          <ul>
            <li>Áudio das ligações, quando a gravação está ligada (o atendimento sempre avisa que a ligação é gravada).</li>
            <li>Transcrição do que foi falado, resumo, motivo do contato e o resultado da ligação.</li>
            <li>Dados informados durante o atendimento: nome, telefone e o que a empresa configurou para coletar (por exemplo, convênio ou horário desejado).</li>
            <li>Número de origem da ligação, data, duração e dados técnicos de uso.</li>
            <li>Dados da conta do cliente: nome, e-mail, empresa, CNPJ e dados de pagamento (processados pelo gateway de pagamento).</li>
          </ul>
          <p>
            Por padrão, números de CPF e de cartão são mascarados nas transcrições. A recepcionista se apresenta como atendimento virtual e nunca diz ser uma pessoa.
          </p>
        </S>

        <S id="finalidades" titulo="3. Para que usamos">
          <ul>
            <li>Atender a ligação, responder dúvidas, agendar e passar casos para a equipe do cliente.</li>
            <li>Gerar o resumo e o relatório da ligação e enviar avisos ao cliente (WhatsApp, e-mail, webhooks e integrações que ele conectar).</li>
            <li>Cobrança, segurança, prevenção a abuso e cumprimento de obrigações legais.</li>
          </ul>
        </S>

        <S id="ia" titulo="4. Fornecedores de inteligência artificial e uso para treino">
          <p>
            Para entender e responder em tempo real, o conteúdo das ligações (texto transcrito e as respostas) é processado por fornecedores de modelos de linguagem, de transcrição e de
            voz. Para manter o preço acessível, usamos <strong>camadas gratuitas</strong> de provedores de modelos de linguagem, em rodízio:
          </p>
          <ul>
            <li>
              <strong>Groq</strong> (Estados Unidos), camada gratuita.
            </li>
            <li>
              <strong>OpenRouter</strong> (Estados Unidos), modelos gratuitos, que repassam o conteúdo ao provedor de cada modelo (por exemplo, NVIDIA e Google).
            </li>
          </ul>
          <p>
            <strong>Importante:</strong> nas camadas gratuitas, alguns desses provedores <strong>podem reter o conteúdo enviado e usá-lo para melhorar ou treinar os seus modelos</strong>,
            conforme as políticas de cada um. Por isso, recomendamos que nenhuma informação sensível desnecessária seja coletada no atendimento, e mascaramos CPF e cartões antes do envio.
          </p>
          <p>
            Clientes que precisem de garantia de não retenção e não treino podem solicitar o modo de processamento dedicado, sem camadas gratuitas, pelo e-mail {brand.privacyEmail}.
          </p>
          <p>Outros fornecedores: transcrição de voz (Deepgram, EUA), síntese de voz (ElevenLabs, EUA, ou motor próprio hospedado pela {brand.name}), telefonia (Twilio, EUA) e pagamentos (Asaas, Brasil).</p>
        </S>

        <S id="transferencia" titulo="5. Transferência internacional">
          <p>
            Parte dos fornecedores acima processa dados fora do Brasil, principalmente nos Estados Unidos. Essas transferências se apoiam nas hipóteses do art. 33 da LGPD, incluindo cláusulas
            contratuais e o consentimento informado no aviso da ligação, quando aplicável.
          </p>
        </S>

        <S id="retencao" titulo="6. Por quanto tempo guardamos">
          <ul>
            <li>Áudios: 90 dias por padrão; o cliente pode reduzir ou aumentar esse prazo no painel.</li>
            <li>Transcrições e dados coletados: 365 dias por padrão, também configurável.</li>
            <li>Ao fim do prazo, os dados são apagados automaticamente. O titular pode pedir a exclusão antes disso.</li>
          </ul>
          <p>A retenção feita pelos próprios provedores de IA nas camadas gratuitas segue as políticas deles e não é controlada por esses prazos.</p>
        </S>

        <S id="direitos" titulo="7. Direitos do titular">
          <p>
            Você pode pedir confirmação de tratamento, acesso, correção, anonimização, portabilidade, exclusão e informações sobre compartilhamento (art. 18 da LGPD). Se você ligou para uma
            empresa que usa a {brand.name}, fale com a empresa; também atendemos pelo e-mail {brand.privacyEmail} e encaminhamos o pedido ao cliente responsável.
          </p>
        </S>

        <S id="seguranca" titulo="8. Segurança">
          <p>
            Credenciais de integrações são criptografadas, o acesso ao painel tem papéis (dono, gestor, atendente, financeiro), ações sensíveis ficam registradas e os dados de cada cliente
            ficam isolados.
          </p>
        </S>

        <S id="contato" titulo="9. Contato do encarregado (DPO)">
          <p>
            {brand.legalName} · {brand.privacyEmail}
          </p>
        </S>
      </div>
    </div>
  );
}
