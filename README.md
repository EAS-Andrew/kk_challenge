# Coding Challenge

### Given two yaml files as inputs

* `limits.yaml` (user defined resource limits with namespace and global scope.)
* `resources.yaml` (the resource manifests that define resources requests and limits)

Expected usage
```
    npx resource-checker -l limits.yaml -r resources.yaml
```

Expected outputs
* if quota is exceeded the application should exit with a non 0 exit code and provide context as to how the quote was exceeded and by how much.
* if the quota is not exceeded then the application should exit with a 0 exit code.