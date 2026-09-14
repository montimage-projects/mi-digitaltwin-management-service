# CI-SIM — critical-infrastructure HTTP simulation (issue #231, task 5.1).
#
# Build and load into a local kind cluster for the e2e:
#   docker build -t ci-sim:local sim/ci-sim
#   kind load docker-image ci-sim:local
# Published reference: registry.montimage.eu/montimage-mti/ci-sim:v1.0.0
FROM python:3.13-alpine

COPY server.py /app/server.py

EXPOSE 8080

# -u keeps logs unbuffered so `kubectl logs` / the SSE stream see the
# "service stopped" line in real time.
ENTRYPOINT ["python3", "-u", "/app/server.py"]
