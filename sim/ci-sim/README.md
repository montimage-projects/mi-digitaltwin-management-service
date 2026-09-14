# CI-SIM — critical-infrastructure HTTP simulation

Small stdlib-only Python HTTP service (issue #231, playbook task 5.1) standing
in for a critical-infrastructure workload in the Montimage attack → detect →
respond demo.

## API surface

| Method | Path             | Description                                                    |
| ------ | ---------------- | -------------------------------------------------------------- |
| GET    | `/`              | Health — 200 JSON (the Deployment `readinessPath`)             |
| GET    | `/api/status`    | Uptime and request counters                                    |
| GET    | `/api/metrics`   | Per-source request counts inside the rate window               |
| POST   | `/admin/block`   | `{"address": "<ip>"}` — blocklist a source; it is answered 403 |
| POST   | `/admin/unblock` | `{"address": "<ip>"}` — remove a blocklist entry               |
| GET    | `/admin/blocks`  | List the blocklisted addresses                                 |

`X-Forwarded-For` is honoured for the source address so the blocklist and the
rate watcher keep working behind a proxy or `kubectl port-forward`.

## Stop behaviour

A single source sending more than `CI_SIM_RATE_LIMIT` requests (default 50)
within `CI_SIM_RATE_WINDOW_S` seconds (default 10) makes the process log
`service stopped` and exit non-zero. Under Kubernetes the Deployment's
`restartPolicy: Always` restarts the container while the monitor sidecar
holds the pod network namespace.

## Run

```bash
docker build -t ci-sim:local sim/ci-sim
docker run --rm -p 8080:8080 ci-sim:local

# Load into a kind cluster for the e2e:
kind load docker-image ci-sim:local
```

Environment variables: `PORT` (default `8080`), `CI_SIM_RATE_LIMIT` (default
`50`), `CI_SIM_RATE_WINDOW_S` (default `10`). The published image reference is
`registry.montimage.eu/montimage-mti/ci-sim:v1.0.0`.
