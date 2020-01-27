# Botium Speech Processing

[![license](https://img.shields.io/github/license/mashape/apistatus.svg)]()
[![pullrequests](https://img.shields.io/badge/PR-welcome-green.svg)]()


Botium Speech Processing is a unified, developer-friendly API to the best available Speech-To-Text and Text-To-Speech services.

## What is it ?

This is a *get-shit-done*-style collection of the best free and Open Source speech recognition products, the configuration options are rudimentary: it is *highly opinionated* about the included tools, just get the shit done.

* With [Kaldi](https://kaldi-asr.org/) a reasonable speech recogniction performance is available with freely available data sources. 
* [MaryTTS](http://mary.dfki.de/) is currently the best freely available speech synthesis software
* [SoX](http://sox.sourceforge.net/) is the _swiss army-knife_ for audio file processing

While the included tools in most cases cannot compete with the big cloud-based products, for lots of applications the trade-off between price and quality is at least reasonable.

**Read about the project history [here](https://chatbotslife.com/full-blown-open-source-speech-processing-server-available-on-github-4fb88a54d338)**

### Possible Applications

Some examples what you can do with this:

* Synthesize audio tracks for Youtube tutorials
* Build voice-enabled chatbot services (for example, IVR systems)
* Classification of audio file transcriptions
* [Automated Testing](https://chatbotslife.com/testing-alexa-skills-with-avs-mocha-and-botium-f6c22549f66e) of Voice services with [Botium](https://medium.com/@floriantreml/botium-in-a-nutshell-part-1-overview-f8d0ceaf8fb4)

## Installation

### Software and Hardware Requirements

* 8GB of RAM (accessible for Docker) and 20GB free HD space
* Internet connectivity
* [docker](https://docs.docker.com/)
* [docker-compose](https://docs.docker.com/compose/)

_Note: memory usage can be reduced if only one language is required - default configuration comes with two languages._

### Build Docker Containers

Clone or download this repository and start with docker-compose:

    > docker-compose up -d

This will take some time to build.

Point your browser to http://127.0.0.1 to open the [Swagger UI](https://swagger.io/tools/swagger-ui/) and browse/use the API definition.

### Configuration

This repository includes a reasonable default configuration:

* Use MaryTTS for TTS
* Use Kaldi for STT
* Use SoX for audio file conversion
* Languages included:
  * German
  * English

Configuration changes with [environment variables](./frontend/resources/.env). See comments in this file.

**Recommendation:** Do not change the _.env_ file but create a _.env.local_ file to overwrite the default settings. This will prevent troubles on future _git pull_

### Securing the API

The environment variable _BOTIUM_API_TOKENS_ contains a list of valid API Tokens accepted by the server (separated by whitespace or comma). The HTTP Header _BOTIUM_API_TOKEN_ is validated on each call to the API.

## Testing

Point your browser to http://127.0.0.1/ to open Swagger UI to try out the API.

Point your browser to http://127.0.0.1/dictate to open a rudimentary [dictate.js-interface](https://github.com/Kaljurand/dictate.js) for testing speech recognition. 

_Attention: in Google Chrome this only works with services published as HTTPS, you will have to take of this yourself. For example, you could publish it via ngrok tunnel._

Point your browser to http://127.0.0.1/tts to open a MaryTTS interface for testing speech synthesis.

## Real Time API

There are Websocket endpoints exposed for real-time audio decoding. Find the API description in the [Kaldi GStreamer Server documentation](https://github.com/alumae/kaldi-gstreamer-server#websocket-based-client-server-protocol).

The Websocket endpoints are:

* English: ws://127.0.0.1/stt_en/client/ws/speech
* German: ws://127.0.0.1/stt_de/client/ws/speech

## API Definition

See [swagger.json](./frontend/src/swagger.json):

* HTTP POST to **/api/stt/{language}** for Speech-To-Text

    > curl -X POST "http://127.0.0.1/api/stt/en" -H "Content-Type: audio/wav" -T sample.wav

* HTTP GET to **/api/tts/{language}?text=...** for Text-To-Speech

    > curl -X GET "http://127.0.0.1/api/tts/en?text=hello%20world" -o tts.wav

* HTTP POST to **/api/convert/{profile}** for audio file conversion

    > curl -X POST "http://127.0.0.1/api/convert/mp3tomonowav" -H "Content-Type: audio/mp3" -T sample.mp3 -o sample.wav

## Contributing

_To be done: contribution guidelines._

We are open to any kind of contributions and are happy to discuss, review and merge pull requests.

## Big Thanks

This project is standing on the shoulders of giants.

* **[Kaldi GStreamer server](https://github.com/alumae/kaldi-gstreamer-server)** and **[Docker images](https://github.com/jcsilva/docker-kaldi-gstreamer-server)**
* **[MaryTTS](http://mary.dfki.de/)**
* **SVOX Pico Text-to-Speech**
* **[Kaldi](https://kaldi-asr.org/)**
* **[Kaldi Tuda Recipe](https://github.com/uhh-lt/kaldi-tuda-de)**
* **[Deepspeech](https://github.com/mozilla/DeepSpeech)** and **[Deepspeech German](https://github.com/AASHISHAG/deepspeech-german)**
* **[SoX](http://sox.sourceforge.net/)**
* **[dictate.js](https://github.com/Kaljurand/dictate.js)**
