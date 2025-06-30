docker_build:
	docker build -t botium.speech:${SPEECH_VERSION} frontend

docker_publish:
	docker tag botium.speech:${SPEECH_VERSION} ${AWS_REGISTRY_HOSTNAME}/botium.speech:${SPEECH_VERSION}
	docker push ${AWS_REGISTRY_HOSTNAME}/botium.speech:${SPEECH_VERSION}

develop: docker_build docker_publish

release: docker_build docker_publish
