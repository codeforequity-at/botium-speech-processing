TAG_COMMIT := $(shell git rev-list --abbrev-commit --tags --max-count=1)
VERSION := $(shell git describe --abbrev=0 --tags ${TAG_COMMIT} 2>/dev/null || true)

docker_build_dev:
	docker build -t botium.speech:develop frontend

docker_publish_dev
	docker tag botium.speech:develop ${AWS_REGISTRY_HOSTNAME}/botium.speech:develop
	docker push ${AWS_REGISTRY_HOSTNAME}/botium.speech:develop

docker_build:
	docker build -t botium.speech:$(VERSION) frontend

docker_publish
	docker tag botium.speech:$(VERSION) ${AWS_REGISTRY_HOSTNAME}/botium.speech:$(VERSION)
	docker push ${AWS_REGISTRY_HOSTNAME}/botium.speech:$(VERSION)

develop: docker_build_dev docker_publish_dev

release: docker_build docker_publish
