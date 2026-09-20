# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
# npm ci installs exactly what the lockfile pins, which is what makes a
# deployed build reproducible.
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

# The generated Prisma client lives in node_modules and must survive the
# production-only reinstall above, so it is copied in afterwards.
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma

RUN addgroup -g 10001 appgroup && \
    adduser -D -u 10001 -G appgroup appuser && \
    chown -R appuser:appgroup /app
USER appuser

ENV PORT=4000
EXPOSE 4000

CMD ["node", "dist/index.js"]
