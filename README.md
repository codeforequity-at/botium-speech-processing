# Botium Speech Processing

[![license](https://img.shields.io/github/license/mashape/apistatus.svg)]()

Botium Speech Processing is a unified, developer-friendly API to various Speech-To-Text and Text-To-Speech services.

## Software and Hardware Requirements

* Several gigs of RAM and 20GB free HD space
* Internet connectivity
* [docker](https://docs.docker.com/)
* [docker-compose](https://docs.docker.com/compose/)

## Installation

Clone or download this repository and start with docker-compose:

    > docker-compose up -d

This will take some time to build.

Point your browser to http://127.0.0.1 to open the [Swagger UI](https://swagger.io/tools/swagger-ui/) and browse/use the API definition.

## Configuration

This repository includes a reasonable default configuration:

* Use MaryTTS for TTS
* Use Kaldi for STT
* Use SoX for audio file conversion

Configuration changes with [environment variables](./blob/master/frontend/resources/.env).

## Testing

Point your browser to http://127.0.0.1/dictate to open a rudimentary [dictate.js-interface](https://github.com/Kaljurand/dictate.js) for testing speech recognition. 

_Attention: in Google Chrome this only works with services published as HTTPS, you will have to take of this yourself. For example, you could publish it via ngrok tunnel._

Point your browser to http://127.0.0.1/tts to open a MaryTTS interface for testing speech synthesis.

## API Definition

See [swagger.json](./blob/master/frontend/src/swagger.json):

* HTTP POST to **/api/stt/{language}** for Speech-To-Text

    > curl -X POST "http://127.0.0.1/api/stt/en" -H "Content-Type: audio/wav" -T sample.wav

* HTTP GET to **/api/tts/{language}?text=...** for Speech-To-Text

    > curl -X GET "http://127.0.0.1/api/tts/en?text=hello%20world" -o tts.wav

* HTTP POST to **/api/convert/{profile}** for audio file conversion

    > curl -X POST "http://127.0.0.1/api/convert/mp3tomonowav" -H "Content-Type: audio/mp3" -T sample.mp3 -o sample.wav

## Big Thanks

This project is standing on the shoulders of giants.

* **[Kaldi GStreamer server](https://github.com/alumae/kaldi-gstreamer-server)** and **[Docker images](https://github.com/jcsilva/docker-kaldi-gstreamer-server)**
* **[MaryTTS](http://mary.dfki.de/)**
* **[Kaldi](https://kaldi-asr.org/)**
* **[Kaldi Tuda Recipe](https://github.com/uhh-lt/kaldi-tuda-de)**
* **[Deepspeech](https://github.com/mozilla/DeepSpeech)** and **[Deepspeech German](https://github.com/AASHISHAG/deepspeech-german)**
* **[SoX](http://sox.sourceforge.net/)**
* **[dictate.js](https://github.com/Kaljurand/dictate.js)**


