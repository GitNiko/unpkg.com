FROM node:10

WORKDIR /app/

COPY . /app/
RUN npm install pm2 -g && \
    npm ci

ENV PORT 5000
CMD ["pm2-runtime", "process.yml"]

EXPOSE 5000
