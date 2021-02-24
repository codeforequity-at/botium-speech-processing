# Rasa Custom Voice Channel

This channel is an extension of the Socket.io-Channel and will

* accept input as audio and convert it to text before handing it down the Rasa pipeline
* convert text content received from the Rasa pipeline as response to audio and add it to the response

## Installation

Clone or download this repository.

    > git clone https://github.com/codeforequity-at/botium-speech-processing.git

Make this directory available for Python loading by pointing PYTHONPATH environment variable here.

    > export PYHTONPATH=$PYTHONPATH:<clone-dir>/connectors/rasa

Use the _credentials.yml_ file when launching Rasa.

    > rasa run --credentials <clone-dir>/connectors/rasa/credentials.yml

Or when using it with docker-compose, first copy the _connectors_ folder to your Rasa installation, and you can use a _docker-compose.yml_ file like this one:

```
version: '3.0'
services:
  rasa:
    image: rasa/rasa:latest-full
    ports:
      - 5005:5005
    volumes:
      - ./:/app
    environment:
      PYTHONPATH: "/app/connectors/rasa:/app"
      RASA_DUCKLING_HTTP_URL: http://rasa-duckling:8000
    command: run -vv --cors "*" --credentials /app/connectors/rasa/credentials.yml --enable-api --model models/dialogue --endpoints endpoints.yml
  rasa-actions:
    build:
      context: .
    ports:
      - 5055:5055
  rasa-duckling:
    image: rasa/duckling
    ports:
      - 8000:8000
```

## Testing

There is a simple test client based on the [Rasa Voice Interface](https://github.com/RasaHQ/rasa-voice-interface) available.

In the _client_ directory, change the Rasa endpoint in the _docker-compose.yml_ file, then launch the client and access the Web interface to give a chat to your Rasa chatbot.
