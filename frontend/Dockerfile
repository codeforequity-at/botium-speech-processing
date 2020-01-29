FROM ubuntu:18.04

RUN apt-get update && apt-get -y install curl gnupg && curl -sL https://deb.nodesource.com/setup_13.x  | bash - && apt-get -y install nodejs
RUN apt-get install -y dos2unix sox libsox-fmt-mp3 libttspico-utils

WORKDIR /app
COPY . /app
RUN find . -type f -print0 | xargs -0 dos2unix
RUN npm install --no-optional --production

VOLUME /app/resources

EXPOSE 56000

CMD npm start