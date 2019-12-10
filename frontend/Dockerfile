FROM node:11.10.1-alpine

RUN apk update && apk add dos2unix bash sox

WORKDIR /app
COPY . /app
RUN find . -type f -print0 | xargs -0 dos2unix
RUN npm install --no-optional --production

VOLUME /app/resources

EXPOSE 56000

CMD npm start