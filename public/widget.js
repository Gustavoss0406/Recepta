/*!
 * Recepta website widget. Usage:
 * <script src="https://SEU-DOMINIO/widget.js" data-agente="AGENT_ID" data-cor="#000000" data-texto="Fale com a gente" async></script>
 */
(function () {
  var s = document.currentScript;
  if (!s || window.__receptaWidget) return;
  window.__receptaWidget = true;
  var agente = s.getAttribute("data-agente");
  if (!agente) return;
  var origem = new URL(s.src).origin;
  var cor = /^#[0-9a-f]{6}$/i.test(s.getAttribute("data-cor") || "") ? s.getAttribute("data-cor") : "#000000";
  var texto = (s.getAttribute("data-texto") || "Fale com a gente").slice(0, 40);
  var font = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  var raiz = document.createElement("div");
  raiz.setAttribute("data-recepta", "");
  var sombra = raiz.attachShadow ? raiz.attachShadow({ mode: "open" }) : raiz;
  sombra.innerHTML =
    "<style>" +
    ":host{all:initial}" +
    ".b{position:fixed;right:20px;bottom:20px;z-index:2147483646;display:flex;align-items:center;gap:10px;height:48px;padding:0 18px 0 8px;border:0;border-radius:999px;background:" + cor + ";color:#fff;font:500 15px/1 " + font + ";box-shadow:0 0 0 1px rgba(0,0,0,.06),0 12px 32px -8px rgba(0,0,0,.35);cursor:pointer;transition:transform .2s cubic-bezier(.32,.72,0,1)}" +
    ".b:hover{transform:translateY(-1px)}.b:focus-visible{outline:2px solid " + cor + ";outline-offset:3px}" +
    ".o{width:32px;height:32px;border-radius:50%;background:conic-gradient(from 25deg,#A0B9D1,#CADCFC 55deg,#A0B9D1 88deg,#fff 110deg,#A0B9D1 120deg,#CADCFC 175deg,#A0B9D1 208deg,#fff 230deg,#A0B9D1 240deg,#CADCFC 295deg,#A0B9D1 328deg,#fff 350deg);filter:saturate(1.1)}" +
    ".p{position:fixed;right:20px;bottom:80px;z-index:2147483647;width:380px;height:560px;max-height:calc(100vh - 100px);border:0;border-radius:20px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 24px 64px -12px rgba(0,0,0,.3);opacity:0;transform:translateY(8px) scale(.98);pointer-events:none;transition:opacity .25s,transform .3s cubic-bezier(.32,.72,0,1)}" +
    ".p.a{opacity:1;transform:none;pointer-events:auto}" +
    "@media (max-width:480px){.p{right:0;bottom:0;width:100vw;height:100dvh;max-height:none;border-radius:0}}" +
    "@media (prefers-reduced-motion:reduce){.b,.p{transition:none}}" +
    "</style>" +
    '<button class="b" type="button" aria-haspopup="dialog" aria-expanded="false"><span class="o" aria-hidden="true"></span><span></span></button>';
  var botao = sombra.querySelector(".b");
  botao.lastChild.textContent = texto;
  var painel = null;

  function abrir() {
    if (!painel) {
      painel = document.createElement("iframe");
      painel.className = "p";
      painel.title = texto;
      painel.allow = "microphone; autoplay";
      painel.src = origem + "/widget/" + encodeURIComponent(agente);
      sombra.appendChild(painel);
      painel.getBoundingClientRect();
    }
    painel.classList.add("a");
    botao.setAttribute("aria-expanded", "true");
  }
  function fechar() {
    if (painel) painel.classList.remove("a");
    botao.setAttribute("aria-expanded", "false");
  }
  botao.addEventListener("click", function () {
    painel && painel.classList.contains("a") ? fechar() : abrir();
  });
  window.addEventListener("message", function (e) {
    if (e.origin === origem && e.data && e.data.recepta === "fechar") fechar();
  });
  (document.body || document.documentElement).appendChild(raiz);
})();
