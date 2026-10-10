FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Sources on exFAT/Windows drives arrive as owner-only files; nginx's worker must be able to read them.
RUN chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
