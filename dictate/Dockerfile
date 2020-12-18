FROM node:lts-alpine

RUN apk update && apk add dos2unix bash curl

WORKDIR /app
COPY . /app
RUN find . -type f -print0 | xargs -0 dos2unix
RUN npm install --no-optional --production

RUN curl -L -o dicatejs.zip "https://github.com/Kaljurand/dictate.js/archive/master.zip" && unzip dicatejs.zip && rm dicatejs.zip

EXPOSE 56100

USER node
CMD DICTATEDIR=/app/dictate.js-master npm start