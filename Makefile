TAG_COMMIT := $(shell git rev-list --abbrev-commit --tags --max-count=1)
VERSION := $(shell git describe --abbrev=0 --tags ${TAG_COMMIT} 2>/dev/null || true)

docker_build:
	docker build -t botium/botium-speech-frontend:$(VERSION) frontend
	docker build -t botium/botium-speech-watcher:$(VERSION) watcher
	docker build -f stt/Dockerfile.kaldi.en -t botium/botium-speech-kaldi-en:$(VERSION) stt
	docker build -f stt/Dockerfile.kaldi.de -t botium/botium-speech-kaldi-de:$(VERSION) stt
	docker build -f tts/Dockerfile.marytts -t botium/botium-speech-marytts:$(VERSION) tts
	docker build -t botium/botium-speech-dictate:$(VERSION) dictate

docker_publish:
  docker push botium/botium-speech-frontend:$(VERSION)
  docker push botium/botium-speech-watcher:$(VERSION)
  docker push botium/botium-speech-kaldi-en:$(VERSION)
  docker push botium/botium-speech-kaldi-de:$(VERSION)
  docker push botium/botium-speech-marytts:$(VERSION)
  docker push botium/botium-speech-dictate:$(VERSION)

docker_latest:
	docker tag botium/botium-speech-frontend:$(VERSION) botium/botium-speech-frontend:latest
  docker push botium/botium-speech-frontend:latest

	docker tag botium/botium-speech-watcher:$(VERSION) botium/botium-speech-watcher:latest
  docker push botium/botium-speech-watcher:latest

	docker tag botium/botium-speech-kaldi-en:$(VERSION) botium/botium-speech-kaldi-en:latest
  docker push botium/botium-speech-kaldi-en:latest

	docker tag botium/botium-speech-kaldi-de:$(VERSION) botium/botium-speech-kaldi-de:latest
  docker push botium/botium-speech-kaldi-de:latest

	docker tag botium/botium-speech-marytts:$(VERSION) botium/botium-speech-marytts:latest
  docker push botium/botium-speech-marytts:latest

	docker tag botium/botium-speech-dictate:$(VERSION) botium/botium-speech-dictate:latest
  docker push botium/botium-speech-dictate:latest
