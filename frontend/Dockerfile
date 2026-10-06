# syntax=docker/dockerfile:1.7
# ---------- المرحلة 1: بناء واجهة React ----------
ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.27-alpine
FROM ${NODE_IMAGE} AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
# نفس الأصل (same-origin) خلف Nginx: لا CORS ولا عنوان خادم مدمج في الحزمة
ARG VITE_API_URL=/api/v1
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---------- المرحلة 2: Nginx أصلية بلا صلاحيات جذر (المنفذ 8080) ----------
FROM ${NGINX_IMAGE}
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
