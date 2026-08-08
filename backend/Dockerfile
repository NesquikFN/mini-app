# Build context is the repo root (npm workspaces monorepo — the
# lockfile lives there, not in backend/):
#   docker build -f backend/Dockerfile -t dormhub-backend .

# --- build stage ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --workspace=backend

COPY backend ./backend
RUN npm run build --workspace=backend

# --- runtime stage ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
RUN npm ci --workspace=backend --omit=dev

COPY --from=build /app/backend/dist ./backend/dist

EXPOSE 3000
CMD ["node", "backend/dist/server.js"]
