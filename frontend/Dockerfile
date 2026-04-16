FROM ubuntu:20.04

ENV DEBIAN_FRONTEND=noninteractive

# CI mirrors can be flaky; retry slow downloads instead of failing the whole build.
RUN printf 'Acquire::Retries "8";\nAcquire::http::Timeout "120";\nAcquire::https::Timeout "120";\n' > /etc/apt/apt.conf.d/99botium-retries

RUN apt-get update \
  && apt-get install -y --no-install-recommends curl gnupg bc \
  && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
  && apt-get update \
  && apt-get install -y nodejs \
  && apt-get install -y --no-install-recommends \
    dos2unix sox libsox-fmt-mp3 libttspico-utils ffmpeg \
  && rm -rf /var/lib/apt/lists/*

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
