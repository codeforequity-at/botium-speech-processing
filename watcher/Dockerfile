FROM library/ubuntu:16.04

RUN apt-get update && apt-get install -y inotify-tools jq curl

VOLUME /app/watch

COPY watch.sh /app/watch.sh

CMD /app/watch.sh