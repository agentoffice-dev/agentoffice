FROM node:22-bookworm AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-bookworm
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npx playwright install --with-deps chromium
COPY --from=build /app/dist ./dist
RUN mkdir -p /artifacts
CMD ["node", "dist/index.js"]
