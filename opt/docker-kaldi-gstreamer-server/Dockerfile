FROM library/ubuntu:16.04

ENV DEBIAN_FRONTEND=noninteractive
SHELL ["/bin/bash", "-c"]

RUN apt-get update && apt-get install -y  \
    procps \
    autoconf \
    automake \
    bzip2 \
    g++ \
    gfortran \
    git \
    gstreamer1.0-plugins-good \
    gstreamer1.0-tools \
    gstreamer1.0-pulseaudio \
    gstreamer1.0-plugins-bad \
    gstreamer1.0-plugins-base \
    gstreamer1.0-plugins-ugly  \
    libjansson-dev \
    libgstreamer1.0-dev \
    libtool-bin \
    make \
    python2.7 \
    python3 \
    python-pip \
    python-yaml \
    python-simplejson \
    python-gi \
    software-properties-common \
    subversion \
    unzip \
    build-essential \
    python-dev \
    sox \
    wget \
    zlib1g-dev && \
    apt-get clean autoclean && \
    apt-get autoremove -y && \
    pip install ws4py==0.3.2 && \
    pip install tornado==4.2 && \
    pip install futures

WORKDIR /opt

ARG nproc=1
RUN git clone https://github.com/kaldi-asr/kaldi.git
RUN cd /opt/kaldi/tools && make -j $(nproc)
RUN cd /opt/kaldi/tools && ./extras/install_portaudio.sh
RUN cd /opt/kaldi/tools && ./extras/install_openblas.sh
RUN cd /opt/kaldi/src && ./configure --shared --mathlib=OPENBLAS
RUN cd /opt/kaldi/src && make ext -j$(nproc) && make depend -j$(nproc) && make -j$(nproc)
RUN cd /opt/kaldi/src/online && make depend -j $(nproc) && make -j $(nproc)
RUN cd /opt/kaldi/src/gst-plugin && make depend -j $(nproc) && make -j $(nproc)
RUN git clone --depth 1 https://github.com/alumae/gst-kaldi-nnet2-online.git
RUN cd /opt/gst-kaldi-nnet2-online/src && \
    KALDI_ROOT=/opt/kaldi make depend -j $(nproc)&& \
    KALDI_ROOT=/opt/kaldi make -j $(nproc)
RUN git clone --depth 1 https://github.com/alumae/kaldi-gstreamer-server.git
RUN rm -rf /opt/gst-kaldi-nnet2-online/.git/ && \
    find /opt/gst-kaldi-nnet2-online/src/ -type f -not -name '*.so' -delete && \
    rm -rf /opt/kaldi/.git && \
    rm -rf /opt/kaldi/egs/ /opt/kaldi/windows/ /opt/kaldi/misc/ && \
    find /opt/kaldi/src/ -type f -not -name '*.so' -delete && \
    find /opt/kaldi/tools/ -type f \( -not -name '*.so' -and -not -name '*.so*' \) -delete && \
    rm -rf /opt/kaldi-gstreamer-server/.git/ && \
    rm -rf /opt/kaldi-gstreamer-server/test/

COPY start.sh stop.sh /opt/

RUN chmod +x /opt/start.sh && \
    chmod +x /opt/stop.sh 
