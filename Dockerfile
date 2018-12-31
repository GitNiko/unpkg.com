FROM node:10

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install pm2 -g && \
    npm ci
# COPY . .

ENV PORT 5000
CMD ["pm2-runtime", "-raw", "process.yml"]

EXPOSE 5000
