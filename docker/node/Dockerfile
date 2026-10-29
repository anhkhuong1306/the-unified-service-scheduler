FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash \
    curl \
    openssl \
    postgresql-client \
    tzdata \
    && rm -rf /var/lib/apt/lists/*

ENV TZ=UTC

WORKDIR /usr/src/app

EXPOSE 3000

CMD ["npm", "run", "start:dev"]
