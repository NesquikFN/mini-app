# Build context is the repo root (npm workspaces monorepo — the
# lockfile lives there, not in frontend/):
#   docker build -f frontend/Dockerfile -t dormhub-frontend .

# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --workspace=frontend

# Vite bakes VITE_* variables into the bundle at build time, so it must
# be passed as a build ARG (Railway/most PaaS Docker builders forward
# service variables as build args when the ARG name matches).
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

COPY frontend ./frontend
RUN npm run build --workspace=frontend

# --- runtime stage: serve the static SPA build ---
FROM node:22-alpine
WORKDIR /app
RUN npm install -g serve

COPY --from=build /app/frontend/dist ./dist

EXPOSE 3000
CMD sh -c "serve -s dist -l ${PORT:-3000}"
