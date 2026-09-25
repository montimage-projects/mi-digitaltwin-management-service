# secAnoD mmt-image with the Kafka output channel (KAFKA_MODULE).
#
# The published ghcr.io/montimage-projects/mmt-image is built without
# KAFKA_MODULE. This image keeps its mmt-dpi / mmt-security / rules untouched
# and rebuilds only mmt-probe — pinned to the commit the published image
# ships — with the Kafka module added (librdkafka).
#
#   docker build -t secanod-mmt-image:kafka scripts/secanod-kafka
ARG BASE_IMAGE=ghcr.io/montimage-projects/mmt-image:latest

FROM ${BASE_IMAGE} AS base

FROM ubuntu:24.04 AS builder
ARG DEBIAN_FRONTEND=noninteractive
# mmt-probe commit of the published base image (`mmt-probe -v`: 1.6.4 a11c89f).
ARG MMT_PROBE_COMMIT=a11c89f
ARG MMT_PROBE_MODULES="SECURITY_MODULE PCAP_DUMP_MODULE SOCKET_MODULE QOS_MODULE KAFKA_MODULE"

RUN apt-get update && apt-get install -y --no-install-recommends \
        git ca-certificates build-essential gcc g++ make \
        libpcap-dev libxml2-dev libconfuse-dev libnghttp2-dev \
        librdkafka-dev libsasl2-dev libssl-dev \
    && rm -rf /var/lib/apt/lists/* \
    # mmt-probe includes <rdkafka.h>; Ubuntu ships it under librdkafka/.
    && ln -s /usr/include/librdkafka/rdkafka.h /usr/include/rdkafka.h

COPY --from=base /opt/mmt /opt/mmt
COPY --from=base /etc/ld.so.conf.d/mmt-dpi.conf /etc/ld.so.conf.d/mmt-dpi.conf
RUN ldconfig

WORKDIR /src
RUN git clone https://github.com/montimage/mmt-probe.git mmt-probe \
    && git -C mmt-probe checkout "${MMT_PROBE_COMMIT}" \
    && make -C mmt-probe -j "$(nproc)" ${MMT_PROBE_MODULES} compile \
    && ls -l mmt-probe/probe

FROM ${BASE_IMAGE}
ARG DEBIAN_FRONTEND=noninteractive
LABEL org.opencontainers.image.description="secAnoD mmt-image with the mmt-probe Kafka output channel"
RUN apt-get update && apt-get install -y --no-install-recommends librdkafka1 \
    && rm -rf /var/lib/apt/lists/*
# `make install` refuses to overwrite the base image's probe — copy the binary.
COPY --from=builder /src/mmt-probe/probe /opt/mmt/probe/bin/probe
