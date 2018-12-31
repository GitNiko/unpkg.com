FROM node:10

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci
# COPY . .

ENV PORT 5000
CMD ["node", "server.js"]

EXPOSE 5000
