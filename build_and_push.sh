#!/bin/bash

echo "building docker images"
docker build -t botium/botium-speech-frontend frontend
docker build -t botium/botium-speech-watcher watcher
docker build -f Dockerfile.kaldi.en -t botium/botium-speech-kaldi-en stt
docker build -f Dockerfile.kaldi.de -t botium/botium-speech-kaldi-de stt
docker build -f Dockerfile.marytts -t botium/botium-speech-marytts tts
docker build -t botium/botium-speech-dictate dictate

if [ "$1" == "--push" ]; then
  echo "pushing docker images"
  docker push botium/botium-speech-frontend
  docker push botium/botium-speech-watcher
  docker push botium/botium-speech-kaldi-en
  docker push botium/botium-speech-kaldi-de
  docker push botium/botium-speech-marytts
  docker push botium/botium-speech-dictate
fi