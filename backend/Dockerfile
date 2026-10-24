# Build from the repository root so the static site ships with the API:
#   docker build -f backend/Dockerfile -t fikirhane .
FROM node:24-alpine
WORKDIR /app
COPY backend/package.json backend/package-lock.json backend/
RUN cd backend && npm ci --omit=dev && npm cache clean --force
COPY backend/src backend/src
COPY backend/migrations backend/migrations
COPY backend/seeds backend/seeds
COPY backend/scripts/seed-demo.ts backend/scripts/create-admin.ts backend/scripts/reset-password.ts backend/scripts/run-jobs.ts backend/scripts/
COPY index.html style.css shells.css app.js ./
COPY scripts scripts
COPY assets assets
COPY member member
COPY uyelik uyelik
COPY host host
COPY admin admin
COPY rezervasyon rezervasyon
COPY coworking coworking
COPY toplanti-odasi toplanti-odasi
COPY etkinlik-alani etkinlik-alani
COPY language-meetup language-meetup
COPY tur tur
ENV NODE_ENV=production PORT=8080 SITE_DIR=..
WORKDIR /app/backend
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "src/server.ts"]
