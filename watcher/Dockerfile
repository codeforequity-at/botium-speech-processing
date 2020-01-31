FROM library/ubuntu:16.04

RUN apt-get update && \
    apt-get install -y supervisor inotify-tools jq curl && \
    apt-get clean autoclean && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

VOLUME /app/watch

COPY watch_stt.sh /app/watch_stt.sh
COPY watch_tts.sh /app/watch_tts.sh
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

CMD ["/usr/bin/supervisord"]