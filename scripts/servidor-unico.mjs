/**
 * Single-port production server, for hosts that expose one port (Render, Koyeb, Railway…).
 * Starts the web app, the voice gateway and the worker as child processes and proxies:
 *   WebSocket /conversa and /twilio → voice gateway;  everything else → Next.js.
 * Build first: npm run build && npm run build:servicos.   Run: npm run start:unico
 */
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";

const PORTA = Number(process.env.PORT ?? 3000);
const WEB = 3101;
const VOZ = 3102;
const filhos = [];

function iniciar(nome, cmd, args, env = {}) {
  const p = spawn(cmd, args, { stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, ...env } });
  p.on("exit", (code) => {
    console.error(`[${nome}] saiu com código ${code}; encerrando para o host reiniciar`);
    for (const f of filhos) f.kill("SIGTERM");
    process.exit(1);
  });
  filhos.push(p);
}

const node = process.execPath;
const servidor = ["--conditions=react-server"];
if (process.env.MIGRAR_AO_INICIAR !== "0") {
  const r = await new Promise((ok) => spawn(node, ["dist/db/migrate.mjs"], { stdio: "inherit" }).on("exit", ok));
  if (r !== 0) process.exit(1);
}
iniciar("web", node, ["node_modules/next/dist/bin/next", "start", "-p", String(WEB), "-H", "127.0.0.1"], { VOZ_MESMA_ORIGEM: "1" });
// voice gateway and worker share one process unless WORKER_EMBUTIDO=0 (then run the worker elsewhere)
iniciar("voz", node, [...servidor, process.env.WORKER_EMBUTIDO === "0" ? "dist/voice-gateway/server.mjs" : "dist/voz-e-worker.mjs"], { VOICE_PORT: String(VOZ) });

const destino = (url = "/") => {
  const caminho = url.split("?")[0];
  return caminho === "/conversa" || caminho === "/twilio" ? VOZ : WEB;
};

const proxy = http.createServer((req, res) => {
  const alvo = req.url === "/saude-voz" ? VOZ : WEB;
  const p = http.request(
    {
      host: "127.0.0.1",
      port: alvo,
      method: req.method,
      path: req.url === "/saude-voz" ? "/saude" : req.url,
      headers: { ...req.headers, "x-forwarded-for": req.socket.remoteAddress ?? "", "x-forwarded-proto": req.headers["x-forwarded-proto"] ?? (req.socket.encrypted ? "https" : "http"),
        "x-forwarded-host": req.headers["x-forwarded-host"] ?? req.headers.host ?? "",
      },
    },
    (r) => {
      res.writeHead(r.statusCode ?? 502, r.headers);
      r.pipe(res);
    },
  );
  p.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    res.end("Iniciando… tente de novo em alguns segundos.");
  });
  req.pipe(p);
});

// WebSocket: replay the upgrade request on a raw TCP connection and splice both sockets
proxy.on("upgrade", (req, socket, head) => {
  const up = net.connect(destino(req.url), "127.0.0.1", () => {
    const linhas = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) linhas.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    up.write(linhas.join("\r\n") + "\r\n\r\n");
    if (head?.length) up.write(head);
    socket.pipe(up).pipe(socket);
  });
  const fechar = () => {
    socket.destroy();
    up.destroy();
  };
  up.on("error", fechar);
  socket.on("error", fechar);
});

proxy.listen(PORTA, () => console.log(`Recepta em http://0.0.0.0:${PORTA} (web ${WEB}, voz ${VOZ})`));
for (const s of ["SIGTERM", "SIGINT"])
  process.on(s, () => {
    for (const f of filhos) f.kill("SIGTERM");
    process.exit(0);
  });
