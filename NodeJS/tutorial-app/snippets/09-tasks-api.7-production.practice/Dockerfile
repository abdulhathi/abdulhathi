# ---- Stage 1: build. Full install, then compile TypeScript to dist/.
FROM node:24-alpine AS build
WORKDIR /app
# Copy the package files first: this layer, and the npm ci below, are reused
# from cache until package.json or package-lock.json change.
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---- Stage 2: runtime. Production dependencies and compiled code only.
FROM node:24-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist

# The official image includes an unprivileged "node" user. Never run as root.
USER node
EXPOSE 4000

# Docker marks the container unhealthy if /ready keeps failing. Uses node,
# because the slim image has no curl.
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/ready').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

# Exec form: node runs as PID 1 and receives SIGTERM itself. "npm start" here
# would put npm in between, and the signal might never reach the app.
CMD ["node", "--enable-source-maps", "dist/server.js"]
