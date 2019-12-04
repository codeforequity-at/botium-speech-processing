FROM openjdk:8-jdk-alpine

RUN apk update && apk upgrade && apk add --no-cache bash git openssh

WORKDIR /app
RUN git clone https://github.com/marytts/marytts-installer.git

WORKDIR /app/marytts-installer

RUN ./marytts install voice-cmu-slt-hsmm
#RUN ./marytts install voice-bits1
#RUN ./marytts install voice-bits1-hsmm 
#RUN ./marytts install voice-bits2
#RUN ./marytts install voice-bits3
#RUN ./marytts install voice-bits3-hsmm 
#RUN ./marytts install voice-bits4
#RUN ./marytts install voice-dfki-pavoque-neutral
#RUN ./marytts install voice-dfki-pavoque-neutral-hsmm
#RUN ./marytts install voice-dfki-pavoque-styles

EXPOSE 59125
ENV JAVA_OPTS -Xmx2g
CMD ./marytts
