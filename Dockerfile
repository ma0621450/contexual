FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3001
CMD ["npm", "run", "start:prod", "--workspace=@repo/api"]

FROM node:20-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3000
CMD ["npm", "run", "start", "--workspace=@repo/web"]
