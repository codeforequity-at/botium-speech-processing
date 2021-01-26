FROM node:lts-alpine
ARG RASA_ENDPOINT=http://localhost:5005
ARG RASA_PATH=/socket.io
ARG PUBLIC_PATH=/

RUN apk add --no-cache --virtual .build-deps curl sed python make g++

WORKDIR /app/
RUN curl -L -o rvi.zip "https://github.com/RasaHQ/rasa-voice-interface/archive/master.zip" && unzip rvi.zip && rm rvi.zip
WORKDIR /app/rasa-voice-interface-master
RUN chown -R node /app/rasa-voice-interface-master \
  && sed -i "s|'http://localhost:5005'|'${RASA_ENDPOINT}', options: { path: '${RASA_PATH}' }|g" src/main.js \
  && sed -i "s|integrity: false|integrity: false, publicPath: '${PUBLIC_PATH}'|g" vue.config.js \
  && npm install --no-optional && npm install serve && npm run-script build
RUN apk del .build-deps

EXPOSE 8080
USER node
CMD PORT=8080 npx serve -s dist
