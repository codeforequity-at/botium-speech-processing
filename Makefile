TAG_COMMIT := $(shell git rev-list --abbrev-commit --tags --max-count=1)
VERSION := $(shell git describe --abbrev=0 --tags ${TAG_COMMIT} 2>/dev/null || true)

docker_build_dev:
	docker build -t botium/speech:develop frontend

docker_login_dev:
	AWS_ACCESS_KEY_ID=${BOTIUM_DEV_AWS_ACCESS_KEY_ID} \
	AWS_SECRET_ACCESS_KEY=${BOTIUM_DEV_AWS_SECRET_ACCESS_KEY} \
	aws ecr get-login-password --region ${BOTIUM_DEV_AWS_REGISTRY_REGION} | \
	docker login --username AWS --password-stdin ${BOTIUM_DEV_AWS_REGISTRY_ID}.dkr.ecr.${BOTIUM_DEV_AWS_REGISTRY_REGION}.amazonaws.com

docker_publish_dev: docker_login_dev
	docker tag botium/speech:develop ${BOTIUM_DEV_AWS_REGISTRY_HOSTNAME}/botium/speech:develop
	docker push ${BOTIUM_DEV_AWS_REGISTRY_HOSTNAME}/botium/speech:develop

docker_build:
	docker build -t botium/speech:$(VERSION) frontend

docker_login:
	AWS_ACCESS_KEY_ID=${BOTIUM_AWS_ACCESS_KEY_ID} \
	AWS_SECRET_ACCESS_KEY=${BOTIUM_AWS_SECRET_ACCESS_KEY} \
	aws ecr get-login-password --region ${BOTIUM_AWS_REGISTRY_REGION} | \
	docker login --username AWS --password-stdin ${BOTIUM_AWS_REGISTRY_ID}.dkr.ecr.${BOTIUM_AWS_REGISTRY_REGION}.amazonaws.com

docker_publish: docker_login
	docker tag botium/speech:$(VERSION) ${BOTIUM_AWS_REGISTRY_HOSTNAME}/botium/speech:$(VERSION)
	docker push ${BOTIUM_AWS_REGISTRY_HOSTNAME}/botium/speech:$(VERSION)

develop: docker_build_dev docker_publish_dev

release: docker_build docker_publish
