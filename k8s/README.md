# Kubernetes Deployment (Kustomize)

Kustomize manifests for deploying the MI Digital Twin Management Service on
Kubernetes. This is the recommended deployment path for new deployments;
Docker Compose (`docker-compose*.yml` in the repo root) remains fully
supported — see
[Migrating from Docker Compose](../docs/playbooks/kubernetes-deployment.md#migrating-from-docker-compose).

**Full guide:** [docs/playbooks/kubernetes-deployment.md](../docs/playbooks/kubernetes-deployment.md)
— prerequisites, step-by-step deploy, verification, updates, re-seeding,
backup/restore, rollback, troubleshooting, and scaling considerations.

## Layout

```
k8s/
  base/                   Shared manifests: Deployment, Service, ConfigMap,
                           PVC, and a secret.example.yaml template (never
                           applied automatically — see the full guide).
  components/mongodb/     Optional Kustomize Component: in-cluster MongoDB
                           (StatefulSet + headless Service).
  overlays/
    dev/                   Local/dev cluster — in-cluster MongoDB, smaller
                           resource requests/limits, NODE_ENV=development.
    prod/                  Production — in-cluster MongoDB.
    atlas/                 Production — external MongoDB Atlas, no mongodb
                           component.
```

## No CI image pipeline yet

There is no build/push step for a Kubernetes image in this repo's CI. Build
and push the same `server/Dockerfile.unified` image Docker Compose users
already build, then set that image reference in your own copy of
`k8s/base/deployment.yaml` (or a Kustomize image-tag override). See the full
guide for the exact commands.
