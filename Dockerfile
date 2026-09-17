# Render builds this image from the repository root; the web app lives in web/.
FROM node:24-slim

WORKDIR /app/web

COPY web/package.json web/package-lock.json ./
RUN npm ci

COPY web/ ./
RUN npm run build

ENV NODE_ENV=production
CMD ["npm", "start"]
