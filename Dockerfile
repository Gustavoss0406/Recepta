# Recepta: site + voice gateway + worker on a single port (scripts/servidor-unico.mjs).
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build && npm run build:servicos && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/servidor-unico.mjs ./scripts/servidor-unico.mjs
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3000
USER node
CMD ["node", "scripts/servidor-unico.mjs"]
