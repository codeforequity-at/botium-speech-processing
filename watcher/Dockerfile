FROM library/ubuntu:16.04

RUN apt-get update && \
    apt-get install -y supervisor inotify-tools jq curl && \
    apt-get clean autoclean && \
    apt-get autoremove -y && \
    rm -rf /var/lib/apt/lists/*

COPY watch_stt.sh /app/watch_stt.sh
COPY watch_tts.sh /app/watch_tts.sh
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

RUN groupadd --gid 1000 watcher && useradd --uid 1000 --gid watcher --shell /bin/bash --create-home watcher
RUN mkdir /app/logs && chown -R 1000:1000 /app
USER watcher
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
