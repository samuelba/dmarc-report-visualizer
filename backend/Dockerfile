FROM node:26-alpine AS development

WORKDIR /app

COPY package*.json ./

RUN npm install -g npm@12 && npm install

COPY . .

RUN npm run build

FROM node:26-alpine AS production

ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}

WORKDIR /app

# Install postgresql-client for pg_dump
RUN apk add --no-cache postgresql-client

COPY package*.json ./

RUN npm install -g npm@12 && npm install --omit=dev

COPY --from=development /app/dist ./dist

# Copy the startup script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

CMD ["/app/docker-entrypoint.sh"]
