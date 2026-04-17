FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

ARG NODE_VERSION=18.20.5

RUN apt-get update && apt-get -y install bc ca-certificates curl
RUN apt-get update && apt-get install -y dos2unix sox libsox-fmt-mp3 libttspico-utils ffmpeg

ARG NODE_VERSION1=20.19.4

RUN arch="$(dpkg --print-architecture)" \
  && case "$arch" in \
       amd64) node_arch=x64 ;; \
       arm64) node_arch=arm64 ;; \
       *) echo "unsupported architecture: $arch" >&2; exit 1 ;; \
     esac \
  && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION1}/node-v${NODE_VERSION1}-linux-${node_arch}.tar.gz" \
    | tar -xz -C /usr/local --strip-components=1 \
  && node --version && npm --version

WORKDIR /app
COPY ./package.json /app/package.json
RUN npm install --omit=optional --omit=dev --legacy-peer-deps
COPY . /app
COPY ./resources/.env /app/.env
RUN find . -type f ! -path '*/node_modules/*' -print0 | xargs -0 dos2unix

EXPOSE 56000

RUN groupadd --gid 1000 node && useradd --uid 1000 --gid node --shell /bin/bash --create-home node
RUN chown -R 1000:1000 /app
RUN mkdir -p /app/resources && chown -R node:node /app/resources
VOLUME /app/resources

USER node
CMD npm run start-dist
