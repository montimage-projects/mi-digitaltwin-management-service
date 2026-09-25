# E2E stub image for the kind-based CI test (issue #206).
#
# One image substitutes for the private registry.montimage.eu modules;
# run-e2e.js repoints the seeded services at it and selects each module's
# behaviour through the STUB_ROLE env var. See stub.py for the role table.
FROM python:3.13-alpine

# kafka-python: the reaction role consumes secAnoD reports from Kafka.
RUN pip install --no-cache-dir kafka-python==2.2.15

COPY stub.py /app/stub.py

# `mag` shim (issue #237): the seeded runbook execs
# `kubectl exec deploy/mag -- sh -c 'mag http-flood …'`, so the attack CLI
# must exist on PATH in the idling MAG pod — the shim forwards to stub.py
# with `mag` in argv (and STUB_ROLE=attack is set on the pod anyway).
RUN printf '#!/bin/sh\nexec python3 -u /app/stub.py mag "$@"\n' \
    > /usr/local/bin/mag && chmod +x /usr/local/bin/mag

# -u keeps logs unbuffered so `kubectl logs` / SSE see alerts in real time.
ENTRYPOINT ["python3", "-u", "/app/stub.py"]
