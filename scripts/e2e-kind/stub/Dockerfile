# E2E stub image for the kind-based CI test (issue #206).
#
# One image substitutes for the four private registry.montimage.eu modules;
# run-e2e.js repoints the seeded services at it and selects each module's
# behaviour through the STUB_ROLE env var. See stub.py for the role table.
FROM python:3.13-alpine

COPY stub.py /app/stub.py

# -u keeps logs unbuffered so `kubectl logs` / SSE see alerts in real time.
ENTRYPOINT ["python3", "-u", "/app/stub.py"]
