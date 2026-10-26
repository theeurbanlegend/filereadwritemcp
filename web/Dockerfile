FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY config.js.tmpl /etc/caddy/runtime/config.js
COPY --from=builder /app/dist /srv
